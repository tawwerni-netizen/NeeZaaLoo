-- =============================================================================
-- 0055_multi_stablecoin_usdc_dai.sql
--
-- Multi-Stablecoin Architecture: USD Coin (USDC) and Dai (DAI) support
-- alongside Tether (USDT), enabling 1:1 nominal USD parity across all three
-- premier stablecoins on TRON, BEP20 (BNB Smart Chain), and ERC20 (Ethereum).
-- =============================================================================

-- 1. Register USDC and DAI in asset table
INSERT INTO asset (code, minor_units, kind, is_pegged, peg_asset, peg_tolerance_bps, enabled)
VALUES
  ('USDC', 6, 'STABLECOIN', TRUE, 'USD', 100, TRUE),
  ('DAI',  6, 'STABLECOIN', TRUE, 'USD', 100, TRUE)
ON CONFLICT (code) DO UPDATE
SET is_pegged = EXCLUDED.is_pegged,
    peg_asset = EXCLUDED.peg_asset,
    peg_tolerance_bps = EXCLUDED.peg_tolerance_bps,
    enabled = EXCLUDED.enabled;

-- 2. Register BEP20 and ERC20 in network table
INSERT INTO network (code, display_name, confirmation_depth, enabled)
VALUES
  ('BEP20', 'BNB Smart Chain (BEP20)', 15, TRUE),
  ('ERC20', 'Ethereum (ERC20)', 12, TRUE)
ON CONFLICT (code) DO UPDATE
SET display_name = EXCLUDED.display_name,
    confirmation_depth = EXCLUDED.confirmation_depth,
    enabled = EXCLUDED.enabled;

-- 3. Valuation Snapshots (1:1 USD nominal peg)
INSERT INTO valuation_snapshot (asset, usd_rate_x1e8, source, observed_at, status)
SELECT 'USDC', 100000000, 'PEG_ASSUMED', now(), 'NOMINAL'
WHERE NOT EXISTS (SELECT 1 FROM valuation_snapshot WHERE asset = 'USDC');

INSERT INTO valuation_snapshot (asset, usd_rate_x1e8, source, observed_at, status)
SELECT 'DAI', 100000000, 'PEG_ASSUMED', now(), 'NOMINAL'
WHERE NOT EXISTS (SELECT 1 FROM valuation_snapshot WHERE asset = 'DAI');

-- 4. Payment Rails
INSERT INTO payment_rail (
  id, asset, network, status, enabled, deposits_enabled, withdrawals_enabled,
  min_deposit_minor, min_withdrawal_minor, confirmation_depth
) VALUES
  ('USDT_BEP20', 'USDT', 'BEP20', 'ACTIVE', TRUE, TRUE, TRUE, 5000000, 5000000, 15),
  ('USDT_ERC20', 'USDT', 'ERC20', 'ACTIVE', TRUE, TRUE, TRUE, 5000000, 5000000, 12),
  ('USDC_TRON',  'USDC', 'TRON',  'ACTIVE', TRUE, TRUE, TRUE, 5000000, 5000000, 20),
  ('USDC_BEP20', 'USDC', 'BEP20', 'ACTIVE', TRUE, TRUE, TRUE, 5000000, 5000000, 15),
  ('USDC_ERC20', 'USDC', 'ERC20', 'ACTIVE', TRUE, TRUE, TRUE, 5000000, 5000000, 12),
  ('DAI_BEP20',  'DAI',  'BEP20', 'ACTIVE', TRUE, TRUE, TRUE, 5000000, 5000000, 15),
  ('DAI_ERC20',  'DAI',  'ERC20', 'ACTIVE', TRUE, TRUE, TRUE, 5000000, 5000000, 12)
ON CONFLICT (id) DO NOTHING;

-- 5. Platform Ledger Accounts (Custody across chains & Assets)
INSERT INTO ledger_account
  (key, owner_type, owner_id, account_type, normal_side, allow_negative, asset, network)
