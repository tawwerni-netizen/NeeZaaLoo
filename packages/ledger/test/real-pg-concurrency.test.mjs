/**
 * A2: real PostgreSQL, multiple INDEPENDENT connections, genuine concurrency.
 *
 * Everything else in this repo runs against PGlite -- a real Postgres engine,
 * but reachable through exactly one connection. A single connection can
 * never actually race two operations against each other; it can only run
 * them one after another, in whatever order the JS event loop happens to
 * schedule their queries. Every "concurrency" property claimed elsewhere in
 * this codebase (row locks serializing writers, idempotency keys surviving
 * a race, a lease's compare-and-swap) is a claim about what happens when two
 * SEPARATE Postgres backends genuinely overlap in wall-clock time -- and
 * that claim has never, until this file, been checked against anything that
 * could actually produce that overlap.
 *
 * This file uses a real, locally running PostgreSQL 17 server (see
 * TEST_DATABASE_URL below) and multiple independent `pg.Client` connections
 * per scenario -- never a shared pool doled out sequentially, never a
 * Promise.all over calls that all resolve through one connection. If
 * PostgreSQL is not reachable, every test here is skipped (not silently
 * passed) so a run in an environment without it says so plainly rather than
 * reporting false confidence.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import pg from "pg";
import { createPgAdapter } from "../src/pg-adapter.mjs";
import { migrate } from "../src/migrate.mjs";
import { createSettlementService } from "../../settlement/src/settle.mjs";
import { createPaymentService } from "../../payments/src/payments.mjs";
import { createLeaseManager } from "../../realtime/src/lease.mjs";

const { Client } = pg;

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || "postgres://postgres:postgres@localhost:5432/skill_platform_test";

const USDT = 1_000_000n;
const u = (n) => (BigInt(n) * USDT).toString();
const GOOD_ADDR = "T" + "9".repeat(33);

let reachable = true;
let reachabilityError = null;
try {
  const probe = new Client({ connectionString: TEST_DATABASE_URL });
  await probe.connect();
  await probe.query("SELECT 1");
  await probe.end();
} catch (e) {
  reachable = false;
  reachabilityError = e;
}

/** One genuinely independent connection. Each caller gets its OWN socket. */
async function connection() {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  return { client, db: createPgAdapter(client) };
}

async function closeAll(...conns) {
  await Promise.all(conns.map((c) => c.client.end()));
}

async function natural(db, key) {
  const r = await db.query(
    `SELECT ledger_natural_balance(a.normal_side, COALESCE(b.balance,0))::text n
       FROM ledger_account a LEFT JOIN ledger_balance b ON b.account_id=a.id
      WHERE a.key=$1`, [key]
  );
  return r.rows[0]?.n ?? "0";
}

/** A fresh player, wallet, and funding -- unique id per test, no cross-test interference. */
async function newFundedPlayer(admin, fundAmount) {
  const id = `p_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  await admin.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [id]);
  await admin.query("SELECT ledger_open_user_wallet($1)", [id]);
  if (fundAmount) {
    await admin.query(
      `SELECT ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb)`,
      [`seed:${id}`, JSON.stringify([
        { account: "platform:custody:USDT:TRON", amount: u(fundAmount) },
        { account: `user:${id}:available`, amount: "-" + u(fundAmount) },
      ])]
    );
  }
  return id;
}

async function newCashDuel(admin, { seat0, seat1, stake }) {
  const id = `duel_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  await admin.query(
    `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
                       tier, stake_minor, asset, initial_state, time_control, status)
     VALUES ($1,'chess',1,$1,$2,$3,'CASH',$4,'USDT','{}'::jsonb,'{}'::jsonb,'RESERVED'::duel_status)`,
    [id, seat0, seat1, u(stake)]
  );
  return id;
}

function sandboxProvider() {
  return {
    id: "sandbox",
    verifyWebhook(rawBody, headers) {
      const sig = createHmac("sha256", "sandbox-secret").update(rawBody).digest("hex");
      if (headers["x-sandbox-sig"] !== sig) return { ok: false, error: "INVALID" };
      const parsed = JSON.parse(rawBody.toString("utf8"));
      return {
        ok: true,
        event: {
          providerEventId: parsed.eventId, type: parsed.type, providerRef: parsed.providerRef,
          state: parsed.state, reportedAmount: parsed.amount ?? null, raw: parsed,
        },
      };
    },
    async createDepositIntent({ idempotencyKey }) {
      const providerRef = `sbx_${randomUUID().slice(0, 12)}`;
      return { providerRef, address: `T${providerRef.replace(/-/g, "").slice(0, 33)}`, expiresAt: null };
    },
  };
}

