-- =============================================================================
-- 0081_store_user_coin_accounts.sql
--
-- Provisions virtual COIN ledger accounts for players so that they can buy and
-- spend coins in the store.
-- =============================================================================

-- 1. Ensure asset exists
INSERT INTO asset (code, minor_units, kind, is_pegged, peg_asset, peg_tolerance_bps, enabled)
VALUES ('COIN', 0, 'OTHER', false, NULL, 100, true)
ON CONFLICT (code) DO NOTHING;

-- 2. Upgrade ledger_open_user_wallet() to provision COIN accounts
CREATE OR REPLACE FUNCTION ledger_open_user_wallet(p_user_id TEXT, p_asset TEXT DEFAULT 'USDT')
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_state TEXT;
  v_asset TEXT;
BEGIN
  FOREACH v_asset IN ARRAY ARRAY['USDT', 'USDC', 'DAI', 'COIN']
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

-- 3. Backfill all existing players with COIN accounts
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM player LOOP
    PERFORM ledger_open_user_wallet(r.id);
  END LOOP;
END;
$$;
