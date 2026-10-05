/**
 * The Checkers AI adapter -- same shape and same contract as
 * packages/game-chess/src/ai.mjs's own createChessAiAdapter(): pure,
 * bounded by a deadline, and never anything but a legal move (the
 * platform revalidates it through the ordinary INTENT path regardless).
 *
 * Search: negamax with alpha-beta over CLONED boards (checkers positions
 * are 64 bytes; cloning is cheap enough that a make/unmake move stack, as
 * chess uses for speed, would only add risk of a subtle bug for no
 * measurable benefit at these search depths). Mandatory multi-jump is
 * handled correctly inside the search itself: a hop that leaves
 * `continuesFrom` set does NOT flip the side to move or negate the score
 * for that ply, exactly like the plugin's own applyIntent.
 */
import { legalMoves, applyMoveToBoard, hasNoMoves, SEAT_0, SEAT_1, squareToLabel } from "./checkers.mjs";

export const Difficulty = Object.freeze({
  EASY: "EASY", MEDIUM: "MEDIUM", HARD: "HARD", EXPERT: "EXPERT", INVINCIBLE: "INVINCIBLE",
});

const TIER = Object.freeze({
  [Difficulty.EASY]:   { maxDepth: 2, blunderChance: 0.35 },
  [Difficulty.MEDIUM]: { maxDepth: 4, blunderChance: 0.15 },
  [Difficulty.HARD]:   { maxDepth: 6, blunderChance: 0 },
  [Difficulty.EXPERT]: { maxDepth: 8, blunderChance: 0 },
  [Difficulty.INVINCIBLE]: { maxDepth: 10, blunderChance: 0 },
});

const MAN_VALUE = 100, KING_VALUE = 175;

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

/** Material + a small centralisation bonus (edge columns are structurally
 * weaker in checkers -- fewer capture angles), from seat 0's perspective. */
function evaluate(board) {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r * 8 + c];
      if (piece === 0) continue;
      const seat = piece > 0 ? SEAT_0 : SEAT_1;
      const value = Math.abs(piece) === 2 ? KING_VALUE : MAN_VALUE;
      const centreBonus = c >= 2 && c <= 5 ? 4 : 0;
      const advanceBonus = seat === SEAT_0 ? (7 - r) : r; // reward pushing toward promotion
      const total = value + centreBonus + advanceBonus;
      score += seat === SEAT_0 ? total : -total;
    }
  }
  return score;
}

/**
 * Negamax from `turn`'s perspective. `forcedFrom` carries a mandatory
 * multi-jump across the recursion without changing whose turn it is or
 * negating the score, exactly matching the plugin's own applyIntent.
 */
function negamax(board, turn, forcedFrom, depth, alpha, beta, deadlineAt) {
  if (Date.now() > deadlineAt) return { score: 0, timedOut: true };

  const moves = legalMoves(board, turn, forcedFrom);
  if (moves.length === 0) {
    // No legal move is an immediate loss for `turn` under this ruleset.
    return { score: -100000 + (8 - depth), timedOut: false };
  }
  if (depth === 0) return { score: turn === SEAT_0 ? evaluate(board) : -evaluate(board), timedOut: false };

  let best = -Infinity;
  for (const move of moves) {
    const { board: nextBoard, continuesFrom } = applyMoveToBoard(board, move);
    let child;
    if (continuesFrom) {
      // Same side continues; not a real ply for the opponent, so the
      // score is NOT negated and depth is still spent (bounds runaway
      // multi-jump chains in the search the same way real play bounds
      // them: a finite number of pieces on the board).
      child = negamax(nextBoard, turn, continuesFrom, depth - 1, alpha, beta, deadlineAt);
    } else {
      const opponent = turn === SEAT_0 ? SEAT_1 : SEAT_0;
      const sub = negamax(nextBoard, opponent, null, depth - 1, -beta, -alpha, deadlineAt);
      child = { score: -sub.score, timedOut: sub.timedOut };
    }
    if (child.timedOut) return { score: 0, timedOut: true };
    if (child.score > best) best = child.score;
    if (child.score > alpha) alpha = child.score;
    if (alpha >= beta) break;
  }
  return { score: best, timedOut: false };
}

function searchBestMove(board, turn, forcedFrom, maxDepth, deadlineAt) {
  const rootMoves = legalMoves(board, turn, forcedFrom);
  if (rootMoves.length === 0) return null;
  if (rootMoves.length === 1) return rootMoves[0];

  let best = rootMoves[0];
  for (let depth = 1; depth <= maxDepth; depth++) {
    if (Date.now() > deadlineAt) break;
    let bestAtDepth = null;
    let bestScore = -Infinity;
    let cutOff = false;
    for (const move of rootMoves) {
      const { board: nextBoard, continuesFrom } = applyMoveToBoard(board, move);
      let result;
      if (continuesFrom) {
        result = negamax(nextBoard, turn, continuesFrom, depth - 1, -Infinity, Infinity, deadlineAt);
      } else {
        const opponent = turn === SEAT_0 ? SEAT_1 : SEAT_0;
        const sub = negamax(nextBoard, opponent, null, depth - 1, -Infinity, Infinity, deadlineAt);
        result = { score: -sub.score, timedOut: sub.timedOut };
      }
      if (result.timedOut) { cutOff = true; break; }
      if (result.score > bestScore) { bestScore = result.score; bestAtDepth = move; }
    }
    if (cutOff || bestAtDepth === null) break;
    best = bestAtDepth;
  }
  return best;
}

export function createCheckersAiAdapter() {
  return {
    chooseAction(state, seat, difficulty, deadlineMs = 2000, seed = "ai") {
      const tier = TIER[difficulty] ?? TIER[Difficulty.EXPERT];
      const deadlineAt = Date.now() + Math.max(50, deadlineMs);
      const forcedFrom = state.forcedFrom;

      if (hasNoMoves(state.board, seat) && !forcedFrom) return null;

      const rnd = rngFrom(`${seed}:${state.moves.length}`);
      const legal = legalMoves(state.board, seat, forcedFrom);
      if (tier.blunderChance > 0 && rnd() < tier.blunderChance && legal.length > 0) {
        const pick = legal[Math.floor(rnd() * legal.length)];
        return `${squareToLabel(pick.from.row, pick.from.col)}${squareToLabel(pick.to.row, pick.to.col)}`;
      }

      const best = searchBestMove(state.board, seat, forcedFrom, tier.maxDepth, deadlineAt);
      if (best === null) return null;
      return `${squareToLabel(best.from.row, best.from.col)}${squareToLabel(best.to.row, best.to.col)}`;
    },
  };
}
