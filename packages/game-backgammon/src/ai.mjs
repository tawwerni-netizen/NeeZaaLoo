/**
 * The Backgammon AI adapter -- same contract as every other launch game's
 * own ai.mjs: pure (given its inputs), and never anything but a legal
 * action (the platform revalidates it through the ordinary INTENT path
 * regardless). Called once per die, exactly like Checkers' own adapter
 * is called once per hop of a mandatory multi-jump -- see
 * packages/realtime/src/gateway.mjs's own scheduleBotMoveIfNeeded, which
 * reschedules the bot automatically for as long as the clock's own
 * `toMove` still names it, with no special-casing needed here for
 * "still has dice left this turn".
 *
 * Search: a full rollout/equity search is out of scope for launch --
 * instead a hand-weighted heuristic over the CURRENT position, the same
 * spirit as every other adapter in this codebase's own difficulty
 * ladder: bear off when possible, hit an exposed blot, prefer landing on
 * a point that becomes SAFE (two or more of your own checkers) over one
 * that leaves a lone checker exposed, and otherwise make forward
 * progress. Lower tiers add a seeded chance of playing a random legal
 * action instead of the heuristic's best one -- never `Math.random`.
 */
import { legalActions, pointSeat, rngFrom } from "./backgammon.mjs";

export const Difficulty = Object.freeze({
  EASY: "EASY", MEDIUM: "MEDIUM", HARD: "HARD", EXPERT: "EXPERT",
});

const TIER = Object.freeze({
  [Difficulty.EASY]:   { blunderChance: 0.45 },
  [Difficulty.MEDIUM]: { blunderChance: 0.20 },
  [Difficulty.HARD]:   { blunderChance: 0.06 },
  [Difficulty.EXPERT]: { blunderChance: 0 },
});

function scoreAction(state, seat, action) {
  if (action.to === "OFF") return 100 + action.die;

  const destBefore = state.board[action.to];
  const occupantBefore = pointSeat(destBefore);
  let score = 0;
  if (occupantBefore !== null && occupantBefore !== seat) score += 50; // hits an exposed blot

  const resultingOwnCount = occupantBefore === seat ? Math.abs(destBefore) + 1 : 1;
  score += resultingOwnCount >= 2 ? 20 : -15; // safety made vs. a blot left exposed
  score += action.die * 0.5; // mild tie-break toward using the bigger die (progress)
  return score;
}

export function createBackgammonAiAdapter() {
  return {
    chooseAction(state, seat, difficulty, _deadlineMs, seed = "ai") {
      const tier = TIER[difficulty] ?? TIER[Difficulty.MEDIUM];
      const candidates = legalActions(state, seat);
      if (candidates.length === 0) return { pass: true };

      const rnd = rngFrom(`${seed}:${state.moves.length}`);
      if (tier.blunderChance > 0 && rnd() < tier.blunderChance) {
        const pick = candidates[Math.floor(rnd() * candidates.length)];
        return { from: pick.from, die: pick.die };
      }

      let best = candidates[0];
      let bestScore = scoreAction(state, seat, best);
      for (const c of candidates.slice(1)) {
        const s = scoreAction(state, seat, c);
        if (s > bestScore) { best = c; bestScore = s; }
      }
      return { from: best.from, die: best.die };
    },
  };
}
