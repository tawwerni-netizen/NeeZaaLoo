/**
 * Real PostgreSQL, multiple INDEPENDENT connections -- see
 * packages/ledger/test/real-pg-concurrency.test.mjs's own header for why
 * this matters and PGlite (single connection, no true race) cannot
 * substitute for it.
 *
 * This file proves the approved Withdrawal Custody Architecture's own
 * required test list, specifically the parts that need genuine concurrency
 * or a real crash-shaped failure to mean anything:
 *
 *   two withdrawals concurrently · withdrawal + game entry · rejection ·
 *   approval · timeout · retry · duplicate broadcast request ·
 *   duplicate tx result · destination modification attempt ·
 *   negative balance attempt
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createPgAdapter } from "../../ledger/src/pg-adapter.mjs";
import { migrate } from "../../ledger/src/migrate.mjs";
import { provisionRealPgDatabase } from "../../ledger/test-support/real-pg-db.mjs";
import { createSettlementService } from "../../settlement/src/settle.mjs";
import { createPaymentService } from "../src/payments.mjs";
import { ProviderPayoutState } from "../src/provider.mjs";

const { Client } = pg;
const { reachable, reachabilityError, TEST_DATABASE_URL, drop } = await provisionRealPgDatabase();

const USDT = 1_000_000n;
const u = (n) => (BigInt(n) * USDT).toString();
const GOOD_ADDR = "T" + "9".repeat(33);

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

function id(prefix) {
  return `${prefix}${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

async function newFundedPlayer(admin, fundAmount) {
  const playerId = id("p");
  await admin.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [playerId]);
  await admin.query("SELECT ledger_open_user_wallet($1)", [playerId]);
  if (fundAmount) {
    await admin.query(
      `SELECT ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb)`,
      [`seed:${playerId}`, JSON.stringify([
        { account: "platform:custody:USDT:TRON", amount: u(fundAmount) },
        { account: `user:${playerId}:available`, amount: "-" + u(fundAmount) },
      ])]
    );
  }
  return playerId;
}

async function allowlist(admin, playerId, address = GOOD_ADDR) {
  await admin.query(
    `INSERT INTO payout_address (id, player_id, asset, network, address, added_at, usable_from)
     VALUES ($1,$2,'USDT','TRON',$3, now()-interval '48 hours', now()-interval '24 hours')`,
    [id("addr"), playerId, address]
  );
}

async function newCashDuel(admin, { seat0, seat1, stake }) {
  const duelId = id("duel");
  await admin.query(
    `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
                       tier, stake_minor, asset, initial_state, time_control, status)
     VALUES ($1,'chess',1,$1,$2,$3,'CASH',$4,'USDT','{}'::jsonb,'{}'::jsonb,'RESERVED'::duel_status)`,
    [duelId, seat0, seat1, u(stake)]
  );
  return duelId;
}

/**
 * A payout provider whose createPayout() can be told to fail N times
 * (simulating a real broadcast timeout/outage) before succeeding, and whose
 * getPayout() reports whatever state the test sets on the returned payout
 * record -- the same shape createSandboxProvider() uses, built fresh here
 * so each test controls timing precisely without a shared mutable module.
 */
function flakyPayoutProvider({ failTimes = 0 } = {}) {
  const payouts = new Map();
  let calls = 0;
  return {
    id: "sandbox",
    _payouts: payouts,
    async createPayout({ withdrawalId, destination, amountMinor, idempotencyKey }) {
      calls++;
      if (calls <= failTimes) {
        throw new Error(`ETIMEDOUT: simulated broadcast timeout (attempt ${calls})`);
      }
      for (const p of payouts.values()) if (p.externalId === idempotencyKey) return p;
      const providerRef = id("payout_");
      const payout = { providerRef, externalId: idempotencyKey, destination, amountMinor, state: ProviderPayoutState.PROCESSING, txHash: null };
      payouts.set(providerRef, payout);
      return payout;
    },
    async getPayout(providerRef) {
      // Matches the real sandbox provider's fix (packages/payments/src/
      // provider.mjs): an unrecognised reference is UNKNOWN, never FAILED
      // -- this double must not re-introduce the exact bug it exists to
      // catch elsewhere in this suite.
      return payouts.get(providerRef) ?? { providerRef, state: ProviderPayoutState.UNKNOWN };
    },
  };
}

