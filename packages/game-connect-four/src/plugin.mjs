/**
 * ConnectFourPlugin -- Standard Connect Four (see connect-four.mjs's own
 * header for the exact, versioned ruleset) expressed against the generic
 * duel-engine plugin contract, the same shape as
 * packages/game-checkers/src/plugin.mjs and packages/game-chess/src/plugin.mjs.
 *
 * The intent is deliberately the simplest possible: a single column
 * index (0-6). There is no from/to, no piece to select -- a client sends
 * exactly the one thing a real player decides.
 */
import {
  initialBoard, drop, isWinningPlacement, isBoardFull, legalColumns, COLS, SEAT_0, SEAT_1,
} from "./connect-four.mjs";

function freshState() {
  return { board: initialBoard(), turn: SEAT_0, lastMove: null, plyCount: 0, moves: [] };
}

function cloneState(state) {
  return {
    board: Int8Array.from(state.board),
    turn: state.turn,
    lastMove: state.lastMove ? { ...state.lastMove } : null,
    plyCount: state.plyCount,
    moves: [...state.moves],
  };
}

function outcomeFor(state) {
  if (!state.lastMove) return null;
  const justMoved = state.turn === SEAT_0 ? SEAT_1 : SEAT_0;
  if (isWinningPlacement(state.board, state.lastMove.row, state.lastMove.col)) {
    return { result: justMoved === SEAT_0 ? "1-0" : "0-1", reason: "FOUR_IN_A_ROW" };
  }
  if (isBoardFull(state.board)) {
    return { result: "1/2-1/2", reason: "BOARD_FULL" };
  }
  return null;
}

export const ConnectFourPlugin = {
  id: "connect-four",
  version: 1,
  turnModel: "ALTERNATING",

  createChallenge(_seed, _config = {}) {
    return { state: freshState(), publicSeed: null };
  },

  /** Always the same empty board -- no per-duel randomness, mirroring
   * checkers' own matchmakingDefaults(). */
  matchmakingDefaults() {
    return { initialState: {} };
  },

  rehydrate(_initial) {
    return { state: freshState() };
  },

  applyIntent(state, intent, ctx) {
    if (!Number.isInteger(intent) || intent < 0 || intent >= COLS) {
      return { ok: false, reason: "MALFORMED" };
    }
    if (state.turn !== ctx.seat) return { ok: false, reason: "NOT_YOUR_TURN" };
    if (!legalColumns(state.board).includes(intent)) return { ok: false, reason: "ILLEGAL" };

    const next = cloneState(state);
    const placed = drop(next.board, intent, state.turn);
    next.board = placed.board;
    next.lastMove = { row: placed.row, col: placed.col };
    next.plyCount += 1;
    next.moves.push(intent);
    next.turn = state.turn === SEAT_0 ? SEAT_1 : SEAT_0;

    return {
      ok: true,
      state: next,
      record: { col: intent, row: placed.row },
      events: [{ type: "DROP", payload: { seat: ctx.seat, col: intent, row: placed.row } }],
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

  /** Perfect-information game: both players and spectators see the whole
   * board (there is nothing to hide -- every token dropped is visible the
   * instant it lands). `legalColumns` is withheld from a spectator for
   * consistency with every other plugin's own convention, even though a
   * spectator could trivially compute it from the board themselves. */
  project(state, viewer) {
    const rows = [];
    for (let r = 0; r < 6; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) row.push(state.board[r * COLS + c]);
      rows.push(row);
    }
    const base = { board: rows, turn: state.turn, lastMove: state.lastMove };
    if (viewer === "spectator") return base;
    return { ...base, legalColumns: legalColumns(state.board) };
  },

  /** Evidence for the Fair Play Engine -- the same move-timing-uniformity
   * signal every other plugin in this launch computes. Connect Four has
   * no engine-correlation equivalent in this version. */
  fairPlaySignals(_state, history = {}) {
    const times = history.moveTimesMs ?? [];
    if (times.length < 8) return [];
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((a, t) => a + (t - mean) ** 2, 0) / times.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    if (cv >= 0.15) return [];
    return [{
      id: "connect_four.move_time_uniformity",
      kind: "TIMING",
      strength: Math.min(1, (0.15 - cv) / 0.15),
      confidence: Math.min(1, times.length / 40),
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
