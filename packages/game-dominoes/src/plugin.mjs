/**
 * DominoesPlugin -- Double-Six Block Dominoes (see dominoes.mjs's own
 * header for the exact, versioned ruleset) expressed against the generic
 * duel-engine plugin contract, the same shape as every other launch
 * game's own plugin.mjs.
 *
 * Structurally closest to Speed Math, not to chess/checkers/XO: the
 * starting position is NOT fixed -- each duel deals a fresh, seeded hand
 * to each player (packages/game-speed-math/src/plugin.mjs's own header on
 * why a seed, not Math.random, is what makes this replayable and
 * auditable) -- and, unlike any perfect-information launch game, each
 * player's hand is genuinely PRIVATE: an opponent (and a spectator) sees
 * only how many tiles remain in it, never what they are.
 *
 * The intent is `{ tile: [a, b] }` (optionally `{ tile, end }` when both
 * ends are legal for that tile and the client must disambiguate), or
 * `{ pass: true }` -- the one non-placement action this game has, only
 * ever legal when the hand truly holds no matching tile.
 */
import {
  SEAT_0, SEAT_1, dealHands, determineOpening, initialLine,
  legalEndsForTile, handHasLegalMove, attach, pipSum, sameTile,
} from "./dominoes.mjs";

function other(seat) {
  return seat === SEAT_0 ? SEAT_1 : SEAT_0;
}

function freshState(seed) {
  const { hand0, hand1 } = dealHands(seed);
  const { leader, mustPlayTile } = determineOpening(hand0, hand1);
  return {
    seed: String(seed),
    hands: [hand0, hand1],
    line: initialLine(),
    turn: leader,
    openingConstraint: mustPlayTile ? { seat: leader, tile: mustPlayTile } : null,
    consecutivePasses: 0,
    moves: [],
  };
}

function cloneState(state) {
  return {
    seed: state.seed,
    hands: [[...state.hands[0]], [...state.hands[1]]],
    line: { left: state.line.left, right: state.line.right, tiles: [...state.line.tiles] },
    turn: state.turn,
    openingConstraint: state.openingConstraint ? { ...state.openingConstraint } : null,
    consecutivePasses: state.consecutivePasses,
    moves: [...state.moves],
  };
}

/** Position-derived outcome, or null if the game continues. A domino-out
 * is read directly off an emptied hand; a block is read off two
 * consecutive passes -- both are pure facts of `state`, checked the same
 * way every other plugin's own outcomeFor() works. */
function outcomeFor(state) {
  if (state.hands[SEAT_0].length === 0) return { result: "1-0", reason: "DOMINO_OUT" };
  if (state.hands[SEAT_1].length === 0) return { result: "0-1", reason: "DOMINO_OUT" };
  if (state.consecutivePasses >= 2) {
    const p0 = pipSum(state.hands[SEAT_0]);
    const p1 = pipSum(state.hands[SEAT_1]);
    if (p0 === p1) return { result: "1/2-1/2", reason: "BLOCKED" };
    return { result: p0 < p1 ? "1-0" : "0-1", reason: "BLOCKED" };
  }
  return null;
}

