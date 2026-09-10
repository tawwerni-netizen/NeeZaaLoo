import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  initialBoard, legalMoves, applyMoveToBoard, hasNoMoves, pieceCount,
  labelToSquare, squareToLabel, SEAT_0, SEAT_1, EMPTY, MAN, KING,
} from "../src/checkers.mjs";

function emptyBoard() {
  return new Int8Array(64);
}

function place(board, label, piece) {
  const { row, col } = labelToSquare(label);
  board[row * 8 + col] = piece;
  return board;
}

function moveFor(board, seat, fromLabel, toLabel, forcedFrom = null) {
  const moves = legalMoves(board, seat, forcedFrom);
  const from = labelToSquare(fromLabel), to = labelToSquare(toLabel);
  return moves.find((m) => m.from.row === from.row && m.from.col === from.col && m.to.row === to.row && m.to.col === to.col);
}

describe("initial position", () => {
  test("12 pieces per side, on dark squares only, empty middle rows", () => {
    const board = initialBoard();
    assert.equal(pieceCount(board, SEAT_0), 12);
    assert.equal(pieceCount(board, SEAT_1), 12);
    for (let c = 0; c < 8; c++) {
      assert.equal(board[3 * 8 + c], EMPTY);
      assert.equal(board[4 * 8 + c], EMPTY);
    }
  });

  test("seat 0 has legal simple moves from the starting position", () => {
    const moves = legalMoves(initialBoard(), SEAT_0);
    assert.ok(moves.length > 0);
    assert.ok(moves.every((m) => !m.capture));
  });
});

describe("mandatory capture", () => {
  test("when a capture is available, non-capturing moves are illegal", () => {
    let board = emptyBoard();
    place(board, "c3", MAN);   // seat 0 man
    place(board, "d4", -MAN);  // seat 1 man, capturable
    const moves = legalMoves(board, SEAT_0);
    assert.ok(moves.length > 0);
    assert.ok(moves.every((m) => m.capture), "every legal move must be a capture when one exists");
    assert.ok(moveFor(board, SEAT_0, "c3", "e5", null)?.capture);
  });

  test("a capture removes the jumped piece", () => {
    let board = emptyBoard();
    place(board, "c3", MAN);
    place(board, "d4", -MAN);
    const move = moveFor(board, SEAT_0, "c3", "e5");
    const { board: after } = applyMoveToBoard(board, move);
    const jumped = labelToSquare("d4");
    assert.equal(after[jumped.row * 8 + jumped.col], EMPTY);
    const landed = labelToSquare("e5");
    assert.equal(after[landed.row * 8 + landed.col], MAN);
  });

  test("a man cannot capture backward", () => {
    const board = emptyBoard();
    place(board, "c3", MAN);   // seat 0, moves toward row 0 (forward = up)
    place(board, "b2", -MAN);  // adjacent, but behind it (toward row 7)
    const moves = legalMoves(board, SEAT_0);
    assert.ok(moves.length > 0, "forward simple moves still exist");
    assert.ok(moves.every((m) => !m.capture), "the piece behind it must never be capturable by a man");
  });

  test("a king can capture in any of the four diagonal directions", () => {
    let board = emptyBoard();
    place(board, "d4", KING);
    place(board, "c3", -MAN); // behind the king's forward direction
    const moves = legalMoves(board, SEAT_0);
    assert.ok(moves.some((m) => m.capture), "a king must be able to capture backward too");
  });
});

describe("multi-jump", () => {
  test("a piece that can capture again from its landing square must continue, and only from that square", () => {
    let board = emptyBoard();
    place(board, "a1", MAN);
    place(board, "b2", -MAN);
    place(board, "d4", -MAN);
    // a1 x b2 -> c3, then c3 x d4 -> e5
    const first = moveFor(board, SEAT_0, "a1", "c3");
    assert.ok(first?.capture);
    const { board: afterFirst, continuesFrom } = applyMoveToBoard(board, first);
    assert.ok(continuesFrom, "a further capture is available from c3, so the jump must continue");
    assert.equal(squareToLabel(continuesFrom.row, continuesFrom.col), "c3");

    const onlyLegal = legalMoves(afterFirst, SEAT_0, continuesFrom);
    assert.equal(onlyLegal.length, 1);
    assert.ok(onlyLegal[0].capture);
    assert.equal(squareToLabel(onlyLegal[0].to.row, onlyLegal[0].to.col), "e5");

    const second = moveFor(afterFirst, SEAT_0, "c3", "e5", continuesFrom);
    const { board: afterSecond, continuesFrom: doneNow } = applyMoveToBoard(afterFirst, second);
    assert.equal(doneNow, null, "no further capture available -- the multi-jump ends here");
    assert.equal(pieceCount(afterSecond, SEAT_1), 0, "both black men were captured in the sequence");
  });

  test("a capture that lands on the back rank promotes immediately and ends the turn there", () => {
    const board = emptyBoard();
    place(board, "d6", MAN);   // seat 0 man, two rows from promoting
    place(board, "c7", -MAN); // jumped
    // d6 x c7 -> b8, landing on row 0 (rank 8): promotes.
    const jump = moveFor(board, SEAT_0, "d6", "b8");
    assert.ok(jump?.capture);
    const { promoted, continuesFrom } = applyMoveToBoard(board, jump);
    assert.ok(promoted, "landing on the back rank must promote the man to a king");
    assert.equal(continuesFrom, null, "a mid-jump promotion ends the turn, per this ruleset's own documented rule");
  });
});

describe("king promotion", () => {
  test("a seat 0 man reaching row 0 (rank 8) becomes a king", () => {
    const board = emptyBoard();
    place(board, "c7", MAN); // one row from seat 0's promotion rank
    const moves = legalMoves(board, SEAT_0);
    assert.ok(moves.length > 0);
    const move = moves[0];
    const { board: after, promoted } = applyMoveToBoard(board, move);
    assert.ok(promoted);
    assert.equal(move.to.row, 0);
    assert.equal(Math.abs(after[move.to.row * 8 + move.to.col]), KING);
  });

  test("a seat 1 man reaching row 7 (rank 1) becomes a king", () => {
    const board = emptyBoard();
    place(board, "c2", -MAN); // one row from seat 1's promotion rank
    const moves = legalMoves(board, SEAT_1);
    assert.ok(moves.length > 0);
    const move = moves[0];
    const { board: after, promoted } = applyMoveToBoard(board, move);
    assert.ok(promoted);
    assert.equal(move.to.row, 7);
    assert.equal(Math.abs(after[move.to.row * 8 + move.to.col]), KING);
  });
});

describe("win by no legal moves", () => {
  test("a side with zero legal moves has lost, per this ruleset (not a draw)", () => {
    const board = emptyBoard();
    // Seat 1's only man (b8) has both forward diagonals occupied: one lands
    // off-board if jumped (a7, corner-adjacent), the other's jump landing
    // square is also occupied (d6) -- neither a simple move nor a capture
    // exists anywhere on the board for seat 1.
    place(board, "b8", -MAN);
    place(board, "a7", MAN);
    place(board, "c7", MAN);
    place(board, "d6", MAN);
    assert.ok(hasNoMoves(board, SEAT_1));
  });
});
