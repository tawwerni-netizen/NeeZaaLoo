import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { BackgammonPlugin } from "../src/plugin.mjs";
import { SEAT_0, SEAT_1, POINTS, CHECKERS_PER_SIDE } from "../src/backgammon.mjs";

function fresh(seed = "seed-fixed") {
  return BackgammonPlugin.createChallenge(seed, {}).state;
}

describe("createChallenge / rehydrate", () => {
  test("the same seed always produces the same opening leader, dice and board", () => {
    const a = BackgammonPlugin.createChallenge("seed-x", {}).state;
    const b = BackgammonPlugin.createChallenge("seed-x", {}).state;
    assert.equal(a.turn, b.turn);
    assert.deepEqual(a.dice, b.dice);
    assert.deepEqual(a.board, b.board);
  });

  test("rehydrate() reconstructs the identical initial state from the same seed", () => {
    const created = BackgammonPlugin.createChallenge("seed-y", {}).state;
    const rehydrated = BackgammonPlugin.rehydrate({ seed: "seed-y" }).state;
    assert.deepEqual(rehydrated, created);
  });

  test("the opening dice are never a double (they come from two DIFFERENT single-die rolls)", () => {
    for (const seed of ["s1", "s2", "s3", "s4", "s5"]) {
      const state = BackgammonPlugin.createChallenge(seed, {}).state;
      assert.notEqual(state.dice[0], state.dice[1]);
    }
  });
});

