import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  initialBoard,
  legalMoves,
  applyMoveToBoard,
  hasNoMoves,
  positionKey,
  SEAT_0,
  SEAT_1,
  MAN,
  KING,
  EMPTY,
  BOARD_SIZE,
  NO_CAPTURE_DRAW_PLIES,
} from "../src/checkers.mjs";
import { CheckersPlugin } from "../src/plugin.mjs";

function idx(row, col) {
  return row * BOARD_SIZE + col;
}

describe("American Checkers (English Draughts) Rules Engine", () => {
  describe("Pawn & King Movement Rules", () => {
    it("restricts men to single-square diagonal forward movements only", () => {
      const board = new Int8Array(64);
      board[idx(4, 3)] = MAN; // Seat 0 man in the middle

      const moves = legalMoves(board, SEAT_0);
      assert.equal(moves.length, 2);
      // Seat 0 moves toward row 0 (forward is decreasing row: row 3)
      for (const m of moves) {
        assert.equal(m.from.row, 4);
        assert.equal(m.from.col, 3);
        assert.equal(m.to.row, 3);
        assert.ok(m.to.col === 2 || m.to.col === 4);
        assert.equal(m.capture, false);
      }
    });

    it("restricts Kings to single-square diagonal movement in all 4 directions (no flying kings)", () => {
      const board = new Int8Array(64);
      board[idx(4, 3)] = KING; // Seat 0 King in center

      const moves = legalMoves(board, SEAT_0);
      assert.equal(moves.length, 4, "King must have 4 single-step diagonal moves");
      const destinations = moves.map((m) => `${m.to.row},${m.to.col}`).sort();
      assert.deepEqual(destinations, ["3,2", "3,4", "5,2", "5,4"]);

      // Verify King cannot jump 2 empty squares (no flying kings like International Draughts)
      for (const m of moves) {
        const rowDiff = Math.abs(m.to.row - m.from.row);
        const colDiff = Math.abs(m.to.col - m.from.col);
        assert.equal(rowDiff, 1);
        assert.equal(colDiff, 1);
      }
    });
  });

  describe("Mandatory Capture & Multi-Jump Rules", () => {
    it("enforces mandatory capture: simple moves are forbidden when a jump exists", () => {
      const board = new Int8Array(64);
      board[idx(4, 3)] = MAN;  // Seat 0 man can capture
      board[idx(3, 4)] = -MAN; // Seat 1 opponent man
      board[idx(2, 5)] = EMPTY;// Landing square
      board[idx(5, 0)] = MAN;  // Another Seat 0 man that has a simple move (5,0 -> 4,1)

      const moves = legalMoves(board, SEAT_0);
      // All legal moves MUST be captures:
      assert.ok(moves.length > 0);
      for (const m of moves) {
        assert.equal(m.capture, true, "Mandatory capture rule must suppress all simple moves");
      }
      assert.equal(moves.length, 1);
      assert.deepEqual(moves[0].from, { row: 4, col: 3 });
      assert.deepEqual(moves[0].to, { row: 2, col: 5 });
    });

    it("enforces mandatory multi-jump with the same piece", () => {
      const board = new Int8Array(64);
      // Double jump setup for Seat 0:
      // (6, 1) jumps over (5, 2) landing on (4, 3)
      // from (4, 3) can immediately jump over (3, 4) landing on (2, 5)
      board[idx(6, 1)] = MAN;
      board[idx(5, 2)] = -MAN;
      board[idx(3, 4)] = -MAN;

      const firstMoves = legalMoves(board, SEAT_0);
      assert.equal(firstMoves.length, 1);

      const step1 = applyMoveToBoard(board, firstMoves[0]);
      assert.equal(step1.promoted, false);
      assert.deepEqual(step1.continuesFrom, { row: 4, col: 3 }, "Must flag mandatory continuation");

      // Next legal moves MUST be forced from (4, 3):
      const followUp = legalMoves(step1.board, SEAT_0, step1.continuesFrom);
      assert.equal(followUp.length, 1);
      assert.deepEqual(followUp[0].from, { row: 4, col: 3 });
      assert.deepEqual(followUp[0].to, { row: 2, col: 5 });
    });
  });

  describe("Crowning and Turn Ending", () => {
    it("crowns man on reaching far rank and ends turn immediately even if jump exists", () => {
      const board = new Int8Array(64);
      // Seat 0 man at (2, 1) jumps over (1, 2) to land on (0, 3) (far rank -> CROWNED!)
      // Suppose an opponent piece is at (1, 4) which a king could theoretically jump backward to (2, 5).
      board[idx(2, 1)] = MAN;
      board[idx(1, 2)] = -MAN;
      board[idx(1, 4)] = -MAN;

      const moves = legalMoves(board, SEAT_0);
      assert.equal(moves.length, 1);

      const result = applyMoveToBoard(board, moves[0]);
      assert.equal(result.promoted, true, "Must be crowned as King");
      assert.equal(result.board[idx(0, 3)], KING);
      // American rules: promotion ends the turn immediately; continuesFrom must be null!
      assert.equal(result.continuesFrom, null, "Crowning must end the turn immediately");
    });
  });

  describe("40-Move Rule and Repetition Adjudication", () => {
    it("adjudicates draw after 40 full moves (80 plies) without capture", () => {
      const { state } = CheckersPlugin.createChallenge("checkers-draw-test", {});
      const drawnState = {
        ...state,
        plySinceCapture: NO_CAPTURE_DRAW_PLIES,
      };

      const outcome = CheckersPlugin.evaluate(drawnState);
      assert.deepEqual(outcome, { result: "1/2-1/2", reason: "FORTY_MOVE_RULE" });

      const scores = CheckersPlugin.score(drawnState);
      assert.deepEqual(scores, [0.5, 0.5]);
    });

    it("adjudicates draw upon threefold repetition of position and turn", () => {
      const { state } = CheckersPlugin.createChallenge("checkers-rep-test", {});
      const key = positionKey(state.board, state.turn);
      const repState = {
        ...state,
        history: [key, "other", key, "other2", key],
      };

      const outcome = CheckersPlugin.evaluate(repState);
      assert.deepEqual(outcome, { result: "1/2-1/2", reason: "THREEFOLD_REPETITION" });
    });

    it("declares loss for player who has no legal moves (stalemate is a LOSS in Checkers)", () => {
      const board = new Int8Array(64);
      // Seat 0 man is trapped at (0, 1) with no moves
      board[idx(0, 1)] = MAN; // cannot move forward (at edge)
      const noMoves = hasNoMoves(board, SEAT_0);
      assert.equal(noMoves, true);

      const state = {
        board,
        turn: SEAT_0,
        forcedFrom: null,
        pliesSinceCapture: 0,
        history: [],
      };
      const outcome = CheckersPlugin.evaluate(state);
      // Seat 0 has no moves -> Seat 1 wins ("0-1", reason: NO_LEGAL_MOVES)
      assert.deepEqual(outcome, { result: "0-1", reason: "NO_LEGAL_MOVES" });
    });
  });
});
