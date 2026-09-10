import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  SEAT_0, SEAT_1, CELLS, initialBoard, seatOf, outflankedBy, isLegalMove,
  legalMoves, hasLegalMove, applyPlacement, pieceCount, isFull,
} from "../src/reversi.mjs";

const idx = (row, col) => row * 8 + col;

describe("initialBoard", () => {
  test("the standard starting position, seat 0 (Black) to move", () => {
    const board = initialBoard();
    assert.equal(seatOf(board[idx(3, 3)]), SEAT_1);
    assert.equal(seatOf(board[idx(4, 4)]), SEAT_1);
    assert.equal(seatOf(board[idx(3, 4)]), SEAT_0);
    assert.equal(seatOf(board[idx(4, 3)]), SEAT_0);
    assert.equal(pieceCount(board, SEAT_0), 2);
    assert.equal(pieceCount(board, SEAT_1), 2);
  });

  test("the four legal opening moves for Black are the four standard squares", () => {
    const board = initialBoard();
    const moves = legalMoves(board, SEAT_0).sort((a, b) => a - b);
    const expected = [idx(2, 3), idx(3, 2), idx(4, 5), idx(5, 4)].sort((a, b) => a - b);
    assert.deepEqual(moves, expected);
  });
});

describe("outflankedBy / isLegalMove", () => {
  test("a placement that outflanks nothing is illegal even on an empty square", () => {
    const board = initialBoard();
    assert.equal(isLegalMove(board, idx(0, 0), SEAT_0), false);
  });

  test("an occupied square is never legal", () => {
    const board = initialBoard();
    assert.equal(isLegalMove(board, idx(3, 3), SEAT_0), false);
  });

  test("flips exactly the contiguous opponent run between the placement and the mover's own piece", () => {
    const board = initialBoard();
    // Black plays d3 (row2,col3): outflanks White at d4 (row3,col3)? No --
    // standard opening d3 outflanks (3,3) in the vertical direction down
    // to (4,3) which is Black's own -- i.e. (2,3)->(3,3)White->(4,3)Black.
    const flips = outflankedBy(board, idx(2, 3), SEAT_0);
    assert.deepEqual(flips, [idx(3, 3)]);
  });

  test("a run of opponent pieces that ends in an EMPTY square (not the mover's own) outflanks nothing", () => {
    const board = new Int8Array(CELLS);
    board[idx(0, 1)] = 1;  // seat 0 (opponent, from seat 1's perspective)
    board[idx(0, 2)] = 1;  // seat 0
    // (0,3) left empty -- the run never closes with a seat-1 piece.
    const flips = outflankedBy(board, idx(0, 0), SEAT_1);
    assert.deepEqual(flips, []);
  });

  test("a run that DOES close with the mover's own piece outflanks the whole contiguous run", () => {
    const board = new Int8Array(CELLS);
    board[idx(0, 1)] = 1;  // seat 0
    board[idx(0, 2)] = 1;  // seat 0
    board[idx(0, 3)] = -1; // seat 1 -- closes the line
    const flips = outflankedBy(board, idx(0, 0), SEAT_1);
    assert.deepEqual(flips, [idx(0, 1), idx(0, 2)]);
  });
});

describe("applyPlacement", () => {
  test("flips every outflanked piece to the mover's colour and places the new piece", () => {
    const board = initialBoard();
    const { board: next, flipped } = applyPlacement(board, idx(2, 3), SEAT_0);
    assert.deepEqual(flipped, [idx(3, 3)]);
    assert.equal(seatOf(next[idx(3, 3)]), SEAT_0);
    assert.equal(seatOf(next[idx(2, 3)]), SEAT_0);
    assert.equal(pieceCount(next, SEAT_0), 4);
    assert.equal(pieceCount(next, SEAT_1), 1);
  });
});

describe("hasLegalMove / isFull", () => {
  test("the standard opening position always has a legal move for both sides", () => {
    const board = initialBoard();
    assert.equal(hasLegalMove(board, SEAT_0), true);
    assert.equal(hasLegalMove(board, SEAT_1), true);
  });

  test("an empty board is never full; a completely filled board is", () => {
    assert.equal(isFull(new Int8Array(CELLS)), false);
    assert.equal(isFull(new Int8Array(CELLS).fill(1)), true);
  });
});
