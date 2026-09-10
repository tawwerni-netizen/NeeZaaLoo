import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  SEAT_0, SEAT_1, CELLS, CENTER, initialBoard, isCenter, orthogonalNeighbors,
  seatOf, pieceFor, legalPlacements, legalMoves, hasNoMoves, applyMove, pieceCount, positionKey,
} from "../src/seega.mjs";

describe("board basics", () => {
  test("25 cells, center is index 12", () => {
    assert.equal(CELLS, 25);
    assert.equal(CENTER, 12);
    assert.equal(isCenter(12), true);
    assert.equal(isCenter(0), false);
  });

  test("orthogonalNeighbors never crosses the board edge, and never includes diagonals", () => {
    assert.deepEqual(new Set(orthogonalNeighbors(0)), new Set([1, 5])); // top-left corner
    assert.deepEqual(new Set(orthogonalNeighbors(CENTER)), new Set([7, 17, 11, 13]));
  });
});

describe("legalPlacements", () => {
  test("every square except the center, on an empty board", () => {
    const board = initialBoard();
    const placements = legalPlacements(board);
    assert.equal(placements.length, 24);
    assert.ok(!placements.includes(CENTER));
  });

  test("an occupied square is never a legal placement", () => {
    const board = initialBoard();
    board[0] = pieceFor(SEAT_0);
    assert.ok(!legalPlacements(board).includes(0));
  });
});

describe("legalMoves (movement phase)", () => {
  test("a piece may slide one step into an adjacent empty square, never diagonally", () => {
    const board = initialBoard();
    board[6] = pieceFor(SEAT_0); // row1,col1 -- neighbors 1,5,7,11
    const moves = legalMoves(board, SEAT_0);
    const targets = moves.map((m) => m.to).sort((a, b) => a - b);
    assert.deepEqual(targets, [1, 5, 7, 11]);
  });

  test("an occupied neighbor (own or enemy) is never a legal destination", () => {
    const board = initialBoard();
    board[6] = pieceFor(SEAT_0);
    board[1] = pieceFor(SEAT_1); // blocks one neighbor of idx6
    board[5] = pieceFor(SEAT_0); // blocks another neighbor of idx6 (and is itself a second seat-0 mover)
    const movesFrom6 = legalMoves(board, SEAT_0)
      .filter((m) => m.from === 6)
      .map((m) => m.to)
      .sort((a, b) => a - b);
    assert.deepEqual(movesFrom6, [7, 11]);
  });

  test("hasNoMoves is true only when every one of the seat's pieces is fully boxed in", () => {
    const board = initialBoard();
    board[6] = pieceFor(SEAT_0);
    board[1] = pieceFor(SEAT_1);
    board[5] = pieceFor(SEAT_1);
    board[7] = pieceFor(SEAT_1);
    board[11] = pieceFor(SEAT_1);
    assert.equal(hasNoMoves(board, SEAT_0), true);
  });
});

describe("applyMove -- single-piece custodial capture", () => {
  test("a lone enemy piece flanked by the mover's pieces on both sides is captured", () => {
    // Row 0: [seat0 at 0] [seat1 at 1] [empty at 2] -- seat0 piece at 3 moves to 2? No:
    // set up: seat0 at idx0, seat1 at idx1, seat0 moves a piece from idx? to idx2 so that
    // idx1 (seat1) sits between idx0(seat0, already there) and idx2 (seat0, just moved).
    const board = initialBoard();
    board[0] = pieceFor(SEAT_0);
    board[1] = pieceFor(SEAT_1);
    board[7] = pieceFor(SEAT_0); // will slide to 2 (7's neighbors: 2,6,8,12)
    const { board: next, captured } = applyMove(board, 7, 2, SEAT_0);
    assert.deepEqual(captured, [1]);
    assert.equal(next[1], 0);
    assert.equal(seatOf(next[2]), SEAT_0);
  });

  test("moving INTO a flank (between two enemy pieces) is safe -- no self-capture", () => {
    const board = initialBoard();
    board[0] = pieceFor(SEAT_1);
    board[2] = pieceFor(SEAT_1);
    board[6] = pieceFor(SEAT_0); // slides to 1, landing directly between the two seat1 pieces
    const { board: next, captured } = applyMove(board, 6, 1, SEAT_0);
    assert.deepEqual(captured, []);
    assert.equal(seatOf(next[1]), SEAT_0), "the mover's own piece survives unharmed";
  });

  test("multiple directions can each capture independently from one move", () => {
    // Place the mover's landing square with an enemy-then-own flank on TWO sides at once.
    const board = initialBoard();
    board[CENTER - 1] = pieceFor(SEAT_1);   // left of center
    board[CENTER - 2] = pieceFor(SEAT_0);   // beyond that, mover's own
    board[CENTER + 1] = pieceFor(SEAT_1);   // right of center
    board[CENTER + 2] = pieceFor(SEAT_0);   // beyond that, mover's own
    board[CENTER + 5] = pieceFor(SEAT_0);   // one row below center, moves up into center
    const { captured } = applyMove(board, CENTER + 5, CENTER, SEAT_0);
    assert.deepEqual(new Set(captured), new Set([CENTER - 1, CENTER + 1]));
  });

  test("a capture never reaches through more than one enemy piece (no long capture)", () => {
    // Row 0: idx1(enemy) idx2(enemy) idx3(mover, just landed) -- two enemy
    // pieces in a row are never captured together; the immediate neighbor
    // of the landing square is enemy, but the square beyond THAT is enemy
    // too, not the mover's own, so nothing is captured.
    const board = initialBoard();
    board[1] = pieceFor(SEAT_1);
    board[2] = pieceFor(SEAT_1);
    board[8] = pieceFor(SEAT_0); // idx8's neighbors include idx3 (directly above it)
    const { captured } = applyMove(board, 8, 3, SEAT_0);
    assert.deepEqual(captured, []);
  });
});

describe("pieceCount / positionKey", () => {
  test("pieceCount reflects only that seat's own pieces", () => {
    const board = initialBoard();
    board[0] = pieceFor(SEAT_0);
    board[1] = pieceFor(SEAT_0);
    board[2] = pieceFor(SEAT_1);
    assert.equal(pieceCount(board, SEAT_0), 2);
    assert.equal(pieceCount(board, SEAT_1), 1);
  });

  test("positionKey differs when the side to move differs, even for an identical board", () => {
    const board = initialBoard();
    assert.notEqual(positionKey(board, SEAT_0), positionKey(board, SEAT_1));
  });
});
