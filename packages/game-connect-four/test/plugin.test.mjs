import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ConnectFourPlugin } from "../src/plugin.mjs";
import { SEAT_0, SEAT_1 } from "../src/connect-four.mjs";

function freshState() {
  return ConnectFourPlugin.createChallenge(null, {}).state;
}

describe("createChallenge / rehydrate", () => {
  test("always an empty board, seat 0 to move first", () => {
    const state = freshState();
    assert.ok(state.board.every((c) => c === 0));
    assert.equal(state.turn, SEAT_0);
  });

  test("rehydrate() reconstructs the identical starting state", () => {
    const defaults = ConnectFourPlugin.matchmakingDefaults();
    const rehydrated = ConnectFourPlugin.rehydrate(defaults.initialState).state;
    assert.deepEqual(Array.from(rehydrated.board), Array.from(freshState().board));
  });
});

describe("applyIntent", () => {
  test("a legal column drop for seat 0 is accepted and turn passes", () => {
    const res = ConnectFourPlugin.applyIntent(freshState(), 3, { seat: SEAT_0, serverTimeMs: 0 });
    assert.equal(res.ok, true);
    assert.equal(res.state.turn, SEAT_1);
    assert.equal(res.state.lastMove.col, 3);
  });

  test("it is not seat 1's turn at the start", () => {
    const res = ConnectFourPlugin.applyIntent(freshState(), 3, { seat: SEAT_1, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "NOT_YOUR_TURN");
  });

  test("a malformed intent (non-integer, or out of range) is refused", () => {
    const state = freshState();
    assert.equal(ConnectFourPlugin.applyIntent(state, "3", { seat: SEAT_0, serverTimeMs: 0 }).reason, "MALFORMED");
    assert.equal(ConnectFourPlugin.applyIntent(state, 7, { seat: SEAT_0, serverTimeMs: 0 }).reason, "MALFORMED");
    assert.equal(ConnectFourPlugin.applyIntent(state, -1, { seat: SEAT_0, serverTimeMs: 0 }).reason, "MALFORMED");
  });

  test("dropping into a full column is refused as ILLEGAL", () => {
    let state = freshState();
    let seat = SEAT_0;
    for (let i = 0; i < 6; i++) {
      const res = ConnectFourPlugin.applyIntent(state, 2, { seat, serverTimeMs: 0 });
      assert.equal(res.ok, true);
      state = res.state;
      seat = seat === SEAT_0 ? SEAT_1 : SEAT_0;
    }
    const res = ConnectFourPlugin.applyIntent(state, 2, { seat, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "ILLEGAL");
  });
});

describe("evaluate -- win and draw", () => {
  test("four in a row ends the game for the player who just moved", () => {
    let state = freshState();
    // Seat 0 builds a horizontal four on row 0 across columns 0-3, with
    // seat 1 playing elsewhere (column 6) so it never blocks.
    const plays = [[0, SEAT_0], [6, SEAT_1], [1, SEAT_0], [6, SEAT_1], [2, SEAT_0], [6, SEAT_1], [3, SEAT_0]];
    for (const [col, seat] of plays) {
      const res = ConnectFourPlugin.applyIntent(state, col, { seat, serverTimeMs: 0 });
      assert.equal(res.ok, true);
      state = res.state;
    }
    const outcome = ConnectFourPlugin.evaluate(state);
    assert.deepEqual(outcome, { result: "1-0", reason: "FOUR_IN_A_ROW" });
    assert.deepEqual(ConnectFourPlugin.score(state), [1, 0]);
  });

  test("a completely filled board with no line of four is a draw", () => {
    // Turn strictly alternates by ply count, which on a 7-wide (odd)
    // board forces play-order parity to equal (row+col) parity -- an
    // unavoidable checkerboard that DOES contain diagonal fours once
    // filled (verified: (r,c) and (r+1,c+1) always share that parity).
    // So a real, legally-played 42-move draw cannot be built by simply
    // picking a "safe" per-cell pattern and alternating turns through
    // applyIntent -- constructing one is a real combinatorial puzzle, not
    // this test's job. What IS this test's job is evaluate()'s own
    // BOARD_FULL detection, given a board that is actually full and
    // actually free of any line of four: seat(r,c) = ((r+2c) mod 4) < 2
    // stepping by horizontal/vertical/either-diagonal changes (r+2c) by a
    // fixed non-zero amount mod 4 each step, cycling through all four
    // residues before repeating -- so no direction ever produces a run
    // longer than 2. Built directly as a state object (not played move by
    // move) since evaluate() only ever reads state.board/state.lastMove.
    const seatAt = (r, c) => (((r + 2 * c) % 4 + 4) % 4) < 2 ? 0 : 1;
    const board = new Int8Array(42);
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 7; c++) board[r * 7 + c] = seatAt(r, c) === 0 ? 1 : -1;
    }
    const state = { board, turn: SEAT_0, lastMove: { row: 5, col: 6 }, plyCount: 42, moves: [] };
    assert.equal(ConnectFourPlugin.evaluate(state)?.reason !== "FOUR_IN_A_ROW", true, "the constructed board must contain no line of four");
    const outcome = ConnectFourPlugin.evaluate(state);
    assert.deepEqual(outcome, { result: "1/2-1/2", reason: "BOARD_FULL" });
  });
});

describe("project", () => {
  test("a spectator never receives legalColumns", () => {
    const state = freshState();
    assert.equal("legalColumns" in ConnectFourPlugin.project(state, "spectator"), false);
    assert.ok(Array.isArray(ConnectFourPlugin.project(state, "player", 0).legalColumns));
  });
});

describe("serializeReplay", () => {
  test("initialOnly carries no move history; a full replay does", () => {
    const after = ConnectFourPlugin.applyIntent(freshState(), 3, { seat: SEAT_0, serverTimeMs: 0 }).state;
    assert.deepEqual(ConnectFourPlugin.serializeReplay(after, { initialOnly: true }), {});
    assert.deepEqual(ConnectFourPlugin.serializeReplay(after), { moves: [3] });
  });
});
