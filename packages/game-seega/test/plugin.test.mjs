import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { SeegaPlugin } from "../src/plugin.mjs";
import { SEAT_0, SEAT_1, CENTER, PIECES_PER_SIDE, pieceFor, Phase } from "../src/seega.mjs";

function fresh() {
  return SeegaPlugin.createChallenge(null, {}).state;
}

describe("createChallenge / rehydrate / matchmakingDefaults", () => {
  test("always the same empty board, placement phase, seat 0 first -- no per-duel randomness", () => {
    const a = SeegaPlugin.createChallenge("seed-a", {}).state;
    const b = SeegaPlugin.createChallenge("seed-b", {}).state;
    assert.deepEqual(Array.from(a.board), Array.from(b.board));
    assert.equal(a.phase, Phase.PLACEMENT);
    assert.equal(a.turn, SEAT_0);
  });

  test("rehydrate() reconstructs the identical starting state matchmakingDefaults() persisted", () => {
    const defaults = SeegaPlugin.matchmakingDefaults();
    const rehydrated = SeegaPlugin.rehydrate(defaults.initialState).state;
    const fresh0 = fresh();
    assert.deepEqual(Array.from(rehydrated.board), Array.from(fresh0.board));
  });
});

describe("applyIntent -- placement phase", () => {
  test("a legal placement is accepted, alternates turn, and rejects the center square", () => {
    const state = fresh();
    const centerRes = SeegaPlugin.applyIntent(state, { place: CENTER }, { seat: SEAT_0, serverTimeMs: 0 });
    assert.equal(centerRes.ok, false);
    assert.equal(centerRes.reason, "ILLEGAL");

    const res = SeegaPlugin.applyIntent(state, { place: 0 }, { seat: SEAT_0, serverTimeMs: 0 });
    assert.equal(res.ok, true);
    assert.equal(res.state.turn, SEAT_1);
    assert.equal(res.state.placedCount[SEAT_0], 1);
  });

  test("it is refused when it is not that seat's turn", () => {
    const state = fresh();
    const res = SeegaPlugin.applyIntent(state, { place: 1 }, { seat: SEAT_1, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "NOT_YOUR_TURN");
  });

  test("placing on an already-occupied square is refused", () => {
    let state = fresh();
    state = SeegaPlugin.applyIntent(state, { place: 0 }, { seat: SEAT_0, serverTimeMs: 0 }).state;
    const res = SeegaPlugin.applyIntent(state, { place: 0 }, { seat: SEAT_1, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "ILLEGAL");
  });

  test("after all 24 pieces are placed, the phase switches to MOVEMENT and seat 1 (who placed second) moves first", () => {
    let state = fresh();
    let seat = SEAT_0;
    let square = 0;
    for (let i = 0; i < PIECES_PER_SIDE * 2; i++) {
      while (square === CENTER) square++;
      const res = SeegaPlugin.applyIntent(state, { place: square }, { seat, serverTimeMs: 0 });
      assert.equal(res.ok, true, `placement ${i} at ${square} must succeed`);
      state = res.state;
      seat = seat === SEAT_0 ? SEAT_1 : SEAT_0;
      square++;
    }
    assert.equal(state.phase, Phase.MOVEMENT);
    assert.equal(state.turn, SEAT_1);
    assert.equal(state.placedCount[SEAT_0], PIECES_PER_SIDE);
    assert.equal(state.placedCount[SEAT_1], PIECES_PER_SIDE);
    // Only the center square remains empty.
    const emptySquares = state.board.reduce((acc, v, i) => (v === 0 ? [...acc, i] : acc), []);
    assert.deepEqual(emptySquares, [CENTER]);
  });
});

describe("applyIntent -- movement phase", () => {
  function movementState() {
    const board = new Int8Array(25);
    board[7] = pieceFor(SEAT_1); // adjacent to center, seat 1 moves first
    return {
      phase: Phase.MOVEMENT, board, turn: SEAT_1, placedCount: [12, 12],
      plySinceCapture: 0, history: [], moves: [],
    };
  }

  test("a legal slide into the center is accepted", () => {
    const state = movementState();
    const res = SeegaPlugin.applyIntent(state, { from: 7, to: CENTER }, { seat: SEAT_1, serverTimeMs: 0 });
    assert.equal(res.ok, true);
    assert.equal(res.state.turn, SEAT_0);
    assert.equal(res.state.board[CENTER], pieceFor(SEAT_1));
  });

  test("a non-adjacent destination is refused even if empty", () => {
    const state = movementState();
    const res = SeegaPlugin.applyIntent(state, { from: 7, to: 0 }, { seat: SEAT_1, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "ILLEGAL");
  });

  test("moving a piece you do not own is refused", () => {
    const state = movementState();
    const res = SeegaPlugin.applyIntent(state, { from: 7, to: CENTER }, { seat: SEAT_0, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "NOT_YOUR_TURN");
  });
});

describe("evaluate -- win and draw, movement phase only", () => {
  test("never fires during the placement phase", () => {
    const state = fresh();
    assert.equal(SeegaPlugin.evaluate(state), null);
  });

  test("a seat with zero pieces left loses immediately", () => {
    const board = new Int8Array(25);
    board[0] = pieceFor(SEAT_1);
    const state = { phase: Phase.MOVEMENT, board, turn: SEAT_1, placedCount: [12, 12], plySinceCapture: 0, history: [], moves: [] };
    const outcome = SeegaPlugin.evaluate(state);
    assert.equal(outcome.result, "0-1");
    assert.equal(outcome.reason, "ALL_CAPTURED");
  });

  test("a seat with no legal move (fully boxed in) loses", () => {
    const board = new Int8Array(25);
    board[6] = pieceFor(SEAT_0);
    board[1] = pieceFor(SEAT_1); board[5] = pieceFor(SEAT_1);
    board[7] = pieceFor(SEAT_1); board[11] = pieceFor(SEAT_1);
    const state = { phase: Phase.MOVEMENT, board, turn: SEAT_0, placedCount: [12, 12], plySinceCapture: 0, history: [], moves: [] };
    const outcome = SeegaPlugin.evaluate(state);
    assert.equal(outcome.result, "0-1");
    assert.equal(outcome.reason, "NO_LEGAL_MOVES");
  });

  test("80 plies with no capture is a draw", () => {
    const board = new Int8Array(25);
    board[0] = pieceFor(SEAT_0);
    board[24] = pieceFor(SEAT_1);
    const state = {
      phase: Phase.MOVEMENT, board, turn: SEAT_0, placedCount: [12, 12],
      plySinceCapture: 80, history: [], moves: [],
    };
    const outcome = SeegaPlugin.evaluate(state);
    assert.equal(outcome.result, "1/2-1/2");
    assert.equal(outcome.reason, "FORTY_MOVE_RULE");
  });

  test("threefold repetition is a draw", () => {
    const board = new Int8Array(25);
    board[0] = pieceFor(SEAT_0);
    board[24] = pieceFor(SEAT_1);
    const key = "k";
    const state = {
      phase: Phase.MOVEMENT, board, turn: SEAT_0, placedCount: [12, 12],
      plySinceCapture: 0, history: [key, key, key], moves: [],
    };
    const outcome = SeegaPlugin.evaluate(state);
    assert.equal(outcome.result, "1/2-1/2");
    assert.equal(outcome.reason, "THREEFOLD_REPETITION");
  });
});

describe("project", () => {
  test("a spectator never sees legalPlacements or legalMoves", () => {
    const state = fresh();
    const view = SeegaPlugin.project(state, "spectator");
    assert.equal(view.legalPlacements, undefined);
    assert.equal(view.legalMoves, undefined);
  });

  test("a player sees legalPlacements during PLACEMENT", () => {
    const state = fresh();
    const view = SeegaPlugin.project(state, "player");
    assert.equal(view.legalPlacements.length, 24);
  });
});
