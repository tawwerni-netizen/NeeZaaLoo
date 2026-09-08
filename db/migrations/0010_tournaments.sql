-- =============================================================================
-- 0010_tournaments.sql
--
-- A game-agnostic tournament engine on top of the existing duel/settlement
-- machinery. A tournament creates duels through the same createDuel/settle
-- path everything else uses -- it does not reimplement scoring, clocks, or
-- money movement, it schedules and aggregates them.
--
-- Structural protections, per the brief:
--   double registration   -> UNIQUE (tournament_id, player_id)
--   double charge         -> ledger idempotency key tournament:{id}:entry:{player}
--   duplicate result      -> pairing state machine, COMPLETED/FORFEIT terminal
--   duplicate settlement  -> UNIQUE (tournament_id, player_id) on settlement
--                            + ledger idempotency key tournament:{id}:prize:{player}
--   capacity races        -> trigger locks the tournament row and counts
--                            registrations INSIDE the same transaction
-- =============================================================================

CREATE TYPE tournament_format AS ENUM ('SINGLE_ELIMINATION', 'SWISS');
CREATE TYPE tournament_status AS ENUM (
  'DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED',
  'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
);
CREATE TYPE registration_status AS ENUM ('REGISTERED', 'WITHDRAWN', 'DISQUALIFIED');
CREATE TYPE round_status AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');
CREATE TYPE pairing_status AS ENUM ('PENDING', 'LIVE', 'COMPLETED', 'BYE', 'FORFEIT');

/**
 * Sum of prize basis points in a `[{"rank":1,"bps":5000}, ...]` array.
 *
 * A plain CHECK cannot contain a subquery (Postgres rejects it outright, and
 * PGlite does too), so the aggregation is wrapped in an IMMUTABLE function --
 * a pure function of the column's own value, not a cross-table lookup, which
 * is exactly the case this technique is legitimate for.
 */
CREATE FUNCTION jsonb_bps_sum(p_structure JSONB) RETURNS INT
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(SUM((e->>'bps')::INT), 0) FROM jsonb_array_elements(p_structure) e;
$$;

CREATE TABLE tournament (
  id                     TEXT               PRIMARY KEY,
  game_id                TEXT               NOT NULL REFERENCES game(id),
  format                 tournament_format  NOT NULL,
  status                 tournament_status  NOT NULL DEFAULT 'DRAFT',
  tier                   entry_tier         NOT NULL DEFAULT 'FREE',
  entry_fee_minor        BIGINT             NOT NULL DEFAULT 0,
  asset                  TEXT               REFERENCES asset(code),
  capacity               INT                NOT NULL,
  min_players            INT                NOT NULL DEFAULT 2,
  time_control           JSONB              NOT NULL,
  swiss_rounds           INT,                          -- NULL for single elimination
  registration_opens_at  TIMESTAMPTZ        NOT NULL DEFAULT now(),
  registration_closes_at TIMESTAMPTZ        NOT NULL,
  starts_at              TIMESTAMPTZ,
  completed_at           TIMESTAMPTZ,
  prize_structure        JSONB              NOT NULL DEFAULT '[]'::jsonb,  -- [{"rank":1,"bps":5000}, ...]
  created_by             TEXT,
  created_at             TIMESTAMPTZ        NOT NULL DEFAULT now(),

  CONSTRAINT tournament_capacity_sane CHECK (capacity >= 2),
  CONSTRAINT tournament_min_le_capacity CHECK (min_players >= 2 AND min_players <= capacity),
  CONSTRAINT tournament_cash_has_asset CHECK (tier <> 'CASH' OR (asset IS NOT NULL AND entry_fee_minor > 0)),
  CONSTRAINT tournament_swiss_rounds_only_for_swiss
    CHECK ((format = 'SWISS') = (swiss_rounds IS NOT NULL)),
  -- Prize shares are basis points of the pool and must not exceed 100%. They
  -- MAY total less (the remainder is rake, per the Economy Rules Engine).
  CONSTRAINT tournament_prize_bps_sane CHECK (jsonb_bps_sum(prize_structure) <= 10000)
);

CREATE INDEX tournament_open_idx ON tournament (registration_closes_at)
  WHERE status = 'REGISTRATION_OPEN';
