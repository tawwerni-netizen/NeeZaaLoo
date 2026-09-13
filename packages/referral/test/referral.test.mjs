import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import {
  createReferralService,
  createReferralSweep,
  evaluateReferralRisk,
  ReferralError,
} from "../src/index.mjs";

async function setupDb() {
  const db = await PGlite.create();
  await migrate(db);

  // Helper to create a player
  async function createPlayer(handle) {
    const id = `usr_${Math.random().toString(36).slice(2, 10)}`;
    const res = await db.query(
      `INSERT INTO player (id, handle)
       VALUES ($1, $2)
       RETURNING id, handle`,
      [id, handle]
    );
    const player = res.rows[0];
    await db.query("SELECT ledger_open_user_wallet($1, 'USDT')", [player.id]);
    return player;
  }

  // Helper to credit a deposit
  async function creditDeposit(playerId, amountMinor = 10_000_000n, txHash = null, outputIndex = 0) {
    const depId = `dep_${Math.random().toString(36).slice(2, 10)}`;
    const postRes = await db.query(
      `SELECT * FROM ledger_post($1, 'DEPOSIT', 'SYSTEM', NULL, $2::jsonb, 'USDT')`,
      [
        `dep_tx_${depId}`,
        JSON.stringify([
          { account: "platform:custody:USDT:TRON", amount: amountMinor.toString() },
          { account: `user:${playerId}:available`, amount: (-amountMinor).toString() },
        ]),
      ]
    );
    const txId = postRes.rows[0].transaction_id;

    const res = await db.query(
      `INSERT INTO deposit (
         id, player_id, asset, network, provider, address, status,
         observed_amount_minor, observed_tx_hash, observed_output_index, observed_network,
         credited_tx_id, credited_at, expires_at
       ) VALUES (
         $1, $2, 'USDT', 'TRON', 'sandbox', 'T_ADDR', 'CREDITED',
         $3, $4, $5, 'TRON',
         $6, NOW(), NOW() + INTERVAL '1 day'
       ) RETURNING id`,
      [
        depId,
        playerId,
        amountMinor.toString(),
        txHash ?? `tx_${Math.random().toString(36).slice(2)}`,
        outputIndex,
        txId,
      ]
    );
    return res.rows[0].id;
  }

  return { db, createPlayer, creditDeposit };
}

