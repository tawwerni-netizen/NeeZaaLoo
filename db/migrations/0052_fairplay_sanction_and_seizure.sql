-- =============================================================================
-- 0052_fairplay_sanction_and_seizure.sql
--
-- Wires the fair-play case system (0009) to two real consequences an admin
-- can actually apply from the tribunal: a categorized account ban the login
-- flow can recognise, and a platform account real confiscated funds can be
-- posted to. Neither existed before this -- the admin fair-play page only
-- ever rendered hardcoded mock cases with no backend behind "Sanction".
-- =============================================================================

-- --- 1. Ban category -----------------------------------------------------------
--
-- disabled_reason (0050) is free text for admin-facing display. This is a
-- small, closed set the LOGIN FLOW can branch on, so a player banned for
-- confirmed cheating sees a specific message rather than the generic
-- "account disabled" every other ban reason produces. NULL for any ban that
-- predates this column, or that isn't fair-play-originated.
ALTER TABLE player ADD COLUMN IF NOT EXISTS disabled_category TEXT;
ALTER TABLE player ADD CONSTRAINT player_disabled_category_known
  CHECK (disabled_category IS NULL OR disabled_category IN ('CHEATING', 'TOS_VIOLATION', 'FRAUD', 'OTHER'));

-- --- 2. Confiscated-funds platform account --------------------------------------
--
-- Structurally identical to platform:rake (REVENUE, CREDIT normal side) --
-- from the platform's own books, seized funds are a plain revenue event,
-- not custody or a liability to anyone. Kept as its own account rather than
-- folded into platform:rake so "money we took as a fee" and "money we took
-- as a sanction" are never the same ledger line -- reconciliation, and any
-- future dispute, needs that distinction to stay legible on its own.
INSERT INTO ledger_account (key, owner_type, owner_id, account_type, normal_side, allow_negative, asset, network)
VALUES ('platform:confiscated', 'PLATFORM', NULL, 'REVENUE', 'CREDIT', FALSE, 'USDT', NULL)
ON CONFLICT (key, asset) DO NOTHING;
