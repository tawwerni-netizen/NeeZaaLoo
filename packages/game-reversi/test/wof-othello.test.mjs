import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  SEAT_0, SEAT_1, CELLS, BOARD_SIZE,
  initialBoard, seatOf, outflankedBy, isLegalMove, legalMoves,
  hasLegalMove, applyPlacement, pieceCount, isFull, other
} from "../src/reversi.mjs";
import { ReversiPlugin } from "../src/plugin.mjs";

const idx = (r, c) => r * BOARD_SIZE + c;

describe("World Othello Federation (WOF) Rules Compliance", () => {
  test("initial 8x8 board has exactly 4 center discs (2 black, 2 white) diagonally arranged", () => {
    const board = initialBoard();
    assert.equal(board.length, 64);
    assert.equal(seatOf(board[idx(3, 3)]), SEAT_1, "White at d4 / (3,3)");
    assert.equal(seatOf(board[idx(4, 4)]), SEAT_1, "White at e5 / (4,4)");
    assert.equal(seatOf(board[idx(3, 4)]), SEAT_0, "Black at e4 / (3,4)");
    assert.equal(seatOf(board[idx(4, 3)]), SEAT_0, "Black at d5 / (4,3)");
    assert.equal(pieceCount(board, SEAT_0), 2);
    assert.equal(pieceCount(board, SEAT_1), 2);
  });

  test("Black (Seat 0) always moves first", () => {
    const { state } = ReversiPlugin.createChallenge("seed-1");
    assert.equal(state.turn, SEAT_0);
  });

  test("standard 4 opening moves for Black", () => {
    const board = initialBoard();
    const legal = legalMoves(board, SEAT_0).sort((a, b) => a - b);
    const expected = [idx(2, 3), idx(3, 2), idx(4, 5), idx(5, 4)].sort((a, b) => a - b);
    assert.deepEqual(legal, expected);
  });

  test("multi-directional outflanking in a single placement", () => {
    // Construct a board where a single move outflanks opponents horizontally, vertically, AND diagonally
    const board = new Int8Array(CELLS);
    const center = idx(3, 3);
    // Move will be placed at (3,3) by Black (SEAT_0)
    // Horizontal right: (3,4) White, (3,5) Black
    board[idx(3, 4)] = -1;
    board[idx(3, 5)] = 1;

    // Vertical down: (4,3) White, (5,3) Black
    board[idx(4, 3)] = -1;
    board[idx(5, 3)] = 1;

    // Diagonal down-right: (4,4) White, (5,5) Black
    board[idx(4, 4)] = -1;
    board[idx(5, 5)] = 1;

    // Diagonal up-left: (2,2) White, (1,1) Black
    board[idx(2, 2)] = -1;
    board[idx(1, 1)] = 1;

    const flips = outflankedBy(board, center, SEAT_0);
    assert.ok(flips.includes(idx(3, 4)), "flips horizontal right");
    assert.ok(flips.includes(idx(4, 3)), "flips vertical down");
    assert.ok(flips.includes(idx(4, 4)), "flips diagonal down-right");
    assert.ok(flips.includes(idx(2, 2)), "flips diagonal up-left");
    assert.equal(flips.length, 4);

    const { board: nextBoard, flipped } = applyPlacement(board, center, SEAT_0);
    assert.equal(flipped.length, 4);
    assert.equal(seatOf(nextBoard[center]), SEAT_0);
    assert.equal(seatOf(nextBoard[idx(3, 4)]), SEAT_0);
    assert.equal(seatOf(nextBoard[idx(4, 3)]), SEAT_0);
    assert.equal(seatOf(nextBoard[idx(4, 4)]), SEAT_0);
    assert.equal(seatOf(nextBoard[idx(2, 2)]), SEAT_0);
  });

  test("flanking cannot bridge empty squares or own pieces", () => {
    const board = new Int8Array(CELLS);
    // (0,0) placement. (0,1) opponent, (0,2) EMPTY, (0,3) own piece
    board[idx(0, 1)] = -1;
    board[idx(0, 3)] = 1;
    assert.equal(isLegalMove(board, idx(0, 0), SEAT_0), false, "empty square prevents outflank");

    // (1,0) placement. (1,1) opponent, (1,2) opponent, (1,3) opponent (no closing own piece)
    board[idx(1, 1)] = -1;
    board[idx(1, 2)] = -1;
    board[idx(1, 3)] = -1;
    assert.equal(isLegalMove(board, idx(1, 0), SEAT_0), false, "unclosed opponent line is not outflanked");
  });

  test("forced pass when a player has no legal moves", () => {
    // Setup a board where Black has NO legal moves, but White has legal moves.
    // Only one Black disc at (0,2). White discs at (0,0), (0,1), (1,1), (2,0).
    const board = new Int8Array(CELLS);
    board[idx(0, 0)] = -1;
    board[idx(0, 1)] = -1;
    board[idx(0, 2)] = 1;
    board[idx(1, 1)] = -1;
    board[idx(2, 0)] = -1;

    assert.equal(hasLegalMove(board, SEAT_0), false, "Black has no legal move");
    assert.equal(hasLegalMove(board, SEAT_1), true, "White has legal moves");

    const state = { board, turn: SEAT_0, moves: [] };
    const ctx = { seat: SEAT_0 };

    // Black attempts to place on an empty square: REJECTED
    const placeRes = ReversiPlugin.applyIntent(state, { place: idx(0, 3) }, ctx);
    assert.equal(placeRes.ok, false);
    assert.equal(placeRes.reason, "ILLEGAL");

    // Black submits pass: ACCEPTED
    const passRes = ReversiPlugin.applyIntent(state, { pass: true }, ctx);
    assert.equal(passRes.ok, true);
    assert.equal(passRes.state.turn, SEAT_1, "Turn passes to opponent");
  });

  test("voluntary pass is illegal when legal moves exist", () => {
    const { state } = ReversiPlugin.createChallenge("seed-1");
    // Initial board: Black has 4 legal moves
    const res = ReversiPlugin.applyIntent(state, { pass: true }, { seat: SEAT_0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "ILLEGAL", "Cannot pass when legal move exists");
  });

  test("double pass / no legal moves terminates the game", () => {
    const board = new Int8Array(CELLS);
    // Setup position where neither can move (isolated pieces)
    board[idx(0, 0)] = 1;
    board[idx(0, 1)] = 1;
    board[idx(7, 7)] = -1;

    assert.equal(hasLegalMove(board, SEAT_0), false);
    assert.equal(hasLegalMove(board, SEAT_1), false);

    const state = { board, turn: SEAT_0, moves: [] };
    const outcome = ReversiPlugin.evaluate(state);
    assert.ok(outcome, "Game terminates immediately");
    assert.equal(outcome.reason, "NO_LEGAL_MOVES");
    assert.equal(outcome.result, "1-0", "Black has 2 discs vs White's 1 disc");

    const scores = ReversiPlugin.score(state);
    assert.deepEqual(scores, [1, 0]);
  });

  test("full board evaluates strictly by disc count", () => {
    const board = new Int8Array(CELLS);
    // Fill 35 with Black, 29 with White
    for (let i = 0; i < 35; i++) board[i] = 1;
    for (let i = 35; i < 64; i++) board[i] = -1;

    assert.ok(isFull(board));
    const state = { board, turn: SEAT_0, moves: [] };
    const outcome = ReversiPlugin.evaluate(state);
    assert.equal(outcome.reason, "BOARD_FULL");
    assert.equal(outcome.result, "1-0");
  });

  test("equal disc count evaluates to draw (1/2-1/2)", () => {
    const board = new Int8Array(CELLS);
    for (let i = 0; i < 32; i++) board[i] = 1;
    for (let i = 32; i < 64; i++) board[i] = -1;

    assert.ok(isFull(board));
    const state = { board, turn: SEAT_0, moves: [] };
    const outcome = ReversiPlugin.evaluate(state);
    assert.equal(outcome.reason, "BOARD_FULL");
    assert.equal(outcome.result, "1/2-1/2");

    const scores = ReversiPlugin.score(state);
    assert.deepEqual(scores, [0.5, 0.5]);
  });
});
