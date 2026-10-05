import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createRadarSeederWorker } from "../src/radar-seeder.mjs";
import { STANDING_BY_BOT_IDS } from "../src/standing-by.mjs";

async function createTestEnv() {
  const db = await PGlite.create();
  await migrate(db);

  // Human player
  await db.query("INSERT INTO player (id, handle) VALUES ('human_user', 'human_user')");
  await db.query("SELECT ledger_open_user_wallet('human_user', 'USDT')");

  return { db };
}

describe("1v1 Live Challenges Radar Seeder", () => {
  test("seeds open challenges up to minChallenges from personas", async () => {
    const { db } = await createTestEnv();
    const seeder = createRadarSeederWorker(db, { minChallenges: 4, maxChallenges: 6 });

    const beforeRes = await db.query(
      "SELECT count(*)::int AS count FROM lobby_open_challenge WHERE status = 'OPEN'"
    );
    assert.equal(beforeRes.rows[0].count, 0);

    const tickResult = await seeder();
    assert.ok(tickResult.createdCount >= 1);

    const afterRes = await db.query(
      "SELECT count(*)::int AS count FROM lobby_open_challenge WHERE status = 'OPEN'"
    );
    assert.ok(afterRes.rows[0].count >= 1);

    // Verify creator is an official persona
    const sample = await db.query(
      "SELECT creator_id, game_id, tier, status FROM lobby_open_challenge LIMIT 1"
    );
    assert.ok(sample.rows[0].creator_id.startsWith("bot_"));
    assert.equal(sample.rows[0].status, "OPEN");
  });

  test("auto-accepts human open challenge after wait threshold", async () => {
    const { db } = await createTestEnv();
    const seeder = createRadarSeederWorker(db, { minChallenges: 0 });

    // Human posts open challenge in the past (15s ago)
    await db.query(
      `INSERT INTO lobby_open_challenge
         (id, creator_id, game_id, tier, stake_minor, time_control, status, created_at, expires_at)
       VALUES ('human_ch_1', 'human_user', 'chess', 'FREE', 0, 'BLITZ', 'OPEN', now() - interval '15 seconds', now() + interval '5 minutes')`
    );

    const tickResult = await seeder();
    assert.equal(tickResult.acceptedCount, 1);

    // Verify accepted
    const checkRes = await db.query(
      "SELECT status, accepted_by, duel_id FROM lobby_open_challenge WHERE id = 'human_ch_1'"
    );
    assert.equal(checkRes.rows[0].status, "ACCEPTED");
    assert.ok(checkRes.rows[0].accepted_by.startsWith("bot_"));
    assert.ok(checkRes.rows[0].duel_id);

    // Verify duel row created
    const duelRes = await db.query(
      "SELECT id, seat_0, seat_1, status FROM duel WHERE id = $1",
      [checkRes.rows[0].duel_id]
    );
    assert.equal(duelRes.rows[0].seat_0, "human_user");
    assert.equal(duelRes.rows[0].seat_1, checkRes.rows[0].accepted_by);
  });
});
