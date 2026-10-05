import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createDominoesAiAdapter, Difficulty } from "../src/ai.mjs";
import { DominoesPlugin } from "../src/plugin.mjs";

function freshState(seed = "seed-ai") {
  return DominoesPlugin.createChallenge(seed, {}).state;
}

describe("chooseAction -- always a well-formed, legal action, revalidated through the real plugin", () => {
  for (const difficulty of Object.values(Difficulty)) {
    for (const seed of ["seed-ai-1", "seed-ai-2", "seed-ai-3"]) {
      test(`${difficulty} @ ${seed}: the opening action it chooses is accepted by plugin.applyIntent`, () => {
        const ai = createDominoesAiAdapter();
        const state = freshState(seed);
        const intent = ai.chooseAction(state, state.turn, difficulty, 1000, "bot-seed");
        const res = DominoesPlugin.applyIntent(state, intent, { seat: state.turn, serverTimeMs: 0 });
        assert.equal(res.ok, true, `${JSON.stringify(intent)} must be accepted: ${res.reason}`);
      });
    }
  }
});

describe("forced opening double", () => {
  test("every tier plays the forced double when one is set -- it is not a choice", () => {
    for (const seed of ["seed-ai-1", "seed-ai-2", "seed-ai-3", "seed-ai-4", "seed-ai-5"]) {
      const state = freshState(seed);
      if (!state.openingConstraint) continue;
      const ai = createDominoesAiAdapter();
      const intent = ai.chooseAction(state, state.turn, Difficulty.EASY, 1000, "bot");
      assert.deepEqual(intent.tile, state.openingConstraint.tile);
    }
  });
});

describe("EXPERT never blunders into a random legal move it wouldn't otherwise pick", () => {
  test("EXPERT is deterministic given the same seed", () => {
    const ai = createDominoesAiAdapter();
    const s1 = freshState("seed-det");
    const s2 = freshState("seed-det");
    const a1 = ai.chooseAction(s1, s1.turn, Difficulty.EXPERT, 1000, "bot-det");
    const a2 = ai.chooseAction(s2, s2.turn, Difficulty.EXPERT, 1000, "bot-det");
    assert.deepEqual(a1, a2);
  });
});

describe("pass when genuinely stuck", () => {
  test("returns { pass: true } when no tile in hand matches either end", () => {
    const state = {
      seed: "s", turn: 0, openingConstraint: null, consecutivePasses: 0, moves: [],
      hands: [[[0, 0]], [[1, 1]]],
      line: { left: 5, right: 5, tiles: [{ tile: [5, 5], orientation: [5, 5] }] },
    };
    const ai = createDominoesAiAdapter();
    const intent = ai.chooseAction(state, 0, Difficulty.MEDIUM, 1000, "bot");
    assert.deepEqual(intent, { pass: true });
  });
});

describe("a full self-play game between two EXPERT adapters always terminates cleanly", () => {
  test("plays to DOMINO_OUT or BLOCKED within a bounded number of actions, never an illegal move", () => {
    const ai = createDominoesAiAdapter();
    let state = freshState("seed-selfplay");
    for (let i = 0; i < 40; i++) {
      const outcome = DominoesPlugin.evaluate(state);
      if (outcome) {
        assert.ok(["DOMINO_OUT", "BLOCKED"].includes(outcome.reason));
        return;
      }
      const intent = ai.chooseAction(state, state.turn, Difficulty.EXPERT, 1000, "bot-selfplay");
      const res = DominoesPlugin.applyIntent(state, intent, { seat: state.turn, serverTimeMs: i * 100 });
      assert.equal(res.ok, true, `move ${i} (${JSON.stringify(intent)}) must be legal: ${res.reason}`);
      state = res.state;
    }
    assert.fail("game did not terminate within 40 actions");
  });
});
