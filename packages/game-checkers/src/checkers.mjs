/**
 * Server-authoritative checkers rules.
 *
 * ============================================================================
 * RULESET: Nizalo Checkers Ruleset v1 -- American Checkers (English Draughts)
 * ============================================================================
 * This is the ONE launch ruleset. It does not mix in International/Russian/
 * Brazilian draughts conventions (10x10 board, "flying" kings that move and
 * capture like a chess bishop across multiple empty squares, mandatory
 * MAXIMUM capture). Every rule below is drawn from a single, internally
 * consistent variant -- American Checkers as codified by the American
 * Checker Federation (ACF) "Standard Rules of Checkers" -- so a player who
 * has learned one rule here never encounters a contradictory one elsewhere
 * in this implementation:
 *
 *   - Board: 8x8, 32 dark (playable) squares, 12 men per side.
 *   - Men move diagonally forward one square onto an empty square, or
 *     capture by jumping diagonally FORWARD over an adjacent enemy piece
 *     onto the empty square immediately beyond. Men never move or capture
 *     backward.
 *   - Kings (crowned on reaching the far rank) move and capture diagonally
 *     in any of the four directions, but -- unlike International draughts --
 *     only ONE square at a time. There is no "flying king" long-range move.
 *   - Capture is MANDATORY: if any capture is available anywhere on the
 *     board for the side to move, only capture moves are legal.
 *   - Multi-jump is MANDATORY: after a capture, if the SAME piece can
 *     immediately capture again from its new square, it must. Turn does not
 *     pass until the capturing piece has no further capture available.
 *   - American rules do NOT require choosing the sequence that captures the
 *     most pieces (unlike International draughts' "majority rule") -- any
 *     legal capture sequence may be chosen.
 *   - A player with no legal move on their turn LOSES (not a draw, and
 *     unlike chess's stalemate).
 *   - Draw conditions (the two implemented here, both server-verifiable
 *     from the position/move history alone, deliberately not attempting a
 *     full endgame-tablebase "insufficient material" heuristic -- there is
 *     no small closed-form for checkers the way there is for chess):
 *       1. Threefold repetition of the same position with the same side to
 *          move (identical in spirit to chess's rule).
 *       2. The 40-move rule: if 40 full moves (80 plies) pass by both
 *          sides combined with no capture, the game is drawn.
 *
 * Pure functions over an explicit state object -- no module-level mutable
 * state, no clock, no I/O, exactly like packages/game-chess/src/chess.mjs.
 */

export const EMPTY = 0;
export const MAN = 1, KING = 2; // sign carries seat: seat 0 positive, seat 1 negative
export const SEAT_0 = 0, SEAT_1 = 1;

export const BOARD_SIZE = 8;
export const NO_CAPTURE_DRAW_PLIES = 80; // 40 full moves each = 80 plies, per the ruleset doc above
export const REPETITION_DRAW_COUNT = 3;

const inBounds = (row, col) => row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
const isDark = (row, col) => (row + col) % 2 === 1;
const idx = (row, col) => row * BOARD_SIZE + col;
const seatOf = (piece) => (piece > 0 ? SEAT_0 : SEAT_1);
const isKing = (piece) => Math.abs(piece) === KING;

// --- Square <-> algebraic label ("a1".."h8") --------------------------------
// file a-h = col 0-7, rank 1-8 = row 7-0 (rank 8 is row 0, the top of the
// board / seat 1's starting side; rank 1 is row 7, seat 0's starting side).
// Chosen to read the same way packages/game-chess/src/chess.mjs's own
// algebraic squares do, for a consistent replay/notation feel across games.
const FILES = "abcdefgh";

export function squareToLabel(row, col) {
  return `${FILES[col]}${BOARD_SIZE - row}`;
}

export function labelToSquare(label) {
  if (typeof label !== "string" || label.length !== 2) return null;
  const col = FILES.indexOf(label[0]);
  const rank = Number(label[1]);
  if (col < 0 || !Number.isInteger(rank) || rank < 1 || rank > BOARD_SIZE) return null;
  return { row: BOARD_SIZE - rank, col };
}

/** Starting position: seat 0 on rows 5-7 (moving up/north, decreasing row),
 * seat 1 on rows 0-2 (moving down/south, increasing row). Seat 0 moves
 * first -- this codebase's own convention (see this file's header),
 * analogous to White moving first in chess. */
export function initialBoard() {
  const board = new Int8Array(BOARD_SIZE * BOARD_SIZE);
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (!isDark(row, col)) continue;
      if (row <= 2) board[idx(row, col)] = -MAN;
      else if (row >= 5) board[idx(row, col)] = MAN;
    }
  }
  return board;
}