VALUES
  -- USDT additional custody chains
  ('platform:custody:USDT:BEP20', 'PLATFORM', NULL, 'ASSET', 'DEBIT', FALSE, 'USDT', 'BEP20'),
  ('platform:custody:USDT:ERC20', 'PLATFORM', NULL, 'ASSET', 'DEBIT', FALSE, 'USDT', 'ERC20'),
  -- USDC custody
  ('platform:custody:USDC:TRON',  'PLATFORM', NULL, 'ASSET', 'DEBIT', FALSE, 'USDC', 'TRON'),
  ('platform:custody:USDC:BEP20', 'PLATFORM', NULL, 'ASSET', 'DEBIT', FALSE, 'USDC', 'BEP20'),
  ('platform:custody:USDC:ERC20', 'PLATFORM', NULL, 'ASSET', 'DEBIT', FALSE, 'USDC', 'ERC20'),
  -- DAI custody
  ('platform:custody:DAI:BEP20',  'PLATFORM', NULL, 'ASSET', 'DEBIT', FALSE, 'DAI',  'BEP20'),
  ('platform:custody:DAI:ERC20',  'PLATFORM', NULL, 'ASSET', 'DEBIT', FALSE, 'DAI',  'ERC20')
ON CONFLICT (key, asset) DO NOTHING;

-- Platform working accounts for USDC and DAI
INSERT INTO ledger_account
  (key, owner_type, owner_id, account_type, normal_side, allow_negative, asset, network)
VALUES
  ('platform:rake',         'PLATFORM', NULL, 'REVENUE',   'CREDIT', FALSE, 'USDC', NULL),
  ('platform:promotions',   'PLATFORM', NULL, 'LIABILITY', 'CREDIT', TRUE,  'USDC', NULL),
  ('platform:fees:network', 'PLATFORM', NULL, 'REVENUE',   'CREDIT', TRUE,  'USDC', NULL),
  ('platform:suspense',     'PLATFORM', NULL, 'LIABILITY', 'CREDIT', TRUE,  'USDC', NULL),
  ('platform:writeoff',     'PLATFORM', NULL, 'EQUITY',    'DEBIT',  TRUE,  'USDC', NULL),
  ('platform:rake',         'PLATFORM', NULL, 'REVENUE',   'CREDIT', FALSE, 'DAI',  NULL),
  ('platform:promotions',   'PLATFORM', NULL, 'LIABILITY', 'CREDIT', TRUE,  'DAI',  NULL),
  ('platform:fees:network', 'PLATFORM', NULL, 'REVENUE',   'CREDIT', TRUE,  'DAI',  NULL),
  ('platform:suspense',     'PLATFORM', NULL, 'LIABILITY', 'CREDIT', TRUE,  'DAI',  NULL),
  ('platform:writeoff',     'PLATFORM', NULL, 'EQUITY',    'DEBIT',  TRUE,  'DAI',  NULL)
ON CONFLICT (key, asset) DO NOTHING;

-- 6. Upgrade ledger_open_user_wallet() to provision all 3 stablecoins
CREATE OR REPLACE FUNCTION ledger_open_user_wallet(p_user_id TEXT, p_asset TEXT DEFAULT 'USDT')
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_state TEXT;
  v_asset TEXT;
BEGIN
  FOREACH v_asset IN ARRAY ARRAY['USDT', 'USDC', 'DAI']
  LOOP
    FOREACH v_state IN ARRAY ARRAY['available','locked','pending','withdrawable','restricted']
    LOOP
      INSERT INTO ledger_account
        (key, owner_type, owner_id, account_type, normal_side, allow_negative, asset)
      VALUES
        ('user:' || p_user_id || ':' || v_state, 'USER', p_user_id,
         'LIABILITY', 'CREDIT', FALSE, v_asset)
      ON CONFLICT (key, asset) DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;

-- 7. Backfill all existing players to have USDC and DAI ledger accounts
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM player LOOP
    PERFORM ledger_open_user_wallet(r.id);
  END LOOP;
END;
$$;
