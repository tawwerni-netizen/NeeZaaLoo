import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createXoAiAdapter, Difficulty } from "../src/ai.mjs";
import { XOPlugin } from "../src/plugin.mjs";
import { SEAT_0, SEAT_1 } from "../src/xo.mjs";

function freshState() {
  return XOPlugin.createChallenge(null, {}).state;
}

describe("chooseAction -- always a legal move, revalidated through the real plugin", () => {
  for (const difficulty of Object.values(Difficulty)) {
    test(`${difficulty}: the opening move it chooses is accepted by plugin.applyIntent`, () => {
      const ai = createXoAiAdapter();
      const state = freshState();
      const cell = ai.chooseAction(state, SEAT_0, difficulty, 500, "seed-open-1");
      assert.ok(Number.isInteger(cell));
      const res = XOPlugin.applyIntent(state, cell, { seat: SEAT_0, serverTimeMs: 0 });
      assert.equal(res.ok, true, `cell ${cell} must be legal: ${res.reason}`);
    });
  }
});

describe("EXPERT plays optimally", () => {
  test("EXPERT blocks an immediate opponent win rather than playing elsewhere", () => {
    // X has two in a row (0,1); O must block at 2 or lose next.
    let state = freshState();
    state = XOPlugin.applyIntent(state, 0, { seat: SEAT_0, serverTimeMs: 0 }).state;
    state = XOPlugin.applyIntent(state, 3, { seat: SEAT_1, serverTimeMs: 0 }).state;
    state = XOPlugin.applyIntent(state, 1, { seat: SEAT_0, serverTimeMs: 0 }).state;
    const ai = createXoAiAdapter();
    const cell = ai.chooseAction(state, SEAT_1, Difficulty.EXPERT, 500, "seed-block");
    assert.equal(cell, 2, "EXPERT must block the winning line at cell 2");
  });

  test("EXPERT takes an immediate win when one is available", () => {
    // O has two in a row (3,4); it is O's turn and cell 5 wins.
    let state = freshState();
    state = XOPlugin.applyIntent(state, 0, { seat: SEAT_0, serverTimeMs: 0 }).state;
    state = XOPlugin.applyIntent(state, 3, { seat: SEAT_1, serverTimeMs: 0 }).state;
    state = XOPlugin.applyIntent(state, 6, { seat: SEAT_0, serverTimeMs: 0 }).state;
    state = XOPlugin.applyIntent(state, 4, { seat: SEAT_1, serverTimeMs: 0 }).state;
    state = XOPlugin.applyIntent(state, 7, { seat: SEAT_0, serverTimeMs: 0 }).state;
    const ai = createXoAiAdapter();
    const cell = ai.chooseAction(state, SEAT_1, Difficulty.EXPERT, 500, "seed-win");
    assert.equal(cell, 5, "EXPERT must complete the winning line at cell 5");
  });

  test("two EXPERT adapters playing each other from the start always draw", () => {
    const ai = createXoAiAdapter();
    let state = freshState();
    let seat = SEAT_0;
    for (let i = 0; i < 9; i++) {
      const outcome = XOPlugin.evaluate(state);
      if (outcome) break;
      const cell = ai.chooseAction(state, seat, Difficulty.EXPERT, 500, "seed-selfplay");
      const res = XOPlugin.applyIntent(state, cell, { seat, serverTimeMs: 0 });
      assert.equal(res.ok, true);
      state = res.state;
      seat = seat === SEAT_0 ? SEAT_1 : SEAT_0;
    }
    const outcome = XOPlugin.evaluate(state);
    assert.deepEqual(outcome, { result: "1/2-1/2", reason: "BOARD_FULL" }, "optimal play from both sides is the well-known drawn result");
  });
});

describe("determinism -- the same seed and position always choose the same move", () => {
  test("EXPERT is fully deterministic given the same seed", () => {
    const ai = createXoAiAdapter();
    const m1 = ai.chooseAction(freshState(), SEAT_0, Difficulty.EXPERT, 500, "seed-det");
    const m2 = ai.chooseAction(freshState(), SEAT_0, Difficulty.EXPERT, 500, "seed-det");
    assert.equal(m1, m2);
  });

  test("EASY's seeded blunder chance still only ever returns a legal move", () => {
    const ai = createXoAiAdapter();
    for (let i = 0; i < 15; i++) {
      const state = freshState();
      const cell = ai.chooseAction(state, SEAT_0, Difficulty.EASY, 500, `seed-easy-${i}`);
      const res = XOPlugin.applyIntent(state, cell, { seat: SEAT_0, serverTimeMs: 0 });
      assert.equal(res.ok, true, `cell ${cell} (iteration ${i}) must be legal: ${res.reason}`);
    }
  });
});

describe("no legal move", () => {
  test("returns null when the board is completely full", () => {
    const state = freshState();
    const full = { ...state, board: new Int8Array(9).fill(1) };
    const ai = createXoAiAdapter();
    assert.equal(ai.chooseAction(full, SEAT_0, Difficulty.MEDIUM, 500, "seed-full"), null);
  });
});
