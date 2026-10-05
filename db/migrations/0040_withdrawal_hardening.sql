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
