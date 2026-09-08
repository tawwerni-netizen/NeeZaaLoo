/**
 * The Global Skill Score: a single cross-game number built from percentiles,
 * not from a game's raw rating. Percentile is what makes chess and Speed
 * Math comparable in the first place.
 *
 * The one requirement everything here exists to satisfy (section 27 of the
 * founding architecture): NO SINGLE GAME MAY DOMINATE THE SCORE. A player who
 * has played 500 games of chess and 10 of Speed Math must not have their
 * score be, in effect, their chess rating wearing a costume.
 *
 * The method, in order:
 *   1. A game contributes nothing until its rating is ESTABLISHED
 *      (RD <= 110, 10+ games -- the same bar cash eligibility uses).
 *   2. Each established game gets a raw weight from MATURITY (how many games,
 *      saturating) x CONFIDENCE (how low the RD is).
 *   3. Raw weights are normalised to sum to 1, then CAPPED at 35% per game
 *      via water-filling: excess above the cap is redistributed to the other
 *      games in proportion to their own raw weight, iterated to a fixed point.
 *   4. A small BREADTH bonus rewards playing (and being established in)
 *      multiple games, capped so it cannot compensate for one game alone.
 *   5. The result is a score on a 0-1000 scale, plus a full breakdown a
 *      player (or a support agent) can read and verify by hand.
 */

export const MAX_GAME_WEIGHT = 0.35;
export const MATURITY_GAMES = 30;      // games played at which maturity saturates to 1
export const MAX_RD_X100 = 35000;      // a brand-new player's RD (350.00), confidence 0 there
export const BREADTH_STEP = 0.02;      // +2% per established game beyond the first
export const BREADTH_MAX_GAMES = 6;    // breadth bonus stops growing after this many
export const SCORE_SCALE = 1000;

/** How many established games are needed before the 35% cap can be satisfied
 *  at all (3 games x 35% = 105% >= 100%). Below this, capping is impossible
 *  without inventing weight from nowhere, so raw proportional weights are
 *  used instead -- explicitly, not silently. */
export const MIN_GAMES_FOR_CAP = Math.ceil(1 / MAX_GAME_WEIGHT);

/**
 * @param {{gameId:string, ratingX100:number, rdX100:number, gamesPlayed:number, percentile:number}} entry
 */
export function maturityOf(gamesPlayed) {
  return Math.max(0, Math.min(1, gamesPlayed / MATURITY_GAMES));
}

export function confidenceOf(rdX100) {
  return Math.max(0, Math.min(1, 1 - rdX100 / MAX_RD_X100));
}

/** Raw, pre-normalisation weight for one game: maturity x confidence. */
export function rawWeight(entry) {
  return maturityOf(entry.gamesPlayed) * confidenceOf(entry.rdX100);
}

/**
 * Water-filling cap: normalise weights to sum to 1, then repeatedly fix any
 * weight exceeding `cap` at exactly `cap` and redistribute the remaining
 * mass among the still-free entries in proportion to their own raw share,
 * until no weight exceeds the cap or every entry is fixed.
 *
 * Terminates in at most n iterations (one entry is fixed per iteration in
 * the worst case). Standard proportional-capping fixed point, same shape
 * used for capped budget allocation problems generally.
 *
 * @returns {{weights:number[], capped:boolean[], applied:boolean}}
 */
export function capNormalize(rawWeights, cap = MAX_GAME_WEIGHT) {
  const n = rawWeights.length;
  if (n === 0) return { weights: [], capped: [], applied: false };

  if (n < MIN_GAMES_FOR_CAP) {
    // The cap cannot be satisfied with this few entries (see MIN_GAMES_FOR_CAP).
    // Fall back to plain proportional weights rather than silently ignoring
    // the shortfall or, worse, pretending the cap applied when it could not.
    const sum = rawWeights.reduce((a, b) => a + b, 0);
    const weights = sum > 0
      ? rawWeights.map((w) => w / sum)
      : new Array(n).fill(1 / n);
    return { weights, capped: new Array(n).fill(false), applied: false };
  }

  const fixed = new Array(n).fill(false);
  const weights = new Array(n).fill(0);
  let freeIdx = rawWeights.map((_, i) => i);

  for (let iter = 0; iter < n; iter++) {
    const fixedMass = fixed.filter(Boolean).length * cap;
    const remainingMass = 1 - fixedMass;
    if (freeIdx.length === 0) break;

    const freeRawSum = freeIdx.reduce((a, i) => a + rawWeights[i], 0);
    const proposed = freeRawSum > 0
      ? freeIdx.map((i) => (rawWeights[i] / freeRawSum) * remainingMass)
      : freeIdx.map(() => remainingMass / freeIdx.length);

    const overflow = freeIdx.filter((_, k) => proposed[k] > cap + 1e-9);
    if (overflow.length === 0) {
      freeIdx.forEach((i, k) => { weights[i] = proposed[k]; });
      freeIdx = [];
      break;
    }
    for (const i of overflow) { fixed[i] = true; weights[i] = cap; }
    freeIdx = freeIdx.filter((i) => !fixed[i]);
  }
  // Any entry still unresolved after n iterations (should not happen given
  // the loop bound, but fail safe rather than leave a weight at 0 silently).
  for (const i of freeIdx) weights[i] = 0;

  return { weights, capped: fixed, applied: true };
}