export const DominoesPlugin = {
  id: "dominoes",
  version: 1,
  turnModel: "ALTERNATING",

  /** Server-side, seeded, deterministic -- the deal and the opening
   * leader are both fully determined by `seed`, and identical for both
   * players' own reconstructions of the public parts of the state.
   * `publicSeed` is null: the seed never leaves the server, because a
   * client holding it could reconstruct the opponent's hand. */
  createChallenge(seed, _config = {}) {
    return { state: freshState(seed), publicSeed: null };
  },

  rehydrate(initial) {
    return { state: freshState(initial.seed) };
  },

  applyIntent(state, intent, ctx) {
    if (typeof intent !== "object" || intent === null) return { ok: false, reason: "MALFORMED" };
    if (state.turn !== ctx.seat) return { ok: false, reason: "NOT_YOUR_TURN" };

    const hand = state.hands[ctx.seat];

    if (intent.pass === true) {
      if (Object.keys(intent).length !== 1) return { ok: false, reason: "MALFORMED" };
      // A pass is only ever legal when genuinely no tile in hand matches
      // either open end -- re-derived server-side, never trusted from
      // the client (see this file's own header + dominoes.mjs's ruleset
      // doc: a player holding a legal tile may never pass instead).
      if (handHasLegalMove(hand, state.line)) return { ok: false, reason: "ILLEGAL" };

      const next = cloneState(state);
      next.consecutivePasses += 1;
      next.turn = other(ctx.seat);
      next.moves.push({ seat: ctx.seat, action: "PASS" });
      return {
        ok: true,
        state: next,
        record: { action: "PASS", seat: ctx.seat },
        events: [{ type: "PASS", payload: { seat: ctx.seat } }],
      };
    }

    const tile = intent.tile;
    const keys = Object.keys(intent).filter((k) => k !== "tile" && k !== "end");
    if (
      keys.length !== 0 ||
      !Array.isArray(tile) || tile.length !== 2 ||
      !Number.isInteger(tile[0]) || !Number.isInteger(tile[1]) ||
      tile[0] < 0 || tile[0] > 6 || tile[1] < 0 || tile[1] > 6 || tile[0] > tile[1] ||
      (intent.end !== undefined && intent.end !== "LEFT" && intent.end !== "RIGHT")
    ) {
      return { ok: false, reason: "MALFORMED" };
    }

    const idx = hand.findIndex((t) => sameTile(t, tile));
    if (idx === -1) return { ok: false, reason: "ILLEGAL" };

    if (state.openingConstraint && state.openingConstraint.seat === ctx.seat) {
      if (!sameTile(tile, state.openingConstraint.tile)) return { ok: false, reason: "ILLEGAL" };
    }

    const ends = legalEndsForTile(tile, state.line);
    if (ends.length === 0) return { ok: false, reason: "ILLEGAL" };

    let chosenEnd;
    if (ends[0] === "ANY") {
      chosenEnd = "LEFT"; // sentinel value only -- attach() ignores it for an empty line
    } else if (intent.end === undefined) {
      if (ends.length > 1) return { ok: false, reason: "MALFORMED" }; // ambiguous: client must choose
      chosenEnd = ends[0];
    } else {
      if (!ends.includes(intent.end)) return { ok: false, reason: "ILLEGAL" };
      chosenEnd = intent.end;
    }

    const nextLine = attach(state.line, tile, chosenEnd);
    const next = cloneState(state);
    next.line = nextLine;
    next.hands = state.hands.map((h, seat) => (seat === ctx.seat ? h.filter((_, i) => i !== idx) : h));
    next.consecutivePasses = 0;
    next.turn = other(ctx.seat);
    if (next.openingConstraint && next.openingConstraint.seat === ctx.seat) next.openingConstraint = null;
    next.moves.push({ seat: ctx.seat, action: "PLACE", tile, end: chosenEnd });

    return {
      ok: true,
      state: next,
      record: { action: "PLACE", seat: ctx.seat, tile, end: chosenEnd },
      events: [{
        type: "PLACE",
        payload: { seat: ctx.seat, tile, end: chosenEnd, left: nextLine.left, right: nextLine.right },
      }],
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

  /**
   * Hidden-information game -- the ONE thing every other launch game
   * (chess, checkers, Connect Four, XO) does not have to withhold. A
   * spectator, and an opponent, see the public line of play and how many
   * tiles remain in each hand, never what those tiles are. Only the
   * viewing seat's OWN hand (and, on their own opening turn, which exact
   * tile they are forced to open with) is ever included.
   */
  project(state, viewer, seat = null) {
    const base = {
      line: {
        left: state.line.left,
        right: state.line.right,
        tiles: state.line.tiles.map((t) => ({ tile: t.tile, orientation: t.orientation })),
      },
      turn: state.turn,
      handCounts: [state.hands[SEAT_0].length, state.hands[SEAT_1].length],
    };
    if (viewer === "spectator" || seat === null) return base;
    return {
      ...base,
      hand: [...state.hands[seat]],
      mustPlayTile: state.openingConstraint && state.openingConstraint.seat === seat
        ? state.openingConstraint.tile
        : null,
      canPass: !handHasLegalMove(state.hands[seat], state.line),
    };
  },

  /** Evidence for the Fair Play Engine -- the same move-timing-uniformity
   * signal every other plugin in this launch computes. */
  fairPlaySignals(_state, history = {}) {
    const times = history.moveTimesMs ?? [];
    if (times.length < 6) return [];
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((a, t) => a + (t - mean) ** 2, 0) / times.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    if (cv >= 0.15) return [];
    return [{
      id: "dominoes.move_time_uniformity",
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

  /** The replay stores the SEED, not the dealt hands -- anyone re-running
   * it regenerates the identical deal and opening leader, exactly like
   * Speed Math's own serializeReplay(). */
  serializeReplay(state, { initialOnly = false } = {}) {
    return initialOnly ? { seed: state.seed } : { seed: state.seed, moves: state.moves };
  },
};
