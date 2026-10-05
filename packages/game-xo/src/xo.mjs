/**
 * Server-authoritative XO (Tic-Tac-Toe) rules.
 *
 * ============================================================================
 * RULESET: Nizalo XO Ruleset v1 -- Standard 3x3 Tic-Tac-Toe
 * ============================================================================
 *   - Board: 3x3, 9 cells, numbered 0-8 left-to-right, top-to-bottom.
 *   - Seat 0 plays X, seat 1 plays O. Seat 0 (X) always moves first --
 *     this codebase's own convention, the same way White always moves
 *     first in chess and seat 0 always moves first in checkers/Connect
 *     Four -- not a real-world rule this game actually has one of.
 *   - A move places the mover's own mark on any EMPTY cell. There is no
 *     other kind of move -- no captures, no multi-step sequences.
 *   - The first player to occupy a complete row, column, or either
 *     diagonal (one of the 8 standard lines) wins immediately.
 *   - If all 9 cells fill with no line completed, the game is drawn.
 *     There is no other draw condition -- a 9-cell board can never repeat
 *     a position or run out a move-count the way a longer game can.
 *
 * Pure functions over an explicit state object -- no module-level mutable
 * state, no clock, no I/O, the same discipline as every other plugin's own
 * rules module in this codebase (chess.mjs, checkers.mjs, connect-four.mjs).
 */

export const EMPTY = 0;
export const SEAT_0 = 0, SEAT_1 = 1; // X, O
const MARK = { [SEAT_0]: 1, [SEAT_1]: -1 };

export const CELLS = 9;

export const LINES = Object.freeze([
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6],           // diagonals
]);

export function initialBoard() {
  return new Int8Array(CELLS);
}

export function markFor(seat) {
  return MARK[seat];
}

export function legalCells(board) {
  const cells = [];
  for (let i = 0; i < CELLS; i++) if (board[i] === EMPTY) cells.push(i);
  return cells;
}

export function isBoardFull(board) {
  return legalCells(board).length === 0;
}

/** The completed line through `cell` for whichever mark just played there,
 * or null. Checked only from the just-played cell -- the one place a NEW
 * line can appear. */
export function winningLine(board, cell) {
  const mark = board[cell];
  if (mark === EMPTY) return null;
  for (const line of LINES) {
    if (line.includes(cell) && line.every((i) => board[i] === mark)) return line;
  }
  return null;
}

export function place(board, cell, seat) {
  if (board[cell] !== EMPTY) return null;
  const next = Int8Array.from(board);
  next[cell] = MARK[seat];
  return next;
}
