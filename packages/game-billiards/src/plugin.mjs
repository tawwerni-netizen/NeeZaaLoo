/**
 * BilliardsPlugin -- 8-Ball Pool (see billiards.mjs's own header for the
 * exact, versioned ruleset and its physics) expressed against the generic
 * duel-engine plugin contract, the same shape as every other launch
 * game's own plugin.mjs.
 *
 * The intent is a single shot: `{ angle: number, power: number }` (angle
 * in radians, power in (0,1]). applyIntent runs the ENTIRE shot -- physics
 * simulation, foul detection, group assignment, win/loss -- server-side,
 * in one call, exactly like every other move in this codebase: a client
 * proposes an angle and a power, never a result.
 */
import { simulateShot, resolveShot, initialBalls, CUE, SOLIDS, STRIPES, SEAT_0, SEAT_1, HEAD_SPOT, TABLE_W, TABLE_H } from "./billiards.mjs";

// Every real duel is already bounded by its own clock (a player who keeps
// foul-shooting burns their own time and eventually flags), so this is
// only a defense-in-depth cap against an unbounded shots array -- a
// pathological loop or a compromised client hammering intents outside
// normal clock enforcement -- never something ordinary play, even very
// weak play, should approach.
const MAX_SHOTS_NO_PROGRESS = 1000;

function cloneState(state) {
  return {
    balls: new Map([...state.balls].map(([id, b]) => [id, { ...b }])),
    turn: state.turn,
    groups: { ...state.groups },
    broken: state.broken,
    pottedEver: [...state.pottedEver],
    shots: [...state.shots],
    ballInHandFor: state.ballInHandFor,
  };
}

function freshState(seed) {
  return {
    balls: initialBalls(seed),
    turn: SEAT_0,
    groups: {},
    broken: false,
    pottedEver: [],
    shots: [],
    ballInHandFor: null,
  };
}

/** A safe, deterministic respot for "ball in hand": the head spot if it's
 * clear, otherwise the table centre, otherwise (astronomically unlikely --
 * every ball would have to already occupy both) the head spot regardless.
 * Real anywhere-on-the-table placement is out of scope for this version;
 * see billiards.mjs's own header. */
function respotCueBall(balls) {
  const clearAt = (x, y) => [...balls.values()].every((b) => b.potted || b.id === CUE || Math.hypot(b.x - x, b.y - y) > 6);
  const spot = clearAt(HEAD_SPOT.x, HEAD_SPOT.y) ? HEAD_SPOT : { x: TABLE_W / 2, y: TABLE_H / 2 };
  const cue = balls.get(CUE);
  cue.x = spot.x; cue.y = spot.y; cue.vx = 0; cue.vy = 0; cue.potted = false;
}

