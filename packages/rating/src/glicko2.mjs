/**
 * Glicko-2 rating system (Mark Glickman).
 *
 * Chosen over Elo because it models rating deviation and volatility, and both
 * carry weight here beyond matchmaking accuracy:
 *
 *   - RD is a direct anti-smurf and anti-sandbagging signal. A player whose RD
 *     is high is one we do not yet know, and cash-tier eligibility can require
 *     RD below a threshold: "we actually know how good you are".
 *   - Volatility rises when results are erratic, which is exactly the shape a
 *     sandbagged account produces.
 *
 * Implemented directly from Glickman's paper, including the Illinois-variant
 * root find for volatility. Verified against the worked example in that paper.
 */

const SCALE = 173.7178;        // Glicko-2 <-> Glicko conversion constant
const DEFAULT_RATING = 1500;
const DEFAULT_RD = 350;
const DEFAULT_VOLATILITY = 0.06;
const MAX_RD = 350;            // an unrated player is never more uncertain than this
const CONVERGENCE = 1e-6;

/** System constant: how much volatility may move per period. Smaller = steadier. */
export const DEFAULT_TAU = 0.5;

export const defaultRating = () => ({
  rating: DEFAULT_RATING,
  rd: DEFAULT_RD,
  volatility: DEFAULT_VOLATILITY,
});

const toGlicko2 = (p) => ({ mu: (p.rating - DEFAULT_RATING) / SCALE, phi: p.rd / SCALE, sigma: p.volatility });
const fromGlicko2 = (mu, phi, sigma) => ({
  rating: SCALE * mu + DEFAULT_RATING,
  rd: Math.min(SCALE * phi, MAX_RD),
  volatility: sigma,
});

const g = (phi) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const E = (mu, muJ, phiJ) => 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

/**
 * Update one player against the results of a rating period.
 *
 * @param {{rating:number, rd:number, volatility:number}} player
 * @param {Array<{rating:number, rd:number, score:number}>} results
 *        score is 1 (win), 0.5 (draw), 0 (loss)
 * @param {{tau?:number}} [opts]
 */
export function updateRating(player, results, { tau = DEFAULT_TAU } = {}) {
  const { mu, phi, sigma } = toGlicko2(player);

  // A player who did not compete only becomes less certain; their rating and
  // volatility are untouched. This is what makes ratings decay honestly rather
  // than drift.
  if (results.length === 0) {
    return fromGlicko2(mu, Math.sqrt(phi * phi + sigma * sigma), sigma);
  }

  let vInv = 0;
  let deltaSum = 0;
  for (const r of results) {
    const { mu: muJ, phi: phiJ } = toGlicko2(r);
    const gj = g(phiJ);
    const ej = E(mu, muJ, phiJ);
    vInv += gj * gj * ej * (1 - ej);
    deltaSum += gj * (r.score - ej);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  const sigmaPrime = solveVolatility({ sigma, phi, v, delta, tau });

  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * deltaSum;

  return fromGlicko2(muPrime, phiPrime, sigmaPrime);
}

/**
 * Illinois-variant regula falsi, per the paper. Kept as its own function
 * because it is the one part of Glicko-2 that is easy to get subtly wrong and
 * hard to notice: a bad root find still returns plausible-looking ratings.
 */
function solveVolatility({ sigma, phi, v, delta, tau }) {
  const a = Math.log(sigma * sigma);
  const d2 = delta * delta;
  const p2 = phi * phi;

  const f = (x) => {
    const ex = Math.exp(x);
    const num = ex * (d2 - p2 - v - ex);
    const den = 2 * Math.pow(p2 + v + ex, 2);
    return num / den - (x - a) / (tau * tau);
  };

  let A = a;
  let B;
  if (d2 > p2 + v) {
    B = Math.log(d2 - p2 - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);
  let guard = 0;
  while (Math.abs(B - A) > CONVERGENCE) {
    if (++guard > 1000) break;   // never spin forever on a pathological input
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  return Math.exp(A / 2);
}

/**
 * Convenience for a single head-to-head duel: update both players against each
 * other's PRE-duel ratings. Order of evaluation must not matter, so both are
 * computed from the same snapshot.
 */
export function applyDuel(a, b, scoreA, opts) {
  const scoreB = 1 - scoreA;
  return {
    a: updateRating(a, [{ rating: b.rating, rd: b.rd, score: scoreA }], opts),
    b: updateRating(b, [{ rating: a.rating, rd: a.rd, score: scoreB }], opts),
  };
}

/** Expected score for `a` against `b`, in [0,1]. Used for seeding and analytics. */
export function expectedScore(a, b) {
  const { mu } = toGlicko2(a);
  const { mu: muB, phi: phiB } = toGlicko2(b);
  return E(mu, muB, phiB);
}

// --- Integer storage ---------------------------------------------------------
// Ratings are persisted as scaled integers. Floating point has no place in
// anything that gates eligibility or orders a leaderboard.

export const toStorage = (p) => ({
  rating_x100: Math.round(p.rating * 100),
  rd_x100: Math.round(p.rd * 100),
  volatility_x1e6: Math.round(p.volatility * 1e6),
});

export const fromStorage = (row) => ({
  rating: row.rating_x100 / 100,
  rd: row.rd_x100 / 100,
  volatility: row.volatility_x1e6 / 1e6,
});

/**
 * Is this rating certain enough to stake money on?
 * Mirrors rating_is_established() in migration 0003 -- the two must agree, and
 * the test suite asserts that they do.
 */
export const isEstablished = (p, gamesPlayed) => p.rd <= 110 && gamesPlayed >= 10;
