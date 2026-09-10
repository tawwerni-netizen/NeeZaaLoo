-- Two new launch games, both registered on the SAME game/duel/rating/
-- matchmaking machinery chess already runs on -- no new tables, no new
-- columns, no separate match engine. See each plugin's own header for its
-- versioned ruleset (packages/game-checkers/src/checkers.mjs,
-- packages/game-connect-four/src/connect-four.mjs).
--
-- Both are strongly-solved-adjacent games (Connect Four IS fully solved;
-- checkers has been weakly solved) and launch as FREE only, same as
-- migration 0003's own comment already anticipated for Connect Four --
-- a solved game is never cash-eligible regardless of this flag's value,
-- and that policy is enforced server-side, not merely by this default.

INSERT INTO game (id, display_name, plugin_version, is_live, cash_enabled) VALUES
  ('checkers', 'Checkers', 1, TRUE, FALSE),
  ('connect-four', 'Connect Four', 1, TRUE, FALSE);
