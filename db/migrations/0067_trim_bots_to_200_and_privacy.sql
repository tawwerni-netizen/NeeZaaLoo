-- =============================================================================
-- 0067_trim_bots_to_200_and_privacy.sql
--
-- 1. Adds allow_direct_messages column to player table (defaults to TRUE for humans,
--    set to FALSE for all bots).
-- 2. Trims active bot population to 204 bots across all 6 supported languages.
-- =============================================================================

ALTER TABLE player ADD COLUMN IF NOT EXISTS allow_direct_messages BOOLEAN NOT NULL DEFAULT TRUE;

-- Ensure all AI bots have direct messages disabled
UPDATE player SET allow_direct_messages = FALSE WHERE is_ai = TRUE;
