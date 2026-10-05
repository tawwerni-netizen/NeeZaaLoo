import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createSeasonService, SeasonError } from "../src/seasons.mjs";

async function fresh() {
  const db = await PGlite.create();
  await migrate(db);
  await db.query("INSERT INTO player (id, handle) VALUES ('p1','player1'), ('p2','player2')");
  
  // Seed an active season
  await db.query(`
    INSERT INTO season (id, name, starts_at, ends_at)
    VALUES ('season_test', 'Test Season', now() - INTERVAL '1 day', now() + INTERVAL '30 days')
  `);

  // Seed battle pass tiers
  await db.query(`
    INSERT INTO battle_pass_tier (
      season_id, level, required_exp,
      free_reward_type, free_reward_asset, free_reward_amount,
      premium_reward_type, premium_reward_asset, premium_reward_amount
    )
    VALUES
      ('season_test', 1, 100, 'ASSET', 'USDT', 500000, 'ASSET', 'USDT', 2000000),
      ('season_test', 2, 250, null, null, null, 'ASSET', 'USDT', 3000000),
      ('season_test', 3, 500, 'ASSET', 'USDT', 1000000, 'ASSET', 'USDT', 5000000)
  `);

  const svc = createSeasonService(db);
  return { db, svc };
}

describe("Season & Battle Pass Service", () => {
  test("myProgress returns active season with tiers", async () => {
    const { svc } = await fresh();
    const progress = await svc.myProgress("p1");

    assert.equal(progress.active, true);
    assert.equal(progress.season.id, "season_test");
    assert.equal(progress.seasonalExp, 0);
    assert.equal(progress.isPremium, false);
    assert.equal(progress.tiers.length, 3);
    assert.equal(progress.tiers[0].level, 1);
    assert.equal(progress.tiers[0].isUnlocked, false);
  });

  test("unlocked tier allows claiming free reward with both 'free' and 'FREE'", async () => {
    const { db, svc } = await fresh();

    // Add 150 EXP to p1 to unlock tier 1
    await db.query(`
      INSERT INTO exp_event (id, player_id, event_type, source, amount, dedupe_key, created_at)
      VALUES ('xp_1', 'p1', 'TEST', 'test', 150, 'xp_1', now())
    `);

    const progress = await svc.myProgress("p1");
    assert.equal(progress.seasonalExp, 150);
    assert.equal(progress.tiers[0].isUnlocked, true);
    assert.equal(progress.tiers[0].free.canClaim, true);

    // Claim with lowercase 'free'
    const claimRes = await svc.claimReward({
      playerId: "p1",
      seasonId: "season_test",
      level: 1,
      track: "free",
    });
    assert.equal(claimRes.ok, true);

    // Attempting to claim again fails with ALREADY_CLAIMED
    const dupRes = await svc.claimReward({
      playerId: "p1",
      seasonId: "season_test",
      level: 1,
      track: "FREE",
    });
    assert.equal(dupRes.ok, false);
    assert.equal(dupRes.reason, SeasonError.ALREADY_CLAIMED);
  });

  test("premium reward requires premium pass", async () => {
    const { db, svc } = await fresh();

    // Give 150 EXP
    await db.query(`
      INSERT INTO exp_event (id, player_id, event_type, source, amount, dedupe_key, created_at)
      VALUES ('xp_1', 'p1', 'TEST', 'test', 150, 'xp_1', now())
    `);

    // Attempt claim premium without pass
    const claimRes = await svc.claimReward({
      playerId: "p1",
      seasonId: "season_test",
      level: 1,
      track: "premium",
    });
    assert.equal(claimRes.ok, false);
    assert.equal(claimRes.reason, SeasonError.PREMIUM_REQUIRED);
  });

  test("purchasePremium unlocks premium and permits claiming premium rewards", async () => {
    const { db, svc } = await fresh();

    // Fund p1 wallet with 10 USDT
    await db.query(`SELECT ledger_open_user_wallet('p1', 'USDT')`);
    const legs = [
      { account: "platform:promotions", amount: "10000000" },
      { account: "user:p1:available", amount: "-10000000" }
    ];
    await db.query(
      `SELECT * FROM ledger_post('test_fund_p1', 'REWARD', 'SYSTEM'::ledger_actor_type, 'system', $1::jsonb, 'USDT', 'test', 'test', '1')`,
      [JSON.stringify(legs)]
    );

    // Purchase premium
    const buyRes = await svc.purchasePremium({ playerId: "p1", seasonId: "season_test" });
    assert.equal(buyRes.ok, true);

    // Duplicate purchase rejected
    const buyAgain = await svc.purchasePremium({ playerId: "p1", seasonId: "season_test" });
    assert.equal(buyAgain.ok, false);
    assert.equal(buyAgain.reason, SeasonError.ALREADY_PREMIUM);

    // Add 150 EXP
    await db.query(`
      INSERT INTO exp_event (id, player_id, event_type, source, amount, dedupe_key, created_at)
      VALUES ('xp_p1_prem', 'p1', 'TEST', 'test', 150, 'xp_p1_prem', now())
    `);

    // Claim premium reward
    const claimRes = await svc.claimReward({
      playerId: "p1",
      seasonId: "season_test",
      level: 1,
      track: "premium",
    });
    assert.equal(claimRes.ok, true);
  });
});
