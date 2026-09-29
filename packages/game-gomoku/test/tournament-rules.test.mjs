import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_SIZE,
  CELLS,
  CENTER_CELL,
  initialBoard,
  winningLineThrough,
  SEAT_0,
  SEAT_1,
  pieceFor,
} from "../src/gomoku.mjs";
import { GomokuPlugin } from "../src/plugin.mjs";

describe("International Gomoku Tournament Rules Engine (RIF-GOMOKU-v1)", () => {
  describe("Board Geometry & Center Opening", () => {
    it("confirms 15x15 board geometry with 225 intersection points", () => {
      assert.equal(BOARD_SIZE, 15);
      assert.equal(CELLS, 225);
      assert.equal(CENTER_CELL, 112); // row 7, col 7: 7*15 + 7 = 112 (h8)
    });

    it("enforces mandatory center opening (cell 112) when configured", () => {
      const { state } = GomokuPlugin.createChallenge("seed-tourney", { centerOpening: true });
      assert.equal(state.moves.length, 0);

      // Attempting to open anywhere else (e.g. cell 0) must be rejected
      const badOpen = GomokuPlugin.applyIntent(state, { cell: 0 }, { seat: SEAT_0 });
      assert.equal(badOpen.ok, false);
      assert.equal(badOpen.reason, "CENTER_OPENING_REQUIRED");

      // Opening at center (112) must be accepted
      const goodOpen = GomokuPlugin.applyIntent(state, { cell: CENTER_CELL }, { seat: SEAT_0 });
      assert.equal(goodOpen.ok, true);
      assert.equal(goodOpen.state.board[CENTER_CELL], pieceFor(SEAT_0));
      assert.equal(goodOpen.state.turn, SEAT_1);
    });
  });

  describe("Overline Policy: Freestyle vs Exact Five (RIF Standard)", () => {
    it("awards victory for overline (6+ stones) under Freestyle rules", () => {
      const board = initialBoard();
      // Place 6 consecutive horizontal stones along row 5: cols 2, 3, 4, 5, 6, 7
      for (let c = 2; c <= 7; c++) {
        board[5 * 15 + c] = 1; // Seat 0 stone
      }

      // Freestyle: exactFive = false
      const line = winningLineThrough(board, 5 * 15 + 7, { exactFive: false });
      assert.ok(line !== null, "Overline must be a win in Freestyle");
      assert.equal(line.length, 6);
    });

    it("disallows victory for overline (6+ stones) under Exact Five (RIF standard)", () => {
      const board = initialBoard();
      // Place 6 consecutive stones:
      for (let c = 2; c <= 7; c++) {
        board[5 * 15 + c] = 1;
      }

      // Exact Five: exactFive = true
      const line = winningLineThrough(board, 5 * 15 + 7, { exactFive: true });
      assert.equal(line, null, "Overline must NOT win under Exact Five / RIF policy");
    });

    it("awards victory for exactly 5 stones under both policies", () => {
      const board = initialBoard();
      for (let c = 2; c <= 6; c++) {
        board[5 * 15 + c] = 1;
      }

      const lineFreestyle = winningLineThrough(board, 5 * 15 + 6, { exactFive: false });
      assert.ok(lineFreestyle !== null);
      assert.equal(lineFreestyle.length, 5);

      const lineExact = winningLineThrough(board, 5 * 15 + 6, { exactFive: true });
      assert.ok(lineExact !== null);
      assert.equal(lineExact.length, 5);
    });
  });

  describe("Win Detection on All 4 Axes", () => {
    it("detects vertical 5-in-a-row", () => {
      const board = initialBoard();
      for (let r = 3; r <= 7; r++) {
        board[r * 15 + 4] = -1; // Seat 1 stones
      }
      const line = winningLineThrough(board, 7 * 15 + 4);
      assert.ok(line);
      assert.equal(line.length, 5);
    });

    it("detects diagonal (top-left to bottom-right) 5-in-a-row", () => {
      const board = initialBoard();
      for (let i = 0; i < 5; i++) {
        board[(2 + i) * 15 + (2 + i)] = 1;
      }
      const line = winningLineThrough(board, 6 * 15 + 6);
      assert.ok(line);
      assert.equal(line.length, 5);
    });

    it("detects anti-diagonal (top-right to bottom-left) 5-in-a-row", () => {
      const board = initialBoard();
      for (let i = 0; i < 5; i++) {
        board[(2 + i) * 15 + (10 - i)] = 1;
      }
      const line = winningLineThrough(board, 6 * 15 + 6);
      assert.ok(line);
      assert.equal(line.length, 5);
    });
  });

  describe("Tournament Plugin Adjudication", () => {
    it("evaluates win and score correctly through GomokuPlugin", () => {
      const { state } = GomokuPlugin.createChallenge("gomoku-tourney-eval", { exactFive: true });
      // Play 5 in a row for seat 0, alternating with seat 1 playing elsewhere
      let cur = state;
      for (let i = 0; i < 4; i++) {
        cur = GomokuPlugin.applyIntent(cur, { cell: 5 * 15 + i }, { seat: SEAT_0 }).state;
        cur = GomokuPlugin.applyIntent(cur, { cell: 0 * 15 + i }, { seat: SEAT_1 }).state;
      }
      // 5th stone for seat 0
      cur = GomokuPlugin.applyIntent(cur, { cell: 5 * 15 + 4 }, { seat: SEAT_0 }).state;

      const evalRes = GomokuPlugin.evaluate(cur);
      assert.deepEqual(evalRes.result, "1-0");
      assert.equal(evalRes.reason, "FIVE_IN_A_ROW");
      assert.equal(evalRes.line.length, 5);

      const scoreRes = GomokuPlugin.score(cur);
      assert.deepEqual(scoreRes, [1, 0]);
    });
  });
});
