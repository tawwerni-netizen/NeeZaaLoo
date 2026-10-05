-- VS_COMPUTER mode: the platform's first opponent that is not a real
-- player. Two small, additive columns and a fixed catalog of four bot
-- identities (one per difficulty tier) -- deliberately NOT the full
-- game/mode taxonomy migration the Universal Game Platform spec
-- describes (that is a larger, separately-reviewed change touching
-- matchmaking broadly); this is the minimal, safe addition this slice's
-- VS_COMPUTER feature actually needs.
--
-- `player.is_ai` exists so every other system that must never confuse a
-- bot for a human -- wallets, KYC, leaderboards, Global Skill, tournament
-- standings -- has exactly one column to filter on, per the Universal
-- Game Platform spec's own "AI opponents are rows in player" decision.
--
-- `duel.is_vs_computer` exists so settlement and progression, which are
-- otherwise completely game- and opponent-blind, have the one signal
-- they need to enforce "VS_COMPUTER rates nothing and awards nothing" --
-- see settle.mjs's and progression/service.mjs's own comments on exactly
-- where this is checked.

ALTER TABLE player ADD COLUMN is_ai BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE duel ADD COLUMN is_vs_computer BOOLEAN NOT NULL DEFAULT FALSE;

-- A bot must never appear where a real opponent pool is being counted or
-- ranked. This partial index is what a future leaderboard/matchmaking
-- query should scan instead of filtering `is_ai` at read time everywhere.
CREATE INDEX player_human_idx ON player (id) WHERE is_ai = FALSE;

-- The fixed bot catalog: one identity per difficulty, matching
-- packages/game-chess/src/ai.mjs's own Difficulty enum. A bot's `handle`
-- is deliberately human-legible ("ai_easy" etc.) since it is exactly what
-- renders in a player strip, a chat nickname, or a replay -- there is no
-- separate "display name" column for players in this schema, and a bot
-- must render through the SAME profile/nickname path a human does.
INSERT INTO player (id, handle) VALUES
  ('ai-easy',   'ai_easy'),
  ('ai-medium', 'ai_medium'),
  ('ai-hard',   'ai_hard'),
  ('ai-expert', 'ai_expert');

UPDATE player SET is_ai = TRUE WHERE id IN ('ai-easy', 'ai-medium', 'ai-hard', 'ai-expert');
