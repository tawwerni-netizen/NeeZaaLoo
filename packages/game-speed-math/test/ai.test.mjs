import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createSpeedMathAiAdapter, Difficulty } from "../src/ai.mjs";
import { SpeedMathPlugin, DEFAULT_CONFIG } from "../src/plugin.mjs";

function freshState(config = DEFAULT_CONFIG) {
  return SpeedMathPlugin.createChallenge("seed-ai", config).state;
}

describe("chooseAction -- always a well-formed intent, revalidated through the real plugin", () => {
  for (const difficulty of Object.values(Difficulty)) {
    test(`${difficulty}: the answer it chooses is accepted by plugin.applyIntent`, () => {
      const ai = createSpeedMathAiAdapter();
      const state = freshState();
      const intent = ai.chooseAction(state, 0, difficulty, 1000, "seed-open-1");
      assert.ok(intent && typeof intent.answer === "number");
      const res = SpeedMathPlugin.applyIntent(state, intent, { seat: 0, serverTimeMs: 0 });
      assert.equal(res.ok, true, `${JSON.stringify(intent)} must be accepted: ${res.reason}`);
    });
  }
});

describe("EXPERT never blunders", () => {
  test("EXPERT answers every question correctly across a long run", () => {
    const ai = createSpeedMathAiAdapter();
    let state = freshState({ ...DEFAULT_CONFIG, questionCount: 40 });
    for (let i = 0; i < 40; i++) {
      const intent = ai.chooseAction(state, 0, Difficulty.EXPERT, 1000, "seed-expert");
      const q = state.questions[state.progress[0].index];
      assert.equal(intent.answer, q.answer);
      state = SpeedMathPlugin.applyIntent(state, intent, { seat: 0, serverTimeMs: i * 500 }).state;
    }
    assert.equal(state.progress[0].correct, 40);
    assert.equal(state.progress[0].wrong, 0);
  });
});

describe("EASY blunders a plausible near-miss, not a wild guess", () => {
  test("a wrong EASY answer is always close to the true answer", () => {
    const ai = createSpeedMathAiAdapter();
    let state = freshState({ ...DEFAULT_CONFIG, questionCount: 60 });
    let sawWrong = false;
    for (let i = 0; i < 60; i++) {
      const q = state.questions[state.progress[0].index];
      const intent = ai.chooseAction(state, 0, Difficulty.EASY, 1000, `seed-easy-${i}`);
      if (intent.answer !== q.answer) {
        sawWrong = true;
        assert.ok(Math.abs(intent.answer - q.answer) <= 2, "a blunder must be a near-miss, never a wild guess");
      }
      state = SpeedMathPlugin.applyIntent(state, intent, { seat: 0, serverTimeMs: i * 500 }).state;
    }
    assert.ok(sawWrong, "EASY's 40% blunder chance should produce at least one wrong answer across 60 questions");
  });
});

describe("determinism -- the same seed and question index always choose the same answer", () => {
  test("EXPERT is fully deterministic given the same seed", () => {
    const ai = createSpeedMathAiAdapter();
    const s1 = freshState();
    const s2 = freshState();
    const a1 = ai.chooseAction(s1, 0, Difficulty.EXPERT, 1000, "seed-det");
    const a2 = ai.chooseAction(s2, 0, Difficulty.EXPERT, 1000, "seed-det");
    assert.deepEqual(a1, a2);
  });
});

describe("no questions left", () => {
  test("returns null once the bot's own question set is exhausted", () => {
    const state = freshState({ ...DEFAULT_CONFIG, questionCount: 2 });
    const exhausted = {
      ...state,
      progress: [{ ...state.progress[0], index: 2 }, state.progress[1]],
    };
    const ai = createSpeedMathAiAdapter();
    assert.equal(ai.chooseAction(exhausted, 0, Difficulty.MEDIUM, 1000, "seed-done"), null);
  });
});

describe("answerDelayMs -- the race pacing lever, not just accuracy", () => {
  test("EASY is slower than EXPERT for the same base, so an EASY bot cannot out-volume a human by default", () => {
    const ai = createSpeedMathAiAdapter();
    const easy = ai.answerDelayMs(Difficulty.EASY, 500);
    const expert = ai.answerDelayMs(Difficulty.EXPERT, 500);
    assert.ok(easy > expert, `EASY (${easy}ms) must be slower than EXPERT (${expert}ms)`);
  });

  test("delay scales proportionally with the gateway's own base, so a test harness shrinking it for speed still gets a fast delay", () => {
    const ai = createSpeedMathAiAdapter();
    const productionDelay = ai.answerDelayMs(Difficulty.EASY, 500);
    const testDelay = ai.answerDelayMs(Difficulty.EASY, 10);
    assert.ok(testDelay < 50, `a 10ms test base must not still block on a near-production delay (got ${testDelay}ms)`);
    assert.equal(Math.round(productionDelay / 500), Math.round(testDelay / 10), "the multiplier must be the same regardless of base");
  });

  test("EXPERT reproduces the base exactly -- the platform's existing default bot delay is unchanged for the hardest tier", () => {
    const ai = createSpeedMathAiAdapter();
    assert.equal(ai.answerDelayMs(Difficulty.EXPERT, 500), 500);
  });
});
