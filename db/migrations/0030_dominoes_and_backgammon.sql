-- Dominoes and Backgammon, both registered on the SAME game/duel/rating/
-- matchmaking machinery every other launch game runs on -- no new tables,
-- no separate match engine. See each plugin's own header for its
-- versioned ruleset (packages/game-dominoes/src/dominoes.mjs, packages/
-- game-backgammon/src/backgammon.mjs).
--
-- Both games launch FREE only. Neither is a solved game the way XO,
-- Checkers and Connect Four are (migrations 0028/0029's own reason for
-- FREE-only) -- for these two, FREE-only is the same deliberate,
-- explicit-per-game compliance decision migration 0029 already made for
-- Speed Math: cash eligibility for a brand-new game is never implied by
-- default, only ever turned on later as its own explicit decision.

INSERT INTO game (id, display_name, plugin_version, is_live, cash_enabled) VALUES
  ('dominoes', 'Dominoes', 1, TRUE, FALSE),
  ('backgammon', 'Backgammon', 1, TRUE, FALSE);
