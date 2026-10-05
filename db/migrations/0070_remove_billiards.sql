-- =============================================================================
-- 0070_remove_billiards.sql
--
-- Completely removes Billiards from the platform to maintain exactly 10 games:
-- 1. Chess
-- 2. Dominoes
-- 3. Backgammon
-- 4. Speed Math
-- 5. XO
-- 6. Connect Four
-- 7. Checkers
-- 8. Reversi
-- 9. Gomoku
-- 10. Seega
-- =============================================================================

-- 1. Delete all ratings associated with billiards
DELETE FROM rating WHERE game_id = 'billiards';

-- 2. Delete all tournaments associated with billiards
DELETE FROM tournament_event WHERE tournament_id IN (SELECT id FROM tournament WHERE game_id = 'billiards');
DELETE FROM tournament_registration WHERE tournament_id IN (SELECT id FROM tournament WHERE game_id = 'billiards');
DELETE FROM tournament_pairing WHERE tournament_id IN (SELECT id FROM tournament WHERE game_id = 'billiards');
DELETE FROM tournament WHERE game_id = 'billiards';

-- 3. Delete any duel challenges or duels for billiards
DELETE FROM duel_challenge_event WHERE challenge_id IN (SELECT id FROM duel_challenge WHERE game_id = 'billiards');
DELETE FROM duel_challenge WHERE game_id = 'billiards';
DELETE FROM duel_event WHERE duel_id IN (SELECT id FROM duel WHERE game_id = 'billiards');
DELETE FROM duel WHERE game_id = 'billiards';

-- 4. Delete matchmaking tickets and economy rules for billiards
DELETE FROM matchmaking_ticket WHERE game_id = 'billiards';
DELETE FROM economy_rule WHERE game_id = 'billiards';

-- 5. Delete the game itself from the game table
DELETE FROM game WHERE id = 'billiards';
