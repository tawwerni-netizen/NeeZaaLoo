import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { initialBoard, legalCells, isBoardFull, winningLine, place, SEAT_0, SEAT_1, LINES } from "../src/xo.mjs";

describe("board and placement", () => {
  test("an empty board offers all 9 cells", () => {
    assert.deepEqual(legalCells(initialBoard()), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test("placing on an occupied cell returns null", () => {
    const board = place(initialBoard(), 4, SEAT_0);
    assert.equal(place(board, 4, SEAT_1), null);
  });

  test("a full board has no legal cells", () => {
    let board = initialBoard();
    // Fill without completing a line: X O X / X O O / O X X
    const marks = [SEAT_0, SEAT_1, SEAT_0, SEAT_0, SEAT_1, SEAT_1, SEAT_1, SEAT_0, SEAT_0];
    for (let i = 0; i < 9; i++) board = place(board, i, marks[i]);
    assert.ok(isBoardFull(board));
    assert.deepEqual(legalCells(board), []);
  });
});

describe("win detection", () => {
  test("a completed row wins", () => {
    let board = initialBoard();
    board = place(board, 0, SEAT_0);
    board = place(board, 1, SEAT_0);
    board = place(board, 2, SEAT_0);
    assert.deepEqual(winningLine(board, 2), [0, 1, 2]);
  });

  test("a completed column wins", () => {
    let board = initialBoard();
    board = place(board, 0, SEAT_0);
    board = place(board, 3, SEAT_0);
    board = place(board, 6, SEAT_0);
    assert.deepEqual(winningLine(board, 6), [0, 3, 6]);
  });

  test("a completed diagonal wins", () => {
    let board = initialBoard();
    board = place(board, 0, SEAT_1);
    board = place(board, 4, SEAT_1);
    board = place(board, 8, SEAT_1);
    assert.deepEqual(winningLine(board, 8), [0, 4, 8]);
  });

  test("the other diagonal wins too", () => {
    let board = initialBoard();
    board = place(board, 2, SEAT_1);
    board = place(board, 4, SEAT_1);
    board = place(board, 6, SEAT_1);
    assert.deepEqual(winningLine(board, 6), [2, 4, 6]);
  });

  test("two in a row is not a win", () => {
    let board = initialBoard();
    board = place(board, 0, SEAT_0);
    board = place(board, 1, SEAT_0);
    assert.equal(winningLine(board, 1), null);
  });

  test("a mixed line never wins", () => {
    let board = initialBoard();
    board = place(board, 0, SEAT_0);
    board = place(board, 1, SEAT_1);
    board = place(board, 2, SEAT_0);
    assert.equal(winningLine(board, 2), null);
  });

  test("there are exactly 8 standard lines", () => {
    assert.equal(LINES.length, 8);
  });
});
