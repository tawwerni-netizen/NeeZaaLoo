-- =============================================================================
-- 0063_seed_bots_and_fund_wallets.sql
--
-- Seeds 600 AI bot personas into the player table with is_ai = TRUE,
-- opens their double-entry ledger accounts (USDT), seeds ratings across all
-- 11 launch games, and funds each bot's wallet with 10,000 USDT (10,000,000,000
-- minor units) from the platform promotional budget (platform:promotions).
-- =============================================================================

DO $$
DECLARE
  v_langs TEXT[] := ARRAY['ar', 'en', 'es', 'fr', 'hi', 'zh'];
  v_lang TEXT;
  v_i INT;
  v_bot_id TEXT;
  v_handle TEXT;
  v_bio TEXT;
  v_badge TEXT;
  v_games TEXT[] := ARRAY['chess', 'checkers', 'backgammon', 'dominoes', 'billiards', 'connect-four', 'gomoku', 'reversi', 'seega', 'speed-math', 'xo'];
  v_game TEXT;
  v_base_rating INT;
  v_rating INT;
  v_cur_bal BIGINT;
  v_needed BIGINT;
  v_fund_amount BIGINT := 10000000000; -- 10,000 USDT (6 decimal places)
BEGIN
  FOREACH v_lang IN ARRAY v_langs LOOP
    FOR v_i IN 1..100 LOOP
      v_bot_id := 'bot_' || v_lang || '_' || LPAD(v_i::text, 3, '0');
      v_handle := v_bot_id;

      IF v_lang = 'ar' THEN
        v_bio := 'لاعب شطرنج وألعاب طاولة محترف 🏆';
        v_badge := 'AR';
      ELSIF v_lang = 'en' THEN
        v_bio := 'Grandmaster level strategy enthusiast';
        v_badge := 'EN';
      ELSIF v_lang = 'es' THEN
        v_bio := 'Maestro de ajedrez y juegos de mesa';
        v_badge := 'ES';
      ELSIF v_lang = 'fr' THEN
        v_bio := 'Passionné de tactiques et grand maître';
        v_badge := 'FR';
      ELSIF v_lang = 'hi' THEN
        v_bio := 'रणनीति और खेल विशेषज्ञ';
        v_badge := 'HI';
      ELSE
        v_bio := '棋牌大师';
        v_badge := 'ZH';
      END IF;

      -- 1. Insert player row marked as is_ai
      INSERT INTO player (id, handle, is_ai, bio)
      VALUES (v_bot_id, v_handle, TRUE, v_bio)
      ON CONFLICT (id) DO UPDATE
        SET is_ai = TRUE,
            bio = EXCLUDED.bio;

      -- 2. Open double-entry user wallet accounts for USDT
      PERFORM ledger_open_user_wallet(v_bot_id, 'USDT');

      -- 3. Base rating between 1600 and 2850
      v_base_rating := 1600 + ((v_i * 47) % 1250);

      -- 4. Seed rating across all 11 games
      FOREACH v_game IN ARRAY v_games LOOP
        v_rating := (v_base_rating + (((v_i * 19) % 300) - 150)) * 100;
        IF v_rating < 150000 THEN v_rating := 150000; END IF;
        IF v_rating > 290000 THEN v_rating := 290000; END IF;

        INSERT INTO rating (player_id, game_id, rating_x100, rd_x100, volatility_x1e6, games_played, last_played_at)
        VALUES (v_bot_id, v_game, v_rating, 6500, 60000, 120 + ((v_i * 29) % 800), now() - interval '1 hour')
        ON CONFLICT (player_id, game_id) DO NOTHING;
      END LOOP;

      -- 5. Fund 10,000 USDT into user:bot_id:available via double-entry ledger_post
      SELECT COALESCE(b.balance, 0) INTO v_cur_bal
        FROM ledger_account a
        LEFT JOIN ledger_balance b ON b.account_id = a.id
       WHERE a.key = 'user:' || v_bot_id || ':available' AND a.asset = 'USDT';

      IF v_cur_bal < v_fund_amount THEN
        v_needed := v_fund_amount - v_cur_bal;
        PERFORM ledger_post(
          'seed-fund-0063-' || v_bot_id,
          'ADJUSTMENT',
          'ADMIN',
          'admin-system',
          jsonb_build_array(
            jsonb_build_object('account', 'platform:promotions', 'amount', v_needed::text),
            jsonb_build_object('account', 'user:' || v_bot_id || ':available', 'amount', (-v_needed)::text)
          ),
          'USDT',
          'Seed 10,000 USDT bot liquidity balance'
        );
      END IF;

    END LOOP;
  END LOOP;
END;
$$;
