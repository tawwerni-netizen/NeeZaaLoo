/**
 * ChessPlugin — the flagship game, expressed against the generic plugin contract.
 *
 * Chess is deliberately the first plugin: it is the hardest case the contract
 * will ever face (long games, an authoritative clock, five distinct draw rules,
 * a real replay format). An abstraction that survives chess will survive Speed
 * Math. If any of the methods below had needed an escape hatch into the engine,
 * the boundary would have been wrong.
 *
 * Note what this file does NOT contain: no money, no rating, no ban logic, no
 * persistence. Adding a game must never require touching financial code.
 */
import {
  parseFen, toFen, START_FEN, generateMoves, makeMove, findLegalMove,
  adjudicate, positionKey, moveToUci, isInCheck, WHITE,
} from "./chess.mjs";

const seatToColour = (seat) => (seat === 0 ? WHITE : -WHITE);

export const ChessPlugin = {
  id: "chess",
  version: 1,

  /**
   * Server-side, seeded, deterministic. For standard chess the seed is unused;
   * the same signature carries Chess960 or a themed-position variant later
   * without changing the engine.
   */
  createChallenge(seed, config = {}) {
    const fen = config.startFen ?? START_FEN;
    const state = {
      position: parseFen(fen),
      initialFen: fen,
      history: [],          // position keys, for threefold
      moves: [],            // UCI strings, the replay payload
    };
    state.history.push(positionKey(state.position));
    return { state, publicSeed: null };
  },

  /**
   * The compact `initial_state` recipe a matchmaking worker persists for a
   * brand-new duel -- exactly what `rehydrate()` below reconstructs from,
   * and never the full challenge state `createChallenge` builds. Standard
   * chess needs no per-duel randomness, so `seed` is accepted (every plugin
   * must take one, for games that do) and ignored.
   */
  matchmakingDefaults(_seed, config = {}) {
    return { initialState: { fen: config.startFen ?? START_FEN } };
  },

  /** Rebuild a state from a serialised replay header. Used by verifyReplay. */
  rehydrate(initial) {
    const state = {
      position: parseFen(initial.fen),
      initialFen: initial.fen,
      history: [],
      moves: [],
    };
    state.history.push(positionKey(state.position));
    return { state };
  },

  /**
   * Pure. Returns a NEW state; never mutates the caller's.
   * The intent is a UCI string and nothing else — there is no field in which a
   * client can assert a result, a score, or an elapsed time.
   */
  applyIntent(state, intent, ctx) {
    if (typeof intent !== "string" || !/^[a-h][1-8][a-h][1-8][nbrq]?$/.test(intent)) {
      return { ok: false, reason: "MALFORMED" };
    }

    // Whose move is it? The position knows; the client is not asked.
    if (state.position.turn !== seatToColour(ctx.seat)) {
      return { ok: false, reason: "NOT_YOUR_TURN" };
    }

    const next = cloneState(state);
    const move = findLegalMove(next.position, intent);
    if (move === null) return { ok: false, reason: "ILLEGAL" };

    makeMove(next.position, move);
    next.position.stack.length = 0;      // the replay is the history, not the undo stack
    next.moves.push(intent);
    next.history.push(positionKey(next.position));

    return {
      ok: true,
      state: next,
      record: { uci: intent, fenAfter: toFen(next.position) },
      events: [{ type: "MOVE", payload: { uci: intent, ply: next.moves.length } }],
    };
  },

  /** Position-derived outcome, or null if the game continues. */
  evaluate(state) {
    const verdict = adjudicate(state.position, state.history);
    if (!verdict.over) return null;
    return { result: verdict.result, reason: verdict.reason };
  },

  /** Chess scoring is the result itself; there is no points dimension. */
  score(state) {
    const verdict = adjudicate(state.position, state.history);
    if (!verdict.over) return [0, 0];
    if (verdict.result === "1-0") return [1, 0];
    if (verdict.result === "0-1") return [0, 1];
    return [0.5, 0.5];
  },

  /**
   * What a viewer is allowed to see.
   *
   * Chess is a perfect-information game, so both players and spectators see the
   * same position — but the projection still exists, and still runs, because it
   * is the single choke point where "what goes on the wire" is decided. For
   * Memory or Speed Math this method is what stops the client receiving content
   * it has not earned yet.
   */
  project(state, viewer) {
    const base = {
      fen: toFen(state.position),
      moves: [...state.moves],
      ply: state.moves.length,
      inCheck: isInCheck(state.position),
    };
    if (viewer === "spectator") return base;
    return { ...base, legalMoves: generateMoves(state.position).map(moveToUci) };
  },

  /**
   * Evidence for the Fair Play Engine. Signals, never verdicts — this method
   * has no way to express "ban". Engine-correlation and centipawn analysis run
   * asynchronously against the replay; what is cheap and synchronous here is
   * move timing, which is the loudest single signal for assistance.
   */
  fairPlaySignals(state, history = {}) {
    const times = history.moveTimesMs ?? [];
    if (times.length < 8) return [];

    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((a, t) => a + (t - mean) ** 2, 0) / times.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;

    const signals = [];
    // Humans think for wildly different lengths on easy and hard positions.
    // A near-flat distribution is the shape assistance produces.
    if (cv < 0.15) {
      signals.push({
        id: "chess.move_time_uniformity",
        kind: "TIMING",
        strength: Math.min(1, (0.15 - cv) / 0.15),
        confidence: Math.min(1, times.length / 40),
        observedValue: { coefficientOfVariation: Number(cv.toFixed(4)), samples: times.length },
        baseline: { expectedCvAbove: 0.15 },
        explanation:
          `Move times varied by only ${(cv * 100).toFixed(1)}% of their mean across ` +
          `${times.length} moves. Human play normally varies far more, because ` +
          `positions differ in difficulty.`,
        detectorVersion: 1,
      });
    }
    return signals;
  },

  /** Compact, replayable, verifiable. */
  serializeReplay(state, { initialOnly = false } = {}) {
    if (initialOnly) return { fen: state.initialFen };
    return { fen: state.initialFen, moves: [...state.moves] };
  },
};

function cloneState(state) {
  const p = state.position;
  return {
    position: {
      board: Int8Array.from(p.board),
      turn: p.turn,
      castling: p.castling,
      ep: p.ep,
      halfmove: p.halfmove,
      fullmove: p.fullmove,
      stack: [],
    },
    initialFen: state.initialFen,
    history: [...state.history],
    moves: [...state.moves],
  };
}