describe("Referral System", () => {
  test("auto-generates referral code on player creation and enables resolution", async () => {
    const { db, createPlayer } = await setupDb();
    const service = createReferralService(db);

    const alice = await createPlayer("alice");
    const codeRow = await service.getReferralCode(alice.id);

    assert.ok(codeRow, "Referral code row should exist");
    assert.ok(codeRow.code.startsWith("ALIC"), `Code should start with handle prefix: ${codeRow.code}`);
    assert.equal(codeRow.is_active, true);

    const resolved = await service.resolveReferralCode(codeRow.code);
    assert.equal(resolved.ok, true);
    assert.equal(resolved.referrerHandle, "alice");
  });

  test("attributes new player to referrer and blocks self-referral", async () => {
    const { db, createPlayer } = await setupDb();
    const service = createReferralService(db);

    const alice = await createPlayer("alice");
    const bob = await createPlayer("bob");

    const aliceCode = (await service.getReferralCode(alice.id)).code;

    // Self referral attempt
    const selfRes = await service.attributePlayer({
      referredPlayerId: alice.id,
      referralCode: aliceCode,
    });
    assert.equal(selfRes.ok, false);
    assert.equal(selfRes.reason, ReferralError.SELF_REFERRAL);

    // Bob attributes to Alice
    const bobRes = await service.attributePlayer({
      referredPlayerId: bob.id,
      referralCode: aliceCode,
    });
    assert.equal(bobRes.ok, true);
    assert.equal(bobRes.referrerPlayerId, alice.id);

    // Duplicate attribution attempt
    const dupRes = await service.attributePlayer({
      referredPlayerId: bob.id,
      referralCode: aliceCode,
    });
    assert.equal(dupRes.ok, false);
    assert.equal(dupRes.reason, ReferralError.ALREADY_ATTRIBUTED);
  });

  test("anti-fraud detects circular cycles and shared deposit hashes, but tolerates shared IP", async () => {
    const { db, createPlayer, creditDeposit } = await setupDb();
    const service = createReferralService(db);

    const alice = await createPlayer("alice");
    const bob = await createPlayer("bob");

    const aliceCode = (await service.getReferralCode(alice.id)).code;
    await service.attributePlayer({ referredPlayerId: bob.id, referralCode: aliceCode });

    // Clean initial evaluation
    const cleanRisk = await evaluateReferralRisk(db, { referrerId: alice.id, referredId: bob.id });
    assert.equal(cleanRisk.score, 0);
    assert.equal(cleanRisk.isHighRisk, false);

    // Add shared IP sessions (e.g. same home Wi-Fi)
    await db.query(
      `INSERT INTO auth_session (id, family_id, player_id, refresh_hash, expires_at, ip)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '1 day', '192.168.1.50'),
              ($5, $6, $7, $8, NOW() + INTERVAL '1 day', '192.168.1.50')`,
      ["s1", "f1", alice.id, "hash1", "s2", "f2", bob.id, "hash2"]
    );

    const ipRisk = await evaluateReferralRisk(db, { referrerId: alice.id, referredId: bob.id });
    assert.equal(ipRisk.score, 10, "Shared IP should only add minor context score");
    assert.equal(ipRisk.isHighRisk, false, "Shared IP alone must never trigger high risk");

    // Shared deposit source overlap
    const sharedTx = "0xdeadbeef123456789";
    await creditDeposit(alice.id, 10_000_000n, sharedTx, 0);
    const bobDepId = await creditDeposit(bob.id, 10_000_000n, sharedTx, 1);

    const depositOverlapRisk = await evaluateReferralRisk(db, {
      referrerId: alice.id,
      referredId: bob.id,
      depositId: bobDepId,
    });
    assert.ok(depositOverlapRisk.reasons.includes("SHARED_DEPOSIT_SOURCE_OVERLAP"));
    assert.equal(depositOverlapRisk.isHighRisk, true);
  });

  test("sweep settles qualifying deposit >= $5 via double-entry ledger", async () => {
    const { db, createPlayer, creditDeposit } = await setupDb();
    const service = createReferralService(db);
    const sweep = createReferralSweep(db);

    const alice = await createPlayer("alice");
    const bob = await createPlayer("bob");
    const charlie = await createPlayer("charlie");

    const aliceCode = (await service.getReferralCode(alice.id)).code;
    await service.attributePlayer({ referredPlayerId: bob.id, referralCode: aliceCode });
    await service.attributePlayer({ referredPlayerId: charlie.id, referralCode: aliceCode });

    // Bob deposits $3 (3_000_000 minor) - sub-threshold
    await creditDeposit(bob.id, 3_000_000n);

    // Sweep 1
    const sweep1 = await sweep.sweepDue();
    assert.equal(sweep1.processed, 0, "Sub-threshold deposit should not trigger reward");

    // Charlie deposits $10 (10_000_000 minor) - qualifying
    await creditDeposit(charlie.id, 10_000_000n);

    // Sweep 2
    const sweep2 = await sweep.sweepDue();
    assert.equal(sweep2.processed, 1, "Should process Charlie's qualifying deposit");
    assert.equal(sweep2.settled, 1, "Should settle 1 reward to Alice");

    // Check Alice's dashboard
    const dashboard = await service.getDashboard(alice.id);
    assert.equal(dashboard.stats.totalReferred, 2);
    assert.equal(dashboard.stats.confirmedRewardMinor, "1000000"); // $1.00 USDT
    assert.equal(dashboard.history.length, 2);

    // Check Alice's ledger balance (normal_side is CREDIT so balance is -1000000)
    const balanceRes = await db.query(
      `SELECT lb.balance, la.normal_side
       FROM ledger_balance lb
       JOIN ledger_account la ON la.id = lb.account_id
       WHERE la.key = $1 AND la.asset = 'USDT'`,
      [`user:${alice.id}:available`]
    );
    assert.equal(balanceRes.rows.length, 1);
    // Alice received 1M referral reward = -1M in raw credit balance
    assert.equal(String(balanceRes.rows[0].balance), "-1000000");

    // Check marketing ledger account
    const mktRes = await db.query(
      `SELECT lb.balance
       FROM ledger_balance lb
       JOIN ledger_account la ON la.id = lb.account_id
       WHERE la.key = 'platform:marketing:referral_rewards' AND la.asset = 'USDT'`
    );
    assert.equal(String(mktRes.rows[0].balance), "1000000");
  });
});
