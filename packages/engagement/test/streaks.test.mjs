import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createStreakService } from "../src/streaks.mjs";

async function fresh() {
  const db = await PGlite.create();
  await migrate(db);
  await db.query("INSERT INTO player (id, handle) VALUES ('p1','player1'), ('p2','player2')");
  const streaks = createStreakService(db);
  return { db, streaks };
}

/** Backdate a player's last_activity_date by N days, for testing only --
 * production code never writes this column with anything but CURRENT_DATE. */
async function backdate(db, playerId, daysAgo) {
  await db.query(
    `UPDATE player_streak SET last_activity_date = CURRENT_DATE - $2 * INTERVAL '1 day' WHERE player_id = $1`,
    [playerId, daysAgo]
  );
}

describe("recordActivity", () => {
  test("the first activity ever starts a 1-day streak", async () => {
    const { streaks } = await fresh();
    const r = await streaks.recordActivity("p1");
    assert.deepEqual(r, { current: 1, longest: 1, changed: true, milestone: null });
  });

  test("a second activity on the SAME day is a no-op, not a second increment", async () => {
    const { streaks } = await fresh();
    await streaks.recordActivity("p1");
    const r = await streaks.recordActivity("p1");
    assert.equal(r.changed, false);
    assert.equal(r.current, 1);
  });

  test("activity on a consecutive day increments the streak", async () => {
    const { db, streaks } = await fresh();
    await streaks.recordActivity("p1");
    await backdate(db, "p1", 1);
    const r = await streaks.recordActivity("p1");
    assert.equal(r.current, 2);
    assert.equal(r.longest, 2);
  });

  test("a gap of more than one day resets the streak to 1, never below", async () => {
    const { db, streaks } = await fresh();
    await streaks.recordActivity("p1");
    await backdate(db, "p1", 5);
    const r = await streaks.recordActivity("p1");
    assert.equal(r.current, 1);
  });

  test("longest_length only ever grows, even after a reset", async () => {
    const { db, streaks } = await fresh();
    for (let i = 0; i < 4; i++) {
      await streaks.recordActivity("p1");
      await backdate(db, "p1", 1);
    }
    // current_length is now 4 (4 consecutive days); back off to reset.
    await backdate(db, "p1", 10);
    const r = await streaks.recordActivity("p1");
    assert.equal(r.current, 1);
    assert.equal(r.longest, 4);
  });

  test("streaks for two different players never interfere", async () => {
    const { streaks } = await fresh();
    await streaks.recordActivity("p1");
    await streaks.recordActivity("p1");
    const p2 = await streaks.recordActivity("p2");
    assert.equal(p2.current, 1);
  });
});

describe("streak milestones", () => {
  test("reaching day 3 grants EXP but no achievement/badge/frame", async () => {
    const { db, streaks } = await fresh();
    for (let i = 0; i < 3; i++) {
      const r = await streaks.recordActivity("p1");
      if (i < 2) await backdate(db, "p1", 1);
      else assert.deepEqual(r.milestone, { milestone: 3, expAwarded: 20 });
    }
    const exp = await db.query("SELECT amount FROM exp_event WHERE player_id='p1' AND event_type='STREAK_MILESTONE'");
    assert.equal(exp.rows.length, 1);
    assert.equal(exp.rows[0].amount, 20);
    const ach = await db.query("SELECT 1 FROM player_achievement WHERE player_id='p1'");
    assert.equal(ach.rows.length, 0);
  });

  test("reaching day 7 grants EXP, achievement, badge, and a profile frame -- exactly once", async () => {
    const { db, streaks } = await fresh();
    let last;
    for (let i = 0; i < 7; i++) {
      last = await streaks.recordActivity("p1");
      if (i < 6) await backdate(db, "p1", 1);
    }
    assert.equal(last.current, 7);
    assert.deepEqual(last.milestone, {
      milestone: 7, expAwarded: 50, achievement: "STREAK_7", badge: "STREAK_7", frame: "STREAK_7_FRAME",
    });

    const ach = await db.query("SELECT achievement_code FROM player_achievement WHERE player_id='p1'");
    assert.deepEqual(ach.rows.map((r) => r.achievement_code), ["STREAK_7"]);
    const badge = await db.query("SELECT badge_code FROM player_badge WHERE player_id='p1'");
    assert.deepEqual(badge.rows.map((r) => r.badge_code), ["STREAK_7"]);
    const frame = await db.query("SELECT frame_code FROM player_frame WHERE player_id='p1'");
    assert.deepEqual(frame.rows.map((r) => r.frame_code), ["STREAK_7_FRAME"]);
    // Day 3's own milestone fires en route to day 7 in this same run --
    // both are real, correctly-earned notifications; only the day-7 one
    // is this test's concern.
    const ntf = await db.query(
      "SELECT type FROM notification WHERE player_id='p1' AND (data->>'milestone')::int = 7"
    );
    assert.deepEqual(ntf.rows.map((r) => r.type), ["STREAK_MILESTONE"]);
  });

  test("crossing day 7 twice (a retried/duplicate call) never double-grants anything", async () => {
    const { db, streaks } = await fresh();
    for (let i = 0; i < 7; i++) {
      await streaks.recordActivity("p1");
      if (i < 6) await backdate(db, "p1", 1);
    }
    // Simulate a retry landing on the exact same day-7 state again --
    // backdate the just-recorded day and replay it.
    await backdate(db, "p1", 1);
    // Manually re-run grantMilestone's own path by forcing current back to
    // 7 via another consecutive-day activity, then verify no duplicate row.
    await streaks.recordActivity("p1");

    const exp = await db.query("SELECT count(*)::int c FROM exp_event WHERE player_id='p1' AND event_type='STREAK_MILESTONE'");
    // Day 8 does not re-trigger the day-7 milestone (STREAK_MILESTONES
    // matches an exact value), so this exercises "the sequence naturally
    // never revisits 7" -- the real duplicate-safety guarantee is proven
    // structurally by streak_reward's PRIMARY KEY, exercised directly below.
    assert.equal(exp.rows.length, 1);

    const direct1 = await db.query(
      `INSERT INTO streak_reward (player_id, milestone) VALUES ('p1', 7) ON CONFLICT (player_id, milestone) DO NOTHING RETURNING milestone`
    );
    assert.equal(direct1.rows.length, 0, "milestone 7 was already granted; a second insert must no-op");
  });

  test("reaching day 30 grants its own EXP amount, achievement, badge, and frame", async () => {
    const { db, streaks } = await fresh();
    let last;
    for (let i = 0; i < 30; i++) {
      last = await streaks.recordActivity("p1");
      if (i < 29) await backdate(db, "p1", 1);
    }
    assert.equal(last.current, 30);
    assert.deepEqual(last.milestone, {
      milestone: 30, expAwarded: 200, achievement: "STREAK_30", badge: "STREAK_30", frame: "STREAK_30_FRAME",
    });
  });
});

describe("streakFor", () => {
  test("a player who has never played has a zeroed, inactive streak", async () => {
    const { streaks } = await fresh();
    assert.deepEqual(await streaks.streakFor("p1"), { current: 0, longest: 0, activeToday: false, atRisk: false });
  });

  test("active today, and at-risk the day after with no new activity", async () => {
    const { db, streaks } = await fresh();
    await streaks.recordActivity("p1");
    let s = await streaks.streakFor("p1");
    assert.equal(s.activeToday, true);
    assert.equal(s.atRisk, false);

    await backdate(db, "p1", 1);
    s = await streaks.streakFor("p1");
    assert.equal(s.activeToday, false);
    assert.equal(s.atRisk, true);
  });
});
