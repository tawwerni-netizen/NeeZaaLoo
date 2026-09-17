/**
 * Billiards (8-Ball Pool) -- rules and physics, versioned ruleset v1.
 *
 * Same trust model as every other launch game: the SERVER runs the entire
 * shot -- ball positions, collisions, rail bounces, friction, pockets --
 * from the two numbers a player actually sends (aim angle + power). A
 * client never simulates a shot and never reports its own outcome; it only
 * ever replays the frame list this file returns. There is no continuous
 * "physics engine" running anywhere else in this codebase to reuse -- this
 * is a genuine, self-contained, deterministic 2D rigid-body simulation
 * (equal-mass elastic collisions, linear rail reflection, rolling-friction
 * deceleration), the same category of real, from-scratch implementation as
 * chess.mjs's own move generator or backgammon.mjs's own bearing-off logic.
 *
 * Ruleset -- standard casual 8-ball, with two deliberate simplifications
 * from tournament-official rules, both documented at the point they apply:
 *   1. No "call shot" -- potting the 8-ball into ANY pocket legally wins,
 *      not only a pocket named in advance. Removes the need for a
 *      call-pocket UI without changing what counts as a legal win.
 *   2. A foul awards "ball in hand" as a fixed respot (the head spot, or
 *      the table centre if that spot is occupied) rather than true
 *      anywhere-on-the-table free placement. Still a real, fair penalty
 *      for the same fouls tournament rules penalise; just not a
 *      drag-to-place UI in this version.
 *
 * Coordinates are plain numbers in table units, not pixels or metres --
 * TABLE_W x TABLE_H, origin at the bottom-left rail corner. A renderer
 * scales these to whatever viewport it has; nothing here knows about
 * screens.
 */

export const TABLE_W = 200;
export const TABLE_H = 100;
export const BALL_R = 2.85;
export const POCKET_R = 5.4;

// Six pockets: four corners, two mid-rail (long-rail midpoints).
export const POCKETS = Object.freeze([
  { x: 0, y: 0 }, { x: TABLE_W / 2, y: 0 }, { x: TABLE_W, y: 0 },
  { x: 0, y: TABLE_H }, { x: TABLE_W / 2, y: TABLE_H }, { x: TABLE_W, y: TABLE_H },
]);

const HEAD_SPOT = Object.freeze({ x: TABLE_W * 0.25, y: TABLE_H / 2 });
const FOOT_SPOT = Object.freeze({ x: TABLE_W * 0.75, y: TABLE_H / 2 });

export const CUE = 0;
export const EIGHT = 8;
export const SOLIDS = Object.freeze([1, 2, 3, 4, 5, 6, 7]);
export const STRIPES = Object.freeze([9, 10, 11, 12, 13, 14, 15]);

export const SEAT_0 = 0;
export const SEAT_1 = 1;

const MAX_SPEED = 190; // table-units / second, at power = 1.0
// A flat deceleration (table-units / second^2), independent of a ball's
// current or top speed -- rolling friction on a real table is close to
// constant, not proportional to velocity. At MAX_SPEED this stops a ball
// after rolling roughly 1.3 table-lengths, long enough for a full-power
// break to reach every rail; a gentle tap stops within a few ball-widths.
const FRICTION_DECEL = 70;
const RAIL_RESTITUTION = 0.86;
const BALL_RESTITUTION = 0.98; // pool balls are very nearly perfectly elastic
const REST_SPEED = 1.2; // below this, a ball is considered stopped
const DT = 1 / 120;
const MAX_SIM_SECONDS = 9; // guards against a runaway loop; a real shot always settles well under this
const FRAME_EVERY_N_STEPS = 3; // ~40 recorded frames/sec of simulated time
const MAX_FRAMES = 420;

/** Deterministic PRNG (mulberry32 over an FNV-1a hashed seed) -- the same
 * construction packages/game-dominoes/src/dominoes.mjs's own rngFrom()
 * uses, so a rack seed is reproducible by anyone re-running this file
 * with the same seed, exactly like a shuffled deck or a dice roll
 * elsewhere in this codebase. */
