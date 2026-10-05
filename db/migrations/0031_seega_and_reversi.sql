-- Seega and Reversi, both registered on the SAME game/duel/rating/
-- matchmaking machinery every other launch game runs on -- no new tables,
-- no separate match engine. See each plugin's own header for its
-- versioned ruleset (packages/game-seega/src/seega.mjs, packages/
-- game-reversi/src/reversi.mjs).
--
-- Both launch FREE only. Reversi is a near-solved game at the level of
-- casual/ranked play (perfect play is known to be a Black loss, though
-- not yet fully solved for every position), the same "no cash on a
-- skill-neutralised board" reasoning migrations 0028/0029 already
-- applied to Checkers and Connect Four. Seega is not remotely solved,
-- but for a brand-new game FREE-only is still the same deliberate,
-- explicit-per-game compliance decision every prior new-game migration
-- in this series has made -- never implied by default.

INSERT INTO game (id, display_name, plugin_version, is_live, cash_enabled) VALUES
  ('seega', 'Seega', 1, TRUE, FALSE),
  ('reversi', 'Reversi', 1, TRUE, FALSE);
