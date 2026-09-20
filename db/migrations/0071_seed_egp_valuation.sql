-- =============================================================================
-- 0071_seed_egp_valuation.sql
--
-- Ensure valuation_snapshot has an active EGP rate so Vodafone Cash and
-- InstaPay local deposit intents can be created and priced immediately.
-- 1 USD = 50 EGP => usd_rate_x1e8 = 2,000,000 (1e8 / 50).
-- =============================================================================

INSERT INTO valuation_snapshot (asset, usd_rate_x1e8, source, observed_at, status, confidence_bps, created_by, reason)
SELECT 'EGP', 2000000, 'MANUAL', now(), 'NOMINAL', 10000, 'system_seed', 'Initial EGP exchange rate (1 USD = 50 EGP)'
WHERE NOT EXISTS (SELECT 1 FROM valuation_snapshot WHERE asset = 'EGP');