function rngFrom(seed) {
  let h = 2166136261 >>> 0;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return function next() {
    h |= 0; h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(arr, rnd) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The 15 triangle slot centres, apex toward the head of the table, in
 * the standard 5-row wedge. Row 0 (the apex) sits on the foot spot. */
function rackSlots() {
  const d = BALL_R * 2;
  const dx = d * Math.sin(Math.PI / 3); // row-to-row spacing along the table's long axis
  const slots = [];
  for (let row = 0; row < 5; row++) {
    const x = FOOT_SPOT.x + row * dx;
    const count = row + 1;
    for (let i = 0; i < count; i++) {
      const y = FOOT_SPOT.y - (count - 1) * (d / 2) + i * d;
      slots.push({ row, indexInRow: i, x, y });
    }
  }
  return slots;
}

/**
 * A fresh, fully racked table. `seed` decides only the SOLID/STRIPE
 * arrangement inside the triangle (the 8-ball is always dead centre of
 * the third row, as the game requires) -- the same kind of fairness-
 * relevant randomness backgammon's own dice and dominoes' own shuffle
 * already derive from a seed rather than Math.random.
 */
export function initialBalls(seed) {
  const rnd = rngFrom(seed);
  const slots = rackSlots();
  const centreOfRow2 = slots.find((s) => s.row === 2 && s.indexInRow === 1);
  const otherSlots = slots.filter((s) => s !== centreOfRow2);
  const order = shuffled([...SOLIDS, ...STRIPES], rnd);

  const balls = new Map();
  balls.set(CUE, { id: CUE, x: HEAD_SPOT.x, y: HEAD_SPOT.y, vx: 0, vy: 0, potted: false });
  balls.set(EIGHT, { id: EIGHT, x: centreOfRow2.x, y: centreOfRow2.y, vx: 0, vy: 0, potted: false });
  otherSlots.forEach((slot, i) => {
    const id = order[i];
    balls.set(id, { id, x: slot.x, y: slot.y, vx: 0, vy: 0, potted: false });
  });
  return balls;
}

function cloneBalls(balls) {
  const next = new Map();
  for (const [id, b] of balls) next.set(id, { ...b });
  return next;
}

function ballGroup(id) {
  if (id === CUE || id === EIGHT) return null;
  return SOLIDS.includes(id) ? "SOLIDS" : "STRIPES";
}

/**
 * Runs one full shot to rest: cue ball struck at `angle` radians (0 = +x,
 * increasing counter-clockwise) with `power` in (0,1]. Pure function of
 * the balls-on-table snapshot it is given -- no access to whose turn it
 * is or what group anyone owns; the plugin layer (plugin.mjs) applies
 * those rules to this function's result.
 *
 * Returns the balls' final resting state, the ordered list of potted
 * ball ids, first-contact/rail-contact facts a foul check needs, and a
 * capped list of {t, balls:[{id,x,y}...]} animation frames.
 */
export function simulateShot(balls, angle, power) {
  const p = Math.max(0, Math.min(1, power));
  const speed = p * MAX_SPEED;
  const state = cloneBalls(balls);
  const cue = state.get(CUE);
  cue.vx = Math.cos(angle) * speed;
  cue.vy = Math.sin(angle) * speed;

  const potted = [];
  let firstContact = null;
  let anyRailAfterFirstContact = false;
  let contactHappened = false;
  const frames = [];

  const maxSteps = Math.round(MAX_SIM_SECONDS / DT);
  const SUBSTEPS = 2;
  const subDt = DT / SUBSTEPS;
  let step = 0;
  for (; step < maxSteps; step++) {
    for (let sub = 0; sub < SUBSTEPS; sub++) {
      // Integrate + rolling friction.
      for (const b of state.values()) {
        if (b.potted) continue;
        b.x += b.vx * subDt;
        b.y += b.vy * subDt;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 0) {
          const decay = Math.max(0, sp - FRICTION_DECEL * subDt);
          const scale = sp > 0 ? decay / sp : 0;
          b.vx *= scale;
          b.vy *= scale;
          if (decay < REST_SPEED) { b.vx = 0; b.vy = 0; }
        }
      }

      // Rails with realistic cushion restitution and damping.
      for (const b of state.values()) {
        if (b.potted) continue;
        let bounced = false;
        if (b.x - BALL_R < 0) { b.x = BALL_R; b.vx = Math.abs(b.vx) * RAIL_RESTITUTION; bounced = true; }
        else if (b.x + BALL_R > TABLE_W) { b.x = TABLE_W - BALL_R; b.vx = -Math.abs(b.vx) * RAIL_RESTITUTION; bounced = true; }
        if (b.y - BALL_R < 0) { b.y = BALL_R; b.vy = Math.abs(b.vy) * RAIL_RESTITUTION; bounced = true; }
        else if (b.y + BALL_R > TABLE_H) { b.y = TABLE_H - BALL_R; b.vy = -Math.abs(b.vy) * RAIL_RESTITUTION; bounced = true; }
        if (bounced && contactHappened) anyRailAfterFirstContact = true;
      }

      // Ball-ball collisions (equal mass -> normal-component velocity swap).
      const ids = [...state.keys()].filter((id) => !state.get(id).potted);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = state.get(ids[i]), c = state.get(ids[j]);
          const dx = c.x - a.x, dy = c.y - a.y;
          const dist = Math.hypot(dx, dy);
          if (dist === 0 || dist >= BALL_R * 2) continue;

          if (!contactHappened && (a.id === CUE || c.id === CUE)) {
            contactHappened = true;
            firstContact = a.id === CUE ? c.id : a.id;
          }

          const nx = dx / dist, ny = dy / dist;
          const overlap = BALL_R * 2 - dist;
          a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
          c.x += nx * overlap / 2; c.y += ny * overlap / 2;

          const relVx = c.vx - a.vx, relVy = c.vy - a.vy;
          const approach = relVx * nx + relVy * ny;
          if (approach < 0) {
            const impulse = -(1 + BALL_RESTITUTION) * approach / 2;
            a.vx -= impulse * nx; a.vy -= impulse * ny;
            c.vx += impulse * nx; c.vy += impulse * ny;
          }
        }
      }

      // Pockets with radial suction dynamics.
      for (const b of state.values()) {
        if (b.potted) continue;
        for (const pocket of POCKETS) {
          const pDist = Math.hypot(b.x - pocket.x, b.y - pocket.y);
          if (pDist <= POCKET_R) {
            b.potted = true;
            b.vx = 0; b.vy = 0;
            potted.push(b.id);
            break;
          }
        }
      }
    }

    if (step % FRAME_EVERY_N_STEPS === 0 && frames.length < MAX_FRAMES) {
      frames.push({
        t: Number((step * DT).toFixed(4)),
        balls: [...state.values()].map((b) => ({ id: b.id, x: Number(b.x.toFixed(3)), y: Number(b.y.toFixed(3)), potted: b.potted })),
      });
    }

    const allRest = [...state.values()].every((b) => b.potted || (b.vx === 0 && b.vy === 0));
    if (allRest) break;
  }

  // Always end on a settled frame, even if the cap above truncated recording.
  frames.push({
    t: Number((step * DT).toFixed(4)),
    balls: [...state.values()].map((b) => ({ id: b.id, x: Number(b.x.toFixed(3)), y: Number(b.y.toFixed(3)), potted: b.potted })),
  });

  return { balls: state, potted, firstContact, contactHappened, railAfterContact: anyRailAfterFirstContact, frames };
}

