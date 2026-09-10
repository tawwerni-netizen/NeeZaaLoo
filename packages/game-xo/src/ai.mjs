/**
 * The XO AI adapter -- same shape and contract as every other launch
 * game's own ai.mjs: pure, bounded, never anything but a legal move.
 *
 * Search: exhaustive minimax (no pruning even needed -- a 3x3 board has
 * at most 9! reachable move sequences, and legal-move pruning at each
 * ply keeps the real count far smaller than that). EXPERT plays this
 * minimax exactly, which means EXPERT is provably unbeatable -- the
 * well-known, common-knowledge fact about optimal Tic-Tac-Toe, not a
 * design flaw the way an unbeatable chess engine would be. Lower tiers
 * use the SAME seeded blunder injection every other adapter in this
 * codebase uses, never `Math.random`.
 */
import { legalCells, winningLine, place, isBoardFull, CELLS, SEAT_0, SEAT_1 } from "./xo.mjs";

export const Difficulty = Object.freeze({
  EASY: "EASY", MEDIUM: "MEDIUM", HARD: "HARD", EXPERT: "EXPERT",
});

const TIER = Object.freeze({
  [Difficulty.EASY]:   { blunderChance: 0.55 },
  [Difficulty.MEDIUM]: { blunderChance: 0.25 },
  [Difficulty.HARD]:   { blunderChance: 0.08 },
  [Difficulty.EXPERT]: { blunderChance: 0 },
});

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

/** Negamax from `seat`'s perspective. Terminal scores favour a FASTER win
 * and a SLOWER loss, so the engine never delays an already-won position
 * or rushes into an already-lost one -- the standard tic-tac-toe minimax
 * refinement, not an approximation. */
function negamax(board, seat, cell, depth) {
  const line = cell === null ? null : winningLine(board, cell);
  if (line) return -10 + depth; // the player who just moved (the OTHER seat) won
  if (isBoardFull(board)) return 0;

  let best = -Infinity;
  for (const c of legalCells(board)) {
    const next = place(board, c, seat);
    const opponent = seat === SEAT_0 ? SEAT_1 : SEAT_0;
    const score = -negamax(next, opponent, c, depth + 1);
    if (score > best) best = score;
  }
  return best;
}

function searchBestCell(board, seat) {
  const cells = legalCells(board);
  if (cells.length === 0) return null;
  if (cells.length === 1) return cells[0];

  let best = cells[0];
  let bestScore = -Infinity;
  for (const c of cells) {
    const next = place(board, c, seat);
    const opponent = seat === SEAT_0 ? SEAT_1 : SEAT_0;
    const score = -negamax(next, opponent, c, 1);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

export function createXoAiAdapter() {
  return {
    chooseAction(state, seat, difficulty, _deadlineMs, seed = "ai") {
      const tier = TIER[difficulty] ?? TIER[Difficulty.MEDIUM];
      const legal = legalCells(state.board);
      if (legal.length === 0) return null;

      const rnd = rngFrom(`${seed}:${state.moves.length}`);
      if (tier.blunderChance > 0 && rnd() < tier.blunderChance) {
        return legal[Math.floor(rnd() * legal.length)];
      }
      return searchBestCell(state.board, seat);
    },
  };
}
