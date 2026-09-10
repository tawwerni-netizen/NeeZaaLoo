/**
 * Per-game Mastery: a legitimacy-gated label over data that already
 * exists and is already authoritative -- a game's own Glicko-2 rating
 * (packages/rating) and that rating's percentile among ESTABLISHED
 * players of the SAME game (`game_rating_percentile`, migration 0011,
 * the same view Global Skill reads). Mastery is never stored (see
 * migration 0034's own header) and never a separate number a player can
 * push up by any means other than the two things it actually measures:
 * TIME INVESTED (games played) and DEMONSTRATED SKILL (percentile rank
 * among real opponents, which Glicko-2 already resists inflating via
 * farming weak opponents or a lucky short streak -- see packages/rating's
 * own header on why RD/volatility exist).
 *
 * Both gates must clear together. Games-played alone cannot buy a level
 * (a 500-game player stuck at the 40th percentile stays Intermediate);
 * percentile alone cannot either (a brand-new account cannot claim
 * "Master" off ten lucky games -- ESTABLISHED already requires 10, and
 * every level past Intermediate requires far more).
 */

export const MasteryLevel = Object.freeze({
  BEGINNER: "BEGINNER",
  INTERMEDIATE: "INTERMEDIATE",
  ADVANCED: "ADVANCED",
  EXPERT: "EXPERT",
  MASTER: "MASTER",
});

/** Display/roadmap order, least to most senior. */
export const MASTERY_ORDER = [
  MasteryLevel.BEGINNER, MasteryLevel.INTERMEDIATE, MasteryLevel.ADVANCED,
  MasteryLevel.EXPERT, MasteryLevel.MASTER,
];

// Checked most-senior first: the first threshold whose BOTH bars are
// cleared wins. `minPercentile` is measured against established players
// of that same game only (see game_rating_percentile's own definition).
const THRESHOLDS = [
  { level: MasteryLevel.MASTER, minGames: 250, minPercentile: 0.90 },
  { level: MasteryLevel.EXPERT, minGames: 100, minPercentile: 0.75 },
  { level: MasteryLevel.ADVANCED, minGames: 30, minPercentile: 0.50 },
];

/**
 * @param {{gamesPlayed:number, established:boolean, percentile:number|null}} entry
 * @returns {string} a MasteryLevel
 */
export function masteryLevel({ gamesPlayed, established, percentile }) {
  if (!established) return MasteryLevel.BEGINNER;
  for (const t of THRESHOLDS) {
    if (gamesPlayed >= t.minGames && percentile >= t.minPercentile) return t.level;
  }
  // Established (RD<=110, games>=10) but below every higher bar.
  return MasteryLevel.INTERMEDIATE;
}

export function masteryIndex(level) {
  return MASTERY_ORDER.indexOf(level);
}