CREATE INDEX tournament_status_idx ON tournament (status);

-- --- Registration ------------------------------------------------------------

CREATE TABLE tournament_registration (
  tournament_id    TEXT                  NOT NULL REFERENCES tournament(id),
  player_id        TEXT                  NOT NULL REFERENCES player(id),
  status           registration_status   NOT NULL DEFAULT 'REGISTERED',
  seed_rating_x100 INT                   NOT NULL,
  entry_tx_id      BIGINT                REFERENCES ledger_transaction(id),
  registered_at    TIMESTAMPTZ           NOT NULL DEFAULT now(),
  withdrawn_at     TIMESTAMPTZ,

  -- THE double-registration guarantee. Not "at most one active" like a
  -- matchmaking ticket -- a player may never register for the same
  -- tournament twice, full stop, even after withdrawing.
  PRIMARY KEY (tournament_id, player_id)
);

CREATE INDEX tournament_registration_player_idx ON tournament_registration (player_id, registered_at DESC);

/**
 * A CASH registration must carry a ledger transaction unless it has been
 * withdrawn. This is a cross-table rule (it needs the tournament's tier), so
 * it is a trigger rather than a CHECK -- the same reason tournament_capacity_guard
 * is a trigger and not a constraint.
 */
CREATE FUNCTION tournament_registration_ledger_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_tier entry_tier;
BEGIN
  IF NEW.status = 'WITHDRAWN' OR NEW.entry_tx_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT tier INTO v_tier FROM tournament WHERE id = NEW.tournament_id;
  IF v_tier <> 'FREE' THEN
    RAISE EXCEPTION
      'a CASH tournament registration must carry an entry_tx_id unless withdrawn'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tournament_registration_ledger_check
  BEFORE INSERT OR UPDATE ON tournament_registration
  FOR EACH ROW EXECUTE FUNCTION tournament_registration_ledger_guard();

/**
 * Enforce capacity INSIDE the transaction that registers a player.
 *
 * Locks the tournament row first (SELECT ... FOR UPDATE), so two concurrent
 * registrations for the last slot cannot both read "capacity not yet
 * reached" and both insert. One waits for the other's transaction to commit
 * or roll back; the loser sees an accurate, post-commit count.
 */
CREATE FUNCTION tournament_capacity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_capacity INT;
  v_status   tournament_status;
  v_count    INT;
BEGIN
  SELECT capacity, status INTO v_capacity, v_status
    FROM tournament WHERE id = NEW.tournament_id FOR UPDATE;

  IF v_status <> 'REGISTRATION_OPEN' THEN
    RAISE EXCEPTION 'tournament % is not open for registration (status %)',
      NEW.tournament_id, v_status USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_count FROM tournament_registration
   WHERE tournament_id = NEW.tournament_id AND status = 'REGISTERED';

  IF v_count >= v_capacity THEN
    RAISE EXCEPTION 'tournament % is at capacity (%/%)',
      NEW.tournament_id, v_count, v_capacity USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tournament_registration_capacity
  BEFORE INSERT ON tournament_registration
  FOR EACH ROW EXECUTE FUNCTION tournament_capacity_guard();

-- --- Rounds and pairings -----------------------------------------------------

CREATE TABLE tournament_round (
  tournament_id TEXT         NOT NULL REFERENCES tournament(id),
  round_number  INT          NOT NULL,
  status        round_status NOT NULL DEFAULT 'PENDING',
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,

  PRIMARY KEY (tournament_id, round_number)
);

CREATE TABLE tournament_pairing (
  id             TEXT           PRIMARY KEY,
  tournament_id  TEXT           NOT NULL REFERENCES tournament(id),
  round_number   INT            NOT NULL,
  -- Slot within the round. For single elimination this is the bracket slot,
  -- which determines who the winner plays next round; for Swiss it is
  -- simply a display order.
  slot           INT            NOT NULL,
  seat_0         TEXT           REFERENCES player(id),
  seat_1         TEXT           REFERENCES player(id),  -- NULL means seat_0 has a bye
  duel_id        TEXT           REFERENCES duel(id),
  status         pairing_status NOT NULL DEFAULT 'PENDING',
  result         TEXT,                                   -- '1-0' | '0-1' | '1/2-1/2'
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
  decided_at     TIMESTAMPTZ,

  FOREIGN KEY (tournament_id, round_number) REFERENCES tournament_round(tournament_id, round_number),
  UNIQUE (tournament_id, round_number, slot),
  CONSTRAINT pairing_distinct_seats CHECK (seat_0 IS NULL OR seat_1 IS NULL OR seat_0 <> seat_1),
  CONSTRAINT pairing_bye_is_resolved CHECK (seat_1 IS NOT NULL OR status IN ('BYE', 'PENDING')),
  CONSTRAINT pairing_completed_has_result
    CHECK (status NOT IN ('COMPLETED', 'FORFEIT') OR result IS NOT NULL)
);

