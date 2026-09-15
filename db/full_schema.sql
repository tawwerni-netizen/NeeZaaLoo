-- =============================================================================
-- 0001_ledger_core.sql
--
-- Double-entry, append-only, multi-asset ledger.
--
-- Design rule: the invariants below are enforced BY THE DATABASE, not by
-- application code. Application code can be buggy, and the admin API can be
-- compromised; neither may be able to produce an unbalanced or edited ledger.
--
-- See docs/ledger/LEDGER_SPECIFICATION.md
-- =============================================================================

-- --- Enumerations ------------------------------------------------------------

CREATE TYPE ledger_owner_type   AS ENUM ('USER', 'PLATFORM');
CREATE TYPE ledger_account_type AS ENUM ('ASSET', 'LIABILITY', 'REVENUE', 'EQUITY');
CREATE TYPE ledger_side         AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE ledger_actor_type   AS ENUM ('SYSTEM', 'USER', 'ADMIN');

-- --- Assets ------------------------------------------------------------------
-- Asset and network are always explicit and always travel together (brand rule:
-- never display "USDT" alone; it is "USDT - TRON (TRC20)").

CREATE TABLE asset (
  code        TEXT PRIMARY KEY,
  minor_units SMALLINT NOT NULL,          -- decimal places; USDT = 6
  CONSTRAINT asset_minor_units_sane CHECK (minor_units BETWEEN 0 AND 18)
);

INSERT INTO asset (code, minor_units) VALUES ('USDT', 6);

-- --- Accounts ----------------------------------------------------------------

CREATE TABLE ledger_account (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key            TEXT                NOT NULL,   -- 'user:123:available'
  owner_type     ledger_owner_type   NOT NULL,
  owner_id       TEXT,
  account_type   ledger_account_type NOT NULL,
  -- Which direction is this account's natural, non-negative direction?
  -- Platform custody holds value (DEBIT). User wallets are money we owe (CREDIT).
  normal_side    ledger_side         NOT NULL,
  -- Only platform working accounts may legitimately go negative.
  allow_negative BOOLEAN             NOT NULL DEFAULT FALSE,
  asset          TEXT                NOT NULL REFERENCES asset(code),
  network        TEXT,
  created_at     TIMESTAMPTZ         NOT NULL DEFAULT now(),

  CONSTRAINT ledger_account_key_asset_uniq UNIQUE (key, asset),
  -- Enables the composite FK from ledger_entry that makes an entry's asset
  -- structurally incapable of differing from its account's asset.
  CONSTRAINT ledger_account_id_asset_uniq  UNIQUE (id, asset),
  CONSTRAINT ledger_account_owner_id_present
    CHECK (owner_type <> 'USER' OR owner_id IS NOT NULL),
  CONSTRAINT ledger_account_users_are_liabilities
    CHECK (owner_type <> 'USER' OR (account_type = 'LIABILITY' AND normal_side = 'CREDIT')),
  -- A user account may never be authorised to go negative. This is the
  -- structural form of "a user cannot spend money they do not have".
  CONSTRAINT ledger_account_users_never_negative
    CHECK (owner_type <> 'USER' OR allow_negative = FALSE)
);

CREATE INDEX ledger_account_owner_idx ON ledger_account (owner_type, owner_id);

-- --- Transactions ------------------------------------------------------------

CREATE TABLE ledger_transaction (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uuid            UUID              NOT NULL DEFAULT gen_random_uuid(),
  kind            TEXT              NOT NULL,
  idempotency_key TEXT              NOT NULL,
  reference_type  TEXT,
  reference_id    TEXT,
  actor_type      ledger_actor_type NOT NULL,
  actor_id        TEXT,
  reason          TEXT,
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT now(),

  CONSTRAINT ledger_transaction_uuid_uniq UNIQUE (uuid),
  -- I4: replay protection is a unique index, not application logic.
  CONSTRAINT ledger_transaction_idem_uniq UNIQUE (idempotency_key),
  -- I5: an adjustment without a named admin and a stated reason is not an
  -- adjustment, it is an unexplained edit to financial history.
  CONSTRAINT ledger_transaction_adjustment_is_accountable
    CHECK (
      kind <> 'ADJUSTMENT'
      OR (reason IS NOT NULL AND length(btrim(reason)) > 0
          AND actor_type = 'ADMIN' AND actor_id IS NOT NULL)
    )
);

-- --- Entries (append-only) ---------------------------------------------------

CREATE TABLE ledger_entry (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transaction_id BIGINT      NOT NULL REFERENCES ledger_transaction(id),
  account_id     BIGINT      NOT NULL,
  asset          TEXT        NOT NULL,
  -- I6: minor units, integer, signed. Never a float.
  amount         BIGINT      NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ledger_entry_amount_nonzero CHECK (amount <> 0),
  -- The composite FK: an entry cannot name an asset its account does not hold.
  CONSTRAINT ledger_entry_account_asset_fk
    FOREIGN KEY (account_id, asset) REFERENCES ledger_account (id, asset)
);

CREATE INDEX ledger_entry_account_idx     ON ledger_entry (account_id, id);
CREATE INDEX ledger_entry_transaction_idx ON ledger_entry (transaction_id);

-- --- Balance projection ------------------------------------------------------
-- Maintained inside the same transaction as the entries, so it is never stale
-- and never eventually-consistent. It remains a cache: the entries are truth,
-- and a continuous verifier re-derives balances and compares (L1 reconciliation).

CREATE TABLE ledger_balance (
  account_id    BIGINT PRIMARY KEY REFERENCES ledger_account(id),
  asset         TEXT        NOT NULL REFERENCES asset(code),
  balance       BIGINT      NOT NULL DEFAULT 0,   -- raw signed sum of entries
  entry_count   BIGINT      NOT NULL DEFAULT 0,
  last_entry_id BIGINT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Natural balance: the direction in which this account is meant to grow.
-- For a user wallet (CREDIT) a raw balance of -1000 is a natural balance of
-- +1000, i.e. we owe the user 1000 minor units.
CREATE FUNCTION ledger_natural_balance(p_side ledger_side, p_balance BIGINT)
RETURNS BIGINT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_side WHEN 'DEBIT' THEN p_balance ELSE -p_balance END;
$$;

-- =============================================================================
-- I2 — IMMUTABILITY
-- Entries and transactions are insert-only. Corrections are new compensating
-- records, never edits. Enforced by trigger here; the application role is
-- additionally denied UPDATE/DELETE in 0002.
-- =============================================================================

CREATE FUNCTION ledger_deny_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'ledger is append-only: % on % is forbidden (correct with a compensating transaction)',
    TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER ledger_entry_immutable
  BEFORE UPDATE OR DELETE ON ledger_entry
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE TRIGGER ledger_entry_no_truncate
  BEFORE TRUNCATE ON ledger_entry
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_deny_mutation();

CREATE TRIGGER ledger_transaction_immutable
  BEFORE UPDATE OR DELETE ON ledger_transaction
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE TRIGGER ledger_transaction_no_truncate
  BEFORE TRUNCATE ON ledger_transaction
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_deny_mutation();

-- =============================================================================
-- I1 — ZERO SUM PER ASSET, PER TRANSACTION
-- Deferred to COMMIT, because a balanced transaction is only balanced once all
-- of its legs are written. This is what makes "the system always balances, or
-- it refuses the write" true rather than aspirational.
-- =============================================================================

CREATE FUNCTION ledger_assert_zero_sum() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_asset TEXT;
  v_sum   BIGINT;
BEGIN
  FOR v_asset, v_sum IN
    SELECT e.asset, SUM(e.amount)
    FROM ledger_entry e
    WHERE e.transaction_id = NEW.transaction_id
    GROUP BY e.asset
  LOOP
    IF v_sum <> 0 THEN
      RAISE EXCEPTION
        'unbalanced transaction %: asset % sums to % (must be 0)',
        NEW.transaction_id, v_asset, v_sum
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ledger_entry_zero_sum
  AFTER INSERT ON ledger_entry
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_assert_zero_sum();

-- A transaction must have at least two legs. Also deferred: checked at COMMIT.
CREATE FUNCTION ledger_assert_has_legs() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_n INT;
BEGIN
  SELECT count(*) INTO v_n FROM ledger_entry WHERE transaction_id = NEW.id;
  IF v_n < 2 THEN
    RAISE EXCEPTION 'transaction % has % entries; double-entry requires at least 2',
      NEW.id, v_n USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ledger_transaction_has_legs
  AFTER INSERT ON ledger_transaction
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_assert_has_legs();

-- =============================================================================
-- I3 — BALANCE PROJECTION + NON-NEGATIVITY
-- The snapshot is updated in the same transaction as the entry. A user account
-- that would go negative aborts the whole transaction.
-- =============================================================================

CREATE FUNCTION ledger_apply_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_side     ledger_side;
  v_allow    BOOLEAN;
  v_key      TEXT;
  v_balance  BIGINT;
  v_natural  BIGINT;
BEGIN
  SELECT a.normal_side, a.allow_negative, a.key
    INTO v_side, v_allow, v_key
    FROM ledger_account a
   WHERE a.id = NEW.account_id
   FOR UPDATE;                      -- serialises concurrent writers per account

  INSERT INTO ledger_balance AS b (account_id, asset, balance, entry_count, last_entry_id)
       VALUES (NEW.account_id, NEW.asset, NEW.amount, 1, NEW.id)
  ON CONFLICT (account_id) DO UPDATE
     SET balance       = b.balance + EXCLUDED.balance,
         entry_count   = b.entry_count + 1,
         last_entry_id = EXCLUDED.last_entry_id,
         updated_at    = now()
  RETURNING b.balance INTO v_balance;

  v_natural := ledger_natural_balance(v_side, v_balance);

  IF NOT v_allow AND v_natural < 0 THEN
    RAISE EXCEPTION
      'insufficient funds: account % would fall to % minor units',
      v_key, v_natural
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER ledger_entry_apply
  AFTER INSERT ON ledger_entry
  FOR EACH ROW EXECUTE FUNCTION ledger_apply_entry();

-- =============================================================================
-- POSTING API
-- The only supported way to move money. Idempotent by construction: a replayed
-- key returns the original transaction id and writes nothing.
-- =============================================================================

CREATE FUNCTION ledger_post(
  p_idempotency_key TEXT,
  p_kind            TEXT,
  p_actor_type      ledger_actor_type,
  p_actor_id        TEXT,
  p_legs            JSONB,     -- [{"account":"user:1:available","amount":-1000}, ...]
  p_asset           TEXT DEFAULT 'USDT',
  p_reason          TEXT DEFAULT NULL,
  p_reference_type  TEXT DEFAULT NULL,
  p_reference_id    TEXT DEFAULT NULL
) RETURNS TABLE (transaction_id BIGINT, replayed BOOLEAN)
LANGUAGE plpgsql AS $$
DECLARE
  v_tx   BIGINT;
  v_leg  JSONB;
  v_acct BIGINT;
  v_key  TEXT;
BEGIN
  INSERT INTO ledger_transaction
    (kind, idempotency_key, actor_type, actor_id, reason, reference_type, reference_id)
  VALUES
    (p_kind, p_idempotency_key, p_actor_type, p_actor_id, p_reason, p_reference_type, p_reference_id)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_tx;

  IF v_tx IS NULL THEN
    -- Replay. Return the original result; write nothing.
    SELECT t.id INTO v_tx
      FROM ledger_transaction t
     WHERE t.idempotency_key = p_idempotency_key;
    RETURN QUERY SELECT v_tx, TRUE;
    RETURN;
  END IF;

  FOR v_leg IN SELECT * FROM jsonb_array_elements(p_legs) LOOP
    v_key := v_leg->>'account';

    SELECT a.id INTO v_acct
      FROM ledger_account a
     WHERE a.key = v_key AND a.asset = p_asset;

    IF v_acct IS NULL THEN
      RAISE EXCEPTION 'no such ledger account: % (asset %)', v_key, p_asset
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    INSERT INTO ledger_entry (transaction_id, account_id, asset, amount)
    VALUES (v_tx, v_acct, p_asset, (v_leg->>'amount')::BIGINT);
  END LOOP;

  RETURN QUERY SELECT v_tx, FALSE;
END;
$$;

-- =============================================================================
-- RECONCILIATION VIEWS (L1 + solvency)
-- =============================================================================

-- L1: does the cached snapshot still agree with the entries it summarises?
CREATE VIEW ledger_balance_verification AS
SELECT
  a.id                                   AS account_id,
  a.key,
  a.asset,
  b.balance                              AS snapshot_balance,
  COALESCE(SUM(e.amount), 0)             AS derived_balance,
  b.balance - COALESCE(SUM(e.amount), 0) AS drift
FROM ledger_account a
LEFT JOIN ledger_balance b ON b.account_id = a.id
LEFT JOIN ledger_entry   e ON e.account_id = a.id
GROUP BY a.id, a.key, a.asset, b.balance;

-- The single most important number in the company: do we hold at least what we
-- owe, per asset? A negative headroom means the platform is insolvent for that
-- asset and withdrawals must halt automatically.
CREATE VIEW ledger_solvency AS
SELECT
  a.asset,
  SUM(CASE WHEN a.owner_type = 'PLATFORM' AND a.account_type = 'ASSET'
           THEN ledger_natural_balance(a.normal_side, COALESCE(b.balance, 0))
           ELSE 0 END) AS custody_held,
  SUM(CASE WHEN a.owner_type = 'USER'
           THEN ledger_natural_balance(a.normal_side, COALESCE(b.balance, 0))
           ELSE 0 END) AS user_liabilities
FROM ledger_account a
LEFT JOIN ledger_balance b ON b.account_id = a.id
GROUP BY a.asset;
-- =============================================================================
-- 0002_ledger_roles_and_platform_accounts.sql
--
-- Defence in depth for I2 (immutability), plus the platform's own accounts.
--
-- The triggers in 0001 stop an UPDATE or DELETE from succeeding. Privileges stop
-- the application from being able to attempt one at all. Both matter: a trigger
-- can be dropped by whoever holds DDL rights, so the application role must not
-- hold those rights either.
-- =============================================================================

-- --- Application role --------------------------------------------------------
-- The API connects as nizalo_app. It can read everything in the ledger and
-- insert nothing directly: all money movement goes through ledger_post().

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nizalo_app') THEN
    CREATE ROLE nizalo_app NOLOGIN;
  END IF;
END;
$$;

GRANT SELECT ON ledger_account, ledger_transaction, ledger_entry, ledger_balance,
                asset TO nizalo_app;
GRANT SELECT ON ledger_balance_verification, ledger_solvency TO nizalo_app;

-- Explicitly withheld, and stated here so a future migration that grants them
-- is visible as the deliberate act it would be:
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ledger_entry       FROM nizalo_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ledger_transaction FROM nizalo_app;
REVOKE UPDATE, DELETE, TRUNCATE          ON ledger_balance    FROM nizalo_app;
REVOKE UPDATE, DELETE                    ON ledger_account    FROM nizalo_app;

-- The one sanctioned write path.
GRANT EXECUTE ON FUNCTION
  ledger_post(TEXT, TEXT, ledger_actor_type, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT)
  TO nizalo_app;

-- --- Platform accounts -------------------------------------------------------
-- Custody is an ASSET (we hold it). Everything owed to users is a LIABILITY.
-- Suspense is the honesty account: anything we cannot explain lands here and
-- raises a case. It is never auto-cleared.

INSERT INTO ledger_account
  (key, owner_type, owner_id, account_type, normal_side, allow_negative, asset, network)
VALUES
  ('platform:custody:USDT:TRON', 'PLATFORM', NULL, 'ASSET',     'DEBIT',  FALSE, 'USDT', 'TRON'),
  ('platform:rake',              'PLATFORM', NULL, 'REVENUE',   'CREDIT', FALSE, 'USDT', NULL),
  ('platform:promotions',        'PLATFORM', NULL, 'LIABILITY', 'CREDIT', TRUE,  'USDT', NULL),
  ('platform:fees:network',      'PLATFORM', NULL, 'REVENUE',   'CREDIT', TRUE,  'USDT', NULL),
  ('platform:suspense',          'PLATFORM', NULL, 'LIABILITY', 'CREDIT', TRUE,  'USDT', NULL),
  ('platform:writeoff',          'PLATFORM', NULL, 'EQUITY',    'DEBIT',  TRUE,  'USDT', NULL);

-- --- User wallet provisioning ------------------------------------------------
-- The five wallet states from the specification are five ACCOUNTS, not a status
-- column. "Locked" funds are not available funds wearing a label, so a query for
-- available balance cannot accidentally include them.

CREATE FUNCTION ledger_open_user_wallet(p_user_id TEXT, p_asset TEXT DEFAULT 'USDT')
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_state TEXT;
BEGIN
  FOREACH v_state IN ARRAY ARRAY['available','locked','pending','withdrawable','restricted']
  LOOP
    INSERT INTO ledger_account
      (key, owner_type, owner_id, account_type, normal_side, allow_negative, asset)
    VALUES
      ('user:' || p_user_id || ':' || v_state, 'USER', p_user_id,
       'LIABILITY', 'CREDIT', FALSE, p_asset)
    ON CONFLICT (key, asset) DO NOTHING;
  END LOOP;
END;
$$;
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
-- =============================================================================
-- 0004_economy_and_settlement.sql
--
-- The Economy Rules Engine and the settlement linkage between a finished duel
-- and the ledger.
--
-- Two principles are made structural here rather than procedural:
--
--   1. Rake is CONFIGURATION, never code. A settlement records which rule
--      version priced it, so any historical duel can be re-derived exactly.
--   2. No single admin can price the platform. The two-admin rule is a CHECK
--      constraint, not a workflow step that a script can skip.
-- =============================================================================

-- --- Economy rules -----------------------------------------------------------

CREATE TABLE economy_rule (
  id              TEXT        NOT NULL,
  version         INT         NOT NULL,
  -- NULL means "any". Specificity decides which rule wins; see economy_resolve().
  game_id         TEXT        REFERENCES game(id),
  tier            entry_tier,
  tournament_id   TEXT,
  rake_bps        INT         NOT NULL,      -- 1000 = 10.00%
  min_rake_minor  BIGINT      NOT NULL DEFAULT 0,
  max_rake_minor  BIGINT,
  effective_from  TIMESTAMPTZ NOT NULL,
  effective_to    TIMESTAMPTZ,
  created_by      TEXT        NOT NULL,
  approved_by     TEXT        NOT NULL,
  reason          TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (id, version),

  -- Four-eyes, enforced by the database. A compromised admin account cannot
  -- price the platform alone, and no code path can "temporarily" skip this.
  CONSTRAINT economy_rule_two_admins CHECK (created_by <> approved_by),

  -- A hard ceiling on rake. The documented bands are 8-15%; 20% is the
  -- absolute limit a fat finger or a hostile admin can reach.
  CONSTRAINT economy_rule_rake_sane CHECK (rake_bps BETWEEN 0 AND 2000),
  CONSTRAINT economy_rule_min_max   CHECK (max_rake_minor IS NULL OR max_rake_minor >= min_rake_minor),
  CONSTRAINT economy_rule_window    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT economy_rule_reason    CHECK (length(btrim(reason)) > 0)
);

CREATE INDEX economy_rule_lookup_idx ON economy_rule (game_id, tier, effective_from);

-- Economy history is append-only for the same reason ledger history is: a
-- silently edited rate makes every past settlement unexplainable.
CREATE TRIGGER economy_rule_immutable
  BEFORE UPDATE OR DELETE ON economy_rule
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

/**
 * Which rule prices this duel, at this instant?
 *
 * Most specific wins: tournament > game+tier > game > tier > global. Ties are
 * broken by the latest effective_from, then the highest version, so a newer
 * rule of equal specificity supersedes an older one without needing the old
 * row to be edited (which is forbidden anyway).
 */
CREATE FUNCTION economy_resolve(
  p_game_id       TEXT,
  p_tier          entry_tier,
  p_at            TIMESTAMPTZ,
  p_tournament_id TEXT DEFAULT NULL
) RETURNS TABLE (
  rule_id TEXT, rule_version INT, rake_bps INT,
  min_rake_minor BIGINT, max_rake_minor BIGINT
) LANGUAGE sql STABLE AS $$
  SELECT r.id, r.version, r.rake_bps, r.min_rake_minor, r.max_rake_minor
    FROM economy_rule r
   WHERE r.effective_from <= p_at
     AND (r.effective_to IS NULL OR r.effective_to > p_at)
     AND (r.game_id       IS NULL OR r.game_id = p_game_id)
     AND (r.tier          IS NULL OR r.tier    = p_tier)
     AND (r.tournament_id IS NULL OR r.tournament_id = p_tournament_id)
     -- A tournament-scoped rule must not leak onto ordinary duels.
     AND (p_tournament_id IS NOT NULL OR r.tournament_id IS NULL)
   ORDER BY
     (r.tournament_id IS NOT NULL)::INT DESC,
     (r.game_id IS NOT NULL)::INT DESC,
     (r.tier IS NOT NULL)::INT DESC,
     r.effective_from DESC,
     r.version DESC
   LIMIT 1;
$$;

-- Launch economics. Standard band is 10-15%; we open at the bottom of it.
INSERT INTO economy_rule
  (id, version, game_id, tier, rake_bps, min_rake_minor, max_rake_minor,
   effective_from, created_by, approved_by, reason)
VALUES
  ('standard', 1, NULL, 'CASH', 1000, 0, NULL,
   '2026-01-01T00:00:00Z', 'founder', 'finance-admin',
   'Launch economics: 10% standard rake, bottom of the documented 10-15% band.');

-- --- Settlement linkage on the duel -----------------------------------------

ALTER TABLE duel
  ADD COLUMN settlement_tx_id     BIGINT REFERENCES ledger_transaction(id),
  ADD COLUMN reservation_tx_id    BIGINT REFERENCES ledger_transaction(id),
  ADD COLUMN rake_minor           BIGINT,
  ADD COLUMN economy_rule_id      TEXT,
  ADD COLUMN economy_rule_version INT,
  -- A duel under fair-play review is completed but NOT settled. Money waits.
  ADD COLUMN fairplay_hold        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN rating_applied       BOOLEAN NOT NULL DEFAULT FALSE;

-- A settled cash duel must be able to show the money. No exceptions, and no
-- "we'll backfill it later".
ALTER TABLE duel
  ADD CONSTRAINT duel_settled_cash_has_ledger
    CHECK (
      status <> 'SETTLED' OR tier <> 'CASH'
      OR (settlement_tx_id IS NOT NULL AND rake_minor IS NOT NULL
          AND economy_rule_id IS NOT NULL AND economy_rule_version IS NOT NULL)
    );

-- Money must never be released while a fair-play case is open on the duel.
ALTER TABLE duel
  ADD CONSTRAINT duel_no_settle_under_hold
    CHECK (status <> 'SETTLED' OR fairplay_hold = FALSE);

CREATE INDEX duel_awaiting_settlement_idx
  ON duel (completed_at) WHERE status = 'COMPLETED';

-- --- Rating history (append-only) -------------------------------------------
-- The rating table holds the current value; this holds how it got there. A
-- player disputing a rating change gets an answer, not a shrug.

CREATE TABLE rating_change (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  duel_id         TEXT NOT NULL REFERENCES duel(id),
  player_id       TEXT NOT NULL REFERENCES player(id),
  game_id         TEXT NOT NULL REFERENCES game(id),
  score           NUMERIC(2,1) NOT NULL,          -- 1.0 | 0.5 | 0.0
  rating_before_x100 INT NOT NULL,
  rating_after_x100  INT NOT NULL,
  rd_before_x100     INT NOT NULL,
  rd_after_x100      INT NOT NULL,
  volatility_before_x1e6 INT NOT NULL,
  volatility_after_x1e6  INT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rating_change_once_per_duel UNIQUE (duel_id, player_id),
  CONSTRAINT rating_change_score_valid CHECK (score IN (0.0, 0.5, 1.0))
);

CREATE TRIGGER rating_change_immutable
  BEFORE UPDATE OR DELETE ON rating_change
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE INDEX rating_change_player_idx ON rating_change (player_id, game_id, created_at);
-- =============================================================================
-- 0005_authentication.sql
--
-- Identity, sessions, 2FA, devices, and the security audit trail.
--
-- The design is built around one assumption from the threat model: the client
-- is hostile and the transport is observable. Therefore:
--
--   * no secret is ever stored in a form that is useful if the database leaks
--     (passwords are Argon2id, refresh tokens are SHA-256 hashes, recovery
--     codes are hashed, TOTP secrets are encrypted with a key held outside
--     the database);
--   * a stolen refresh token is DETECTABLE, because reuse of a rotated token
--     is structurally impossible to hide;
--   * every security-relevant act is written to an append-only log.
-- =============================================================================

-- --- Credentials -------------------------------------------------------------

CREATE TABLE credential (
  player_id       TEXT PRIMARY KEY REFERENCES player(id),
  -- The full PHC string: algorithm, version, parameters and salt travel with
  -- the hash, so parameters can be raised over time without a migration.
  password_hash   TEXT        NOT NULL,
  algorithm       TEXT        NOT NULL DEFAULT 'argon2id',
  -- When the password last changed. Withdrawals are frozen for a cooling-off
  -- window after this moves: an attacker who takes over an account should not
  -- be able to change the password and cash out in the same session.
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  must_change     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT credential_hash_is_phc CHECK (password_hash LIKE '$%$%'),
  CONSTRAINT credential_hash_not_plaintext CHECK (length(password_hash) >= 40)
);

-- --- Devices -----------------------------------------------------------------

CREATE TABLE device (
  id           TEXT PRIMARY KEY,
  player_id    TEXT        NOT NULL REFERENCES player(id),
  fingerprint  TEXT        NOT NULL,
  label        TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ,

  CONSTRAINT device_unique_per_player UNIQUE (player_id, fingerprint)
);

CREATE INDEX device_fingerprint_idx ON device (fingerprint);   -- multi-account graph

-- --- Sessions ----------------------------------------------------------------
--
-- One row per REFRESH TOKEN, not one row per login. Rotation appends a child
-- row and stamps the parent. A family is the chain from an original login.

CREATE TABLE auth_session (
  id             TEXT PRIMARY KEY,
  family_id      TEXT        NOT NULL,
  player_id      TEXT        NOT NULL REFERENCES player(id),
  device_id      TEXT        REFERENCES device(id),
  -- Only the hash. A database leak must not yield usable refresh tokens.
  refresh_hash   TEXT        NOT NULL UNIQUE,
  parent_id      TEXT        REFERENCES auth_session(id),
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  rotated_at     TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  revoked_reason TEXT,
  ip             TEXT,
  user_agent     TEXT,

  -- THE reuse-detection guarantee: a given refresh token can father at most
  -- one successor. Two concurrent refreshes with the same token cannot both
  -- mint a valid child -- one wins, the other is a constraint violation, and
  -- a constraint violation here means the token was replayed.
  CONSTRAINT auth_session_one_child_per_parent UNIQUE (parent_id),
  CONSTRAINT auth_session_expiry_after_issue CHECK (expires_at > issued_at)
);

CREATE INDEX auth_session_family_idx ON auth_session (family_id) WHERE revoked_at IS NULL;
CREATE INDEX auth_session_player_idx ON auth_session (player_id, issued_at DESC);

/**
 * Kill an entire session family.
 *
 * Called on logout-everywhere, on password change, and -- critically -- when a
 * rotated refresh token is presented again. That last case means the token was
 * captured: we cannot tell the thief from the victim, so both are logged out
 * and the user re-authenticates. Losing a session is a small harm; leaving a
 * thief holding a valid chain is not.
 */
CREATE FUNCTION auth_revoke_family(p_family_id TEXT, p_reason TEXT)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE v_n INT;
BEGIN
  UPDATE auth_session
     SET revoked_at = now(), revoked_reason = p_reason
   WHERE family_id = p_family_id AND revoked_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- --- Two-factor (TOTP only) --------------------------------------------------
-- SMS is deliberately absent. SIM-swap is the documented attack against any
-- account that can authorise a withdrawal, so there is no column for a phone
-- number to be tempted into using.

CREATE TABLE totp_secret (
  player_id        TEXT PRIMARY KEY REFERENCES player(id),
  -- Envelope-encrypted with a key held in the secrets manager, never in the DB.
  secret_encrypted TEXT        NOT NULL,
  key_id           TEXT        NOT NULL,
  confirmed_at     TIMESTAMPTZ,
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Replay guard: a TOTP code is valid for one step, and only once.
  last_used_step   BIGINT
);

CREATE TABLE recovery_code (
  player_id  TEXT        NOT NULL REFERENCES player(id),
  code_hash  TEXT        NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, code_hash)
);

