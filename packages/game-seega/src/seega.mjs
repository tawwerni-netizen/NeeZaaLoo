/**
 * Server-authoritative Seega rules.
 *
 * ============================================================================
 * RULESET: Nizalo Seega Ruleset v1 -- 5x5 Seega (Egyptian Seega), single-piece
 * custodial capture
 * ============================================================================
 * This is the ONE launch ruleset. It does not mix in the 7x7 board some
 * regional variants use, does not use a "long capture" that removes an
 * entire flanked ROW of enemy pieces the way the Alquerque/Tafl family
 * sometimes does, and does not allow the very first placement on the
 * center square the way some house rules do. Every rule below is drawn
 * from a single, internally consistent base:
 *
 *   - Board: 5x5, 25 squares. The CENTER square (row 2, col 2, index 12)
 *     is the one square that starts, and stays, empty through the whole
 *     placement phase -- it is never a legal placement target.
 *   - Placement phase: players alternate placing exactly one of their own
 *     12 pieces per turn onto any empty non-center square. Seat 0 places
 *     first (this codebase's own convention, like every other launch
 *     game). The phase ends the instant both players have placed all 24
 *     pieces (12 each) -- the center is then the only empty square.
 *   - Movement-phase tempo: the player who placed SECOND moves first in
 *     the movement phase (seat 1) -- compensation for seat 0's placement-
 *     order advantage, and the reason the very first movement-phase move
 *     is forced to be into the center (it is the only empty square).
 *   - Movement: on your turn, move exactly one of your own pieces one
 *     step orthogonally (never diagonally) into an adjacent EMPTY square.
 *     There are no jumps and no multi-square slides.
 *   - Capture (single-piece custodial/flanking capture): immediately
 *     after a move lands on square X, check each of the up to 4
 *     orthogonal directions from X independently. If the adjacent square
 *     in that direction holds exactly one opposing piece, AND the square
 *     immediately beyond THAT one (same direction) holds one of the
 *     mover's own pieces, the single opposing piece is captured (removed
 *     from the board). A capture is checked in all 4 directions from the
 *     square just vacated is NOT considered -- only from the square just
 *     occupied, by the piece that just moved.
 *   - Safe entry: moving your own piece so that it lands BETWEEN two
 *     enemy pieces (or an enemy piece moving to flank you) never captures
 *     it -- a capture only ever happens as a direct result of the
 *     CURRENT mover's own move, never as an incidental side effect of the
 *     position it moved into. This is the standard, well-documented
 *     Seega/Alquerque-family safe-entry rule.
 *   - Win: a player wins the instant either (a) the opponent has zero
 *     pieces left on the board, or (b) it becomes the opponent's turn and
 *     they have no legal move at all (every one of their pieces is
 *     completely boxed in) -- the same "no legal move loses" convention
 *     packages/game-checkers/src/checkers.mjs's own ruleset uses, for the
 *     same reason (a real player with no move genuinely cannot continue).
 *   - Draw: the ONE draw condition in this ruleset is 40 full movement-
 *     phase moves (80 plies) passing with no capture by either side --
 *     the same "no-progress" convention, and the same ply count,
 *     checkers.mjs's own NO_CAPTURE_DRAW_PLIES uses, chosen for platform
 *     consistency rather than an independent number. Threefold repetition
 *     of the same position with the same side to move is also a draw.
 *   - Special cases: no captures of any kind occur during the placement
 *     phase (nothing has moved yet, so nothing can be flanked); the
 *     placement phase itself never triggers a win/draw check.
 *
 * Pure functions over an explicit state object -- no module-level mutable
 * state, no clock, no I/O, the same discipline as every other ruleset
 * module in this codebase (chess.mjs, checkers.mjs, xo.mjs).
 */

