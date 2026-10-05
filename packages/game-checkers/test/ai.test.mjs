/**
 * The Checkers AI adapter, tested against the SAME plugin.applyIntent every
 * human move is validated through -- the adapter never gets a trusted
 * shortcut, and neither do these tests.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createCheckersAiAdapter, Difficulty } from "../src/ai.mjs";
import { CheckersPlugin } from "../src/plugin.mjs";
import { SEAT_0, SEAT_1 } from "../src/checkers.mjs";

function freshState() {
  return CheckersPlugin.createChallenge(null, {}).state;
}

describe("chooseAction -- always a legal move, revalidated through the real plugin", () => {
  for (const difficulty of Object.values(Difficulty)) {
    test(`${difficulty}: the opening move it chooses is accepted by plugin.applyIntent`, () => {
      const ai = createCheckersAiAdapter();
      const state = freshState();
      const move = ai.chooseAction(state, SEAT_0, difficulty, 1500, "seed-open-1");
      assert.ok(move, "an opening position always has a legal move");
      const res = CheckersPlugin.applyIntent(state, move, { seat: SEAT_0, serverTimeMs: 0 });
      assert.equal(res.ok, true, `${move} must be legal: ${res.reason}`);
    });
  }
});

describe("mandatory multi-jump", () => {
  test("when a forced continuation is set, the adapter only ever proposes a move from that exact square", () => {
    const state = freshState();
    // An isolated board (not the full starting position, whose own pieces
    // would otherwise block the landing square used below): a lone seat-0
    // man at d4, mid multi-jump, with one further capture available.
    const forced = { ...state, board: new Int8Array(64), forcedFrom: { row: 4, col: 3 } };
    forced.board[4 * 8 + 3] = 1;   // seat 0 man at the forced square (d4)
    forced.board[3 * 8 + 2] = -1;  // an enemy to jump (c3), landing on b2
    const ai = createCheckersAiAdapter();
    const move = ai.chooseAction(forced, SEAT_0, Difficulty.HARD, 1000, "seed-forced");
    assert.ok(move);
    assert.equal(move.slice(0, 2), "d4", "the move must originate from the forced square");
  });
});

describe("determinism -- the same seed and position always choose the same move", () => {
  test("EXPERT is fully deterministic given the same seed", () => {
    const ai = createCheckersAiAdapter();
    const s1 = freshState();
    const s2 = freshState();
    const m1 = ai.chooseAction(s1, SEAT_0, Difficulty.EXPERT, 1500, "seed-det");
    const m2 = ai.chooseAction(s2, SEAT_0, Difficulty.EXPERT, 1500, "seed-det");
    assert.equal(m1, m2);
  });

  test("EASY's seeded blunder chance still only ever returns a legal move", () => {
    const ai = createCheckersAiAdapter();
    for (let i = 0; i < 15; i++) {
      const state = freshState();
      const move = ai.chooseAction(state, SEAT_0, Difficulty.EASY, 500, `seed-easy-${i}`);
      const res = CheckersPlugin.applyIntent(state, move, { seat: SEAT_0, serverTimeMs: 0 });
      assert.equal(res.ok, true, `${move} (iteration ${i}) must be legal: ${res.reason}`);
    }
  });
});

describe("no legal move", () => {
  test("returns null rather than throwing when the seat to move has no legal move", () => {
    const state = freshState();
    const boxed = { ...state, board: new Int8Array(64), forcedFrom: null };
    // The exact fixture verified in rules.test.mjs's own "no legal moves"
    // case: seat 1's only man (b8) has both forward diagonals occupied,
    // with the one open jump's landing square also blocked.
    boxed.board[0 * 8 + 1] = -1; // seat 1 man at b8
    boxed.board[1 * 8 + 0] = 1;  // seat 0 man at a7
    boxed.board[1 * 8 + 2] = 1;  // seat 0 man at c7
    boxed.board[2 * 8 + 3] = 1;  // seat 0 man at d6 (blocks the jump landing over c7)
    const ai = createCheckersAiAdapter();
    const move = ai.chooseAction(boxed, SEAT_1, Difficulty.MEDIUM, 500, "seed-boxed");
    assert.equal(move, null);
  });
});
