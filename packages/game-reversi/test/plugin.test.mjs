import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ReversiPlugin } from "../src/plugin.mjs";
import { SEAT_0, SEAT_1, CELLS } from "../src/reversi.mjs";

const idx = (row, col) => row * 8 + col;

function fresh() {
  return ReversiPlugin.createChallenge(null, {}).state;
}

describe("createChallenge / rehydrate / matchmakingDefaults", () => {
  test("always the standard starting position, seat 0 to move -- no per-duel randomness", () => {
    const a = ReversiPlugin.createChallenge("seed-a", {}).state;
    const b = ReversiPlugin.createChallenge("seed-b", {}).state;
    assert.deepEqual(Array.from(a.board), Array.from(b.board));
    assert.equal(a.turn, SEAT_0);
  });

  test("rehydrate() reconstructs the identical starting state matchmakingDefaults() persisted", () => {
    const defaults = ReversiPlugin.matchmakingDefaults();
    const rehydrated = ReversiPlugin.rehydrate(defaults.initialState).state;
    assert.deepEqual(Array.from(rehydrated.board), Array.from(fresh().board));
  });
});

describe("applyIntent -- placement", () => {
  test("a legal opening placement is accepted, flips the outflanked piece, and passes the turn", () => {
    const state = fresh();
    const res = ReversiPlugin.applyIntent(state, { place: idx(2, 3) }, { seat: SEAT_0, serverTimeMs: 0 });
    assert.equal(res.ok, true);
    assert.equal(res.state.turn, SEAT_1);
    assert.deepEqual(res.record.flipped, [idx(3, 3)]);
  });

  test("it is refused when it is not that seat's turn", () => {
    const state = fresh();
    const res = ReversiPlugin.applyIntent(state, { place: idx(2, 3) }, { seat: SEAT_1, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "NOT_YOUR_TURN");
  });

  test("a placement that outflanks nothing is refused", () => {
    const state = fresh();
    const res = ReversiPlugin.applyIntent(state, { place: idx(0, 0) }, { seat: SEAT_0, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "ILLEGAL");
  });

  test("MALFORMED for an out-of-range placement", () => {
    const state = fresh();
    const res = ReversiPlugin.applyIntent(state, { place: CELLS }, { seat: SEAT_0, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "MALFORMED");
  });
});

describe("applyIntent -- pass", () => {
  test("passing while a legal move exists is refused", () => {
    const state = fresh();
    const res = ReversiPlugin.applyIntent(state, { pass: true }, { seat: SEAT_0, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "ILLEGAL");
  });

  test("passing when genuinely stuck is accepted and hands the turn back", () => {
    // A position where seat 0 has no legal move anywhere: an all-seat-1
    // board with one empty square seat 0 could never outflank into (no
    // seat-0 piece on the board to close a line).
    const board = new Int8Array(CELLS).fill(-1);
    board[0] = 0;
    const state = { board, turn: SEAT_0, moves: [] };
    const res = ReversiPlugin.applyIntent(state, { pass: true }, { seat: SEAT_0, serverTimeMs: 0 });
    assert.equal(res.ok, true);
    assert.equal(res.state.turn, SEAT_1);
  });
});

describe("evaluate -- win, draw, and ending without a pointless pass", () => {
  test("a full board is scored by disc count", () => {
    const board = new Int8Array(CELLS).fill(1);
    board[0] = -1;
    const state = { board, turn: SEAT_0, moves: [] };
    const outcome = ReversiPlugin.evaluate(state);
    assert.equal(outcome.result, "1-0");
    assert.equal(outcome.reason, "BOARD_FULL");
  });

  test("an equal disc count on a full board is a draw", () => {
    const board = new Int8Array(CELLS);
    for (let i = 0; i < CELLS; i++) board[i] = i % 2 === 0 ? 1 : -1;
    const state = { board, turn: SEAT_0, moves: [] };
    const outcome = ReversiPlugin.evaluate(state);
    assert.equal(outcome.result, "1/2-1/2");
  });

  test("the game ends the instant NEITHER side has a legal move, without requiring an explicit pass first", () => {
    // An all-seat-0 board with a couple of empty squares that outflank
    // nothing for either side (no seat-1 piece anywhere to start a run).
    const board = new Int8Array(CELLS).fill(1);
    board[0] = 0;
    board[1] = 0;
    const state = { board, turn: SEAT_1, moves: [] };
    const outcome = ReversiPlugin.evaluate(state);
    assert.equal(outcome.reason, "NO_LEGAL_MOVES");
    assert.equal(outcome.result, "1-0"); // seat 0 holds every other disc
  });

  test("continues when only ONE side is stuck -- that is a pass, not game over", () => {
    const state = fresh();
    assert.equal(ReversiPlugin.evaluate(state), null);
  });
});

describe("project", () => {
  test("a spectator never sees legalMoves", () => {
    const state = fresh();
    const view = ReversiPlugin.project(state, "spectator");
    assert.equal(view.legalMoves, undefined);
    assert.deepEqual(view.counts, [2, 2]);
  });

  test("a player sees legalMoves for whichever seat is currently to move", () => {
    const state = fresh();
    const view = ReversiPlugin.project(state, "player");
    assert.equal(view.legalMoves.length, 4);
  });
});