export const BilliardsPlugin = {
  id: "billiards",
  version: 1,
  turnModel: "ALTERNATING",

  createChallenge(seed, _config = {}) {
    return { state: freshState(seed ?? "billiards"), publicSeed: null };
  },

  /** The rack layout depends on a seed (which coin lands where inside the
   * triangle) -- persisted, exactly like Dominoes' shuffle and
   * Backgammon's dice, so a fresh duel is reproducible from this alone. */
  matchmakingDefaults(seed, _config = {}) {
    return { initialState: { seed: seed ?? "billiards" } };
  },

  rehydrate(initial) {
    return { state: freshState(initial?.seed ?? "billiards") };
  },

  applyIntent(state, intent, ctx) {
    if (typeof intent !== "object" || intent === null) return { ok: false, reason: "MALFORMED" };
    const { angle, power } = intent;
    if (typeof angle !== "number" || !Number.isFinite(angle)) return { ok: false, reason: "MALFORMED" };
    if (typeof power !== "number" || !Number.isFinite(power) || power <= 0 || power > 1) return { ok: false, reason: "MALFORMED" };
    if (Object.keys(intent).length !== 2) return { ok: false, reason: "MALFORMED" };
    if (state.turn !== ctx.seat) return { ok: false, reason: "NOT_YOUR_TURN" };
    if (state.shots.length >= MAX_SHOTS_NO_PROGRESS) return { ok: false, reason: "ILLEGAL" };

    const next = cloneState(state);
    const shotResult = simulateShot(next.balls, angle, power);
    const ruleBefore = { turn: next.turn, groups: next.groups, broken: next.broken, pottedEver: next.pottedEver };
    const resolved = resolveShot(ruleBefore, shotResult);

    // Commit the physics result: potted balls leave the table for good.
    next.balls = shotResult.balls;
    next.groups = resolved.groups;
    next.broken = true;
    next.pottedEver = [...next.pottedEver, ...resolved.potted.filter((id) => id !== CUE)];
    // Prune frames on older shots to keep memory footprint bounded
    if (next.shots.length > 0) {
      delete next.shots[next.shots.length - 1].frames;
    }
    next.shots.push({
      seat: ctx.seat, angle, power, potted: resolved.potted, foul: resolved.foul, foulReason: resolved.foulReason,
      winner: resolved.winner,
      winReason: resolved.winner === null ? null
        : (resolved.eightPotted && !resolved.foul && !resolved.cueScratched && state.shots.length === 0 ? "EIGHT_BALL_ON_BREAK"
          : resolved.eightPotted && (resolved.foul || resolved.cueScratched) ? "EIGHT_BALL_FOUL"
          : "EIGHT_BALL_CLEARED"),
      frames: shotResult.frames,
    });

    if (resolved.cueScratched) respotCueBall(next.balls);

    if (resolved.winner === null) {
      next.turn = resolved.turn;
      next.ballInHandFor = resolved.foul ? (state.turn === SEAT_0 ? SEAT_1 : SEAT_0) : null;
    } else {
      next.ballInHandFor = null;
    }

    const events = [{
      type: "SHOT",
      payload: {
        angle, power, potted: resolved.potted, foul: resolved.foul, foulReason: resolved.foulReason,
        assignedGroups: resolved.assignedThisShot ? resolved.groups : null,
        frames: shotResult.frames,
      },
    }];

    return {
      ok: true,
      state: next,
      record: { angle, power, potted: resolved.potted, foul: resolved.foul },
      events,
    };
  },

  /** duel-engine's own runIntent() calls this immediately after every
   * accepted applyIntent, reading ONLY `state` -- so the winner (and why)
   * has to be reconstructible from state alone, not from a value
   * applyIntent happened to compute and hand back in the same call. The
   * last shot record already carries exactly that (resolveShot's own
   * winner/winReason, computed once, in billiards.mjs), so this is a
   * direct read, never a re-simulation. */
  evaluate(state) {
    const last = state.shots[state.shots.length - 1];
    if (!last || last.winner === null || last.winner === undefined) return null;
    return { result: last.winner === SEAT_0 ? "1-0" : "0-1", reason: last.winReason };
  },

  score(state) {
    const outcome = this.evaluate(state);
    if (!outcome) return [0, 0];
    return outcome.result === "1-0" ? [1, 0] : [0, 1];
  },

  /** Both players and spectators see the same table -- perfect information,
   * like chess and checkers. `ballInHandFor` tells the client whether the
   * NEXT shot from that seat is a post-foul respot (cue ball already
   * moved server-side; nothing further for the client to do but aim). */
  project(state, _viewer) {
    return {
      balls: [...state.balls.values()].filter((b) => !b.potted).map((b) => ({ id: b.id, x: b.x, y: b.y })),
      pottedEver: [...state.pottedEver],
      turn: state.turn,
      groups: state.groups,
      broken: state.broken,
      ballInHandFor: state.ballInHandFor,
      lastShot: state.shots.length ? state.shots[state.shots.length - 1] : null,
      shotCount: state.shots.length,
    };
  },

  /** Fair-play signal: the same move-timing-uniformity check every other
   * launch game's plugin computes (see checkers/plugin.mjs's own header),
   * over shot timestamps instead of move timestamps. Billiards has no
   * chess-style engine-correlation equivalent at launch either. */
  fairPlaySignals(_state, history = {}) {
    const times = history.moveTimesMs ?? [];
    if (times.length < 8) return [];
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((a, t) => a + (t - mean) ** 2, 0) / times.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    if (cv >= 0.15) return [];
    return [{
      id: "billiards.shot_time_uniformity",
      kind: "TIMING",
      strength: Math.min(1, (0.15 - cv) / 0.15),
      confidence: Math.min(1, times.length / 40),
      observedValue: { coefficientOfVariation: Number(cv.toFixed(4)), samples: times.length },
      baseline: { expectedCvAbove: 0.15 },
      explanation:
        `Shot times varied by only ${(cv * 100).toFixed(1)}% of their mean across ` +
        `${times.length} shots. Human play normally varies far more.`,
      detectorVersion: 1,
    }];
  },

  serializeReplay(state, { initialOnly = false } = {}) {
    return initialOnly ? {} : { shots: state.shots.map(({ angle, power }) => ({ angle, power })) };
  },
};

export { SOLIDS, STRIPES, SEAT_0, SEAT_1 };
