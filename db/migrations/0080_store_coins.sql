-- =============================================================================
-- 0080_store_coins.sql
--
-- Introduces COIN as a virtual asset for the in-game store, and seeds the
-- platform liability and revenue accounts for it.
-- =============================================================================

INSERT INTO asset (code, minor_units, kind, is_pegged, peg_asset, peg_tolerance_bps, enabled)
VALUES ('COIN', 0, 'OTHER', false, NULL, 100, true);

INSERT INTO ledger_account (key, owner_type, owner_id, account_type, normal_side, allow_negative, asset)
VALUES
  ('platform:store:revenue', 'PLATFORM', NULL, 'REVENUE', 'CREDIT', FALSE, 'COIN'),
  ('platform:store:issuance', 'PLATFORM', NULL, 'LIABILITY', 'CREDIT', TRUE, 'COIN'),
  ('platform:store:revenue', 'PLATFORM', NULL, 'REVENUE', 'CREDIT', FALSE, 'USDT')
ON CONFLICT (key, asset) DO NOTHING;
