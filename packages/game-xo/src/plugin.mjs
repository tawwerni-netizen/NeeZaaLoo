/**
 * XOPlugin -- Standard Tic-Tac-Toe (see xo.mjs's own header for the exact,
 * versioned ruleset) expressed against the generic duel-engine plugin
 * contract, the same shape as every other launch game's own plugin.mjs.
 *
 * The intent is a single cell index (0-8) -- the simplest possible move a
 * player can make, exactly like Connect Four's own column index.
 */
import { initialBoard, legalCells, isBoardFull, winningLine, place, CELLS, SEAT_0, SEAT_1 } from "./xo.mjs";

function freshState() {
  return { board: initialBoard(), turn: SEAT_0, lastMove: null, moves: [] };
}

function cloneState(state) {
  return { board: Int8Array.from(state.board), turn: state.turn, lastMove: state.lastMove, moves: [...state.moves] };
}

function outcomeFor(state) {
  if (state.lastMove === null) return null;
  const line = winningLine(state.board, state.lastMove);
  if (line) {
    const justMoved = state.turn === SEAT_0 ? SEAT_1 : SEAT_0;
    return { result: justMoved === SEAT_0 ? "1-0" : "0-1", reason: "LINE_COMPLETE" };
  }
  if (isBoardFull(state.board)) return { result: "1/2-1/2", reason: "BOARD_FULL" };
  return null;
}

export const XOPlugin = {
  id: "xo",
  version: 1,
  turnModel: "ALTERNATING",

  createChallenge(_seed, _config = {}) {
    return { state: freshState(), publicSeed: null };
  },

  /** Always the same empty board -- no per-duel randomness, exactly like
   * checkers' and Connect Four's own matchmakingDefaults(). */
  matchmakingDefaults() {
    return { initialState: {} };
  },

  rehydrate(_initial) {
    return { state: freshState() };
  },

  applyIntent(state, intent, ctx) {
    if (!Number.isInteger(intent) || intent < 0 || intent >= CELLS) {
      return { ok: false, reason: "MALFORMED" };
    }
    if (state.turn !== ctx.seat) return { ok: false, reason: "NOT_YOUR_TURN" };
    if (state.board[intent] !== 0) return { ok: false, reason: "ILLEGAL" };

    const next = cloneState(state);
    next.board = place(state.board, intent, state.turn);
    next.lastMove = intent;
    next.moves.push(intent);
    next.turn = state.turn === SEAT_0 ? SEAT_1 : SEAT_0;

    return {
      ok: true,
      state: next,
      record: { cell: intent, seat: ctx.seat },
      events: [{ type: "MARK", payload: { seat: ctx.seat, cell: intent } }],
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

  /** Perfect-information game, like chess/checkers/Connect Four: both
   * players and spectators see the same board. `legalCells` is withheld
   * from a spectator for the same reason every other plugin withholds
   * its own equivalent. */
  project(state, viewer) {
    const base = { board: Array.from(state.board), turn: state.turn, lastMove: state.lastMove };
    if (viewer === "spectator") return base;
    return { ...base, legalCells: legalCells(state.board) };
  },

  /** Evidence for the Fair Play Engine -- the same move-timing-uniformity
   * signal every other plugin in this launch computes. A 9-cell game
   * offers little else to measure. */
  fairPlaySignals(_state, history = {}) {
    const times = history.moveTimesMs ?? [];
    if (times.length < 5) return [];
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((a, t) => a + (t - mean) ** 2, 0) / times.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    if (cv >= 0.15) return [];
    return [{
      id: "xo.move_time_uniformity",
      kind: "TIMING",
      strength: Math.min(1, (0.15 - cv) / 0.15),
      confidence: Math.min(1, times.length / 20),
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
