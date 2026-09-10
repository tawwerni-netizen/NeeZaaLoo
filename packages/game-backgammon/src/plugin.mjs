/**
 * BackgammonPlugin -- Standard Backgammon, single game, no doubling cube
 * (see backgammon.mjs's own header for the exact, versioned ruleset)
 * expressed against the generic duel-engine plugin contract, the same
 * shape as every other launch game's own plugin.mjs.
 *
 * Structurally closest to Speed Math and Dominoes, not to chess/checkers:
 * the position is not fixed content decided entirely by player choice --
 * the SERVER rolls the dice, from this duel's own private seed, and a
 * client can never supply, predict, or influence a roll (see this file's
 * own `rollDiceFor`/`settleStuckTurns`: a new roll is generated only as
 * part of resolving an already-validated intent, using randomness keyed
 * off `state.seed` and a monotonic `state.rollIndex` -- never `Math.random`,
 * so the exact same sequence of rolls reproduces in a replay/audit given
 * the same recorded intents, exactly like Speed Math's question sequence
 * and Dominoes' deal both do).
 *
 * The intent is `{ from: "BAR" | 0-23, die: 1-6 }` for one leg of
 * movement (entering, an ordinary move, or a bear-off -- the server
 * decides which this is from the position, never the client), or
 * `{ pass: true }` for the one non-movement action, only ever legal when
 * the position genuinely offers no legal action for any remaining die.
 */
import {
  SEAT_0, SEAT_1, POINTS, CHECKERS_PER_SIDE, other,
  initialBoard, pointSeat, isHomeIndex, destinationFor, isBearOffDestination,
  entryDestination, isOpenFor, isLegalBearOff, legalActions, hasAnyLegalAction,
  rollDiceFor, openingRoll,
} from "./backgammon.mjs";

function removeDie(dice, die) {
  const idx = dice.indexOf(die);
  if (idx === -1) return dice;
  return [...dice.slice(0, idx), ...dice.slice(idx + 1)];
}

/** Keep flipping the turn and rolling fresh dice until whoever is now to
 * move actually has a legal action -- see backgammon.mjs's own header on
 * why this can never require a player-submitted intent to progress
 * through (a position with zero legal actions for the side to move is
 * not that side's decision to make). Bounded defensively; a real chain
 * this long is not reachable from legal play. */
function settleStuckTurns(state) {
  let s = state;
  let guard = 0;
  while (!hasAnyLegalAction(s, s.turn) && guard++ < 200) {
    const nextTurn = other(s.turn);
    s = { ...s, turn: nextTurn, dice: rollDiceFor(s.seed, s.rollIndex), rollIndex: s.rollIndex + 1 };
  }
  return s;
}

function freshState(seed) {
  const { leader, dice } = openingRoll(seed);
  return settleStuckTurns({
    seed: String(seed),
    board: initialBoard(),
    bar: [0, 0],
    off: [0, 0],
    turn: leader,
    dice,
    rollIndex: 0,
    moves: [],
  });
}

function cloneState(state) {
  return {
    seed: state.seed,
    board: [...state.board],
    bar: [...state.bar],
    off: [...state.off],
    turn: state.turn,
    dice: [...state.dice],
    rollIndex: state.rollIndex,
    moves: [...state.moves],
  };
}

function outcomeFor(state) {
  const winner =
    state.off[SEAT_0] === CHECKERS_PER_SIDE ? SEAT_0 :
    state.off[SEAT_1] === CHECKERS_PER_SIDE ? SEAT_1 : null;
  if (winner === null) return null;

  const loser = other(winner);
  let multiplier = 1, reason = "BEAR_OFF_ALL";
  if (state.off[loser] === 0) {
    let loserInWinnerHomeOrBar = state.bar[loser] > 0;
    if (!loserInWinnerHomeOrBar) {
      for (let idx = 0; idx < POINTS; idx++) {
        if (isHomeIndex(winner, idx) && pointSeat(state.board[idx]) === loser) {
          loserInWinnerHomeOrBar = true;
          break;
        }
      }
    }
    multiplier = loserInWinnerHomeOrBar ? 3 : 2;
    reason = multiplier === 3 ? "BACKGAMMON" : "GAMMON";
  }
  return { result: winner === SEAT_0 ? "1-0" : "0-1", reason, multiplier };
}

