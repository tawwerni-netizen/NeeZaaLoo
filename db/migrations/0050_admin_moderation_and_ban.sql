-- =============================================================================
-- 0050_admin_moderation_and_ban.sql
--
-- Player account suspension/ban support and direct message moderation.
-- =============================================================================

-- --- 1. Player Account Ban / Suspension ---------------------------------------

ALTER TABLE player ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;
ALTER TABLE player ADD COLUMN IF NOT EXISTS disabled_reason TEXT;
ALTER TABLE player ADD COLUMN IF NOT EXISTS disabled_by TEXT REFERENCES admin_user(id);

CREATE INDEX IF NOT EXISTS player_disabled_at_idx ON player (disabled_at) WHERE disabled_at IS NOT NULL;

-- --- 2. Direct Message Moderation Deletion -----------------------------------

ALTER TABLE direct_message ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE direct_message ADD COLUMN IF NOT EXISTS deleted_by TEXT REFERENCES admin_user(id);

CREATE INDEX IF NOT EXISTS direct_message_deleted_idx ON direct_message (deleted_at) WHERE deleted_at IS NOT NULL;