CREATE INDEX tournament_pairing_round_idx ON tournament_pairing (tournament_id, round_number);
CREATE INDEX tournament_pairing_duel_idx ON tournament_pairing (duel_id);
CREATE INDEX tournament_pairing_player_idx ON tournament_pairing (seat_0, seat_1);

/**
 * A pairing's result is set ONCE. COMPLETED, FORFEIT and BYE are terminal.
 *
 * This is the structural answer to "duplicate result": a second attempt to
 * record a result for an already-decided pairing is refused, not silently
 * overwritten, however many times a settlement worker retries.
 */
CREATE FUNCTION tournament_pairing_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('COMPLETED', 'FORFEIT', 'BYE') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'pairing % is already decided (%) and cannot be changed',
      OLD.id, OLD.status USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.result IS NOT NULL AND NEW.result IS DISTINCT FROM OLD.result THEN
    RAISE EXCEPTION 'pairing % result is immutable once recorded', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tournament_pairing_immutable_result
  BEFORE UPDATE ON tournament_pairing
  FOR EACH ROW EXECUTE FUNCTION tournament_pairing_guard();

-- --- Standings ---------------------------------------------------------------

CREATE TABLE tournament_standing (
  tournament_id    TEXT   NOT NULL REFERENCES tournament(id),
  player_id        TEXT   NOT NULL REFERENCES player(id),
  points           NUMERIC(6,1) NOT NULL DEFAULT 0,
  wins             INT    NOT NULL DEFAULT 0,
  losses           INT    NOT NULL DEFAULT 0,
  draws            INT    NOT NULL DEFAULT 0,
  byes             INT    NOT NULL DEFAULT 0,
  buchholz         NUMERIC(6,1) NOT NULL DEFAULT 0,   -- sum of opponents' scores (Swiss tiebreak)
  sonneborn_berger NUMERIC(8,2) NOT NULL DEFAULT 0,   -- weighted tiebreak
  rank             INT,
  disqualified     BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (tournament_id, player_id)
);

CREATE INDEX tournament_standing_rank_idx ON tournament_standing (tournament_id, points DESC, buchholz DESC);

-- --- Settlement (prizes) ------------------------------------------------------

CREATE TABLE tournament_settlement (
  tournament_id    TEXT        NOT NULL REFERENCES tournament(id),
  player_id        TEXT        NOT NULL REFERENCES player(id),
  rank             INT         NOT NULL,
  prize_minor      BIGINT      NOT NULL,
  settlement_tx_id BIGINT      REFERENCES ledger_transaction(id),
  settled_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- THE duplicate-settlement guarantee: one prize row per player, ever.
  PRIMARY KEY (tournament_id, player_id),
  CONSTRAINT settlement_prize_positive CHECK (prize_minor >= 0),
  CONSTRAINT settlement_nonzero_has_ledger
    CHECK (prize_minor = 0 OR settlement_tx_id IS NOT NULL)
);

CREATE TRIGGER tournament_settlement_immutable
  BEFORE UPDATE OR DELETE ON tournament_settlement
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

-- --- Audit trail (append-only) -------------------------------------------------

CREATE TABLE tournament_event (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tournament_id TEXT        NOT NULL REFERENCES tournament(id),
  event         TEXT        NOT NULL,
  actor_type    TEXT        NOT NULL,
  actor_id      TEXT,
  detail        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER tournament_event_immutable
  BEFORE UPDATE OR DELETE ON tournament_event
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE INDEX tournament_event_idx ON tournament_event (tournament_id, at);
