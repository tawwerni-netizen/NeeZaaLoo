-- =============================================================================
-- 0054_rail_auto_approve_threshold.sql
--
-- The admin Platform Settings page has shown, and let an operator edit, an
-- "auto-approve limit" for withdrawals since it was written -- and
-- GET /v1/admin/settings has been SELECTing payment_rail.
-- auto_approve_threshold_minor to populate it. That column never existed in
-- any migration, so the query threw and the whole settings page fell back to
-- hardcoded defaults it then offered to save back over the real ones.
--
-- This is the column, so that the threshold is a real, per-rail, operator-
-- controlled value rather than a number the panel invents. NULL keeps the
-- previous behaviour exactly: the payment service falls back to its own
-- configured reviewThresholdMinor (WITHDRAWAL_REVIEW_THRESHOLD_MINOR).
-- =============================================================================

ALTER TABLE payment_rail
  ADD COLUMN IF NOT EXISTS auto_approve_threshold_minor BIGINT;

COMMENT ON COLUMN payment_rail.auto_approve_threshold_minor IS
  'Withdrawals at or above this amount always go to a human reviewer. NULL = use the payment service''s configured default.';
