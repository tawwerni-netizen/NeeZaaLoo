import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createLiveArenaSimulator } from "../src/live-arena-simulator.mjs";

async function createTestEnv() {
  const db = await PGlite.create();
  await migrate(db);
  return { db };
}

describe("Live Arena Match Simulator", () => {
  test("spawns live matches up to targetMatches", async () => {
    const { db } = await createTestEnv();
    const sim = createLiveArenaSimulator(db, { targetMatches: 5 });

    const beforeRes = await db.query(
      "SELECT count(*)::int AS count FROM duel WHERE status = 'LIVE' AND spectator_policy = 'OPEN'"
    );
    assert.equal(beforeRes.rows[0].count, 0);

    const res = await sim();
    assert.ok(res.spawnedCount >= 1);

    const afterRes = await db.query(
      "SELECT count(*)::int AS count FROM duel WHERE status = 'LIVE' AND spectator_policy = 'OPEN'"
    );
    assert.ok(afterRes.rows[0].count >= 1);

    // Verify sample match properties
    const sample = await db.query(
      "SELECT id, game_id, status, is_vs_computer, spectator_policy FROM duel WHERE status = 'LIVE' LIMIT 1"
    );
    assert.equal(sample.rows[0].status, "LIVE");
    assert.equal(sample.rows[0].is_vs_computer, false);
    assert.equal(sample.rows[0].spectator_policy, "OPEN");
  });

  test("completes old simulated duels", async () => {
    const { db } = await createTestEnv();
    const sim = createLiveArenaSimulator(db, { targetMatches: 0 });

    // Seed an old simulated duel
    await db.query(
      `INSERT INTO duel
         (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
          tier, stake_minor, initial_state, time_control, status, spectator_policy, started_at)
       VALUES ('duel_live_old', 'chess', 1, 'sim:old', 'bot_ar_001', 'bot_ar_002',
               'FREE', 0, '{}'::jsonb, '{"initialMs":300000}'::jsonb, 'LIVE', 'OPEN', now() - interval '5 minutes')`
    );

    const res = await sim();
    assert.equal(res.completedCount, 1);

    const check = await db.query("SELECT status FROM duel WHERE id = 'duel_live_old'");
    assert.equal(check.rows[0].status, "COMPLETED");
  });
});
