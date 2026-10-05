/**
 * The Gomoku AI adapter -- same contract as every other launch game's own
 * ai.mjs: pure, and never anything but a legal placement (the platform
 * revalidates it through the ordinary INTENT path regardless).
 *
 * `chooseAction` receives nothing but the SERVER's own authoritative
 * `state` (the same object project()/applyIntent operate on) -- exactly
 * like every other adapter in this codebase, and the whole reason that
 * requirement is trivially satisfied here: there is no separate,
 * client-shaped view this adapter could substitute for the real board
 * even if it wanted to.
 *
 * Search: a 225-cell board makes a real minimax intractable, so this is
 * a single-ply pattern heuristic instead -- the standard shape of a
 * simple, honest Gomoku bot. For every candidate cell (restricted to
 * empty cells within 2 squares of an existing stone -- the tactically
 * relevant region; an empty board's only candidate is the center), score
 * how good that placement would be for the bot's OWN lines, and
 * separately how good it would be for the OPPONENT if they played there
 * instead (i.e. what this placement denies them). The candidate with the
 * highest combined score wins. Lower tiers add a seeded blunder chance
 * (a uniformly random candidate instead), the same construction every
 * other adapter in this codebase uses.
 */
import { BOARD_SIZE, CELLS, other, pieceFor } from "./gomoku.mjs";

export const Difficulty = Object.freeze({
  EASY: "EASY", MEDIUM: "MEDIUM", HARD: "HARD", EXPERT: "EXPERT", INVINCIBLE: "INVINCIBLE",
});

const TIER = Object.freeze({
  [Difficulty.EASY]:   { blunderChance: 0.55 },
  [Difficulty.MEDIUM]: { blunderChance: 0.25 },
  [Difficulty.HARD]:   { blunderChance: 0.08 },
  [Difficulty.EXPERT]: { blunderChance: 0 },
  [Difficulty.INVINCIBLE]: { blunderChance: 0 },
});

// How much a placement's DEFENSIVE value (denying the opponent that same
// pattern) counts relative to its OFFENSIVE value -- weighted slightly
// below parity so the bot prefers finishing its own threats over purely
// reactive play when both are similarly strong, while still taking a
// real block seriously.
const DEFENSE_WEIGHT = 0.85;

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

function rowOf(idx) { return Math.floor(idx / BOARD_SIZE); }
function colOf(idx) { return idx % BOARD_SIZE; }
function inBounds(row, col) { return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE; }

/** Every empty cell within Chebyshev distance 2 of some existing stone --
 * the region a move could plausibly matter in. On a wholly empty board
 * (turn 1) this is empty, so the caller falls back to the center cell. */
function candidateCells(board) {
  const candidates = new Set();
  for (let idx = 0; idx < CELLS; idx++) {
    if (board[idx] === 0) continue;
    const row = rowOf(idx), col = colOf(idx);
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const r = row + dr, c = col + dc;
        if (!inBounds(r, c)) continue;
        const at = r * BOARD_SIZE + c;
        if (board[at] === 0) candidates.add(at);
      }
    }
  }
  return [...candidates];
}

/** A run of this length, with this many open ends (0, 1, or 2), scored by
 * how dangerous/valuable it is. 5+ is an immediate win. An open four is
 * effectively unstoppable (two different cells would complete it). */
function scoreForRun(run, openEnds) {
  if (run >= 5) return 1_000_000;
  if (run === 4) return openEnds >= 1 ? 100_000 : 1_000;
  if (run === 3) return openEnds === 2 ? 5_000 : openEnds === 1 ? 500 : 10;
  if (run === 2) return openEnds === 2 ? 200 : openEnds === 1 ? 50 : 5;
  return openEnds; // a lone stone -- negligible, but an open end is marginally better than none
}

const AXES = [[0, 1], [1, 0], [1, 1], [1, -1]];

/** How valuable placing `seat`'s stone at the EMPTY cell `idx` would be,
 * summed across all 4 axes. Reads the board as-is (idx itself is not
 * mutated) and simulates the hypothetical placement inline. */
function placementScore(board, seat, idx) {
  const mark = pieceFor(seat);
  const row0 = rowOf(idx), col0 = colOf(idx);
  let total = 0;

  for (const [dr, dc] of AXES) {
    let countPos = 0, openPos = false;
    let r = row0 + dr, c = col0 + dc;
    while (inBounds(r, c) && board[r * BOARD_SIZE + c] === mark) { countPos++; r += dr; c += dc; }
    if (inBounds(r, c) && board[r * BOARD_SIZE + c] === 0) openPos = true;

    let countNeg = 0, openNeg = false;
    r = row0 - dr; c = col0 - dc;
    while (inBounds(r, c) && board[r * BOARD_SIZE + c] === mark) { countNeg++; r -= dr; c -= dc; }
    if (inBounds(r, c) && board[r * BOARD_SIZE + c] === 0) openNeg = true;

    const run = countPos + countNeg + 1;
    const openEnds = (openPos ? 1 : 0) + (openNeg ? 1 : 0);
    total += scoreForRun(run, openEnds);
  }
  return total;
}

export function createGomokuAiAdapter() {
  return {
    chooseAction(state, seat, difficulty, _deadlineMs, seed = "ai") {
      const tier = TIER[difficulty] ?? TIER[Difficulty.EXPERT];
      const board = state.board;

      let candidates = candidateCells(board);
      if (candidates.length === 0) {
        const center = Math.floor(BOARD_SIZE / 2) * BOARD_SIZE + Math.floor(BOARD_SIZE / 2);
        candidates = [center];
      }

      const rnd = rngFrom(`${seed}:${state.moves.length}`);
      if (tier.blunderChance > 0 && rnd() < tier.blunderChance) {
        return candidates[Math.floor(rnd() * candidates.length)];
      }

      const opponent = other(seat);
      let best = candidates[0];
      let bestScore = -Infinity;
      for (const c of candidates) {
        const score = placementScore(board, seat, c) + DEFENSE_WEIGHT * placementScore(board, opponent, c);
        if (score > bestScore) { bestScore = score; best = c; }
      }
      return best;
    },
  };
}
