-- =============================================================================
-- 0061_enable_billiards_cash_and_tournaments.sql
--
-- Enables cash play (`cash_enabled = TRUE`) and automated tournament engine
-- scheduling (`auto_tournaments_enabled = TRUE`) for the 8-Ball Pool
-- (Billiards) game following its engine, physics, and visual overhaul.
-- =============================================================================

UPDATE game
SET cash_enabled = TRUE,
    auto_tournaments_enabled = TRUE
WHERE id = 'billiards';
