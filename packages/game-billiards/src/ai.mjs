/**
 * The Billiards AI adapter -- same shape and same contract as every other
 * launch game's own ai.mjs (packages/game-checkers/src/ai.mjs's own
 * header describes it): pure, bounded, deterministic from a seed, and
 * never anything but a legal-shaped intent -- the platform revalidates it
 * through the ordinary applyIntent path regardless.
 *
 * There is no negamax search here the way chess/checkers use one: a
 * billiards "move" is two continuous numbers (angle, power), not a
 * discrete choice from a short legal-move list, so this is real shot
 * geometry instead -- for each ball this seat may legally play, and each
 * of the six pockets, compute the "ghost ball" aim point a cue ball must
 * reach to send that ball toward that pocket, then take the
 * straightest (easiest) one available. Difficulty controls how far the
 * actual aim is allowed to drift from that ideal point, and how much
 * power varies -- not search depth, since there is no search.
 */
import { CUE, EIGHT, SOLIDS, STRIPES, BALL_R, POCKETS, TABLE_W, TABLE_H, SEAT_0 } from "./billiards.mjs";

export const Difficulty = Object.freeze({
  EASY: "EASY", MEDIUM: "MEDIUM", HARD: "HARD", EXPERT: "EXPERT",
});

// Radians of random aim error (applied as a uniform offset) and power jitter.
const TIER = Object.freeze({
  [Difficulty.EASY]:   { angleNoise: 0.34, powerNoise: 0.30, missChance: 0.30 },
  [Difficulty.MEDIUM]: { angleNoise: 0.16, powerNoise: 0.18, missChance: 0.12 },
  [Difficulty.HARD]:   { angleNoise: 0.06, powerNoise: 0.10, missChance: 0.03 },
  [Difficulty.EXPERT]: { angleNoise: 0.015, powerNoise: 0.05, missChance: 0 },
});

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

function legalTargets(ballsOnTable, seat, groups) {
  const onTable = new Set(ballsOnTable.map((b) => b.id));
  const group = groups[seat];
  if (!group) return [...onTable].filter((id) => id !== CUE); // open table
  const pool = group === "SOLIDS" ? SOLIDS : STRIPES;
  const remaining = pool.filter((id) => onTable.has(id));
  return remaining.length > 0 ? remaining : (onTable.has(EIGHT) ? [EIGHT] : []);
}

/** For target ball `t` and `pocket`, the point the cue ball's CENTRE must
 * occupy at the moment of contact to send `t` toward that pocket's
 * centre (straight-line approximation -- real English/throw is out of
 * scope, matching billiards.mjs's own no-spin simplification). */
function ghostBallSpot(target, pocket) {
  const dx = target.x - pocket.x, dy = target.y - pocket.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist, uy = dy / dist;
  return { x: target.x + ux * BALL_R * 2, y: target.y + uy * BALL_R * 2 };
}

function inBounds(p) {
  return p.x > 0 && p.x < TABLE_W && p.y > 0 && p.y < TABLE_H;
}

/** True if `ball` sits close enough to the segment cue->ghost to block a
 * straight cue-ball path to it -- a real obstruction check, not just
 * geometry to the target. Without this the AI routinely "aimed" at a ball
 * buried behind others in the still-racked cluster, the cue ball caromed
 * off whatever was actually in the way first, and the shot went nowhere
 * near the intended pocket line. */
function pathBlocked(cue, ghost, others) {
  const dx = ghost.x - cue.x, dy = ghost.y - cue.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return false;
  const ux = dx / len, uy = dy / len;
  for (const b of others) {
    const px = b.x - cue.x, py = b.y - cue.y;
    const proj = px * ux + py * uy;
    if (proj <= 0.5 || proj >= len - 0.5) continue; // not between cue and ghost
    const perp = Math.abs(px * uy - py * ux);
    if (perp < BALL_R * 1.9) return true;
  }
  return false;
}

