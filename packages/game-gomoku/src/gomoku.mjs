/**
 * Server-authoritative Gomoku rules.
 *
 * ============================================================================
 * RULESET: Nizalo Gomoku Ruleset v1 -- Freestyle Gomoku, 15x15 board
 * ============================================================================
 * This is the ONE launch ruleset. It does not mix in Renju's forbidden-move
 * restrictions for the first player (three-three, four-four, and overline
 * are all illegal for Black under Renju -- none of that applies here),
 * does not use Caro's "must be open on both ends" win condition, and does
 * not adopt any Swap2/pro opening-balance procedure. Every rule below is
 * drawn from a single, internally consistent base -- the "Freestyle"
 * ruleset, the most common casual and online ruleset, and the one with
 * no restriction on either player's placement:
 *
 *   - Board: 15x15, 225 cells.
 *   - Players alternate placing exactly one stone per turn on any EMPTY
 *     cell -- there is no forbidden move for either side, unlike Renju.
 *     Seat 0 places first, this codebase's own convention.
 *   - Win: the instant a placed stone completes a line of FIVE OR MORE
 *     of the mover's own stones, unbroken, in a single direction
 *     (horizontal, vertical, or either diagonal), that player wins
 *     immediately. An "overline" (six or more in a row) IS a win under
 *     Freestyle rules -- this is the one rule that most clearly
 *     distinguishes Freestyle from the stricter "exactly five" ruleset,
 *     and this launch explicitly adopts the Freestyle reading.
 *   - Draw: the board fills completely (all 225 cells occupied) with no
 *     line of five ever formed. The only draw condition in this ruleset.
 *   - Special cases: none. No swap rule, no restricted opening, no
 *     forbidden patterns for either seat -- the whole point of choosing
 *     Freestyle as the one launch ruleset is that there is nothing else
 *     to special-case.
 *
 * Pure functions over an explicit state object -- no module-level mutable
 * state, no clock, no I/O, the same discipline as every other ruleset
 * module in this codebase (chess.mjs, checkers.mjs, xo.mjs).
 */

export const SEAT_0 = 0, SEAT_1 = 1;
export const BOARD_SIZE = 15;
export const CELLS = BOARD_SIZE * BOARD_SIZE;
export const LINE_LENGTH = 5;

const MARK = { [SEAT_0]: 1, [SEAT_1]: -1 };

export function other(seat) {
  return seat === SEAT_0 ? SEAT_1 : SEAT_0;
}

export function pieceFor(seat) {
  return MARK[seat];
}

export function seatOf(value) {
  if (value > 0) return SEAT_0;
  if (value < 0) return SEAT_1;
  return null;
}

export function initialBoard() {
  return new Int8Array(CELLS);
}

function rowOf(idx) { return Math.floor(idx / BOARD_SIZE); }
function colOf(idx) { return idx % BOARD_SIZE; }
function inBounds(row, col) { return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE; }

export function legalCells(board) {
  const cells = [];
  for (let i = 0; i < CELLS; i++) if (board[i] === 0) cells.push(i);
  return cells;
}

export function isBoardFull(board) {
  for (let i = 0; i < CELLS; i++) if (board[i] === 0) return false;
  return true;
}

/** The 4 distinct line axes a run can form along: horizontal, vertical,
 * and both diagonals. Each axis is checked in both of its two opposite
 * directions from the just-placed stone. */
const AXES = [[0, 1], [1, 0], [1, 1], [1, -1]];

/**
 * The complete run of 5+ same-mark stones through `idx` along whichever
 * axis (if any) it completes, in board order (lowest index first) -- the
 * full chain, including any overline beyond the minimum 5, so a caller
 * can highlight every stone actually in the line. Returns `null` if
 * `idx` is empty or completes no such run. Checked ONLY from the
 * just-placed square -- the one place a new run can appear, exactly like
 * XO's own winningLine().
 */
export function winningLineThrough(board, idx) {
  const mark = board[idx];
  if (mark === 0) return null;
  const row0 = rowOf(idx), col0 = colOf(idx);

  for (const [dr, dc] of AXES) {
    const cells = [idx];
    let r = row0 + dr, c = col0 + dc;
    while (inBounds(r, c) && board[r * BOARD_SIZE + c] === mark) {
      cells.push(r * BOARD_SIZE + c);
      r += dr; c += dc;
    }
    r = row0 - dr; c = col0 - dc;
    while (inBounds(r, c) && board[r * BOARD_SIZE + c] === mark) {
      cells.unshift(r * BOARD_SIZE + c);
      r -= dr; c -= dc;
    }
    if (cells.length >= LINE_LENGTH) return cells;
  }
  return null;
}
