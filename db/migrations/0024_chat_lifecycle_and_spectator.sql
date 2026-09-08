-- Slice 10: three carried-forward Chat gaps from Slice 9, plus the
-- Spectator Foundation's schema. Reuses everything from migration 0023
-- (chat_channel, chat_message, the chat_channel_type enum with its already-
-- present SPECTATOR value) and 0003 (duel, game) -- no new parallel tables.

-- --- Gap 1: match channel lifecycle -----------------------------------------
--
-- A match (or spectator) chat channel must not stay open to new writes
-- forever once its duel ends. `post_game_deadline` is set ONCE, by the
-- server, the moment a duel reaches DuelState.COMPLETED (see
-- packages/realtime/src/gateway.mjs's publishNewEvents and
-- packages/chat/src/channels.mjs's markMatchCompleted) -- never by the
-- frontend, and never editable by a client. NULL means "no duel completion
-- has been recorded for this channel yet" (still LIVE); once set, a send
-- after that instant is refused (POST_GAME window elapsed = CLOSED), while
-- history remains readable indefinitely -- the read path never consults
-- this column, only sendMessage()'s access check does.
ALTER TABLE chat_channel ADD COLUMN post_game_deadline TIMESTAMPTZ NULL;

-- --- Spectator Foundation: eligibility policy -------------------------------
--
-- "Prepare the architecture, do not hardcode ONE policy globally" (Slice 10
-- directive #17). Two real, enforced values today:
--   OPEN          -- any authenticated player may spectate (the default;
--                    matches every duel created so far, none of which have
--                    any private/friends concept to restrict against).
--   PLAYERS_ONLY  -- nobody may spectate; only the two seated players see
--                    the match at all.
-- A FRIENDS_ONLY value is intentionally NOT added yet: this codebase has no
-- friends/social-graph concept to enforce it against. Adding the column
-- (rather than inferring policy from `tier`) is what makes that a future
-- one-line CHECK widening instead of a schema change.
ALTER TABLE duel ADD COLUMN spectator_policy TEXT NOT NULL DEFAULT 'OPEN'
  CHECK (spectator_policy IN ('OPEN', 'PLAYERS_ONLY'));

-- Per-GAME spectator delay: "do not assume zero-delay spectating is always
-- safe" (directive #8). Configurable per game (and, via the same column
-- pattern, could later vary per match/tournament without a schema change --
-- duel.spectator_delay_ms below overrides this per-match when set). Chess
-- is a perfect-information game already projected identically to players
-- and spectators (game-chess/src/plugin.mjs's own project() comment), so a
-- non-zero default is not needed here; the architecture is what this slice
-- adds, not a claim about what delay chess specifically needs.
ALTER TABLE game ADD COLUMN default_spectator_delay_ms INT NOT NULL DEFAULT 0
  CHECK (default_spectator_delay_ms >= 0);

-- A per-duel override (tournaments, cash tiers, or a future admin control
-- may all want a different delay than the game's own default without
-- changing the game row itself). NULL means "use the game's default."
ALTER TABLE duel ADD COLUMN spectator_delay_ms INT NULL
  CHECK (spectator_delay_ms IS NULL OR spectator_delay_ms >= 0);
