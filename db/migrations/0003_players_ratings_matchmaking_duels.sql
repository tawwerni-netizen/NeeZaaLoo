-- =============================================================================
-- 0003_players_ratings_matchmaking_duels.sql
--
-- Players, per-game ratings, the matchmaking queue, and duel persistence.
--
-- The listed matchmaking failure modes -- double reservation, double joining,
-- stale queue, race conditions, duplicate matches -- are all concurrency bugs,
-- and every one of them becomes a money bug the moment entry fees exist. So
-- they are prevented by database constraints rather than by careful code:
--
--   * one active ticket per player      -> partial unique index
--   * one duel per pairing              -> unique pairing key
--   * a player cannot face themselves   -> check constraint
--   * a stale ticket cannot be matched  -> expiry checked inside the pairing txn
-- =============================================================================

-- --- Games -------------------------------------------------------------------

CREATE TABLE game (
  id             TEXT PRIMARY KEY,          -- 'chess', 'speed-math', ...
  display_name   TEXT    NOT NULL,
  plugin_version INT     NOT NULL,
  is_live        BOOLEAN NOT NULL DEFAULT FALSE,
  -- Section 5 of the mandate: a game may not be enabled for cash play unless it
  -- has cleared the scorecard. Connect Four is strongly solved, so it can exist
  -- as a free game and never as a paid one.
  cash_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO game (id, display_name, plugin_version, is_live, cash_enabled) VALUES
  ('chess', 'Chess', 1, TRUE, FALSE);   -- cash stays off until Phase 6 compliance

-- --- Players -----------------------------------------------------------------
-- Deliberately minimal: identity, auth and profile arrive in the auth migration.
-- What matters here is that a duel and a rating can reference a real player.

CREATE TABLE player (
  id         TEXT PRIMARY KEY,
  handle     TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT player_handle_shape CHECK (handle ~ '^[A-Za-z0-9_-]{3,24}$')
);

-- --- Ratings (Glicko-2, per player per game) ---------------------------------

CREATE TABLE rating (
  player_id     TEXT   NOT NULL REFERENCES player(id),
  game_id       TEXT   NOT NULL REFERENCES game(id),
  -- Stored scaled by 100 as integers: floating point has no place in anything
  -- that gates eligibility or seeds a leaderboard.
  rating_x100   INT    NOT NULL DEFAULT 150000,   -- 1500.00
  rd_x100       INT    NOT NULL DEFAULT 35000,    --  350.00
  volatility_x1e6 INT  NOT NULL DEFAULT 60000,    --    0.060000
  games_played  INT    NOT NULL DEFAULT 0,
  last_played_at TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (player_id, game_id),
  CONSTRAINT rating_rd_positive CHECK (rd_x100 > 0),
  CONSTRAINT rating_volatility_sane CHECK (volatility_x1e6 BETWEEN 1 AND 1000000)
);

-- Rating deviation is the anti-smurf signal: a low RD means we actually know
-- how strong a player is. Cash tiers require that certainty.
CREATE FUNCTION rating_is_established(p_rd_x100 INT, p_games INT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT p_rd_x100 <= 11000 AND p_games >= 10;   -- RD <= 110.00 and 10+ games
$$;

-- --- Matchmaking -------------------------------------------------------------

CREATE TYPE ticket_status AS ENUM ('ACTIVE', 'MATCHED', 'CANCELLED', 'EXPIRED');
CREATE TYPE entry_tier    AS ENUM ('FREE', 'RANKED', 'CASH');

CREATE TABLE matchmaking_ticket (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id     TEXT          NOT NULL REFERENCES player(id),
  game_id       TEXT          NOT NULL REFERENCES game(id),
  mode          TEXT          NOT NULL,
  time_control  JSONB         NOT NULL,
  tier          entry_tier    NOT NULL DEFAULT 'FREE',
  stake_minor   BIGINT        NOT NULL DEFAULT 0,
  rating_x100   INT           NOT NULL,
  status        ticket_status NOT NULL DEFAULT 'ACTIVE',
  duel_id       TEXT,
  enqueued_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  heartbeat_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ   NOT NULL,

  CONSTRAINT ticket_stake_matches_tier
    CHECK ((tier = 'CASH') = (stake_minor > 0)),
  CONSTRAINT ticket_matched_has_duel
    CHECK ((status = 'MATCHED') = (duel_id IS NOT NULL))
);

-- THE invariant. A player may hold at most one active ticket, and it is the
-- database that says so -- not a service, not a lock, not a code review.
-- Double-joining becomes a constraint violation rather than a race.
CREATE UNIQUE INDEX matchmaking_one_active_per_player
  ON matchmaking_ticket (player_id) WHERE status = 'ACTIVE';

CREATE INDEX matchmaking_pool_idx
  ON matchmaking_ticket (game_id, mode, tier, stake_minor, enqueued_at)
  WHERE status = 'ACTIVE';

-- --- Duels -------------------------------------------------------------------

CREATE TYPE duel_status AS ENUM
  ('CREATED', 'RESERVED', 'READY', 'LIVE', 'COMPLETED', 'SETTLED', 'ABORTED', 'VOIDED');

CREATE TABLE duel (
  id                 TEXT        PRIMARY KEY,
  game_id            TEXT        NOT NULL REFERENCES game(id),
  plugin_version     INT         NOT NULL,   -- a rules change must never reinterpret an old game
  -- Idempotent creation: a retry of the same pairing cannot produce a second duel.
  pairing_key        TEXT        NOT NULL UNIQUE,
  seat_0             TEXT        NOT NULL REFERENCES player(id),  -- white, in chess
  seat_1             TEXT        NOT NULL REFERENCES player(id),
  tier               entry_tier  NOT NULL,
  stake_minor        BIGINT      NOT NULL DEFAULT 0,
  asset              TEXT,
  initial_state      JSONB       NOT NULL,   -- the challenge, as generated server-side
  seed               TEXT,
  time_control       JSONB       NOT NULL,
  clock_state        JSONB,
  status             duel_status NOT NULL DEFAULT 'CREATED',
  result             TEXT,                   -- '1-0' | '0-1' | '1/2-1/2'
  termination_reason TEXT,
  game_hash          TEXT,                   -- sha256 of the canonical replay
  fairplay_meta      JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at         TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  settled_at         TIMESTAMPTZ,

  -- Self-play is the simplest collusion vector there is. Close it structurally.
  CONSTRAINT duel_distinct_players CHECK (seat_0 <> seat_1),
  CONSTRAINT duel_completed_has_result
    CHECK (status NOT IN ('COMPLETED', 'SETTLED')
           OR (result IS NOT NULL AND termination_reason IS NOT NULL)),
  CONSTRAINT duel_settled_was_completed
    CHECK (status <> 'SETTLED' OR completed_at IS NOT NULL),
  CONSTRAINT duel_cash_has_stake
    CHECK ((tier = 'CASH') = (stake_minor > 0 AND asset IS NOT NULL))
);

CREATE INDEX duel_player_idx ON duel (seat_0, created_at);
CREATE INDEX duel_player2_idx ON duel (seat_1, created_at);
CREATE INDEX duel_status_idx ON duel (status) WHERE status IN ('LIVE', 'COMPLETED');

-- --- Duel events (append-only; this is the replay) ---------------------------

CREATE TABLE duel_event (
  duel_id        TEXT        NOT NULL REFERENCES duel(id),
  seq            INT         NOT NULL,
  type           TEXT        NOT NULL,
  payload        JSONB       NOT NULL,
  server_time_ms BIGINT      NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (duel_id, seq)
);

CREATE TRIGGER duel_event_immutable
  BEFORE UPDATE OR DELETE ON duel_event
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

-- =============================================================================
-- PAIRING
--
-- Runs in one transaction. Tickets are locked in a deterministic order (by id)
-- so two concurrent pairers cannot deadlock against each other, and SKIP LOCKED
-- means a pairer never waits on a ticket another pairer already holds.
-- =============================================================================

/**
 * Rating spread allowed for a ticket that has waited `p_waited_s` seconds.
 * Bands widen over time to bound wait, but never past the ceiling: a Bronze
 * player must never be fed to a Grandmaster just because the queue is empty.
 */
CREATE FUNCTION mm_allowed_spread_x100(p_waited_s NUMERIC)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT LEAST(5000 + (FLOOR(p_waited_s / 5) * 2500), 40000)::INT;
$$;   -- starts at 50.00, +25.00 every 5s, capped at 400.00

CREATE FUNCTION mm_pair(
  p_game_id     TEXT,
  p_mode        TEXT,
  p_tier        entry_tier,
  p_stake_minor BIGINT,
  p_duel_id     TEXT,
  p_initial     JSONB,
  p_time_control JSONB,
  p_seed        TEXT DEFAULT NULL
) RETURNS TABLE (duel_id TEXT, seat_0 TEXT, seat_1 TEXT, created BOOLEAN)
LANGUAGE plpgsql AS $$
DECLARE
  a            matchmaking_ticket;
  b            matchmaking_ticket;
  v_spread     INT;
  v_pairing_key TEXT;
  v_seat0      TEXT;
  v_seat1      TEXT;
  v_existing   TEXT;
BEGIN
  -- Oldest waiting ticket first: fairness is "longest wait gets served".
  SELECT * INTO a
    FROM matchmaking_ticket t
   WHERE t.status = 'ACTIVE' AND t.game_id = p_game_id AND t.mode = p_mode
     AND t.tier = p_tier AND t.stake_minor = p_stake_minor
     AND t.expires_at > now()
   ORDER BY t.enqueued_at, t.id
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF a IS NULL THEN RETURN; END IF;

  v_spread := mm_allowed_spread_x100(EXTRACT(EPOCH FROM (now() - a.enqueued_at)));

  -- Closest rated opponent inside the band. The unique active-ticket index
  -- already guarantees b.player_id <> a.player_id, but state it anyway: a
  -- future index change must not silently enable self-play.
  SELECT * INTO b
    FROM matchmaking_ticket t
   WHERE t.status = 'ACTIVE' AND t.game_id = p_game_id AND t.mode = p_mode
     AND t.tier = p_tier AND t.stake_minor = p_stake_minor
     AND t.expires_at > now()
     AND t.id <> a.id
     AND t.player_id <> a.player_id
     AND ABS(t.rating_x100 - a.rating_x100) <= v_spread
   ORDER BY ABS(t.rating_x100 - a.rating_x100), t.enqueued_at, t.id
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF b IS NULL THEN RETURN; END IF;

  -- Seat assignment is deterministic from the pairing, not random, so a replay
  -- can be verified without storing which way a coin landed.
  IF a.player_id < b.player_id THEN
    v_seat0 := a.player_id; v_seat1 := b.player_id;
  ELSE
    v_seat0 := b.player_id; v_seat1 := a.player_id;
  END IF;

  v_pairing_key := p_game_id || ':' || p_mode || ':' || p_tier || ':' ||
                   LEAST(a.id, b.id) || ':' || GREATEST(a.id, b.id);

  -- Idempotent: a retried pairing returns the duel it already made.
  SELECT d.id INTO v_existing FROM duel d WHERE d.pairing_key = v_pairing_key;
  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_existing, v_seat0, v_seat1, FALSE;
    RETURN;
  END IF;

  INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
                    tier, stake_minor, asset, initial_state, seed, time_control, status)
  SELECT p_duel_id, p_game_id, g.plugin_version, v_pairing_key, v_seat0, v_seat1,
         p_tier, p_stake_minor,
         CASE WHEN p_tier = 'CASH' THEN 'USDT' ELSE NULL END::TEXT,
         p_initial, p_seed, p_time_control,
         -- A cash duel is RESERVED, not READY: entry fees must be locked in the
         -- ledger before play begins. Only a free duel is ready on creation.
         (CASE WHEN p_tier = 'CASH' THEN 'RESERVED' ELSE 'READY' END)::duel_status
    FROM game g WHERE g.id = p_game_id;

  UPDATE matchmaking_ticket
     SET status = 'MATCHED', duel_id = p_duel_id
   WHERE id IN (a.id, b.id);

  RETURN QUERY SELECT p_duel_id, v_seat0, v_seat1, TRUE;
END;
$$;

/** Sweep stale tickets. Idempotent, and safe to run concurrently with pairing. */
CREATE FUNCTION mm_expire_stale(p_heartbeat_grace INTERVAL DEFAULT INTERVAL '30 seconds')
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE v_n INT;
BEGIN
  UPDATE matchmaking_ticket
     SET status = 'EXPIRED'
   WHERE status = 'ACTIVE'
     AND (expires_at <= now() OR heartbeat_at < now() - p_heartbeat_grace);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
