-- =============================================================================
-- 0065_real_persona_names_and_leaderboard_seed.sql
--
-- 1. Disables billiards completely across all modes and queries.
-- 2. Renames legacy ai_easy / ai_medium / ai_hard / ai_expert bots to authentic human handles.
-- 3. Cleans up any billiards or legacy ai_ lobby open challenges and live arena duels.
-- 4. Seeds realistic human player ratings across all 10 launch tabletop games
--    so the global leaderboard (/ar/rank) is populated with active champions and masters.
-- =============================================================================

-- 1. Deactivate Billiards completely
UPDATE game
   SET is_live = FALSE,
       cash_enabled = FALSE,
       auto_tournaments_enabled = FALSE
 WHERE id = 'billiards';

-- 2. Rename legacy bots to authentic human handles (no 'ai_' prefixes anywhere)
UPDATE player
   SET handle = 'Karim_AlMasry_10',
       bio = 'لاعب شطرنج هاوٍ يعشق التكتيكات السريعة ♟️'
 WHERE id = 'ai-easy';

UPDATE player
   SET handle = 'Tariq_AlKhaled_45',
       bio = 'منافس دائم على بطولات الطاولة والشطرنج 🎲'
 WHERE id = 'ai-medium';

UPDATE player
   SET handle = 'Sultan_AlGhamdi_82',
       bio = 'محترف استراتيجيات وألعاب لوحية، 1850 ELO ⚡'
 WHERE id = 'ai-hard';

UPDATE player
   SET handle = 'GM_Farouk_AlSharif',
       bio = 'جراند ماستر، بطل بطولات نيزالو 👑'
 WHERE id = 'ai-expert';

-- 3. Clean up stale challenges and duels with billiards or legacy handles
DELETE FROM lobby_open_challenge
 WHERE game_id = 'billiards'
    OR creator_id IN ('ai-easy', 'ai-medium', 'ai-hard', 'ai-expert');

UPDATE duel
   SET status = 'COMPLETED'::duel_status,
       completed_at = now()
 WHERE (game_id = 'billiards' OR id LIKE 'duel_live_%')
   AND status = 'LIVE';

-- 4. Seed realistic human player roster for active leaderboard and matchmaking
DO $$
DECLARE
  v_players TEXT[][] := ARRAY[
    ['bot_p_001', 'Fahad_AlGhamdi_99', 'جراند ماستر الشطرنج وبطل التحديات النقدية 👑'],
    ['bot_p_002', 'Ahmed_AlSharif_7', 'محترف طاولة الزهر والدومينو السريع 🎲'],
    ['bot_p_003', 'Tariq_AlNajdi_42', 'خبير تكتيكي في الداما والجوموكو ⚡'],
    ['bot_p_004', 'Omar_AlSalem_15', 'أستاذ أولمبياد الرياضيات السريعة والذكاء 🧠'],
    ['bot_p_005', 'Kareem_Masri_31', 'لاعب دومينو أمريكي وعادي متمرس 🀄'],
    ['bot_p_006', 'Sultan_AlShehri_88', 'بطل منافسات إكس أو وريفيرسي ⚔️'],
    ['bot_p_007', 'Youssef_AlFassi_12', 'محترف سيجة وطاولة زهر من الدار البيضاء 🇲🇦'],
    ['bot_p_008', 'Ziyad_AlHarbi_55', 'تكتيكي صلب في أربعة على التوالي 🔴'],
    ['bot_p_009', 'James_Miller_14', 'International Grandmaster & Speed Math ace'],
    ['bot_p_010', 'Mateo_Garcia_29', 'Maestro de Ajedrez y Tablero Táctico'],
    ['bot_p_011', 'Louis_Martin_55', 'Grand Maître d''Échecs et de Reversi'],
    ['bot_p_012', 'Aarav_Sharma_83', 'Tactical calculation and speed champion'],
    ['bot_p_013', 'Wei_Zhang_91', 'Master of Gomoku & Strategic Board Games'],
    ['bot_p_014', 'Hamza_AlMansouri_22', 'لاعب هجومي لا يرحم في الشطرنج السريع 🔥'],
    ['bot_p_015', 'Bilal_AlRawi_37', 'محترف دومينو وبطولات إقصائية 🏆'],
    ['bot_p_016', 'Mustafa_Khatib_19', 'بطل تحديات طاولة الزهر المفتوحة 🎲'],
    ['bot_p_017', 'Lucas_Rodriguez_64', 'Especialista en Damas y Reversi Blitz'],
    ['bot_p_018', 'Arthur_Thomas_48', 'Stratège invaincu sur Connect Four'],
    ['bot_p_019', 'Alexander_Smith_77', 'Chess Grandmaster & Endgame Specialist'],
    ['bot_p_020', 'Sami_AlKuwaiti_05', 'خبير مناورات السيجة وألعاب التراث العربي 🏜️']
  ];
  v_games TEXT[] := ARRAY['chess', 'dominoes', 'backgammon', 'connect-four', 'xo', 'speed-math', 'checkers', 'reversi', 'gomoku', 'seega'];
  v_ply RECORD;
  v_game TEXT;
  v_i INT := 0;
  v_rating INT;
  v_matches INT;
BEGIN
  FOR v_i IN 1..array_length(v_players, 1) LOOP
    -- Insert player
    INSERT INTO player (id, handle, is_ai, bio)
    VALUES (v_players[v_i][1], v_players[v_i][2], TRUE, v_players[v_i][3])
    ON CONFLICT (id) DO UPDATE
      SET handle = EXCLUDED.handle,
          is_ai = TRUE,
          bio = EXCLUDED.bio;

    -- Open wallet
    PERFORM ledger_open_user_wallet(v_players[v_i][1], 'USDT');

    -- Seed ratings across games
    FOREACH v_game IN ARRAY v_games LOOP
      v_rating := 185000 + ((v_i * 37 + length(v_game) * 1100) % 95000); -- 1850 - 2800 ELO
      v_matches := 45 + ((v_i * 19 + length(v_game) * 5) % 350);

      INSERT INTO rating (player_id, game_id, rating_x100, rd_x100, volatility_x1e6, games_played, last_played_at)
      VALUES (v_players[v_i][1], v_game, v_rating, 5500, 60000, v_matches, now() - (v_i * interval '1 hour'))
      ON CONFLICT (player_id, game_id) DO UPDATE
        SET rating_x100 = EXCLUDED.rating_x100,
            games_played = EXCLUDED.games_played,
            last_played_at = EXCLUDED.last_played_at;
    END LOOP;
  END LOOP;
END $$;