-- --- Login throttling --------------------------------------------------------

CREATE TABLE login_attempt (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  identifier  TEXT        NOT NULL,      -- handle or email, as supplied
  ip          TEXT,
  succeeded   BOOLEAN     NOT NULL,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX login_attempt_recent_idx ON login_attempt (identifier, at DESC);

/** Failures in the window. Drives progressive delay and lockout. */
CREATE FUNCTION auth_recent_failures(p_identifier TEXT, p_window INTERVAL DEFAULT INTERVAL '15 minutes')
RETURNS INT LANGUAGE sql STABLE AS $$
  SELECT count(*)::INT FROM login_attempt
   WHERE identifier = p_identifier AND succeeded = FALSE AND at > now() - p_window;
$$;

-- --- Security audit (append-only) -------------------------------------------

CREATE TABLE security_event (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id  TEXT REFERENCES player(id),
  type       TEXT        NOT NULL,
  detail     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  ip         TEXT,
  device_id  TEXT,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER security_event_immutable
  BEFORE UPDATE OR DELETE ON security_event
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE INDEX security_event_player_idx ON security_event (player_id, at DESC);
CREATE INDEX security_event_type_idx ON security_event (type, at DESC);

-- --- Cooling-off -------------------------------------------------------------

/**
 * Is this account inside a post-change freeze?
 *
 * Account takeover follows a fixed shape: get in, change the password or the
 * 2FA device, withdraw. Freezing withdrawals for a window after either change
 * breaks that chain and costs an honest user nothing they will notice.
 */
CREATE FUNCTION auth_in_cooling_off(
  p_player_id TEXT,
  p_window INTERVAL DEFAULT INTERVAL '24 hours'
) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM credential c
     WHERE c.player_id = p_player_id AND c.changed_at > now() - p_window
  ) OR EXISTS (
    SELECT 1 FROM totp_secret t
     WHERE t.player_id = p_player_id AND t.changed_at > now() - p_window
  );
$$;
-- =============================================================================
-- 0006_admin_rbac_and_controls.sql
--
-- The admin plane: roles, separation of duties, emergency controls, audit.
--
-- Two rules are made structural because they are the ones that fail quietly:
--
--   1. NOBODY approves their own request. Not an admin, not a finance admin,
--      not the super admin. It is a CHECK constraint, so there is no code path
--      -- including a compromised one -- that can skip it.
--   2. A control switch gates future actions and NEVER destroys data. There is
--      no DELETE anywhere in this file.
-- =============================================================================

CREATE TYPE admin_role AS ENUM (
  'SUPER_ADMIN',
  'ADMIN',
  'FINANCE_ADMIN',
  'RISK_ADMIN',
  'ANTI_CHEAT_MODERATOR',
  'CONTENT_MODERATOR',
  'SUPPORT',
  'ANALYST',
  'READ_ONLY'
);

CREATE TABLE admin_user (
  id           TEXT PRIMARY KEY,
  email        TEXT        NOT NULL UNIQUE,
  display_name TEXT        NOT NULL,
  -- Hardware-backed MFA is mandatory for the admin plane. An admin without a
  -- registered authenticator cannot hold an active role; the policy engine
  -- refuses them and this column is what it reads.
  mfa_enrolled BOOLEAN     NOT NULL DEFAULT FALSE,
  disabled_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_role_grant (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id    TEXT       NOT NULL REFERENCES admin_user(id),
  role        admin_role NOT NULL,
  granted_by  TEXT       NOT NULL REFERENCES admin_user(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ,
  revoked_by  TEXT REFERENCES admin_user(id),
  reason      TEXT NOT NULL,

  -- Nobody grants themselves a role.
  CONSTRAINT admin_role_grant_not_self CHECK (admin_id <> granted_by),
  CONSTRAINT admin_role_grant_reason CHECK (length(btrim(reason)) > 0)
);

CREATE UNIQUE INDEX admin_role_grant_active_uniq
  ON admin_role_grant (admin_id, role) WHERE revoked_at IS NULL;

CREATE TRIGGER admin_role_grant_no_delete
  BEFORE DELETE ON admin_role_grant
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

/** Active roles for an admin. Empty for a disabled account. */
CREATE FUNCTION admin_roles(p_admin_id TEXT)
RETURNS TEXT[] LANGUAGE sql STABLE AS $$
  SELECT COALESCE(array_agg(g.role::TEXT ORDER BY g.role::TEXT), ARRAY[]::TEXT[])
    FROM admin_role_grant g
    JOIN admin_user u ON u.id = g.admin_id
   WHERE g.admin_id = p_admin_id
     AND g.revoked_at IS NULL
     AND u.disabled_at IS NULL;
$$;

-- --- Four-eyes approvals -----------------------------------------------------

CREATE TYPE approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'EXECUTED');

CREATE TABLE approval_request (
  id            TEXT PRIMARY KEY,
  action        TEXT            NOT NULL,   -- 'withdrawal.approve', 'adjustment.create', ...
  subject_type  TEXT            NOT NULL,   -- 'withdrawal' | 'user' | 'economy_rule'
  subject_id    TEXT            NOT NULL,
  payload       JSONB           NOT NULL DEFAULT '{}'::jsonb,
  requested_by  TEXT            NOT NULL REFERENCES admin_user(id),
  requested_at  TIMESTAMPTZ     NOT NULL DEFAULT now(),
  reason        TEXT            NOT NULL,
  status        approval_status NOT NULL DEFAULT 'PENDING',
  decided_by    TEXT            REFERENCES admin_user(id),
  decided_at    TIMESTAMPTZ,
  decision_note TEXT,
  executed_at   TIMESTAMPTZ,

  -- THE separation-of-duties guarantee. No role, no seniority, no emergency
  -- exempts anyone from it: the requester cannot be the decider.
  CONSTRAINT approval_no_self_approval CHECK (decided_by IS NULL OR decided_by <> requested_by),
  CONSTRAINT approval_decided_has_decider
    CHECK (status = 'PENDING' OR status = 'EXPIRED' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT approval_executed_was_approved
    CHECK (status <> 'EXECUTED' OR executed_at IS NOT NULL),
  CONSTRAINT approval_reason CHECK (length(btrim(reason)) > 0)
);

CREATE INDEX approval_pending_idx ON approval_request (action, requested_at)
  WHERE status = 'PENDING';

CREATE TRIGGER approval_request_no_delete
  BEFORE DELETE ON approval_request
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

-- --- Emergency controls ------------------------------------------------------
--
-- Independent switches, per section 30. Each is separately togglable so that
-- stopping withdrawals does not also stop people playing, and stopping cash
-- matches does not stop free play.

CREATE TABLE platform_control (
  key         TEXT PRIMARY KEY,
  enabled     BOOLEAN     NOT NULL,
  changed_by  TEXT        REFERENCES admin_user(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason      TEXT
);

INSERT INTO platform_control (key, enabled, reason) VALUES
  ('REGISTRATION',     TRUE,  'default'),
  ('MATCHMAKING',      TRUE,  'default'),
  ('CASH_MATCHES',     FALSE, 'off until licensing and compliance are in place'),
  ('TOURNAMENTS',      TRUE,  'default'),
  ('DEPOSITS',         FALSE, 'off until payment integration is production-ready'),
  ('WITHDRAWALS',      FALSE, 'off until payment integration is production-ready'),
  ('PROMOTIONS',       FALSE, 'default'),
  ('REGIONS',          TRUE,  'default'),
  ('MAINTENANCE',      FALSE, 'default: not in maintenance'),
  ('GLOBAL_EMERGENCY', FALSE, 'default: not in emergency');

CREATE TABLE platform_control_change (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key        TEXT        NOT NULL,
  from_value BOOLEAN,
  to_value   BOOLEAN     NOT NULL,
  changed_by TEXT        REFERENCES admin_user(id),
  reason     TEXT        NOT NULL,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER platform_control_change_immutable
  BEFORE UPDATE OR DELETE ON platform_control_change
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

/** Every toggle is recorded. There is no silent flip. */
CREATE FUNCTION platform_control_log() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.enabled IS DISTINCT FROM NEW.enabled THEN
    -- The reason must be FRESH. Requiring merely "not empty" is toothless: an
    -- UPDATE that does not touch the column inherits the previous reason and
    -- sails through, so an operator could flip a switch carrying a note that
    -- described some earlier decision entirely.
    IF NEW.reason IS NULL OR length(btrim(NEW.reason)) = 0
       OR NEW.reason IS NOT DISTINCT FROM OLD.reason THEN
      RAISE EXCEPTION
        'changing control % requires a new reason (the previous one does not carry over)', NEW.key
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.changed_by IS NULL THEN
      RAISE EXCEPTION 'changing control % requires a named actor', NEW.key
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO platform_control_change (key, from_value, to_value, changed_by, reason)
    VALUES (NEW.key, OLD.enabled, NEW.enabled, NEW.changed_by, NEW.reason);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER platform_control_audit
  BEFORE UPDATE ON platform_control
  FOR EACH ROW EXECUTE FUNCTION platform_control_log();

/**
 * Is this capability currently live?
 *
 * GLOBAL_EMERGENCY dominates everything except MAINTENANCE reporting -- a
 * single switch has to be able to stop the world without an operator needing
 * to remember ten others under pressure.
 */
CREATE FUNCTION control_enabled(p_key TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_key = 'GLOBAL_EMERGENCY'
      THEN (SELECT enabled FROM platform_control WHERE key = 'GLOBAL_EMERGENCY')
    WHEN (SELECT enabled FROM platform_control WHERE key = 'GLOBAL_EMERGENCY')
      THEN FALSE
    ELSE COALESCE((SELECT enabled FROM platform_control WHERE key = p_key), FALSE)
  END;
$$;

-- --- Admin audit -------------------------------------------------------------

CREATE TABLE admin_audit (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id   TEXT        REFERENCES admin_user(id),
  action     TEXT        NOT NULL,
  decision   TEXT        NOT NULL,        -- ALLOW | DENY | REQUIRE_APPROVAL | REQUIRE_STEP_UP
  subject_type TEXT,
  subject_id TEXT,
  detail     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  ip         TEXT,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER admin_audit_immutable
  BEFORE UPDATE OR DELETE ON admin_audit
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE INDEX admin_audit_admin_idx ON admin_audit (admin_id, at DESC);
CREATE INDEX admin_audit_action_idx ON admin_audit (action, at DESC);
-- =============================================================================
-- 0007_payments.sql
--
-- Deposits, withdrawals, payout addresses, and the provider webhook inbox.
--
-- The governing rule from the payment architecture:
--
--     A WEBHOOK IS A NOTIFICATION TO GO LOOK. IT IS NEVER THE REASON WE CREDIT.
--
-- So the schema keeps the provider's claim (provider_event) strictly separate
-- from what we independently observed on-chain (deposit.*_observed), and a
-- deposit can only be credited from the latter.
--
-- The withdrawal state machine is enforced by a trigger, not by application
-- code, so an illegal transition is impossible rather than merely unlikely.
-- =============================================================================

-- --- Provider webhook inbox --------------------------------------------------
-- Raw, append-only, and stored BEFORE anything is interpreted. If a provider
-- later disputes what it sent, this is the record.

CREATE TABLE provider_event (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider          TEXT        NOT NULL,
  provider_event_id TEXT        NOT NULL,
  event_type        TEXT,
  signature_ok      BOOLEAN     NOT NULL,
  payload           JSONB       NOT NULL,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at      TIMESTAMPTZ,
  outcome           TEXT,

  -- Replay protection by construction: a duplicate delivery collides here and
  -- the handler returns the original outcome instead of acting twice.
  CONSTRAINT provider_event_unique UNIQUE (provider, provider_event_id)
);

CREATE TRIGGER provider_event_immutable_payload
  BEFORE DELETE ON provider_event
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE INDEX provider_event_unprocessed_idx
  ON provider_event (received_at) WHERE processed_at IS NULL;

-- --- Deposits ----------------------------------------------------------------

CREATE TYPE deposit_status AS ENUM (
  'INITIATED', 'AWAITING_PAYMENT', 'DETECTED', 'CONFIRMING', 'VERIFIED',
  'SCREENED', 'CREDITED', 'EXPIRED', 'UNDERPAID', 'OVERPAID',
  'WRONG_ASSET', 'WRONG_NETWORK', 'QUARANTINED'
);

CREATE TABLE deposit (
  id                 TEXT PRIMARY KEY,
  player_id          TEXT           NOT NULL REFERENCES player(id),
  asset              TEXT           NOT NULL REFERENCES asset(code),
  network            TEXT           NOT NULL,
  provider           TEXT           NOT NULL,
  provider_ref       TEXT,
  address            TEXT           NOT NULL,
  status             deposit_status NOT NULL DEFAULT 'INITIATED',

  -- What the CHAIN said, observed by us. Never copied from a webhook.
  observed_tx_hash      TEXT,
  observed_output_index INT,
  observed_amount_minor BIGINT,
  observed_asset        TEXT,
  observed_network      TEXT,
  confirmations         INT NOT NULL DEFAULT 0,

  credited_tx_id     BIGINT REFERENCES ledger_transaction(id),
  quarantine_reason  TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ NOT NULL,
  credited_at        TIMESTAMPTZ,

  -- One credit per on-chain output, forever. This is the structural answer to
  -- "double deposit" and to a replayed webhook that slipped past every other
  -- guard: the second attempt cannot create a row.
  CONSTRAINT deposit_one_credit_per_output
    UNIQUE (observed_network, observed_tx_hash, observed_output_index),

  CONSTRAINT deposit_credited_has_ledger
    CHECK (status <> 'CREDITED' OR (credited_tx_id IS NOT NULL AND credited_at IS NOT NULL)),
  -- A deposit may only be credited for what was actually observed on-chain,
  -- in the asset and network we expected.
  CONSTRAINT deposit_credited_was_verified
    CHECK (status <> 'CREDITED' OR (
      observed_tx_hash IS NOT NULL AND observed_amount_minor > 0
      AND observed_asset = asset AND observed_network = network
    ))
);

CREATE INDEX deposit_player_idx ON deposit (player_id, created_at DESC);
CREATE INDEX deposit_address_idx ON deposit (address);
CREATE INDEX deposit_pending_idx ON deposit (status) WHERE status NOT IN ('CREDITED','EXPIRED');

-- --- Payout addresses --------------------------------------------------------
-- Allowlisted, and time-locked on addition. An attacker who takes over an
-- account cannot add their own address and drain it in the same session.

CREATE TABLE payout_address (
  id          TEXT PRIMARY KEY,
  player_id   TEXT        NOT NULL REFERENCES player(id),
  asset       TEXT        NOT NULL REFERENCES asset(code),
  network     TEXT        NOT NULL,
  address     TEXT        NOT NULL,
  label       TEXT,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  usable_from TIMESTAMPTZ NOT NULL,
  removed_at  TIMESTAMPTZ,

  CONSTRAINT payout_address_unique UNIQUE (player_id, network, address),
  CONSTRAINT payout_address_timelock CHECK (usable_from > added_at)
);

CREATE FUNCTION payout_address_usable(p_player_id TEXT, p_network TEXT, p_address TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM payout_address
     WHERE player_id = p_player_id AND network = p_network AND address = p_address
       AND removed_at IS NULL AND usable_from <= now()
  );
$$;

-- --- Withdrawals -------------------------------------------------------------

CREATE TYPE withdrawal_status AS ENUM (
  'REQUESTED', 'VALIDATING', 'RISK_CHECK', 'PENDING_REVIEW', 'APPROVED',
  'PROCESSING', 'BROADCASTED', 'CONFIRMED', 'COMPLETED',
  'FAILED', 'REJECTED', 'CANCELLED'
);

CREATE TABLE withdrawal (
  id                  TEXT PRIMARY KEY,
  player_id           TEXT              NOT NULL REFERENCES player(id),
  asset               TEXT              NOT NULL REFERENCES asset(code),
  network             TEXT              NOT NULL,
  destination         TEXT              NOT NULL,
  amount_minor        BIGINT            NOT NULL,
  fee_minor           BIGINT            NOT NULL DEFAULT 0,
  status              withdrawal_status NOT NULL DEFAULT 'REQUESTED',

  -- Funds are locked at REQUESTED, so the same balance cannot also fund a duel
  -- or a second withdrawal while this one is pending.
  lock_tx_id          BIGINT REFERENCES ledger_transaction(id),
  settle_tx_id        BIGINT REFERENCES ledger_transaction(id),
  approval_request_id TEXT REFERENCES approval_request(id),
  provider            TEXT,
  provider_ref        TEXT,
  tx_hash             TEXT,
  risk_score          INT,
  failure_reason      TEXT,
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,

  CONSTRAINT withdrawal_amount_positive CHECK (amount_minor > 0),
  CONSTRAINT withdrawal_fee_not_negative CHECK (fee_minor >= 0),
  -- Money must have been locked before any state that implies it will move.
  CONSTRAINT withdrawal_moving_states_are_locked
    CHECK (status IN ('REQUESTED','CANCELLED','REJECTED') OR lock_tx_id IS NOT NULL),
  CONSTRAINT withdrawal_completed_has_ledger
    CHECK (status <> 'COMPLETED' OR (settle_tx_id IS NOT NULL AND completed_at IS NOT NULL)),
  -- A broadcast without a transaction hash is a payout nobody can trace.
  CONSTRAINT withdrawal_broadcast_has_hash
    CHECK (status NOT IN ('BROADCASTED','CONFIRMED','COMPLETED') OR tx_hash IS NOT NULL),
  -- Idempotent broadcast: one on-chain payout per withdrawal, never two.
  CONSTRAINT withdrawal_one_tx_per_payout UNIQUE (network, tx_hash)
);

CREATE INDEX withdrawal_player_idx ON withdrawal (player_id, requested_at DESC);
CREATE INDEX withdrawal_queue_idx ON withdrawal (status, requested_at)
  WHERE status IN ('REQUESTED','VALIDATING','RISK_CHECK','PENDING_REVIEW','APPROVED','PROCESSING');

-- --- The state machine, enforced ---------------------------------------------

CREATE TABLE withdrawal_transition (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  withdrawal_id TEXT              NOT NULL REFERENCES withdrawal(id),
  from_status   withdrawal_status,
  to_status     withdrawal_status NOT NULL,
  actor_type    TEXT              NOT NULL,   -- SYSTEM | ADMIN | USER
  actor_id      TEXT,
  reason        TEXT,
  at            TIMESTAMPTZ       NOT NULL DEFAULT now()
);

CREATE TRIGGER withdrawal_transition_immutable
  BEFORE UPDATE OR DELETE ON withdrawal_transition
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE INDEX withdrawal_transition_idx ON withdrawal_transition (withdrawal_id, id);

/** The only legal moves. Anything not listed here cannot happen. */
CREATE FUNCTION withdrawal_transition_allowed(
  p_from withdrawal_status, p_to withdrawal_status
) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT (p_from, p_to) IN (
    ('REQUESTED','VALIDATING'), ('REQUESTED','CANCELLED'),
    ('VALIDATING','RISK_CHECK'), ('VALIDATING','REJECTED'), ('VALIDATING','FAILED'),
    ('RISK_CHECK','PENDING_REVIEW'), ('RISK_CHECK','APPROVED'), ('RISK_CHECK','REJECTED'),
    ('PENDING_REVIEW','APPROVED'), ('PENDING_REVIEW','REJECTED'),
    ('APPROVED','PROCESSING'), ('APPROVED','REJECTED'),
    ('PROCESSING','BROADCASTED'), ('PROCESSING','FAILED'),
    ('BROADCASTED','CONFIRMED'), ('BROADCASTED','FAILED'),
    ('CONFIRMED','COMPLETED')
  );
$$;

CREATE FUNCTION withdrawal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT withdrawal_transition_allowed(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'illegal withdrawal transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO withdrawal_transition (withdrawal_id, from_status, to_status, actor_type, actor_id)
    VALUES (NEW.id, OLD.status, NEW.status, 'SYSTEM', NULL);
  END IF;

  -- The amount and destination of a withdrawal are fixed at request time.
  -- Allowing either to change after approval would make the approval
  -- meaningless: an approver signs off on a specific payout, not on a row.
  IF OLD.amount_minor IS DISTINCT FROM NEW.amount_minor
     OR OLD.destination IS DISTINCT FROM NEW.destination
     OR OLD.player_id IS DISTINCT FROM NEW.player_id THEN
    RAISE EXCEPTION 'a withdrawal amount, destination and owner are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER withdrawal_state_machine
  BEFORE UPDATE ON withdrawal
  FOR EACH ROW EXECUTE FUNCTION withdrawal_guard();

CREATE TRIGGER withdrawal_no_delete
  BEFORE DELETE ON withdrawal
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE FUNCTION withdrawal_log_initial() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO withdrawal_transition (withdrawal_id, from_status, to_status, actor_type, actor_id)
  VALUES (NEW.id, NULL, NEW.status, 'USER', NEW.player_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER withdrawal_initial_transition
  AFTER INSERT ON withdrawal
  FOR EACH ROW EXECUTE FUNCTION withdrawal_log_initial();

-- --- Solvency guard ----------------------------------------------------------

/**
 * Would paying this out leave us unable to cover what we owe?
 *
 * Checked before every payout batch. If custody does not cover liabilities the
 * platform is insolvent for that asset and no further payouts may leave.
 */
CREATE FUNCTION payout_would_keep_solvent(p_asset TEXT, p_amount_minor BIGINT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT custody_held - p_amount_minor >= user_liabilities - p_amount_minor
       FROM ledger_solvency WHERE asset = p_asset),
    FALSE
  );
$$;
-- =============================================================================
-- 0008_compliance.sql
--
-- The market matrix, KYC tiers, sanctions screening, self-exclusion, and
-- responsible-competition limits.
--
-- THE DEFAULT POSTURE, which everything else depends on:
--
--   Every jurisdiction that is not explicitly listed is UNDETERMINED, and an
--   UNDETERMINED jurisdiction gets FREE PLAY ONLY. There is no default-
--   permitted state and no code path that treats an unlisted country as
--   allowed. A market becomes real-money eligible only by an explicit,
--   counsel-backed, audited row.
--
-- NOTE ON SEEDING: this migration deliberately inserts NO markets. Which
-- jurisdictions permit paid skill contests is a legal determination, not an
-- engineering one, and encoding a guess here would be worse than encoding
-- nothing -- a wrong "PERMITTED" row is the single most expensive mistake this
-- system can make. The table ships empty and fails closed.
--
-- SUB-NATIONAL GRANULARITY is present from day one because retrofitting it
-- into a country-keyed table is a rewrite: several US states, Indian states
-- and Canadian provinces differ from their national position.
-- =============================================================================

CREATE TYPE legal_status AS ENUM ('PERMITTED', 'RESTRICTED', 'PROHIBITED', 'UNDETERMINED');
CREATE TYPE geo_rule     AS ENUM ('ALLOW', 'BLOCK', 'ALLOW_FREE_PLAY_ONLY');
CREATE TYPE launch_status AS ENUM ('LIVE', 'PILOT', 'PLANNED', 'BLOCKED');
CREATE TYPE kyc_tier     AS ENUM ('TIER_0', 'TIER_1', 'TIER_2', 'TIER_3');
CREATE TYPE product      AS ENUM ('FREE_PLAY', 'RANKED', 'CASH_DUEL', 'CASH_TOURNAMENT');

CREATE TABLE market (
  country_code   CHAR(2)       NOT NULL,
  -- '*' means "the whole country". A specific region row overrides it, which is
  -- how US-CA can differ from US, or IN-TN from IN.
  region_code    TEXT          NOT NULL DEFAULT '*',
  legal_status   legal_status  NOT NULL DEFAULT 'UNDETERMINED',
  allowed_products product[]   NOT NULL DEFAULT ARRAY['FREE_PLAY']::product[],
  real_money_eligible BOOLEAN  NOT NULL DEFAULT FALSE,
  crypto_eligible     BOOLEAN  NOT NULL DEFAULT FALSE,
  minimum_age    SMALLINT      NOT NULL DEFAULT 18,
  kyc_requirement kyc_tier     NOT NULL DEFAULT 'TIER_0',
  geo_rule       geo_rule      NOT NULL DEFAULT 'ALLOW_FREE_PLAY_ONLY',
  launch_status  launch_status NOT NULL DEFAULT 'BLOCKED',
  licence_ref    TEXT,
  reviewed_by    TEXT,
  reviewed_at    TIMESTAMPTZ,
  notes          TEXT,
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),

  PRIMARY KEY (country_code, region_code),

  -- Real money requires an affirmative legal position AND a named reviewer.
  -- "We think it is probably fine" cannot be represented in this table.
  CONSTRAINT market_real_money_needs_review
    CHECK (real_money_eligible = FALSE
           OR (legal_status = 'PERMITTED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CONSTRAINT market_real_money_needs_kyc
    CHECK (real_money_eligible = FALSE OR kyc_requirement >= 'TIER_1'),
  CONSTRAINT market_prohibited_is_blocked
    CHECK (legal_status <> 'PROHIBITED' OR (geo_rule = 'BLOCK' AND real_money_eligible = FALSE)),
  CONSTRAINT market_age_sane CHECK (minimum_age BETWEEN 16 AND 25)
);

CREATE TABLE market_change (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  country_code CHAR(2)     NOT NULL,
  region_code  TEXT        NOT NULL,
  before_state JSONB,
  after_state  JSONB       NOT NULL,
  changed_by   TEXT        NOT NULL,
  reason       TEXT        NOT NULL,
  at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER market_change_immutable
  BEFORE UPDATE OR DELETE ON market_change
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

/**
 * Resolve the policy for a location.
 *
 * A region row wins over its country's row. An unlisted location resolves to
 * the closed default rather than to nothing, so a caller that forgets to
 * handle "not found" still fails safe.
 */
CREATE FUNCTION market_resolve(p_country CHAR(2), p_region TEXT DEFAULT NULL)
RETURNS TABLE (
  country_code CHAR(2), region_code TEXT, legal_status legal_status,
  allowed_products TEXT[], real_money_eligible BOOLEAN, crypto_eligible BOOLEAN,
  minimum_age SMALLINT, kyc_requirement kyc_tier, geo_rule geo_rule,
  launch_status launch_status, resolved_from TEXT
) LANGUAGE plpgsql STABLE AS $$
BEGIN
  -- Most specific first: a region row outranks its country's row.
  RETURN QUERY
    SELECT m.country_code, m.region_code, m.legal_status, m.allowed_products::TEXT[],
           m.real_money_eligible, m.crypto_eligible, m.minimum_age,
           m.kyc_requirement, m.geo_rule, m.launch_status,
           (CASE WHEN m.region_code = '*' THEN 'COUNTRY' ELSE 'REGION' END)::TEXT
      FROM market m
     WHERE m.country_code = p_country
       AND (m.region_code = COALESCE(p_region, '*') OR m.region_code = '*')
     ORDER BY (m.region_code <> '*') DESC
     LIMIT 1;

  -- Nothing matched. Return the CLOSED default rather than no row at all, so a
  -- caller that forgets to handle "not found" still fails safe.
  IF NOT FOUND THEN
    RETURN QUERY
      SELECT p_country, COALESCE(p_region, '*'), 'UNDETERMINED'::legal_status,
             ARRAY['FREE_PLAY']::TEXT[], FALSE, FALSE, 18::SMALLINT,
             'TIER_0'::kyc_tier, 'ALLOW_FREE_PLAY_ONLY'::geo_rule,
             'BLOCKED'::launch_status, 'DEFAULT'::TEXT;
  END IF;
END;
$$;

-- --- Where a player belongs --------------------------------------------------
-- The HOME market governs eligibility, not the current IP. A traveller does not
-- gain or lose rights by boarding a plane; a mismatch is a review signal.

CREATE TABLE player_jurisdiction (
  player_id     TEXT PRIMARY KEY REFERENCES player(id),
  country_code  CHAR(2)     NOT NULL,
  region_code   TEXT        NOT NULL DEFAULT '*',
  source        TEXT        NOT NULL,        -- 'KYC' | 'DECLARED' | 'PAYMENT' | 'IP'
  determined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked        BOOLEAN     NOT NULL DEFAULT FALSE
);

-- --- KYC ---------------------------------------------------------------------

CREATE TYPE kyc_status AS ENUM ('NONE', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

CREATE TABLE kyc_verification (
  player_id    TEXT PRIMARY KEY REFERENCES player(id),
  tier         kyc_tier    NOT NULL DEFAULT 'TIER_0',
  status       kyc_status  NOT NULL DEFAULT 'NONE',
  provider     TEXT,
  provider_ref TEXT,
  -- Date of birth only; never the document itself. KYC artefacts live in
  -- separate encrypted storage with their own access control and retention
  -- clock, and must never sit in an application table.
  date_of_birth DATE,
  country_code CHAR(2),
  verified_at  TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT kyc_verified_has_timestamp
    CHECK (status <> 'VERIFIED' OR (verified_at IS NOT NULL AND tier >= 'TIER_1'))
);

CREATE FUNCTION kyc_effective_tier(p_player_id TEXT) RETURNS kyc_tier
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT CASE
       WHEN k.status = 'VERIFIED' AND (k.expires_at IS NULL OR k.expires_at > now())
         THEN k.tier ELSE 'TIER_0'::kyc_tier END
       FROM kyc_verification k WHERE k.player_id = p_player_id),
    'TIER_0'::kyc_tier);
$$;

CREATE FUNCTION player_age_years(p_player_id TEXT) RETURNS INT LANGUAGE sql STABLE AS $$
  SELECT EXTRACT(YEAR FROM age(now(), k.date_of_birth))::INT
    FROM kyc_verification k WHERE k.player_id = p_player_id AND k.date_of_birth IS NOT NULL;
$$;

-- --- Sanctions ---------------------------------------------------------------

CREATE TABLE sanctions_check (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id  TEXT        NOT NULL REFERENCES player(id),
  provider   TEXT        NOT NULL,
  clear      BOOLEAN     NOT NULL,
  is_pep     BOOLEAN     NOT NULL DEFAULT FALSE,
  detail     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER sanctions_check_immutable
  BEFORE UPDATE OR DELETE ON sanctions_check
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE INDEX sanctions_check_player_idx ON sanctions_check (player_id, checked_at DESC);

/** Latest screening result. A player never screened is NOT clear. */
CREATE FUNCTION sanctions_clear(p_player_id TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT s.clear FROM sanctions_check s
      WHERE s.player_id = p_player_id ORDER BY s.checked_at DESC LIMIT 1),
    FALSE);
$$;

-- --- Responsible competition -------------------------------------------------

CREATE TYPE limit_kind AS ENUM ('DEPOSIT_DAILY', 'DEPOSIT_WEEKLY', 'DEPOSIT_MONTHLY',
                                'LOSS_DAILY', 'SESSION_MINUTES', 'STAKE_MAX');

CREATE TABLE responsible_limit (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id      TEXT        NOT NULL REFERENCES player(id),
  kind           limit_kind  NOT NULL,
  value_minor    BIGINT      NOT NULL,
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A tightening takes effect NOW. A loosening waits out a cooling-off period,
  -- so a player cannot raise their own limit in the moment they most want to.
  effective_from TIMESTAMPTZ NOT NULL,
  superseded_at  TIMESTAMPTZ,

  CONSTRAINT responsible_limit_value CHECK (value_minor >= 0)
);

CREATE TRIGGER responsible_limit_no_delete
  BEFORE DELETE ON responsible_limit
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE INDEX responsible_limit_active_idx ON responsible_limit (player_id, kind, effective_from DESC);

CREATE FUNCTION responsible_limit_current(p_player_id TEXT, p_kind limit_kind)
RETURNS BIGINT LANGUAGE sql STABLE AS $$
  SELECT l.value_minor FROM responsible_limit l
   WHERE l.player_id = p_player_id AND l.kind = p_kind
     AND l.effective_from <= now() AND l.superseded_at IS NULL
   ORDER BY l.effective_from DESC LIMIT 1;
$$;

-- --- Self-exclusion ----------------------------------------------------------

CREATE TABLE self_exclusion (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id  TEXT        NOT NULL REFERENCES player(id),
  permanent  BOOLEAN     NOT NULL DEFAULT FALSE,
  starts_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at    TIMESTAMPTZ,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A permanent exclusion has no end. Allowing one to be given an end date is
  -- how "permanent" quietly becomes "until someone edits a row".
  CONSTRAINT self_exclusion_permanent_has_no_end
    CHECK (permanent = FALSE OR ends_at IS NULL),
  CONSTRAINT self_exclusion_temporary_has_end
    CHECK (permanent = TRUE OR ends_at IS NOT NULL)
);

CREATE TRIGGER self_exclusion_immutable
  BEFORE UPDATE OR DELETE ON self_exclusion
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

/**
 * Is this player excluded?
 *
 * Checked across the DEVICE GRAPH, not just the account. A self-exclusion that
 * a new signup on the same device can walk around is theatre, and in most
 * regulated markets it is also a licence condition that it not be.
 */
CREATE FUNCTION self_excluded(p_player_id TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM self_exclusion e
     WHERE e.player_id = p_player_id
       AND e.starts_at <= now()
       AND (e.permanent OR e.ends_at > now())
  ) OR EXISTS (
    SELECT 1
      FROM device d_self
      JOIN device d_other ON d_other.fingerprint = d_self.fingerprint
      JOIN self_exclusion e ON e.player_id = d_other.player_id
     WHERE d_self.player_id = p_player_id
       AND d_other.player_id <> p_player_id
       AND e.starts_at <= now()
       AND (e.permanent OR e.ends_at > now())
  );
$$;

-- --- Skill-vs-chance evidence ------------------------------------------------
--
-- The entire real-money thesis rests on these being games of SKILL, which is
-- decided differently in every jurisdiction. The evidence is that outcomes
-- correlate with rating and improve with practice -- which is a data product,
-- and one that cannot be reconstructed retroactively. So it is recorded from
-- the first free-play duel, long before anyone needs it.

CREATE TABLE skill_evidence (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id           TEXT        NOT NULL REFERENCES game(id),
  duel_id           TEXT        NOT NULL REFERENCES duel(id),
  higher_rated_won  BOOLEAN,
  rating_gap_x100   INT         NOT NULL,
  was_draw          BOOLEAN     NOT NULL DEFAULT FALSE,
  winner_games_played INT,
  loser_games_played  INT,
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT skill_evidence_one_per_duel UNIQUE (duel_id)
);

CREATE INDEX skill_evidence_game_idx ON skill_evidence (game_id, rating_gap_x100);

/**
 * The headline number for a skill argument: how often does the stronger player
 * win, as the rating gap widens? In a game of chance this is flat at 50%.
 */
CREATE VIEW skill_correlation AS
SELECT
  game_id,
  width_bucket(rating_gap_x100, 0, 40000, 8) AS gap_bucket,
  count(*)::INT AS duels,
  round(100.0 * count(*) FILTER (WHERE higher_rated_won) /
        NULLIF(count(*) FILTER (WHERE NOT was_draw), 0), 1) AS higher_rated_win_pct
FROM skill_evidence
WHERE NOT was_draw
GROUP BY game_id, gap_bucket;
-- =============================================================================
-- 0009_risk_and_fairplay.sql
--
-- Signals, risk scores, cases, decisions, appeals, and the collusion graph.
--
-- THE RULE THIS SCHEMA EXISTS TO ENFORCE:
--
--     Signals -> Risk -> Evidence -> Case -> Review -> Decision -> Appeal
--
-- and, specifically, NEVER one signal = ban. That is not a guideline here: a
-- statistical category is structurally incapable of being auto-actioned, by
-- CHECK constraint. Only a narrow list of physically-certain categories may be
-- acted on without a human, and widening that list requires a migration that a
-- reviewer will see.
-- =============================================================================

CREATE TYPE signal_kind AS ENUM (
  'TIMING', 'ENGINE_CORRELATION', 'ACCURACY', 'INPUT_BIOMETRIC',
  'AUTOMATION', 'IMPOSSIBLE_INPUT', 'PROTOCOL_VIOLATION',
  'DEVICE_RELATIONSHIP', 'ACCOUNT_RELATIONSHIP', 'VALUE_FLOW',
  'PAIRING_ANOMALY', 'PERFORMANCE_ANOMALY', 'NETWORK'
);

CREATE TYPE case_category AS ENUM (
  'ENGINE_ASSISTANCE', 'AUTOMATION', 'COLLUSION', 'MULTI_ACCOUNT',
  'IMPOSSIBLE_INPUT', 'PROTOCOL_VIOLATION', 'CONFIRMED_SELF_PLAY',
  'PAYMENT_FRAUD', 'OTHER'
);

CREATE TYPE case_status AS ENUM (
  'OPEN', 'UNDER_REVIEW', 'DECIDED', 'APPEALED', 'APPEAL_DECIDED', 'CLOSED_NO_ACTION'
);

CREATE TYPE sanction AS ENUM (
  'NONE', 'WARNING', 'RATING_CORRECTION', 'DUEL_VOID',
  'CASH_RESTRICTION', 'ACCOUNT_RESTRICTION', 'ACCOUNT_CLOSURE'
);

-- --- Signals (append-only evidence, never verdicts) --------------------------

CREATE TABLE fairplay_signal (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id        TEXT        NOT NULL REFERENCES player(id),
  duel_id          TEXT        REFERENCES duel(id),
  game_id          TEXT        REFERENCES game(id),
  detector         TEXT        NOT NULL,
  detector_version INT         NOT NULL,
  kind             signal_kind NOT NULL,
  -- How anomalous, and how much we trust the measurement. Both are needed:
  -- a very strange reading from a tiny sample is not evidence of anything.
  strength         NUMERIC(4,3) NOT NULL,
  confidence       NUMERIC(4,3) NOT NULL,
  observed         JSONB       NOT NULL,
  baseline         JSONB       NOT NULL,
  -- Mandatory. A signal a reviewer cannot understand will produce an
  -- unjustifiable sanction, which is worse for the business than the cheating.
  explanation      TEXT        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT signal_strength_range CHECK (strength BETWEEN 0 AND 1),
  CONSTRAINT signal_confidence_range CHECK (confidence BETWEEN 0 AND 1),
  CONSTRAINT signal_has_explanation CHECK (length(btrim(explanation)) >= 20)
);

CREATE TRIGGER fairplay_signal_immutable
  BEFORE UPDATE OR DELETE ON fairplay_signal
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE INDEX fairplay_signal_player_idx ON fairplay_signal (player_id, created_at DESC);
CREATE INDEX fairplay_signal_duel_idx ON fairplay_signal (duel_id);

-- --- Risk scores -------------------------------------------------------------
-- Separate dimensions, per the risk architecture. A payment risk of 90 must not
-- silently become a game-integrity accusation.

CREATE TYPE risk_dimension AS ENUM (
  'ACCOUNT', 'PAYMENT', 'WITHDRAWAL', 'GAME', 'ANTI_CHEAT', 'COLLUSION', 'DEVICE'
);

CREATE TABLE risk_score (
  player_id   TEXT           NOT NULL REFERENCES player(id),
  dimension   risk_dimension NOT NULL,
  score       INT            NOT NULL,
  -- The factors that produced the score, so it can be explained to a reviewer,
  -- to the player, and if necessary to a regulator. An unexplainable score is
  -- not usable as a reason for anything.
  factors     JSONB          NOT NULL DEFAULT '[]'::jsonb,
  computed_at TIMESTAMPTZ    NOT NULL DEFAULT now(),

  PRIMARY KEY (player_id, dimension),
  CONSTRAINT risk_score_range CHECK (score BETWEEN 0 AND 100),
  CONSTRAINT risk_score_explainable CHECK (jsonb_array_length(factors) > 0 OR score = 0)
);

CREATE TABLE risk_score_history (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id   TEXT           NOT NULL,
  dimension   risk_dimension NOT NULL,
  score       INT            NOT NULL,
  factors     JSONB          NOT NULL,
  computed_at TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE TRIGGER risk_score_history_immutable
  BEFORE UPDATE OR DELETE ON risk_score_history
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

-- --- Cases -------------------------------------------------------------------

CREATE TABLE fairplay_case (
  id             TEXT          PRIMARY KEY,
  player_id      TEXT          NOT NULL REFERENCES player(id),
  category       case_category NOT NULL,
  status         case_status   NOT NULL DEFAULT 'OPEN',
  risk_score     INT           NOT NULL,
  -- TRUE only for categories where the finding is physically certain rather
  -- than statistical. See the constraint below.
  auto_actioned  BOOLEAN       NOT NULL DEFAULT FALSE,
  opened_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  decided_by     TEXT          REFERENCES admin_user(id),
  decided_at     TIMESTAMPTZ,
  decision       sanction,
  decision_note  TEXT,
  funds_held     BOOLEAN       NOT NULL DEFAULT FALSE,
  closed_at      TIMESTAMPTZ,

  CONSTRAINT case_risk_range CHECK (risk_score BETWEEN 0 AND 100),

  -- ============================================================
  -- NEVER ONE SIGNAL = BAN, made structural.
  --
  -- Anything statistical -- engine correlation, automation patterns, collusion
  -- graphs, behavioural anomalies -- requires a human. Only findings that are
  -- physically certain may be actioned automatically.
  -- ============================================================
  CONSTRAINT case_auto_action_only_for_certain_categories
    CHECK (auto_actioned = FALSE
           OR category IN ('IMPOSSIBLE_INPUT', 'PROTOCOL_VIOLATION', 'CONFIRMED_SELF_PLAY')),

  -- A decision needs a decider, and a sanction needs a stated reason.
  CONSTRAINT case_decided_has_decider
    CHECK (status NOT IN ('DECIDED','APPEAL_DECIDED')
           OR (decision IS NOT NULL AND decided_at IS NOT NULL
               AND (auto_actioned OR decided_by IS NOT NULL))),
  CONSTRAINT case_sanction_has_note
    CHECK (decision IS NULL OR decision = 'NONE' OR length(btrim(COALESCE(decision_note,''))) > 0)
);

CREATE INDEX fairplay_case_open_idx ON fairplay_case (opened_at)
  WHERE status IN ('OPEN','UNDER_REVIEW','APPEALED');
CREATE INDEX fairplay_case_player_idx ON fairplay_case (player_id, opened_at DESC);

/** The immutable evidence bundle. A case is only as good as what it snapshots. */
CREATE TABLE fairplay_case_signal (
  case_id   TEXT   NOT NULL REFERENCES fairplay_case(id),
  signal_id BIGINT NOT NULL REFERENCES fairplay_signal(id),
  PRIMARY KEY (case_id, signal_id)
);

CREATE TRIGGER fairplay_case_signal_immutable
  BEFORE UPDATE OR DELETE ON fairplay_case_signal
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE TABLE fairplay_case_event (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id    TEXT        NOT NULL REFERENCES fairplay_case(id),
  event      TEXT        NOT NULL,
  actor_type TEXT        NOT NULL,
  actor_id   TEXT,
  detail     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER fairplay_case_event_immutable
  BEFORE UPDATE OR DELETE ON fairplay_case_event
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

-- --- Appeals -----------------------------------------------------------------

CREATE TABLE fairplay_appeal (
  id           TEXT        PRIMARY KEY,
  case_id      TEXT        NOT NULL REFERENCES fairplay_case(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  player_note  TEXT,
  reviewed_by  TEXT        REFERENCES admin_user(id),
  reviewed_at  TIMESTAMPTZ,
  upheld       BOOLEAN,
  reviewer_note TEXT,

  CONSTRAINT appeal_one_per_case UNIQUE (case_id),
  CONSTRAINT appeal_reviewed_has_reviewer
    CHECK (upheld IS NULL OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);

/**
 * An appeal must be reviewed by someone other than whoever decided the case.
 *
 * Enforced by trigger rather than CHECK because it spans two tables. Without
 * it, "appeal" means "ask the same person again", which is not an appeal.
 */
CREATE FUNCTION appeal_reviewer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_decider TEXT;
BEGIN
  IF NEW.reviewed_by IS NULL THEN RETURN NEW; END IF;
  SELECT decided_by INTO v_decider FROM fairplay_case WHERE id = NEW.case_id;
  IF v_decider IS NOT NULL AND v_decider = NEW.reviewed_by THEN
    RAISE EXCEPTION
      'an appeal must be reviewed by someone other than the admin who decided the case'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fairplay_appeal_independent_reviewer
  BEFORE INSERT OR UPDATE ON fairplay_appeal
  FOR EACH ROW EXECUTE FUNCTION appeal_reviewer_guard();

-- --- The relationship graph --------------------------------------------------

CREATE TYPE link_type AS ENUM (
  'SHARED_DEVICE', 'SHARED_NETWORK', 'SHARED_FUNDING',
  'REPEATED_PAIRING', 'VALUE_FLOW', 'REFERRAL'
);

CREATE TABLE account_link (
  player_a   TEXT      NOT NULL REFERENCES player(id),
  player_b   TEXT      NOT NULL REFERENCES player(id),
  link_type  link_type NOT NULL,
  strength   NUMERIC(4,3) NOT NULL,
  detail     JSONB     NOT NULL DEFAULT '{}'::jsonb,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (player_a, player_b, link_type),
  -- Stored in one direction only (a < b), so an edge cannot exist twice with
  -- its endpoints swapped and quietly double-count in the graph.
  CONSTRAINT account_link_canonical_order CHECK (player_a < player_b),
  CONSTRAINT account_link_strength_range CHECK (strength BETWEEN 0 AND 1)
);

CREATE INDEX account_link_b_idx ON account_link (player_b, link_type);

/**
 * How often did these two actually meet, and how often would we EXPECT them to?
 *
 * We control matchmaking, so the expected frequency is arithmetic rather than
 * suspicion: with N eligible players in a pool, any given pair should meet
 * roughly 1/(N-1) of the time. A pair meeting far more often than that is a
 * fact, not a hunch.
 */
CREATE FUNCTION pairing_frequency(p_a TEXT, p_b TEXT)
RETURNS TABLE (met INT, a_total INT, b_total INT) LANGUAGE sql STABLE AS $$
  SELECT
    (SELECT count(*)::INT FROM duel d
      WHERE (d.seat_0 = p_a AND d.seat_1 = p_b) OR (d.seat_0 = p_b AND d.seat_1 = p_a)),
    (SELECT count(*)::INT FROM duel d WHERE d.seat_0 = p_a OR d.seat_1 = p_a),
    (SELECT count(*)::INT FROM duel d WHERE d.seat_0 = p_b OR d.seat_1 = p_b);
$$;

/**
 * Net value moved between two players through settled cash duels.
 *
 * Persistently one-directional flow between a pair is the signature of chip
 * dumping -- which is also value transfer, and therefore an AML control as much
 * as a fair-play one.
 */
CREATE VIEW duel_value_flow AS
SELECT
  LEAST(d.seat_0, d.seat_1)    AS player_a,
  GREATEST(d.seat_0, d.seat_1) AS player_b,
  count(*)::INT                AS duels,
  sum(CASE
        WHEN d.result = '1-0' AND d.seat_0 = LEAST(d.seat_0, d.seat_1) THEN d.stake_minor
        WHEN d.result = '0-1' AND d.seat_1 = LEAST(d.seat_0, d.seat_1) THEN d.stake_minor
        ELSE -d.stake_minor
      END)::BIGINT             AS net_to_a
FROM duel d
WHERE d.status = 'SETTLED' AND d.tier = 'CASH' AND d.result <> '1/2-1/2'
GROUP BY 1, 2;
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
-- =============================================================================
-- 0011_global_skill.sql
--
-- The population-facing half of the Global Skill Score: where a player's
-- per-game rating sits relative to OTHER players of that same game.
--
-- Percentile, not raw rating, is what makes cross-game combination possible
-- at all -- a chess rating and a Speed Math rating are not on the same scale,
-- but "better than 80% of established chess players" and "better than 80% of
-- established Speed Math players" are directly comparable.
--
-- A game contributes NOTHING to the score until the rating is established
-- (reusing rating_is_established from 0003: RD <= 110, 10+ games). An
-- untested rating is not a fact about skill yet, and letting it into a
-- cross-game average would let a lucky first game distort the whole score.
-- =============================================================================

CREATE VIEW game_rating_percentile AS
SELECT
  r.player_id,
  r.game_id,
  r.rating_x100,
  r.rd_x100,
  r.games_played,
  -- Percentile among ESTABLISHED players of the SAME game only. A brand-new
  -- game with few established players will have a coarse distribution; that
  -- is honest, not a bug, and resolves itself as the population grows.
  PERCENT_RANK() OVER (
    PARTITION BY r.game_id
    ORDER BY r.rating_x100
  ) AS percentile
FROM rating r
WHERE rating_is_established(r.rd_x100, r.games_played);

COMMENT ON VIEW game_rating_percentile IS
  'Per-game percentile rank among established players of that game. '
  'Feeds the Global Skill Score; see packages/global-skill.';
-- =============================================================================
-- 0012_duel_lease.sql
--
-- A4: multiple realtime gateway instances must never concurrently believe
-- they own the same duel.
--
-- The lease lives on the `duel` row itself, not a separate table, because the
-- thing that must be atomic is "am I still the owner" checked at the exact
-- moment of the exact write that owner is about to make -- and that write
-- already touches this row. A separate lease table would need its own
-- cross-table transaction to get the same guarantee for no benefit.
--
-- `lease_token` is a classic fencing token (Kleppmann, "How to do distributed
-- locking"): it only ever goes up, and a write is valid only if it carries
-- the CURRENT token. A gateway that acquired the lease, then stalled long
-- enough for its lease to expire and be taken over, does not need to know
-- that happened -- the moment it tries to actually write, the token it is
-- carrying no longer matches, and the write is refused. No heartbeat can be
-- late enough to make that check wrong, because the check is not "was I
-- recently told I still own this" -- it is "does my token match, right now".
-- =============================================================================

ALTER TABLE duel
  ADD COLUMN lease_owner      TEXT,
  ADD COLUMN lease_token      BIGINT      NOT NULL DEFAULT 0,
  ADD COLUMN lease_expires_at TIMESTAMPTZ;

CREATE INDEX duel_lease_owner_idx ON duel (lease_owner) WHERE lease_owner IS NOT NULL;
-- =============================================================================
-- 0013_reconciliation.sql
--
-- Section 19 of the ledger spec, section 7 of the payment architecture doc:
-- reconciliation runs continuously at three levels (L1 internal, L2 provider,
-- L3 chain) plus a global solvency check, and any discrepancy produces
-- ALERT -> CASE -> REVIEW. Never a silent repair.
--
-- L1's comparison view (`ledger_balance_verification`) and the solvency view
-- (`ledger_solvency`) already existed (migration 0001) -- nothing has ever run
-- them on a schedule or turned a mismatch into anything a human could see.
-- This migration adds the two things that were missing: a record of each run
-- (so a run is idempotent, resumable, and observable rather than a fire-and-
-- forget script), and a case/event trail matching the SAME append-only
-- pattern already used for fair-play cases -- opened, reviewed, decided,
-- never silently closed by a repair.
-- =============================================================================

-- --- Runs ----------------------------------------------------------------

CREATE TYPE reconciliation_run_kind AS ENUM (
  'L1_LEDGER_DRIFT', 'SOLVENCY', 'STUCK_DEPOSITS', 'STUCK_WITHDRAWALS',
  'PROVIDER_DEPOSITS', 'PROVIDER_WITHDRAWALS', 'SETTLEMENT_SLA', 'PRIZE_SLA'
);

CREATE TYPE reconciliation_run_status AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED_ALREADY_RUNNING');

CREATE TABLE reconciliation_run (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind             reconciliation_run_kind   NOT NULL,
  status           reconciliation_run_status NOT NULL DEFAULT 'RUNNING',
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  records_checked  INT NOT NULL DEFAULT 0,
  mismatches_found INT NOT NULL DEFAULT 0,
  cases_opened     INT NOT NULL DEFAULT 0,
  error            TEXT,
  CONSTRAINT reconciliation_run_finished_has_timestamp
    CHECK (status NOT IN ('COMPLETED', 'FAILED') OR completed_at IS NOT NULL),
  CONSTRAINT reconciliation_run_failed_has_error
    CHECK (status <> 'FAILED' OR error IS NOT NULL)
);

CREATE INDEX reconciliation_run_kind_idx ON reconciliation_run (kind, started_at DESC);

-- Only one run of a given kind may be RUNNING at a time. This is the ENTIRE
-- concurrency guard for the job runner: no advisory lock, no held
-- transaction spanning the run's actual work (which calls other services --
-- payments' verifyAndCredit/reconcile -- that open their OWN transactions;
-- holding this run inside one continuous transaction would self-deadlock
-- exactly the way the tx-calls-public-service pattern always does). A
-- second concurrent invocation's own INSERT simply finds this index already
-- satisfied and reports SKIPPED_ALREADY_RUNNING; the row it is skipping
-- around is the actual source of truth, not a lock held in memory anywhere.
CREATE UNIQUE INDEX reconciliation_run_one_running_per_kind
  ON reconciliation_run (kind) WHERE status = 'RUNNING';

-- --- Cases -----------------------------------------------------------------

CREATE TYPE reconciliation_case_category AS ENUM (
  'LEDGER_DRIFT', 'SOLVENCY_BREACH', 'PROVIDER_MISMATCH', 'AMOUNT_MISMATCH',
  'ASSET_MISMATCH', 'NETWORK_MISMATCH', 'DUPLICATE_EVENT',
  'STUCK_DEPOSIT', 'STUCK_WITHDRAWAL', 'SETTLEMENT_SLA_BREACH', 'PRIZE_SLA_BREACH', 'OTHER'
);

CREATE TYPE reconciliation_case_status AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'FALSE_POSITIVE');

CREATE TYPE reconciliation_severity AS ENUM ('INFO', 'WARNING', 'CRITICAL');

CREATE TABLE reconciliation_case (
  id              TEXT                          PRIMARY KEY,
  category        reconciliation_case_category  NOT NULL,
  severity        reconciliation_severity       NOT NULL,
  status          reconciliation_case_status    NOT NULL DEFAULT 'OPEN',
  -- What this case is ABOUT: 'deposit' | 'withdrawal' | 'duel' | 'tournament'
  -- | 'ledger_account' | 'platform'. Not a foreign key -- the subject can be
  -- any one of several tables, and a case must be able to outlive whatever
  -- inconsistency it names (including rows that turn out not to exist).
  subject_type    TEXT                          NOT NULL,
  subject_id      TEXT                          NOT NULL,
  detail          JSONB                         NOT NULL DEFAULT '{}'::jsonb,
  opened_at       TIMESTAMPTZ                   NOT NULL DEFAULT now(),
  resolved_by     TEXT                          REFERENCES admin_user(id),
  resolved_at     TIMESTAMPTZ,
  resolution      TEXT,
  resolution_note TEXT,

  -- A financial discrepancy is never closed without a human explaining it in
  -- writing -- the same "sanction requires a note" discipline fairplay_case
  -- already enforces, applied here to closing a reconciliation case instead
  -- of deciding a fair-play sanction.
  CONSTRAINT reconciliation_case_resolved_is_explained
    CHECK (status NOT IN ('RESOLVED', 'FALSE_POSITIVE')
           OR (resolved_by IS NOT NULL AND resolved_at IS NOT NULL
               AND length(btrim(COALESCE(resolution_note, ''))) > 0))
);

-- THE idempotency guarantee: re-detecting an already-flagged problem, on a
-- later run or a genuinely concurrent one, opens no second case. This is
-- what makes repeated and concurrent reconciliation runs safe by
-- construction rather than by careful scheduling -- a partial unique index,
-- not an advisory lock, is what actually prevents the duplicate (the
-- advisory lock used around a single run's execution, see the service,
-- prevents wasted duplicate WORK; this index is the one thing that would
-- still be correct even if that lock were bypassed entirely).
CREATE UNIQUE INDEX reconciliation_case_open_dedup
  ON reconciliation_case (category, subject_type, subject_id)
  WHERE status IN ('OPEN', 'UNDER_REVIEW');

CREATE INDEX reconciliation_case_status_idx ON reconciliation_case (status, opened_at DESC);
CREATE INDEX reconciliation_case_subject_idx ON reconciliation_case (subject_type, subject_id);

CREATE TABLE reconciliation_case_event (
  id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id    TEXT        NOT NULL REFERENCES reconciliation_case(id),
  event      TEXT        NOT NULL,
  actor_type TEXT        NOT NULL,
  actor_id   TEXT,
  detail     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reconciliation_case_event_actor_type_known CHECK (actor_type IN ('SYSTEM', 'ADMIN'))
);

CREATE TRIGGER reconciliation_case_event_immutable
  BEFORE UPDATE OR DELETE ON reconciliation_case_event
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE INDEX reconciliation_case_event_case_idx ON reconciliation_case_event (case_id, id);

-- --- The system actor for automated emergency actions -----------------------
--
-- The global solvency check is the one reconciliation finding severe enough
-- to act on automatically rather than only opening a case: both the ledger
-- spec and the payment architecture doc call it out by name as triggering an
-- "automatic withdrawal halt" (never a repair of any balance -- a halt is a
-- brake, not a correction). `platform_control.changed_by` has a hard foreign
-- key to `admin_user`, with no NULL-actor escape hatch the way
-- `ledger_transaction.actor_type = 'SYSTEM'` has -- so an automated halt needs
-- a real row to attribute itself to. This one exists ONLY for that
-- attribution: it is created already disabled, and no credential is ever
-- issued for it anywhere in the codebase, so it cannot authenticate through
-- any interactive admin path even if a future code path forgot to check
-- `disabled_at`.
INSERT INTO admin_user (id, email, display_name, mfa_enrolled, disabled_at)
VALUES ('system-automation', 'system-automation@internal.invalid', 'System Automation (reconciliation)', FALSE, now())
ON CONFLICT (id) DO NOTHING;
-- Localization: a player's saved language preference.
--
-- Per the platform locale-resolution order (packages/i18n/src/resolve.mjs):
-- explicit choice > saved account preference > device locale > English. This
-- column is the "saved account preference" tier -- it exists so a signed-in
-- player's language survives switching devices or OS languages.
--
-- The list of codes here must stay in lockstep with
-- packages/i18n/src/locales.mjs SUPPORTED_LOCALE_CODES. There is no way to
-- share a single source of truth between SQL and application code across a
-- migration boundary, so both are considered authoritative and a new
-- language ships as a change to both in the same commit.

ALTER TABLE player
  ADD COLUMN locale TEXT NOT NULL DEFAULT 'en'
    CONSTRAINT player_locale_supported
    CHECK (locale IN ('ar', 'en', 'zh', 'es', 'ja', 'fr', 'de', 'pt', 'ru', 'ko'));
-- Custom admin roles and granular permissions -- a SEPARATE, additive layer
-- from the existing fixed role/capability grid (packages/authz/src/policy.mjs
-- ROLE_CAPABILITIES, admin_role_grant). That grid is a deliberate design
-- choice documented in policy.mjs: capabilities are code, reviewed by a
-- human in a PR, not runtime-editable, specifically for the actions that
-- move money or decide risk/fairplay cases. Nothing here changes that.
--
-- What this migration adds is admin-UI-manageable roles for domains that do
-- NOT yet have any real enforcement point at all -- support tickets, chat
-- moderation, game-catalog management (see the seed data below). A permission
-- code is only ever added here once its real route exists and actually
-- checks it; until then granting one has no effect, and that is intentional
-- rather than a gap to "finish later" silently. Nothing that already has a
-- working capability (withdrawals, adjustments, tournaments, reconciliation,
-- user restriction, analytics, audit) gets a shadow permission here -- that
-- would let an operator believe a custom role controls money movement when
-- the real route still checks the old, hardcoded capability.

CREATE TABLE permission (
  code        TEXT PRIMARY KEY,
  category    TEXT NOT NULL,
  description TEXT NOT NULL,
  CONSTRAINT permission_code_shape CHECK (code ~ '^[A-Z][A-Z0-9_]*$')
);

CREATE TABLE role (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  -- A system role is seeded, not admin-created, and cannot be edited or
  -- deleted through the API -- reserved for roles the platform itself
  -- depends on existing (none yet in this migration; the flag exists so
  -- Phase 2+ can seed one without a schema change).
  is_system   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by  TEXT        NOT NULL REFERENCES admin_user(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE role_permission (
  role_id         TEXT NOT NULL REFERENCES role(id) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES permission(code),
  PRIMARY KEY (role_id, permission_code)
);

-- Deliberately its own table, not a row in admin_role_grant: that table's
-- `role` column is the fixed `admin_role` enum (SUPER_ADMIN, FINANCE_ADMIN,
-- ...), and mixing a free-text custom role id into the same column would
-- make it possible to accidentally query "does this admin hold ADMIN"
-- against a custom role row, or vice versa.
CREATE TABLE admin_custom_role_grant (
  admin_id   TEXT        NOT NULL REFERENCES admin_user(id),
  role_id    TEXT        NOT NULL REFERENCES role(id) ON DELETE CASCADE,
  granted_by TEXT        NOT NULL REFERENCES admin_user(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_custom_role_grant_not_self CHECK (admin_id <> granted_by),
  PRIMARY KEY (admin_id, role_id)
);

INSERT INTO permission (code, category, description) VALUES
  ('TICKET_VIEW',        'support', 'View support tickets'),
  ('TICKET_REPLY',       'support', 'Reply to a support ticket'),
  ('TICKET_ASSIGN',      'support', 'Assign a ticket to a staff member'),
  ('TICKET_ESCALATE',    'support', 'Escalate a ticket to another team'),
  ('TICKET_CLOSE',       'support', 'Resolve or close a ticket'),
  ('CHAT_MODERATE',      'chat',    'Delete messages and mute users in chat'),
  ('CHAT_DELETE',        'chat',    'Delete an individual chat message'),
  ('CHAT_MUTE',          'chat',    'Temporarily mute a user in chat'),
  ('CHAT_REPORT_REVIEW', 'chat',    'Review chat abuse reports'),
  ('GAME_MANAGE',        'game',    'Manage game catalog configuration'),
  ('GAME_PAUSE',         'game',    'Pause or resume a game');
-- Email identity -- additive, and deliberately its own table rather than a
-- column on `player` or `credential`. Per the architecture this migration
-- follows:
--
--   Player
--   ├── credential      (password identity, migration 0005)
--   ├── totp_secret     (2FA, migration 0005)
--   └── email_identity  (this migration)
--
-- and later, google_identity alongside it (a future migration -- not
-- created here; Slice 5 of the authentication roadmap). Keeping identities
-- as sibling tables means adding Google login is "one more sibling table",
-- never a rewrite of this one.
--
-- One email per player for now: the product has no stated need for
-- secondary/recovery emails yet, and a UNIQUE(player_id) constraint is easy
-- to relax later (a real schema addition) but hard to safely un-assume once
-- application code depends on "a player has at most one email".
--
-- `email` is the normalized form (lowercased, trimmed -- see
-- packages/auth/src/email-identity.mjs's `normalizeEmail`) and is what every
-- uniqueness check and lookup uses; `email_display` preserves what the
-- person actually typed, for showing back to them and for the "To:" header
-- of anything mailed to them.

CREATE TABLE email_identity (
  id            TEXT PRIMARY KEY,
  player_id     TEXT        NOT NULL REFERENCES player(id),
  email         TEXT        NOT NULL,
  email_display TEXT        NOT NULL,
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A shape check, not a full RFC 5322 validator -- the same trade-off the
  -- rest of this schema makes elsewhere (see player_handle_shape): reject
  -- what is obviously wrong, let a real deliverability check (which this
  -- system does not have) be the thing that ultimately proves an address
  -- works, by actually sending to it.
  CONSTRAINT email_identity_shape CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),

  -- One verified-or-not email row per player. A second call to "set my
  -- email" updates this row (see setEmail's ON CONFLICT below); it does not
  -- create a second identity.
  CONSTRAINT email_identity_one_per_player UNIQUE (player_id),

  -- The uniqueness that actually matters for login, password reset and
  -- Google account linking: no two players can claim the same normalized
  -- address. This is also what makes "does this email already have an
  -- account" a real, DB-enforced fact rather than an application promise.
  CONSTRAINT email_identity_unique_email UNIQUE (email)
);

CREATE INDEX email_identity_player_idx ON email_identity (player_id);
-- Realigns the supported-locale list to the platform's official six
-- languages (en, zh, hi, es, ar, fr), replacing the ten-language set
-- 0014_i18n.sql originally shipped (which had ja/de/pt/ru/ko instead of
-- hi). This is a correction to match the authoritative product spec, not a
-- redesign of the localization architecture -- packages/i18n/src/locales.mjs
-- is still the single place that list lives, and nothing that reads from it
-- needed to change.
--
-- Any existing player whose saved locale is no longer on the list falls
-- back to English -- the same "unsupported -> English" rule
-- packages/i18n/src/resolve.mjs already applies everywhere else, just
-- applied once here for rows written under the old list.

UPDATE player SET locale = 'en' WHERE locale NOT IN ('en', 'zh', 'hi', 'es', 'ar', 'fr');

ALTER TABLE player DROP CONSTRAINT player_locale_supported;

ALTER TABLE player
  ADD CONSTRAINT player_locale_supported
  CHECK (locale IN ('en', 'zh', 'hi', 'es', 'ar', 'fr'));
-- A single, purpose-bound challenge table shared by email verification,
-- the 6-character login code, and password reset (later slices) -- three
-- flows that are structurally identical (issue a short-lived, single-use,
-- attempt-limited secret; verify it) but must never be usable for each
-- other's purpose. `purpose` is an enum, not a free-text column, and every
-- read in packages/auth/src/email-challenge.mjs filters on it explicitly --
-- a token issued for VERIFICATION can never be looked up, let alone
-- accepted, by a query scoped to LOGIN_CODE or PASSWORD_RESET.
--
-- Only PASSWORD_RESET and LOGIN_CODE are declared here ahead of their own
-- slices (an enum cannot cheaply grow a value later without a migration of
-- its own in every Postgres version this project supports) -- the table and
-- code that uses it are still VERIFICATION-only until those slices land.

CREATE TYPE email_challenge_purpose AS ENUM ('VERIFICATION', 'LOGIN_CODE', 'PASSWORD_RESET');

CREATE TABLE email_challenge (
  id           TEXT                     PRIMARY KEY,
  player_id    TEXT                     NOT NULL REFERENCES player(id),
  purpose      email_challenge_purpose  NOT NULL,
  -- Snapshot of the address this challenge was actually sent to. If the
  -- player changes their email between issuing and verifying, this
  -- challenge stays scoped to the address it was issued for -- it does not
  -- silently re-target itself to whatever email is on file *now*.
  email        TEXT                     NOT NULL,
  -- SHA-256 of the code, never the code itself -- same reasoning as
  -- auth_session.refresh_hash (tokens.mjs's hashRefreshToken): this is a
  -- short-lived, single-use, attempt-limited random value, not a
  -- user-chosen secret, so a fast hash is correct and a slow one (Argon2)
  -- would only cost real users time for no real security gain.
  secret_hash  TEXT                     NOT NULL,
  attempts     INT                      NOT NULL DEFAULT 0,
  max_attempts INT                      NOT NULL DEFAULT 5,
  expires_at   TIMESTAMPTZ              NOT NULL,
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ              NOT NULL DEFAULT now(),

  CONSTRAINT email_challenge_attempts_bounded CHECK (attempts <= max_attempts)
);

-- Serves both "is there already an active challenge for this player+purpose"
-- (resend cooldown, single-active-challenge invalidation) and "give me the
-- most recent one to verify against".
CREATE INDEX email_challenge_active_idx
  ON email_challenge (player_id, purpose, created_at DESC) WHERE used_at IS NULL;

-- Welcome-email idempotency, guarded the same way this codebase already
-- guards reconciliation_run (a partial unique index, not a held
-- transaction or an application-level check-then-act race): at most one
-- WELCOME_EMAIL_REQUESTED security_event per player, ever. A concurrent
-- duplicate request (a retried registration call, two tabs, a replayed
-- webhook-shaped retry) loses the INSERT as a clean unique-violation,
-- which packages/auth/src/welcome-email.mjs treats as "already handled",
-- never as a second email going out.
CREATE UNIQUE INDEX security_event_welcome_once
  ON security_event (player_id) WHERE type = 'WELCOME_EMAIL_REQUESTED';
-- Third-party identity providers (Slice 5: Google, first). Two tables,
-- deliberately separate from `credential` and `email_identity`:
--
--   oauth_identity -- the durable link between a player and a provider's
--   own stable subject identifier ("sub" for OIDC). `provider` is a plain
--   column, not baked into the table name, so a future provider (Apple,
--   Microsoft) is a new row shape the existing schema already supports,
--   not a new migration inventing a parallel table. The UNIQUE constraints
--   below encode the whole security model: a given provider subject can
--   belong to at most one player (no two players can claim the same
--   external identity), and a given player can link at most one identity
--   per provider (one Google account per Nizalo account, today).
--
--   oauth_handoff -- see packages/auth/src/oauth-handoff.mjs's own header
--   for why this exists: the browser is mid-redirect (Google -> our
--   callback -> the frontend) when a session needs to be handed off, and a
--   bearer token must never ride in a URL. This is a short-lived,
--   single-use, hashed-at-rest opaque code binding that one redirect
--   round-trip to a specific player -- structurally the same shape as
--   email_challenge (issue, verify-once via the same atomic
--   used_at-is-null compare-and-swap idiom, expire), but it is not an
--   emailed, human-typed code and has no `purpose`/`email` concept, so it
--   does not belong in that table.

CREATE TABLE oauth_identity (
  id              TEXT        PRIMARY KEY,
  player_id       TEXT        NOT NULL REFERENCES player(id),
  provider        TEXT        NOT NULL,
  -- The provider's own stable identifier (OIDC "sub") -- NEVER the email.
  -- An email can change or be reused after account deletion on the
  -- provider's side; a "sub" is defined by the provider to never be
  -- reassigned. This column, not email, is what a login looks up.
  provider_subject TEXT       NOT NULL,
  -- Informational snapshot of what the provider reported at link time --
  -- never used as a lookup key, only ever displayed back to the player
  -- ("linked to you@gmail.com") and consulted at NEW-signup time to decide
  -- whether to pre-fill/pre-verify the application email identity.
  email           TEXT,
  email_verified  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL,

  CONSTRAINT oauth_identity_unique_subject UNIQUE (provider, provider_subject),
  CONSTRAINT oauth_identity_one_per_provider UNIQUE (player_id, provider)
);

CREATE INDEX oauth_identity_player_idx ON oauth_identity (player_id);

CREATE TABLE oauth_handoff (
  id          TEXT        PRIMARY KEY,
  player_id   TEXT        NOT NULL REFERENCES player(id),
  provider    TEXT        NOT NULL,
  code_hash   TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL
);
-- The Profile / User Identity foundation (Slice 7). Four independent
-- concerns, deliberately kept as separate tables rather than one wide
-- "profile" blob:
--
--   player (extended)  -- bio, avatar, nickname-change cooldown, and which
--                          single earned/cosmetic badge is shown in the
--                          compact preview. Nickname itself stays
--                          `player.handle` -- see nickname.mjs's own header
--                          for why this is presentation-only, not a schema
--                          rename.
--   exp_event          -- an append-only, idempotent EXP ledger. EXP is
--                          NOT the financial ledger (packages/ledger) and
--                          never touches it -- a separate domain entirely,
--                          on purpose.
--   achievement /
--   player_achievement -- a catalog of one-time-per-player unlocks.
--   badge /
--   player_badge       -- a catalog of displayable badges, explicitly
--                          tagged by source (an achievement unlock vs. a
--                          future store purchase) so those two concepts
--                          can never be confused at the data layer, even
--                          before a store exists to populate the second one.
--   content_report     -- the minimal "report this" primitive directive
--                          #3/#4 ask for; review tooling is a later slice's
--                          job, this just makes sure a report is never lost.

ALTER TABLE player
  ADD COLUMN bio TEXT NOT NULL DEFAULT '',
  ADD COLUMN avatar_key TEXT,
  ADD COLUMN handle_changed_at TIMESTAMPTZ,
  ADD COLUMN selected_badge_code TEXT,
  ADD CONSTRAINT player_bio_length CHECK (char_length(bio) <= 280);

-- --- EXP (a domain of its own -- see exp.mjs's header for why this is
-- never a materialized running total: SUM() on this small, indexed table
-- is cheap, and a second number that could drift out of sync with the
-- events that are supposed to explain it is a bug waiting to happen). ----

CREATE TABLE exp_event (
  id          TEXT        PRIMARY KEY,
  player_id   TEXT        NOT NULL REFERENCES player(id),
  event_type  TEXT        NOT NULL,
  source      TEXT,
  amount      INT         NOT NULL CHECK (amount > 0),
  -- The idempotency guarantee directive #11 requires: a retried match
  -- settlement, a replayed tournament result, or a duplicate webhook all
  -- carry the SAME dedupe_key on retry, so a second attempt collides on
  -- this UNIQUE constraint instead of awarding EXP twice. The caller picks
  -- the key (e.g. "duel:<duelId>:win"); this table only enforces it.
  dedupe_key  TEXT        NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX exp_event_player_idx ON exp_event (player_id, created_at DESC);

-- --- Achievements -------------------------------------------------------

CREATE TABLE achievement (
  code       TEXT        PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE player_achievement (
  player_id        TEXT        NOT NULL REFERENCES player(id),
  achievement_code TEXT        NOT NULL REFERENCES achievement(code),
  earned_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The whole idempotency guarantee for achievements: earning the same
  -- achievement twice is structurally impossible, not just discouraged.
  PRIMARY KEY (player_id, achievement_code)
);

-- --- Badges ---------------------------------------------------------------
-- `source` is the one column that keeps directive #17's separation real:
-- an achievement-awarding code path and a (future) store-purchase code
-- path both insert into the SAME player_badge table, but neither can ever
-- be mistaken for the other later, and a query can trivially filter to
-- "earned badges only" or "cosmetic badges only".

CREATE TYPE badge_source AS ENUM ('ACHIEVEMENT', 'PURCHASE');

CREATE TABLE badge (
  code       TEXT        PRIMARY KEY,
  -- Catalog-level classification -- independent of any one player's
  -- source (a badge design could in principle be earnable AND, later,
  -- also sellable as a cosmetic reprint; today every seeded badge is one
  -- or the other, but the column exists on the catalog, not lazily
  -- inferred from the first row that happens to reference it).
  kind       TEXT        NOT NULL CHECK (kind IN ('EARNED', 'COSMETIC')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE player_badge (
  player_id  TEXT         NOT NULL REFERENCES player(id),
  badge_code TEXT         NOT NULL REFERENCES badge(code),
  source     badge_source NOT NULL,
  earned_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, badge_code)
);

ALTER TABLE player
  ADD CONSTRAINT player_selected_badge_fk FOREIGN KEY (selected_badge_code) REFERENCES badge(code);

-- A very small initial catalog, per directive #16/#17 -- infrastructure
-- first, not "dozens of achievements". Display name/description are i18n
-- keys resolved client-side (packages/i18n), never stored as English text
-- here, the same convention every other user-facing string in this
-- product already follows.
INSERT INTO achievement (code) VALUES ('FIRST_WIN'), ('FIRST_TOURNAMENT');
INSERT INTO badge (code, kind) VALUES ('FIRST_WIN', 'EARNED'), ('FIRST_TOURNAMENT', 'EARNED');

-- --- Reporting (minimal) ----------------------------------------------------
-- Directive #3/#4's "moderation/report capability" -- this is the write
-- side only (file a report, never lose it). An admin review queue is a
-- later slice's job, exactly like the Support Ticket System already
-- planned next; this table is what that slice will read from.

CREATE TABLE content_report (
  id                 TEXT        PRIMARY KEY,
  reporter_id        TEXT        NOT NULL REFERENCES player(id),
  subject_player_id  TEXT        NOT NULL REFERENCES player(id),
  content_type       TEXT        NOT NULL CHECK (content_type IN ('AVATAR', 'BIO', 'NICKNAME')),
  reason             TEXT,
  status             TEXT        NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'REVIEWED', 'DISMISSED')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT content_report_not_self CHECK (reporter_id <> subject_player_id)
);

CREATE INDEX content_report_subject_idx ON content_report (subject_player_id, created_at DESC);
-- nickname.mjs's own uniqueness check compares case-insensitively ("Admin"
-- must not be claimable merely because "admin" is spelled differently),
-- but an application-level SELECT-then-UPDATE check is exactly the shape
-- of race this project has twice already found to be exploitable under
-- real concurrency (see packages/auth/src/email-challenge.mjs and
-- oauth-identity.mjs's own history -- and this exact index was born from
-- a real-Postgres concurrency test in this slice failing the first time
-- it ran without it). The ORIGINAL `handle` UNIQUE constraint (migration
-- 0003) is case-SENSITIVE, so it does not by itself stop two players
-- from concurrently claiming "Foo" and "foo". This functional index makes
-- the case-insensitive guarantee a REAL database constraint, closing that
-- race structurally rather than trusting application code to win it.
CREATE UNIQUE INDEX player_handle_lower_unique ON player (LOWER(handle));
-- Customer Support / Ticket System (Slice 8). Named `support_ticket*`
-- throughout, not bare `ticket*` -- migration 0003 already defines a
-- `ticket_status` enum for the UNRELATED matchmaking-queue concept
-- (`matchmaking_ticket`), and even where a bare name would not collide
-- outright, sitting a support ticket next to a matchmaking ticket under
-- the same short name would be confusing for the next person reading
-- this schema.
--
-- RBAC note: TICKET_VIEW/REPLY/ASSIGN/ESCALATE/CLOSE already exist as
-- `permission` rows (migration 0015) -- inert until now. This slice makes
-- them real by having identify() (packages/api/src/server.mjs) merge an
-- admin's effective custom-RBAC permissions into their capability set,
-- so the EXISTING authorize() pipeline gates the new ticket actions
-- (declared in policy.mjs's own ACTIONS grid, same as every other admin
-- route) with zero changes to authorize() itself and no second
-- authorization model.
--
-- Audit note: ticket state changes made by staff are recorded through the
-- EXISTING admin_audit table (every admin route already writes there
-- automatically); ticket actions taken by the customer (creating a
-- ticket, sending a message) are recorded through the EXISTING
-- security_event table. No new audit table.
--
-- "Team" is modelled as a plain routing/filter label on the ticket, not a
-- membership table: TICKET_VIEW is a blanket read capability (consistent
-- with every other admin read surface in this codebase -- admin.user.read,
-- admin.reconciliation.read, none of which partition data per-admin
-- either). Escalating a ticket changes its team; it does not grant or
-- revoke anyone's access.

CREATE TYPE support_ticket_category AS ENUM (
  'ACCOUNT', 'LOGIN', 'PASSWORD', 'DEPOSIT_PENDING', 'WITHDRAWAL_PENDING', 'WITHDRAWAL_FAILED',
  'MISSING_FUNDS', 'MATCH_PROBLEM', 'TOURNAMENT_PROBLEM', 'ANTI_CHEAT', 'TECHNICAL', 'ABUSE_REPORT', 'OTHER'
);

CREATE TYPE support_ticket_status AS ENUM (
  'OPEN', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'ESCALATED', 'RESOLVED', 'CLOSED'
);

CREATE TYPE support_ticket_priority AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

CREATE TYPE support_ticket_team AS ENUM ('CUSTOMER_SUPPORT', 'FINANCE', 'TECHNICAL', 'RISK', 'MODERATION', 'TOURNAMENTS');

CREATE TABLE support_ticket (
  id             TEXT                    PRIMARY KEY,
  player_id      TEXT                    NOT NULL REFERENCES player(id),
  category       support_ticket_category NOT NULL,
  status         support_ticket_status   NOT NULL DEFAULT 'OPEN',
  priority       support_ticket_priority NOT NULL DEFAULT 'NORMAL',
  team           support_ticket_team     NOT NULL DEFAULT 'CUSTOMER_SUPPORT',
  -- A specific named agent, distinct from `team` (the current queue this
  -- ticket sits in). admin_user.id shares player.id's id space (see
  -- packages/api/src/server.mjs's identify()), so this FK is correct for
  -- a staff member exactly the way support_ticket_message.author_id is below.
  assignee_id    TEXT                    REFERENCES admin_user(id),
  assigned_by    TEXT                    REFERENCES admin_user(id),
  assigned_at    TIMESTAMPTZ,
  subject        TEXT                    NOT NULL,
  -- A loose reference, never a hard FK -- same pattern as
  -- reconciliation_case.subject_type/subject_id (migration 0013): a
  -- ticket must be able to keep naming a deposit/withdrawal/duel/
  -- tournament pairing without being deleted if that row's lifecycle
  -- outlives or is purged before the ticket's own.
  reference_type TEXT                    CHECK (reference_type IN ('DEPOSIT', 'WITHDRAWAL', 'DUEL', 'TOURNAMENT_PAIRING')),
  reference_id   TEXT,
  -- A SNAPSHOT of trusted internal references at creation time (ids,
  -- status, asset/network, amounts) -- directive #5's "store references,
  -- do NOT duplicate entire payment/withdrawal/match objects": this is
  -- deliberately a small set of ids/enums/status strings, never a copy of
  -- KYC, risk signals, or provider credentials.
  context        JSONB                   NOT NULL DEFAULT '{}'::jsonb,
  -- Set only when `reference_type`/`reference_id` are both present --
  -- what the open-ticket-dedupe constraint below keys on.
  dedupe_key     TEXT,
  created_at     TIMESTAMPTZ             NOT NULL,
  updated_at     TIMESTAMPTZ             NOT NULL,
  resolved_at    TIMESTAMPTZ,
  closed_at      TIMESTAMPTZ,

  CONSTRAINT support_ticket_subject_length CHECK (char_length(subject) BETWEEN 1 AND 200),
  CONSTRAINT support_ticket_reference_pair CHECK (
    (reference_type IS NULL) = (reference_id IS NULL)
  )
);

-- Directive #24: the SAME player cannot have two simultaneously-OPEN
-- tickets for the SAME reference (e.g. "Withdrawal #123 still pending"
-- submitted twice) -- a real database constraint, not just a UI check,
-- proven race-safe under real concurrency the same way
-- security_event_welcome_once and email_challenge_active_idx already are.
CREATE UNIQUE INDEX support_ticket_open_dedupe_idx ON support_ticket (player_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status NOT IN ('RESOLVED', 'CLOSED');

CREATE INDEX support_ticket_player_idx ON support_ticket (player_id, created_at DESC);
CREATE INDEX support_ticket_queue_idx ON support_ticket (status, team, priority, created_at DESC);
CREATE INDEX support_ticket_assignee_idx ON support_ticket (assignee_id, status) WHERE assignee_id IS NOT NULL;
CREATE INDEX support_ticket_reference_idx ON support_ticket (reference_type, reference_id) WHERE reference_type IS NOT NULL;

-- --- Conversation -----------------------------------------------------------

CREATE TYPE support_ticket_message_author_type AS ENUM ('CUSTOMER', 'STAFF', 'SYSTEM');
CREATE TYPE support_ticket_message_visibility AS ENUM ('CUSTOMER', 'INTERNAL');

CREATE TABLE support_ticket_message (
  id          TEXT                                PRIMARY KEY,
  ticket_id   TEXT                                NOT NULL REFERENCES support_ticket(id),
  author_id   TEXT                                REFERENCES player(id),  -- NULL for SYSTEM messages
  author_type support_ticket_message_author_type  NOT NULL,
  visibility  support_ticket_message_visibility   NOT NULL,
  content     TEXT                                NOT NULL,
  created_at  TIMESTAMPTZ                         NOT NULL,

  CONSTRAINT support_ticket_message_length CHECK (char_length(content) BETWEEN 1 AND 4000),
  -- A customer can never author an INTERNAL-only message -- directive
  -- #13's "internal notes must NEVER be visible to customers" starts here,
  -- structurally, not just as an application-level filter on read.
  CONSTRAINT support_ticket_message_customer_never_internal
    CHECK (NOT (author_type = 'CUSTOMER' AND visibility = 'INTERNAL')),
  CONSTRAINT support_ticket_message_system_has_no_author
    CHECK ((author_type = 'SYSTEM') = (author_id IS NULL))
);

-- Directive #15: append-only. Reuses the same immutability trigger
-- function admin_audit and security_event already use.
CREATE TRIGGER support_ticket_message_immutable
  BEFORE UPDATE OR DELETE ON support_ticket_message
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE INDEX support_ticket_message_ticket_idx ON support_ticket_message (ticket_id, created_at);

-- --- Attachments (directive #23) --------------------------------------------
-- The same validated-bytes-plus-storage-abstraction shape as
-- packages/profile/src/avatar-storage.mjs -- a key into a storage
-- interface, never a raw path or credential, and never an executable
-- MIME type.

CREATE TABLE support_ticket_attachment (
  id          TEXT        PRIMARY KEY,
  ticket_id   TEXT        NOT NULL REFERENCES support_ticket(id),
  message_id  TEXT        REFERENCES support_ticket_message(id),
  uploaded_by TEXT        NOT NULL REFERENCES player(id),
  storage_key TEXT        NOT NULL,
  mime_type   TEXT        NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
  size_bytes  INT         NOT NULL CHECK (size_bytes > 0),
  created_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX support_ticket_attachment_ticket_idx ON support_ticket_attachment (ticket_id);

-- --- Notification idempotency (directive #27) -------------------------------
-- Mirrors welcome-email.mjs's own "claim a slot, then send" idiom: a
-- retried provider call or a duplicate trigger collides on this unique
-- key instead of sending the customer the same notification twice.

CREATE TABLE support_ticket_notification_sent (
  id             TEXT        PRIMARY KEY,
  ticket_id      TEXT        NOT NULL REFERENCES support_ticket(id),
  notification   TEXT        NOT NULL,  -- 'TICKET_CREATED' | 'STAFF_REPLIED' | 'WAITING_FOR_USER' | 'TICKET_RESOLVED'
  -- For STAFF_REPLIED specifically, dedupe per MESSAGE (a second reply
  -- must still notify); for the others, once per ticket is correct. A
  -- plain UNIQUE index (unlike a PRIMARY KEY) lets NULL coexist many
  -- times, so message_id is normalized through COALESCE to make "once per
  -- ticket+notification" and "once per ticket+notification+message" both
  -- real, enforced guarantees rather than a NULL silently opting out.
  message_id     TEXT        REFERENCES support_ticket_message(id),
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX support_ticket_notification_sent_once_idx
  ON support_ticket_notification_sent (ticket_id, notification, COALESCE(message_id, ''));
-- Realtime Chat Foundation (Slice 9). One channel/message model underneath
-- Global chat, Match chat, and (architecture only, not yet built) Spectator
-- chat -- see packages/chat's own header for why a single abstraction beats
-- three parallel implementations.
--
-- RBAC note: CHAT_MODERATE/CHAT_DELETE/CHAT_MUTE/CHAT_REPORT_REVIEW already
-- exist as `permission` rows (migration 0015) -- inert until now, made real
-- the exact same way Slice 8 made TICKET_* real (identify() merging
-- effectivePermissions() into actor.capabilities; see packages/api/src/
-- server.mjs and packages/authz/src/policy.mjs). CHAT_VIEW did not exist
-- yet and is added below.
--
-- Reporting reuses the EXISTING content_report table (migration 0020)
-- rather than a parallel chat_report table: this IS "the existing
-- moderation architecture" the brief asks for. The additive columns below
-- (category, message_id) and the widened content_type CHECK cover chat's
-- two new report subjects (a specific message, or a player generally)
-- without touching a single row or column profile.mjs already relies on.

CREATE TYPE chat_channel_type AS ENUM ('GLOBAL', 'MATCH', 'SPECTATOR');
CREATE TYPE chat_channel_status AS ENUM ('ACTIVE', 'CLOSED');

CREATE TABLE chat_channel (
  id             TEXT                 PRIMARY KEY,
  type           chat_channel_type    NOT NULL,
  -- NULL for GLOBAL (there is only ever one); a DUEL reference for MATCH and
  -- (later) SPECTATOR -- loose by convention (no FK), matching this schema's
  -- existing reconciliation_case/support_ticket precedent, since a channel
  -- should keep naming its duel even if duel history is ever pruned.
  reference_type TEXT                 CHECK (reference_type IN ('DUEL')),
  reference_id   TEXT,
  status         chat_channel_status  NOT NULL DEFAULT 'ACTIVE',
  created_at     TIMESTAMPTZ          NOT NULL DEFAULT now(),

  CONSTRAINT chat_channel_reference_pair CHECK ((reference_type IS NULL) = (reference_id IS NULL)),
  CONSTRAINT chat_channel_global_no_reference CHECK (type <> 'GLOBAL' OR reference_type IS NULL),
  CONSTRAINT chat_channel_scoped_has_reference CHECK (type = 'GLOBAL' OR reference_type IS NOT NULL)
);

-- At most one channel per (type, duel) -- getOrCreateChannel() relies on this
-- to make channel creation idempotent under concurrent first-joiners.
CREATE UNIQUE INDEX chat_channel_reference_unique_idx ON chat_channel (type, reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

-- The one platform-wide public channel. Seeded once, here -- never created
-- lazily by application code, so "does Global Chat exist" is never a race.
INSERT INTO chat_channel (id, type, status) VALUES ('global', 'GLOBAL', 'ACTIVE');

CREATE TABLE chat_message (
  id                BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel_id        TEXT        NOT NULL REFERENCES chat_channel(id),
  sender_id         TEXT        NOT NULL REFERENCES player(id),
  content           TEXT        NOT NULL,
  -- Client-chosen, scoped to (channel, sender) -- a retried send with the
  -- SAME id is a no-op, never a second row. See chat_message_idempotency_idx.
  client_message_id TEXT        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  deleted_by        TEXT        REFERENCES admin_user(id),

  CONSTRAINT chat_message_length CHECK (char_length(content) BETWEEN 1 AND 1000),
  CONSTRAINT chat_message_deleted_pair CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
);

CREATE UNIQUE INDEX chat_message_idempotency_idx ON chat_message (channel_id, sender_id, client_message_id);

-- `id DESC` because every real access pattern is "the latest page of this
-- channel" or "the next page older than cursor X" -- never a full scan.
CREATE INDEX chat_message_channel_idx ON chat_message (channel_id, id DESC);

-- Append-only with exactly one legal follow-up write (a moderator setting
-- deleted_at/deleted_by once) -- deliberately its own trigger function
-- rather than reusing ledger_deny_mutation(), whose rule is "nothing may
-- ever change"; this table's rule is "nothing may change AFTER deletion,
-- and only deletion metadata may change AT ALL".
CREATE FUNCTION chat_message_deny_illegal_mutation() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'chat_message rows are never hard-deleted -- use moderation removal (deleted_at/deleted_by)';
  END IF;
  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'chat_message % was already moderated and cannot change further', OLD.id;
  END IF;
  IF NEW.channel_id IS DISTINCT FROM OLD.channel_id OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.content IS DISTINCT FROM OLD.content OR NEW.client_message_id IS DISTINCT FROM OLD.client_message_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'chat_message % core fields are immutable', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chat_message_immutable
  BEFORE UPDATE OR DELETE ON chat_message
  FOR EACH ROW EXECUTE FUNCTION chat_message_deny_illegal_mutation();

-- --- Mute -------------------------------------------------------------------

CREATE TYPE chat_mute_scope AS ENUM ('GLOBAL_CHAT', 'MATCH_CHAT', 'SPECTATOR_CHAT', 'ALL_CHAT');

CREATE TABLE chat_mute (
  id           TEXT             PRIMARY KEY,
  target_id    TEXT             NOT NULL REFERENCES player(id),
  moderator_id TEXT             NOT NULL REFERENCES admin_user(id),
  reason       TEXT             NOT NULL,
  scope        chat_mute_scope  NOT NULL,
  starts_at    TIMESTAMPTZ      NOT NULL DEFAULT now(),
  ends_at      TIMESTAMPTZ,   -- NULL = permanent, per directive #15
  revoked_at   TIMESTAMPTZ,
  revoked_by   TEXT             REFERENCES admin_user(id),
  created_at   TIMESTAMPTZ      NOT NULL DEFAULT now(),

  CONSTRAINT chat_mute_revoked_pair CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT chat_mute_reason_present CHECK (char_length(reason) BETWEEN 1 AND 500)
);

-- The "is this player currently muted for scope X" query filters on exactly
-- these columns -- see isMuted() in packages/chat/src/moderation.mjs.
CREATE INDEX chat_mute_active_idx ON chat_mute (target_id, scope) WHERE revoked_at IS NULL;

-- --- Block --------------------------------------------------------------------

CREATE TABLE chat_block (
  blocker_id TEXT        NOT NULL REFERENCES player(id),
  blocked_id TEXT        NOT NULL REFERENCES player(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT chat_block_not_self CHECK (blocker_id <> blocked_id)
);

-- --- Reporting: extend the EXISTING content_report table (migration 0020) --

ALTER TABLE content_report DROP CONSTRAINT IF EXISTS content_report_content_type_check;
ALTER TABLE content_report
  ADD CONSTRAINT content_report_content_type_check
    CHECK (content_type IN ('AVATAR', 'BIO', 'NICKNAME', 'CHAT_MESSAGE', 'PLAYER'));

ALTER TABLE content_report
  ADD COLUMN category TEXT CHECK (
    category IN ('ABUSE', 'HARASSMENT', 'SPAM', 'SCAM', 'THREATS', 'INAPPROPRIATE_CONTENT', 'OTHER')
  ),
  ADD COLUMN message_id BIGINT REFERENCES chat_message(id);

ALTER TABLE content_report
  ADD CONSTRAINT content_report_chat_message_has_id
    CHECK (content_type <> 'CHAT_MESSAGE' OR message_id IS NOT NULL);

-- --- RBAC: the one new permission code this slice needs --------------------

INSERT INTO permission (code, category, description) VALUES
  ('CHAT_VIEW', 'chat', 'View chat channels, messages and moderation queues');
-- Slice 10: three carried-forward Chat gaps from Slice 9, plus the
-- Spectator Foundation's schema. Reuses everything from migration 0023
-- (chat_channel, chat_message, the chat_channel_type enum with its already-
-- present SPECTATOR value) and 0003 (duel, game) -- no new parallel tables.

-- --- Gap 1: match channel lifecycle -----------------------------------------
--
-- A match (or spectator) chat channel must not stay open to new writes
-- forever once its duel ends. `post_game_deadline` is set ONCE, by the
-- server, the moment a duel reaches DuelState.COMPLETED (see
-- packages/realtime/src/gateway.mjs's publishNewEvents and
-- packages/chat/src/channels.mjs's markMatchCompleted) -- never by the
-- frontend, and never editable by a client. NULL means "no duel completion
-- has been recorded for this channel yet" (still LIVE); once set, a send
-- after that instant is refused (POST_GAME window elapsed = CLOSED), while
-- history remains readable indefinitely -- the read path never consults
-- this column, only sendMessage()'s access check does.
ALTER TABLE chat_channel ADD COLUMN post_game_deadline TIMESTAMPTZ NULL;

-- --- Spectator Foundation: eligibility policy -------------------------------
--
-- "Prepare the architecture, do not hardcode ONE policy globally" (Slice 10
-- directive #17). Two real, enforced values today:
--   OPEN          -- any authenticated player may spectate (the default;
--                    matches every duel created so far, none of which have
--                    any private/friends concept to restrict against).
--   PLAYERS_ONLY  -- nobody may spectate; only the two seated players see
--                    the match at all.
-- A FRIENDS_ONLY value is intentionally NOT added yet: this codebase has no
-- friends/social-graph concept to enforce it against. Adding the column
-- (rather than inferring policy from `tier`) is what makes that a future
-- one-line CHECK widening instead of a schema change.
ALTER TABLE duel ADD COLUMN spectator_policy TEXT NOT NULL DEFAULT 'OPEN'
  CHECK (spectator_policy IN ('OPEN', 'PLAYERS_ONLY'));

-- Per-GAME spectator delay: "do not assume zero-delay spectating is always
-- safe" (directive #8). Configurable per game (and, via the same column
-- pattern, could later vary per match/tournament without a schema change --
-- duel.spectator_delay_ms below overrides this per-match when set). Chess
-- is a perfect-information game already projected identically to players
-- and spectators (game-chess/src/plugin.mjs's own project() comment), so a
-- non-zero default is not needed here; the architecture is what this slice
-- adds, not a claim about what delay chess specifically needs.
ALTER TABLE game ADD COLUMN default_spectator_delay_ms INT NOT NULL DEFAULT 0
  CHECK (default_spectator_delay_ms >= 0);

-- A per-duel override (tournaments, cash tiers, or a future admin control
-- may all want a different delay than the game's own default without
-- changing the game row itself). NULL means "use the game's default."
ALTER TABLE duel ADD COLUMN spectator_delay_ms INT NULL
  CHECK (spectator_delay_ms IS NULL OR spectator_delay_ms >= 0);
-- Slice 11: wires the ALREADY-BUILT EXP/level/achievement/badge primitives
-- (migration 0020, packages/profile/src/{exp,level,achievements,badges}.mjs)
-- to real, authoritative game completion. Those primitives needed no new
-- schema of their own -- exp_event.dedupe_key, player_achievement's PK, and
-- player_badge's PK already make every award idempotent by construction.
--
-- What IS new here is the retry marker this slice's progression sweep
-- needs: "has this SETTLED duel / COMPLETED-and-prize-settled tournament
-- already had its progression processed." A duel award is itself always
-- safe to retry (dedupe_key), so this column is purely a cost/scheduling
-- optimization for the sweep -- "don't re-check 50,000 old duels forever"
-- -- never a correctness requirement on its own. Set ONCE, only after
-- every award for that duel/tournament has been attempted, so a crash
-- mid-processing leaves it unset and the NEXT sweep tick retries safely
-- (the awards underneath are idempotent either way).
--
-- Deliberately NOT a new outbox/event-log table: this codebase already has
-- an established idiom for "the database is the durable queue, a worker
-- polls it" (settlement's own settleDue(), realtime's claim-sweep,
-- reconciliation) -- this is that same idiom, not a new architecture.

ALTER TABLE duel ADD COLUMN progression_processed_at TIMESTAMPTZ NULL;

ALTER TABLE tournament ADD COLUMN progression_processed_at TIMESTAMPTZ NULL;

-- Sweep queries filter on `status = 'SETTLED' AND progression_processed_at
-- IS NULL` (duel) / the tournament equivalent -- a partial index on the
-- unprocessed rows only, so the query stays cheap forever regardless of
-- how many millions of already-processed rows accumulate.
CREATE INDEX duel_progression_pending_idx ON duel (settled_at)
  WHERE status = 'SETTLED' AND progression_processed_at IS NULL;

CREATE INDEX tournament_progression_pending_idx ON tournament (completed_at)
  WHERE status = 'COMPLETED' AND progression_processed_at IS NULL;
-- VS_COMPUTER mode: the platform's first opponent that is not a real
-- player. Two small, additive columns and a fixed catalog of four bot
-- identities (one per difficulty tier) -- deliberately NOT the full
-- game/mode taxonomy migration the Universal Game Platform spec
-- describes (that is a larger, separately-reviewed change touching
-- matchmaking broadly); this is the minimal, safe addition this slice's
-- VS_COMPUTER feature actually needs.
--
-- `player.is_ai` exists so every other system that must never confuse a
-- bot for a human -- wallets, KYC, leaderboards, Global Skill, tournament
-- standings -- has exactly one column to filter on, per the Universal
-- Game Platform spec's own "AI opponents are rows in player" decision.
--
-- `duel.is_vs_computer` exists so settlement and progression, which are
-- otherwise completely game- and opponent-blind, have the one signal
-- they need to enforce "VS_COMPUTER rates nothing and awards nothing" --
-- see settle.mjs's and progression/service.mjs's own comments on exactly
-- where this is checked.

ALTER TABLE player ADD COLUMN is_ai BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE duel ADD COLUMN is_vs_computer BOOLEAN NOT NULL DEFAULT FALSE;

-- A bot must never appear where a real opponent pool is being counted or
-- ranked. This partial index is what a future leaderboard/matchmaking
-- query should scan instead of filtering `is_ai` at read time everywhere.
CREATE INDEX player_human_idx ON player (id) WHERE is_ai = FALSE;

-- The fixed bot catalog: one identity per difficulty, matching
-- packages/game-chess/src/ai.mjs's own Difficulty enum. A bot's `handle`
-- is deliberately human-legible ("ai_easy" etc.) since it is exactly what
-- renders in a player strip, a chat nickname, or a replay -- there is no
-- separate "display name" column for players in this schema, and a bot
-- must render through the SAME profile/nickname path a human does.
INSERT INTO player (id, handle) VALUES
  ('ai-easy',   'ai_easy'),
  ('ai-medium', 'ai_medium'),
  ('ai-hard',   'ai_hard'),
  ('ai-expert', 'ai_expert');

UPDATE player SET is_ai = TRUE WHERE id IN ('ai-easy', 'ai-medium', 'ai-hard', 'ai-expert');
-- PLAY WITH FRIEND: a direct challenge between two known players, distinct
-- from matchmaking_ticket (which pairs a player with WHOEVER is next in a
-- pool) and from vs-computer (which has no second player at all). A
-- challenge is a proposal; it becomes a real duel only once accepted, at
-- which point it is created exactly the way vs-computer.mjs creates its
-- own duel row -- READY, tier FREE, is_vs_computer FALSE -- so every
-- downstream system (dispatch, gateway, settlement, progression) sees an
-- ordinary human-vs-human duel and needs no new case of its own.
--
-- Deliberately no new duel_status/entry_tier values and no new worker:
-- expiry is enforced lazily (a challenge past its own expires_at is simply
-- never actionable and never listed as pending), the same "the database is
-- the durable state, a read filters it" idiom used elsewhere in this
-- schema rather than a sweep whose only job would be flipping a status
-- column no query actually depends on.

CREATE TYPE duel_challenge_status AS ENUM
  ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

CREATE TABLE duel_challenge (
  id             TEXT                    PRIMARY KEY,
  game_id        TEXT                    NOT NULL REFERENCES game(id),
  challenger_id  TEXT                    NOT NULL REFERENCES player(id),
  opponent_id    TEXT                    NOT NULL REFERENCES player(id),
  status         duel_challenge_status   NOT NULL DEFAULT 'PENDING',
  duel_id        TEXT                    REFERENCES duel(id),
  created_at     TIMESTAMPTZ             NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ             NOT NULL,
  responded_at   TIMESTAMPTZ,

  CONSTRAINT duel_challenge_distinct_players CHECK (challenger_id <> opponent_id),
  CONSTRAINT duel_challenge_accepted_has_duel
    CHECK ((status = 'ACCEPTED') = (duel_id IS NOT NULL)),
  CONSTRAINT duel_challenge_resolved_has_timestamp
    CHECK (status = 'PENDING' OR responded_at IS NOT NULL)
);

-- One live challenge per (challenger, opponent, game) at a time -- a second
-- click of "Challenge" while the first is still pending is a no-op, not a
-- pile of duplicate invitations the opponent has to individually dismiss.
CREATE UNIQUE INDEX duel_challenge_pending_unique_idx
  ON duel_challenge (challenger_id, opponent_id, game_id) WHERE status = 'PENDING';

CREATE INDEX duel_challenge_incoming_idx
  ON duel_challenge (opponent_id, created_at DESC) WHERE status = 'PENDING';

CREATE INDEX duel_challenge_outgoing_idx
  ON duel_challenge (challenger_id, created_at DESC) WHERE status = 'PENDING';
-- Two new launch games, both registered on the SAME game/duel/rating/
-- matchmaking machinery chess already runs on -- no new tables, no new
-- columns, no separate match engine. See each plugin's own header for its
-- versioned ruleset (packages/game-checkers/src/checkers.mjs,
-- packages/game-connect-four/src/connect-four.mjs).
--
-- Both are strongly-solved-adjacent games (Connect Four IS fully solved;
-- checkers has been weakly solved) and launch as FREE only, same as
-- migration 0003's own comment already anticipated for Connect Four --
-- a solved game is never cash-eligible regardless of this flag's value,
-- and that policy is enforced server-side, not merely by this default.

INSERT INTO game (id, display_name, plugin_version, is_live, cash_enabled) VALUES
  ('checkers', 'Checkers', 1, TRUE, FALSE),
  ('connect-four', 'Connect Four', 1, TRUE, FALSE);
-- XO (Tic-Tac-Toe) and Speed Math, both registered on the SAME game/duel/
-- rating/matchmaking machinery every other launch game runs on -- no new
-- tables, no separate match engine. See each plugin's own header for its
-- versioned ruleset (packages/game-xo/src/xo.mjs, packages/game-speed-math/
-- src/plugin.mjs's own "CHALLENGE RULES" section).
--
-- Speed Math's own plugin, rules engine and tests have existed since an
-- earlier slice, but this row was never actually inserted -- a real gap
-- (see this migration's own git history): the game could not be
-- matchmade, rated, or tournament-registered without a `game` row, no
-- matter how complete its plugin was. XO is entirely new.
--
-- XO is a solved game (perfect play always draws) and launches FREE only,
-- same policy as every other solved/near-solved launch game (Connect
-- Four, Checkers) per migration 0003's own comment. Speed Math is not
-- solved in the same sense, but launches FREE only for now regardless --
-- cash eligibility is a compliance decision made once, explicitly, per
-- game, never a default this migration should imply either way.

INSERT INTO game (id, display_name, plugin_version, is_live, cash_enabled) VALUES
  ('xo', 'XO', 1, TRUE, FALSE),
  ('speed-math', 'Speed Math', 1, TRUE, FALSE);
-- Dominoes and Backgammon, both registered on the SAME game/duel/rating/
-- matchmaking machinery every other launch game runs on -- no new tables,
-- no separate match engine. See each plugin's own header for its
-- versioned ruleset (packages/game-dominoes/src/dominoes.mjs, packages/
-- game-backgammon/src/backgammon.mjs).
--
-- Both games launch FREE only. Neither is a solved game the way XO,
-- Checkers and Connect Four are (migrations 0028/0029's own reason for
-- FREE-only) -- for these two, FREE-only is the same deliberate,
-- explicit-per-game compliance decision migration 0029 already made for
-- Speed Math: cash eligibility for a brand-new game is never implied by
-- default, only ever turned on later as its own explicit decision.

INSERT INTO game (id, display_name, plugin_version, is_live, cash_enabled) VALUES
  ('dominoes', 'Dominoes', 1, TRUE, FALSE),
  ('backgammon', 'Backgammon', 1, TRUE, FALSE);
-- Seega and Reversi, both registered on the SAME game/duel/rating/
-- matchmaking machinery every other launch game runs on -- no new tables,
-- no separate match engine. See each plugin's own header for its
-- versioned ruleset (packages/game-seega/src/seega.mjs, packages/
-- game-reversi/src/reversi.mjs).
--
-- Both launch FREE only. Reversi is a near-solved game at the level of
-- casual/ranked play (perfect play is known to be a Black loss, though
-- not yet fully solved for every position), the same "no cash on a
-- skill-neutralised board" reasoning migrations 0028/0029 already
-- applied to Checkers and Connect Four. Seega is not remotely solved,
-- but for a brand-new game FREE-only is still the same deliberate,
-- explicit-per-game compliance decision every prior new-game migration
-- in this series has made -- never implied by default.

INSERT INTO game (id, display_name, plugin_version, is_live, cash_enabled) VALUES
  ('seega', 'Seega', 1, TRUE, FALSE),
  ('reversi', 'Reversi', 1, TRUE, FALSE);
-- Gomoku, the tenth and final launch game, registered on the SAME
-- game/duel/rating/matchmaking machinery every other launch game runs
-- on -- no new tables, no separate match engine. See the plugin's own
-- header for its versioned ruleset (packages/game-gomoku/src/gomoku.mjs).
--
-- FREE only at launch, the same deliberate, explicit-per-game compliance
-- decision every prior new-game migration in this series has made --
-- never implied by default, regardless of how solved or unsolved the
-- game actually is.

INSERT INTO game (id, display_name, plugin_version, is_live, cash_enabled) VALUES
  ('gomoku', 'Gomoku', 1, TRUE, FALSE);
-- =============================================================================
-- 0033_tournament_lifecycle_v2.sql
--
-- The unified Tournament + Live Arena system. This migration:
--
--   1. Widens `tournament` with the fields a real admin-facing creation
--      form needs (title, description, a versioned ruleset snapshot,
--      eligibility, visibility) and a genuine SCHEDULED start time,
--      distinct from `starts_at` (which remains the ACTUAL moment play
--      began, stamped by tournament.mjs's own start()).
--   2. Replaces the 6-value tournament_status enum with the 8-value
--      lifecycle: DRAFT, SCHEDULED, REGISTRATION, LIVE, FINALS, COMPLETED,
--      SETTLED, CANCELLED. REGISTRATION_OPEN/REGISTRATION_CLOSED collapse
--      into REGISTRATION (REGISTRATION_CLOSED was never actually written
--      by any code path -- grep the previous tournament.mjs and nothing
--      ever set it); IN_PROGRESS becomes LIVE; FINALS and SETTLED are
--      genuinely new phases (see tournament.mjs's own header on what now
--      drives each transition).
--   3. Adds a minimal, real, in-app `notification` table -- this
--      platform's first, used to tell a registered player their match is
--      ready, their tournament was cancelled, or their prize settled.
--      Deliberately not an email/push pipeline: packages/email already
--      exists for transactional mail and is untouched here; this is the
--      in-app inbox a frontend actually renders.
-- =============================================================================

-- --- 1. New tournament columns ------------------------------------------------

ALTER TABLE tournament
  ADD COLUMN title              TEXT,
  ADD COLUMN description        TEXT,
  -- Snapshot of game.plugin_version at CREATION time, not read live at
  -- round-creation. A tournament that runs for days must play every round
  -- under the SAME ruleset it advertised at signup, even if the game's
  -- plugin_version is bumped while registration is still open -- exactly
  -- the "ruleset versioning" directive applied to a multi-day event, not
  -- just a single duel.
  ADD COLUMN ruleset_version    INT,
  ADD COLUMN eligibility        JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN visibility         TEXT NOT NULL DEFAULT 'PUBLIC',
  -- The admin-set TARGET start time, shown as a countdown before anyone
  -- has played a single pairing. `starts_at` (existing column) stays the
  -- ACTUAL moment start() ran -- the two drift whenever a tournament
  -- starts late or early, which is real information, not a bug.
  ADD COLUMN scheduled_starts_at TIMESTAMPTZ;

UPDATE tournament SET ruleset_version = (SELECT plugin_version FROM game WHERE game.id = tournament.game_id)
  WHERE ruleset_version IS NULL;
ALTER TABLE tournament ALTER COLUMN ruleset_version SET NOT NULL;

ALTER TABLE tournament
  ADD CONSTRAINT tournament_visibility_sane CHECK (visibility IN ('PUBLIC', 'UNLISTED'));

CREATE INDEX tournament_visibility_idx ON tournament (visibility, status);

-- --- 2. The 8-phase lifecycle --------------------------------------------------
--
-- Renaming an enum TYPE in place (ALTER TYPE ... RENAME) and reusing the
-- old name for a fresh, differently-valued type is fragile in practice --
-- any existing PL/pgSQL object (tournament_capacity_guard() below, in
-- this very migration's own predecessor) that declared a local variable
-- or embedded a literal against the OLD type keeps resolving by OID, not
-- by name, and the two same-named-but-distinct types collide the moment
-- anything compares one against the other. The robust, standard technique
-- sidesteps type identity entirely: drop to plain TEXT, remap the VALUES
-- with ordinary string equality (no enum type in scope at all), then
-- promote to the new enum once every row already holds one of its labels.

-- Both partial indexes below embed a `tournament_status` literal in their
-- WHERE clause -- `tournament_open_idx` (this migration's own predecessor)
-- and `tournament_progression_pending_idx` (migration 0025, easy to miss
-- since it lives nowhere near this file). Both must be dropped before the
-- column's type changes and rebuilt after, or the first one's rebuild
-- attempt is what actually produces "operator does not exist: text =
-- tournament_status" -- a real trap this migration's own comment above
-- exists to warn about, discovered by hitting it.
DROP INDEX tournament_open_idx;
DROP INDEX tournament_progression_pending_idx;

ALTER TABLE tournament ALTER COLUMN status DROP DEFAULT;
ALTER TABLE tournament ALTER COLUMN status TYPE TEXT USING status::text;
DROP TYPE tournament_status;

UPDATE tournament SET status = CASE status
  WHEN 'REGISTRATION_OPEN'   THEN 'REGISTRATION'
  WHEN 'REGISTRATION_CLOSED' THEN 'REGISTRATION'
  WHEN 'IN_PROGRESS'         THEN 'LIVE'
  ELSE status
END;

CREATE TYPE tournament_status AS ENUM (
  'DRAFT', 'SCHEDULED', 'REGISTRATION', 'LIVE', 'FINALS',
  'COMPLETED', 'SETTLED', 'CANCELLED'
);
ALTER TABLE tournament ALTER COLUMN status TYPE tournament_status USING status::tournament_status;
ALTER TABLE tournament ALTER COLUMN status SET DEFAULT 'DRAFT'::tournament_status;

CREATE INDEX tournament_open_idx ON tournament (registration_closes_at)
  WHERE status = 'REGISTRATION';
-- Widened to COMPLETED OR SETTLED: packages/progression's own
-- tournamentProgressionDue() gates on "a tournament_settlement row
-- exists" (the real, authoritative signal), not on the exact status
-- label -- see that file's own updated comment on why SETTLED must
-- match here too, now that settlePrizes() actually reaches it.
CREATE INDEX tournament_progression_pending_idx ON tournament (completed_at)
  WHERE status IN ('COMPLETED', 'SETTLED') AND progression_processed_at IS NULL;

-- tournament_capacity_guard() (migration 0010) still checks the OLD literal
-- 'REGISTRATION_OPEN', which no longer exists as a status value -- left
-- as-is, every registration attempt would raise "tournament % is not open
-- for registration" forever, since no tournament can ever hold that value
-- again. CREATE OR REPLACE keeps the function's OID (and therefore the
-- existing trigger binding on tournament_registration) intact; only the
-- literal changes.
CREATE OR REPLACE FUNCTION tournament_capacity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_capacity INT;
  v_status   tournament_status;
  v_count    INT;
BEGIN
  SELECT capacity, status INTO v_capacity, v_status
    FROM tournament WHERE id = NEW.tournament_id FOR UPDATE;

  IF v_status <> 'REGISTRATION' THEN
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

-- --- 3. Notifications ----------------------------------------------------------

CREATE TABLE notification (
  id         TEXT        PRIMARY KEY,
  player_id  TEXT        NOT NULL REFERENCES player(id),
  type       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notification_player_idx ON notification (player_id, created_at DESC);
CREATE INDEX notification_unread_idx ON notification (player_id) WHERE read_at IS NULL;
-- =============================================================================
-- 0034_engagement_and_identity.sql
--
-- Long-term player engagement and identity: mastery, streaks, daily
-- challenges, replay favorites/watch-history, profile frames, and a wider
-- achievement/badge catalog. Deliberately NOT included as a new table:
--
--   * Per-game MASTERY is never stored. It is a pure function of data that
--     already exists and is already authoritative -- `rating.games_played`
--     and `game_rating_percentile.percentile` (migration 0011) -- computed
--     fresh on every read by packages/mastery, the same way Global Skill
--     is computed fresh by packages/global-skill rather than cached. A
--     stored mastery LEVEL could drift from the rating data that is
--     supposed to justify it; a computed one cannot.
--   * GLOBAL SKILL and per-game RATING already exist in full (migrations
--     0003, 0011) and are untouched here.
--
-- What IS new: the state that genuinely has no other home --
-- daily-challenge assignment/progress, streak length, replay
-- favorite/watched marks, and the frame cosmetic (structurally identical
-- to `badge`/`player_badge` from migration 0020, since a frame is the
-- same "catalog + one-row-per-grant + one-selected-at-a-time" shape).
-- =============================================================================

-- --- Achievement / badge catalog expansion ------------------------------------
-- Still "infrastructure first" (migration 0020's own words) -- a handful
-- of new, genuinely distinct roadmap goals, not "dozens of unlocks".
-- MASTERY_* and STREAK_* are account-wide ("in ANY game" / "any streak"),
-- not per-game, so one row each suffices; a per-game mastery achievement
-- would need 10x the rows for no real product value the roadmap asks for.

INSERT INTO achievement (code) VALUES
  ('TOURNAMENT_CHAMPION'),
  ('MASTERY_ADVANCED_ANY'),
  ('MASTERY_EXPERT_ANY'),
  ('MASTERY_MASTER_ANY'),
  ('MULTI_GAME_CHAMPION'),
  ('STREAK_7'),
  ('STREAK_30');

INSERT INTO badge (code, kind) VALUES
  ('TOURNAMENT_CHAMPION', 'EARNED'),
  ('MASTERY_ADVANCED_ANY', 'EARNED'),
  ('MASTERY_EXPERT_ANY', 'EARNED'),
  ('MASTERY_MASTER_ANY', 'EARNED'),
  ('MULTI_GAME_CHAMPION', 'EARNED'),
  ('STREAK_7', 'EARNED'),
  ('STREAK_30', 'EARNED');

-- --- Frames --------------------------------------------------------------------
-- A decorative border around a player's avatar -- mechanically identical
-- to badge/player_badge/selected_badge_code, kept as its own table rather
-- than folded into `badge` because a frame and a badge render in
-- different places on every profile surface and a player selects one of
-- EACH independently (a frame is not a kind of badge, it just shares the
-- same earn/select shape).

CREATE TABLE frame (
  code       TEXT        PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE player_frame (
  player_id  TEXT        NOT NULL REFERENCES player(id),
  frame_code TEXT        NOT NULL REFERENCES frame(code),
  earned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, frame_code)
);

ALTER TABLE player
  ADD COLUMN selected_frame_code TEXT REFERENCES frame(code);

INSERT INTO frame (code) VALUES ('STREAK_7_FRAME'), ('STREAK_30_FRAME');

-- --- Healthy streaks -----------------------------------------------------------
-- One activity credit per UTC calendar day, for finishing ANY real duel
-- (including a VS_COMPUTER training match -- see packages/engagement's
-- own header for why this differs from the EXP/achievement gate, which
-- excludes training matches). Never gated on tier, stake, or a deposit --
-- directive-level requirement, not an implementation detail: a FREE-tier
-- player and a CASH-tier player build the exact same streak from the
-- exact same rule.

CREATE TABLE player_streak (
  player_id          TEXT        PRIMARY KEY REFERENCES player(id),
  current_length     INT         NOT NULL DEFAULT 0,
  longest_length     INT         NOT NULL DEFAULT 0,
  last_activity_date DATE,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency for milestone rewards (3/7/30-day): granting the SAME
-- milestone to the SAME player twice is structurally impossible, the
-- identical pattern player_achievement already uses.
CREATE TABLE streak_reward (
  player_id  TEXT        NOT NULL REFERENCES player(id),
  milestone  INT         NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, milestone)
);

-- --- Daily challenges ------------------------------------------------------
-- `metric` names a real, server-computed signal (see
-- packages/engagement/src/daily-challenges.mjs for the exact query behind
-- each) -- never a value the client reports. `game_id` narrows a metric to
-- one game (e.g. "finish N Speed Math matches"); NULL means the metric
-- already applies across every game. No deposit, stake, or CASH-tier
-- requirement appears anywhere in this catalog -- directive requirement,
-- not an oversight.

CREATE TABLE daily_challenge_template (
  id           TEXT    PRIMARY KEY,
  code         TEXT    NOT NULL UNIQUE,
  metric       TEXT    NOT NULL,
  game_id      TEXT    REFERENCES game(id),
  target_count INT     NOT NULL CHECK (target_count > 0),
  exp_reward   INT     NOT NULL CHECK (exp_reward > 0),
  active       BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO daily_challenge_template (id, code, metric, game_id, target_count, exp_reward) VALUES
  ('dct_win_free',       'WIN_FREE_MATCHES',    'WIN_FREE_MATCHES',     NULL,          3, 30),
  ('dct_speed_math',     'PLAY_SPEED_MATH',     'PLAY_GAME_MATCHES',    'speed-math', 10, 25),
  ('dct_diff_games',     'PLAY_DIFFERENT_GAMES','PLAY_DIFFERENT_GAMES', NULL,          2, 20),
  ('dct_watch_replay',   'WATCH_A_REPLAY',      'WATCH_REPLAYS',        NULL,          1, 15),
  ('dct_training',       'FINISH_TRAINING',     'FINISH_TRAINING',      NULL,          1, 15);

-- One assignment row per (player, template, day) -- a player sees the
-- SAME small set of challenges all day even if this row is looked up
-- from ten different requests; progress_count is recomputed from the
-- real underlying signal on every read (see the service), never
-- incremented by a client-reported event, so it can never be inflated by
-- a retried or replayed request.
CREATE TABLE daily_challenge_assignment (
  id             TEXT        PRIMARY KEY,
  player_id      TEXT        NOT NULL REFERENCES player(id),
  template_id    TEXT        NOT NULL REFERENCES daily_challenge_template(id),
  assigned_date  DATE        NOT NULL,
  progress_count INT         NOT NULL DEFAULT 0,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (player_id, template_id, assigned_date)
);

CREATE INDEX daily_challenge_assignment_today_idx
  ON daily_challenge_assignment (player_id, assigned_date);

-- --- Replay center ---------------------------------------------------------
-- The moves/outcome themselves are never stored twice -- a replay is
-- always rebuilt on demand from `duel_event` (migration 0003) via
-- packages/duel-engine's own serializeReplay(). These two tables record
-- only which duels a player marked as a favorite or has actually opened,
-- which is real per-viewer state that has nowhere else to live.

CREATE TABLE player_replay_favorite (
  player_id    TEXT        NOT NULL REFERENCES player(id),
  duel_id      TEXT        NOT NULL REFERENCES duel(id),
  favorited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, duel_id)
);

-- First-view timestamp only -- ON CONFLICT DO NOTHING on a re-watch (see
-- the service), both because "watched" is a one-time fact and because
-- the daily "watch a replay" challenge must count a distinct replay once,
-- not once per click.
CREATE TABLE replay_view (
  player_id  TEXT        NOT NULL REFERENCES player(id),
  duel_id    TEXT        NOT NULL REFERENCES duel(id),
  viewed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, duel_id)
);

CREATE INDEX replay_view_player_idx ON replay_view (player_id, viewed_at DESC);
-- =============================================================================
-- 0035_rake_ladder.sql
--
-- Financial Architecture Reconciliation, item 1: the platform fee ceiling.
--
-- 0004_economy_and_settlement.sql capped rake_bps at 2000 (20%) -- a
-- deliberately conservative launch ceiling. The approved architecture raises
-- the competitive band to 10%-25% (1000-2500 bps) while explicitly allowing a
-- FREE-tier rule to charge nothing at all. The naive fix -- just widening the
-- upper bound -- would also silently open every value from 1 to 999 bps to a
-- CASH rule, which is not "a safely configured fee", it is what a fat-fingered
-- admin typing "1250" as "125" produces. So the constraint stays two-sided:
--
--   * exactly 0 is allowed (a rule that charges nothing -- FREE tier, or a
--     deliberately zero-rated CASH promotion; both are legitimate configured
--     states, never an unconfigured gap)
--   * or a value inside the documented competitive band, 1000-2500
--   * nothing else -- not negative, not above 2500, not a sub-band typo
--
-- rake.mjs mirrors this exact predicate (see its own header) so the
-- application and the database can never disagree about what a valid fee is.
-- =============================================================================

ALTER TABLE economy_rule DROP CONSTRAINT economy_rule_rake_sane;

ALTER TABLE economy_rule
  ADD CONSTRAINT economy_rule_rake_sane
    CHECK (rake_bps = 0 OR rake_bps BETWEEN 1000 AND 2500);
-- =============================================================================
-- 0036_fee_snapshot.sql
--
-- Financial Architecture Reconciliation, item 2: the fee snapshot.
--
-- Before this migration, both settle() (packages/settlement/src/settle.mjs)
-- and settlePrizes() (packages/tournament/src/tournament.mjs) called
-- economy_resolve() at SETTLEMENT time, using the rule in force when the game
-- ended. That is closer to correct than resolving at "now" would be, but it
-- is still wrong: an admin who raises the rate while a match is IN FLIGHT
-- changes what that match pays, because the rule is re-resolved after the
-- fact rather than fixed when the two players actually agreed to play.
--
-- The fix: resolve the applicable rule ONCE, at creation, and freeze it onto
-- the row. Settlement then reads the frozen number and resolves nothing.
-- Concretely:
--
--   * mm_pair() (0003) -- the only production path that creates a CASH duel
--     -- now resolves economy_resolve() as PART OF the same INSERT statement
--     that creates the duel row, so there is no window between "check the
--     fee" and "create the match" for a concurrent admin write to land in.
--     A CASH pairing with no matching rule is refused outright: a duel that
--     cannot be priced must not be created, not created unpriced.
--
--   * The resolved rake_bps, together with the rule reference and the min/max
--     clamps that applied to it (a rule can change its min/max later; the
--     match must keep the ones that were actually in force), are stored on
--     the duel row and made immutable once set -- a repriced admin rule
--     cannot reach back into a match already under way.
--
--   * tournament (0010) gets the same treatment for tournament-wide CASH
--     pricing, stamped at tournament creation rather than resolved with
--     now() inside settlePrizes() as it was before.
--
-- Rows created before this migration (and rows any test fixture inserts
-- directly, bypassing mm_pair()/tournament creation) simply have no
-- snapshot -- settle.mjs and tournament.mjs's settlePrizes() both fall back
-- to resolving at settlement for exactly those rows, unchanged from prior
-- behaviour. Every row created through the real production path from this
-- migration forward always carries a snapshot, so that fallback is dead code
-- in production and exists only for backward compatibility with data and
-- fixtures that predate creation-time pricing.
-- =============================================================================

-- --- duel: creation-time fee snapshot ----------------------------------------

ALTER TABLE duel
  ADD COLUMN priced_rake_bps           INT,
  ADD COLUMN priced_economy_rule_id    TEXT,
  ADD COLUMN priced_economy_rule_version INT,
  ADD COLUMN priced_min_rake_minor     BIGINT,
  ADD COLUMN priced_max_rake_minor     BIGINT,
  ADD COLUMN priced_at                 TIMESTAMPTZ;

-- A duel is priced as a unit: either every priced_* column is set, or none
-- of them are. There is no such thing as "half a fee snapshot".
ALTER TABLE duel
  ADD CONSTRAINT duel_priced_all_or_nothing
    CHECK (
      (priced_rake_bps IS NULL AND priced_economy_rule_id IS NULL
       AND priced_economy_rule_version IS NULL AND priced_at IS NULL)
      OR
      (priced_rake_bps IS NOT NULL AND priced_economy_rule_id IS NOT NULL
       AND priced_economy_rule_version IS NOT NULL AND priced_at IS NOT NULL)
    );

CREATE FUNCTION duel_pricing_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.priced_rake_bps IS NOT NULL AND (
       NEW.priced_rake_bps            IS DISTINCT FROM OLD.priced_rake_bps
    OR NEW.priced_economy_rule_id     IS DISTINCT FROM OLD.priced_economy_rule_id
    OR NEW.priced_economy_rule_version IS DISTINCT FROM OLD.priced_economy_rule_version
    OR NEW.priced_min_rake_minor      IS DISTINCT FROM OLD.priced_min_rake_minor
    OR NEW.priced_max_rake_minor      IS DISTINCT FROM OLD.priced_max_rake_minor
    OR NEW.priced_at                  IS DISTINCT FROM OLD.priced_at
  ) THEN
    RAISE EXCEPTION 'a duel''s fee snapshot is immutable once priced'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER duel_pricing_immutable_trg
  BEFORE UPDATE ON duel
  FOR EACH ROW EXECUTE FUNCTION duel_pricing_immutable();

-- --- tournament: the same treatment for pool-wide CASH pricing ---------------

ALTER TABLE tournament
  ADD COLUMN priced_rake_bps           INT,
  ADD COLUMN priced_economy_rule_id    TEXT,
  ADD COLUMN priced_economy_rule_version INT,
  ADD COLUMN priced_min_rake_minor     BIGINT,
  ADD COLUMN priced_max_rake_minor     BIGINT,
  ADD COLUMN priced_at                 TIMESTAMPTZ;

ALTER TABLE tournament
  ADD CONSTRAINT tournament_priced_all_or_nothing
    CHECK (
      (priced_rake_bps IS NULL AND priced_economy_rule_id IS NULL
       AND priced_economy_rule_version IS NULL AND priced_at IS NULL)
      OR
      (priced_rake_bps IS NOT NULL AND priced_economy_rule_id IS NOT NULL
       AND priced_economy_rule_version IS NOT NULL AND priced_at IS NOT NULL)
    );

CREATE FUNCTION tournament_pricing_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.priced_rake_bps IS NOT NULL AND (
       NEW.priced_rake_bps            IS DISTINCT FROM OLD.priced_rake_bps
    OR NEW.priced_economy_rule_id     IS DISTINCT FROM OLD.priced_economy_rule_id
    OR NEW.priced_economy_rule_version IS DISTINCT FROM OLD.priced_economy_rule_version
    OR NEW.priced_min_rake_minor      IS DISTINCT FROM OLD.priced_min_rake_minor
    OR NEW.priced_max_rake_minor      IS DISTINCT FROM OLD.priced_max_rake_minor
    OR NEW.priced_at                  IS DISTINCT FROM OLD.priced_at
  ) THEN
    RAISE EXCEPTION 'a tournament''s fee snapshot is immutable once priced'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tournament_pricing_immutable_trg
  BEFORE UPDATE ON tournament
  FOR EACH ROW EXECUTE FUNCTION tournament_pricing_immutable();

-- --- mm_pair(): price the duel as part of creating it ------------------------
--
-- CREATE OR REPLACE, same signature and same pairing logic as 0003 -- the
-- only change is resolving and stamping the fee for a CASH pairing, and
-- refusing to create one that cannot be priced.

CREATE OR REPLACE FUNCTION mm_pair(
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
  v_rake_bps      INT;
  v_rule_id       TEXT;
  v_rule_version  INT;
  v_min_rake      BIGINT;
  v_max_rake      BIGINT;
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

  -- Price it NOW, as part of creating it -- not later, at settlement. This
  -- SELECT and the INSERT below run inside the same function invocation
  -- (itself one atomic unit from the caller's point of view), so a
  -- concurrent admin commit to economy_rule either happened-before this
  -- resolution or happens-after it; there is no window in which this
  -- pairing observes one rule but stamps a different one.
  IF p_tier = 'CASH' THEN
    SELECT rake_bps, rule_id, rule_version, min_rake_minor, max_rake_minor
      INTO v_rake_bps, v_rule_id, v_rule_version, v_min_rake, v_max_rake
      FROM economy_resolve(p_game_id, p_tier, now());
    IF v_rake_bps IS NULL THEN
      -- A CASH duel that cannot be priced must not be created at all --
      -- not created and left to fail later at settlement.
      RAISE EXCEPTION 'no economy rule configured for game % tier CASH', p_game_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
                    tier, stake_minor, asset, initial_state, seed, time_control, status,
                    priced_rake_bps, priced_economy_rule_id, priced_economy_rule_version,
                    priced_min_rake_minor, priced_max_rake_minor, priced_at)
  SELECT p_duel_id, p_game_id, g.plugin_version, v_pairing_key, v_seat0, v_seat1,
         p_tier, p_stake_minor,
         CASE WHEN p_tier = 'CASH' THEN 'USDT' ELSE NULL END::TEXT,
         p_initial, p_seed, p_time_control,
         -- A cash duel is RESERVED, not READY: entry fees must be locked in the
         -- ledger before play begins. Only a free duel is ready on creation.
         (CASE WHEN p_tier = 'CASH' THEN 'RESERVED' ELSE 'READY' END)::duel_status,
         v_rake_bps, v_rule_id, v_rule_version, v_min_rake, v_max_rake,
         CASE WHEN p_tier = 'CASH' THEN now() ELSE NULL END
    FROM game g WHERE g.id = p_game_id;

  UPDATE matchmaking_ticket
     SET status = 'MATCHED', duel_id = p_duel_id
   WHERE id IN (a.id, b.id);

  RETURN QUERY SELECT p_duel_id, v_seat0, v_seat1, TRUE;
END;
$$;
-- =============================================================================
-- 0037_stablecoin_valuation.sql
--
-- Financial Architecture Reconciliation, item 3: stablecoin USD valuation.
--
-- Before this migration there was no valuation model at all: USDT was
-- treated as worth exactly $1.00 forever, nowhere on record, with no source,
-- no observation time, and no way to notice or react if that ever stopped
-- being true. "USDT is a USD-pegged stablecoin" is an assumption, not a law
-- of nature, and the architecture is explicit that it must never be treated
-- as one silently.
--
-- What this migration adds:
--
--   * asset gains peg metadata (is it pegged, to what, within what tolerance)
--     and an enabled flag, extending the SAME table every other financial
--     table already references -- not a second, parallel asset registry.
--   * network: the chain a payment moves on, first-class instead of a bare
--     TEXT column repeated across deposit/withdrawal/payout_address.
--   * valuation_source: where a rate came from (an assumed peg, an oracle, an
--     exchange mid-price, or a manual entry -- each accountable differently).
--   * valuation_snapshot: an append-only, timestamped, sourced observation of
--     an asset's USD rate. NEVER a single mutable "current rate" column --
--     that would be exactly the "hardcoded 1.0000 forever" failure mode
--     restated with extra steps.
--   * record_valuation_snapshot(): the one way to add an observation. It
--     decides NOMINAL vs DEPEGGED against the asset's own configured
--     tolerance in the same statement that inserts the row, so "an asset
--     depegged and nothing downstream noticed" cannot happen between two
--     separate steps.
--
-- Integer arithmetic throughout: usd_rate_x1e8 is the rate scaled by 10^8
-- (1.00000000 USD = 100000000), the same fixed-point discipline the ledger
-- already uses for money. There is no floating point anywhere in this file.
-- =============================================================================

-- --- asset: peg metadata ------------------------------------------------------

ALTER TABLE asset
  ADD COLUMN kind               TEXT    NOT NULL DEFAULT 'STABLECOIN'
    CHECK (kind IN ('STABLECOIN', 'FIAT', 'OTHER')),
  ADD COLUMN is_pegged          BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN peg_asset          TEXT,                          -- e.g. 'USD'
  ADD COLUMN peg_tolerance_bps  INT     NOT NULL DEFAULT 100,  -- 1.00% default band
  ADD COLUMN enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  ADD CONSTRAINT asset_peg_tolerance_sane CHECK (peg_tolerance_bps BETWEEN 1 AND 5000);

-- Every row existing before this migration is USDT (0001's only seed), and
-- USDT is pegged to USD -- set that before adding the constraint that
-- requires it, so the constraint's own validation scan (which runs
-- immediately, against every existing row) has something true to check.
UPDATE asset SET peg_asset = 'USD' WHERE is_pegged;

ALTER TABLE asset
  ADD CONSTRAINT asset_pegged_has_peg_asset CHECK (NOT is_pegged OR peg_asset IS NOT NULL);

-- --- network -------------------------------------------------------------

CREATE TABLE network (
  code               TEXT PRIMARY KEY,             -- 'TRON'
  display_name       TEXT NOT NULL,                -- 'TRON (TRC20)'
  confirmation_depth INT  NOT NULL DEFAULT 20,
  enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT network_confirmation_depth_sane CHECK (confirmation_depth BETWEEN 1 AND 200)
);

INSERT INTO network (code, display_name, confirmation_depth, enabled)
VALUES ('TRON', 'TRON (TRC20)', 20, TRUE);

-- --- valuation sources ---------------------------------------------------

CREATE TABLE valuation_source (
  code         TEXT PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('PEG_ASSUMED', 'ORACLE', 'EXCHANGE_MID', 'MANUAL')),
  display_name TEXT NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO valuation_source (code, kind, display_name) VALUES
  ('PEG_ASSUMED',  'PEG_ASSUMED',  'Assumed 1:1 peg (no live feed configured)'),
  ('MANUAL',       'MANUAL',       'Manually entered by an admin');

-- --- valuation snapshots (append-only) -------------------------------------

CREATE TABLE valuation_snapshot (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset          TEXT        NOT NULL REFERENCES asset(code),
  usd_rate_x1e8  BIGINT      NOT NULL,
  source         TEXT        NOT NULL REFERENCES valuation_source(code),
  observed_at    TIMESTAMPTZ NOT NULL,
  effective_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  status         TEXT        NOT NULL CHECK (status IN ('NOMINAL', 'DEPEGGED', 'STALE')),
  confidence_bps INT         NOT NULL DEFAULT 10000,
  created_by     TEXT,                        -- admin id, for MANUAL; NULL otherwise
  reason         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valuation_rate_positive CHECK (usd_rate_x1e8 > 0),
  CONSTRAINT valuation_confidence_sane CHECK (confidence_bps BETWEEN 0 AND 10000),
  CONSTRAINT valuation_manual_is_accountable
    CHECK (source <> 'MANUAL' OR (created_by IS NOT NULL AND reason IS NOT NULL))
);

CREATE INDEX valuation_snapshot_asset_idx ON valuation_snapshot (asset, effective_at DESC);

CREATE TRIGGER valuation_snapshot_immutable
  BEFORE UPDATE OR DELETE ON valuation_snapshot
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

-- The one USD constant this system is allowed to have: the launch peg
-- assumption, on record with a source and a timestamp -- not a bare literal
-- buried in application code with neither.
INSERT INTO valuation_snapshot (asset, usd_rate_x1e8, source, observed_at, status)
VALUES ('USDT', 100000000, 'PEG_ASSUMED', now(), 'NOMINAL');

-- --- reads -----------------------------------------------------------------

/** The most recently effective, non-superseded valuation for an asset. */
CREATE FUNCTION valuation_current(p_asset TEXT)
RETURNS valuation_snapshot LANGUAGE sql STABLE AS $$
  SELECT v.* FROM valuation_snapshot v
   WHERE v.asset = p_asset AND v.effective_at <= now()
   ORDER BY v.effective_at DESC, v.id DESC
   LIMIT 1;
$$;

/**
 * How far the current rate has drifted from its peg, in basis points.
 * A non-pegged asset (is_pegged = FALSE) is never "depegged" -- the concept
 * does not apply to it.
 */
CREATE FUNCTION valuation_deviation_bps(p_asset TEXT)
RETURNS INT LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN NOT a.is_pegged THEN 0
    ELSE (ABS(v.usd_rate_x1e8 - 100000000) * 10000 / 100000000)::INT
  END
  FROM asset a
  LEFT JOIN LATERAL (SELECT * FROM valuation_current(p_asset)) v ON TRUE
  WHERE a.code = p_asset;
$$;

CREATE FUNCTION asset_is_depegged(p_asset TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT valuation_deviation_bps(p_asset) > a.peg_tolerance_bps
       FROM asset a WHERE a.code = p_asset),
    FALSE
  );
$$;
-- =============================================================================
-- 0038_payment_rail.sql
--
-- Financial Architecture Reconciliation, item 4: a data-driven payment rail
-- model, and the item 3 depeg circuit breaker that acts on it.
--
-- Before this migration, "USDT on TRON" was not a row anywhere -- it was an
-- assumption baked into payments.mjs's DEFAULTS (confirmationDepth: 20) and
-- into isValidTronAddress()'s hardcoded TRON regex. Turning a rail off meant
-- editing source and redeploying. A payment_rail row is the single place an
-- admin (or an automated depeg observation) can turn a specific asset/network
-- combination's deposits or withdrawals on or off, independently of each
-- other, without a deploy.
--
-- record_valuation_snapshot() (referencing this migration's payment_rail
-- table, hence living here rather than in 0037) is where blocker 3's
-- requirement actually bites: "if an asset depegs beyond the allowed
-- threshold, do NOT silently continue -- move the rail into a risk/paused
-- state according to configuration." The configuration in question is
-- payment_rail.pause_withdrawals_on_depeg: deposits always pause on a depeg
-- (accepting more of a currency that just lost its peg is never correct),
-- but whether withdrawals also pause is a deliberate per-rail admin choice,
-- not a hardcoded assumption either way.
-- =============================================================================

CREATE TYPE rail_status AS ENUM ('ACTIVE', 'RISK_PAUSED', 'ADMIN_PAUSED', 'RETIRED');

CREATE TABLE payment_rail (
  id                          TEXT PRIMARY KEY,        -- 'USDT_TRON'
  asset                       TEXT NOT NULL REFERENCES asset(code),
  network                     TEXT NOT NULL REFERENCES network(code),
  status                      rail_status NOT NULL DEFAULT 'ACTIVE',
  enabled                     BOOLEAN NOT NULL DEFAULT TRUE,
  deposits_enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  withdrawals_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  min_deposit_minor           BIGINT  NOT NULL DEFAULT 5000000,   -- 5.000000
  max_deposit_minor           BIGINT,
  min_withdrawal_minor        BIGINT  NOT NULL DEFAULT 5000000,
  max_withdrawal_minor        BIGINT,
  confirmation_depth          INT     NOT NULL DEFAULT 20,
  -- Config, not a hardcoded assumption: does a depeg also pause withdrawals
  -- on this rail, or only new deposits? Defaults to leaving withdrawals open
  -- -- a depegging stablecoin is precisely when users most want their funds
  -- out, and the platform holds the underlying tokens one-for-one regardless
  -- of their USD price, so a payout remains fully funded either way.
  pause_withdrawals_on_depeg BOOLEAN NOT NULL DEFAULT FALSE,
  jurisdictions_allowed       JSONB   NOT NULL DEFAULT '["*"]'::jsonb,  -- ["*"] = everywhere
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT payment_rail_unique UNIQUE (asset, network),
  CONSTRAINT payment_rail_deposit_bounds
    CHECK (max_deposit_minor IS NULL OR max_deposit_minor >= min_deposit_minor),
  CONSTRAINT payment_rail_withdrawal_bounds
    CHECK (max_withdrawal_minor IS NULL OR max_withdrawal_minor >= min_withdrawal_minor),
  CONSTRAINT payment_rail_confirmation_depth_sane CHECK (confirmation_depth BETWEEN 1 AND 200)
);

INSERT INTO payment_rail (id, asset, network, status, enabled, deposits_enabled, withdrawals_enabled, confirmation_depth)
VALUES ('USDT_TRON', 'USDT', 'TRON', 'ACTIVE', TRUE, TRUE, TRUE, 20);

-- Append-only, exactly like withdrawal_transition: every enable/disable is on
-- the record, with who did it and why, not just the current state.
CREATE TABLE rail_configuration_change (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rail_id    TEXT NOT NULL REFERENCES payment_rail(id),
  field      TEXT NOT NULL,
  old_value  TEXT,
  new_value  TEXT,
  actor_type TEXT NOT NULL,        -- SYSTEM | ADMIN
  actor_id   TEXT,
  reason     TEXT,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rail_configuration_change_admin_is_accountable
    CHECK (actor_type <> 'ADMIN' OR (actor_id IS NOT NULL AND reason IS NOT NULL))
);

CREATE TRIGGER rail_configuration_change_immutable
  BEFORE UPDATE OR DELETE ON rail_configuration_change
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE INDEX rail_configuration_change_rail_idx ON rail_configuration_change (rail_id, id);

/**
 * Is this asset/network pair currently allowed to accept this operation?
 *
 * RISK_PAUSED is deliberately NOT treated as an automatic full stop here:
 * record_valuation_snapshot() already set deposits_enabled/withdrawals_enabled
 * to exactly what a depeg should block (deposits always; withdrawals only if
 * that rail's own pause_withdrawals_on_depeg says so), so gating on status
 * here too would silently override that per-operation decision and block
 * withdrawals during every depeg regardless of configuration -- exactly the
 * hardcoded-assumption failure mode this model exists to avoid. ADMIN_PAUSED
 * and RETIRED ARE full stops: an admin who pauses a rail, or retires it,
 * means both operations, unconditionally.
 */
CREATE FUNCTION rail_enabled_for(p_asset TEXT, p_network TEXT, p_operation TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT r.enabled AND r.status NOT IN ('ADMIN_PAUSED', 'RETIRED') AND (
       CASE p_operation
         WHEN 'DEPOSIT'    THEN r.deposits_enabled
         WHEN 'WITHDRAWAL' THEN r.withdrawals_enabled
         ELSE FALSE
       END)
       FROM payment_rail r WHERE r.asset = p_asset AND r.network = p_network),
    FALSE
  );
$$;

/** An admin flips a rail's status explicitly, audited, four-eyes optional here
 * (rail control is operational, not a two-admin financial rule change) but
 * always attributable when the actor is an admin. */
CREATE FUNCTION set_rail_status(
  p_rail_id TEXT, p_status rail_status, p_actor_type TEXT, p_actor_id TEXT, p_reason TEXT
) RETURNS payment_rail LANGUAGE plpgsql AS $$
DECLARE
  v_old rail_status;
  v_row payment_rail;
BEGIN
  SELECT status INTO v_old FROM payment_rail WHERE id = p_rail_id FOR UPDATE;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'no such rail: %', p_rail_id USING ERRCODE = 'foreign_key_violation';
  END IF;

  UPDATE payment_rail SET status = p_status, updated_at = now()
   WHERE id = p_rail_id
   RETURNING * INTO v_row;

  INSERT INTO rail_configuration_change (rail_id, field, old_value, new_value, actor_type, actor_id, reason)
  VALUES (p_rail_id, 'status', v_old::text, p_status::text, p_actor_type, p_actor_id, p_reason);

  RETURN v_row;
END;
$$;

/**
 * Record an independent USD valuation observation for an asset. This is the
 * ONLY way a valuation_snapshot row is created (mirrors ledger_post() being
 * the only way money moves) -- so the depeg check below can never be
 * bypassed by an insert that goes straight to the table.
 *
 * Deposits always pause on a depeg for every ACTIVE rail on that asset;
 * whether withdrawals also pause is each rail's own
 * pause_withdrawals_on_depeg configuration. Already-paused rails are left
 * alone (the UPDATE's WHERE clause only matches status = 'ACTIVE'), which is
 * what makes two concurrent depeg observations for the same asset safe: at
 * most one of them actually transitions any given rail, and the other's
 * UPDATE simply matches zero rows.
 */
CREATE FUNCTION record_valuation_snapshot(
  p_asset          TEXT,
  p_usd_rate_x1e8  BIGINT,
  p_source         TEXT,
  p_observed_at    TIMESTAMPTZ,
  p_confidence_bps INT  DEFAULT 10000,
  p_created_by     TEXT DEFAULT NULL,
  p_reason         TEXT DEFAULT NULL
) RETURNS TABLE (snapshot_id BIGINT, status TEXT, deviation_bps INT, rails_paused INT)
LANGUAGE plpgsql AS $$
DECLARE
  v_tolerance INT;
  v_is_pegged BOOLEAN;
  v_deviation INT;
  v_status    TEXT;
  v_id        BIGINT;
  v_paused    INT := 0;
BEGIN
  IF p_usd_rate_x1e8 <= 0 THEN
    RAISE EXCEPTION 'usd_rate_x1e8 must be positive, got %', p_usd_rate_x1e8
      USING ERRCODE = 'check_violation';
  END IF;

  -- Locking the asset row serialises two concurrent observations for the
  -- SAME asset, so the "which one gets to pause the rail" question has a
  -- deterministic answer (whichever commits first) rather than a race.
  SELECT peg_tolerance_bps, is_pegged INTO v_tolerance, v_is_pegged
    FROM asset WHERE code = p_asset FOR UPDATE;
  IF v_tolerance IS NULL THEN
    RAISE EXCEPTION 'no such asset: %', p_asset USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_deviation := (ABS(p_usd_rate_x1e8 - 100000000) * 10000 / 100000000)::INT;
  v_status := CASE WHEN v_is_pegged AND v_deviation > v_tolerance THEN 'DEPEGGED' ELSE 'NOMINAL' END;

  INSERT INTO valuation_snapshot
    (asset, usd_rate_x1e8, source, observed_at, status, confidence_bps, created_by, reason)
  VALUES
    (p_asset, p_usd_rate_x1e8, p_source, p_observed_at, v_status, p_confidence_bps, p_created_by, p_reason)
  RETURNING id INTO v_id;

  IF v_status = 'DEPEGGED' THEN
    WITH paused AS (
      UPDATE payment_rail r
         SET status = 'RISK_PAUSED',
             deposits_enabled = FALSE,
             withdrawals_enabled =
               CASE WHEN r.pause_withdrawals_on_depeg THEN FALSE ELSE r.withdrawals_enabled END,
             updated_at = now()
       WHERE r.asset = p_asset AND r.status = 'ACTIVE'
       RETURNING r.id
    )
    INSERT INTO rail_configuration_change (rail_id, field, old_value, new_value, actor_type, actor_id, reason)
    SELECT paused.id, 'status', 'ACTIVE', 'RISK_PAUSED', 'SYSTEM', NULL,
           format('asset %s depegged %s bps beyond %s bps tolerance (valuation_snapshot %s)',
                  p_asset, v_deviation, v_tolerance, v_id)
      FROM paused;
    GET DIAGNOSTICS v_paused = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT v_id, v_status, v_deviation, v_paused;
END;
$$;
-- =============================================================================
-- 0039_deposit_verification.sql
--
-- The real blockchain verification layer needs two things the schema does
-- not have yet:
--
--   1. ORPHANED -- a genuinely on-chain, correctly-confirmed transfer that
--      does not match any deposit intent able to accept it right now (its
--      intent expired, was cancelled, or was already credited by a
--      DIFFERENT transaction). This is deliberately distinct from
--      QUARANTINED (wrong asset/network/destination/amount, or a
--      screening hit -- something suspicious about the transfer itself).
--      An orphan is not suspicious; it is unattributable. Per the approved
--      design: "a transaction that does not match a valid deposit intent
--      must NOT be automatically credited" -- it becomes ORPHANED for a
--      human to reconcile, never silently dropped and never auto-credited.
--
--   2. Retry bookkeeping -- a transient provider failure (timeout, RPC
--      outage) must never be recorded as if the deposit itself failed.
--      verification_attempts/last_verification_error/last_verified_at let
--      the worker back off sensibly and let an operator SEE that a deposit
--      has been retried, without ever moving its status on a mere network
--      blip.
--
-- Adding an enum value follows the proven technique from
-- 0033_tournament_lifecycle_v2.sql (see that migration's own header for why
-- ALTER TYPE ... RENAME is fragile): convert to TEXT, drop the old type,
-- recreate it with every value including the new one, promote back.
-- =============================================================================

DROP INDEX deposit_pending_idx;

ALTER TABLE deposit DROP CONSTRAINT deposit_credited_has_ledger;
ALTER TABLE deposit DROP CONSTRAINT deposit_credited_was_verified;

ALTER TABLE deposit ALTER COLUMN status DROP DEFAULT;
ALTER TABLE deposit ALTER COLUMN status TYPE TEXT USING status::text;
DROP TYPE deposit_status;

CREATE TYPE deposit_status AS ENUM (
  'INITIATED', 'AWAITING_PAYMENT', 'DETECTED', 'CONFIRMING', 'VERIFIED',
  'SCREENED', 'CREDITED', 'EXPIRED', 'UNDERPAID', 'OVERPAID',
  'WRONG_ASSET', 'WRONG_NETWORK', 'QUARANTINED', 'ORPHANED'
);
ALTER TABLE deposit ALTER COLUMN status TYPE deposit_status USING status::deposit_status;
ALTER TABLE deposit ALTER COLUMN status SET DEFAULT 'INITIATED'::deposit_status;

ALTER TABLE deposit
  ADD CONSTRAINT deposit_credited_has_ledger
    CHECK (status <> 'CREDITED' OR (credited_tx_id IS NOT NULL AND credited_at IS NOT NULL)),
  ADD CONSTRAINT deposit_credited_was_verified
    CHECK (status <> 'CREDITED' OR (
      observed_tx_hash IS NOT NULL AND observed_amount_minor > 0
      AND observed_asset = asset AND observed_network = network
    )),
  -- An orphan is, by definition, something real we actually observed --
  -- never a bare refusal with nothing behind it.
  ADD CONSTRAINT deposit_orphaned_was_observed
    CHECK (status <> 'ORPHANED' OR observed_tx_hash IS NOT NULL);

CREATE INDEX deposit_pending_idx ON deposit (status) WHERE status NOT IN ('CREDITED', 'EXPIRED', 'ORPHANED');

-- --- retry bookkeeping --------------------------------------------------------

ALTER TABLE deposit
  ADD COLUMN verification_attempts   INT NOT NULL DEFAULT 0,
  ADD COLUMN last_verification_error TEXT,
  ADD COLUMN last_verified_at        TIMESTAMPTZ,
  ADD CONSTRAINT deposit_verification_attempts_sane CHECK (verification_attempts >= 0);
-- =============================================================================
-- 0040_withdrawal_hardening.sql
--
-- Implements the corrections named in the approved Withdrawal Custody
-- Architecture (section G, "Required database constraints"):
--
--   G8  the approval names THIS withdrawal, not just "a" withdrawal
--   G9  the approval covers THIS EXACT payload (amount/asset/network/dest)
--   G11 a transition names the REAL acting admin, not a hardcoded 'SYSTEM'
--   G12 COMPLETED requires on-chain confirmation evidence, not a provider's word
--   G13 a declared network fee is actually posted to the ledger
--   G14 a payout address is bound to an asset, not just a player/network/address
--   G16 a broadcast attempt is written BEFORE the provider is called, so a
--       crash between "asked the provider" and "recorded what it said" is
--       recoverable by lookup rather than ambiguous
--
-- Plus ON_HOLD: the third admin action ("Place on Hold") the approved flow
-- requires, alongside Approve and Reject. Adding it follows the proven
-- technique from 0033/0039 (see those migrations' own headers): convert the
-- enum column to TEXT, drop the type, recreate it with every value including
-- the new one, promote back. Every object that references
-- withdrawal.status -- the two CHECK constraints, the queue index, and
-- withdrawal_transition_allowed()'s own enum-typed parameters -- has to be
-- dropped first and rebuilt after, or DROP TYPE refuses with a dependency
-- error.
-- =============================================================================

-- --- drop everything that depends on the withdrawal_status TYPE (not just the column) ---

DROP INDEX withdrawal_queue_idx;
ALTER TABLE withdrawal DROP CONSTRAINT withdrawal_moving_states_are_locked;
ALTER TABLE withdrawal DROP CONSTRAINT withdrawal_completed_has_ledger;
ALTER TABLE withdrawal DROP CONSTRAINT withdrawal_broadcast_has_hash;
DROP FUNCTION withdrawal_transition_allowed(withdrawal_status, withdrawal_status);

-- withdrawal.status is not the only column of this type -- withdrawal_transition
-- (0007) records every from/to pair in the SAME enum, easy to miss since it
-- lives several hundred lines below the column it mirrors. Both must convert
-- together or DROP TYPE below refuses with a dependency error.
ALTER TABLE withdrawal ALTER COLUMN status DROP DEFAULT;
ALTER TABLE withdrawal ALTER COLUMN status TYPE TEXT USING status::text;
ALTER TABLE withdrawal_transition ALTER COLUMN from_status TYPE TEXT USING from_status::text;
ALTER TABLE withdrawal_transition ALTER COLUMN to_status TYPE TEXT USING to_status::text;
DROP TYPE withdrawal_status;

CREATE TYPE withdrawal_status AS ENUM (
  'REQUESTED', 'VALIDATING', 'RISK_CHECK', 'PENDING_REVIEW', 'ON_HOLD', 'APPROVED',
  'PROCESSING', 'BROADCASTED', 'CONFIRMED', 'COMPLETED',
  'FAILED', 'REJECTED', 'CANCELLED'
);
ALTER TABLE withdrawal ALTER COLUMN status TYPE withdrawal_status USING status::withdrawal_status;
ALTER TABLE withdrawal ALTER COLUMN status SET DEFAULT 'REQUESTED'::withdrawal_status;
ALTER TABLE withdrawal_transition ALTER COLUMN from_status TYPE withdrawal_status USING from_status::withdrawal_status;
ALTER TABLE withdrawal_transition ALTER COLUMN to_status TYPE withdrawal_status USING to_status::withdrawal_status;

-- --- the legal-transition table, with ON_HOLD's two edges added -------------
--
-- PENDING_REVIEW -> ON_HOLD: an admin defers the decision without deciding it.
-- ON_HOLD -> PENDING_REVIEW: review resumes.
-- ON_HOLD -> REJECTED: a withdrawal under investigation can still be refused
--   outright; it must not be REQUIRED to return to review first.
-- Every other edge is byte-for-byte what 0007 already declared.

CREATE FUNCTION withdrawal_transition_allowed(
  p_from withdrawal_status, p_to withdrawal_status
) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT (p_from, p_to) IN (
    ('REQUESTED','VALIDATING'), ('REQUESTED','CANCELLED'),
    ('VALIDATING','RISK_CHECK'), ('VALIDATING','REJECTED'), ('VALIDATING','FAILED'),
    ('RISK_CHECK','PENDING_REVIEW'), ('RISK_CHECK','APPROVED'), ('RISK_CHECK','REJECTED'),
    ('PENDING_REVIEW','APPROVED'), ('PENDING_REVIEW','REJECTED'),
    ('PENDING_REVIEW','ON_HOLD'), ('ON_HOLD','PENDING_REVIEW'), ('ON_HOLD','REJECTED'),
    ('APPROVED','PROCESSING'), ('APPROVED','REJECTED'),
    ('PROCESSING','BROADCASTED'), ('PROCESSING','FAILED'),
    ('BROADCASTED','CONFIRMED'), ('BROADCASTED','FAILED'),
    ('CONFIRMED','COMPLETED')
  );
$$;

-- --- G11: the guard names the REAL actor, and freezes tx_hash too -----------
--
-- The application sets these two transaction-local settings immediately
-- after opening a transaction that will change a withdrawal's status (see
-- payments.mjs's own setActor() helper). `true` (the "missing_ok" argument
-- to current_setting) means an ordinary caller that sets neither -- every
-- existing test, and every purely automated transition -- gets exactly the
-- old behaviour: SYSTEM, no actor id.
CREATE OR REPLACE FUNCTION withdrawal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_actor_type TEXT := COALESCE(NULLIF(current_setting('nizalo.actor_type', true), ''), 'SYSTEM');
  v_actor_id   TEXT := NULLIF(current_setting('nizalo.actor_id', true), '');
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT withdrawal_transition_allowed(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'illegal withdrawal transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO withdrawal_transition (withdrawal_id, from_status, to_status, actor_type, actor_id)
    VALUES (NEW.id, OLD.status, NEW.status, v_actor_type, v_actor_id);
  END IF;

  -- The amount, destination and owner of a withdrawal are fixed at request
  -- time. Allowing any to change after approval would make the approval
  -- meaningless: an approver signs off on a specific payout, not on a row.
  IF OLD.amount_minor IS DISTINCT FROM NEW.amount_minor
     OR OLD.destination IS DISTINCT FROM NEW.destination
     OR OLD.player_id IS DISTINCT FROM NEW.player_id THEN
    RAISE EXCEPTION 'a withdrawal amount, destination and owner are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Once a transaction hash is recorded, it is the payout's permanent
  -- identity. Allowing it to change would let a single withdrawal row
  -- silently point at a second, different on-chain payment.
  IF OLD.tx_hash IS NOT NULL AND NEW.tx_hash IS DISTINCT FROM OLD.tx_hash THEN
    RAISE EXCEPTION 'a withdrawal transaction hash is immutable once recorded'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- --- rebuild what was dropped, extended for ON_HOLD and G12/G13 -------------

ALTER TABLE withdrawal
  ADD CONSTRAINT withdrawal_moving_states_are_locked
    CHECK (status IN ('REQUESTED','CANCELLED','REJECTED') OR lock_tx_id IS NOT NULL),
  ADD CONSTRAINT withdrawal_completed_has_ledger
    CHECK (status <> 'COMPLETED' OR (settle_tx_id IS NOT NULL AND completed_at IS NOT NULL)),
  ADD CONSTRAINT withdrawal_broadcast_has_hash
    CHECK (status NOT IN ('BROADCASTED','CONFIRMED','COMPLETED') OR tx_hash IS NOT NULL);

CREATE INDEX withdrawal_queue_idx ON withdrawal (status, requested_at)
  WHERE status IN ('REQUESTED','VALIDATING','RISK_CHECK','PENDING_REVIEW','ON_HOLD','APPROVED','PROCESSING');

-- --- G12: COMPLETED requires actual chain evidence, not a provider's claim --

ALTER TABLE withdrawal
  ADD COLUMN confirmed_block_number BIGINT,
  ADD COLUMN confirmations           INT,
  ADD COLUMN hold_reason             TEXT,
  ADD CONSTRAINT withdrawal_completed_has_evidence
    CHECK (status <> 'COMPLETED' OR (
      tx_hash IS NOT NULL AND confirmed_block_number IS NOT NULL AND confirmations IS NOT NULL
    ));

-- --- G13: a declared fee must actually reach the ledger ---------------------
--
-- fee_minor has existed since 0007 and was never enforced to be posted
-- anywhere. This does not change WHETHER a fee is charged (that stays a
-- service-layer decision, default zero, unchanged for every existing
-- withdrawal) -- it makes "COMPLETED with a nonzero fee that was never
-- posted" structurally impossible, by requiring a real ledger transaction
-- reference whenever fee_minor > 0.
ALTER TABLE withdrawal
  ADD COLUMN fee_tx_id BIGINT REFERENCES ledger_transaction(id),
  ADD CONSTRAINT withdrawal_fee_was_posted
    CHECK (fee_minor = 0 OR status <> 'COMPLETED' OR fee_tx_id IS NOT NULL);

-- --- payout_would_keep_solvent(): re-examined, NOT changed ------------------
--
-- Two earlier design documents in this series (the Financial Remediation
-- Blueprint and the Withdrawal Custody Architecture) both flagged this
-- predicate as broken: `custody - amount >= liabilities - amount` cancels
-- to `custody >= liabilities`, independent of the payout's size, which
-- looks exactly like the classic "the amount you're supposed to be
-- checking against doesn't actually appear in the check" bug.
--
-- It is not one, and attempting to "fix" it here (by dropping the
-- subtraction on the right-hand side) was caught by this migration's own
-- test suite: it started refusing a perfectly safe $100 payout against a
-- platform with custody=1000 exactly matching liabilities=1000.
--
-- The reason the cancellation is CORRECT: by the time this is checked, the
-- withdrawal amount is already LOCKED (moved available -> locked at
-- request time), so it is already counted in `user_liabilities` and NOT
-- yet subtracted from `custody_held` (that only happens in complete()).
-- Completing the payout moves the SAME amount off both sides at once --
-- custody drops by `amount` (paid out) and this withdrawal's own liability
-- drops by `amount` (no longer owed) -- so if `custody >= liabilities` held
-- before completion, `(custody - amount) >= (liabilities - amount)` holds
-- after, for exactly the same reason `custody >= liabilities` did.
-- Amount-sensitivity adds nothing: a request that could not be locked in
-- the first place never reaches this check, and one that could is already
-- bounded by what its own owner has, which the ledger's own non-negative-
-- balance invariant (I3) already guarantees custody can cover.
--
-- What this predicate actually guards against is a LEDGER-INTERNAL
-- inconsistency (custody < liabilities from some other bug), which
-- `custody >= liabilities` catches directly -- exactly what the original,
-- unedited 0007 definition already computes. Left as-is.

-- --- G8: an approval for a withdrawal action must actually name one --------

ALTER TABLE approval_request
  ADD CONSTRAINT approval_withdrawal_subject_shape
    CHECK (action NOT IN ('admin.withdrawal.approve', 'admin.withdrawal.reject')
           OR subject_type = 'withdrawal');

-- --- G9: the approval covers THIS EXACT payload -----------------------------
--
-- One function, called both when an approval is CREATED (to compute the
-- digest that gets stored on it) and when it is EXECUTED (to verify the
-- withdrawal has not changed underneath it) -- so there is exactly one
-- definition of "this payload" rather than two that can drift apart.
-- md5(), not a cryptographic signature: this is tamper-EVIDENCE inside a
-- database we already trust to enforce immutability by trigger, not a
-- defence against an adversary who can already write arbitrary SQL.
CREATE FUNCTION withdrawal_payload_digest(p_withdrawal_id TEXT)
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT md5(w.id || ':' || w.amount_minor::text || ':' || w.asset || ':' || w.network || ':' || w.destination)
    FROM withdrawal w WHERE w.id = p_withdrawal_id;
$$;

-- --- G14: a payout address is bound to an asset, not just player/network/address ---

ALTER TABLE payout_address DROP CONSTRAINT payout_address_unique;
ALTER TABLE payout_address ADD CONSTRAINT payout_address_unique UNIQUE (player_id, asset, network, address);

CREATE OR REPLACE FUNCTION payout_address_usable(p_player_id TEXT, p_asset TEXT, p_network TEXT, p_address TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM payout_address
     WHERE player_id = p_player_id AND asset = p_asset AND network = p_network AND address = p_address
       AND removed_at IS NULL AND usable_from <= now()
  );
$$;

-- --- G16: write-ahead broadcast attempts -------------------------------------
--
-- Written BEFORE the provider is ever called (see payments.mjs's process()),
-- keyed on the same idempotency key the provider itself is called with. A
-- crash between "we asked" and "we recorded the answer" leaves this row to
-- recover from by LOOKUP, never by blind re-send.

CREATE TABLE withdrawal_broadcast_attempt (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  withdrawal_id   TEXT        NOT NULL REFERENCES withdrawal(id),
  idempotency_key TEXT        NOT NULL,
  provider        TEXT        NOT NULL,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at    TIMESTAMPTZ,
  outcome         TEXT        CHECK (outcome IN ('PROVIDER_REF', 'ERROR')),
  provider_ref    TEXT,
  error_message   TEXT,

  CONSTRAINT withdrawal_broadcast_attempt_idem_uniq UNIQUE (idempotency_key)
);

CREATE INDEX withdrawal_broadcast_attempt_withdrawal_idx
  ON withdrawal_broadcast_attempt (withdrawal_id, id);

-- Mutable (responded_at/outcome/provider_ref are filled in AFTER the attempt
-- row is written, by design) but never deletable -- the record of "we tried"
-- must survive even a failed attempt.
CREATE TRIGGER withdrawal_broadcast_attempt_no_delete
  BEFORE DELETE ON withdrawal_broadcast_attempt
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();
-- =============================================================================
-- 0041_rail_emergency_hold.sql
--
-- The Admin Payment & Stablecoin Control Center's fifth UI state:
-- EMERGENCY HOLD, stronger than an ordinary ADMIN_PAUSED. The distinction is
-- real, not cosmetic: ADMIN_PAUSED is routine operational maintenance (an
-- admin scheduling downtime, say); EMERGENCY_HOLD is an incident response --
-- both currently produce the same mechanical effect (deposits and
-- withdrawals both blocked for new operations), but they are recorded, and
-- must read, differently, and a future change to what EMERGENCY_HOLD does
-- (e.g. also pausing free play on the affected asset) must not have to hunt
-- for every place ADMIN_PAUSED already meant "regular pause".
--
-- Unlike the withdrawal_status/deposit_status rewrites in earlier
-- migrations, payment_rail.status has no CHECK constraint enumerating
-- literal values and no partial index filtering on one -- ALTER TYPE ...
-- ADD VALUE is sufficient here; the heavier drop-and-rebuild technique
-- exists for when values are being RENAMED or REMOVED, not added.
-- =============================================================================

ALTER TYPE rail_status ADD VALUE 'EMERGENCY_HOLD';
-- =============================================================================
-- 0042_rail_emergency_hold_enforcement.sql
--
-- Separated from 0041 deliberately: a newly-added enum value (ALTER TYPE ...
-- ADD VALUE) cannot safely be referenced by anything evaluated in the SAME
-- transaction it was added in. Each migration file runs as its own
-- transaction (see migrate.mjs), so putting the actual USE of
-- 'EMERGENCY_HOLD' in a later file sidesteps the restriction entirely,
-- rather than fighting it.
--
-- EMERGENCY_HOLD is a full stop, exactly like ADMIN_PAUSED and RETIRED --
-- deposits_enabled/withdrawals_enabled are irrelevant once it is set; no
-- rail state may authorise a NEW operation while it holds.
-- =============================================================================

CREATE OR REPLACE FUNCTION rail_enabled_for(p_asset TEXT, p_network TEXT, p_operation TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT r.enabled AND r.status NOT IN ('ADMIN_PAUSED', 'RETIRED', 'EMERGENCY_HOLD') AND (
       CASE p_operation
         WHEN 'DEPOSIT'    THEN r.deposits_enabled
         WHEN 'WITHDRAWAL' THEN r.withdrawals_enabled
         ELSE FALSE
       END)
       FROM payment_rail r WHERE r.asset = p_asset AND r.network = p_network),
    FALSE
  );
$$;

-- set_rail_status()'s own body never enumerates specific status values (it
-- just records whatever it is told), so it needs no change -- restated here
-- only so a reader checking "what did 0042 touch" does not have to go
-- looking for a change that does not exist.
-- =============================================================================
-- 0043_withdrawal_fee_immutability.sql
--
-- Security review finding F-5: fee_minor was added to `withdrawal` by
-- 0040_withdrawal_hardening.sql (G13, "a declared fee must actually reach the
-- ledger") but was never added to either place that governs a withdrawal's
-- OTHER immutable financial fields:
--
--   1. withdrawal_payload_digest() -- the four-eyes approval's "this exact
--      payload" fingerprint (G9). Changing fee_minor after an admin proposes
--      an approval, but before a second admin decides it or the requester
--      executes it, left the digest byte-identical: an approved release
--      could be silently inflated by the fee amount, moving that amount out
--      of custody with no on-chain counterpart (the broadcast only ever
--      sends amount_minor) and with no DIGEST_MISMATCH catching it.
--
--   2. withdrawal_guard()'s immutability branch -- amount_minor, destination
--      and player_id are already structurally frozen the instant the row is
--      written; fee_minor was the one financial field left mutable for the
--      whole lifetime of the row.
--
-- Nothing in this codebase today sets fee_minor to anything but its 0
-- default (no admin fee-assessment flow exists yet), so this closes a real
-- gap with no legitimate behaviour to preserve. If a fee-assessment feature
-- is built later, relaxing this -- to "immutable once a value is set" rather
-- than "immutable from creation" -- should be its own deliberate, reviewed
-- change, exactly like this one.
-- =============================================================================

CREATE OR REPLACE FUNCTION withdrawal_payload_digest(p_withdrawal_id TEXT)
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT md5(w.id || ':' || w.amount_minor::text || ':' || w.asset || ':' || w.network || ':' || w.destination || ':' || w.fee_minor::text)
    FROM withdrawal w WHERE w.id = p_withdrawal_id;
$$;

CREATE OR REPLACE FUNCTION withdrawal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_actor_type TEXT := COALESCE(NULLIF(current_setting('nizalo.actor_type', true), ''), 'SYSTEM');
  v_actor_id   TEXT := NULLIF(current_setting('nizalo.actor_id', true), '');
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT withdrawal_transition_allowed(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'illegal withdrawal transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO withdrawal_transition (withdrawal_id, from_status, to_status, actor_type, actor_id)
    VALUES (NEW.id, OLD.status, NEW.status, v_actor_type, v_actor_id);
  END IF;

  -- The amount, destination, owner AND fee of a withdrawal are fixed at
  -- request time. Allowing any to change after approval would make the
  -- approval meaningless: an approver signs off on a specific payout, not
  -- on a row that can still grow a fee underneath them.
  IF OLD.amount_minor IS DISTINCT FROM NEW.amount_minor
     OR OLD.destination IS DISTINCT FROM NEW.destination
     OR OLD.player_id IS DISTINCT FROM NEW.player_id
     OR OLD.fee_minor IS DISTINCT FROM NEW.fee_minor THEN
    RAISE EXCEPTION 'a withdrawal amount, destination, owner and fee are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Once a transaction hash is recorded, it is the payout's permanent
  -- identity. Allowing it to change would let a single withdrawal row
  -- silently point at a second, different on-chain payment.
  IF OLD.tx_hash IS NOT NULL AND NEW.tx_hash IS DISTINCT FROM OLD.tx_hash THEN
    RAISE EXCEPTION 'a withdrawal transaction hash is immutable once recorded'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
-- =============================================================================
-- 0044_replay_mismatch_category.sql
--
-- Security review finding F-11: packages/duel-engine/src/duel.mjs's own
-- verifyReplay() -- built precisely to catch "the recorded result disagrees
-- with what the game's own rules derive from replaying its moves" -- was
-- wired into no production code path. settlementLegs() pays out whoever
-- duel.result names, and duel.result comes from a game plugin's evaluate();
-- a plugin bug (or a compromised plugin release) decided real-money payouts
-- with no independent check ever running, before or after settlement.
--
-- This adds the case category, and the matching reconciliation_run_kind
-- value withRun() stamps on every run of the new check, that
-- runReplayVerification() (packages/reconciliation/src/reconcile.mjs) uses
-- to report a mismatch. Adding bare enum values is sufficient here (no
-- CHECK constraint or index anywhere references a literal value of either
-- enum -- confirmed by grep across every migration), so this is the same
-- lightweight technique used for payment_rail.status's own EMERGENCY_HOLD
-- addition (0041), simpler than the full convert-to-TEXT-and-back rebuild
-- older migrations needed.
-- =============================================================================

ALTER TYPE reconciliation_case_category ADD VALUE 'REPLAY_MISMATCH';
ALTER TYPE reconciliation_run_kind ADD VALUE 'REPLAY_VERIFICATION';
-- =============================================================================
-- 0045_challenge_stakes_and_system_events.sql
--
-- The final match-mode selection and challenge invitation UX:
--
--   1. PLAY WITH FRIEND could only ever create a FREE duel (0027's own
--      accept() hardcoded tier='FREE', stake_minor=0). The approved spec
--      requires "Free or Competitive where eligible" -- the same choice
--      RANDOM OPPONENT (matchmaking_ticket) already has. duel_challenge
--      gains the same tier/stake_minor/asset columns duel and
--      matchmaking_ticket already carry, with the identical CASH-has-stake
--      shape check duel's own duel_cash_has_stake already enforces.
--
--   2. TIMEOUT: "if no action within 30 seconds: EXPIRED. The system must
--      log this automatically." 0027 computed expiry LAZILY at read time
--      and never once persisted it -- a challenge's `status` column stayed
--      'PENDING' forever even long after it could no longer be actioned.
--      EXPIRED is now a real, loggable status.
--
--   3. duel_challenge_event: an honest, append-only log of a challenge's
--      whole lifecycle (SENT/ACCEPTED/DECLINED/CANCELLED/EXPIRED), separate
--      from the mutable duel_challenge row itself, so "the system must log
--      this automatically" has a real, permanent record to point to.
--
--   4. chat_system_event: "regardless of result, the chat timeline should
--      show a system event ... these are system timeline events, not
--      ordinary user messages." chat_message.sender_id is NOT NULL
--      REFERENCES player(id) -- there is no room in that table for an
--      event with no human author, and no reason to stretch its content
--      length/rate-limit rules to fit one. A small, separate, append-only
--      table alongside it is the honest shape, not a widened chat_message.
--      Scoped to MATCH_STARTED only, for now: that is the one event this
--      feature's own backend actually emits into a real chat_channel (the
--      newly-created duel's own match chat) -- CHALLENGE_SENT/ACCEPTED/
--      DECLINED/EXPIRED are logged in duel_challenge_event above instead,
--      since a pending challenge that is never accepted has no duel and no
--      match chat channel to post into at all.
-- =============================================================================

-- --- 1 + 2: duel_challenge gains stakes and a real EXPIRED status ------------

ALTER TYPE duel_challenge_status ADD VALUE 'EXPIRED';

ALTER TABLE duel_challenge
  ADD COLUMN tier        entry_tier NOT NULL DEFAULT 'FREE',
  ADD COLUMN stake_minor BIGINT     NOT NULL DEFAULT 0,
  ADD COLUMN asset       TEXT,
  ADD CONSTRAINT duel_challenge_cash_has_stake
    CHECK ((tier = 'CASH') = (stake_minor > 0 AND asset IS NOT NULL));

-- --- 3: the challenge lifecycle log ------------------------------------------

CREATE TYPE duel_challenge_event_type AS ENUM
  ('SENT', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');

CREATE TABLE duel_challenge_event (
  id           BIGINT                     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  challenge_id TEXT                       NOT NULL REFERENCES duel_challenge(id),
  event_type   duel_challenge_event_type  NOT NULL,
  created_at   TIMESTAMPTZ                NOT NULL DEFAULT now()
);

CREATE INDEX duel_challenge_event_challenge_idx ON duel_challenge_event (challenge_id, id);

CREATE TRIGGER duel_challenge_event_immutable
  BEFORE UPDATE OR DELETE ON duel_challenge_event
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

-- --- 4: system events on a real chat channel ---------------------------------

CREATE TYPE chat_system_event_type AS ENUM ('MATCH_STARTED');

CREATE TABLE chat_system_event (
  id          BIGINT                  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel_id  TEXT                    NOT NULL REFERENCES chat_channel(id),
  event_type  chat_system_event_type  NOT NULL,
  detail      JSONB                   NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ             NOT NULL DEFAULT now(),

  CONSTRAINT chat_system_event_short_detail CHECK (octet_length(detail::text) <= 2000)
);

CREATE INDEX chat_system_event_channel_idx ON chat_system_event (channel_id, id);

CREATE TRIGGER chat_system_event_immutable
  BEFORE UPDATE OR DELETE ON chat_system_event
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();
-- =============================================================================
-- 0046_evidence_lifecycle_and_replay_removal.sql
--
-- Implements the approved live-evidence retention rule: during an active
-- match, the full per-action log in `duel_event` stays because realtime,
-- reconnect, spectating AND the existing runReplayVerification() check
-- (0044) all need it. After completion, that detailed log is deleted --
-- except a CASH duel keeps it for the exact 24-hour window
-- runReplayVerification() itself sweeps by default (so the money check
-- always gets its full window before the evidence it depends on can be
-- purged), and any duel with a real fair-play signal or an open funds hold
-- against it is never purged at all (see reconcile.mjs's own
-- runEvidenceCleanup()). This migration makes both mechanics possible:
--
--  1. `duel_event_immutable` denied UPDATE and DELETE outright. The event
--     log must still never be silently EDITED (UPDATE stays denied), but a
--     bulk retention DELETE -- run only by runEvidenceCleanup(), never ad
--     hoc -- is now the one legitimate way rows in this table go away.
--  2. A new reconciliation_run_kind value for that sweep, the same
--     additive technique 0044 already used for REPLAY_VERIFICATION.
--  3. The Replay Center (packages/replay) is retired: a replay rebuilt any
--     completed match's full move list on demand, which is the direct
--     opposite of "delete detailed replayable data after completion".
--     Its two supporting tables are dropped.
--  4. The "watch a replay" daily challenge depended on replay_view, which
--     no longer exists. It is repointed at a different, already-durable
--     signal (a real rated match completed today) rather than removed
--     outright, so a player who had it assigned today does not simply
--     lose a challenge slot mid-day.
-- =============================================================================

DROP TRIGGER duel_event_immutable ON duel_event;
CREATE TRIGGER duel_event_immutable
  BEFORE UPDATE ON duel_event
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

ALTER TYPE reconciliation_run_kind ADD VALUE 'EVIDENCE_CLEANUP';

DROP TABLE player_replay_favorite;
DROP TABLE replay_view;

UPDATE daily_challenge_template
   SET code = 'PLAY_RATED_MATCH', metric = 'PLAY_RATED_MATCH'
 WHERE id = 'dct_watch_replay';
-- =============================================================================
-- 0047_referral_and_attribution.sql
--
-- Referral & Match Result Sharing System:
--  1. `referral_code`: Every user gets exactly one permanent alphanumeric code.
--  2. `referral_attribution`: Links a referred player to their referrer upon registration.
--     Enforces single-attribution and forbids self-attribution at the database layer.
--  3. `referral_reward`: Tracks the one-way monetary reward ($1 USD default)
--     triggered when an attributed player makes their first qualifying confirmed deposit.
--  4. `platform_control` entry: 'REFERRALS' switch for emergency control.
-- =============================================================================

-- Ensure marketing reserve account exists in ledger accounts if not already populated
INSERT INTO ledger_account
  (key, owner_type, owner_id, account_type, normal_side, allow_negative, asset, network)
VALUES
  ('platform:marketing:referral_rewards', 'PLATFORM', NULL, 'LIABILITY', 'CREDIT', TRUE, 'USDT', NULL)
ON CONFLICT (key, asset) DO NOTHING;

-- 1. Permanent Referral Codes
CREATE TABLE referral_code (
  code VARCHAR(16) PRIMARY KEY,
  player_id TEXT NOT NULL UNIQUE REFERENCES player(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_referral_code_player ON referral_code(player_id);

-- Helper function to generate an 8-character unique alphanumeric referral code
CREATE OR REPLACE FUNCTION generate_referral_code(p_handle TEXT)
RETURNS TEXT AS $$
DECLARE
  v_clean_handle TEXT;
  v_suffix TEXT;
  v_code TEXT;
  v_exists BOOLEAN;
  v_attempts INT := 0;
BEGIN
  v_clean_handle := UPPER(SUBSTRING(REGEXP_REPLACE(p_handle, '[^a-zA-Z0-9]', '', 'g') FROM 1 FOR 4));
  IF LENGTH(v_clean_handle) < 3 THEN
    v_clean_handle := 'NZ';
  END IF;

  LOOP
    v_suffix := UPPER(SUBSTRING(MD5(gen_random_uuid()::text) FROM 1 FOR (8 - LENGTH(v_clean_handle))));
    v_code := v_clean_handle || v_suffix;
    
    SELECT EXISTS(SELECT 1 FROM referral_code WHERE code = v_code) INTO v_exists;
    IF NOT v_exists THEN
      RETURN v_code;
    END IF;

    v_attempts := v_attempts + 1;
    IF v_attempts > 20 THEN
      -- Fallback to pure random string
      RETURN 'NZ' || UPPER(SUBSTRING(MD5(gen_random_uuid()::text) FROM 1 FOR 6));
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Auto-assign permanent referral code on player creation
CREATE OR REPLACE FUNCTION trg_assign_referral_code()
RETURNS TRIGGER AS $$
DECLARE
  v_code TEXT;
BEGIN
  v_code := generate_referral_code(NEW.handle);
  INSERT INTO referral_code (code, player_id)
  VALUES (v_code, NEW.id)
  ON CONFLICT (player_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_player_assign_referral_code
  AFTER INSERT ON player
  FOR EACH ROW EXECUTE FUNCTION trg_assign_referral_code();

-- Backfill referral codes for all existing players
INSERT INTO referral_code (code, player_id)
SELECT generate_referral_code(p.handle), p.id
FROM player p
WHERE NOT EXISTS (SELECT 1 FROM referral_code rc WHERE rc.player_id = p.id)
ON CONFLICT (player_id) DO NOTHING;


-- 2. Referral Attribution
CREATE TABLE referral_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referred_player_id TEXT NOT NULL UNIQUE REFERENCES player(id) ON DELETE RESTRICT,
  referrer_player_id TEXT NOT NULL REFERENCES player(id) ON DELETE RESTRICT,
  referral_code VARCHAR(16) NOT NULL REFERENCES referral_code(code),
  attributed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  context_duel_id TEXT NULL REFERENCES duel(id) ON DELETE SET NULL,
  CONSTRAINT chk_no_self_referral CHECK (referred_player_id <> referrer_player_id)
);

CREATE INDEX idx_referral_attribution_referrer ON referral_attribution(referrer_player_id);
CREATE INDEX idx_referral_attribution_code ON referral_attribution(referral_code);


-- 3. Referral Rewards State Machine
CREATE TABLE referral_reward (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribution_id UUID NOT NULL REFERENCES referral_attribution(id) ON DELETE RESTRICT,
  referrer_player_id TEXT NOT NULL REFERENCES player(id) ON DELETE RESTRICT,
  referred_player_id TEXT NOT NULL REFERENCES player(id) ON DELETE RESTRICT,
  qualifying_deposit_id TEXT NOT NULL UNIQUE REFERENCES deposit(id) ON DELETE RESTRICT,
  reward_asset VARCHAR(8) NOT NULL DEFAULT 'USDT',
  reward_amount_minor BIGINT NOT NULL DEFAULT 1000000, -- 1.00 USDT default
  qualifying_threshold_minor BIGINT NOT NULL DEFAULT 5000000, -- 5.00 USDT default
  state VARCHAR(32) NOT NULL DEFAULT 'PENDING'
    CHECK (state IN ('PENDING', 'RISK_CHECK', 'ELIGIBLE', 'FLAGGED_REVIEW', 'SETTLING', 'SETTLED', 'REJECTED_FRAUD')),
  risk_score SMALLINT NULL,
  risk_reasons JSONB NULL,
  ledger_tx_id BIGINT NULL UNIQUE REFERENCES ledger_transaction(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ NULL
);

CREATE INDEX idx_referral_reward_referrer ON referral_reward(referrer_player_id);
CREATE INDEX idx_referral_reward_referred ON referral_reward(referred_player_id);
CREATE INDEX idx_referral_reward_state ON referral_reward(state);

-- Emergency kill-switch control entry
INSERT INTO platform_control (key, enabled, reason)
VALUES ('REFERRALS', TRUE, 'Global kill-switch for referral code attribution and reward settlement')
ON CONFLICT (key) DO NOTHING;
-- Legal Consent Audit Trail & Support Configuration (Slice 13)
--
-- 1. `legal_policy`: The master registry of legal policies and versions.
-- 2. `legal_consent`: Append-only, immutable record of player consent to specific
--    policy versions, locales, and channels.
-- 3. `platform_support_config`: Admin-configurable support contact channels
--    (phone, email) with fallback defaults.

CREATE TABLE legal_policy (
  identifier   TEXT        PRIMARY KEY,
  version      TEXT        NOT NULL,
  is_mandatory BOOLEAN     NOT NULL DEFAULT TRUE,
  title        TEXT        NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed initial 9 core legal policies
INSERT INTO legal_policy (identifier, version, is_mandatory, title) VALUES
  ('terms_of_service', '1.0.0', TRUE, 'Terms & Conditions'),
  ('privacy_policy', '1.0.0', TRUE, 'Privacy Policy'),
  ('fair_play', '1.0.0', TRUE, 'Fair Play & Anti-Cheat Policy'),
  ('payments_policy', '1.0.0', TRUE, 'Payments & Withdrawals Policy'),
  ('referral_terms', '1.0.0', FALSE, 'Referral Program Terms'),
  ('responsible_play', '1.0.0', TRUE, 'Responsible Play Policy'),
  ('community_rules', '1.0.0', TRUE, 'Community & Chat Rules'),
  ('cookie_policy', '1.0.0', FALSE, 'Cookie & Tracking Policy'),
  ('tournament_rules', '1.0.0', FALSE, 'Tournament Rules Framework')
ON CONFLICT (identifier) DO NOTHING;

CREATE TABLE legal_consent (
  id                TEXT        PRIMARY KEY,
  player_id         TEXT        NOT NULL REFERENCES player(id),
  policy_identifier TEXT        NOT NULL REFERENCES legal_policy(identifier),
  policy_version    TEXT        NOT NULL,
  locale            TEXT        NOT NULL DEFAULT 'en',
  consent_type      TEXT        NOT NULL,
  source            TEXT        NOT NULL,
  accepted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash           TEXT,
  user_agent_hash   TEXT,
  metadata          JSONB       NOT NULL DEFAULT '{}'::jsonb
);

-- Append-only audit integrity: consent cannot be edited or deleted
CREATE TRIGGER legal_consent_immutable
  BEFORE UPDATE OR DELETE ON legal_consent
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE INDEX legal_consent_player_policy_idx
  ON legal_consent (player_id, policy_identifier, policy_version);

CREATE INDEX legal_consent_player_accepted_idx
  ON legal_consent (player_id, accepted_at DESC);

-- Platform support configuration for dynamic support contact channels
CREATE TABLE platform_support_config (
  id          TEXT        PRIMARY KEY DEFAULT 'default',
  phone       TEXT        NOT NULL DEFAULT '+2 01069999557',
  email       TEXT        NOT NULL DEFAULT 'support@Nizalo.com',
  updated_by  TEXT        REFERENCES admin_user(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO platform_support_config (id, phone, email, updated_by, updated_at)
VALUES ('default', '+2 01069999557', 'support@Nizalo.com', NULL, now())
ON CONFLICT (id) DO NOTHING;
