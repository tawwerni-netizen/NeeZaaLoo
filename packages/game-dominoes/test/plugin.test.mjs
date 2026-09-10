import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DominoesPlugin } from "../src/plugin.mjs";
import { SEAT_0, SEAT_1 } from "../src/dominoes.mjs";

function fresh(seed = "seed-fixed") {
  return DominoesPlugin.createChallenge(seed, {}).state;
}

describe("createChallenge / rehydrate", () => {
  test("the same seed always deals the same hands and opening leader", () => {
    const a = DominoesPlugin.createChallenge("seed-x", {}).state;
    const b = DominoesPlugin.createChallenge("seed-x", {}).state;
    assert.deepEqual(a.hands, b.hands);
    assert.equal(a.turn, b.turn);
  });

  test("rehydrate() reconstructs the identical state createChallenge() produced from the same seed", () => {
    const created = DominoesPlugin.createChallenge("seed-y", {}).state;
    const rehydrated = DominoesPlugin.rehydrate({ seed: "seed-y" }).state;
    assert.deepEqual(rehydrated.hands, created.hands);
    assert.equal(rehydrated.turn, created.turn);
  });

  test("a different seed deals different hands", () => {
    const a = DominoesPlugin.createChallenge("seed-1", {}).state;
    const b = DominoesPlugin.createChallenge("seed-2", {}).state;
    assert.notDeepEqual(a.hands, b.hands);
  });
});

describe("applyIntent -- turn order and ownership", () => {
  test("it is refused when it is not that seat's turn", () => {
    const state = fresh();
    const wrongSeat = state.turn === SEAT_0 ? SEAT_1 : SEAT_0;
    const res = DominoesPlugin.applyIntent(state, { tile: state.hands[wrongSeat][0] }, { seat: wrongSeat, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "NOT_YOUR_TURN");
  });

  test("a tile the player does not hold is refused", () => {
    const state = fresh();
    const absent = findAbsentTile(state.hands[state.turn]);
    const res = DominoesPlugin.applyIntent(state, { tile: absent }, { seat: state.turn, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "ILLEGAL");
  });
});

function findAbsentTile(hand) {
  const held = new Set(hand.map(([a, b]) => `${a}-${b}`));
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) {
      if (!held.has(`${a}-${b}`)) return [a, b];
    }
  }
  return null;
}

describe("applyIntent -- forced opening double", () => {
  test("the leader must open with the forced double when one is set", () => {
    const state = fresh("seed-fixed");
    if (!state.openingConstraint) return; // this seed's deal had no double in either hand
    const other = state.hands[state.turn].find(
      (t) => t[0] !== state.openingConstraint.tile[0] || t[1] !== state.openingConstraint.tile[1]
    );
    if (other) {
      const bad = DominoesPlugin.applyIntent(state, { tile: other }, { seat: state.turn, serverTimeMs: 0 });
      assert.equal(bad.ok, false);
      assert.equal(bad.reason, "ILLEGAL");
    }
    const good = DominoesPlugin.applyIntent(
      state, { tile: state.openingConstraint.tile }, { seat: state.turn, serverTimeMs: 0 }
    );
    assert.equal(good.ok, true);
    assert.equal(good.state.openingConstraint, null);
  });
});

