-- =============================================================================
-- 0060_payment_rail_limits_10_usd.sql
--
-- Platform economics and payment limits alignment:
-- 1. Sets minimum withdrawal to .00 (10_000_000 minor units) across all
--    payment rails (USDT, USDC, DAI, etc.) and updates column default.
-- 2. Sets minimum deposit to .00 (5_000_000 minor units) across all
--    payment rails and updates column default.
-- =============================================================================

-- Update column defaults for future rails
ALTER TABLE payment_rail
  ALTER COLUMN min_withdrawal_minor SET DEFAULT 10000000,
  ALTER COLUMN min_deposit_minor SET DEFAULT 5000000;

-- Update all existing rails to .00 min withdrawal and .00 min deposit
UPDATE payment_rail
SET min_withdrawal_minor = 10000000,
    min_deposit_minor = 5000000,
    updated_at = now();