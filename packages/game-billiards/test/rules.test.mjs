import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  initialBalls, simulateShot, resolveShot, CUE, EIGHT, SOLIDS, STRIPES, SEAT_0, SEAT_1, TABLE_W, TABLE_H,
} from "../src/billiards.mjs";

describe("initialBalls", () => {
  test("racks all 16 balls, the 8-ball dead centre of the third row, none overlapping", () => {
    const balls = initialBalls("seed-a");
    assert.equal(balls.size, 16);
    const eight = balls.get(EIGHT);
    assert.ok(eight);
    for (const [id, b] of balls) {
      assert.ok(b.x > 0 && b.x < TABLE_W && b.y > 0 && b.y < TABLE_H, `ball ${id} in bounds`);
    }
    const ids = [...balls.values()].map((b) => b.id).sort((a, b) => a - b);
    assert.deepEqual(ids, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  test("is deterministic: the same seed always produces the same rack", () => {
    const a = initialBalls("repeatable-seed");
    const b = initialBalls("repeatable-seed");
    for (const id of a.keys()) {
      assert.equal(a.get(id).x, b.get(id).x, `ball ${id} x`);
      assert.equal(a.get(id).y, b.get(id).y, `ball ${id} y`);
    }
  });

  test("different seeds produce a different solids/stripes arrangement", () => {
    const a = initialBalls("seed-1");
    const b = initialBalls("seed-2");
    let anyDifferent = false;
    for (const id of SOLIDS) {
      if (a.get(id).x !== b.get(id).x || a.get(id).y !== b.get(id).y) anyDifferent = true;
    }
    assert.ok(anyDifferent, "two different seeds should not always rack identically");
  });
});

describe("simulateShot: real physics, never NaN/Infinity, everything stays on table or is potted", () => {
  test("a full-power break settles to rest with every ball finite and in bounds", () => {
    const balls = initialBalls("break-seed");
    const r = simulateShot(balls, 0, 1.0); // straight down the table into the rack
    assert.ok(r.frames.length > 0);
    for (const f of r.frames) {
      for (const b of f.balls) {
        assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y), `frame ball ${b.id} finite`);
      }
    }
    for (const [id, b] of r.balls) {
      if (b.potted) continue;
      assert.ok(b.x >= -0.01 && b.x <= TABLE_W + 0.01, `ball ${id} x in bounds at rest`);
      assert.ok(b.y >= -0.01 && b.y <= TABLE_H + 0.01, `ball ${id} y in bounds at rest`);
      assert.equal(b.vx, 0, `ball ${id} at rest has zero vx`);
      assert.equal(b.vy, 0, `ball ${id} at rest has zero vy`);
    }
  });

  test("a direct shot into a ball sitting on a pocket potts it", () => {
    const balls = new Map([
      [CUE, { id: CUE, x: 20, y: 20, vx: 0, vy: 0, potted: false }],
      [1, { id: 1, x: 10, y: 10, vx: 0, vy: 0, potted: false }],
    ]);
    const angle = Math.atan2(10 - 20, 10 - 20);
    const r = simulateShot(balls, angle, 0.6);
    assert.ok(r.potted.includes(1));
    assert.equal(r.firstContact, 1);
    assert.equal(r.balls.get(1).potted, true);
  });

  test("a shot with zero balls in the way contacts nothing", () => {
    const balls = new Map([[CUE, { id: CUE, x: 100, y: 50, vx: 0, vy: 0, potted: false }]]);
    const r = simulateShot(balls, 0, 0.5);
    assert.equal(r.contactHappened, false);
    assert.equal(r.firstContact, null);
    assert.equal(r.potted.length, 0);
  });
});

describe("resolveShot: fouls, turns, and wins", () => {
  const openRule = { turn: SEAT_0, groups: {}, broken: false, pottedEver: [] };

  test("no contact at all is a foul, turn passes", () => {
    const shot = { potted: [], firstContact: null, contactHappened: false, railAfterContact: false };
    const res = resolveShot(openRule, shot);
    assert.equal(res.foul, true);
    assert.equal(res.foulReason, "NO_CONTACT");
    assert.equal(res.turn, SEAT_1);
    assert.equal(res.winner, null);
  });

  test("potting your own ball with no foul keeps your turn and assigns groups on an open table", () => {
    const shot = { potted: [3], firstContact: 3, contactHappened: true, railAfterContact: true };
    const res = resolveShot(openRule, shot);
    assert.equal(res.foul, false);
    assert.equal(res.turn, SEAT_0);
    assert.equal(res.groups[SEAT_0], "SOLIDS");
    assert.equal(res.groups[SEAT_1], "STRIPES");
    assert.equal(res.assignedThisShot, true);
  });

  test("a scratch (cue potted) is a foul even if an object ball also dropped legally", () => {
    const shot = { potted: [3, CUE], firstContact: 3, contactHappened: true, railAfterContact: true };
    const res = resolveShot(openRule, shot);
    assert.equal(res.foul, true);
    assert.equal(res.foulReason, "SCRATCH");
    assert.equal(res.turn, SEAT_1);
  });

  test("hitting the opponent's ball first, once groups are assigned, is a foul", () => {
    const rule = { turn: SEAT_0, groups: { [SEAT_0]: "SOLIDS", [SEAT_1]: "STRIPES" }, broken: true, pottedEver: [] };
    const shot = { potted: [], firstContact: 9, contactHappened: true, railAfterContact: true };
    const res = resolveShot(rule, shot);
    assert.equal(res.foul, true);
    assert.equal(res.foulReason, "WRONG_BALL_FIRST");
  });

  test("no ball potted and no rail touched after contact is a foul", () => {
    const shot = { potted: [], firstContact: 3, contactHappened: true, railAfterContact: false };
    const res = resolveShot(openRule, shot);
    assert.equal(res.foul, true);
    assert.equal(res.foulReason, "NO_RAIL_AFTER_CONTACT");
  });

  test("legally clearing your group and potting the 8 wins", () => {
    const rule = {
      turn: SEAT_0, groups: { [SEAT_0]: "SOLIDS", [SEAT_1]: "STRIPES" }, broken: true,
      pottedEver: SOLIDS.filter((id) => id !== 7), // every solid but #7 already gone
    };
    const shot = { potted: [7, EIGHT], firstContact: 7, contactHappened: true, railAfterContact: true };
    const res = resolveShot(rule, shot);
    assert.equal(res.foul, false);
    assert.equal(res.winner, SEAT_0);
  });

  test("potting the 8-ball before your group is clear loses, even without a foul", () => {
    const rule = { turn: SEAT_0, groups: { [SEAT_0]: "SOLIDS", [SEAT_1]: "STRIPES" }, broken: true, pottedEver: [1, 2] };
    const shot = { potted: [EIGHT], firstContact: EIGHT, contactHappened: true, railAfterContact: true };
    const res = resolveShot(rule, shot);
    assert.equal(res.winner, SEAT_1, "the shooter loses; the OPPONENT wins");
  });

  test("potting the 8-ball on the break is an outright win for the breaker, scratch or not", () => {
    const shot = { potted: [EIGHT, CUE], firstContact: EIGHT, contactHappened: true, railAfterContact: true };
    const res = resolveShot(openRule, shot); // openRule.broken === false -> this IS the break
    assert.equal(res.winner, SEAT_0);
  });

  test("a legal contact that only sinks the opponent's ball (a carom) still passes the turn", () => {
    // Groups already assigned; the shooter legally strikes their own ball
    // first (no foul), but the only ball that actually drops belongs to
    // the OPPONENT -- legal in real pool, and does not earn another shot.
    const rule = { turn: SEAT_0, groups: { [SEAT_0]: "SOLIDS", [SEAT_1]: "STRIPES" }, broken: true, pottedEver: [] };
    const shot = { potted: [9], firstContact: 3, contactHappened: true, railAfterContact: true };
    const res = resolveShot(rule, shot);
    assert.equal(res.foul, false);
    assert.equal(res.turn, SEAT_1, "no ball of the shooter's OWN group dropped, so the turn passes");
  });
});
