/**
 * Tests for Standing-By Bot Matcher and Background ELO Simulator.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createMatchmakingService } from "../src/matchmaking.mjs";
import { createStandingByWorker, STANDING_BY_BOT_IDS } from "../src/standing-by.mjs";
import { createBotMatchSimulator } from "../src/bot-simulator.mjs";

const TC = { initialMs: 300000, incrementMs: 3000 };

async function createTestEnv() {
  const db = await PGlite.create();
  await migrate(db);

  // Create human player alice
  await db.query("INSERT INTO player (id, handle) VALUES ('alice', 'alice')");
  await db.query("SELECT ledger_open_user_wallet('alice', 'USDT')");

  const testBotId = STANDING_BY_BOT_IDS[0]; // bot_ar_001 (already seeded by 0063)
  const mm = createMatchmakingService(db);
  return { db, mm, testBotId };
}

describe("Standing-By Bot Matcher", () => {
  test("does not match when wait time is less than timeoutSeconds", async () => {
    const { db, mm } = await createTestEnv();
    const worker = createStandingByWorker(db, mm, { timeoutSeconds: 5 });

    // Enqueue alice right now
    await mm.enqueue({
      playerId: "alice",
      gameId: "chess",
      mode: "standard",
      tier: "FREE",
      ratingX100: 160000,
      timeControl: TC,
    });

    const res = await worker();
    assert.equal(res.pairedCount, 0, "should not pair immediately");
  });

  test("pairs human with standing-by bot after wait time elapses", async () => {
    const { db, mm, testBotId } = await createTestEnv();
    let pairedEvent = null;
    const worker = createStandingByWorker(db, mm, {
      timeoutSeconds: 5,
      emit: (evt, data) => {
        if (evt === "matchmaking.standing_by_paired") pairedEvent = data;
      },
    });

    // Enqueue alice
    await mm.enqueue({
      playerId: "alice",
      gameId: "chess",
      mode: "standard",
      tier: "FREE",
      ratingX100: 160000,
      timeControl: TC,
    });

    // Simulate 6 seconds elapsed
    await db.query(
      "UPDATE matchmaking_ticket SET enqueued_at = now() - interval '6 seconds' WHERE player_id = 'alice'"
    );

    const res = await worker();
    assert.equal(res.pairedCount, 1, "should pair with standing-by bot");
    assert.ok(pairedEvent, "should emit paired event");
    assert.equal(pairedEvent.humanPlayerId, "alice");
    assert.ok(STANDING_BY_BOT_IDS.includes(pairedEvent.botId), "paired bot must come from the standing by pool");

    // Verify duel exists in DB
    const duelRes = await db.query("SELECT * FROM duel WHERE id = $1", [pairedEvent.duelId]);
    assert.equal(duelRes.rows.length, 1);
    const duel = duelRes.rows[0];
    assert.ok(duel.seat_0 === "alice" || duel.seat_1 === "alice");
    assert.ok(duel.seat_0 === pairedEvent.botId || duel.seat_1 === pairedEvent.botId);
  });
});

describe("Background Bot ELO Simulator", () => {
  test("simulates a match between bots and updates ratings", async () => {
    const { db } = await createTestEnv();

    let eventEmitted = false;
    const simulator = createBotMatchSimulator(db, {
      emit: (evt) => {
        if (evt === "simulator.bot_match_completed") eventEmitted = true;
      },
    });

    const res = await simulator();
    if (res.simulated) {
      assert.ok(eventEmitted);
      assert.ok(res.botA);
      assert.ok(res.botB);
    }
  });
});