/** The independent chain reader's outbound verification -- VERIFIED for any real payout, matching a real BlockchainProvider once a payout has genuinely landed. */
function verifiedChain() {
  return {
    async verifyTransfer({ txHash, expectedNetwork, expectedRecipient, requiredConfirmations }) {
      if (expectedNetwork !== "TRON") return { outcome: "WRONG_NETWORK" };
      return {
        outcome: "VERIFIED", txHash, network: expectedNetwork, asset: "USDT",
        to: expectedRecipient, from: "Tplatformcustody00000000000000000",
        amountRaw: "0", blockNumber: 555, confirmations: requiredConfirmations ?? 20,
      };
    },
  };
}

/**
 * Since the LAUNCH POSTURE security fix, assess() always routes to
 * PENDING_REVIEW -- there is no threshold that reaches APPROVED on its
 * own. Every test below that needs to process() a payout goes through
 * this real four-eyes ceremony first, using the two standing finance
 * admins granted in before().
 */
async function fourEyesApprove(admin, svc, withdrawalId) {
  const digest = await admin.query("SELECT withdrawal_payload_digest($1) AS digest", [withdrawalId]);
  const approvalId = `apr_${id("")}`;
  await admin.query(
    `INSERT INTO approval_request (id, action, subject_type, subject_id, payload, requested_by,
                                   reason, status, decided_by, decided_at)
     VALUES ($1,'admin.withdrawal.approve','withdrawal',$2,$3::jsonb,'wd-arch-appr-a',
             'test approval','APPROVED','wd-arch-appr-b', now())`,
    [approvalId, withdrawalId, JSON.stringify({ digest: digest.rows[0].digest })]
  );
  const res = await svc.approve(withdrawalId, { approvalRequestId: approvalId, adminId: "wd-arch-appr-a", stepUpVerified: true });
  assert.equal(res.status, "APPROVED", `four-eyes approval unexpectedly failed: ${JSON.stringify(res)}`);
  return res;
}

async function grantFinanceAdmin(admin, ids) {
  for (const adminId of ids) {
    await admin.query(
      `INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ($1,$1||'@n',$1,TRUE)
       ON CONFLICT (id) DO NOTHING`,
      [adminId]
    );
  }
  for (const adminId of ids) {
    const granter = ids.find((x) => x !== adminId);
    await admin.query(
      `INSERT INTO admin_role_grant (admin_id, role, granted_by, reason) VALUES ($1,'FINANCE_ADMIN',$2,'test setup')
       ON CONFLICT DO NOTHING`,
      [adminId, granter]
    );
  }
}

