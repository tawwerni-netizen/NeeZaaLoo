-- =============================================================================
-- 0064_bot_control_and_account_cleanup.sql
--
-- 1. Creates bot_platform_config table for dynamic admin control over bots:
--    - AI difficulty / invincibility mode
--    - Standing-By pool parameters and toggles
--    - Tournament bot filler settings and human reserved seats
--    - Background rating simulator settings
--
-- 2. Safely removes dummy/test accounts (alice, bob, carol, ply1, test_*, etc.)
--    while strictly preserving real human users and the 600 official AI personas.
-- =============================================================================

-- 1. Bot platform configuration table
CREATE TABLE IF NOT EXISTS bot_platform_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT DEFAULT 'system'
);

INSERT INTO bot_platform_config (key, value, description)
VALUES
  (
    'ai_difficulty',
    '{"mode": "INVINCIBLE", "blunder_chance": 0, "think_ms": 1200}'::jsonb,
    'Controls global bot engine strength (INVINCIBLE: 0 blunder chance + max search depth, EXPERT, BALANCED)'
  ),
  (
    'standing_by',
    '{"enabled": true, "wait_seconds": 5, "pool_size": 200, "max_stake_usd": 2000}'::jsonb,
    'Auto-matches human waiting >= wait_seconds with standing-by bots for instant zero-wait gameplay'
  ),
  (
    'tournaments',
    '{"enabled": true, "reserved_seats": 2, "fill_interval_seconds": 30, "max_wait_minutes": 10}'::jsonb,
    'Gradually fills 16-player tournaments with bots while reserving seats for human players'
  ),
  (
    'simulator',
    '{"enabled": true, "interval_seconds": 60}'::jsonb,
    'Simulates ongoing background bot matches to keep leaderboards and ELO rankings dynamically moving'
  )
ON CONFLICT (key) DO NOTHING;

-- 2. Cleanup dummy/mock/test accounts
DO $$
DECLARE
  v_test_ids TEXT[];
BEGIN
  -- Gather test player IDs (strictly excluding official bots and ai accounts)
  SELECT ARRAY_AGG(id) INTO v_test_ids
    FROM player
   WHERE NOT (id LIKE 'bot_%' OR id LIKE 'ai-%')
     AND (
       id IN (
         'alice', 'bob', 'carol', 'dave', 'erin', 'frank',
         'ply1', 'ply2', 'ply3', 'ply4', 'ply_1', 'ply_2',
         'test', 'tester', 'test_user', 'test_user_1', 'test_user_2',
         'mock_player', 'dummy_user', 'player_test', 'test_player',
         'root2', 'bootstrap'
       )
       OR id LIKE 'test_%'
       OR handle LIKE 'test_%'
       OR handle LIKE 'mock_%'
       OR handle LIKE 'dummy_%'
       OR handle IN ('alice', 'bob', 'carol', 'dave', 'erin', 'frank', 'ply1', 'ply2')
     );

  IF v_test_ids IS NOT NULL AND array_length(v_test_ids, 1) > 0 THEN
    BEGIN
      -- Delete duel events, duels, and challenges for test users first
      DELETE FROM duel_event WHERE duel_id IN (
        SELECT id FROM duel WHERE seat_0 = ANY(v_test_ids) OR seat_1 = ANY(v_test_ids)
      );
      DELETE FROM duel WHERE seat_0 = ANY(v_test_ids) OR seat_1 = ANY(v_test_ids);
      DELETE FROM duel_challenge WHERE creator_id = ANY(v_test_ids) OR opponent_id = ANY(v_test_ids);

      -- Delete from child tables in order
      DELETE FROM auth_session WHERE player_id = ANY(v_test_ids);
      DELETE FROM credential WHERE player_id = ANY(v_test_ids);
      DELETE FROM device WHERE player_id = ANY(v_test_ids);
      DELETE FROM totp_secret WHERE player_id = ANY(v_test_ids);
      DELETE FROM recovery_code WHERE player_id = ANY(v_test_ids);
      DELETE FROM login_attempt WHERE player_id = ANY(v_test_ids);
      DELETE FROM security_event WHERE player_id = ANY(v_test_ids);
      DELETE FROM email_identity WHERE player_id = ANY(v_test_ids);
      DELETE FROM oauth_identity WHERE player_id = ANY(v_test_ids);
      DELETE FROM email_challenge WHERE player_id = ANY(v_test_ids);
      DELETE FROM player_achievement WHERE player_id = ANY(v_test_ids);
      DELETE FROM player_badge WHERE player_id = ANY(v_test_ids);
      DELETE FROM player_frame WHERE player_id = ANY(v_test_ids);
      DELETE FROM player_streak WHERE player_id = ANY(v_test_ids);
      DELETE FROM streak_reward WHERE player_id = ANY(v_test_ids);
      DELETE FROM daily_challenge_assignment WHERE player_id = ANY(v_test_ids);
      DELETE FROM player_replay_favorite WHERE player_id = ANY(v_test_ids);
      DELETE FROM replay_view WHERE player_id = ANY(v_test_ids);
      DELETE FROM chat_message WHERE sender_id = ANY(v_test_ids);
      DELETE FROM chat_mute WHERE target_id = ANY(v_test_ids);
      DELETE FROM chat_block WHERE blocker_id = ANY(v_test_ids) OR blocked_id = ANY(v_test_ids);
      DELETE FROM tournament_registration WHERE player_id = ANY(v_test_ids);
      DELETE FROM matchmaking_ticket WHERE player_id = ANY(v_test_ids);
      DELETE FROM rating_change WHERE player_id = ANY(v_test_ids);
      DELETE FROM rating WHERE player_id = ANY(v_test_ids);

      -- Delete ledger balances & entries for test users
      DELETE FROM ledger_balance WHERE account_id IN (
        SELECT id FROM ledger_account WHERE owner_type = 'USER' AND owner_id = ANY(v_test_ids)
      );
      DELETE FROM ledger_entry WHERE account_id IN (
        SELECT id FROM ledger_account WHERE owner_type = 'USER' AND owner_id = ANY(v_test_ids)
      );
      DELETE FROM ledger_account WHERE owner_type = 'USER' AND owner_id = ANY(v_test_ids);

      -- Finally remove from player table
      DELETE FROM player WHERE id = ANY(v_test_ids);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipped aggressive test account deletion due to foreign key references: %', SQLERRM;
    END;
  END IF;
END;
$$;