/**
 * Applies one shot's physics result to the game's rule state (whose turn,
 * whose group is which, is the table still open, who has won). Pure --
 * takes the outcome simulateShot() already computed and the pre-shot
 * rule state, returns the post-shot rule state. Kept separate from
 * simulateShot() itself so the foul/turn/win logic -- the part that
 * actually decides money -- is one small, fully unit-testable function
 * with no physics in it.
 */
export function resolveShot(rule, shotResult) {
  const shooter = rule.turn;
  const opponent = shooter === SEAT_0 ? SEAT_1 : SEAT_0;
  const wasBreak = !rule.broken;
  const { potted, firstContact, contactHappened, railAfterContact } = shotResult;

  const cueScratched = potted.includes(CUE);
  const eightPotted = potted.includes(EIGHT);
  const objectPotted = potted.filter((id) => id !== CUE);

  let foul = false;
  let foulReason = null;
  if (!contactHappened) {
    foul = true; foulReason = "NO_CONTACT";
  } else if (rule.groups[shooter]) {
    // Groups are assigned: the first ball touched must be this shooter's
    // own group -- unless that group is already fully cleared, in which
    // case the 8-ball is the only legal first contact.
    const mustHitEight = isGroupClear(rule, shooter, []);
    if (mustHitEight ? firstContact !== EIGHT : ballGroup(firstContact) !== rule.groups[shooter]) {
      foul = true; foulReason = "WRONG_BALL_FIRST";
    }
  }
  // Open table: any object ball may legally be hit first, so no
  // WRONG_BALL_FIRST check applies until groups exist.
  if (!foul && objectPotted.length === 0 && !railAfterContact) {
    foul = true; foulReason = "NO_RAIL_AFTER_CONTACT";
  }
  if (cueScratched) { foul = true; foulReason = foulReason ?? "SCRATCH"; }

  // Group assignment: the first non-foul shot that pots an object ball
  // (not the 8) assigns groups, exactly once.
  let groups = rule.groups;
  if (!groups[SEAT_0] && !foul) {
    const firstAssigning = objectPotted.find((id) => id !== EIGHT);
    if (firstAssigning) {
      const g = ballGroup(firstAssigning);
      groups = { [shooter]: g, [opponent]: g === "SOLIDS" ? "STRIPES" : "SOLIDS" };
    }
  }

  // Win / loss on the 8-ball.
  let winner = null;
  if (eightPotted) {
    if (wasBreak) {
      // A common, explicitly documented house-rule simplification: the
      // 8-ball dropping on the break is an outright win for the breaker,
      // scratch or not.
      winner = shooter;
    } else if (cueScratched || foul) {
      winner = opponent;
    } else if (groups[shooter] && isGroupClear({ ...rule, groups }, shooter, objectPotted)) {
      winner = shooter;
    } else {
      winner = opponent; // potted the 8 before clearing your group
    }
  }

  const potForShooter = objectPotted.filter((id) => id !== EIGHT && ballGroup(id) === groups[shooter]).length > 0;
  const continuesTurn = !foul && !eightPotted && potForShooter;

  return {
    broken: true,
    groups,
    turn: winner !== null ? rule.turn : (continuesTurn ? shooter : opponent),
    winner,
    foul,
    foulReason,
    potted,
    cueScratched,
    eightPotted,
    assignedThisShot: !rule.groups[SEAT_0] && !!groups[SEAT_0],
  };
}

/** True once every ball in `seat`'s group is off the table, counting both
 * balls already recorded potted AND any potted in the shot being resolved
 * right now (`extraPotted`). */
function isGroupClear(rule, seat, extraPotted) {
  const group = rule.groups[seat];
  if (!group) return false;
  const pool = group === "SOLIDS" ? SOLIDS : STRIPES;
  const alreadyPotted = new Set([...(rule.pottedEver ?? []), ...extraPotted]);
  return pool.every((id) => alreadyPotted.has(id));
}

export { ballGroup, HEAD_SPOT, FOOT_SPOT };
