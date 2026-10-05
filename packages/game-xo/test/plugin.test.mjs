import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { XOPlugin } from "../src/plugin.mjs";
import { SEAT_0, SEAT_1 } from "../src/xo.mjs";

function freshState() {
  return XOPlugin.createChallenge(null, {}).state;
}

function move(state, cell, seat) {
  const res = XOPlugin.applyIntent(state, cell, { seat, serverTimeMs: 0 });
  assert.equal(res.ok, true, `cell ${cell} for seat ${seat}: ${res.reason}`);
  return res.state;
}

describe("createChallenge / rehydrate", () => {
  test("always an empty board, seat 0 (X) to move first", () => {
    const state = freshState();
    assert.ok(state.board.every((c) => c === 0));
    assert.equal(state.turn, SEAT_0);
  });

  test("rehydrate() reconstructs the identical starting state", () => {
    const defaults = XOPlugin.matchmakingDefaults();
    const rehydrated = XOPlugin.rehydrate(defaults.initialState).state;
    assert.deepEqual(Array.from(rehydrated.board), Array.from(freshState().board));
  });
});

describe("applyIntent", () => {
  test("a legal placement is accepted and turn passes", () => {
    const state = move(freshState(), 4, SEAT_0);
    assert.equal(state.turn, SEAT_1);
    assert.equal(state.lastMove, 4);
  });

  test("it is not seat 1's turn at the start", () => {
    const res = XOPlugin.applyIntent(freshState(), 0, { seat: SEAT_1, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "NOT_YOUR_TURN");
  });

  test("a malformed intent (non-integer or out of range) is refused", () => {
    const state = freshState();
    assert.equal(XOPlugin.applyIntent(state, "4", { seat: SEAT_0, serverTimeMs: 0 }).reason, "MALFORMED");
    assert.equal(XOPlugin.applyIntent(state, 9, { seat: SEAT_0, serverTimeMs: 0 }).reason, "MALFORMED");
    assert.equal(XOPlugin.applyIntent(state, -1, { seat: SEAT_0, serverTimeMs: 0 }).reason, "MALFORMED");
  });

  test("placing on an occupied cell is refused as ILLEGAL", () => {
    let state = move(freshState(), 4, SEAT_0);
    const res = XOPlugin.applyIntent(state, 4, { seat: SEAT_1, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "ILLEGAL");
  });
});

describe("evaluate -- win and draw", () => {
  test("a completed line ends the game for the player who just moved", () => {
    let state = freshState();
    state = move(state, 0, SEAT_0);
    state = move(state, 3, SEAT_1);
    state = move(state, 1, SEAT_0);
    state = move(state, 4, SEAT_1);
    state = move(state, 2, SEAT_0); // X completes the top row
    const outcome = XOPlugin.evaluate(state);
    assert.deepEqual(outcome, { result: "1-0", reason: "LINE_COMPLETE" });
    assert.deepEqual(XOPlugin.score(state), [1, 0]);
  });

  test("a full board with no line is a draw", () => {
    let state = freshState();
    // X O X / X O O / O X X -- verified line-free in rules.test.mjs
    const order = [
      [0, SEAT_0], [1, SEAT_1], [2, SEAT_0],
      [4, SEAT_1], [3, SEAT_0], [5, SEAT_1],
      [7, SEAT_0], [6, SEAT_1], [8, SEAT_0],
    ];
    for (const [cell, seat] of order) state = move(state, cell, seat);
    const outcome = XOPlugin.evaluate(state);
    assert.deepEqual(outcome, { result: "1/2-1/2", reason: "BOARD_FULL" });
    assert.deepEqual(XOPlugin.score(state), [0.5, 0.5]);
  });

  test("the game continues when no line and the board is not full", () => {
    const state = move(freshState(), 4, SEAT_0);
    assert.equal(XOPlugin.evaluate(state), null);
  });
});

describe("project", () => {
  test("a spectator never receives legalCells", () => {
    const state = freshState();
    assert.equal("legalCells" in XOPlugin.project(state, "spectator"), false);
    assert.ok(Array.isArray(XOPlugin.project(state, "player").legalCells));
  });
});

describe("serializeReplay", () => {
  test("initialOnly carries no move history; a full replay does", () => {
    const state = move(freshState(), 4, SEAT_0);
    assert.deepEqual(XOPlugin.serializeReplay(state, { initialOnly: true }), {});
    assert.deepEqual(XOPlugin.serializeReplay(state), { moves: [4] });
  });
});

describe("fairPlaySignals", () => {
  test("fewer than 5 recorded move times yields no signal", () => {
    assert.deepEqual(XOPlugin.fairPlaySignals(freshState(), { moveTimesMs: [100, 200] }), []);
  });

  test("suspiciously uniform move timing produces a TIMING signal", () => {
    const times = new Array(10).fill(500);
    const signals = XOPlugin.fairPlaySignals(freshState(), { moveTimesMs: times });
    assert.equal(signals.length, 1);
    assert.equal(signals[0].kind, "TIMING");
  });
});
