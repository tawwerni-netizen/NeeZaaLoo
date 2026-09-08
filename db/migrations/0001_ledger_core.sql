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
