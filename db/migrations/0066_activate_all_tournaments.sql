-- =============================================================================
-- 0066_activate_all_tournaments.sql
--
-- 1. Activates tournaments and cash play across all 10 launch tabletop games:
--    - chess, dominoes, backgammon, speed-math, xo, connect-four,
--      checkers, reversi, gomoku, seega.
--    Sets is_live = TRUE, cash_enabled = TRUE, auto_tournaments_enabled = TRUE.
--
-- 2. Strictly enforces Billiards remains completely disabled:
--    Sets is_live = FALSE, cash_enabled = FALSE, auto_tournaments_enabled = FALSE.
--
-- 3. Ensures 600 AI personas and bot_p_* players have funded USDT wallets so
--    tournament bot entries never encounter INSUFFICIENT_FUNDS.
-- =============================================================================

-- 1. Activate all 10 tabletop games for cash and automated tournaments
UPDATE game
   SET is_live = TRUE,
       cash_enabled = TRUE,
       auto_tournaments_enabled = TRUE
 WHERE id IN ('chess', 'dominoes', 'backgammon', 'speed-math', 'xo', 'connect-four', 'checkers', 'reversi', 'gomoku', 'seega');

-- 2. Strictly ensure Billiards remains completely disabled
UPDATE game
   SET is_live = FALSE,
       cash_enabled = FALSE,
       auto_tournaments_enabled = FALSE
 WHERE id = 'billiards';

-- 3. Ensure bot wallets are open and funded for tournament entries
DO $$
DECLARE
  v_bot RECORD;
  v_cur_bal BIGINT;
  v_fund_amount BIGINT := 10000000000; -- 10,000 USDT (6 decimal places)
  v_needed BIGINT;
BEGIN
  FOR v_bot IN SELECT id FROM player WHERE is_ai = TRUE AND id LIKE 'bot_%' LOOP
    PERFORM ledger_open_user_wallet(v_bot.id, 'USDT');

    SELECT COALESCE(b.balance, 0) INTO v_cur_bal
      FROM ledger_account a
      LEFT JOIN ledger_balance b ON b.account_id = a.id
     WHERE a.key = 'user:' || v_bot.id || ':available' AND a.asset = 'USDT';

    IF v_cur_bal < v_fund_amount THEN
      v_needed := v_fund_amount - v_cur_bal;
      PERFORM ledger_post(
        'seed-fund-0066-' || v_bot.id,
        'ADJUSTMENT',
        'ADMIN',
        'admin-system',
        jsonb_build_array(
          jsonb_build_object('account', 'platform:custody:USDT:TRON', 'amount', v_needed::text),
          jsonb_build_object('account', 'user:' || v_bot.id || ':available', 'amount', (-v_needed)::text)
        ),
        'USDT',
        'Top up bot wallet for tournament buy-ins'
      );
    END IF;
  END LOOP;
END $$;
