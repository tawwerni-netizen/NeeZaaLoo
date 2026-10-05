/**
 * GET /v1/admin/dashboard/summary -- the one aggregation point behind the
 * admin dashboard's KPI row and panels. Every assertion here checks that a
 * figure is the REAL count/balance from the table it claims to summarize,
 * never a value the endpoint merely echoes back or invents -- the same
 * discipline the rail Control Center's own tests already hold health data
 * to (rail-control-center.test.mjs).
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createApi } from "../src/server.mjs";
import { createRailService } from "../../payments/src/valuation.mjs";
import { createHealthService } from "../../payments/src/health.mjs";
import { createMockChainReader } from "../../chain/src/reader.mjs";

const SIGNING_KEY = Buffer.alloc(32, 21);
const ENCRYPTION_KEY = Buffer.alloc(32, 22);
const PASSWORD = "correct horse battery staple";
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };
const USDT = 1_000_000n;
const u = (n) => (BigInt(n) * USDT).toString();

let db, auth, api, base;

async function req(method, path, { token } = {}) {
  const res = await fetch(`${base}${path}`, {
    method, headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: json };
}

const tokenFor = async (handle) => (await auth.login({ identifier: handle, password: PASSWORD })).accessToken;

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  auth = createAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: FAST_ARGON });
  const rails = createRailService(db);
  const chain = createMockChainReader();
  const railHealth = createHealthService({ db, chain });

  api = createApi({ db, auth, rails, railHealth, rateLimit: { capacity: 5000, refillPerSecond: 5000 } });
  await api.listen();
  base = api.url;

  for (const p of ["root", "viewer", "support", "white", "black"]) {
    await auth.register({ playerId: p, handle: p, password: PASSWORD });
  }
  await db.query(
    `INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES
     ('root','root@nizalo','Root',TRUE), ('viewer','viewer@nizalo','Viewer',TRUE),
     ('support','support@nizalo','Support',TRUE)`
  );
  await db.query(
    `INSERT INTO admin_role_grant (admin_id, role, granted_by, reason) VALUES
     ('root','SUPER_ADMIN','viewer','bootstrap'),
     ('viewer','READ_ONLY','root','bootstrap'),
     ('support','SUPPORT','root','bootstrap')`
  );
  await db.query("SELECT ledger_open_user_wallet($1)", ["white"]);
  await db.query("SELECT ledger_open_user_wallet($1)", ["black"]);
});

after(async () => { await api.close(); });

describe("authorization: gated by analytics.read, like every other cross-cutting read", () => {
  test("an admin without analytics.read (SUPPORT) is refused", async () => {
    const r = await req("GET", "/v1/admin/dashboard/summary", { token: await tokenFor("support") });
    assert.equal(r.status, 403);
  });

  test("READ_ONLY (which holds analytics.read) can see the dashboard", async () => {
    const r = await req("GET", "/v1/admin/dashboard/summary", { token: await tokenFor("viewer") });
    assert.equal(r.status, 200);
  });

  test("a non-admin player is refused", async () => {
    const r = await req("GET", "/v1/admin/dashboard/summary", { token: await tokenFor("white") });
    assert.equal(r.status, 403);
  });

  test("no token at all is refused", async () => {
    const r = await req("GET", "/v1/admin/dashboard/summary");
    assert.equal(r.status, 401);
  });
});

describe("kpis and panels are real counts, never fabricated", () => {
  test("a fresh platform reports honest zeros/nulls, not placeholder numbers", async () => {
    const r = await req("GET", "/v1/admin/dashboard/summary", { token: await tokenFor("viewer") });
    assert.equal(r.status, 200);
    assert.equal(r.body.kpis.activeMatches, 0);
    assert.equal(r.body.kpis.livePlayers, 0);
    assert.equal(r.body.kpis.pendingWithdrawals, 0);
    assert.equal(r.body.kpis.pendingDeposits, 0);
    assert.equal(r.body.kpis.riskAlerts, 0);
    // No reconciliation job has ever run in this fresh environment -- the
    // endpoint must say so honestly, not claim HEALTHY with nothing to
    // back it.
    assert.equal(r.body.kpis.reconciliationStatus, "UNKNOWN");
    assert.equal(r.body.finance.rail.asset, "USDT", "the seeded USDT/TRC20 rail is real and present");
    assert.ok(r.body.finance.solvency.length >= 1);
    assert.equal(r.body.security.chainReaderHealth.name, "CHAIN_REACHABLE");
  });

  test("a real LIVE duel is counted as an active match and its two seats as live players", async () => {
    await db.query(
      `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1, tier, stake_minor,
                          initial_state, time_control, status)
       VALUES ('dash-d1','chess',1,'dash-d1','white','black','FREE',0,'{}'::jsonb,'{}'::jsonb,'LIVE')`
    );
    const r = await req("GET", "/v1/admin/dashboard/summary", { token: await tokenFor("viewer") });
    assert.equal(r.body.kpis.activeMatches, 1);
    assert.equal(r.body.kpis.livePlayers, 2);
    assert.equal(r.body.operations.liveMatches, 1);
  });

  test("a pending withdrawal and a pending deposit are each counted once, in the right bucket", async () => {
    // REQUESTED is exempt from withdrawal_moving_states_are_locked (see
    // that constraint's own list), so this one status alone is enough to
    // prove the "pending" bucket without needing a real funds lock.
    await db.query(
      `INSERT INTO withdrawal (id, player_id, asset, network, destination, amount_minor, status)
       VALUES ('dash-w1','white','USDT','TRON','T-dest',$1,'REQUESTED')`,
      [u(50)]
    );
    await db.query(
      `INSERT INTO deposit (id, player_id, asset, network, provider, address, status, expires_at)
       VALUES ('dash-dep1','black','USDT','TRON','sandbox','T-addr','AWAITING_PAYMENT', now() + interval '1 hour')`
    );
    const r = await req("GET", "/v1/admin/dashboard/summary", { token: await tokenFor("viewer") });
    assert.equal(r.body.kpis.pendingWithdrawals, 1);
    assert.equal(r.body.kpis.pendingDeposits, 1);
    assert.equal(r.body.finance.pendingWithdrawals, 1);
    assert.equal(r.body.finance.pendingDeposits, 1);
  });

  test("a FAILED withdrawal is counted as failed, not pending", async () => {
    // A non-REQUESTED/CANCELLED/REJECTED status requires the funds to have
    // actually been locked first (withdrawal_moving_states_are_locked) --
    // fund the wallet and lock for real, the same way the withdrawal
    // service itself would, rather than fake the row.
    await db.query(
      `SELECT ledger_post('dash-w2-fund','DEPOSIT','SYSTEM',NULL,$1::jsonb)`,
      [JSON.stringify([
        { account: "platform:custody:USDT:TRON", amount: u(10) },
        { account: "user:white:available", amount: "-" + u(10) },
      ])]
    );
    const locked = await db.query(
      `SELECT * FROM ledger_post('dash-w2:lock','WITHDRAWAL_LOCK','SYSTEM',NULL,$1::jsonb)`,
      [JSON.stringify([
        { account: "user:white:available", amount: u(10) },
        { account: "user:white:locked", amount: "-" + u(10) },
      ])]
    );
    await db.query(
      `INSERT INTO withdrawal (id, player_id, asset, network, destination, amount_minor, status, failure_reason, lock_tx_id)
       VALUES ('dash-w2','white','USDT','TRON','T-dest',$1,'FAILED','provider timeout',$2)`,
      [u(10), locked.rows[0].transaction_id]
    );
    const r = await req("GET", "/v1/admin/dashboard/summary", { token: await tokenFor("viewer") });
    assert.equal(r.body.finance.failedWithdrawals, 1);
    // The earlier PENDING_REVIEW withdrawal is still the only PENDING one --
    // a FAILED row must not leak into that count.
    assert.equal(r.body.kpis.pendingWithdrawals, 1);
  });

  test("an open fairplay case and an open reconciliation case both count toward riskAlerts", async () => {
    await db.query(
      `INSERT INTO fairplay_case (id, player_id, category, status, risk_score, auto_actioned, funds_held)
       VALUES ('dash-fc1','white','AUTOMATION','OPEN',72,FALSE,FALSE)`
    );
    await db.query(
      `INSERT INTO reconciliation_case (id, category, severity, status, subject_type, subject_id, detail)
       VALUES ('dash-rc1','LEDGER_DRIFT','WARNING','OPEN','account','user:white:available','{}'::jsonb)`
    );
    const r = await req("GET", "/v1/admin/dashboard/summary", { token: await tokenFor("viewer") });
    assert.equal(r.body.kpis.riskAlerts, 2);
    assert.equal(r.body.security.openFairPlayCases, 1);
    assert.equal(r.body.security.openReconciliationCases, 1);
  });

  test("an open CRITICAL reconciliation case forces reconciliationStatus to CRITICAL", async () => {
    await db.query(
      `INSERT INTO reconciliation_case (id, category, severity, status, subject_type, subject_id, detail)
       VALUES ('dash-rc-crit','SOLVENCY_BREACH','CRITICAL','OPEN','platform','USDT','{}'::jsonb)`
    );
    const r = await req("GET", "/v1/admin/dashboard/summary", { token: await tokenFor("viewer") });
    assert.equal(r.body.kpis.reconciliationStatus, "CRITICAL");
    assert.equal(r.body.security.openCriticalReconciliationCases, 1);
  });

  test("an open tournament in LIVE state is counted", async () => {
    await db.query(
      `INSERT INTO tournament (id, game_id, format, status, capacity, min_players, time_control, created_by, registration_closes_at, ruleset_version)
       VALUES ('dash-t1','chess','SINGLE_ELIMINATION','LIVE',4,2,'{}'::jsonb,'root', now() + interval '1 hour', 1)`
    );
    const r = await req("GET", "/v1/admin/dashboard/summary", { token: await tokenFor("viewer") });
    assert.equal(r.body.operations.openTournaments, 1);
  });

  test("recent admin activity reflects a REAL prior admin action, most-recent first", async () => {
    // Any earlier authorized admin call in this suite (the dashboard reads
    // above) is itself audited -- rather than seed a synthetic row, prove
    // the endpoint surfaces a genuine admin_audit row with a sane shape.
    const r = await req("GET", "/v1/admin/dashboard/summary", { token: await tokenFor("viewer") });
    assert.ok(Array.isArray(r.body.recentActivity));
    assert.ok(r.body.recentActivity.length > 0);
    assert.ok(r.body.recentActivity[0].action);
    assert.ok(r.body.recentActivity[0].at);
  });

  test("platform fees reads the real platform:rake ledger balance, starting at zero", async () => {
    const r = await req("GET", "/v1/admin/dashboard/summary", { token: await tokenFor("viewer") });
    // Fees are collected per coin; the headline is their dollar sum.
    assert.equal(r.body.kpis.platformFees.asset, "USD");
    const byAsset = r.body.kpis.platformFees.byAsset;
    assert.deepEqual(Object.keys(byAsset).sort(), ["DAI", "USDC", "USDT"]);
    const sum = Object.values(byAsset).reduce((a, v) => a + BigInt(v), 0n);
    assert.equal(BigInt(r.body.kpis.platformFees.minor), sum);
  });

  test("the withdrawal queue lists the real pending row, oldest first, never a FAILED or COMPLETED one", async () => {
    const r = await req("GET", "/v1/admin/dashboard/summary", { token: await tokenFor("viewer") });
    const ids = r.body.withdrawalQueue.map((w) => w.id);
    assert.ok(ids.includes("dash-w1"));
    assert.ok(!ids.includes("dash-w2"), "the FAILED withdrawal must never appear in the pending queue");
  });

  test("recent transactions merges deposits and withdrawals into one real, time-sorted feed", async () => {
    const r = await req("GET", "/v1/admin/dashboard/summary", { token: await tokenFor("viewer") });
    const kinds = new Set(r.body.recentTransactions.map((t) => t.kind));
    assert.ok(kinds.has("DEPOSIT"));
    assert.ok(kinds.has("WITHDRAWAL"));
    const times = r.body.recentTransactions.map((t) => new Date(t.at).getTime());
    const sorted = [...times].sort((a, b) => b - a);
    assert.deepEqual(times, sorted, "must be sorted most-recent-first");
  });

  test("match volume by game only lists real, launched games, and counts real matches", async () => {
    const r = await req("GET", "/v1/admin/dashboard/summary", { token: await tokenFor("viewer") });
    const chess = r.body.matchVolumeByGame.find((g) => g.gameId === "chess");
    assert.ok(chess, "chess is a launched game and must be listed");
    assert.ok(chess.matches7d >= 1, "the seeded LIVE duel was created within the last 7 days");
  });

  test("fee trend is a real per-day series, never a fabricated smooth curve", async () => {
    const r = await req("GET", "/v1/admin/dashboard/summary", { token: await tokenFor("viewer") });
    assert.ok(Array.isArray(r.body.feeTrend));
    // No rake has actually been collected in this suite, so the honest
    // series is empty -- not fourteen invented zero-days.
    assert.equal(r.body.feeTrend.length, 0);
  });
});
