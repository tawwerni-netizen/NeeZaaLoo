/**
 * Two deliberately trivial, deliberately DIFFERENT plugins, used only to
 * drive the duel engine directly.
 *
 * Chess and Speed Math are both proven against the engine already, but they
 * are also both complex enough that a bug in the engine's own contract can
 * hide behind a bug (or a compensating assumption) in the plugin. These
 * fixtures exist to be the "third game": neither is chess-shaped nor
 * speed-math-shaped, so a property that only holds by coincidence for the
 * first two games has nowhere to hide here.
 */

/** ALTERNATING: add 1-3 to a running total; first to reach the target wins. */
export const TARGET = 10;

export function makeCounterPlugin({ emitMilestones = false } = {}) {
  return {
    id: "counter",
    version: 1,
    turnModel: "ALTERNATING",

    createChallenge(seed, config = {}) {
      return { state: { total: 0, lastSeat: null }, publicSeed: null };
    },

    rehydrate(initial) {
      return { state: { total: initial.total ?? 0, lastSeat: null } };
    },

    applyIntent(state, intent, ctx) {
      if (!Number.isInteger(intent) || intent < 1 || intent > 3) {
        return { ok: false, reason: "MALFORMED" };
      }
      const total = state.total + intent;
      const events = [{ type: "ADDED", payload: { seat: ctx.seat, amount: intent, total } }];
      // A plugin may emit more than one event from a single accepted intent
      // (chess does this too: a checkmating move produces both MOVE and
      // DUEL_COMPLETED-adjacent signals) -- this fixture makes it an easy
      // knob to turn on, rather than something only chess happens to do.
      if (emitMilestones && total % 5 === 0 && total !== 0) {
        events.push({ type: "MILESTONE", payload: { total } });
      }
      return {
        ok: true,
        state: { total, lastSeat: ctx.seat },
        record: { seat: ctx.seat, amount: intent },
        events,
      };
    },

    evaluate(state) {
      if (state.total < TARGET) return null;
      return { result: state.lastSeat === 0 ? "1-0" : "0-1", reason: "TARGET_REACHED" };
    },

    score(state) {
      return [state.total, 0];
    },

    project(state) {
      return { total: state.total };
    },

    fairPlaySignals() {
      return {};
    },

    serializeReplay(state, { initialOnly } = {}) {
      return initialOnly ? { total: 0 } : { total: state.total };
    },
  };
}

/** SIMULTANEOUS: both seats accrue points independently; no turns at all. */
export const CAP = 15;

export function makeRacePlugin() {
  return {
    id: "race",
    version: 1,
    turnModel: "SIMULTANEOUS",

    createChallenge(seed, config = {}) {
      return { state: { scores: [0, 0] }, publicSeed: null };
    },

    rehydrate(initial) {
      return { state: { scores: [0, 0] } };
    },

    applyIntent(state, intent, ctx) {
      if (typeof intent !== "object" || intent === null || !Number.isInteger(intent.points)
          || intent.points < 0 || intent.points > 5) {
        return { ok: false, reason: "MALFORMED" };
      }
      const scores = [...state.scores];
      scores[ctx.seat] += intent.points;
      return {
        ok: true,
        state: { scores },
        record: { seat: ctx.seat, points: intent.points },
        events: [{ type: "SCORED", payload: { seat: ctx.seat, points: intent.points } }],
      };
    },

    evaluate(state) {
      if (Math.max(...state.scores) < CAP) return null;
      const [a, b] = state.scores;
      return { result: a === b ? "1/2-1/2" : (a > b ? "1-0" : "0-1"), reason: "CAP_REACHED" };
    },

    /** Required for any SIMULTANEOUS plugin -- registerPlugin() enforces this. */
    outcomeOnExpiry(state) {
      const [a, b] = state.scores;
      return { result: a === b ? "1/2-1/2" : (a > b ? "1-0" : "0-1"), reason: "TIME_EXPIRED" };
    },

    score(state) {
      return [...state.scores];
    },

    project(state) {
      return { scores: [...state.scores] };
    },

    fairPlaySignals() {
      return {};
    },

    serializeReplay(state, { initialOnly } = {}) {
      return initialOnly ? {} : { scores: [...state.scores] };
    },
  };
}
