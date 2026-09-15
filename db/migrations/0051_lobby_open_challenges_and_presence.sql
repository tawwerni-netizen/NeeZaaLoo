-- =============================================================================
-- 0051_lobby_open_challenges_and_presence.sql
--
-- 1. Lobby Open Challenges:
--    Allows players to broadcast an open duel to the lobby radar without needing
--    a specific opponent ID. Any eligible player can see it and accept it.
--    When accepted, an authoritative duel is created and both players can enter.
--
-- 2. Player Presence (Online / Offline status):
--    Adds last_seen_at to player table to accurately determine if a player
--    is currently active or offline.
-- =============================================================================

-- Add last_seen_at column to player table if not already present
ALTER TABLE player
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now();

-- Lobby Open Challenges table
CREATE TABLE IF NOT EXISTS lobby_open_challenge (
  id             TEXT                    PRIMARY KEY,
  creator_id     TEXT                    NOT NULL REFERENCES player(id),
  game_id        TEXT                    NOT NULL REFERENCES game(id),
  mode           TEXT                    NOT NULL DEFAULT 'CASUAL',
  tier           entry_tier              NOT NULL DEFAULT 'FREE',
  stake_minor    BIGINT                  NOT NULL DEFAULT 0,
  asset          TEXT,
  time_control   TEXT                    NOT NULL DEFAULT 'BLITZ',
  status         TEXT                    NOT NULL DEFAULT 'OPEN',
  accepted_by    TEXT                    REFERENCES player(id),
  duel_id        TEXT                    REFERENCES duel(id),
  created_at     TIMESTAMPTZ             NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ             NOT NULL,
  responded_at   TIMESTAMPTZ,

  CONSTRAINT lobby_open_challenge_status_check
    CHECK (status IN ('OPEN', 'ACCEPTED', 'CANCELLED', 'EXPIRED')),
  CONSTRAINT lobby_open_challenge_accepted_has_duel
    CHECK ((status = 'ACCEPTED') = (duel_id IS NOT NULL AND accepted_by IS NOT NULL)),
  CONSTRAINT lobby_open_challenge_distinct_players
    CHECK (accepted_by IS NULL OR creator_id <> accepted_by)
);

CREATE INDEX IF NOT EXISTS lobby_open_challenge_open_idx
  ON lobby_open_challenge (game_id, created_at DESC) WHERE status = 'OPEN';

CREATE INDEX IF NOT EXISTS lobby_open_challenge_creator_idx
  ON lobby_open_challenge (creator_id, created_at DESC) WHERE status = 'OPEN';
