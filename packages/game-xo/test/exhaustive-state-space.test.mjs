import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  initialBoard,
  place,
  legalCells,
  isBoardFull,
  winningLine,
  SEAT_0,
  SEAT_1,
  LINES,
  EMPTY,
} from "../src/xo.mjs";
import { XOPlugin } from "../src/plugin.mjs";

describe("XO Exhaustive State-Space & Game-Theoretic Validation", () => {
  function checkWinner(board) {
    for (const [a, b, c] of LINES) {
      if (board[a] !== EMPTY && board[a] === board[b] && board[a] === board[c]) {
        return board[a] === 1 ? SEAT_0 : SEAT_1;
      }
    }
    return null;
  }

  function serialize(board, turn) {
    return `${Array.from(board).join(",")}:${turn}`;
  }

  // Minimax cache
  const memo = new Map();

  function minimax(board, turn) {
    const key = serialize(board, turn);
    if (memo.has(key)) return memo.get(key);

    const winner = checkWinner(board);
    if (winner === SEAT_0) return 1;
    if (winner === SEAT_1) return -1;
    if (isBoardFull(board)) return 0;

    const legals = legalCells(board);
    if (turn === SEAT_0) {
      let maxVal = -Infinity;
      for (const cell of legals) {
        const next = place(board, cell, SEAT_0);
        const val = minimax(next, SEAT_1);
        if (val > maxVal) maxVal = val;
        if (maxVal === 1) break; // alpha-beta prune / max possible
      }
      memo.set(key, maxVal);
      return maxVal;
    } else {
      let minVal = Infinity;
      for (const cell of legals) {
        const next = place(board, cell, SEAT_1);
        const val = minimax(next, SEAT_0);
        if (val < minVal) minVal = val;
        if (minVal === -1) break; // min possible
      }
      memo.set(key, minVal);
      return minVal;
    }
  }

  it("proves the game-theoretic value of standard 3x3 Tic-Tac-Toe is exactly 0 (Draw)", () => {
    const root = initialBoard();
    const value = minimax(root, SEAT_0);
    assert.equal(value, 0, "Game-theoretic value of XO must be 0 (Draw under optimal play)");
  });

  it("exhaustively explores all reachable states and validates state invariants", () => {
    const visited = new Set();
    let terminalStates = 0;
    let seat0Wins = 0;
    let seat1Wins = 0;
    let draws = 0;

    function dfs(board, turn) {
      const stateKey = serialize(board, turn);
      if (visited.has(stateKey)) return;
      visited.add(stateKey);

      const winner = checkWinner(board);
      if (winner !== null) {
        terminalStates++;
        if (winner === SEAT_0) seat0Wins++;
        else seat1Wins++;

        // Mutual exclusivity invariant: opposing player must NOT also have a winning line
        const oppMark = winner === SEAT_0 ? -1 : 1;
        for (const [a, b, c] of LINES) {
          assert.ok(
            !(board[a] === oppMark && board[b] === oppMark && board[c] === oppMark),
            "No state may contain simultaneous winning lines for both players"
          );
        }
        return;
      }

      if (isBoardFull(board)) {
        terminalStates++;
        draws++;
        return;
      }

      // Non-terminal: must have legal cells
      const legals = legalCells(board);
      assert.ok(legals.length > 0, "Non-terminal board must have legal moves");

      for (const cell of legals) {
        const nextBoard = place(board, cell, turn);
        dfs(nextBoard, turn === SEAT_0 ? SEAT_1 : SEAT_0);
      }
    }

    dfs(initialBoard(), SEAT_0);

    // Standard theoretical game tree facts for 3x3 Tic-Tac-Toe:
    // Reachable valid states is 5,478 states (including root)
    assert.equal(visited.size, 5478, "Total reachable XO game-states must equal 5,478");
    assert.equal(terminalStates, 958, "Total terminal XO states must equal 958");
    assert.ok(draws > 0);
    assert.ok(seat0Wins > 0);
    assert.ok(seat1Wins > 0);
  });

  it("verifies that two optimal minimax players always result in a draw", () => {
    let board = initialBoard();
    let turn = SEAT_0;
    const moves = [];

    while (checkWinner(board) === null && !isBoardFull(board)) {
      const legals = legalCells(board);
      let bestMove = -1;
      let targetVal = turn === SEAT_0 ? -Infinity : Infinity;

      for (const cell of legals) {
        const next = place(board, cell, turn);
        const val = minimax(next, turn === SEAT_0 ? SEAT_1 : SEAT_0);
        if (turn === SEAT_0) {
          if (val > targetVal) {
            targetVal = val;
            bestMove = cell;
          }
        } else {
          if (val < targetVal) {
            targetVal = val;
            bestMove = cell;
          }
        }
      }

      // Move must preserve the draw (0)
      assert.equal(targetVal, 0, `Optimal move by seat ${turn} must preserve draw value`);
      board = place(board, bestMove, turn);
      moves.push({ seat: turn, cell: bestMove });
      turn = turn === SEAT_0 ? SEAT_1 : SEAT_0;
    }

    const winner = checkWinner(board);
    assert.equal(winner, null, "Game between two optimal minimax players must have no winner");
    assert.equal(isBoardFull(board), true, "Game must end with all cells full");
    assert.equal(moves.length, 9, "Optimal XO game must play out to exactly 9 moves");
  });

  it("verifies XOPlugin contract integration and scoring under optimal play", () => {
    const { state } = XOPlugin.createChallenge("xo-optimal-sim", {});
    let current = state;

    // Simulate 9 moves of the canonical drawn game:
    // [0, 4, 8, 2, 6, 3, 5, 7, 1]
    const cells = [0, 4, 8, 2, 6, 3, 5, 7, 1];
    for (let i = 0; i < 9; i++) {
      const seat = i % 2;
      const res = XOPlugin.applyIntent(current, { cell: cells[i] }, { seat });
      assert.equal(res.ok, true, `Move ${i} at cell ${cells[i]} must be accepted`);
      current = res.state;
    }

    const outcome = XOPlugin.evaluate(current);
    assert.deepEqual(outcome, { result: "1/2-1/2", reason: "BOARD_FULL" });

    const scores = XOPlugin.score(current);
    assert.deepEqual(scores, [0.5, 0.5]);
  });
});
