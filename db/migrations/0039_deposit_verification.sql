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