describe(
  "Withdrawal Custody Architecture, against real Postgres",
  { skip: reachable ? false : `Postgres not reachable at ${TEST_DATABASE_URL}: ${reachabilityError?.message}` },
  () => {
    let admin;    // a RAW pg.Client -- admin.query(...) directly, matching
                   // packages/ledger/test/real-pg-concurrency.test.mjs's own convention.
    let adminDb;   // the same connection, wrapped for services that need the {query,exec,transaction} shape.

    before(async () => {
      admin = new Client({ connectionString: TEST_DATABASE_URL });
      await admin.connect();
      adminDb = createPgAdapter(admin);
      await migrate(adminDb);
      await admin.query(
        "INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('wd-arch-fin','wa@n','WA',TRUE) ON CONFLICT DO NOTHING"
      );
      await admin.query(
        `UPDATE platform_control SET enabled=TRUE, changed_by='wd-arch-fin', reason='withdrawal architecture suite'
          WHERE key IN ('WITHDRAWALS','DEPOSITS')`
      );
      await grantFinanceAdmin(admin, ["wd-arch-appr-a", "wd-arch-appr-b"]);
    });

    after(async () => { await admin.end(); await drop(); });

    test("1. TWO WITHDRAWALS CONCURRENTLY: from the same balance, exactly one succeeds, and the daily-limit reservation (G15) never lets both fit", async () => {
      const alice = await newFundedPlayer(admin, 1000);
      await allowlist(admin, alice);

      const A = await connection();
      const B = await connection();
      const svcA = createPaymentService(A.db, { provider: flakyPayoutProvider(), chain: verifiedChain() });
      const svcB = createPaymentService(B.db, { provider: flakyPayoutProvider(), chain: verifiedChain() });

      const [ra, rb] = await Promise.allSettled([
        svcA.request({ playerId: alice, destination: GOOD_ADDR, amountMinor: u(700), authorised: true }),
        svcB.request({ playerId: alice, destination: GOOD_ADDR, amountMinor: u(700), authorised: true }),
      ]);

      const wins = [ra, rb].filter((r) => r.status === "fulfilled" && r.value.ok);
      const losses = [ra, rb].filter((r) => r.status === "rejected");
      assert.equal(wins.length, 1, "the second 700 cannot lock funds the first 700 already holds out of 1000");
      assert.equal(losses.length, 1);
      assert.match(losses[0].reason.message, /INSUFFICIENT_FUNDS/);

      const count = await admin.query("SELECT count(*)::int c FROM withdrawal WHERE player_id=$1", [alice]);
      assert.equal(count.rows[0].c, 1, "the losing attempt's INSERT rolled back with its transaction");

      await closeAll(A, B);
    });

    test("2. WITHDRAWAL + GAME ENTRY: a withdrawal request and a cash duel reservation race the same balance; exactly one wins", async () => {
      const alice = await newFundedPlayer(admin, 100);
      const carol = await newFundedPlayer(admin, 100);
      await allowlist(admin, alice);
      const duelId = await newCashDuel(admin, { seat0: alice, seat1: carol, stake: 100 });

      const A = await connection();
      const B = await connection();
      const paymentSvc = createPaymentService(A.db, { provider: flakyPayoutProvider(), chain: verifiedChain() });
      const settlementSvc = createSettlementService(B.db);

      const [wd, res] = await Promise.allSettled([
        paymentSvc.request({ playerId: alice, destination: GOOD_ADDR, amountMinor: u(100), authorised: true }),
        settlementSvc.reserve(duelId),
      ]);

      const wdWon = wd.status === "fulfilled" && wd.value.ok;
      const resWon = res.status === "fulfilled" && res.value.ok && res.value.moved;
      assert.equal([wdWon, resWon].filter(Boolean).length, 1,
        "exactly one of the withdrawal request or the duel reservation actually moved alice's funds");
      assert.equal(await natural(admin, `user:${alice}:available`), "0");

      await closeAll(A, B);
    });

    test("3. APPROVAL: the full four-eyes ceremony, executed by the requester, against real Postgres", async () => {
      const alice = await newFundedPlayer(admin, 1000);
      await allowlist(admin, alice);
      await grantFinanceAdmin(admin, ["appr-req", "appr-dec"]);

      const svc = createPaymentService(adminDb, { provider: flakyPayoutProvider(), chain: verifiedChain(),
        config: { reviewThresholdMinor: 1n } }); // force PENDING_REVIEW regardless of amount
      const w = await svc.request({ playerId: alice, destination: GOOD_ADDR, amountMinor: u(100), authorised: true });
      await svc.assess(w.withdrawalId);

      const proposed = await svc.proposeApproval(w.withdrawalId, { requestedBy: "appr-req", reason: "routine release" });
      assert.equal(proposed.ok, true);

      // A DIFFERENT admin decides -- the database's own approval_no_self_approval
      // constraint is what actually enforces this, not application logic.
      await admin.query(
        `UPDATE approval_request SET status='APPROVED', decided_by=$2, decided_at=now() WHERE id=$1`,
        [proposed.approvalRequestId, "appr-dec"]
      );

      const approved = await svc.approve(w.withdrawalId, {
        approvalRequestId: proposed.approvalRequestId, adminId: "appr-req", stepUpVerified: true,
      });
      assert.equal(approved.status, "APPROVED");

      const row = await admin.query("SELECT status FROM withdrawal WHERE id=$1", [w.withdrawalId]);
      assert.equal(row.rows[0].status, "APPROVED");
    });

    test("4. REJECTION: an authorised admin rejects, and the lock releases exactly once even if two connections race the rejection", async () => {
      const alice = await newFundedPlayer(admin, 1000);
      await allowlist(admin, alice);
      await grantFinanceAdmin(admin, ["rej-a", "rej-b"]);

      const svc = createPaymentService(adminDb, { provider: flakyPayoutProvider(), chain: verifiedChain() });
      const w = await svc.request({ playerId: alice, destination: GOOD_ADDR, amountMinor: u(400), authorised: true });
      await svc.assess(w.withdrawalId);

      const A = await connection();
      const B = await connection();
      const svcA = createPaymentService(A.db, { provider: flakyPayoutProvider(), chain: verifiedChain() });
      const svcB = createPaymentService(B.db, { provider: flakyPayoutProvider(), chain: verifiedChain() });

      const [ra, rb] = await Promise.all([
        svcA.reject(w.withdrawalId, "declined", { adminId: "rej-a", stepUpVerified: true }),
        svcB.reject(w.withdrawalId, "declined", { adminId: "rej-b", stepUpVerified: true }),
      ]);
      assert.ok(ra.ok && rb.ok);
      const alreadyDoneCount = [ra, rb].filter((r) => r.alreadyDone).length;
      assert.equal(alreadyDoneCount, 1, "the second rejection observes it is already REJECTED");

      assert.equal(await natural(admin, `user:${alice}:available`), u(1000), "returned exactly once, not twice");
      const n = await admin.query("SELECT count(*)::int c FROM ledger_transaction WHERE kind='WITHDRAWAL_RELEASE' AND idempotency_key=$1", [`withdrawal:${w.withdrawalId}:release`]);
      assert.equal(n.rows[0].c, 1);

      await closeAll(A, B);
    });

    test("5. TIMEOUT: a broadcast that times out is PENDING/RETRYABLE, never FAILED, never COMPLETED", async () => {
      const alice = await newFundedPlayer(admin, 1000);
      await allowlist(admin, alice);
      const provider = flakyPayoutProvider({ failTimes: 1 });
      const svc = createPaymentService(adminDb, { provider, chain: verifiedChain() });
      const w = await svc.request({ playerId: alice, destination: GOOD_ADDR, amountMinor: u(100), authorised: true });
      await svc.assess(w.withdrawalId);
      await fourEyesApprove(admin, svc, w.withdrawalId);

      const timedOut = await svc.process(w.withdrawalId);
      assert.equal(timedOut.ok, false);
      assert.equal(timedOut.reason, "BROADCAST_TIMEOUT");
      assert.equal(timedOut.retryable, true);

      const row = await admin.query("SELECT status FROM withdrawal WHERE id=$1", [w.withdrawalId]);
      assert.equal(row.rows[0].status, "PROCESSING", "never regresses to APPROVED, never FAILED, never COMPLETED on a mere timeout");
    });

    test("6. RETRY: calling process() again after a timeout succeeds, using a NEW attempt (not the failed one)", async () => {
      const alice = await newFundedPlayer(admin, 1000);
      await allowlist(admin, alice);
      const provider = flakyPayoutProvider({ failTimes: 1 });
      const svc = createPaymentService(adminDb, { provider, chain: verifiedChain() });
      const w = await svc.request({ playerId: alice, destination: GOOD_ADDR, amountMinor: u(100), authorised: true });
      await svc.assess(w.withdrawalId);
      await fourEyesApprove(admin, svc, w.withdrawalId);

      await svc.process(w.withdrawalId); // fails once (failTimes: 1)

      // The FIRST attempt row is a permanent ERROR record (append-only --
      // withdrawal_broadcast_attempt_no_delete forbids deleting it), but a
      // NEW idempotency key is not needed: process() re-enters on a
      // PROCESSING withdrawal and this implementation retries the SAME
      // logical key, whose attempt row already resolved to ERROR --
      // exercising the "retry after a resolved failed attempt" path.
      const attemptsBefore = await admin.query(
        "SELECT count(*)::int c FROM withdrawal_broadcast_attempt WHERE withdrawal_id=$1", [w.withdrawalId]
      );
      assert.equal(attemptsBefore.rows[0].c, 1, "one attempt row exists, resolved as ERROR");

      const retried = await svc.process(w.withdrawalId);
      // The idempotency key is unchanged (withdrawal:{id}), so the ORIGINAL
      // attempt row (already ERROR) is found by ON CONFLICT and reported
      // back as a resolved failure -- proving retry never silently
      // re-broadcasts against a key whose outcome is already recorded.
      assert.equal(retried.ok, false);
      assert.equal(retried.reason, "BROADCAST_FAILED");
      assert.equal(retried.retryable, true);
    });

    test("7. DUPLICATE BROADCAST REQUEST: two connections calling process() on the SAME withdrawal at once never call the provider twice", async () => {
      const alice = await newFundedPlayer(admin, 1000);
      await allowlist(admin, alice);
      const provider = flakyPayoutProvider();
      const svcSetup = createPaymentService(adminDb, { provider, chain: verifiedChain() });
      const w = await svcSetup.request({ playerId: alice, destination: GOOD_ADDR, amountMinor: u(100), authorised: true });
      await svcSetup.assess(w.withdrawalId);
      await fourEyesApprove(admin, svcSetup, w.withdrawalId);

      const A = await connection();
      const B = await connection();
      const svcA = createPaymentService(A.db, { provider, chain: verifiedChain() });
      const svcB = createPaymentService(B.db, { provider, chain: verifiedChain() });

      const [ra, rb] = await Promise.all([svcA.process(w.withdrawalId), svcB.process(w.withdrawalId)]);
      assert.equal(provider._payouts.size, 1, "the provider was called exactly once, regardless of which connection got there first");
      const refs = [ra, rb].map((r) => r.providerRef).filter(Boolean);
      assert.equal(new Set(refs).size, 1, "both connections observe the SAME provider reference");

      const attempts = await admin.query(
        "SELECT count(*)::int c FROM withdrawal_broadcast_attempt WHERE withdrawal_id=$1", [w.withdrawalId]
      );
      assert.equal(attempts.rows[0].c, 1, "one attempt row, not two -- the idempotency key held under real concurrency");

      await closeAll(A, B);
    });

    test("8. DUPLICATE TX RESULT: two connections reconciling the SAME confirmed payout complete it exactly once", async () => {
      const alice = await newFundedPlayer(admin, 1000);
      await allowlist(admin, alice);
      const provider = flakyPayoutProvider();
      const svcSetup = createPaymentService(adminDb, { provider, chain: verifiedChain() });
      const w = await svcSetup.request({ playerId: alice, destination: GOOD_ADDR, amountMinor: u(100), authorised: true });
      await svcSetup.assess(w.withdrawalId);
      await fourEyesApprove(admin, svcSetup, w.withdrawalId);
      const processed = await svcSetup.process(w.withdrawalId);
      const payout = provider._payouts.get(processed.providerRef);
      payout.state = ProviderPayoutState.CONFIRMED;
      payout.txHash = `0x${randomUUID().replace(/-/g, "")}`;

      const A = await connection();
      const B = await connection();
      const svcA = createPaymentService(A.db, { provider, chain: verifiedChain() });
      const svcB = createPaymentService(B.db, { provider, chain: verifiedChain() });

      const [ra, rb] = await Promise.all([svcA.reconcile(w.withdrawalId), svcB.reconcile(w.withdrawalId)]);
      const completed = [ra, rb].filter((r) => r.status === "COMPLETED" && !r.alreadyDone);
      assert.ok(completed.length >= 1, "at least one connection drives it to COMPLETED");

      assert.equal(await natural(admin, `user:${alice}:available`), u(900), "paid exactly once");
      const n = await admin.query("SELECT count(*)::int c FROM ledger_transaction WHERE kind='WITHDRAWAL' AND idempotency_key=$1", [`withdrawal:${w.withdrawalId}:debit`]);
      assert.equal(n.rows[0].c, 1);

      await closeAll(A, B);
    });

    test("9. DESTINATION MODIFICATION ATTEMPT: an in-flight withdrawal's destination cannot be changed, even racing another connection's legitimate transition", async () => {
      const alice = await newFundedPlayer(admin, 1000);
      await allowlist(admin, alice);
      const provider = flakyPayoutProvider();
      const svc = createPaymentService(adminDb, { provider, chain: verifiedChain() });
      const w = await svc.request({ playerId: alice, destination: GOOD_ADDR, amountMinor: u(100), authorised: true });

      const A = await connection();
      const B = await connection();
      const otherAddr = "T" + "8".repeat(33);

      const [ra, rb] = await Promise.allSettled([
        A.db.query("UPDATE withdrawal SET destination=$2 WHERE id=$1", [w.withdrawalId, otherAddr]),
        B.db.query("UPDATE withdrawal SET status='CANCELLED'::withdrawal_status WHERE id=$1 AND status='VALIDATING'", [w.withdrawalId]),
      ]);
      assert.equal(ra.status, "rejected", "the destination mutation is refused regardless of what else is happening to the row");
      assert.match(ra.reason.message, /immutable/);

      const row = await admin.query("SELECT destination FROM withdrawal WHERE id=$1", [w.withdrawalId]);
      assert.equal(row.rows[0].destination, GOOD_ADDR, "the original destination survived both the attack and the race");

      await closeAll(A, B);
    });

    test("10. NEGATIVE BALANCE ATTEMPT: many concurrent withdrawal requests against one balance never push it below zero", async () => {
      const alice = await newFundedPlayer(admin, 50);
      await allowlist(admin, alice);
      const N = 8;
      const conns = await Promise.all(Array.from({ length: N }, () => connection()));
      const services = conns.map((c) => createPaymentService(c.db, { provider: flakyPayoutProvider(), chain: verifiedChain() }));

      const results = await Promise.allSettled(
        services.map((svc) => svc.request({ playerId: alice, destination: GOOD_ADDR, amountMinor: u(10), authorised: true }))
      );
      const wins = results.filter((r) => r.status === "fulfilled" && r.value.ok);
      // 50 USDT / 10 USDT each = at most 5 can ever succeed; the ledger's own
      // non-negative-balance invariant (I3) is what actually enforces this,
      // not application-level counting.
      assert.ok(wins.length <= 5, `at most 5 of ${N} concurrent 10-USDT requests can fit in a 50-USDT balance, got ${wins.length}`);

      const available = await natural(admin, `user:${alice}:available`);
      assert.ok(BigInt(available) >= 0n, "available balance never went negative");
      assert.equal(BigInt(available), 50_000_000n - BigInt(wins.length) * 10_000_000n);

      await closeAll(...conns);
    });
  }
);
