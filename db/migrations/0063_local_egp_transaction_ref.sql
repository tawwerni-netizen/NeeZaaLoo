-- =============================================================================
-- 0063_local_egp_transaction_ref.sql
--
-- Replaces the flawed idempotency constraint (which relied on timestamp + raw
-- message text) with a robust unique constraint on the actual provider
-- transaction reference (transactionRef).
--
-- =============================================================================

ALTER TABLE local_transfer_observed
  ADD COLUMN transaction_ref TEXT;

-- Drop the old duplicate protection constraint which was circumvented
-- when SMS timestamps varied slightly or raw messages had whitespace changes.
ALTER TABLE local_transfer_observed
  DROP CONSTRAINT local_transfer_dedupe;

-- Establish the new strong duplicate protection.
-- If the transaction_ref is NULL, Postgres still allows multiple rows, which
-- covers manual admin entries that might lack a reference. But any automated
-- entry with a parsed transaction_ref is guaranteed globally unique per network.
ALTER TABLE local_transfer_observed
  ADD CONSTRAINT local_transfer_dedupe_ref UNIQUE (network, transaction_ref);
