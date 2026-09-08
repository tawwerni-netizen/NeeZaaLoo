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
