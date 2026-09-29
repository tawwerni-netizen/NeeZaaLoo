import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  dealAllFives,
  calculateEndSum,
  roundToNearestFive,
  createAllFivesState,
  applyAllFivesIntent,
  VARIANT_ALL_FIVES,
} from "../src/all-fives.mjs";
import { DominoesPlugin } from "../src/plugin.mjs";

describe("Dominoes: American All-Fives Engine", () => {
  describe("Deal and Setup", () => {
    it("deals exactly 7 tiles to each player and 14 to the boneyard", () => {
      const { hand0, hand1, boneyard } = dealAllFives("test-seed-42");
      assert.equal(hand0.length, 7);
      assert.equal(hand1.length, 7);
      assert.equal(boneyard.length, 14);

      // Verify no duplicates across all 28 tiles
      const all = [...hand0, ...hand1, ...boneyard];
      assert.equal(all.length, 28);
      const keys = new Set(all.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
      assert.equal(keys.size, 28);
    });

    it("identifies highest double as opening leader", () => {
      const state = createAllFivesState("opening-test-1");
      assert.equal(state.variant, VARIANT_ALL_FIVES);
      assert.ok(state.turn === 0 || state.turn === 1);
      assert.equal(state.scores[0], 0);
      assert.equal(state.scores[1], 0);
      assert.equal(state.boneyard.length, 14);
      assert.equal(state.line.tiles.length, 0);
    });
  });

  describe("End Sum Calculation and Scoring", () => {
    it("scores an opening double of 5-5 as 10", () => {
      const sum = calculateEndSum({ tiles: [[5, 5]], left: 5, right: 5 });
      assert.equal(sum, 10);
    });

    it("scores an opening non-double of 4-1 as 5", () => {
      const sum = calculateEndSum({ tiles: [[4, 1]], left: 4, right: 1 });
      assert.equal(sum, 5);
    });

    it("does not score an opening of 6-2 (sum 8)", () => {
      const sum = calculateEndSum({ tiles: [[6, 2]], left: 6, right: 2 });
      assert.equal(sum, 8);
      assert.notEqual(sum % 5, 0);
    });

    it("evaluates open ends on multi-tile lines with crosswise end doubles", () => {
      // Line: [5, 5] (end double), [5, 3], [3, 0] (single end)
      // Left end is [5, 5] = 10. Right end is 0 = 0. Sum = 10.
      const line1 = {
        tiles: [[5, 5], [5, 3], [3, 0]],
        left: 5,
        right: 0,
      };
      assert.equal(calculateEndSum(line1), 10);

      // Line: [2, 5], [5, 5], [5, 3], [3, 3] (end double)
      // Left end is 2. Right end is [3, 3] = 6. Sum = 8.
      const line2 = {
        tiles: [[2, 5], [5, 5], [5, 3], [3, 3]],
        left: 2,
        right: 3,
      };
      assert.equal(calculateEndSum(line2), 8);

      // Line: [2, 5], [5, 5], [5, 3], [3, 4]
      // Left end is 2. Right end is 4. Sum = 6.
      const line3 = {
        tiles: [[2, 5], [5, 5], [5, 3], [3, 4]],
        left: 2,
        right: 4,
      };
      assert.equal(calculateEndSum(line3), 6);
    });

    it("rounds remaining pips to nearest 5 on round finish", () => {
      assert.equal(roundToNearestFive(0), 0);
      assert.equal(roundToNearestFive(1), 0);
      assert.equal(roundToNearestFive(2), 0);
      assert.equal(roundToNearestFive(3), 5);
      assert.equal(roundToNearestFive(4), 5);
      assert.equal(roundToNearestFive(5), 5);
      assert.equal(roundToNearestFive(6), 5);
      assert.equal(roundToNearestFive(7), 5);
      assert.equal(roundToNearestFive(8), 10);
      assert.equal(roundToNearestFive(12), 10);
      assert.equal(roundToNearestFive(13), 15);
      assert.equal(roundToNearestFive(17), 15);
      assert.equal(roundToNearestFive(18), 20);
    });
  });

  describe("Play Intent Execution and Point Accrual", () => {
    it("awards 10 points when opening with 5-5", () => {
      const state = {
        variant: VARIANT_ALL_FIVES,
        hands: [
          [[5, 5], [5, 2], [1, 1], [0, 4], [2, 3], [3, 3], [6, 1]],
          [[6, 6], [4, 4], [0, 0], [1, 2], [2, 4], [3, 5], [4, 6]],
        ],
        boneyard: [[0, 1], [0, 2], [0, 3], [0, 5], [1, 3], [1, 4], [1, 5], [1, 6], [2, 2], [2, 5], [2, 6], [3, 4], [3, 6], [5, 6]],
        scores: [0, 0],
        targetScore: 100,
        line: { left: null, right: null, tiles: [] },
        turn: 0,
        consecutivePasses: 0,
        moves: [],
        winner: null,
        isOver: false,
      };

      const res = applyAllFivesIntent(state, { tile: [5, 5] }, 0);
      assert.equal(res.ok, true);
      assert.equal(res.state.scores[0], 10);
      assert.equal(res.state.scores[1], 0);
      assert.equal(res.state.turn, 1);
      assert.equal(res.state.line.left, 5);
      assert.equal(res.state.line.right, 5);
    });

    it("awards 5 points when opponent plays [5, 0] making ends 5 and 0", () => {
      const state = {
        variant: VARIANT_ALL_FIVES,
        hands: [
          [[5, 2]],
          [[5, 0], [4, 4]],
        ],
        boneyard: [[0, 1], [0, 2], [0, 3]],
        scores: [10, 0],
        targetScore: 100,
        line: { left: 5, right: 5, tiles: [[5, 5]] },
        turn: 1,
        consecutivePasses: 0,
        moves: [],
        winner: null,
        isOver: false,
      };

      const res = applyAllFivesIntent(state, { tile: [5, 0], end: "RIGHT" }, 1);
      assert.equal(res.ok, true);
      // Left end is [5, 5] (exposed double = 10), right is 0 -> sum = 10, scores 10 points!
      assert.equal(res.state.scores[1], 10);
      assert.equal(res.state.line.right, 0);
    });

    it("prohibits drawing when legal play exists", () => {
      const state = {
        variant: VARIANT_ALL_FIVES,
        hands: [[[5, 2]], [[6, 6]]],
        boneyard: [[0, 1], [0, 2], [0, 3], [0, 4]],
        scores: [0, 0],
        targetScore: 100,
        line: { left: 5, right: 3, tiles: [[5, 3]] },
        turn: 0,
        consecutivePasses: 0,
        moves: [],
        winner: null,
        isOver: false,
      };

      const res = applyAllFivesIntent(state, { action: "DRAW" }, 0);
      assert.equal(res.ok, false);
      assert.equal(res.reason, "LEGAL_MOVE_EXISTS_CANNOT_DRAW");
    });

    it("draws from boneyard when no legal move exists", () => {
      const state = {
        variant: VARIANT_ALL_FIVES,
        hands: [[[1, 2]], [[6, 6]]],
        boneyard: [[0, 1], [0, 2], [5, 4]],
        scores: [0, 0],
        targetScore: 100,
        line: { left: 5, right: 3, tiles: [[5, 3]] },
        turn: 0,
        consecutivePasses: 0,
        moves: [],
        winner: null,
        isOver: false,
      };

      const res = applyAllFivesIntent(state, { action: "DRAW" }, 0);
      assert.equal(res.ok, true);
      assert.equal(res.state.hands[0].length, 2);
      assert.equal(res.state.boneyard.length, 2);
    });

    it("prohibits passing when boneyard has more than 2 tiles", () => {
      const state = {
        variant: VARIANT_ALL_FIVES,
        hands: [[[1, 2]], [[6, 6]]],
        boneyard: [[0, 1], [0, 2], [0, 3]],
        scores: [0, 0],
        targetScore: 100,
        line: { left: 5, right: 3, tiles: [[5, 3]] },
        turn: 0,
        consecutivePasses: 0,
        moves: [],
        winner: null,
        isOver: false,
      };

      const res = applyAllFivesIntent(state, { action: "PASS" }, 0);
      assert.equal(res.ok, false);
      assert.equal(res.reason, "MUST_DRAW_BEFORE_PASSING");
    });

    it("allows passing when boneyard has 2 or fewer tiles and no legal move", () => {
      const state = {
        variant: VARIANT_ALL_FIVES,
        hands: [[[1, 2]], [[6, 6]]],
        boneyard: [[0, 1], [0, 2]],
        scores: [0, 0],
        targetScore: 100,
        line: { left: 5, right: 3, tiles: [[5, 3]] },
        turn: 0,
        consecutivePasses: 0,
        moves: [],
        winner: null,
        isOver: false,
      };

      const res = applyAllFivesIntent(state, { action: "PASS" }, 0);
      assert.equal(res.ok, true);
      assert.equal(res.state.consecutivePasses, 1);
      assert.equal(res.state.turn, 1);
    });

    it("resolves domino-out and awards rounded opponent pips", () => {
      const state = {
        variant: VARIANT_ALL_FIVES,
        hands: [
          [[5, 3]], // Seat 0 has 1 tile
          [[6, 6], [2, 1]], // Seat 1 has 12 + 3 = 15 pips -> rounded to 15
        ],
        boneyard: [[0, 1], [0, 2]],
        scores: [20, 10],
        targetScore: 100,
        line: { left: 5, right: 2, tiles: [[5, 2]] },
        turn: 0,
        consecutivePasses: 0,
        moves: [],
        winner: null,
        isOver: false,
      };

      const res = applyAllFivesIntent(state, { tile: [5, 3], end: "LEFT" }, 0);
      assert.equal(res.ok, true);
      assert.equal(res.state.isOver, true);
      assert.equal(res.state.winner, 0);
      assert.equal(res.state.hands[0].length, 0);
      // Play makes ends 3 and 2 (sum 5) -> +5 points. Plus 15 pips bonus from opponent -> 20 + 5 + 15 = 40
      assert.equal(res.state.scores[0], 40);
    });
  });

  describe("Plugin Contract Integration", () => {
    it("creates an All-Fives challenge through DominoesPlugin", () => {
      const { state } = DominoesPlugin.createChallenge("all-fives-seed-99", { variant: "all_fives" });
      assert.equal(state.variant, VARIANT_ALL_FIVES);
      assert.equal(state.hands[0].length, 7);
      assert.equal(state.hands[1].length, 7);
      assert.equal(state.boneyard.length, 14);

      const proj = DominoesPlugin.project(state, "player", 0);
      assert.equal(proj.variant, VARIANT_ALL_FIVES);
      assert.equal(proj.boneyardCount, 14);
      assert.ok(Array.isArray(proj.hand));

      const specProj = DominoesPlugin.project(state, "spectator");
      assert.equal(specProj.variant, VARIANT_ALL_FIVES);
      assert.equal(specProj.hand, undefined);
    });

    it("evaluates and scores All-Fives states cleanly", () => {
      const finishedState = {
        variant: VARIANT_ALL_FIVES,
        hands: [[], [[1, 2]]],
        scores: [65, 30],
        isOver: true,
        winner: 0,
      };

      const evalRes = DominoesPlugin.evaluate(finishedState);
      assert.deepEqual(evalRes, { result: "1-0", reason: "DOMINO_OUT" });

      const scores = DominoesPlugin.score(finishedState);
      assert.deepEqual(scores, [65, 30]);
    });
  });
});
