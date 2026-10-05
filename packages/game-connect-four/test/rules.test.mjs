import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  initialBoard, drop, lowestEmptyRow, legalColumns, isBoardFull, isWinningPlacement,
  SEAT_0, SEAT_1, COLS, ROWS,
} from "../src/connect-four.mjs";

describe("board and column placement", () => {
  test("an empty board offers all 7 columns", () => {
    assert.deepEqual(legalColumns(initialBoard()), [0, 1, 2, 3, 4, 5, 6]);
  });

  test("a token falls to the lowest empty row in its column", () => {
    let board = initialBoard();
    let r = drop(board, 3, SEAT_0);
    assert.equal(r.row, 0);
    r = drop(r.board, 3, SEAT_1);
    assert.equal(r.row, 1);
  });

  test("a full column is not a legal placement", () => {
    let board = initialBoard();
    for (let i = 0; i < ROWS; i++) board = drop(board, 0, i % 2).board;
    assert.equal(lowestEmptyRow(board, 0), -1);
    assert.ok(!legalColumns(board).includes(0));
    assert.equal(drop(board, 0, SEAT_0), null);
  });

  test("a full board has no legal columns", () => {
    let board = initialBoard();
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) board = drop(board, c, r % 2).board;
    }
    assert.ok(isBoardFull(board));
    assert.deepEqual(legalColumns(board), []);
  });
});

describe("win detection", () => {
  test("four in a horizontal row", () => {
    let board = initialBoard();
    for (const c of [0, 1, 2, 3]) board = drop(board, c, SEAT_0).board;
    assert.ok(isWinningPlacement(board, 0, 3));
  });

  test("four in a vertical column", () => {
    let board = initialBoard();
    for (let i = 0; i < 4; i++) board = drop(board, 2, SEAT_0).board;
    assert.ok(isWinningPlacement(board, 3, 2));
  });

  test("four on a rising diagonal", () => {
    // Build a staircase: seat 0 at (0,0),(1,1),(2,2),(3,3), with seat 1
    // filler tokens propping up each column so gravity lands them right.
    let board = initialBoard();
    board = drop(board, 0, SEAT_0).board; // (0,0)
    board = drop(board, 1, SEAT_1).board; // (0,1) filler
    board = drop(board, 1, SEAT_0).board; // (1,1)
    board = drop(board, 2, SEAT_1).board; // (0,2)
    board = drop(board, 2, SEAT_1).board; // (1,2)
    board = drop(board, 2, SEAT_0).board; // (2,2)
    board = drop(board, 3, SEAT_1).board; // (0,3)
    board = drop(board, 3, SEAT_1).board; // (1,3)
    board = drop(board, 3, SEAT_1).board; // (2,3)
    board = drop(board, 3, SEAT_0).board; // (3,3)
    assert.ok(isWinningPlacement(board, 3, 3));
  });

  test("four on a falling diagonal", () => {
    let board = initialBoard();
    board = drop(board, 3, SEAT_0).board; // (0,3)
    board = drop(board, 2, SEAT_1).board; // (0,2) filler
    board = drop(board, 2, SEAT_0).board; // (1,2)
    board = drop(board, 1, SEAT_1).board; // (0,1)
    board = drop(board, 1, SEAT_1).board; // (1,1)
    board = drop(board, 1, SEAT_0).board; // (2,1)
    board = drop(board, 0, SEAT_1).board; // (0,0)
    board = drop(board, 0, SEAT_1).board; // (1,0)
    board = drop(board, 0, SEAT_1).board; // (2,0)
    board = drop(board, 0, SEAT_0).board; // (3,0)
    assert.ok(isWinningPlacement(board, 3, 0));
  });

  test("three in a row is not a win", () => {
    let board = initialBoard();
    for (const c of [0, 1, 2]) board = drop(board, c, SEAT_0).board;
    assert.ok(!isWinningPlacement(board, 0, 2));
  });

  test("a placement completing someone ELSE's line is not double-counted as a win for the wrong token", () => {
    let board = initialBoard();
    for (const c of [0, 1, 2]) board = drop(board, c, SEAT_0).board;
    const r = drop(board, 3, SEAT_1);
    assert.ok(!isWinningPlacement(r.board, r.row, r.col), "seat 1's own token does not complete seat 0's line");
  });
});
