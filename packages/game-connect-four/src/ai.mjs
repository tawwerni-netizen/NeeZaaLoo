/**
 * The Connect Four AI adapter -- same shape and contract as
 * packages/game-chess/src/ai.mjs and packages/game-checkers/src/ai.mjs:
 * pure, bounded by a deadline, never anything but a legal column (the
 * platform revalidates it through the ordinary INTENT path regardless).
 *
 * Search: negamax with alpha-beta over cloned boards (a 42-cell board
 * clones for nothing). The heuristic is the well-known "count open lines
 * of four, weighted by how many are already yours" evaluation -- not a
 * full solver (Connect Four is a solved game with perfect play, but
 * shipping a solver would make EXPERT literally unbeatable, which reads
 * as broken, not skilled -- see the same "no naive full-strength engine"
 * judgement chess's own EXPERT tier already makes by capping search
 * depth rather than using a tablebase).
 */
import { drop, legalColumns, isWinningPlacement, COLS, ROWS, SEAT_0, SEAT_1 } from "./connect-four.mjs";

export const Difficulty = Object.freeze({
  EASY: "EASY", MEDIUM: "MEDIUM", HARD: "HARD", EXPERT: "EXPERT",
});

const TIER = Object.freeze({
  [Difficulty.EASY]:   { maxDepth: 2, blunderChance: 0.35 },
  [Difficulty.MEDIUM]: { maxDepth: 4, blunderChance: 0.15 },
  [Difficulty.HARD]:   { maxDepth: 6, blunderChance: 0 },
  [Difficulty.EXPERT]: { maxDepth: 8, blunderChance: 0 },
});

// Centre columns produce more possible lines of four than the edges --
// the single best-known cheap heuristic term for this game.
const COLUMN_WEIGHT = [1, 2, 3, 4, 3, 2, 1];

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

const idx = (row, col) => row * COLS + col;
const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];

/** Score every possible 4-in-a-row WINDOW on the board: +1 per own token
 * in an otherwise-empty-or-own window, -1 (mirrored) for the opponent,
 * from seat 0's perspective. Plus the column-centrality bonus. */
function evaluate(board) {
  let score = 0;
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const token = board[idx(r, c)];
      if (token !== 0) score += (token > 0 ? 1 : -1) * COLUMN_WEIGHT[c];
    }
  }
  for (const [dr, dc] of DIRECTIONS) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const endR = r + dr * 3, endC = c + dc * 3;
        if (endR < 0 || endR >= ROWS || endC < 0 || endC >= COLS) continue; // window would run off the board
        let mine = 0, theirs = 0;
        for (let step = 0; step < 4; step++) {
          const token = board[idx(r + dr * step, c + dc * step)];
          if (token > 0) mine++; else if (token < 0) theirs++;
        }
        if (mine > 0 && theirs === 0) score += mine * mine;
        if (theirs > 0 && mine === 0) score -= theirs * theirs;
      }
    }
  }
  return score;
}

function negamax(board, seat, depth, alpha, beta, deadlineAt) {
  if (Date.now() > deadlineAt) return { score: 0, timedOut: true };

  const cols = legalColumns(board);
  if (cols.length === 0) return { score: 0, timedOut: false }; // drawn board
  if (depth === 0) return { score: seat === SEAT_0 ? evaluate(board) : -evaluate(board), timedOut: false };

  let best = -Infinity;
  for (const col of cols) {
    const placed = drop(board, col, seat);
    if (isWinningPlacement(placed.board, placed.row, placed.col)) {
      return { score: 100000 + depth, timedOut: false };
    }
    const opponent = seat === SEAT_0 ? SEAT_1 : SEAT_0;
    const sub = negamax(placed.board, opponent, depth - 1, -beta, -alpha, deadlineAt);
    if (sub.timedOut) return { score: 0, timedOut: true };
    const score = -sub.score;
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return { score: best, timedOut: false };
}

function searchBestColumn(board, seat, maxDepth, deadlineAt) {
  const cols = legalColumns(board);
  if (cols.length === 0) return null;
  if (cols.length === 1) return cols[0];

  let best = cols[0];
  for (let depth = 1; depth <= maxDepth; depth++) {
    if (Date.now() > deadlineAt) break;
    let bestAtDepth = null;
    let bestScore = -Infinity;
    let cutOff = false;
    for (const col of cols) {
      const placed = drop(board, col, seat);
      let score;
      if (isWinningPlacement(placed.board, placed.row, placed.col)) {
        score = 100000 + depth;
      } else {
        const opponent = seat === SEAT_0 ? SEAT_1 : SEAT_0;
        const sub = negamax(placed.board, opponent, depth - 1, -Infinity, Infinity, deadlineAt);
        if (sub.timedOut) { cutOff = true; break; }
        score = -sub.score;
      }
      if (score > bestScore) { bestScore = score; bestAtDepth = col; }
    }
    if (cutOff || bestAtDepth === null) break;
    best = bestAtDepth;
  }
  return best;
}

export function createConnectFourAiAdapter() {
  return {
    chooseAction(state, seat, difficulty, deadlineMs = 2000, seed = "ai") {
      const tier = TIER[difficulty] ?? TIER[Difficulty.MEDIUM];
      const deadlineAt = Date.now() + Math.max(50, deadlineMs);
      const cols = legalColumns(state.board);
      if (cols.length === 0) return null;

      const rnd = rngFrom(`${seed}:${state.moves.length}`);
      if (tier.blunderChance > 0 && rnd() < tier.blunderChance) {
        return cols[Math.floor(rnd() * cols.length)];
      }

      return searchBestColumn(state.board, seat, tier.maxDepth, deadlineAt);
    },
  };
}