describe("applyIntent -- placement and turn alternation", () => {
  test("a legal placement is accepted, removes the tile from hand, and passes the turn", () => {
    const state = fresh();
    const leader = state.turn;
    const tile = state.openingConstraint ? state.openingConstraint.tile : state.hands[leader][0];
    const res = DominoesPlugin.applyIntent(state, { tile }, { seat: leader, serverTimeMs: 0 });
    assert.equal(res.ok, true);
    assert.equal(res.state.turn, leader === SEAT_0 ? SEAT_1 : SEAT_0);
    assert.equal(res.state.hands[leader].length, 6);
    assert.equal(res.state.line.tiles.length, 1);
  });

  test("MALFORMED for a tile shape that isn't [int, int] 0-6 canonical", () => {
    const state = fresh();
    const res = DominoesPlugin.applyIntent(state, { tile: [4, 2] }, { seat: state.turn, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "MALFORMED");
  });
});

describe("applyIntent -- pass", () => {
  test("passing while holding a legal tile is refused", () => {
    const state = fresh();
    // The opening leader always has SOME legal tile (either the forced
    // double, or a completely free first choice), so a pass must fail.
    const res = DominoesPlugin.applyIntent(state, { pass: true }, { seat: state.turn, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "ILLEGAL");
  });

  test("two consecutive passes end the game as BLOCKED", () => {
    // Construct a state directly where neither hand can match the line.
    const state = {
      seed: "s", turn: SEAT_0, openingConstraint: null, consecutivePasses: 0, moves: [],
      hands: [[[0, 0]], [[1, 1]]],
      line: { left: 5, right: 5, tiles: [{ tile: [5, 5], orientation: [5, 5] }] },
    };
    const r1 = DominoesPlugin.applyIntent(state, { pass: true }, { seat: SEAT_0, serverTimeMs: 0 });
    assert.equal(r1.ok, true);
    assert.equal(DominoesPlugin.evaluate(r1.state), null);
    const r2 = DominoesPlugin.applyIntent(r1.state, { pass: true }, { seat: SEAT_1, serverTimeMs: 0 });
    assert.equal(r2.ok, true);
    const outcome = DominoesPlugin.evaluate(r2.state);
    assert.equal(outcome.reason, "BLOCKED");
    // hand0 pips = 0, hand1 pips = 2 -> seat 0 (lower) wins
    assert.equal(outcome.result, "1-0");
  });

  test("a block with EQUAL pip totals is a draw", () => {
    const state = {
      seed: "s", turn: SEAT_0, openingConstraint: null, consecutivePasses: 0, moves: [],
      hands: [[[1, 1]], [[2, 0]]], // both total 2
      line: { left: 5, right: 5, tiles: [{ tile: [5, 5], orientation: [5, 5] }] },
    };
    const r1 = DominoesPlugin.applyIntent(state, { pass: true }, { seat: SEAT_0, serverTimeMs: 0 });
    const r2 = DominoesPlugin.applyIntent(r1.state, { pass: true }, { seat: SEAT_1, serverTimeMs: 0 });
    const outcome = DominoesPlugin.evaluate(r2.state);
    assert.equal(outcome.result, "1/2-1/2");
    assert.equal(outcome.reason, "BLOCKED");
  });
});

describe("evaluate -- domino out", () => {
  test("emptying your hand wins immediately", () => {
    const state = {
      seed: "s", turn: SEAT_1, openingConstraint: null, consecutivePasses: 0, moves: [],
      hands: [[], [[3, 3]]],
      line: { left: 5, right: 5, tiles: [{ tile: [5, 5], orientation: [5, 5] }] },
    };
    const outcome = DominoesPlugin.evaluate(state);
    assert.equal(outcome.result, "1-0");
    assert.equal(outcome.reason, "DOMINO_OUT");
  });
});

describe("project -- hidden information", () => {
  test("a spectator sees no hand contents at all, only counts", () => {
    const state = fresh();
    const view = DominoesPlugin.project(state, "spectator");
    assert.equal(view.hand, undefined);
    assert.deepEqual(view.handCounts, [7, 7]);
  });

  test("a seat sees only its own hand, never the opponent's", () => {
    const state = fresh();
    const view0 = DominoesPlugin.project(state, "player", SEAT_0);
    assert.deepEqual(view0.hand, state.hands[SEAT_0]);
    assert.equal(view0.hand.length, 7);
    assert.ok(!("opponentHand" in view0));
  });
});

describe("score", () => {
  test("mirrors result on the 0/0.5/1 scale used across every launch game", () => {
    const win = { hands: [[], [[1, 1]]], turn: SEAT_1, openingConstraint: null, consecutivePasses: 0, moves: [], seed: "s", line: { left: 0, right: 0, tiles: [] } };
    assert.deepEqual(DominoesPlugin.score(win), [1, 0]);
  });
});
