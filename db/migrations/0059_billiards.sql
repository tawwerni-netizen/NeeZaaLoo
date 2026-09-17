-- Billiards (8-Ball Pool), the eleventh launch game -- registered on the
-- SAME game/duel/rating/matchmaking machinery every other launch game
-- runs on, no new tables, no separate match engine. See the plugin's own
-- header for its versioned ruleset and physics
-- (packages/game-billiards/src/billiards.mjs).
--
-- FREE only at launch, the same deliberate, explicit-per-game compliance
-- decision every prior new-game migration in this series has made --
-- never implied by default. This is a genuinely new, from-scratch
-- physics engine rather than a variant of an existing turn-based game,
-- so it stays FREE until it has actually been reviewed technically and
-- for security (per this session's own request) and an admin explicitly
-- flips Games -> Billiards -> cash on, exactly the same one-click path
-- every other game's cash eligibility already goes through.

INSERT INTO game (id, display_name, plugin_version, is_live, cash_enabled) VALUES
  ('billiards', 'Billiards', 1, TRUE, FALSE)
ON CONFLICT (id) DO UPDATE SET is_live = TRUE;