function signedWebhook({ eventId, providerRef }) {
  const body = Buffer.from(JSON.stringify({ eventId, type: "payment", providerRef, state: "finished" }));
  const sig = createHmac("sha256", "sandbox-secret").update(body).digest("hex");
  return { body, headers: { "x-sandbox-sig": sig } };
}

// ---------------------------------------------------------------------------

describe("A2: real PostgreSQL concurrency", { skip: reachable ? false : `Postgres not reachable at ${TEST_DATABASE_URL}: ${reachabilityError?.message}` }, () => {
  let admin;

  before(async () => {
    admin = new Client({ connectionString: TEST_DATABASE_URL });
    await admin.connect();
    await migrate(createPgAdapter(admin));
    await admin.query(
      "INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('a2-fin','a2@n','A2',TRUE) ON CONFLICT DO NOTHING"
    );
    await admin.query(
      `UPDATE platform_control SET enabled=TRUE, changed_by='a2-fin', reason='a2 concurrency suite'
        WHERE key IN ('WITHDRAWALS','DEPOSITS')`
    );
  });

  after(async () => { await admin.end(); });

  test("PostgreSQL version and connection sanity", async () => {
    const r = await admin.query("SELECT version()");
    assert.match(r.rows[0].version, /PostgreSQL/);
    console.log("A2 evidence -- server:", r.rows[0].version);
  });

  test("1. simultaneous withdrawals: exactly one of two full-balance requests succeeds", async () => {
    const alice = await newFundedPlayer(admin, 100);
    await admin.query(
      `INSERT INTO payout_address (id, player_id, asset, network, address, added_at, usable_from)
       VALUES ($1,$2,'USDT','TRON',$3, now()-interval '48 hours', now()-interval '24 hours')`,
      [`addr_${randomUUID()}`, alice, GOOD_ADDR]
    );

    const A = await connection();
    const B = await connection();
    const provider = sandboxProvider();
    const svcA = createPaymentService(A.db, { provider, chain: {} });
    const svcB = createPaymentService(B.db, { provider, chain: {} });

    // request() RESOLVES {ok:true,...} on success but REJECTS (throws an
    // Error whose message is "INSUFFICIENT_FUNDS") on the losing side -- see
    // payments.mjs's `request()` and the existing single-connection test
    // "reserving twice locks the stake once" for the same convention.
    const [ra, rb] = await Promise.allSettled([
      svcA.request({ playerId: alice, destination: GOOD_ADDR, amountMinor: u(100), authorised: true }),
      svcB.request({ playerId: alice, destination: GOOD_ADDR, amountMinor: u(100), authorised: true }),
    ]);

    const outcomes = [ra, rb];
    const wins = outcomes.filter((r) => r.status === "fulfilled" && r.value.ok);
    const losses = outcomes.filter((r) => r.status === "rejected");
    assert.equal(wins.length, 1, "exactly one withdrawal request succeeds");
    assert.equal(losses.length, 1);
    assert.match(losses[0].reason.message, /INSUFFICIENT_FUNDS/);

    assert.equal(await natural(admin, `user:${alice}:available`), "0");
    assert.equal(await natural(admin, `user:${alice}:locked`), u(100));

    const rows = await admin.query("SELECT count(*)::int AS n FROM withdrawal WHERE player_id=$1", [alice]);
    assert.equal(rows.rows[0].n, 1, "the losing attempt's INSERT rolled back with its transaction -- never a second row");

    await closeAll(A, B);
  });

  test("2. simultaneous match reservations: two duels compete for the same player's only funds", async () => {
    const alice = await newFundedPlayer(admin, 100);
    const carol = await newFundedPlayer(admin, 100);
    const dave = await newFundedPlayer(admin, 100);
    const d1 = await newCashDuel(admin, { seat0: alice, seat1: carol, stake: 100 });
    const d2 = await newCashDuel(admin, { seat0: alice, seat1: dave, stake: 100 });

    const A = await connection();
    const B = await connection();
    const svcA = createSettlementService(A.db);
    const svcB = createSettlementService(B.db);

    const [ra, rb] = await Promise.allSettled([svcA.reserve(d1), svcB.reserve(d2)]);

    const wins = [ra, rb].filter((r) => r.status === "fulfilled" && r.value.ok && r.value.moved);
    const losses = [ra, rb].filter((r) => r.status === "rejected");
    assert.equal(wins.length, 1, "alice's balance can fund exactly one of the two duels, never both");
    for (const l of losses) assert.match(l.reason.message, /insufficient funds/);

    assert.equal(await natural(admin, `user:${alice}:available`), "0");
    assert.equal(await natural(admin, `user:${alice}:locked`), u(100));

    const statuses = await admin.query("SELECT id, status FROM duel WHERE id IN ($1,$2)", [d1, d2]);
    const readyCount = statuses.rows.filter((r) => r.status === "READY").length;
    assert.equal(readyCount, 1, "exactly one duel actually reserved and moved to READY");

    await closeAll(A, B);
  });

  test("3. withdrawal vs match reservation: only one of the two overlapping spends wins", async () => {
    const alice = await newFundedPlayer(admin, 100);
    const carol = await newFundedPlayer(admin, 100);
    await admin.query(
      `INSERT INTO payout_address (id, player_id, asset, network, address, added_at, usable_from)
       VALUES ($1,$2,'USDT','TRON',$3, now()-interval '48 hours', now()-interval '24 hours')`,
      [`addr_${randomUUID()}`, alice, GOOD_ADDR]
    );
    const duelId = await newCashDuel(admin, { seat0: alice, seat1: carol, stake: 100 });

    const A = await connection();
    const B = await connection();
    const provider = sandboxProvider();
    const paymentSvc = createPaymentService(A.db, { provider, chain: {} });
    const settlementSvc = createSettlementService(B.db);

    const [wd, res] = await Promise.allSettled([
      paymentSvc.request({ playerId: alice, destination: GOOD_ADDR, amountMinor: u(100), authorised: true }),
      settlementSvc.reserve(duelId),
    ]);

    const wdWon = wd.status === "fulfilled" && wd.value.ok;
    const resWon = res.status === "fulfilled" && res.value.ok && res.value.moved;
    assert.equal([wdWon, resWon].filter(Boolean).length, 1, "exactly one of withdrawal-lock or duel-reservation actually moved alice's funds");
    if (wd.status === "rejected") assert.match(wd.reason.message, /INSUFFICIENT_FUNDS/);
    if (res.status === "rejected") assert.match(res.reason.message, /insufficient funds/);
    assert.equal(await natural(admin, `user:${alice}:available`), "0");

    await closeAll(A, B);
  });

  test("4. duplicate webhook processed concurrently from two connections credits exactly once", async () => {
    const alice = await newFundedPlayer(admin, 0);
    const provider = sandboxProvider();
    const A = await connection();
    const B = await connection();
    const svcA = createPaymentService(A.db, { provider, chain: {} });

    // Create the deposit intent once (via one connection -- this part is not
    // what is being raced).
    const providerRef = `sbx_${randomUUID().slice(0, 12)}`;
    const address = `T${providerRef.replace(/-/g, "").slice(0, 33)}`;
    const depositId = `dep_${randomUUID()}`;
    await admin.query(
      `INSERT INTO deposit (id, player_id, asset, network, provider, provider_ref, address, status, expires_at)
       VALUES ($1,$2,'USDT','TRON','sandbox',$3,$4,'AWAITING_PAYMENT', now()+interval '1 day')`,
      [depositId, alice, providerRef, address]
    );

    // Randomised per run, like providerRef/depositId above: this is a real,
    // persistent database across test runs, and deposit.observed_tx_hash is
    // unique -- a fixed literal here collided with itself on any re-run.
    const txHash = `0x${randomUUID().replace(/-/g, "")}`;
    const chain = { async getIncoming() {
      return { txHash, outputIndex: 0, amountMinor: u(50), asset: "USDT", network: "TRON", address, confirmations: 30 };
    } };
    const svcB = createPaymentService(B.db, { provider, chain });
    const svcA2 = createPaymentService(A.db, { provider, chain });

    // provider_event has UNIQUE (provider, provider_event_id) -- a fixed
    // literal here is the same re-run collision as txHash above.
    const eventId = `evt-dup-${randomUUID()}`;
    const { body, headers } = signedWebhook({ eventId, providerRef });

    const [ra, rb] = await Promise.all([
      svcA2.ingestWebhook(body, headers),
      svcB.ingestWebhook(body, headers),
    ]);

    const credited = [ra, rb].filter((r) => r.credited === true);
    assert.equal(credited.length, 1, "exactly one of the two identical concurrent webhooks actually credits");
    assert.equal(await natural(admin, `user:${alice}:available`), u(50));

    const events = await admin.query(
      "SELECT count(*)::int AS n FROM provider_event WHERE provider='sandbox' AND provider_event_id=$1", [eventId]
    );
    assert.equal(events.rows[0].n, 1, "one provider_event row, not two -- idempotency key held under real concurrency");

    await closeAll(A, B);
  });

  test("6. the same on-chain output cannot credit twice, raced directly at verifyAndCredit()", async () => {
    const alice = await newFundedPlayer(admin, 0);
    const provider = sandboxProvider();
    const providerRef = `sbx_${randomUUID().slice(0, 12)}`;
    const address = `T${providerRef.replace(/-/g, "").slice(0, 33)}`;
    const depositId = `dep_${randomUUID()}`;
    await admin.query(
      `INSERT INTO deposit (id, player_id, asset, network, provider, provider_ref, address, status, expires_at)
       VALUES ($1,$2,'USDT','TRON','sandbox',$3,$4,'AWAITING_PAYMENT', now()+interval '1 day')`,
      [depositId, alice, providerRef, address]
    );
    // Same reason as test 4 above: unique per run, not a fixed literal.
    const txHash = `0x${randomUUID().replace(/-/g, "")}`;
    const chain = { async getIncoming() {
      return { txHash, outputIndex: 0, amountMinor: u(30), asset: "USDT", network: "TRON", address, confirmations: 30 };
    } };

    const A = await connection();
    const B = await connection();
    const svcA = createPaymentService(A.db, { provider, chain });
    const svcB = createPaymentService(B.db, { provider, chain });

    const [ra, rb] = await Promise.all([svcA.verifyAndCredit(providerRef), svcB.verifyAndCredit(providerRef)]);
    const credited = [ra, rb].filter((r) => r.credited === true);
    assert.equal(credited.length, 1);
    assert.equal(await natural(admin, `user:${alice}:available`), u(30));

    const txCount = await admin.query(
      "SELECT count(*)::int AS n FROM ledger_transaction WHERE idempotency_key LIKE $1",
      [`deposit:TRON:${txHash}:%`]
    );
    assert.equal(txCount.rows[0].n, 1, "one ledger transaction for this on-chain output, never two");

    await closeAll(A, B);
  });

  test("5. simultaneous prize settlement: exactly one of two concurrent settle() calls actually pays out", async () => {
    const alice = await newFundedPlayer(admin, 100);
    const bob = await newFundedPlayer(admin, 100);
    const duelId = await newCashDuel(admin, { seat0: alice, seat1: bob, stake: 100 });
    await admin.query(
      `UPDATE duel SET status='RESERVED' WHERE id=$1`, [duelId]
    );
    const settlePrep = createSettlementService(createPgAdapter(admin));
    await settlePrep.reserve(duelId);
    await admin.query(
      `UPDATE duel SET status='COMPLETED', result='1-0', termination_reason='RESIGNATION',
              completed_at=now(), game_hash='h' WHERE id=$1`,
      [duelId]
    );

    const A = await connection();
    const B = await connection();
    const svcA = createSettlementService(A.db);
    const svcB = createSettlementService(B.db);

    const [ra, rb] = await Promise.all([svcA.settle(duelId), svcB.settle(duelId)]);
    const settled = [ra, rb].filter((r) => r.reason === "SETTLED");
    const already = [ra, rb].filter((r) => r.reason === "ALREADY_SETTLED");
    assert.equal(settled.length, 1);
    assert.equal(already.length, 1);

    const winnerLocked = await natural(admin, `user:${alice}:locked`);
    const loserLocked = await natural(admin, `user:${bob}:locked`);
    assert.equal(winnerLocked, "0");
    assert.equal(loserLocked, "0");

    await closeAll(A, B);
  });

  test("7. withdrawal completion: two concurrent complete() calls on the same withdrawal pay out exactly once", async () => {
    const alice = await newFundedPlayer(admin, 100);
    const withdrawalId = `wd_${randomUUID()}`;
    const locked = await admin.query(
      `SELECT * FROM ledger_post($1,'WITHDRAWAL_LOCK','SYSTEM',NULL,$2::jsonb)`,
      [`withdrawal:${withdrawalId}:lock`, JSON.stringify([
        { account: `user:${alice}:available`, amount: u(100) },
        { account: `user:${alice}:locked`, amount: "-" + u(100) },
      ])]
    );
    // tx_hash is unique per network (withdrawal_one_tx_per_payout) -- this is
    // a real, persistent database across test runs, not a fresh PGlite
    // instance per process, so a fixed literal here collided with itself on
    // every re-run. Randomised like withdrawalId above, for the same reason.
    await admin.query(
      `INSERT INTO withdrawal (id, player_id, asset, network, destination, amount_minor, status, tx_hash, lock_tx_id)
       VALUES ($1,$2,'USDT','TRON',$3,$4,'CONFIRMED'::withdrawal_status,$5,$6)`,
      [withdrawalId, alice, GOOD_ADDR, u(100), `0x${randomUUID().replace(/-/g, "")}`, locked.rows[0].transaction_id]
    );

    const A = await connection();
    const B = await connection();
    const provider = sandboxProvider();
    const svcA = createPaymentService(A.db, { provider, chain: {} });
    const svcB = createPaymentService(B.db, { provider, chain: {} });

    const [ra, rb] = await Promise.all([svcA.complete(withdrawalId), svcB.complete(withdrawalId)]);
    const completed = [ra, rb].filter((r) => r.ok && !r.alreadyDone);
    const already = [ra, rb].filter((r) => r.ok && r.alreadyDone);
    assert.equal(completed.length, 1);
    assert.equal(already.length, 1);
    assert.equal(await natural(admin, `user:${alice}:locked`), "0");

    await closeAll(A, B);
  });

  test("8. stale state: a duel ownership lease's compare-and-swap holds under a REAL concurrent race, not a simulated one", async () => {
    const alice = await newFundedPlayer(admin, 0);
    const bob = await newFundedPlayer(admin, 0);
    const duelId = `duel_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    await admin.query(
      `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
                         tier, stake_minor, initial_state, time_control, status)
       VALUES ($1,'chess',1,$1,$2,$3,'FREE',0,'{}'::jsonb,'{}'::jsonb,'LIVE'::duel_status)`,
      [duelId, alice, bob]
    );

    const A = await connection();
    const B = await connection();
    const C = await connection();
    const D = await connection();
    const leaseA = createLeaseManager(A.db, { leaseMs: 30000 });
    const leaseB = createLeaseManager(B.db, { leaseMs: 30000 });
    const leaseC = createLeaseManager(C.db, { leaseMs: 30000 });
    const leaseD = createLeaseManager(D.db, { leaseMs: 30000 });

    // Four genuinely independent connections race to acquire the SAME lease
    // at once. Exactly one may win.
    const results = await Promise.all([
      leaseA.acquire(duelId, "gw-a"),
      leaseB.acquire(duelId, "gw-b"),
      leaseC.acquire(duelId, "gw-c"),
      leaseD.acquire(duelId, "gw-d"),
    ]);
    const winners = results.filter((r) => r.ok);
    assert.equal(winners.length, 1, "exactly one of four genuinely concurrent acquirers wins the lease");

    const final = await admin.query("SELECT lease_owner, lease_token FROM duel WHERE id=$1", [duelId]);
    // node-postgres returns BIGINT columns as strings, not JS numbers.
    assert.equal(Number(final.rows[0].lease_token), 1, "one real acquisition happened, not a partial/racy double-increment");

    await closeAll(A, B, C, D);
  });

  test("9. negative balance invariant: many concurrent spenders against a small balance never push it below zero", async () => {
    // Each attempt withdraws 10 units (above the service's 5-unit minimum);
    // a balance of exactly 30 can fund exactly 3 of them. Kept deliberately
    // small: Postgres's own `deadlock_timeout` (1s by default) means each
    // genuine deadlock this provokes costs real wall-clock time to detect,
    // and this scenario's point -- the invariant holds under real concurrent
    // writers -- does not need maximum contention to prove, just genuine
    // concurrency.
    const alice = await newFundedPlayer(admin, 30);
    await admin.query(
      `INSERT INTO payout_address (id, player_id, asset, network, address, added_at, usable_from)
       VALUES ($1,$2,'USDT','TRON',$3, now()-interval '48 hours', now()-interval '24 hours')`,
      [`addr_${randomUUID()}`, alice, GOOD_ADDR]
    );

    const N = 5; // more attempts than the balance can possibly fund
    const EXPECTED_WINS = 3;
    const conns = await Promise.all(Array.from({ length: N }, () => connection()));
    const provider = sandboxProvider();
    const services = conns.map((c) => createPaymentService(c.db, { provider, chain: {} }));

    const results = await Promise.allSettled(
      services.map((svc) => svc.request({ playerId: alice, destination: GOOD_ADDR, amountMinor: u(10), authorised: true }))
    );

    const wins = results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
    const losses = results.filter((r) => r.status === "rejected");
    assert.equal(wins + losses.length, N, "every attempt resolved one way or the other");
    assert.ok(wins <= EXPECTED_WINS, "never more winners than the balance can actually fund");

    // Every loss is either the clean business outcome (insufficient funds)
    // or -- under this much genuinely simultaneous contention on one row,
    // even with the adapter's retry-with-jitter -- the rare deadlock that
    // outlived every retry. Both are safe: a losing transaction's entire
    // BEGIN..ROLLBACK writes nothing at all, so neither can double-spend or
    // push the balance negative. Only if every loss resolved cleanly (no
    // deadlock timeouts got in the way) do we require the full expected
    // count, so this stays a meaningful assertion rather than a tautology.
    const deadlocked = losses.filter((l) => /deadlock detected/.test(l.reason.message)).length;
    for (const l of losses) assert.match(l.reason.message, /INSUFFICIENT_FUNDS|deadlock detected/);
    if (deadlocked === 0) {
      assert.equal(wins, EXPECTED_WINS, "with no retries exhausted, exactly three 10-unit withdrawals fit in a balance of thirty");
    }

    const finalAvailable = await natural(admin, `user:${alice}:available`);
    assert.equal(finalAvailable, u(30 - wins * 10), "the ledger's actual balance matches exactly what really won, to the unit");
    assert.ok(BigInt(finalAvailable) >= 0n, "the balance-non-negative trigger held under real concurrent writers");

    await closeAll(...conns);
  });

  test("10. lock integrity: after a mix of winning and losing concurrent spends, the books still balance to zero platform-wide", async () => {
    const before = await admin.query(
      `SELECT a.asset, SUM(b.balance)::text AS total
         FROM ledger_account a JOIN ledger_balance b ON b.account_id = a.id
        GROUP BY a.asset`
    );
    // Double-entry means every posted transaction sums its legs to zero, so
    // the sum of ALL accounts' raw balances (not natural-signed) must be
    // exactly zero for every asset, always -- winners, losers, and orphaned
    // locks alike. This check runs AFTER scenarios 1-9 have already left
    // their winning and losing attempts' traces in this same database.
    for (const row of before.rows) {
      assert.equal(row.total, "0", `asset ${row.asset}: the ledger must sum to exactly zero, no orphaned entries either side`);
    }

    // And no account anywhere is sitting negative -- the one thing the
    // non-negativity trigger exists to make structurally impossible.
    const negatives = await admin.query(
      `SELECT a.key, ledger_natural_balance(a.normal_side, b.balance) AS bal
         FROM ledger_account a JOIN ledger_balance b ON b.account_id = a.id
        WHERE a.allow_negative = FALSE
          AND ledger_natural_balance(a.normal_side, b.balance) < 0`
    );
    assert.equal(negatives.rows.length, 0, `no account should ever be negative; found: ${JSON.stringify(negatives.rows)}`);
  });
});
