/**
 * The Chess AI adapter -- see the Universal Game Platform spec's own
 * `getAiAdapter()` contract. This file is deliberately self-contained: it
 * imports move generation from chess.mjs (the SAME generator every human
 * move is validated against) and nothing from the duel engine, the
 * gateway, or any persistence layer. It has no way to touch the clock,
 * the database, or a result -- it only ever RETURNS a UCI string, exactly
 * what a human's client would have sent as an intent. The worker that
 * calls this adapter submits that string through the ordinary INTENT
 * path, where it is revalidated like any other move (see this file's own
 * header note in plugin.mjs: "AI must not become the authority for
 * results").
 *
 * Search: negamax with alpha-beta pruning and iterative deepening, over a
 * CLONE of the position (never the live game state -- see chooseAction's
 * own comment on why). Iterative deepening is what makes the `deadlineMs`
 * contract honest: the adapter always has a legal answer ready (the best
 * move found by the last FULLY COMPLETED depth), even if search is cut off
 * mid-iteration on a slow machine or under load.
 *
 * Determinism note: a wall-clock deadline is inherently not perfectly
 * reproducible across machines of different speed -- the same seed on a
 * slower machine may stop one ply shallower. This does not weaken replay
 * integrity: only the CHOSEN MOVE is ever persisted to the event log and
 * replayed (exactly like a human's move), never the search process that
 * produced it, so a replay never needs to re-run this file at all.
 */
import {
  generateMoves, makeMove, unmakeMove, moveToUci, moveTo,
  isInCheck, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
} from "./chess.mjs";

export const Difficulty = Object.freeze({
  EASY: "EASY",
  MEDIUM: "MEDIUM",
  HARD: "HARD",
  EXPERT: "EXPERT",
  INVINCIBLE: "INVINCIBLE",
});

// Depth is a search-effort BUDGET for iterative deepening, not a promise --
// see DEADLINE handling below. blunderChance is the seeded probability of
// discarding the search result for a uniformly random legal move instead
// (directive: "Easy... must not be random -- random play reads as broken,
// not easy. Must be seeded blunder injection at a tier-specific rate").
const TIER = Object.freeze({
  [Difficulty.EASY]:   { maxDepth: 1, blunderChance: 0.35 },
  [Difficulty.MEDIUM]: { maxDepth: 2, blunderChance: 0.15 },
  [Difficulty.HARD]:   { maxDepth: 3, blunderChance: 0 },
  [Difficulty.EXPERT]: { maxDepth: 4, blunderChance: 0 },
  [Difficulty.INVINCIBLE]: { maxDepth: 5, blunderChance: 0 },
});

const MATERIAL = { [PAWN]: 100, [KNIGHT]: 320, [BISHOP]: 330, [ROOK]: 500, [QUEEN]: 900, [KING]: 0 };

// Standard piece-square tables (White's perspective, a1=index 0 rank-major
// 8x8; mirrored vertically for Black at lookup time). These are well-known,
// public-domain heuristic values -- not a fabricated performance claim, just
// a small nudge toward centralisation and king safety so Easy/Medium do not
// play material-blind, actively strange chess.
/* eslint-disable no-multi-spaces */
const PST = {
  [PAWN]: [
      0,  0,  0,  0,  0,  0,  0,  0,
     50, 50, 50, 50, 50, 50, 50, 50,
     10, 10, 20, 30, 30, 20, 10, 10,
      5,  5, 10, 25, 25, 10,  5,  5,
      0,  0,  0, 20, 20,  0,  0,  0,
      5, -5,-10,  0,  0,-10, -5,  5,
      5, 10, 10,-20,-20, 10, 10,  5,
      0,  0,  0,  0,  0,  0,  0,  0,
  ],
  [KNIGHT]: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  [BISHOP]: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  [ROOK]: [
      0,  0,  0,  0,  0,  0,  0,  0,
      5, 10, 10, 10, 10, 10, 10,  5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
      0,  0,  0,  5,  5,  0,  0,  0,
  ],
  [QUEEN]: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  [KING]: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ],
};
/* eslint-enable no-multi-spaces */

/** 0x88 square -> flat 0-63 rank-major index, White's own orientation. */
function pstIndex(sq, colour) {
  const rank = sq >> 4, file = sq & 7;
  return colour === 1 ? (7 - rank) * 8 + file : rank * 8 + file;
}

/** Deterministic PRNG (mulberry32) over a hashed seed -- the SAME
 * construction packages/game-speed-math/src/plugin.mjs already uses, for
 * the same reason: a duel replay must reproduce identical AI behaviour
 * given the same seed, and Math.random cannot. */
