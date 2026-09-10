/**
 * Server-authoritative Reversi/Othello rules.
 *
 * ============================================================================
 * RULESET: Nizalo Reversi Ruleset v1 -- Standard Othello rules
 * ============================================================================
 * This is the ONE launch ruleset -- the single, universally-used
 * competition standard, not a house variant. There is essentially only
 * one "Reversi/Othello" ruleset played competitively, and this is it:
 *
 *   - Board: 8x8, 64 squares. Standard starting position: seat 1 (White)
 *     on d4 and e5, seat 0 (Black) on d5 and e4 -- using this file's own
 *     0-indexed [row][col], that is (3,3)=seat1, (4,4)=seat1, (3,4)=seat0,
 *     (4,3)=seat0. Seat 0 (Black) always moves first, this codebase's own
 *     convention and also the real game's own rule.
 *   - Legal move: placing a piece of your own colour on an EMPTY square
 *     such that at least one of the 8 directions (orthogonal or diagonal)
 *     from it runs through one or more contiguous OPPONENT pieces and
 *     then reaches one of your own pieces, with no gap and no empty
 *     square in between. Placing anywhere that outflanks nothing is
 *     illegal, even if the square is otherwise empty.
 *   - Piece flipping: every opposing piece outflanked in EVERY qualifying
 *     direction is flipped to the mover's own colour, all at once, as
 *     part of the same move. There is no "choose a maximum" rule and no
 *     mandatory-largest-capture rule -- any legal outflanking move is
 *     playable regardless of how many discs it flips relative to another
 *     legal option.
 *   - Passing: if the player to move has NO legal move anywhere on the
 *     board, their turn is skipped (a pass) with no piece placed. If
 *     NEITHER player has a legal move, the game ends immediately.
 *   - Win: the game ends when the board is completely full, OR when
 *     neither player has a legal move. Whoever then has MORE discs on
 *     the board wins. Equal counts is a draw. There is no "run out of
 *     discs" early-termination rule in this ruleset -- either side may
 *     legally have more than 32 discs in play at the end.
 *   - Special cases: a pass is never voluntary -- it is only ever
 *     accepted when the position genuinely offers no legal move, exactly
 *     like this codebase's own Dominoes ruleset. Reversi at launch has no
 *     concept of "mandatory maximum capture" (some historical Othello
 *     rule proposals require flipping the most discs possible) -- this
 *     ruleset explicitly does not adopt that variant.
 *
 * Pure functions over an explicit state object -- no module-level mutable
 * state, no clock, no I/O, the same discipline as every other ruleset
 * module in this codebase.
 */

export const SEAT_0 = 0, SEAT_1 = 1; // Black, White
export const BOARD_SIZE = 8;
export const CELLS = BOARD_SIZE * BOARD_SIZE;

export function other(seat) {
  return seat === SEAT_0 ? SEAT_1 : SEAT_0;
}

function rowOf(idx) { return Math.floor(idx / BOARD_SIZE); }
function colOf(idx) { return idx % BOARD_SIZE; }
function idxOf(row, col) { return row * BOARD_SIZE + col; }

function pieceFor(seat) {
  return seat === SEAT_0 ? 1 : -1;
}

export function seatOf(value) {
  if (value > 0) return SEAT_0;
  if (value < 0) return SEAT_1;
  return null;
}

/** Standard starting position -- see this file's own header. */
export function initialBoard() {
  const board = new Int8Array(CELLS);
  board[idxOf(3, 3)] = pieceFor(SEAT_1);
  board[idxOf(4, 4)] = pieceFor(SEAT_1);
  board[idxOf(3, 4)] = pieceFor(SEAT_0);
  board[idxOf(4, 3)] = pieceFor(SEAT_0);
  return board;
}

const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

/** Every opponent square that placing `seat`'s piece at `idx` would
 * outflank, direction by direction. Empty when `idx` is not itself empty,
 * or outflanks nothing (an illegal placement). */
export function outflankedBy(board, idx, seat) {
  if (board[idx] !== 0) return [];
  const opponent = other(seat);
  const outflanked = [];
  const row0 = rowOf(idx), col0 = colOf(idx);

  for (const [dr, dc] of DIRECTIONS) {
    const line = [];
    let r = row0 + dr, c = col0 + dc;
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && seatOf(board[idxOf(r, c)]) === opponent) {
      line.push(idxOf(r, c));
      r += dr; c += dc;
    }
    if (line.length === 0) continue;
    const closesWithOwn = r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && seatOf(board[idxOf(r, c)]) === seat;
    if (closesWithOwn) outflanked.push(...line);
  }
  return outflanked;
}

export function isLegalMove(board, idx, seat) {
  return outflankedBy(board, idx, seat).length > 0;
}

export function legalMoves(board, seat) {
  const moves = [];
  for (let idx = 0; idx < CELLS; idx++) {
    const flips = outflankedBy(board, idx, seat);
    if (flips.length > 0) moves.push(idx);
  }
  return moves;
}

export function hasLegalMove(board, seat) {
  for (let idx = 0; idx < CELLS; idx++) {
    if (outflankedBy(board, idx, seat).length > 0) return true;
  }
  return false;
}

/** Apply an already-validated placement to a CLONE of `board`. Returns
 * `{ board, flipped }` -- `flipped` lists every square whose piece was
 * just turned to the mover's colour. */
export function applyPlacement(board, idx, seat) {
  const flipped = outflankedBy(board, idx, seat);
  const next = Int8Array.from(board);
  next[idx] = pieceFor(seat);
  for (const f of flipped) next[f] = pieceFor(seat);
  return { board: next, flipped };
}

export function pieceCount(board, seat) {
  let count = 0;
  for (let i = 0; i < CELLS; i++) if (seatOf(board[i]) === seat) count++;
  return count;
}

export function isFull(board) {
  for (let i = 0; i < CELLS; i++) if (board[i] === 0) return false;
  return true;
}
