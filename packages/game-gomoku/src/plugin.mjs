/**
 * GomokuPlugin -- Freestyle Gomoku (see gomoku.mjs's own header for the
 * exact, versioned ruleset) expressed against the generic duel-engine
 * plugin contract, the same shape as every other launch game's own
 * plugin.mjs.
 *
 * Structurally the closest relative in this codebase is XO -- a fixed
 * empty starting board, a simple "place on any empty cell" intent (a
 * bare cell index, not an object), and a win/draw derived purely from
 * the just-placed square. The only real difference is scale (225 cells
 * instead of 9) and the win condition itself (5+ in a row instead of 3).
 */
import { SEAT_0, SEAT_1, CELLS, initialBoard, legalCells, isBoardFull, winningLineThrough, pieceFor, CENTER_CELL } from "./gomoku.mjs";

function freshState(config = {}) {
  return { board: initialBoard(), turn: SEAT_0, lastMove: null, moves: [], config };
}

function cloneState(state) {
  return {
    board: Int8Array.from(state.board),
    turn: state.turn,
    lastMove: state.lastMove,
    moves: [...state.moves],
    config: state.config,
  };
}

/** Position-derived outcome, or null if the game continues. Checked
 * AFTER every applied move, exactly like XO's own outcomeFor(). */
function outcomeFor(state) {
  if (state.lastMove === null) return null;
  const line = winningLineThrough(state.board, state.lastMove, {
    exactFive: state.config?.exactFive ?? false,
  });
  if (line) {
    const justMoved = state.turn === SEAT_0 ? SEAT_1 : SEAT_0;
    return { result: justMoved === SEAT_0 ? "1-0" : "0-1", reason: "FIVE_IN_A_ROW", line };
  }
  if (isBoardFull(state.board)) return { result: "1/2-1/2", reason: "BOARD_FULL" };
  return null;
}

export const GomokuPlugin = {
  id: "gomoku",
  version: 1,
  turnModel: "ALTERNATING",

  createChallenge(_seed, config = {}) {
    return { state: freshState(config), publicSeed: null };
  },

  /** Always the same empty board -- no per-duel randomness, exactly like
   * XO's/checkers' own matchmakingDefaults(). */
  matchmakingDefaults() {
    return { initialState: {} };
  },

  rehydrate(initial) {
    return { state: freshState(initial.config || {}) };
  },

  applyIntent(state, intent, ctx) {
    const cell = typeof intent === "object" && intent !== null ? intent.cell : intent;
    if (!Number.isInteger(cell) || cell < 0 || cell >= CELLS) {
      return { ok: false, reason: "MALFORMED" };
    }
    if (state.turn !== ctx.seat) return { ok: false, reason: "NOT_YOUR_TURN" };
    if (state.board[cell] !== 0) return { ok: false, reason: "ILLEGAL" };

    if (state.config?.centerOpening && state.moves.length === 0 && cell !== CENTER_CELL) {
      return { ok: false, reason: "CENTER_OPENING_REQUIRED" };
    }

    const next = cloneState(state);
    next.board[cell] = pieceFor(state.turn);
    next.lastMove = cell;
    next.moves.push(cell);
    next.turn = state.turn === SEAT_0 ? SEAT_1 : SEAT_0;

    return {
      ok: true,
      state: next,
      record: { cell, seat: ctx.seat },
      events: [{ type: "PLACE", payload: { seat: ctx.seat, cell } }],
    };
  },

  evaluate(state) {
    return outcomeFor(state);
  },

  score(state) {
    const outcome = outcomeFor(state);
    if (!outcome) return [0, 0];
    if (outcome.result === "1-0") return [1, 0];
    if (outcome.result === "0-1") return [0, 1];
    return [0.5, 0.5];
  },

  /** Perfect-information game, like XO: both players and spectators see
   * the same board. `legalCells` is withheld from a spectator for the
   * same reason XO withholds it. */
  project(state, viewer) {
    const base = { board: Array.from(state.board), turn: state.turn, lastMove: state.lastMove };
    if (viewer === "spectator") return base;
    return { ...base, legalCells: legalCells(state.board) };
  },

  /** Evidence for the Fair Play Engine -- the same move-timing-uniformity
   * signal every other plugin in this launch computes. */
  fairPlaySignals(_state, history = {}) {
    const times = history.moveTimesMs ?? [];
    if (times.length < 8) return [];
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((a, t) => a + (t - mean) ** 2, 0) / times.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    if (cv >= 0.15) return [];
    return [{
      id: "gomoku.move_time_uniformity",
      kind: "TIMING",
      strength: Math.min(1, (0.15 - cv) / 0.15),
      confidence: Math.min(1, times.length / 30),
      observedValue: { coefficientOfVariation: Number(cv.toFixed(4)), samples: times.length },
      baseline: { expectedCvAbove: 0.15 },
      explanation:
        `Move times varied by only ${(cv * 100).toFixed(1)}% of their mean across ` +
        `${times.length} moves. Human play normally varies far more.`,
      detectorVersion: 1,
    }];
  },

  serializeReplay(state, { initialOnly = false } = {}) {
    return initialOnly ? {} : { moves: [...state.moves] };
  },
};
