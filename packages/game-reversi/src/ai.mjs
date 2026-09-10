/**
 * The Reversi AI adapter -- same contract as every other launch game's
 * own ai.mjs: pure, and never anything but a legal action (the platform
 * revalidates it through the ordinary INTENT path regardless).
 *
 * Search: a single-ply positional heuristic over a classic Othello
 * square-weight table (corners are permanently safe and heavily
 * favoured; the squares diagonally adjacent to an EMPTY corner are
 * heavily penalised, since they hand the opponent that corner) plus the
 * discs flipped by the move itself -- the same standard evaluation every
 * introductory Othello engine starts from, not a deep search. Lower
 * tiers add a seeded blunder chance (a uniformly random legal move
 * instead), the same construction every other adapter in this codebase
 * uses.
 */
import { legalMoves, outflankedBy } from "./reversi.mjs";

export const Difficulty = Object.freeze({
  EASY: "EASY", MEDIUM: "MEDIUM", HARD: "HARD", EXPERT: "EXPERT",
});

const TIER = Object.freeze({
  [Difficulty.EASY]:   { blunderChance: 0.50 },
  [Difficulty.MEDIUM]: { blunderChance: 0.22 },
  [Difficulty.HARD]:   { blunderChance: 0.07 },
  [Difficulty.EXPERT]: { blunderChance: 0 },
});

// The classic Othello positional weight table: corners are permanently
// unflippable and the single most valuable square on the board; the
// squares diagonally adjacent to a corner are the most dangerous (playing
// one, while that corner is still empty, is what usually hands it away).
const WEIGHTS = Object.freeze([
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
]);

function rngFrom(seed) {
  let h = 2166136261 >>> 0;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return function next() {
    h |= 0; h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scoreMove(board, seat, place) {
  const flipped = outflankedBy(board, place, seat);
  let score = WEIGHTS[place];
  for (const f of flipped) score += WEIGHTS[f];
  return score;
}

export function createReversiAiAdapter() {
  return {
    chooseAction(state, seat, difficulty, _deadlineMs, seed = "ai") {
      const tier = TIER[difficulty] ?? TIER[Difficulty.MEDIUM];
      const candidates = legalMoves(state.board, seat);
      if (candidates.length === 0) return { pass: true };

      const rnd = rngFrom(`${seed}:${state.moves.length}`);
      if (tier.blunderChance > 0 && rnd() < tier.blunderChance) {
        return { place: candidates[Math.floor(rnd() * candidates.length)] };
      }

      let best = candidates[0];
      let bestScore = scoreMove(state.board, seat, best);
      for (const c of candidates.slice(1)) {
        const s = scoreMove(state.board, seat, c);
        if (s > bestScore) { best = c; bestScore = s; }
      }
      return { place: best };
    },
  };
}
