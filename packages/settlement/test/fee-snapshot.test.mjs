/**
 * The fee snapshot (db/migrations/0036_fee_snapshot.sql).
 *
 * The claim under test, verbatim from the Financial Architecture
 * Reconciliation: an admin raising the platform's rate from 15% to 25%
 * while matches are ACTIVE must not alter a match already under way. A
 * match created under the 15% rule settles at 15% no matter when it is
 * settled or what the rule says by then; a match created after the rate
 * changed settles at 25%. Settlement itself resolves nothing -- it only
 * ever reads what mm_pair() already froze onto the row at creation.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createSettlementService } from "../src/settle.mjs";
import { createMatchmakingService } from "../../matchmaking/src/matchmaking.mjs";

const USDT = 1_000_000n;
const u = (n) => (BigInt(n) * USDT).toString();
const TC = { initialMs: 300000, incrementMs: 0 };
const INITIAL = { fen: "startpos" };

async function fresh() {
  const db = await PGlite.create();
  await migrate(db);
  return { db, mm: createMatchmakingService(db), settlement: createSettlementService(db) };
}

async function fundedPlayer(db, id, amount) {
  await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [id]);
  await db.query("SELECT ledger_open_user_wallet($1)", [id]);
  await db.query(
    `SELECT ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb)`,
    [`deposit:seed:${id}`, JSON.stringify([
      { account: "platform:custody:USDT:TRON", amount: u(amount) },
      { account: `user:${id}:available`, amount: "-" + u(amount) },
    ])]
  );
}

/** Insert an approved economy_rule effective immediately, superseding the launch rule. */
async function setGlobalCashRate(db, { id, rakeBps, effectiveFrom = "now()" }) {
  await db.query(
    `INSERT INTO economy_rule
       (id, version, game_id, tier, rake_bps, min_rake_minor, max_rake_minor,
        effective_from, created_by, approved_by, reason)
     VALUES ($1, 1, NULL, 'CASH', $2, 0, NULL, ${effectiveFrom}, 'admin-a', 'admin-b', $3)`,
    [id, rakeBps, `set global cash rate to ${rakeBps} bps`]
  );
}

async function pairCash(mm, db, { a, b, stake = 10 }) {
  await mm.enqueue({ playerId: a, gameId: "chess", tier: "CASH", stakeMinor: u(stake), ratingX100: 150000, timeControl: TC });
  await mm.enqueue({ playerId: b, gameId: "chess", tier: "CASH", stakeMinor: u(stake), ratingX100: 150000, timeControl: TC });
  const res = await mm.pair({ gameId: "chess", tier: "CASH", stakeMinor: u(stake), initialState: INITIAL, timeControl: TC });
  assert.equal(res.paired, true);
  return res.duelId;
}

async function playToCompletion(db, settlement, duelId, result = "1-0") {
  const reserved = await settlement.reserve(duelId);
  assert.equal(reserved.ok, true);
  await db.query(
    `UPDATE duel SET status='COMPLETED'::duel_status, result=$2,
            termination_reason='CHECKMATE', completed_at=now(), game_hash='h' WHERE id=$1`,
    [duelId, result]
  );
}