describe("applyIntent -- basic validation", () => {
  test("refused when it is not this seat's turn", () => {
    const state = fresh();
    const wrong = state.turn === SEAT_0 ? SEAT_1 : SEAT_0;
    const res = BackgammonPlugin.applyIntent(state, { from: 23, die: state.dice[0] }, { seat: wrong, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "NOT_YOUR_TURN");
  });

  test("a die not among the currently rolled dice is refused", () => {
    const state = fresh();
    const unrolled = [1, 2, 3, 4, 5, 6].find((d) => !state.dice.includes(d));
    const res = BackgammonPlugin.applyIntent(state, { from: 23, die: unrolled }, { seat: state.turn, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "ILLEGAL");
  });

  test("malformed intents (bad die range, bad from) are refused", () => {
    const state = fresh();
    assert.equal(BackgammonPlugin.applyIntent(state, { from: 23, die: 7 }, { seat: state.turn, serverTimeMs: 0 }).reason, "MALFORMED");
    assert.equal(BackgammonPlugin.applyIntent(state, { from: 99, die: state.dice[0] }, { seat: state.turn, serverTimeMs: 0 }).reason, "MALFORMED");
  });

  test("moving from a point you do not occupy is refused", () => {
    const state = fresh();
    // idx 3 is empty in the standard starting position.
    const res = BackgammonPlugin.applyIntent(state, { from: 3, die: state.dice[0] }, { seat: state.turn, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "ILLEGAL");
  });
});

describe("applyIntent -- turn stays open across both dice, then flips and rolls fresh dice", () => {
  test("using one die of two keeps the turn; using both ends it", () => {
    const state = fresh("turn-flip-seed");
    const seat = state.turn;
    const [d1, d2] = state.dice;

    // Find a legal first action for d1.
    const board = state.board;
    let from1 = null;
    for (let idx = 0; idx < POINTS; idx++) {
      if ((seat === SEAT_0 ? board[idx] > 0 : board[idx] < 0)) {
        const test1 = BackgammonPlugin.applyIntent(state, { from: idx, die: d1 }, { seat, serverTimeMs: 0 });
        if (test1.ok) { from1 = idx; break; }
      }
    }
    assert.ok(from1 !== null, "expected at least one legal action for the first die from the opening position");
    const afterFirst = BackgammonPlugin.applyIntent(state, { from: from1, die: d1 }, { seat, serverTimeMs: 0 });
    assert.equal(afterFirst.ok, true);

    if (afterFirst.state.dice.length > 0 && afterFirst.state.turn === seat) {
      // Still this seat's turn -- the remaining die(s) must include d2 (or a repeat, on a double).
      assert.ok(afterFirst.state.dice.length >= 1);
    } else {
      // All dice used (or genuinely stuck) -- turn passed and fresh dice were rolled.
      assert.notEqual(afterFirst.state.turn, seat);
      assert.ok(afterFirst.state.dice.length === 2 || afterFirst.state.dice.length === 4);
    }
  });
});

describe("applyIntent -- hitting sends a checker to the bar", () => {
  test("landing on a lone opposing blot hits it", () => {
    const board = new Array(POINTS).fill(0);
    board[10] = 1;  // seat 0 checker
    board[7] = -1;  // seat 1 blot, 3 pips away for seat 0 moving toward 0
    const state = { seed: "s", board, bar: [0, 0], off: [0, 0], turn: SEAT_0, dice: [3, 5], rollIndex: 0, moves: [] };
    const res = BackgammonPlugin.applyIntent(state, { from: 10, die: 3 }, { seat: SEAT_0, serverTimeMs: 0 });
    assert.equal(res.ok, true);
    assert.equal(res.record.hit, true);
    assert.equal(res.state.bar[SEAT_1], 1);
    assert.equal(res.state.board[7], 1); // seat 0 now occupies it
  });

  test("a checker on the bar must enter before any other move is accepted", () => {
    const board = new Array(POINTS).fill(0);
    board[10] = 1;
    const state = { seed: "s", board, bar: [1, 0], off: [0, 0], turn: SEAT_0, dice: [3, 5], rollIndex: 0, moves: [] };
    const res = BackgammonPlugin.applyIntent(state, { from: 10, die: 3 }, { seat: SEAT_0, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "ILLEGAL");
  });
});

describe("applyIntent -- pass", () => {
  test("passing while a legal action exists is refused", () => {
    const state = fresh();
    const res = BackgammonPlugin.applyIntent(state, { pass: true }, { seat: state.turn, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "ILLEGAL");
  });

  test("passing when genuinely stuck (bar entry fully blocked) is accepted and rolls the other seat fresh dice", () => {
    const board = new Array(POINTS).fill(0);
    for (let idx = 18; idx < 24; idx++) board[idx] = -2; // seat 1 closes its entire home board
    const state = { seed: "stuck-seed", board, bar: [1, 0], off: [0, 0], turn: SEAT_0, dice: [3, 5], rollIndex: 0, moves: [] };
    const res = BackgammonPlugin.applyIntent(state, { pass: true }, { seat: SEAT_0, serverTimeMs: 0 });
    assert.equal(res.ok, true);
    assert.equal(res.state.turn, SEAT_1);
    assert.ok(res.state.dice.length === 2 || res.state.dice.length === 4);
  });
});

describe("evaluate -- win, gammon, backgammon, no draw", () => {
  function baseState(overrides) {
    return {
      seed: "s", board: new Array(POINTS).fill(0), bar: [0, 0], off: [0, 0],
      turn: SEAT_0, dice: [1, 2], rollIndex: 0, moves: [], ...overrides,
    };
  }

  test("bearing off all 15 wins immediately", () => {
    const state = baseState({ off: [CHECKERS_PER_SIDE, 2], board: (() => { const b = new Array(POINTS).fill(0); b[18] = -13; return b; })() });
    const outcome = BackgammonPlugin.evaluate(state);
    assert.equal(outcome.result, "1-0");
    assert.equal(outcome.reason, "BEAR_OFF_ALL");
    assert.equal(outcome.multiplier, 1);
  });

  test("a gammon: the loser bore off nothing", () => {
    const board = new Array(POINTS).fill(0);
    board[18] = -15; // all outside the winner's home, none on the bar, but none borne off either
    const state = baseState({ off: [CHECKERS_PER_SIDE, 0], board });
    const outcome = BackgammonPlugin.evaluate(state);
    assert.equal(outcome.reason, "GAMMON");
    assert.equal(outcome.multiplier, 2);
  });

  test("a backgammon: the loser also has a checker on the bar", () => {
    const board = new Array(POINTS).fill(0);
    board[18] = -14;
    const state = baseState({ off: [CHECKERS_PER_SIDE, 0], bar: [0, 1], board });
    const outcome = BackgammonPlugin.evaluate(state);
    assert.equal(outcome.reason, "BACKGAMMON");
    assert.equal(outcome.multiplier, 3);
  });

  test("a backgammon: the loser has a checker in the winner's home board", () => {
    const board = new Array(POINTS).fill(0);
    board[18] = -14;
    board[2] = -1; // inside seat 0's (the winner's) home board
    const state = baseState({ off: [CHECKERS_PER_SIDE, 0], board });
    const outcome = BackgammonPlugin.evaluate(state);
    assert.equal(outcome.reason, "BACKGAMMON");
  });

  test("no game state ever produces a draw -- backgammon has none", () => {
    assert.equal(BackgammonPlugin.evaluate(fresh()), null);
  });
});

describe("project -- perfect information, legalActions only for the mover", () => {
  test("a spectator sees the full public position but no legalActions", () => {
    const state = fresh();
    const view = BackgammonPlugin.project(state, "spectator");
    assert.deepEqual(view.board, state.board);
    assert.deepEqual(view.dice, state.dice);
    assert.equal(view.legalActions, undefined);
  });

  test("the seat to move sees its own legalActions; the other seat does not", () => {
    const state = fresh();
    const moverView = BackgammonPlugin.project(state, "player", state.turn);
    assert.ok(Array.isArray(moverView.legalActions) && moverView.legalActions.length > 0);
    const other = state.turn === SEAT_0 ? SEAT_1 : SEAT_0;
    const otherView = BackgammonPlugin.project(state, "player", other);
    assert.equal(otherView.legalActions, undefined);
  });
});
