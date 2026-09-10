-- XO (Tic-Tac-Toe) and Speed Math, both registered on the SAME game/duel/
-- rating/matchmaking machinery every other launch game runs on -- no new
-- tables, no separate match engine. See each plugin's own header for its
-- versioned ruleset (packages/game-xo/src/xo.mjs, packages/game-speed-math/
-- src/plugin.mjs's own "CHALLENGE RULES" section).
--
-- Speed Math's own plugin, rules engine and tests have existed since an
-- earlier slice, but this row was never actually inserted -- a real gap
-- (see this migration's own git history): the game could not be
-- matchmade, rated, or tournament-registered without a `game` row, no
-- matter how complete its plugin was. XO is entirely new.
--
-- XO is a solved game (perfect play always draws) and launches FREE only,
-- same policy as every other solved/near-solved launch game (Connect
-- Four, Checkers) per migration 0003's own comment. Speed Math is not
-- solved in the same sense, but launches FREE only for now regardless --
-- cash eligibility is a compliance decision made once, explicitly, per
-- game, never a default this migration should imply either way.

INSERT INTO game (id, display_name, plugin_version, is_live, cash_enabled) VALUES
  ('xo', 'XO', 1, TRUE, FALSE),
  ('speed-math', 'Speed Math', 1, TRUE, FALSE);