export const SEAT_0 = 0, SEAT_1 = 1;
export const BOARD_SIZE = 5;
export const CELLS = BOARD_SIZE * BOARD_SIZE;
export const CENTER = 12; // row 2, col 2
export const PIECES_PER_SIDE = 12;
export const NO_CAPTURE_DRAW_PLIES = 80; // 40 full moves each side, matches checkers.mjs's own convention
export const REPETITION_DRAW_COUNT = 3;

export const Phase = Object.freeze({ PLACEMENT: "PLACEMENT", MOVEMENT: "MOVEMENT" });

export function other(seat) {
  return seat === SEAT_0 ? SEAT_1 : SEAT_0;
}

export function initialBoard() {
  return new Int8Array(CELLS);
}

function rowOf(idx) { return Math.floor(idx / BOARD_SIZE); }
function colOf(idx) { return idx % BOARD_SIZE; }

export function isCenter(idx) {
  return idx === CENTER;
}

const DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // up, down, left, right -- orthogonal only

/** The (up to 4) orthogonally adjacent square indices, in-bounds only. */
export function orthogonalNeighbors(idx) {
  const r = rowOf(idx), c = colOf(idx);
  const out = [];
  for (const [dr, dc] of DIRECTIONS) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) out.push(nr * BOARD_SIZE + nc);
  }
  return out;
}

export function seatOf(value) {
  if (value > 0) return SEAT_0;
  if (value < 0) return SEAT_1;
  return null;
}

export function pieceFor(seat) {
  return seat === SEAT_0 ? 1 : -1;
}

/** Every empty, non-center square -- the legal placement targets. */
export function legalPlacements(board) {
  const out = [];
  for (let i = 0; i < CELLS; i++) {
    if (i !== CENTER && board[i] === 0) out.push(i);
  }
  return out;
}

/** Every legal `{ from, to }` for `seat` in the movement phase: one of
 * their own pieces, sliding exactly one orthogonal step into an empty
 * square. */
export function legalMoves(board, seat) {
  const moves = [];
  for (let from = 0; from < CELLS; from++) {
    if (seatOf(board[from]) !== seat) continue;
    for (const to of orthogonalNeighbors(from)) {
      if (board[to] === 0) moves.push({ from, to });
    }
  }
  return moves;
}

export function hasNoMoves(board, seat) {
  return legalMoves(board, seat).length === 0;
}

/**
 * Apply an already-validated movement-phase move to a CLONE of `board`.
 * Returns `{ board, captured }` -- `captured` lists every square whose
 * piece was just removed (0-4 squares, one per flanked direction).
 */
export function applyMove(board, from, to, seat) {
  const next = Int8Array.from(board);
  next[to] = next[from];
  next[from] = 0;

  const captured = [];
  const opponent = other(seat);
  for (const [dr, dc] of DIRECTIONS) {
    const r1 = rowOf(to) + dr, c1 = colOf(to) + dc;
    if (r1 < 0 || r1 >= BOARD_SIZE || c1 < 0 || c1 >= BOARD_SIZE) continue;
    const adjacent = r1 * BOARD_SIZE + c1;
    if (seatOf(next[adjacent]) !== opponent) continue;

    const r2 = r1 + dr, c2 = c1 + dc;
    if (r2 < 0 || r2 >= BOARD_SIZE || c2 < 0 || c2 >= BOARD_SIZE) continue;
    const beyond = r2 * BOARD_SIZE + c2;
    if (seatOf(next[beyond]) === seat) captured.push(adjacent);
  }
  for (const idx of captured) next[idx] = 0;

  return { board: next, captured };
}

export function pieceCount(board, seat) {
  let count = 0;
  for (let i = 0; i < CELLS; i++) if (seatOf(board[i]) === seat) count++;
  return count;
}

/** A stable position key for repetition detection -- board contents plus
 * whose turn it is, exactly like checkers.mjs's own positionKey(). Only
 * meaningful in the movement phase (placement never repeats a position,
 * since the piece count only ever grows). */
export function positionKey(board, turn) {
  return `${turn}:${Array.from(board).join(",")}`;
}