/**
 * The breadth bonus: a small, capped reward for competence spread across
 * multiple games, applied AFTER the per-game cap so it cannot be used to
 * launder one dominant game into a higher score by itself.
 */
export function breadthMultiplier(establishedCount) {
  const extra = Math.max(0, Math.min(establishedCount - 1, BREADTH_MAX_GAMES - 1));
  return 1 + extra * BREADTH_STEP;
}

/**
 * Compute the Global Skill Score from a player's established-game entries.
 *
 * @param {{gameId:string, ratingX100:number, rdX100:number, gamesPlayed:number, percentile:number}[]} entries
 *        Only ESTABLISHED games should be passed in; the caller (the DB-facing
 *        service) is responsible for that filter, since it is a population
 *        query this pure function has no access to.
 * @returns {{score:number|null, tierInputPercentile:null, breakdown:object[], appliedCap:boolean, breadth:number}}
 */
export function globalSkillScore(entries) {
  if (entries.length === 0) {
    return { score: null, breakdown: [], appliedCap: false, breadth: 1 };
  }

  const raws = entries.map(rawWeight);
  const { weights, capped, applied } = capNormalize(raws, MAX_GAME_WEIGHT);

  const base = entries.reduce((sum, e, i) => sum + weights[i] * e.percentile, 0);
  const breadth = breadthMultiplier(entries.length);
  const score = Math.round(Math.min(1, base * breadth) * SCORE_SCALE);

  const breakdown = entries.map((e, i) => ({
    gameId: e.gameId,
    percentile: Number(e.percentile.toFixed(4)),
    rawWeight: Number(raws[i].toFixed(4)),
    weight: Number(weights[i].toFixed(4)),
    weightPct: Number((weights[i] * 100).toFixed(1)),
    wasCapped: capped[i] ?? false,
    contribution: Number((weights[i] * e.percentile).toFixed(4)),
  })).sort((a, b) => b.contribution - a.contribution);

  return { score, breakdown, appliedCap: applied, breadth: Number(breadth.toFixed(3)) };
}

/**
 * Tiers are PERCENTILE bands over the population of players who have a
 * score at all, not fixed score thresholds -- so "Grandmaster" keeps meaning
 * "roughly the top 1%" as the population grows, rather than becoming
 * either trivial or unreachable as the player base changes size.
 */
export const TIERS = [
  { name: "Grandmaster", minPercentile: 0.99 },
  { name: "Master", minPercentile: 0.95 },
  { name: "Diamond", minPercentile: 0.85 },
  { name: "Platinum", minPercentile: 0.65 },
  { name: "Gold", minPercentile: 0.35 },
  { name: "Silver", minPercentile: 0.10 },
  { name: "Bronze", minPercentile: 0 },
];

export function tierForPercentile(percentile) {
  for (const t of TIERS) if (percentile >= t.minPercentile) return t.name;
  return "Bronze";
}

/**
 * Assign tiers across a whole population of {playerId, score} pairs in one
 * pass. A player with no score (never established a rating anywhere) is
 * UNRANKED, not Bronze -- Bronze is still a rank earned by playing.
 */
export function assignTiers(populationScores) {
  const ranked = populationScores.filter((p) => p.score !== null);
  const sorted = [...ranked].sort((a, b) => a.score - b.score);
  const n = sorted.length;

  const percentileByPlayer = new Map();
  sorted.forEach((p, i) => {
    // Percentile of strictly-lower-or-equal scores; ties share the same band
    // by using the LAST index among equal scores, so a tie never splits two
    // players with an identical score into two different tiers.
    let j = i;
    while (j + 1 < n && sorted[j + 1].score === p.score) j++;
    const percentile = n === 1 ? 1 : j / (n - 1);
    percentileByPlayer.set(p.playerId, percentile);
  });

  return populationScores.map((p) => ({
    playerId: p.playerId,
    score: p.score,
    percentile: p.score === null ? null : Number(percentileByPlayer.get(p.playerId).toFixed(4)),
    tier: p.score === null ? "UNRANKED" : tierForPercentile(percentileByPlayer.get(p.playerId)),
  }));
}