export const BackgammonPlugin = {
  id: "backgammon",
  version: 1,
  turnModel: "ALTERNATING",

  /** Server-side, seeded, deterministic: the opening contest and every
   * roll thereafter are fully determined by `seed`. `publicSeed` is
   * null -- a client holding the seed could predict every future roll,
   * exactly the property Speed Math's own seed withholding protects. */
  createChallenge(seed, _config = {}) {
    return { state: freshState(seed), publicSeed: null };
  },

  rehydrate(initial) {
    return { state: freshState(initial.seed) };
  },

  applyIntent(state, intent, ctx) {
    if (typeof intent !== "object" || intent === null) return { ok: false, reason: "MALFORMED" };
    if (state.turn !== ctx.seat) return { ok: false, reason: "NOT_YOUR_TURN" };
    const seat = ctx.seat;

    if (intent.pass === true) {
      if (Object.keys(intent).length !== 1) return { ok: false, reason: "MALFORMED" };
      if (hasAnyLegalAction(state, seat)) return { ok: false, reason: "ILLEGAL" };

      let next = cloneState(state);
      next.moves.push({ seat, action: "PASS" });
      next.turn = other(seat);
      next.dice = rollDiceFor(next.seed, next.rollIndex);
      next.rollIndex += 1;
      next = settleStuckTurns(next);
      return { ok: true, state: next, record: { action: "PASS", seat }, events: [{ type: "PASS", payload: { seat } }] };
    }

    const { from, die } = intent;
    const extraKeys = Object.keys(intent).filter((k) => k !== "from" && k !== "die");
    if (
      extraKeys.length !== 0 ||
      !Number.isInteger(die) || die < 1 || die > 6 ||
      (from !== "BAR" && !(Number.isInteger(from) && from >= 0 && from < POINTS))
    ) {
      return { ok: false, reason: "MALFORMED" };
    }
    if (!state.dice.includes(die)) return { ok: false, reason: "ILLEGAL" };
    if (state.bar[seat] > 0 && from !== "BAR") return { ok: false, reason: "ILLEGAL" };
    if (from === "BAR" && state.bar[seat] === 0) return { ok: false, reason: "ILLEGAL" };
    if (from !== "BAR" && pointSeat(state.board[from]) !== seat) return { ok: false, reason: "ILLEGAL" };

    let dest = null;
    let bearingOff = false;
    if (from === "BAR") {
      dest = entryDestination(seat, die);
      if (!isOpenFor(seat, dest, state.board)) return { ok: false, reason: "ILLEGAL" };
    } else {
      const raw = destinationFor(seat, from, die);
      if (isBearOffDestination(seat, raw)) {
        if (!isLegalBearOff(seat, from, die, state.board, state.bar)) return { ok: false, reason: "ILLEGAL" };
        bearingOff = true;
      } else {
        if (!isOpenFor(seat, raw, state.board)) return { ok: false, reason: "ILLEGAL" };
        dest = raw;
      }
    }

    let next = cloneState(state);
    if (from === "BAR") next.bar[seat] -= 1;
    else next.board[from] -= seat === SEAT_0 ? 1 : -1;

    let hit = false;
    if (bearingOff) {
      next.off[seat] += 1;
    } else {
      const occupant = pointSeat(next.board[dest]);
      if (occupant !== null && occupant !== seat) {
        next.board[dest] = 0;
        next.bar[other(seat)] += 1;
        hit = true;
      }
      next.board[dest] += seat === SEAT_0 ? 1 : -1;
    }

    next.dice = removeDie(next.dice, die);
    const action = bearingOff ? "BEAR_OFF" : from === "BAR" ? "ENTER" : "MOVE";
    const to = bearingOff ? "OFF" : dest;
    next.moves.push({ seat, action, from, die, to });
    const record = { action, seat, from, die, to, hit };
    const events = [{ type: "CHECKER_MOVED", payload: record }];

    if (next.dice.length > 0 && hasAnyLegalAction(next, seat)) {
      return { ok: true, state: next, record, events };
    }

    next.turn = other(seat);
    next.dice = rollDiceFor(next.seed, next.rollIndex);
    next.rollIndex += 1;
    next = settleStuckTurns(next);

    return { ok: true, state: next, record, events };
  },

  evaluate(state) {
    return outcomeFor(state);
  },

  /** The abstract rating score stays on the same 0/0.5/1 scale every
   * launch game uses -- a gammon/backgammon multiplier changes the
   * outcome's own displayed/staked value (see outcomeFor()'s own
   * `multiplier` field), never the rating points a win is worth. */
  score(state) {
    const outcome = outcomeFor(state);
    if (!outcome) return [0, 0];
    return outcome.result === "1-0" ? [1, 0] : [0, 1];
  },

  /**
   * Perfect-information game, like chess/checkers: the board, bar, off
   * counts, turn and current dice are all public to both players and any
   * spectator. `legalActions` -- the one thing worth withholding -- is
   * included only for the seat that can actually act on it right now.
   */
  project(state, viewer, seat = null) {
    const base = {
      board: [...state.board],
      bar: [...state.bar],
      off: [...state.off],
      turn: state.turn,
      dice: [...state.dice],
    };
    if (viewer === "spectator" || seat === null || seat !== state.turn) return base;
    return { ...base, legalActions: legalActions(state, seat) };
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
      id: "backgammon.move_time_uniformity",
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

  /** The replay stores the SEED, not the roll sequence -- anyone
   * re-running it regenerates the identical opening roll and every
   * subsequent roll as each recorded intent is replayed, exactly like
   * Speed Math's own serializeReplay(). */
  serializeReplay(state, { initialOnly = false } = {}) {
    return initialOnly ? { seed: state.seed } : { seed: state.seed, moves: state.moves };
  },
};