describe("a duel is priced at creation and settlement reads only that snapshot", () => {
  test("mm_pair() stamps the fee in force at creation time", async () => {
    const { db, mm } = await fresh();
    await fundedPlayer(db, "alice", 1000);
    await fundedPlayer(db, "bob", 1000);
    await setGlobalCashRate(db, { id: "rate-15", rakeBps: 1500 });

    const duelId = await pairCash(mm, db, { a: "alice", b: "bob" });
    const row = await db.query(
      "SELECT priced_rake_bps, priced_economy_rule_id, priced_at FROM duel WHERE id=$1", [duelId]
    );
    assert.equal(row.rows[0].priced_rake_bps, 1500);
    assert.equal(row.rows[0].priced_economy_rule_id, "rate-15");
    assert.ok(row.rows[0].priced_at, "priced_at is stamped");
  });

  test("THE MANDATORY TEST: admin raises 15% -> 25% while a match is active; the active match still settles at 15%, a new one settles at 25%", async () => {
    const { db, mm, settlement } = await fresh();
    await fundedPlayer(db, "alice", 1000);
    await fundedPlayer(db, "bob", 1000);
    await fundedPlayer(db, "carol", 1000);
    await fundedPlayer(db, "dave", 1000);

    await setGlobalCashRate(db, { id: "rate-15", rakeBps: 1500 });

    // This duel is created and reserved WHILE the rate is 15%.
    const oldDuel = await pairCash(mm, db, { a: "alice", b: "bob", stake: 100 });
    await playToCompletion(db, settlement, oldDuel, "1-0"); // alice wins

    // The admin changes the platform rate to 25% -- the old duel is still
    // "active" (COMPLETED but not yet SETTLED) at this exact moment.
    await setGlobalCashRate(db, { id: "rate-25", rakeBps: 2500 });

    // A brand-new duel created AFTER the change picks up 25%.
    const newDuel = await pairCash(mm, db, { a: "carol", b: "dave", stake: 100 });
    await playToCompletion(db, settlement, newDuel, "1-0"); // carol wins

    // Settle the OLD duel now, well after the rate changed -- it must still
    // pay out at 15%, because settlement reads the frozen snapshot, not
    // today's rule.
    const oldResult = await settlement.settle(oldDuel);
    assert.equal(oldResult.ok, true);
    assert.equal(oldResult.rule.bps, 1500, "the old duel prices at the rate that was active when IT was created");
    // Pot = 200 USDT, 15% = 30 USDT rake, alice (winner) gets 170.
    assert.equal(oldResult.rakeMinor, u(30));

    const newResult = await settlement.settle(newDuel);
    assert.equal(newResult.ok, true);
    assert.equal(newResult.rule.bps, 2500, "the new duel prices at the rate active when IT was created");
    // Pot = 200 USDT, 25% = 50 USDT rake.
    assert.equal(newResult.rakeMinor, u(50));

    const aliceBalance = await natural(db, "user:alice:available");
    // 1000 funded - 100 staked + (200 pot - 30 rake) payout = 1070
    assert.equal(aliceBalance, u(1070));

    const carolBalance = await natural(db, "user:carol:available");
    // 1000 funded - 100 staked + (200 pot - 50 rake) payout = 1050
    assert.equal(carolBalance, u(1050));
  });

  test("the fee snapshot is immutable once set", async () => {
    const { db, mm } = await fresh();
    await fundedPlayer(db, "alice", 1000);
    await fundedPlayer(db, "bob", 1000);
    await setGlobalCashRate(db, { id: "rate-15", rakeBps: 1500 });
    const duelId = await pairCash(mm, db, { a: "alice", b: "bob" });

    await assert.rejects(
      () => db.query("UPDATE duel SET priced_rake_bps = 2500 WHERE id=$1", [duelId]),
      /immutable once priced/
    );
  });

  test("economy_resolve() finds nothing before the platform's own launch date -- the exact condition mm_pair()'s pricing guard exists for", async () => {
    // economy_rule is append-only (0004's economy_rule_immutable trigger), so
    // a test cannot delete the seeded launch rule to simulate "no rule
    // exists" -- the launch rule is a real, permanent global CASH fallback
    // by design, and that is worth proving directly rather than working
    // around. What CAN be shown without touching immutable history: the
    // launch rule has a real effective_from (2026-01-01), and asking for a
    // price before that boundary genuinely finds nothing -- which is
    // precisely the state mm_pair()'s "RAISE EXCEPTION ... no economy rule
    // configured" guard (0036_fee_snapshot.sql) exists to refuse creating a
    // duel into.
    const { db } = await fresh();
    const before = await db.query(
      `SELECT * FROM economy_resolve('chess','CASH'::entry_tier, '2020-01-01T00:00:00Z'::timestamptz)`
    );
    assert.equal(before.rows.length, 0, "no rule is active before the platform's own launch window");

    const after = await db.query(
      `SELECT * FROM economy_resolve('chess','CASH'::entry_tier, now())`
    );
    assert.equal(after.rows.length, 1, "the permanent launch fallback covers every CASH duel from launch onward");
  });

  test("a legacy duel with no snapshot (created before 0036, or by a direct fixture) still settles via the old resolve-at-settlement path", async () => {
    const { db, settlement } = await fresh();
    await fundedPlayer(db, "alice", 1000);
    await fundedPlayer(db, "bob", 1000);
    await setGlobalCashRate(db, { id: "rate-15", rakeBps: 1500 });

    // Inserted directly, bypassing mm_pair() -- no priced_* columns at all.
    await db.query(
      `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
                         tier, stake_minor, asset, initial_state, time_control, status)
       VALUES ('legacy-1','chess',1,'pk-legacy','alice','bob','CASH',$1,'USDT',
               $2::jsonb,$3::jsonb,'RESERVED'::duel_status)`,
      [u(100), JSON.stringify(INITIAL), JSON.stringify(TC)]
    );
    await db.query(
      `SELECT * FROM ledger_post('legacy-1:reserve','DUEL_ENTRY','SYSTEM',NULL,$1::jsonb)`,
      [JSON.stringify([
        { account: "user:alice:available", amount: u(100) },
        { account: "user:alice:locked", amount: "-" + u(100) },
        { account: "user:bob:available", amount: u(100) },
        { account: "user:bob:locked", amount: "-" + u(100) },
      ])]
    );
    await db.query(
      `UPDATE duel SET reservation_tx_id =
         (SELECT id FROM ledger_transaction WHERE idempotency_key = 'legacy-1:reserve')
       WHERE id='legacy-1'`
    );
    await db.query(
      `UPDATE duel SET status='COMPLETED'::duel_status, result='1-0',
              termination_reason='CHECKMATE', completed_at=now(), game_hash='h' WHERE id='legacy-1'`
    );

    const result = await settlement.settle("legacy-1");
    assert.equal(result.ok, true);
    assert.equal(result.rule.bps, 1500, "resolved at settlement time, exactly as before 0036");
  });
});

async function natural(db, key) {
  const r = await db.query(
    `SELECT ledger_natural_balance(a.normal_side, COALESCE(b.balance,0))::text n
       FROM ledger_account a LEFT JOIN ledger_balance b ON b.account_id=a.id WHERE a.key=$1`,
    [key]
  );
  return r.rows[0].n;
}