function rngFrom(seed) {
  let h = 2166136261 >>> 0;
  for (const ch of String(seed)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return function next() {
    h |= 0; h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneState(state) {
  const p = state.position;
  return {
    position: {
      board: Int8Array.from(p.board),
      turn: p.turn, castling: p.castling, ep: p.ep,
      halfmove: p.halfmove, fullmove: p.fullmove, stack: [],
    },
    initialFen: state.initialFen, history: [...state.history], moves: [...state.moves],
  };
}

/** Material + piece-square evaluation, from White's perspective, centipawns. */
function evaluate(pos) {
  let score = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const piece = pos.board[sq];
    if (piece === 0) continue;
    const type = Math.abs(piece);
    const colour = piece > 0 ? 1 : -1;
    score += colour * (MATERIAL[type] + PST[type][pstIndex(sq, colour)]);
  }
  return score;
}

/** Cheap move ordering: try captures first (MVV -- most valuable victim),
 * so alpha-beta prunes far more of the tree without needing a real
 * transposition table. Not a strength claim, just a search-speed one. */
function orderMoves(pos, moves) {
  return [...moves].sort((a, b) => {
    const va = pos.board[moveTo(a)] !== 0 ? Math.abs(pos.board[moveTo(a)]) : 0;
    const vb = pos.board[moveTo(b)] !== 0 ? Math.abs(pos.board[moveTo(b)]) : 0;
    return vb - va;
  });
}

/** Negamax with alpha-beta. Returns a centipawn score from the side-to-move's
 * own perspective. `pos` is mutated via make/unmake and always restored. */
function negamax(pos, depth, alpha, beta, deadlineAt) {
  if (Date.now() > deadlineAt) return { score: 0, timedOut: true };

  const moves = generateMoves(pos);
  if (moves.length === 0) {
    // Checkmate or stalemate at a leaf: a very large score, not "infinite",
    // so it still compares sanely against a deep mate found elsewhere.
    return { score: isInCheck(pos) ? -100000 + (4 - depth) : 0, timedOut: false };
  }
  if (depth === 0) return { score: pos.turn * evaluate(pos), timedOut: false };

  let best = -Infinity;
  for (const m of orderMoves(pos, moves)) {
    makeMove(pos, m);
    const child = negamax(pos, depth - 1, -beta, -alpha, deadlineAt);
    unmakeMove(pos);
    if (child.timedOut) return { score: 0, timedOut: true };
    const score = -child.score;
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break; // beta cutoff
  }
  return { score: best, timedOut: false };
}

/**
 * Search from the root, returning the best move found. Iterative
 * deepening: search depth 1, then 2, then 3... up to `maxDepth`, stopping
 * the moment a deeper iteration cannot complete before `deadlineAt`. The
 * result is always the best move from the LAST FULLY COMPLETED depth --
 * never a partial, potentially-worse result from a cut-off iteration.
 */
function searchBestMove(pos, maxDepth, deadlineAt) {
  const rootMoves = generateMoves(pos);
  if (rootMoves.length === 0) return null;
  if (rootMoves.length === 1) return rootMoves[0];

  let best = rootMoves[0];
  for (let depth = 1; depth <= maxDepth; depth++) {
    if (Date.now() > deadlineAt) break;
    let bestAtDepth = null;
    let bestScore = -Infinity;
    let cutOff = false;
    for (const m of orderMoves(pos, rootMoves)) {
      makeMove(pos, m);
      const child = negamax(pos, depth - 1, -Infinity, Infinity, deadlineAt);
      unmakeMove(pos);
      if (child.timedOut) { cutOff = true; break; }
      const score = -child.score;
      if (score > bestScore) { bestScore = score; bestAtDepth = m; }
    }
    if (cutOff || bestAtDepth === null) break;
    best = bestAtDepth;
  }
  return best;
}

/**
 * The adapter contract: pure with respect to its inputs (a fixed seed and
 * a fixed deadline given the same machine speed always produce the same
 * choice at a given depth), bounded by `deadlineMs`, and never anything
 * but a legal move -- the platform revalidates the returned intent
 * through the ordinary path regardless, so this is a courtesy to the
 * caller, not a trust boundary.
 */
export function createChessAiAdapter() {
  return {
    chooseAction(state, seat, difficulty, deadlineMs = 2000, seed = "ai") {
      const tier = TIER[difficulty] ?? TIER[Difficulty.EXPERT];
      const cloned = cloneState(state);
      const pos = cloned.position;
      const deadlineAt = Date.now() + Math.max(50, deadlineMs);

      const rnd = rngFrom(`${seed}:${state.moves.length}`);
      if (tier.blunderChance > 0 && rnd() < tier.blunderChance) {
        const legal = generateMoves(pos);
        const pick = legal[Math.floor(rnd() * legal.length)];
        return moveToUci(pick);
      }

      const best = searchBestMove(pos, tier.maxDepth, deadlineAt);
      return best === null ? null : moveToUci(best);
    },
  };
}
