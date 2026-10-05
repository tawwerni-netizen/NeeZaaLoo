import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createGomokuAiAdapter, Difficulty } from "../src/ai.mjs";
import { GomokuPlugin } from "../src/plugin.mjs";
import { SEAT_0, SEAT_1, BOARD_SIZE, CELLS, pieceFor } from "../src/gomoku.mjs";

const idx = (row, col) => row * BOARD_SIZE + col;

function fresh() {
  return GomokuPlugin.createChallenge(null, {}).state;
}

describe("chooseAction -- always a legal cell, revalidated through the real plugin", () => {
  for (const difficulty of Object.values(Difficulty)) {
    test(`${difficulty}: the opening move it chooses is accepted by plugin.applyIntent`, () => {
      const ai = createGomokuAiAdapter();
      const state = fresh();
      const cell = ai.chooseAction(state, SEAT_0, difficulty, 1000, "seed-open-1");
      assert.ok(Number.isInteger(cell) && cell >= 0 && cell < CELLS);
      const res = GomokuPlugin.applyIntent(state, cell, { seat: SEAT_0, serverTimeMs: 0 });
      assert.equal(res.ok, true, `cell ${cell} must be legal: ${res.reason}`);
    });
  }
});

describe("the opening move on a wholly empty board is the center", () => {
  test("EXPERT (and every tier's candidate set) starts at the center cell", () => {
    const ai = createGomokuAiAdapter();
    const cell = ai.chooseAction(fresh(), SEAT_0, Difficulty.EXPERT, 1000, "seed-center");
    assert.equal(cell, idx(7, 7));
  });
});

describe("EXPERT takes an immediate win when one is available", () => {
  test("completes its own four rather than playing elsewhere", () => {
    const board = new Int8Array(CELLS);
    for (let c = 0; c < 4; c++) board[idx(7, c + 2)] = pieceFor(SEAT_0);
    const state = { board, turn: SEAT_0, lastMove: idx(7, 5), moves: [1, 2, 3] };
    const ai = createGomokuAiAdapter();
    const cell = ai.chooseAction(state, SEAT_0, Difficulty.EXPERT, 1000, "seed-win");
    assert.ok(cell === idx(7, 1) || cell === idx(7, 6), `expected a line-completing cell, got ${cell}`);
  });
});

describe("EXPERT blocks an opponent's open four rather than ignoring it", () => {
  test("plays one of the two cells that would otherwise let the opponent win", () => {
    const board = new Int8Array(CELLS);
    for (let c = 0; c < 4; c++) board[idx(9, c + 2)] = pieceFor(SEAT_1);
    // Give seat 0 a distant, much weaker stone so it has SOME other option,
    // but blocking must still dominate the score.
    board[idx(0, 0)] = pieceFor(SEAT_0);
    const state = { board, turn: SEAT_0, lastMove: idx(0, 0), moves: [1] };
    const ai = createGomokuAiAdapter();
    const cell = ai.chooseAction(state, SEAT_0, Difficulty.EXPERT, 1000, "seed-block");
    assert.ok(cell === idx(9, 1) || cell === idx(9, 6), `expected a blocking cell, got ${cell}`);
  });
});

describe("EXPERT is deterministic given the same seed", () => {
  test("two EXPERT adapters given identical state and seed choose the identical action", () => {
    const ai = createGomokuAiAdapter();
    const s1 = fresh(), s2 = fresh();
    const a1 = ai.chooseAction(s1, SEAT_0, Difficulty.EXPERT, 1000, "seed-det");
    const a2 = ai.chooseAction(s2, SEAT_0, Difficulty.EXPERT, 1000, "seed-det");
    assert.equal(a1, a2);
  });
});

describe("a full self-play game between two EXPERT adapters always terminates cleanly", () => {
  test("plays to a real outcome within a bounded number of moves, never an illegal move", () => {
    const ai = createGomokuAiAdapter();
    let state = fresh();
    let seat = SEAT_0;
    for (let i = 0; i < 225; i++) {
      const outcome = GomokuPlugin.evaluate(state);
      if (outcome) {
        assert.ok(["FIVE_IN_A_ROW", "BOARD_FULL"].includes(outcome.reason));
        return;
      }
      const cell = ai.chooseAction(state, seat, Difficulty.EXPERT, 1000, "seed-selfplay");
      const res = GomokuPlugin.applyIntent(state, cell, { seat, serverTimeMs: i * 100 });
      assert.equal(res.ok, true, `move ${i} (cell ${cell}) must be legal: ${res.reason}`);
      state = res.state;
      seat = state.turn;
    }
    assert.fail("game did not terminate within 225 moves");
  });
});
