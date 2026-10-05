-- =============================================================================
-- 0002_ledger_roles_and_platform_accounts.sql
--
-- Defence in depth for I2 (immutability), plus the platform's own accounts.
--
-- The triggers in 0001 stop an UPDATE or DELETE from succeeding. Privileges stop
-- the application from being able to attempt one at all. Both matter: a trigger
-- can be dropped by whoever holds DDL rights, so the application role must not
-- hold those rights either.
-- =============================================================================

-- --- Application role --------------------------------------------------------
-- The API connects as nizalo_app. It can read everything in the ledger and
-- insert nothing directly: all money movement goes through ledger_post().

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nizalo_app') THEN
    CREATE ROLE nizalo_app NOLOGIN;
  END IF;
END;
$$;

GRANT SELECT ON ledger_account, ledger_transaction, ledger_entry, ledger_balance,
                asset TO nizalo_app;
GRANT SELECT ON ledger_balance_verification, ledger_solvency TO nizalo_app;

-- Explicitly withheld, and stated here so a future migration that grants them
-- is visible as the deliberate act it would be:
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ledger_entry       FROM nizalo_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ledger_transaction FROM nizalo_app;
REVOKE UPDATE, DELETE, TRUNCATE          ON ledger_balance    FROM nizalo_app;
REVOKE UPDATE, DELETE                    ON ledger_account    FROM nizalo_app;

-- The one sanctioned write path.
GRANT EXECUTE ON FUNCTION
  ledger_post(TEXT, TEXT, ledger_actor_type, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT)
  TO nizalo_app;

-- --- Platform accounts -------------------------------------------------------
-- Custody is an ASSET (we hold it). Everything owed to users is a LIABILITY.
-- Suspense is the honesty account: anything we cannot explain lands here and
-- raises a case. It is never auto-cleared.

INSERT INTO ledger_account
  (key, owner_type, owner_id, account_type, normal_side, allow_negative, asset, network)
VALUES
  ('platform:custody:USDT:TRON', 'PLATFORM', NULL, 'ASSET',     'DEBIT',  FALSE, 'USDT', 'TRON'),
  ('platform:rake',              'PLATFORM', NULL, 'REVENUE',   'CREDIT', FALSE, 'USDT', NULL),
  ('platform:promotions',        'PLATFORM', NULL, 'LIABILITY', 'CREDIT', TRUE,  'USDT', NULL),
  ('platform:fees:network',      'PLATFORM', NULL, 'REVENUE',   'CREDIT', TRUE,  'USDT', NULL),
  ('platform:suspense',          'PLATFORM', NULL, 'LIABILITY', 'CREDIT', TRUE,  'USDT', NULL),
  ('platform:writeoff',          'PLATFORM', NULL, 'EQUITY',    'DEBIT',  TRUE,  'USDT', NULL);

-- --- User wallet provisioning ------------------------------------------------
-- The five wallet states from the specification are five ACCOUNTS, not a status
-- column. "Locked" funds are not available funds wearing a label, so a query for
-- available balance cannot accidentally include them.

CREATE FUNCTION ledger_open_user_wallet(p_user_id TEXT, p_asset TEXT DEFAULT 'USDT')
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_state TEXT;
BEGIN
  FOREACH v_state IN ARRAY ARRAY['available','locked','pending','withdrawable','restricted']
  LOOP
    INSERT INTO ledger_account
      (key, owner_type, owner_id, account_type, normal_side, allow_negative, asset)
    VALUES
      ('user:' || p_user_id || ':' || v_state, 'USER', p_user_id,
       'LIABILITY', 'CREDIT', FALSE, p_asset)
    ON CONFLICT (key, asset) DO NOTHING;
  END LOOP;
END;
$$;
