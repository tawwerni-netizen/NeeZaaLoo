/**
 * SeegaPlugin -- 5x5 Seega, single-piece custodial capture (see seega.mjs's
 * own header for the exact, versioned ruleset) expressed against the
 * generic duel-engine plugin contract, the same shape as every other
 * launch game's own plugin.mjs.
 *
 * Structurally closest to checkers: a fixed starting position (an EMPTY
 * board, unlike checkers -- Seega's own pieces enter through a whole
 * PLACEMENT phase first), perfect information, and a "no legal move
 * loses" condition read straight off the position. The two-phase shape
 * (`state.phase`) is the one thing no other launch game has: the intent
 * shape itself changes depending on which phase the duel is currently
 * in -- `{ place }` during PLACEMENT, `{ from, to }` during MOVEMENT.
 */
import {
  SEAT_0, SEAT_1, Phase, CELLS, PIECES_PER_SIDE, NO_CAPTURE_DRAW_PLIES, REPETITION_DRAW_COUNT,
  other, initialBoard, isCenter, seatOf, pieceFor, legalPlacements, legalMoves, hasNoMoves,
  applyMove, pieceCount, positionKey,
} from "./seega.mjs";

function freshState() {
  return {
    phase: Phase.PLACEMENT,
    board: initialBoard(),
    turn: SEAT_0,
    placedCount: [0, 0],
    plySinceCapture: 0,
    history: [],
    moves: [],
  };
}

function cloneState(state) {
  return {
    phase: state.phase,
    board: Int8Array.from(state.board),
    turn: state.turn,
    placedCount: [...state.placedCount],
    plySinceCapture: state.plySinceCapture,
    history: [...state.history],
    moves: [...state.moves],
  };
}

function repetitionCount(history) {
  if (history.length === 0) return 0;
  const last = history[history.length - 1];
  return history.filter((h) => h === last).length;
}

/** Position-derived outcome, or null if the game continues. Never
 * evaluated during PLACEMENT -- nothing has moved yet, so no win/draw
 * condition in this ruleset can possibly apply (see seega.mjs's own
 * header). */
function outcomeFor(state) {
  if (state.phase !== Phase.MOVEMENT) return null;

  const p0 = pieceCount(state.board, SEAT_0);
  const p1 = pieceCount(state.board, SEAT_1);
  if (p0 === 0) return { result: "0-1", reason: "ALL_CAPTURED" };
  if (p1 === 0) return { result: "1-0", reason: "ALL_CAPTURED" };

  if (hasNoMoves(state.board, state.turn)) {
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

export const SeegaPlugin = {
  id: "seega",
  version: 1,
  turnModel: "ALTERNATING",

  createChallenge(_seed, _config = {}) {
    return { state: freshState(), publicSeed: null };
  },

  /** Always the same empty board -- no per-duel randomness, exactly like
   * checkers' and XO's own matchmakingDefaults(). */
  matchmakingDefaults() {
    return { initialState: {} };
  },

  rehydrate(_initial) {
    return { state: freshState() };
  },

  applyIntent(state, intent, ctx) {
    if (typeof intent !== "object" || intent === null) return { ok: false, reason: "MALFORMED" };
    if (state.turn !== ctx.seat) return { ok: false, reason: "NOT_YOUR_TURN" };

    if (state.phase === Phase.PLACEMENT) {
      const { place } = intent;
      const extraKeys = Object.keys(intent).filter((k) => k !== "place");
      if (extraKeys.length !== 0 || !Number.isInteger(place) || place < 0 || place >= CELLS) {
        return { ok: false, reason: "MALFORMED" };
      }
      if (isCenter(place) || state.board[place] !== 0) return { ok: false, reason: "ILLEGAL" };

      const next = cloneState(state);
      next.board[place] = pieceFor(ctx.seat);
      next.placedCount[ctx.seat] += 1;
      next.moves.push({ seat: ctx.seat, action: "PLACE", place });

      const donePlacing =
        next.placedCount[SEAT_0] === PIECES_PER_SIDE && next.placedCount[SEAT_1] === PIECES_PER_SIDE;
      if (donePlacing) {
        // The player who placed SECOND moves first in the movement phase
        // -- see seega.mjs's own header on why that is the documented
        // rule, not an accident of alternation.
        next.phase = Phase.MOVEMENT;
        next.turn = SEAT_1;
        next.history = [positionKey(next.board, next.turn)];
      } else {
        next.turn = other(ctx.seat);
      }

      return {
        ok: true,
        state: next,
        record: { action: "PLACE", seat: ctx.seat, place },
        events: [{ type: "PLACE", payload: { seat: ctx.seat, place } }],
      };
    }

    // MOVEMENT phase.
    const { from, to } = intent;
    const extraKeys = Object.keys(intent).filter((k) => k !== "from" && k !== "to");
    if (
      extraKeys.length !== 0 ||
      !Number.isInteger(from) || from < 0 || from >= CELLS ||
      !Number.isInteger(to) || to < 0 || to >= CELLS
    ) {
      return { ok: false, reason: "MALFORMED" };
    }
    if (seatOf(state.board[from]) !== ctx.seat) return { ok: false, reason: "ILLEGAL" };
    if (state.board[to] !== 0) return { ok: false, reason: "ILLEGAL" };

    const candidates = legalMoves(state.board, ctx.seat);
    if (!candidates.some((m) => m.from === from && m.to === to)) return { ok: false, reason: "ILLEGAL" };

    const { board: nextBoard, captured } = applyMove(state.board, from, to, ctx.seat);
    const next = cloneState(state);
    next.board = nextBoard;
    next.turn = other(ctx.seat);
    next.plySinceCapture = captured.length > 0 ? 0 : state.plySinceCapture + 1;
    next.history.push(positionKey(nextBoard, next.turn));
    next.moves.push({ seat: ctx.seat, action: "MOVE", from, to, captured });

    return {
      ok: true,
      state: next,
      record: { action: "MOVE", seat: ctx.seat, from, to, captured },
      events: [{ type: "MOVE", payload: { seat: ctx.seat, from, to, captured } }],
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

  /** Perfect-information game, like checkers: both players and spectators
   * see the same board. The legal-actions list for whichever seat is
   * currently `state.turn` is withheld from a spectator only, exactly
   * like checkers' own project() withholds legalMoves. */
  project(state, viewer) {
    const base = {
      phase: state.phase,
      board: Array.from(state.board),
      turn: state.turn,
      placedCount: [...state.placedCount],
    };
    if (viewer === "spectator") return base;
    if (state.phase === Phase.PLACEMENT) {
      return { ...base, legalPlacements: legalPlacements(state.board) };
    }
    return { ...base, legalMoves: legalMoves(state.board, state.turn) };
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
      id: "seega.move_time_uniformity",
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
    return initialOnly ? {} : { moves: state.moves };
  },
};
