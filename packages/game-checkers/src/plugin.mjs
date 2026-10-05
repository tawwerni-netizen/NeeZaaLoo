/**
 * CheckersPlugin -- American Checkers (see checkers.mjs's own header for the
 * exact, versioned ruleset) expressed against the generic duel-engine
 * plugin contract (packages/duel-engine/src/duel.mjs's registerPlugin).
 *
 * Structurally this file is deliberately the same shape as
 * packages/game-chess/src/plugin.mjs: an intent is a 4-character
 * from/to square pair ("c3d4"), applyIntent is pure and returns a new
 * state, and mandatory-capture / multi-jump are enforced HERE by
 * consulting checkers.mjs's own legalMoves() -- a client cannot skip a
 * capture or stop a forced multi-jump early because the move it proposes
 * simply will not appear in that list.
 */
import {
  initialBoard, legalMoves, applyMoveToBoard, hasNoMoves, pieceCount,
  positionKey, squareToLabel, labelToSquare, SEAT_0, SEAT_1,
  NO_CAPTURE_DRAW_PLIES, REPETITION_DRAW_COUNT,
} from "./checkers.mjs";

function cloneState(state) {
  return {
    board: Int8Array.from(state.board),
    turn: state.turn,
    forcedFrom: state.forcedFrom ? { ...state.forcedFrom } : null,
    plySinceCapture: state.plySinceCapture,
    history: [...state.history],
    moves: [...state.moves],
  };
}

function freshState() {
  const board = initialBoard();
  return {
    board,
    turn: SEAT_0,
    forcedFrom: null,
    plySinceCapture: 0,
    history: [positionKey(board, SEAT_0)],
    moves: [],
  };
}

function repetitionCount(history) {
  const last = history[history.length - 1];
  return history.filter((h) => h === last).length;
}

/** Position-derived outcome, or null if the game continues. Checked AFTER
 * every applied move, from the perspective of whoever is now to move. */
function outcomeFor(state) {
  if (hasNoMoves(state.board, state.turn)) {
    // The side to move has no legal move -- a LOSS under this ruleset,
    // never a draw (see checkers.mjs's own header on why this differs
    // from chess's stalemate).
    return { result: state.turn === SEAT_0 ? "0-1" : "1-0", reason: "NO_LEGAL_MOVES" };
  }
  if (state.plySinceCapture >= NO_CAPTURE_DRAW_PLIES) {
    return { result: "1/2-1/2", reason: "FORTY_MOVE_RULE" };
  }
  if (repetitionCount(state.history) >= REPETITION_DRAW_COUNT) {
    return { result: "1/2-1/2", reason: "THREEFOLD_REPETITION" };
  }
  return null;
}

export const CheckersPlugin = {
  id: "checkers",
  version: 1,
  turnModel: "ALTERNATING",

  createChallenge(_seed, _config = {}) {
    return { state: freshState(), publicSeed: null };
  },

  /** The compact recipe a fresh duel's `initial_state` column stores.
   * Checkers always starts from the same position -- there is no
   * per-duel randomness to persist, mirroring chess's own
   * matchmakingDefaults(). */
  matchmakingDefaults() {
    return { initialState: {} };
  },

  rehydrate(_initial) {
    return { state: freshState() };
  },

  applyIntent(state, intent, ctx) {
    if (typeof intent !== "string" || !/^[a-h][1-8][a-h][1-8]$/.test(intent)) {
      return { ok: false, reason: "MALFORMED" };
    }
    if (state.turn !== ctx.seat) return { ok: false, reason: "NOT_YOUR_TURN" };

    const from = labelToSquare(intent.slice(0, 2));
    const to = labelToSquare(intent.slice(2, 4));
    if (!from || !to) return { ok: false, reason: "MALFORMED" };

    const candidates = legalMoves(state.board, state.turn, state.forcedFrom);
    const move = candidates.find(
      (m) => m.from.row === from.row && m.from.col === from.col && m.to.row === to.row && m.to.col === to.col
    );
    if (!move) return { ok: false, reason: "ILLEGAL" };

    const next = cloneState(state);
    const { board, promoted, continuesFrom } = applyMoveToBoard(next.board, move);
    next.board = board;
    next.plySinceCapture = move.capture ? 0 : next.plySinceCapture + 1;
    next.moves.push(intent);

    const events = [{ type: "MOVE", payload: { from: intent.slice(0, 2), to: intent.slice(2, 4), capture: move.capture, promoted } }];

    if (continuesFrom) {
      // Mandatory multi-jump: the SAME seat moves again, from the landing
      // square, and turn does not pass. Position history is not extended
      // mid-sequence -- only a position where a player is actually about
      // to CHOOSE a move (turn has passed) is meaningful for repetition.
      next.forcedFrom = continuesFrom;
    } else {
      next.forcedFrom = null;
      next.turn = state.turn === SEAT_0 ? SEAT_1 : SEAT_0;
      next.history.push(positionKey(next.board, next.turn));
    }

    return { ok: true, state: next, record: { move: intent, capture: move.capture, promoted }, events };
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

  /** Perfect-information game, like chess: both players and spectators see
   * the same board. `legalMoves` (own-seat only, in the same {from,to}
   * label shape the board component already speaks) is withheld from a
   * spectator for the same reason chess withholds it. */
  project(state, viewer) {
    const rows = [];
    for (let r = 0; r < 8; r++) {
      const row = [];
      for (let c = 0; c < 8; c++) row.push(state.board[r * 8 + c]);
      rows.push(row);
    }
    const base = {
      board: rows,
      turn: state.turn,
      forcedFrom: state.forcedFrom ? squareToLabel(state.forcedFrom.row, state.forcedFrom.col) : null,
      pieceCounts: [pieceCount(state.board, SEAT_0), pieceCount(state.board, SEAT_1)],
    };
    if (viewer === "spectator") return base;
    const moves = legalMoves(state.board, state.turn, state.forcedFrom)
      .map((m) => `${squareToLabel(m.from.row, m.from.col)}${squareToLabel(m.to.row, m.to.col)}`);
    return { ...base, legalMoves: moves };
  },

  /** Evidence for the Fair Play Engine -- same move-timing-uniformity
   * signal chess's own plugin computes, over the SAME shape of history the
   * engine already collects per duel. Checkers has no engine-correlation
   * equivalent to chess's centipawn analysis in this launch version; move
   * timing is what is cheap and synchronous here too. */
  fairPlaySignals(_state, history = {}) {
    const times = history.moveTimesMs ?? [];
    if (times.length < 8) return [];
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((a, t) => a + (t - mean) ** 2, 0) / times.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    if (cv >= 0.15) return [];
    return [{
      id: "checkers.move_time_uniformity",
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
