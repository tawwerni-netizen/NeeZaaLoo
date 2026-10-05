-- Gomoku, the tenth and final launch game, registered on the SAME
-- game/duel/rating/matchmaking machinery every other launch game runs
-- on -- no new tables, no separate match engine. See the plugin's own
-- header for its versioned ruleset (packages/game-gomoku/src/gomoku.mjs).
--
-- FREE only at launch, the same deliberate, explicit-per-game compliance
-- decision every prior new-game migration in this series has made --
-- never implied by default, regardless of how solved or unsolved the
-- game actually is.

INSERT INTO game (id, display_name, plugin_version, is_live, cash_enabled) VALUES
  ('gomoku', 'Gomoku', 1, TRUE, FALSE);
