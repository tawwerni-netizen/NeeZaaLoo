/**
 * Server-authoritative clock.
 *
 * The single rule this file exists to enforce: elapsed time is derived only
 * from server timestamps. The client never reports how long it thought it took,
 * so a client that stalls, lags, disconnects, or lies cannot gain time.
 *
 * A consequence worth stating plainly, because it is a design decision and not
 * an oversight: a disconnected player's clock keeps running. Time spent offline
 * is time spent. Anything else makes "pull the ethernet cable when you are
 * losing on time" a winning strategy.
 */

export const FLAG = "FLAG";

/**
 * @param {{initialMs:number, incrementMs?:number}} tc
 * @param {number} startedAtMs server time at which the first player's clock starts
 * @param {0|1} initialToMove which seat's clock starts running. Defaults to
 *   seat 0 -- correct for every ALTERNATING game whose own opening position
 *   always hands the first move to seat 0 (chess, checkers, Connect Four,
 *   XO, by each of those plugins' own convention). A game whose real first
 *   mover can be seat 1 instead -- Dominoes, where whoever holds the
 *   highest double leads -- MUST pass its own challenge.state.turn here;
 *   otherwise the clock ticks against the wrong player from the first
 *   second of the duel, independently of (and silently out of sync with)
 *   the plugin's own `state.turn`, which is what actually decides whose
 *   intent is accepted.
 */
export function createClock(tc, startedAtMs, initialToMove = 0) {
  if (!Number.isFinite(tc.initialMs) || tc.initialMs <= 0) {
    throw new TypeError("initialMs must be a positive number");
  }
  return {
    initialMs: tc.initialMs,
    incrementMs: tc.incrementMs ?? 0,
    remaining: [tc.initialMs, tc.initialMs], // [white, black]
    toMove: initialToMove,
    turnStartedAt: startedAtMs,
  };
}

/**
 * Charge the player to move for the time consumed, then hand over --
 * unless `keepMover` says this ply did not actually end their turn.
 *
 * `keepMover` exists for the same reason `createClock`'s own
 * `initialToMove` does: this clock has no idea what a "turn" means to a
 * given game, only duel.mjs's own runIntent does (by comparing the
 * plugin's `state.turn` before and after). Checkers' mandatory multi-jump
 * and Backgammon's multi-die turn (see game-backgammon/src/plugin.mjs's
 * own header) both accept MULTIPLE intents from the SAME seat before the
 * turn actually passes -- charging elapsed time against that seat on
 * every one of those intents is still correct (thinking time is thinking
 * time), but flipping `toMove` to the opponent after the first hop/die,
 * regardless, handed the clock -- and the right to move next -- to the
 * WRONG player. `keepMover: true` charges the elapsed time and resets the
 * turn clock without flipping `toMove` or adding `incrementMs`: the
 * increment is a handoff bonus for completing a turn, not a per-ply one,
 * so a four-die double turn cannot farm four increments for what is,
 * from the clock's perspective, one turn.
 *
 * Returns { flagged, byIndex, remaining }. When `flagged` is true the mover ran
 * out before completing the move: the move does not count and the clock is left
 * at zero for that player.
 */
export function applyMove(clock, serverTimeMs, { keepMover = false } = {}) {
  const i = clock.toMove;
  const elapsed = serverTimeMs - clock.turnStartedAt;

  if (elapsed < 0) {
    // Server time went backwards. Refuse rather than silently gift time.
    throw new RangeError("clock: server time moved backwards");
  }

  const left = clock.remaining[i] - elapsed;

  if (left < 0) {
    clock.remaining[i] = 0;
    return { flagged: true, byIndex: i, remaining: [...clock.remaining] };
  }

  clock.remaining[i] = keepMover ? left : left + clock.incrementMs;
  clock.toMove = keepMover ? i : i ^ 1;
  clock.turnStartedAt = serverTimeMs;
  return { flagged: false, byIndex: null, remaining: [...clock.remaining] };
}

/**
 * Has the player to move already run out, without having moved?
 * This is what the timeout sweeper asks; it never depends on a client message.
 */
export function checkFlag(clock, serverTimeMs) {
  const i = clock.toMove;
  const elapsed = serverTimeMs - clock.turnStartedAt;
  return elapsed >= clock.remaining[i] ? { flagged: true, byIndex: i } : { flagged: false, byIndex: null };
}

/** Display-only projection. The client renders from this and never authors it. */
export function readClock(clock, serverTimeMs) {
  const i = clock.toMove;
  const elapsed = Math.max(0, serverTimeMs - clock.turnStartedAt);
  const live = [...clock.remaining];
  live[i] = Math.max(0, live[i] - elapsed);
  return { remaining: live, toMove: i };
}

/* =============================================================================
 * SHARED CLOCK
 *
 * Chess is alternating: one clock runs at a time and the mover is charged.
 * Speed Math is simultaneous: both players race the same deadline, and nobody
 * is "to move". A shared clock is therefore a different object, not an
 * alternating clock with a flag -- conflating them is how "whose turn is it"
 * leaks into a game that has no turns.
 * ========================================================================== */

export function createSharedClock({ durationMs }, startedAtMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new TypeError("durationMs must be a positive number");
  }
  return { model: "SHARED", durationMs, startedAt: startedAtMs, toMove: null };
}

export const sharedRemaining = (clock, serverTimeMs) =>
  Math.max(0, clock.durationMs - (serverTimeMs - clock.startedAt));

export const sharedExpired = (clock, serverTimeMs) =>
  serverTimeMs - clock.startedAt >= clock.durationMs;

/** Display projection for a shared clock: one number, the same for both. */
export const readSharedClock = (clock, serverTimeMs) => ({
  model: "SHARED",
  remainingMs: sharedRemaining(clock, serverTimeMs),
  durationMs: clock.durationMs,
});
