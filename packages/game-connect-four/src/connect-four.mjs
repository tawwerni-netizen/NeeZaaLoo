/**
 * Server-authoritative Connect Four rules.
 *
 * ============================================================================
 * RULESET: Nizalo Connect Four Ruleset v1 -- Standard Connect Four
 * ============================================================================
 *   - Board: 7 columns x 6 rows (the size Connect Four has always meant
 *     since Milton Bradley's 1974 release, and the size every competitive
 *     and solved-game analysis of it assumes).
 *   - Players alternate dropping one token into a column of their choice;
 *     it falls to the lowest empty cell in that column (row 0 = the
 *     bottom row, where a token lands first; row 5 = the top).
 *   - A column that is already full (all 6 rows occupied) is not a legal
 *     placement.
 *   - First player to connect four of their own tokens in an unbroken
 *     horizontal, vertical, or either diagonal line wins immediately.
 *   - If the board fills completely (42 placements) with no line of four,
 *     the game is drawn.
 *
 * Pure functions over an explicit state object -- no module-level mutable
 * state, no clock, no I/O, the same discipline as
 * packages/game-checkers/src/checkers.mjs and packages/game-chess/src/chess.mjs.
 */

export const COLS = 7, ROWS = 6;
export const SEAT_0 = 0, SEAT_1 = 1;
export const EMPTY = 0;

const idx = (row, col) => row * COLS + col;
const tokenFor = (seat) => (seat === SEAT_0 ? 1 : -1);

export function initialBoard() {
  return new Int8Array(COLS * ROWS);
}

/** The row a token would land on in `col`, or -1 if the column is full. */
export function lowestEmptyRow(board, col) {
  for (let row = 0; row < ROWS; row++) {
    if (board[idx(row, col)] === EMPTY) return row;
  }
  return -1;
}

export function legalColumns(board) {
  const cols = [];
  for (let c = 0; c < COLS; c++) if (lowestEmptyRow(board, c) !== -1) cols.push(c);
  return cols;
}

export function isBoardFull(board) {
  return legalColumns(board).length === 0;
}

const DIRECTIONS = [
  [0, 1],   // horizontal
  [1, 0],   // vertical
  [1, 1],   // diagonal /
  [1, -1],  // diagonal \
];

/** True iff the token just placed at (row, col) completes a line of four
 * through that cell, in any of the four line orientations. Checked only
 * from the placed cell -- the one place a NEW line of four can appear. */
export function isWinningPlacement(board, row, col) {
  const token = board[idx(row, col)];
  if (token === EMPTY) return false;
  for (const [dr, dc] of DIRECTIONS) {
    let count = 1;
    for (let step = 1; step < 4; step++) {
      const r = row + dr * step, c = col + dc * step;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[idx(r, c)] !== token) break;
      count++;
    }
    for (let step = 1; step < 4; step++) {
      const r = row - dr * step, c = col - dc * step;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[idx(r, c)] !== token) break;
      count++;
    }
    if (count >= 4) return true;
  }
  return false;
}

/** Drop `seat`'s token into `col`. Returns null if the column is full. */
export function drop(board, col, seat) {
  const row = lowestEmptyRow(board, col);
  if (row === -1) return null;
  const next = Int8Array.from(board);
  next[idx(row, col)] = tokenFor(seat);
  return { board: next, row, col };
}

export { idx as squareIndex, tokenFor };
