import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  SEAT_0, SEAT_1, BOARD_SIZE, CELLS, initialBoard, pieceFor, seatOf,
  legalCells, isBoardFull, winningLineThrough,
} from "../src/gomoku.mjs";

const idx = (row, col) => row * BOARD_SIZE + col;

describe("board basics", () => {
  test("15x15, 225 cells", () => {
    assert.equal(BOARD_SIZE, 15);
    assert.equal(CELLS, 225);
    assert.equal(initialBoard().length, 225);
  });

  test("legalCells is every cell on an empty board, and shrinks as cells fill", () => {
    const board = initialBoard();
    assert.equal(legalCells(board).length, 225);
    board[0] = pieceFor(SEAT_0);
    assert.equal(legalCells(board).length, 224);
    assert.ok(!legalCells(board).includes(0));
  });

  test("isBoardFull is false until every cell is occupied", () => {
    const board = initialBoard();
    assert.equal(isBoardFull(board), false);
    board.fill(1);
    assert.equal(isBoardFull(board), true);
  });
});

describe("winningLineThrough", () => {
  test("null on an empty square", () => {
    const board = initialBoard();
    assert.equal(winningLineThrough(board, idx(7, 7)), null);
  });

  test("null for a run of only 4 -- five is the minimum", () => {
    const board = initialBoard();
    for (let c = 0; c < 4; c++) board[idx(0, c)] = pieceFor(SEAT_0);
    assert.equal(winningLineThrough(board, idx(0, 0)), null);
  });

  test("a horizontal run of exactly 5 wins, checked from any stone in the line", () => {
    const board = initialBoard();
    for (let c = 0; c < 5; c++) board[idx(3, c)] = pieceFor(SEAT_0);
    const line = winningLineThrough(board, idx(3, 2));
    assert.deepEqual(line, [idx(3, 0), idx(3, 1), idx(3, 2), idx(3, 3), idx(3, 4)]);
  });

  test("a vertical run of 5 wins", () => {
    const board = initialBoard();
    for (let r = 0; r < 5; r++) board[idx(r, 4)] = pieceFor(SEAT_1);
    const line = winningLineThrough(board, idx(2, 4));
    assert.equal(line.length, 5);
    assert.ok(line.every((i) => seatOf(board[i]) === SEAT_1));
  });

  test("both diagonal directions are checked", () => {
    const boardA = initialBoard();
    for (let i = 0; i < 5; i++) boardA[idx(i, i)] = pieceFor(SEAT_0); // main diagonal
    assert.equal(winningLineThrough(boardA, idx(2, 2)).length, 5);

    const boardB = initialBoard();
    for (let i = 0; i < 5; i++) boardB[idx(i, 4 - i)] = pieceFor(SEAT_0); // anti-diagonal
    assert.equal(winningLineThrough(boardB, idx(2, 2)).length, 5);
  });

  test("an overline (6+) counts as a win under Freestyle rules, and the FULL chain is returned", () => {
    const board = initialBoard();
    for (let c = 0; c < 6; c++) board[idx(5, c)] = pieceFor(SEAT_0);
    const line = winningLineThrough(board, idx(5, 3));
    assert.equal(line.length, 6);
  });

  test("a run is checked only for the mark actually at idx -- an opponent's adjacent stones never extend it", () => {
    const board = initialBoard();
    for (let c = 0; c < 4; c++) board[idx(6, c)] = pieceFor(SEAT_0);
    board[idx(6, 4)] = pieceFor(SEAT_1); // breaks the run
    assert.equal(winningLineThrough(board, idx(6, 4)), null);
  });
});
