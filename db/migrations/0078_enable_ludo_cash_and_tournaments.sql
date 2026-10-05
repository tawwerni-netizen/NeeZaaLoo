-- =============================================================================
-- 0078_enable_ludo_cash_and_tournaments.sql
--
-- Enables cash duels and automated scheduled knockout tournaments for Ludo (🎲),
-- bringing it into full parity with the other 3 major games (Chess, Dominoes, Backgammon).
-- =============================================================================

BEGIN;

UPDATE game
   SET is_live = TRUE,
       cash_enabled = TRUE,
       auto_tournaments_enabled = TRUE
 WHERE id = 'ludo';

COMMIT;