export function createBilliardsAiAdapter() {
  return {
    /**
     * `state` here is the REAL internal engine state -- packages/realtime/
     * src/gateway.mjs's own AI scheduling calls `adapter.chooseAction(
     * duel.state, ...)` directly, the same raw state applyIntent itself
     * works on, never the client-facing project() view. `state.balls` is
     * therefore the Map keyed by ball id (see plugin.mjs's own freshState),
     * including already-potted balls, which this reads around.
     */
    chooseAction(state, seat, difficulty, _deadlineMs = 1500, seed = "ai") {
      const tier = TIER[difficulty] ?? TIER[Difficulty.MEDIUM];
      const rnd = rngFrom(`${seed}:${state.shots?.length ?? 0}`);
      const onTable = [...state.balls.values()].filter((b) => !b.potted);
      const cue = onTable.find((b) => b.id === CUE);
      if (!cue) return null;

      const targets = legalTargets(onTable, seat, state.groups).map((id) => onTable.find((b) => b.id === id)).filter(Boolean);

      let best = null; // {angle, dist, cutSeverity}
      for (const target of targets) {
        const obstructors = onTable.filter((b) => b.id !== CUE && b.id !== target.id);
        for (const pocket of POCKETS) {
          const ghost = ghostBallSpot(target, pocket);
          if (!inBounds(ghost)) continue;
          const toGhost = Math.atan2(ghost.y - cue.y, ghost.x - cue.x);
          const toPocketFromTarget = Math.atan2(pocket.y - target.y, pocket.x - target.x);
          const cueToTarget = Math.atan2(target.y - cue.y, target.x - cue.x);
          // How severe a cut this is -- a near-zero difference is a
          // straight-in shot (easy); near-perpendicular is nearly
          // impossible to pot. Balls whose cut is too extreme are
          // filtered out entirely, same as a real player would not
          // attempt them.
          let cut = Math.abs(cueToTarget - toPocketFromTarget);
          if (cut > Math.PI) cut = 2 * Math.PI - cut;
          if (cut > (Math.PI / 2) * 0.92) continue;
          // A real line-of-sight check: skip this target/pocket combo if
          // another ball sits between the cue ball and the aim point, or
          // between the target and the pocket it would need to travel to.
          if (pathBlocked(cue, ghost, obstructors)) continue;
          if (pathBlocked(target, pocket, obstructors)) continue;
          const dist = Math.hypot(ghost.x - cue.x, ghost.y - cue.y);
          if (!best || cut < best.cutSeverity) best = { angle: toGhost, dist, cutSeverity: cut };
        }
      }

      // No clean shot found for any legal target (a snookered position,
      // or an open table with nothing reachable) -- aim roughly at the
      // nearest legal ball so the shot is still on-theme rather than
      // wildly random, and let the miss/foul rules handle the rest,
      // exactly as a real weaker player misjudging a hard position would.
      if (!best) {
        const nearest = targets.length
          ? targets.reduce((a, b) => (Math.hypot(a.x - cue.x, a.y - cue.y) <= Math.hypot(b.x - cue.x, b.y - cue.y) ? a : b))
          : null;
        const angle = nearest ? Math.atan2(nearest.y - cue.y, nearest.x - cue.x) : rnd() * Math.PI * 2;
        return { angle: angle + (rnd() - 0.5) * 2 * tier.angleNoise * 2, power: 0.5 + (rnd() - 0.5) * tier.powerNoise };
      }

      let angle = best.angle;
      // A deliberate miss (lower difficulty only) -- a real weaker player
      // sometimes just mis-cues, not merely "aims slightly off" on every
      // shot; this occasionally throws the aim far wider than the normal
      // noise band.
      const wildMiss = rnd() < tier.missChance;
      const noise = wildMiss ? tier.angleNoise * 4 : tier.angleNoise;
      angle += (rnd() - 0.5) * 2 * noise;

      const idealPower = Math.min(1, 0.35 + best.dist / TABLE_W);
      const power = Math.max(0.12, Math.min(1, idealPower + (rnd() - 0.5) * tier.powerNoise));

      return { angle, power };
    },
  };
}

export { SEAT_0 };
