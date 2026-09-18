/**
 * The Speed Math AI adapter -- same contract as every other launch game's
 * own ai.mjs: pure, and never anything but a well-formed intent (the
 * platform revalidates it through the ordinary INTENT path regardless).
 *
 * Unlike every other adapter in this codebase, this one is not a search --
 * there is nothing to search. Its own current question and answer are read
 * straight off the (own-seat) state, exactly as a human player's client
 * would see them via project(). Difficulty controls only ACCURACY (a
 * seeded chance of a plausible near-miss instead of the true answer),
 * never speed -- pacing for a bot answer is the gateway's own concern
 * (packages/realtime/src/gateway.mjs's scheduleBotAnswerIfNeeded), exactly
 * how a bot's move DELAY for every other game is a gateway concern and
 * never something an adapter decides for itself.
 */
export const Difficulty = Object.freeze({
  EASY: "EASY", MEDIUM: "MEDIUM", HARD: "HARD", EXPERT: "EXPERT",
});

// A per-answer delay is this game's own concern, not the gateway's generic
// `aiMoveDelayMs` -- that constant is a fixed cosmetic pause between an
// ALTERNATING bot's turns, harmless there because the opponent's own turn
// already throttles how often it can fire. Speed Math has no such throttle:
// this is a fixed-length race, so the bot's per-answer delay is the single
// biggest lever on how many questions it can rack up, i.e. on how "Easy" an
// EASY bot actually feels to a human racing it. Slower AND less accurate at
// EASY, faster AND flawless at EXPERT -- both axes moving together is what
// makes the tiers feel meaningfully different rather than same-speed dice
// rolls with different odds.
//
// `delayMultiplier` scales the gateway's own `aiMoveDelayMs` (its
// production default is 500ms, reproduced exactly by EXPERT's 1x) rather
// than naming an absolute duration, so a test harness that shrinks
// `aiMoveDelayMs` down to keep bot timers fast still gets a proportionally
// fast -- but still difficulty-differentiated -- delay, instead of this
// game silently ignoring that override and blocking on real multi-second
// timers.
const TIER = Object.freeze({
  [Difficulty.EASY]:       { blunderChance: 0.40, delayMultiplier: 3.2 },
  [Difficulty.MEDIUM]:     { blunderChance: 0.18, delayMultiplier: 2.2 },
  [Difficulty.HARD]:       { blunderChance: 0.06, delayMultiplier: 1.5 },
  [Difficulty.EXPERT]:     { blunderChance: 0,    delayMultiplier: 1 },
  [Difficulty.INVINCIBLE]: { blunderChance: 0,    delayMultiplier: 0.8 },
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

export function createSpeedMathAiAdapter() {
  return {
    /**
     * Returns `{ answer }` -- the SAME intent shape a human's client
     * sends -- for the bot's own current question, or null once the bot
     * has exhausted the question set (nothing left for it to answer).
     */
    chooseAction(state, seat, difficulty, _deadlineMs, seed = "ai") {
      const tier = TIER[difficulty] ?? TIER[Difficulty.EXPERT];
      const progress = state.progress[seat];
      if (!progress || progress.index >= state.questions.length) return null;
      const q = state.questions[progress.index];

      const rnd = rngFrom(`${seed}:${progress.index}`);
      if (tier.blunderChance > 0 && rnd() < tier.blunderChance) {
        // A plausible near-miss -- off by a small amount, never a wild
        // guess, the same "reads as human, not broken" standard every
        // other adapter's blunder injection holds itself to.
        let miss = q.answer;
        while (miss === q.answer) miss = q.answer + (Math.floor(rnd() * 5) - 2);
        return { answer: miss };
      }
      return { answer: q.answer };
    },

    /** How long the gateway should wait before submitting this bot's next
     * answer, for the given difficulty -- see this file's own header on
     * why Speed Math needs a per-tier delay where other games don't, and
     * on why this scales the gateway's own `baseMs` rather than naming an
     * absolute duration. */
    answerDelayMs(difficulty, baseMs) {
      return Math.round((TIER[difficulty] ?? TIER[Difficulty.EXPERT]).delayMultiplier * baseMs);
    },
  };
}
