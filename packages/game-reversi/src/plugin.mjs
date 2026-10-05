/**
 * ReversiPlugin -- standard Othello rules (see reversi.mjs's own header for
 * the exact, versioned ruleset) expressed against the generic duel-engine
 * plugin contract, the same shape as every other launch game's own
 * plugin.mjs.
 *
 * The intent is `{ place: idx }` for an outflanking placement, or
 * `{ pass: true }` for the one non-placement action, only ever legal when
 * the mover genuinely has no legal placement anywhere on the board --
 * the same shape and the same server-side re-validation Dominoes' own
 * pass already uses.
 */
import {
  SEAT_0, SEAT_1, CELLS, other, initialBoard, outflankedBy, applyPlacement,
  hasLegalMove, legalMoves, pieceCount, isFull,
} from "./reversi.mjs";

function freshState() {
  return { board: initialBoard(), turn: SEAT_0, moves: [] };
}

function cloneState(state) {
  return { board: Int8Array.from(state.board), turn: state.turn, moves: [...state.moves] };
}

/**
 * The game ends the instant the board is full, or neither seat has a
 * legal move ANYWHERE -- checked directly, regardless of whose nominal
 * turn it is, exactly matching the real rule ("the game ends when
 * neither player can move"): a player is never made to submit a pointless
 * pass when the position is already, unambiguously, over.
 */
function outcomeFor(state) {
  const full = isFull(state.board);
  const neitherCanMove = !full && !hasLegalMove(state.board, SEAT_0) && !hasLegalMove(state.board, SEAT_1);
  if (!full && !neitherCanMove) return null;

  const p0 = pieceCount(state.board, SEAT_0);
  const p1 = pieceCount(state.board, SEAT_1);
  const reason = full ? "BOARD_FULL" : "NO_LEGAL_MOVES";
  if (p0 === p1) return { result: "1/2-1/2", reason };
  return { result: p0 > p1 ? "1-0" : "0-1", reason };
}

export const ReversiPlugin = {
  id: "reversi",
  version: 1,
  turnModel: "ALTERNATING",

  createChallenge(_seed, _config = {}) {
    return { state: freshState(), publicSeed: null };
  },

  /** Always the same standard starting position -- no per-duel
   * randomness, exactly like checkers'/XO's own matchmakingDefaults(). */
  matchmakingDefaults() {
    return { initialState: {} };
  },

  rehydrate(_initial) {
    return { state: freshState() };
  },

  applyIntent(state, intent, ctx) {
    if (typeof intent !== "object" || intent === null) return { ok: false, reason: "MALFORMED" };
    if (state.turn !== ctx.seat) return { ok: false, reason: "NOT_YOUR_TURN" };

    if (intent.pass === true) {
      if (Object.keys(intent).length !== 1) return { ok: false, reason: "MALFORMED" };
      if (hasLegalMove(state.board, ctx.seat)) return { ok: false, reason: "ILLEGAL" };

      const next = cloneState(state);
      next.turn = other(ctx.seat);
      next.moves.push({ seat: ctx.seat, action: "PASS" });
      return {
        ok: true, state: next,
        record: { action: "PASS", seat: ctx.seat },
        events: [{ type: "PASS", payload: { seat: ctx.seat } }],
      };
    }

    const { place } = intent;
    const extraKeys = Object.keys(intent).filter((k) => k !== "place");
    if (extraKeys.length !== 0 || !Number.isInteger(place) || place < 0 || place >= CELLS) {
      return { ok: false, reason: "MALFORMED" };
    }

    const flips = outflankedBy(state.board, place, ctx.seat);
    if (flips.length === 0) return { ok: false, reason: "ILLEGAL" };

    const { board: nextBoard, flipped } = applyPlacement(state.board, place, ctx.seat);
    const next = cloneState(state);
    next.board = nextBoard;
    next.turn = other(ctx.seat);
    next.moves.push({ seat: ctx.seat, action: "PLACE", place, flipped });

    return {
      ok: true,
      state: next,
      record: { action: "PLACE", seat: ctx.seat, place, flipped },
      events: [{ type: "PLACE", payload: { seat: ctx.seat, place, flipped } }],
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

  /** Perfect-information game, like checkers/XO: both players and
   * spectators see the same board. `legalMoves` -- for whichever seat is
   * currently `state.turn` -- is withheld from a spectator only. */
  project(state, viewer) {
    const lastMove = state.moves.length ? state.moves[state.moves.length - 1] : null;
    const base = {
      board: Array.from(state.board),
      turn: state.turn,
      counts: [pieceCount(state.board, SEAT_0), pieceCount(state.board, SEAT_1)],
      // Public animation info (which squares the last placement flipped) --
      // never hidden information, so exposed to a spectator too, unlike
      // Dominoes' own hand.
      lastMove,
    };
    if (viewer === "spectator") return base;
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
      id: "reversi.move_time_uniformity",
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
