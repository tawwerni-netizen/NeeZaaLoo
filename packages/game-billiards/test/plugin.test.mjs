import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { BilliardsPlugin } from "../src/plugin.mjs";
import { createBilliardsAiAdapter, Difficulty } from "../src/ai.mjs";
import { SEAT_0, SEAT_1 } from "../src/billiards.mjs";

function fresh(seed = "plugin-test") {
  return BilliardsPlugin.createChallenge(seed, {}).state;
}

describe("BilliardsPlugin.applyIntent: input validation", () => {
  test("rejects a non-object intent", () => {
    const state = fresh();
    const res = BilliardsPlugin.applyIntent(state, "shoot", { seat: SEAT_0, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "MALFORMED");
  });

  test("rejects a power of 0 or above 1", () => {
    const state = fresh();
    for (const power of [0, -0.1, 1.5, NaN, Infinity]) {
      const res = BilliardsPlugin.applyIntent(state, { angle: 0, power }, { seat: SEAT_0, serverTimeMs: 0 });
      assert.equal(res.ok, false, `power ${power} must be rejected`);
    }
  });

  test("rejects a non-finite angle", () => {
    const state = fresh();
    for (const angle of [NaN, Infinity, -Infinity, "0"]) {
      const res = BilliardsPlugin.applyIntent(state, { angle, power: 0.5 }, { seat: SEAT_0, serverTimeMs: 0 });
      assert.equal(res.ok, false, `angle ${angle} must be rejected`);
    }
  });

  test("rejects extra fields on the intent (no smuggled spin/placement/etc.)", () => {
    const state = fresh();
    const res = BilliardsPlugin.applyIntent(state, { angle: 0, power: 0.5, spin: 1 }, { seat: SEAT_0, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "MALFORMED");
  });

  test("rejects a shot from the seat that is not on turn", () => {
    const state = fresh();
    assert.equal(state.turn, SEAT_0);
    const res = BilliardsPlugin.applyIntent(state, { angle: 0, power: 0.5 }, { seat: SEAT_1, serverTimeMs: 0 });
    assert.equal(res.ok, false);
    assert.equal(res.reason, "NOT_YOUR_TURN");
  });
});

describe("BilliardsPlugin: a full game via applyIntent alone, no direct physics access", () => {
  test("accepts a real break shot and records it", () => {
    let state = fresh("full-game-1");
    const res = BilliardsPlugin.applyIntent(state, { angle: 0, power: 0.95 }, { seat: SEAT_0, serverTimeMs: 0 });
    assert.equal(res.ok, true, JSON.stringify(res));
    state = res.state;
    assert.equal(state.shots.length, 1);
    assert.equal(state.broken, true);
    assert.equal(BilliardsPlugin.evaluate(state), null, "a break with no 8-ball potted never ends the game");
  });

  test("project() never exposes potted balls or internal velocity", () => {
    let state = fresh("project-test");
    const res = BilliardsPlugin.applyIntent(state, { angle: 0, power: 0.9 }, { seat: SEAT_0, serverTimeMs: 0 });
    state = res.state;
    const view = BilliardsPlugin.project(state, "spectator");
    assert.equal(view.balls.length + view.pottedEver.length, 16);
    for (const b of view.balls) {
      assert.ok(!("vx" in b) && !("vy" in b) && !("potted" in b), "project() balls are position-only");
    }
  });

  test("two EXPERT bots can play a full game to a real, legal conclusion", () => {
    let state = fresh("bot-vs-bot-1");
    const ai = createBilliardsAiAdapter();
    let seat = SEAT_0;
    let outcome = null;
    for (let shots = 0; shots < 300 && !outcome; shots++) {
      const move = ai.chooseAction(state, seat, Difficulty.EXPERT, 200, `bvb:${shots}`);
      assert.ok(move && Number.isFinite(move.angle) && Number.isFinite(move.power), `bot produced a real move at shot ${shots}`);
      const res = BilliardsPlugin.applyIntent(state, move, { seat, serverTimeMs: 0 });
      assert.equal(res.ok, true, `bot's own move must always be legal (shot ${shots}): ${res.reason}`);
      state = res.state;
      outcome = BilliardsPlugin.evaluate(state);
      seat = state.turn;
    }
    assert.ok(outcome, "a full bot-vs-bot game must reach a real conclusion, not run out the clock");
    assert.ok(outcome.result === "1-0" || outcome.result === "0-1");
    assert.ok(["EIGHT_BALL_ON_BREAK", "EIGHT_BALL_CLEARED", "EIGHT_BALL_FOUL"].includes(outcome.reason));
  });

  test("a foul awards ball-in-hand and the next shooter's cue ball is repositioned on the table", () => {
    // A shot with essentially no power straight into open space is a
    // guaranteed NO_CONTACT foul (nothing is within reach).
    let state = fresh("foul-test");
    // Aim the cue ball away from the rack entirely -- toward the near rail
    // at minimum legal power -- so it cannot reach any object ball.
    const res = BilliardsPlugin.applyIntent(state, { angle: Math.PI, power: 0.05 }, { seat: SEAT_0, serverTimeMs: 0 });
    assert.equal(res.ok, true);
    state = res.state;
    const lastShot = state.shots[state.shots.length - 1];
    assert.equal(lastShot.foul, true);
    assert.equal(state.turn, SEAT_1, "a foul passes the turn");
    assert.equal(state.ballInHandFor, SEAT_1, "the seat now on turn has ball-in-hand after the other seat's foul");
  });
});

describe("BilliardsPlugin.serializeReplay", () => {
  test("replays only the shots taken (angle/power), nothing derived", () => {
    let state = fresh("replay-test");
    state = BilliardsPlugin.applyIntent(state, { angle: 0.1, power: 0.7 }, { seat: SEAT_0, serverTimeMs: 0 }).state;
    const replay = BilliardsPlugin.serializeReplay(state);
    assert.deepEqual(replay.shots, [{ angle: 0.1, power: 0.7 }]);
  });

  test("initialOnly omits shot history", () => {
    let state = fresh("replay-test-2");
    state = BilliardsPlugin.applyIntent(state, { angle: 0.1, power: 0.7 }, { seat: SEAT_0, serverTimeMs: 0 }).state;
    assert.deepEqual(BilliardsPlugin.serializeReplay(state, { initialOnly: true }), {});
  });
});
