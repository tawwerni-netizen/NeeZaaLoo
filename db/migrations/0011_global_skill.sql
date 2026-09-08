-- =============================================================================
-- 0011_global_skill.sql
--
-- The population-facing half of the Global Skill Score: where a player's
-- per-game rating sits relative to OTHER players of that same game.
--
-- Percentile, not raw rating, is what makes cross-game combination possible
-- at all -- a chess rating and a Speed Math rating are not on the same scale,
-- but "better than 80% of established chess players" and "better than 80% of
-- established Speed Math players" are directly comparable.
--
-- A game contributes NOTHING to the score until the rating is established
-- (reusing rating_is_established from 0003: RD <= 110, 10+ games). An
-- untested rating is not a fact about skill yet, and letting it into a
-- cross-game average would let a lucky first game distort the whole score.
-- =============================================================================

CREATE VIEW game_rating_percentile AS
SELECT
  r.player_id,
  r.game_id,
  r.rating_x100,
  r.rd_x100,
  r.games_played,
  -- Percentile among ESTABLISHED players of the SAME game only. A brand-new
  -- game with few established players will have a coarse distribution; that
  -- is honest, not a bug, and resolves itself as the population grows.
  PERCENT_RANK() OVER (
    PARTITION BY r.game_id
    ORDER BY r.rating_x100
  ) AS percentile
FROM rating r
WHERE rating_is_established(r.rd_x100, r.games_played);

COMMENT ON VIEW game_rating_percentile IS
  'Per-game percentile rank among established players of that game. '
  'Feeds the Global Skill Score; see packages/global-skill.';
