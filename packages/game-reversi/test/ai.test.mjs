import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createReversiAiAdapter, Difficulty } from "../src/ai.mjs";
import { ReversiPlugin } from "../src/plugin.mjs";
import { SEAT_0, SEAT_1 } from "../src/reversi.mjs";

function fresh() {
  return ReversiPlugin.createChallenge(null, {}).state;
}

describe("chooseAction -- always a legal action, revalidated through the real plugin", () => {
  for (const difficulty of Object.values(Difficulty)) {
    test(`${difficulty}: the opening move it chooses is accepted by plugin.applyIntent`, () => {
      const ai = createReversiAiAdapter();
      const state = fresh();
      const intent = ai.chooseAction(state, SEAT_0, difficulty, 500, "seed-open-1");
      const res = ReversiPlugin.applyIntent(state, intent, { seat: SEAT_0, serverTimeMs: 0 });
      assert.equal(res.ok, true, `${JSON.stringify(intent)} must be legal: ${res.reason}`);
    });
  }
});

describe("EXPERT prefers a corner over a worse alternative when both are legal", () => {
  test("the corner (weight 120) is chosen over the only other legal move", () => {
    // Two independent legal placements for seat 0: (0,0), a corner,
    // outflanking (0,1); and (7,7), outflanking (7,6) -- also a corner,
    // so instead make the second option land on a plain, low-weight
    // square by placing its closing piece one row up instead.
    const board = new Int8Array(64);
    board[0 * 8 + 1] = -1; board[0 * 8 + 2] = 1; // closes (0,0)->corner, weight 120
    board[3 * 8 + 4] = -1; board[3 * 8 + 5] = 1; // closes (3,3), an inner square, weight 3
    const ai = createReversiAiAdapter();
    const state = { board, turn: SEAT_0, moves: [] };
    const intent = ai.chooseAction(state, SEAT_0, Difficulty.EXPERT, 500, "seed-corner");
    assert.deepEqual(intent, { place: 0 });
  });
});

describe("pass when genuinely stuck", () => {
  test("returns { pass: true } when no legal move exists", () => {
    const board = new Int8Array(64).fill(-1);
    board[0] = 0;
    const ai = createReversiAiAdapter();
    const intent = ai.chooseAction({ board, turn: SEAT_0, moves: [] }, SEAT_0, Difficulty.MEDIUM, 500, "seed-stuck");
    assert.deepEqual(intent, { pass: true });
  });
});

describe("EXPERT is deterministic given the same seed", () => {
  test("two EXPERT adapters given identical state and seed choose the identical action", () => {
    const ai = createReversiAiAdapter();
    const s1 = fresh(), s2 = fresh();
    const a1 = ai.chooseAction(s1, SEAT_0, Difficulty.EXPERT, 500, "seed-det");
    const a2 = ai.chooseAction(s2, SEAT_0, Difficulty.EXPERT, 500, "seed-det");
    assert.deepEqual(a1, a2);
  });
});

describe("a full self-play game between two EXPERT adapters always terminates cleanly", () => {
  test("plays to a real outcome within a bounded number of actions, never an illegal move", () => {
    const ai = createReversiAiAdapter();
    let state = fresh();
    for (let i = 0; i < 200; i++) {
      const outcome = ReversiPlugin.evaluate(state);
      if (outcome) {
        assert.ok(["BOARD_FULL", "NO_LEGAL_MOVES"].includes(outcome.reason));
        return;
      }
      const intent = ai.chooseAction(state, state.turn, Difficulty.EXPERT, 500, "seed-selfplay");
      const res = ReversiPlugin.applyIntent(state, intent, { seat: state.turn, serverTimeMs: i * 100 });
      assert.equal(res.ok, true, `action ${i} (${JSON.stringify(intent)}) must be legal: ${res.reason}`);
      state = res.state;
    }
    assert.fail("game did not terminate within 200 actions");
  });
});
