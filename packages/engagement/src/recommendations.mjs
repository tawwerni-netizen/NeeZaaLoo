/**
 * Cross-game discovery: "you're strong at strategic games, try Reversi" /
 * "you're improving quickly in Checkers, explore Gomoku." Every input is
 * gameplay data this platform already computes and already shows the
 * player directly (mastery, rating history) -- nothing here infers or
 * stores anything about WHO a player is, only what they have PLAYED, so
 * there is no sensitive-characteristic surface to expose in the first
 * place.
 *
 * `GAME_CATEGORIES` is a small, static, purely descriptive tagging of
 * this platform's own ten launch games by the KIND of skill they reward
 * -- never derived from a player's data, and identical for every player.
 */
export const GAME_CATEGORIES = Object.freeze({
  chess: ["STRATEGY", "DEEP"],
  checkers: ["STRATEGY"],
  reversi: ["STRATEGY"],
  gomoku: ["STRATEGY", "PATTERN"],
  seega: ["STRATEGY", "TACTICAL"],
  backgammon: ["STRATEGY", "PROBABILITY"],
  dominoes: ["TACTICAL", "PROBABILITY"],
  "connect-four": ["TACTICAL", "PATTERN"],
  xo: ["TACTICAL", "FAST"],
  "speed-math": ["SPEED", "ARITHMETIC"],
});

// A game the player has played but not yet ESTABLISHED a rating in
// (or never played at all) is a legitimate recommendation target; an
// established game is "already discovered," not something to suggest.
function isCandidate(masteryById, gameId) {
  const entry = masteryById.get(gameId);
  return !entry || !entry.established;
}

/**
 * @param {{gameId:string, established:boolean, percentile:number|null}[]} mastery
 *        Every game the player has ever played (packages/mastery's own shape).
 * @param {string[]} trendingGameIds Games where recent rating movement is a
 *        real, meaningful improvement (see the DB-facing service below for
 *        how that is measured) -- never a guess, always derived from
 *        `rating_change`'s own recorded history.
 * @returns {{gameId:string, reasonKey:string, reasonData:object}[]}
 */
export function recommendGames({ mastery = [], trendingGameIds = [] } = {}, { limit = 3 } = {}) {
  const masteryById = new Map(mastery.map((m) => [m.gameId, m]));
  const recs = [];
  const seen = new Set();

  // 1. "Improving quickly in X -- explore Y" -- a related, not-yet-mastered
  // game sharing a category with a game the player is genuinely trending
  // up in right now. Checked first: recent momentum is a more timely,
  // specific reason than a static strength.
  for (const fromGame of trendingGameIds) {
    for (const category of GAME_CATEGORIES[fromGame] ?? []) {
      for (const [gameId, categories] of Object.entries(GAME_CATEGORIES)) {
        if (seen.has(gameId) || gameId === fromGame) continue;
        if (!isCandidate(masteryById, gameId)) continue;
        if (categories.includes(category)) {
          recs.push({ gameId, reasonKey: "improving_related", reasonData: { fromGame, category } });
          seen.add(gameId);
        }
      }
    }
  }

  // 2. "Strong at strategic games -- try Reversi" -- a related,
  // not-yet-mastered game sharing a category with games the player has
  // already demonstrated real (established, above-median) skill in.
  const strongCategoryCounts = new Map();
  for (const m of mastery) {
    if (m.established && m.percentile !== null && m.percentile >= 0.5) {
      for (const category of GAME_CATEGORIES[m.gameId] ?? []) {
        strongCategoryCounts.set(category, (strongCategoryCounts.get(category) ?? 0) + 1);
      }
    }
  }
  const scored = Object.entries(GAME_CATEGORIES)
    .filter(([gameId]) => !seen.has(gameId) && isCandidate(masteryById, gameId))
    .map(([gameId, categories]) => {
      let bestCategory = null, bestScore = 0;
      for (const category of categories) {
        const weight = strongCategoryCounts.get(category) ?? 0;
        if (weight > bestScore) { bestScore = weight; bestCategory = category; }
      }
      return { gameId, score: bestScore, category: bestCategory };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const c of scored) {
    recs.push({ gameId: c.gameId, reasonKey: "strong_category", reasonData: { category: c.category } });
    seen.add(c.gameId);
  }

  return recs.slice(0, limit);
}

/**
 * How many games of rating history define "recent" for the trend check --
 * a real, disclosed sample size, not a guess from too few games.
 */
export const TREND_WINDOW = 10;
/** Minimum rating gain (x100 units, so 5000 = 50 rating points) over that
 * window to call it "improving quickly" -- a deliberately meaningful bar,
 * not any positive movement at all. */
export const TREND_MIN_GAIN_X100 = 5000;

export function createRecommendationService(db, mastery) {
  async function trendingGamesFor(playerId) {
    const r = await db.query(
      `WITH ranked AS (
         SELECT game_id, rating_after_x100, rating_before_x100,
                row_number() OVER (PARTITION BY game_id ORDER BY created_at DESC) AS rn
           FROM rating_change WHERE player_id = $1
       )
       SELECT game_id,
              MAX(rating_after_x100) FILTER (WHERE rn = 1) AS latest,
              MAX(rating_before_x100) FILTER (WHERE rn = $2) AS baseline
         FROM ranked
        GROUP BY game_id
       HAVING MAX(rating_before_x100) FILTER (WHERE rn = $2) IS NOT NULL`,
      [playerId, TREND_WINDOW]
    );
    return r.rows
      .filter((row) => row.latest - row.baseline >= TREND_MIN_GAIN_X100)
      .map((row) => row.game_id);
  }

  async function recommendationsFor(playerId, opts) {
    const [entries, trendingGameIds] = await Promise.all([
      mastery.masteryFor(playerId),
      trendingGamesFor(playerId),
    ]);
    return recommendGames({ mastery: entries, trendingGameIds }, opts);
  }

  return { recommendationsFor, trendingGamesFor };
}
