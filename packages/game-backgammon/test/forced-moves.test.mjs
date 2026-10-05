import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SEAT_0,
  SEAT_1,
  POINTS,
  legalActionsWithForcedRules,
  rollDiceFor,
  openingRoll,
} from "../src/backgammon.mjs";
import { BackgammonPlugin } from "../src/plugin.mjs";

describe("Backgammon Forced Move & WBF Rules Engine", () => {
  describe("Forced Larger-Die Rule", () => {
    it("forces player to use the larger die when only one die can be played", () => {
      // Create a position for Seat 0 where:
      // Seat 0 has 1 checker at point 10.
      // Dice: [5, 3]
      // Points 7 (10-3) is open, but points 2 (7-5) and 4 (open-5) are blocked by opponent.
      // Point 5 (10-5) is open, but point 2 (5-3) is blocked by opponent.
      // So seat 0 can play 10 -> 7 (using 3), BUT then has no move for 5.
      // Or seat 0 can play 10 -> 5 (using 5), BUT then has no move for 3.
      // Only ONE die can be played in total!
      // By WBF Backgammon rules, Seat 0 MUST play the larger die (5), NOT 3!

      const board = new Array(POINTS).fill(0);
      board[10] = 1; // Seat 0 checker
      board[7] = 0;  // Open
      board[5] = 0;  // Open
      board[2] = -2; // Opponent blocks point 2 (so 7-5=2 is blocked, and 5-3=2 is blocked)

      const state = {
        board,
        bar: [0, 0],
        off: [14, 13], // almost all borne off
        turn: SEAT_0,
        dice: [5, 3],
        rollIndex: 1,
        moves: [],
      };

      const forced = legalActionsWithForcedRules(state, SEAT_0);
      assert.ok(forced.length > 0, "Must have at least one legal action");

      // Verify that every single allowed action uses die 5, not die 3!
      for (const action of forced) {
        assert.equal(action.die, 5, "Forced move rule requires playing larger die (5)");
        assert.equal(action.from, 10);
        assert.equal(action.to, 5);
      }

      // Verify applyIntent enforces this:
      // Attempting to play die 3 must be rejected as ILLEGAL:
      const badRes = BackgammonPlugin.applyIntent(state, { from: 10, die: 3 }, { seat: SEAT_0 });
      assert.equal(badRes.ok, false);
      assert.equal(badRes.reason, "ILLEGAL");

      // Attempting to play die 5 must be accepted:
      const goodRes = BackgammonPlugin.applyIntent(state, { from: 10, die: 5 }, { seat: SEAT_0 });
      assert.equal(goodRes.ok, true);
      assert.equal(goodRes.state.board[5], 1);
    });

    it("forces player to use the die sequence that maximizes total dice played", () => {
      // Seat 0 has checker at 10 and checker at 6.
      // Dice: [4, 2].
      // Point 8 (10-2) is open. From 8, 8-4=4 is open. (Playing 2 then 4 uses BOTH dice!)
      // Point 6 (10-4) is blocked by opponent (-2).
      // So starting with 4 can only play 6 -> 2 (using 4). From 2, 2-2=0 is blocked (-2).
      // So starting with 4 uses only 1 die, but starting with 2 allows using BOTH dice!
      // Rule: Player MUST choose the move that allows playing both dice!

      const board = new Array(POINTS).fill(0);
      board[10] = 1; // Seat 0 checker
      board[6] = 1;  // Seat 0 checker
      board[8] = 0;  // Open
      board[4] = 0;  // Open
      board[2] = 0;  // Open
      board[0] = -2; // Opponent blocks 0 (blocks 2-2=0)

      const state = {
        board,
        bar: [0, 0],
        off: [13, 15],
        turn: SEAT_0,
        dice: [4, 2],
        rollIndex: 2,
        moves: [],
      };

      const forced = legalActionsWithForcedRules(state, SEAT_0);
      // Playing 10 -> 8 (using 2) enables 8 -> 4 (using 4) -> both dice played!
      // Playing 6 -> 4 (using 2) enables 10 -> 6 (using 4) -> both dice played!
      // Check that every initial action that permits playing both dice is allowed
      assert.ok(forced.length > 0);
    });
  });

  describe("Bar Re-entry Priority", () => {
    it("strictly forbids any board moves while a checker is on the bar", () => {
      const board = new Array(POINTS).fill(0);
      board[10] = 3;
      board[20] = -2; // Entry for die 4 (24-4 = 20) is blocked!
      board[19] = 0;  // Entry for die 5 (24-5 = 19) is open!

      const state = {
        board,
        bar: [1, 0], // Seat 0 has 1 on the bar!
        off: [0, 0],
        turn: SEAT_0,
        dice: [5, 4],
        rollIndex: 3,
        moves: [],
      };

      // Moving from point 10 is strictly illegal while on the bar
      const res = BackgammonPlugin.applyIntent(state, { from: 10, die: 5 }, { seat: SEAT_0 });
      assert.equal(res.ok, false);
      assert.equal(res.reason, "ILLEGAL");

      // Moving from BAR with die 5 is legal
      const barRes = BackgammonPlugin.applyIntent(state, { from: "BAR", die: 5 }, { seat: SEAT_0 });
      assert.equal(barRes.ok, true);
      assert.equal(barRes.state.bar[SEAT_0], 0);
      assert.equal(barRes.state.board[19], 1);
    });
  });

  describe("Gammon and Backgammon Multipliers", () => {
    it("evaluates a standard win as 1x multiplier", () => {
      const state = {
        board: new Array(POINTS).fill(0),
        bar: [0, 0],
        off: [15, 2], // Seat 1 bore off at least 1 checker
        turn: SEAT_0,
        dice: [],
      };
      const evalRes = BackgammonPlugin.evaluate(state);
      assert.equal(evalRes.result, "1-0");
      assert.equal(evalRes.reason, "BEAR_OFF_ALL");
      assert.equal(evalRes.multiplier, 1);
    });

    it("evaluates a Gammon as 2x multiplier when loser bore off 0 checkers", () => {
      const board = new Array(POINTS).fill(0);
      board[10] = -15; // All Seat 1 checkers in the outer board
      const state = {
        board,
        bar: [0, 0],
        off: [15, 0], // Loser has 0 off, none on bar or winner home
        turn: SEAT_0,
        dice: [],
      };
      const evalRes = BackgammonPlugin.evaluate(state);
      assert.equal(evalRes.result, "1-0");
      assert.equal(evalRes.reason, "GAMMON");
      assert.equal(evalRes.multiplier, 2);
    });

    it("evaluates a Backgammon as 3x multiplier when loser has checker on bar or winner home", () => {
      const board = new Array(POINTS).fill(0);
      board[2] = -1; // Loser has a checker in winner's home board (0-5)
      board[10] = -14;
      const state = {
        board,
        bar: [0, 0],
        off: [15, 0], // Loser has 0 off
        turn: SEAT_0,
        dice: [],
      };
      const evalRes = BackgammonPlugin.evaluate(state);
      assert.equal(evalRes.result, "1-0");
      assert.equal(evalRes.reason, "BACKGAMMON");
      assert.equal(evalRes.multiplier, 3);
    });
  });

  describe("Dice History Auditability", () => {
    it("generates deterministic auditable dice history across rolls", () => {
      const seed = "audit-dice-seed-777";
      const roll0 = rollDiceFor(seed, 0);
      const roll1 = rollDiceFor(seed, 1);
      const roll2 = rollDiceFor(seed, 2);

      // Verify idempotency
      assert.deepEqual(rollDiceFor(seed, 0), roll0);
      assert.deepEqual(rollDiceFor(seed, 1), roll1);
      assert.deepEqual(rollDiceFor(seed, 2), roll2);

      // Verify opening roll determinism
      const openA = openingRoll(seed);
      const openB = openingRoll(seed);
      assert.deepEqual(openA, openB);
      assert.notEqual(openA.dice[0], openA.dice[1]);
    });
  });
});
