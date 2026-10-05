import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createBackgammonAiAdapter, Difficulty } from "../src/ai.mjs";
import { BackgammonPlugin } from "../src/plugin.mjs";
import { POINTS, SEAT_0, SEAT_1 } from "../src/backgammon.mjs";

function freshState(seed = "seed-ai") {
  return BackgammonPlugin.createChallenge(seed, {}).state;
}

describe("chooseAction -- always a legal action, revalidated through the real plugin", () => {
  for (const difficulty of Object.values(Difficulty)) {
    for (const seed of ["ai-1", "ai-2", "ai-3"]) {
      test(`${difficulty} @ ${seed}: the opening action it chooses is accepted by plugin.applyIntent`, () => {
        const ai = createBackgammonAiAdapter();
        const state = freshState(seed);
        const intent = ai.chooseAction(state, state.turn, difficulty, 1000, "bot-seed");
        const res = BackgammonPlugin.applyIntent(state, intent, { seat: state.turn, serverTimeMs: 0 });
        assert.equal(res.ok, true, `${JSON.stringify(intent)} must be legal: ${res.reason}`);
      });
    }
  }
});

describe("EXPERT is deterministic given the same seed", () => {
  test("two EXPERT adapters given identical state and seed choose the identical action", () => {
    const ai = createBackgammonAiAdapter();
    const s1 = freshState("det-seed");
    const s2 = freshState("det-seed");
    const a1 = ai.chooseAction(s1, s1.turn, Difficulty.EXPERT, 1000, "bot-det");
    const a2 = ai.chooseAction(s2, s2.turn, Difficulty.EXPERT, 1000, "bot-det");
    assert.deepEqual(a1, a2);
  });
});

describe("EXPERT prefers a hit over a quiet move when both are legal", () => {
  test("hitting an exposed blot scores higher than a non-hitting alternative", () => {
    const board = new Array(POINTS).fill(0);
    board[10] = 2;  // two seat-0 checkers, either could move
    board[7] = -1;  // seat 1 blot, reachable with die 3 from idx10
    const state = { seed: "s", board, bar: [0, 0], off: [0, 0], turn: SEAT_0, dice: [3], rollIndex: 0, moves: [] };
    const ai = createBackgammonAiAdapter();
    const intent = ai.chooseAction(state, SEAT_0, Difficulty.EXPERT, 1000, "bot-hit");
    assert.deepEqual(intent, { from: 10, die: 3 });
  });
});

describe("bears off when it is the only/best legal action", () => {
  test("EXPERT bears off rather than shuffling within the home board when both are available", () => {
    const board = new Array(POINTS).fill(0);
    board[0] = 15; // all home, exact bear-off with die 1
    const state = { seed: "s", board, bar: [0, 0], off: [0, 0], turn: SEAT_0, dice: [1], rollIndex: 0, moves: [] };
    const ai = createBackgammonAiAdapter();
    const intent = ai.chooseAction(state, SEAT_0, Difficulty.EXPERT, 1000, "bot-bearoff");
    const res = BackgammonPlugin.applyIntent(state, intent, { seat: SEAT_0, serverTimeMs: 0 });
    assert.equal(res.ok, true);
    assert.equal(res.state.off[SEAT_0], 1);
  });
});

describe("pass when genuinely stuck", () => {
  test("returns { pass: true } when the bar entry is fully blocked", () => {
    const board = new Array(POINTS).fill(0);
    for (let idx = 18; idx < 24; idx++) board[idx] = -2;
    const state = { seed: "s", board, bar: [1, 0], off: [0, 0], turn: SEAT_0, dice: [3, 5], rollIndex: 0, moves: [] };
    const ai = createBackgammonAiAdapter();
    const intent = ai.chooseAction(state, SEAT_0, Difficulty.MEDIUM, 1000, "bot-stuck");
    assert.deepEqual(intent, { pass: true });
  });
});

describe("a full self-play game between two EXPERT adapters always terminates cleanly", () => {
  test("plays to a win within a bounded number of actions, never an illegal move", () => {
    const ai = createBackgammonAiAdapter();
    let state = freshState("selfplay-seed");
    for (let i = 0; i < 2000; i++) {
      const outcome = BackgammonPlugin.evaluate(state);
      if (outcome) {
        assert.ok(["BEAR_OFF_ALL", "GAMMON", "BACKGAMMON"].includes(outcome.reason));
        return;
      }
      const intent = ai.chooseAction(state, state.turn, Difficulty.EXPERT, 1000, "bot-selfplay");
      const res = BackgammonPlugin.applyIntent(state, intent, { seat: state.turn, serverTimeMs: i * 100 });
      assert.equal(res.ok, true, `action ${i} (${JSON.stringify(intent)}) must be legal: ${res.reason}`);
      state = res.state;
    }
    assert.fail("game did not terminate within 2000 actions");
  });
});
