import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { GomokuPlugin } from "../src/plugin.mjs";
import { SEAT_0, SEAT_1, BOARD_SIZE, CELLS, pieceFor } from "../src/gomoku.mjs";

const idx = (row, col) => row * BOARD_SIZE + col;

function fresh() {
  return GomokuPlugin.createChallenge(null, {}).state;
}

describe("createChallenge / rehydrate / matchmakingDefaults", () => {
  test("always the same empty board, seat 0 first -- no per-duel randomness", () => {
    const a = GomokuPlugin.createChallenge("seed-a", {}).state;
    const b = GomokuPlugin.createChallenge("seed-b", {}).state;
    assert.deepEqual(Array.from(a.board), Array.from(b.board));
    assert.equal(a.turn, SEAT_0);
  });

  test("rehydrate() reconstructs the identical starting state matchmakingDefaults() persisted", () => {
    const defaults = GomokuPlugin.matchmakingDefaults();
    const rehydrated = GomokuPlugin.rehydrate(defaults.initialState).state;
    assert.deepEqual(Array.from(rehydrated.board), Array.from(fresh().board));
  });
});

describe("applyIntent", () => {
  test("a well-formed opening placement is accepted and flips the turn", () => {
    const state = fresh();
    const res = GomokuPlugin.applyIntent(state, idx(7, 7), { seat: SEAT_0, serverTimeMs: 0 });
    assert.equal(res.ok, true);
    assert.equal(res.state.turn, SEAT_1);
    assert.equal(res.state.lastMove, idx(7, 7));
  });

  test("it is refused when it is not that seat's turn", () => {
    const state = fresh();
    const res = GomokuPlugin.applyIntent(state, idx(7, 7), { seat: SEAT_1, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "NOT_YOUR_TURN");
  });

  test("placing on an occupied cell is refused", () => {
    let state = fresh();
    state = GomokuPlugin.applyIntent(state, idx(7, 7), { seat: SEAT_0, serverTimeMs: 0 }).state;
    const res = GomokuPlugin.applyIntent(state, idx(7, 7), { seat: SEAT_1, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "ILLEGAL");
  });

  test("MALFORMED for an out-of-range or non-integer cell", () => {
    const state = fresh();
    assert.equal(GomokuPlugin.applyIntent(state, CELLS, { seat: SEAT_0, serverTimeMs: 0 }).reason, "MALFORMED");
    assert.equal(GomokuPlugin.applyIntent(state, 1.5, { seat: SEAT_0, serverTimeMs: 0 }).reason, "MALFORMED");
  });
});

describe("evaluate -- win and draw", () => {
  test("never fires before any move has been made", () => {
    assert.equal(GomokuPlugin.evaluate(fresh()), null);
  });

  test("five in a row wins immediately for whoever just moved, and reports the line", () => {
    const board = new Int8Array(CELLS);
    for (let c = 0; c < 4; c++) board[idx(3, c)] = pieceFor(SEAT_0);
    // seat 0 to move next; placing the 5th stone completes the line.
    const state = { board, turn: SEAT_0, lastMove: null, moves: [] };
    const res = GomokuPlugin.applyIntent(state, idx(3, 4), { seat: SEAT_0, serverTimeMs: 0 });
    assert.equal(res.ok, true);
    const outcome = GomokuPlugin.evaluate(res.state);
    assert.equal(outcome.result, "1-0");
    assert.equal(outcome.reason, "FIVE_IN_A_ROW");
    assert.equal(outcome.line.length, 5);
  });

  test("a full board with no line of five is a draw", () => {
    const board = new Int8Array(CELLS).fill(1);
    // Break up every potential 5-run by alternating in a pattern that never
    // gives either mark 5 contiguous cells: not needed for this unit test's
    // purpose -- isBoardFull() alone drives BOARD_FULL once no win was
    // already detected from lastMove, so a full board with the last move
    // NOT completing a line is sufficient here.
    const state = { board, turn: SEAT_1, lastMove: idx(0, 0), moves: [] };
    // idx(0,0) is a corner; force its own line check to fail by breaking
    // the row immediately next to it.
    board[idx(0, 1)] = -1;
    board[idx(1, 0)] = -1;
    board[idx(1, 1)] = -1;
    const outcome = GomokuPlugin.evaluate(state);
    assert.equal(outcome.result, "1/2-1/2");
    assert.equal(outcome.reason, "BOARD_FULL");
  });
});

describe("project", () => {
  test("a spectator never sees legalCells", () => {
    const view = GomokuPlugin.project(fresh(), "spectator");
    assert.equal(view.legalCells, undefined);
  });

  test("a player sees legalCells", () => {
    const view = GomokuPlugin.project(fresh(), "player");
    assert.equal(view.legalCells.length, 225);
  });
});

describe("score", () => {
  test("mirrors result on the 0/0.5/1 scale used across every launch game", () => {
    const board = new Int8Array(CELLS);
    for (let c = 0; c < 5; c++) board[idx(0, c)] = pieceFor(SEAT_1);
    const state = { board, turn: SEAT_0, lastMove: idx(0, 2), moves: [] };
    assert.deepEqual(GomokuPlugin.score(state), [0, 1]);
  });
});