const FORWARD_DIR = { [SEAT_0]: -1, [SEAT_1]: 1 }; // seat 0 moves toward row 0, seat 1 toward row 7
const DIAGONALS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

function directionsFor(piece) {
  if (isKing(piece)) return DIAGONALS;
  const seat = seatOf(piece);
  return DIAGONALS.filter(([dr]) => dr === FORWARD_DIR[seat]);
}

/** One capture hop: { from, over, to } as {row,col} triples. */
function captureHopsFrom(board, row, col) {
  const piece = board[idx(row, col)];
  const seat = seatOf(piece);
  const hops = [];
  for (const [dr, dc] of directionsFor(piece)) {
    const overRow = row + dr, overCol = col + dc;
    const toRow = row + dr * 2, toCol = col + dc * 2;
    if (!inBounds(toRow, toCol)) continue;
    const overPiece = board[idx(overRow, overCol)];
    if (overPiece === EMPTY || seatOf(overPiece) === seat) continue;
    if (board[idx(toRow, toCol)] !== EMPTY) continue;
    hops.push({ from: { row, col }, over: { row: overRow, col: overCol }, to: { row: toRow, col: toCol } });
  }
  return hops;
}

function simpleMovesFrom(board, row, col) {
  const piece = board[idx(row, col)];
  const moves = [];
  for (const [dr, dc] of directionsFor(piece)) {
    const toRow = row + dr, toCol = col + dc;
    if (!inBounds(toRow, toCol)) continue;
    if (board[idx(toRow, toCol)] === EMPTY) moves.push({ from: { row, col }, to: { row: toRow, col: toCol } });
  }
  return moves;
}

/**
 * Every legal move for `seat` in this position, honouring mandatory capture:
 * if ANY capture exists anywhere on the board for this seat, only captures
 * are returned. If `forcedFrom` is set (a multi-jump in progress), only
 * further captures from that exact square are returned.
 */
export function legalMoves(board, seat, forcedFrom = null) {
  if (forcedFrom) {
    const { row, col } = forcedFrom;
    if (seatOf(board[idx(row, col)]) !== seat) return [];
    return captureHopsFrom(board, row, col).map((h) => ({ ...h, capture: true }));
  }

  const captures = [];
  const simples = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = board[idx(row, col)];
      if (piece === EMPTY || seatOf(piece) !== seat) continue;
      for (const h of captureHopsFrom(board, row, col)) captures.push({ ...h, capture: true });
      for (const m of simpleMovesFrom(board, row, col)) simples.push({ ...m, capture: false });
    }
  }
  return captures.length > 0 ? captures : simples;
}

function promotesAt(seat, row) {
  return seat === SEAT_0 ? row === 0 : row === BOARD_SIZE - 1;
}

/**
 * Apply one already-validated move (as returned by legalMoves) to a CLONE
 * of the board. Returns { board, capturedCount, promoted, continuesFrom }.
 * `continuesFrom` is set (mandatory multi-jump) iff this was a capture and
 * the SAME piece, from its landing square, has a further capture available.
 */
export function applyMoveToBoard(board, move) {
  const next = Int8Array.from(board);
  const piece = next[idx(move.from.row, move.from.col)];
  next[idx(move.from.row, move.from.col)] = EMPTY;
  if (move.capture) next[idx(move.over.row, move.over.col)] = EMPTY;

  let finalPiece = piece;
  let promoted = false;
  if (!isKing(piece) && promotesAt(seatOf(piece), move.to.row)) {
    finalPiece = seatOf(piece) === SEAT_0 ? KING : -KING;
    promoted = true;
  }
  next[idx(move.to.row, move.to.col)] = finalPiece;

  let continuesFrom = null;
  if (move.capture && !promoted && captureHopsFrom(next, move.to.row, move.to.col).length > 0) {
    continuesFrom = { row: move.to.row, col: move.to.col };
  }
  // A piece that promotes mid-jump stops immediately, per standard American
  // rules -- it does not continue capturing as a newly-crowned king in the
  // same turn.

  return { board: next, promoted, continuesFrom };
}

/** True iff `seat` has zero legal moves -- an immediate loss under this
 * ruleset (see this file's own header: no legal move is a LOSS, not a
 * draw, unlike chess's stalemate). */
export function hasNoMoves(board, seat) {
  return legalMoves(board, seat).length === 0;
}

export function pieceCount(board, seat) {
  let count = 0;
  for (let i = 0; i < board.length; i++) if (board[i] !== EMPTY && seatOf(board[i]) === seat) count++;
  return count;
}

/** A stable position key for repetition detection -- board contents plus
 * whose turn it is (a position is only "the same" if it recurs with the
 * same side to move). */
export function positionKey(board, turn) {
  return `${turn}:${Array.from(board).join(",")}`;
}
