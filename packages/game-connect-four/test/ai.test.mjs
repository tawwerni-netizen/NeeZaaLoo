import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createConnectFourAiAdapter, Difficulty } from "../src/ai.mjs";
import { ConnectFourPlugin } from "../src/plugin.mjs";
import { SEAT_0, SEAT_1 } from "../src/connect-four.mjs";

function freshState() {
  return ConnectFourPlugin.createChallenge(null, {}).state;
}

describe("chooseAction -- always a legal move, revalidated through the real plugin", () => {
  for (const difficulty of Object.values(Difficulty)) {
    test(`${difficulty}: the opening drop it chooses is accepted by plugin.applyIntent`, () => {
      const ai = createConnectFourAiAdapter();
      const state = freshState();
      const col = ai.chooseAction(state, SEAT_0, difficulty, 1500, "seed-open-1");
      assert.ok(Number.isInteger(col));
      const res = ConnectFourPlugin.applyIntent(state, col, { seat: SEAT_0, serverTimeMs: 0 });
      assert.equal(res.ok, true, `column ${col} must be legal: ${res.reason}`);
    });
  }
});

describe("takes an immediate win when one is available", () => {
  test("HARD and EXPERT complete a line of four rather than play elsewhere", () => {
    let state = freshState();
    // Seat 0 has three in a row on row 0, columns 0-2; column 3 is open.
    const setup = [[0, SEAT_0], [0, SEAT_1], [1, SEAT_0], [1, SEAT_1], [2, SEAT_0]];
    for (const [col, seat] of setup) {
      state = ConnectFourPlugin.applyIntent(state, col, { seat, serverTimeMs: 0 }).state;
    }
    // It is seat 1's turn; give seat 1 a harmless move, then it is seat 0's turn again.
    state = ConnectFourPlugin.applyIntent(state, 6, { seat: SEAT_1, serverTimeMs: 0 }).state;

    for (const difficulty of [Difficulty.HARD, Difficulty.EXPERT]) {
      const ai = createConnectFourAiAdapter();
      const col = ai.chooseAction(state, SEAT_0, difficulty, 2000, "seed-win");
      assert.equal(col, 3, `${difficulty} must take the immediate win at column 3`);
    }
  });
});

describe("determinism -- the same seed and position always choose the same move", () => {
  test("EXPERT is fully deterministic given the same seed", () => {
    const ai = createConnectFourAiAdapter();
    const m1 = ai.chooseAction(freshState(), SEAT_0, Difficulty.EXPERT, 1500, "seed-det");
    const m2 = ai.chooseAction(freshState(), SEAT_0, Difficulty.EXPERT, 1500, "seed-det");
    assert.equal(m1, m2);
  });

  test("EASY's seeded blunder chance still only ever returns a legal column", () => {
    const ai = createConnectFourAiAdapter();
    for (let i = 0; i < 15; i++) {
      const state = freshState();
      const col = ai.chooseAction(state, SEAT_0, Difficulty.EASY, 500, `seed-easy-${i}`);
      const res = ConnectFourPlugin.applyIntent(state, col, { seat: SEAT_0, serverTimeMs: 0 });
      assert.equal(res.ok, true, `column ${col} (iteration ${i}) must be legal: ${res.reason}`);
    }
  });
});

describe("no legal move", () => {
  test("returns null when the board is completely full", () => {
    const state = freshState();
    const full = { ...state, board: new Int8Array(42).fill(1) };
    const ai = createConnectFourAiAdapter();
    assert.equal(ai.chooseAction(full, SEAT_0, Difficulty.MEDIUM, 500, "seed-full"), null);
  });
});
