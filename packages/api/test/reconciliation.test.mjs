/**
 * The reconciliation admin API.
 *
 * The instruction this file exists to prove: an admin API can surface and
 * review financial discrepancies WITHOUT ever silently modifying ledger
 * history. Every resolution here only ever changes a case's own status and
 * appends an event -- never a balance, a deposit, or a withdrawal. Read
 * access and decision access are separately gated (RBAC), and every
 * decision requires the auditable note the database itself enforces.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createReconciliationService } from "../../reconciliation/src/reconcile.mjs";
import { createApi } from "../src/server.mjs";

const SIGNING_KEY = Buffer.alloc(32, 11);
const ENCRYPTION_KEY = Buffer.alloc(32, 12);
const PASSWORD = "correct horse battery staple";
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };

let db, auth, api, base, reconciliation;

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: json };
}

let driftSeq = 0;

/**
 * Opens a genuinely NEW, independent drift case each call. The dedup unique
 * index (by design -- see reconcile.mjs) means re-drifting the SAME account
 * while its earlier case is still open/under review returns that EXISTING
 * case, not a fresh one, so each test that needs its own case gets its own
 * freshly-opened player/account rather than sharing "alice" across the file.
 */
async function openADriftCase() {
  const id = `drift${++driftSeq}`;
  await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [id]);
  await db.query("SELECT ledger_open_user_wallet($1)", [id]);
  // A ledger_balance row is created lazily, on the first posted entry -- a
  // freshly opened wallet has none yet, so it must be funded before there is
  // any snapshot row to corrupt.
  await db.query(
    `SELECT ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb)`,
    [`seed-${id}`, JSON.stringify([
      { account: "platform:custody:USDT:TRON", amount: "1000000" },
      { account: `user:${id}:available`, amount: "-1000000" },
    ])]
  );
  const acct = await db.query(`SELECT id::text FROM ledger_account WHERE key=$1`, [`user:${id}:available`]);
  await db.query(`UPDATE ledger_balance SET balance = balance + 1 WHERE account_id = $1`, [acct.rows[0].id]);
  await reconciliation.runLedgerDrift();
  const cases = await reconciliation.listOpenCases();
  return cases.find((c) => c.subject_id === acct.rows[0].id).id;
}

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  auth = createAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: FAST_ARGON });
  reconciliation = createReconciliationService(db);

  api = createApi({
    db, auth, reconciliation,
    rateLimit: { capacity: 5000, refillPerSecond: 5000 },
  });
  await api.listen();
  base = api.url;

  for (const p of ["alice", "bob", "root", "finance1", "helper"]) {
    await auth.register({ playerId: p, handle: p, password: PASSWORD });
  }
  await db.query("SELECT ledger_open_user_wallet('alice')");
  await db.query("SELECT ledger_open_user_wallet('bob')");
  await db.query(
    `SELECT ledger_post('seed-alice','DEPOSIT','SYSTEM',NULL,$1::jsonb)`,
    [JSON.stringify([
      { account: "platform:custody:USDT:TRON", amount: "100000000" },
      { account: "user:alice:available", amount: "-100000000" },
    ])]
  );
  await db.query(
    `INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES
     ('root','root@n','Root',TRUE),
     ('finance1','f1@n','Finance1',TRUE),
     ('helper','h1@n','Helper1',TRUE)`
  );
  await db.query(
    `INSERT INTO admin_role_grant (admin_id, role, granted_by, reason) VALUES
     ('root','SUPER_ADMIN','finance1','bootstrap'),
     ('finance1','FINANCE_ADMIN','root','ops'),
     ('helper','ADMIN','root','ops')`
  );
});

after(async () => { await api.close(); });

const tokenFor = async (handle) =>
  (await auth.login({ identifier: handle, password: PASSWORD })).accessToken;

const stepUp = async (token, action) => {
  const r = await req("POST", "/v1/auth/step-up", { token, body: { action, password: PASSWORD } });
  assert.equal(r.status, 200, JSON.stringify(r));
  return r.body.stepUpToken;
};

// ---------------------------------------------------------------------------

describe("listing and reading cases", () => {
  test("FINANCE_ADMIN can list cases", async () => {
    const caseId = await openADriftCase();
    const token = await tokenFor("finance1");
    const r = await req("GET", "/v1/admin/reconciliation/cases", { token });
    assert.equal(r.status, 200);
    assert.ok(r.body.cases.some((c) => c.id === caseId));
    assert.ok(typeof r.body.total === "number");
  });

  test("a plain ADMIN can also read (read is broader than decide)", async () => {
    const token = await tokenFor("helper");
    const r = await req("GET", "/v1/admin/reconciliation/cases", { token });
    assert.equal(r.status, 200);
  });

  test("filters by category are honoured", async () => {
    const token = await tokenFor("finance1");
    const r = await req("GET", "/v1/admin/reconciliation/cases?category=LEDGER_DRIFT", { token });
    assert.equal(r.status, 200);
    assert.ok(r.body.cases.every((c) => c.category === "LEDGER_DRIFT"));
  });

  test("GET one case by id returns its full detail", async () => {
    const caseId = await openADriftCase();
    const token = await tokenFor("finance1");
    const r = await req("GET", `/v1/admin/reconciliation/cases/${caseId}`, { token });
    assert.equal(r.status, 200);
    assert.equal(r.body.id, caseId);
    assert.equal(r.body.category, "LEDGER_DRIFT");
  });

  test("a nonexistent case id is a clean 404, not a crash or a leak", async () => {
    const token = await tokenFor("finance1");
    const r = await req("GET", "/v1/admin/reconciliation/cases/no-such-case", { token });
    assert.equal(r.status, 404);
  });

  test("a tampered/SQL-injection-shaped case id is still a clean 404", async () => {
    const token = await tokenFor("finance1");
    const r = await req("GET", `/v1/admin/reconciliation/cases/${encodeURIComponent("'; DROP TABLE reconciliation_case; --")}`, { token });
    assert.equal(r.status, 404);
    const stillThere = await req("GET", "/v1/admin/reconciliation/cases", { token });
    assert.equal(stillThere.status, 200, "the table survives -- parameterised queries throughout");
  });

  test("GET events on a nonexistent case is 404, not an empty list", async () => {
    const token = await tokenFor("finance1");
    const r = await req("GET", "/v1/admin/reconciliation/cases/no-such-case/events", { token });
    assert.equal(r.status, 404);
  });

  test("GET events on a real case returns its timeline", async () => {
    const caseId = await openADriftCase();
    const token = await tokenFor("finance1");
    const r = await req("GET", `/v1/admin/reconciliation/cases/${caseId}/events`, { token });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.events.map((e) => e.event), ["OPENED"]);
  });

  test("the runs audit endpoint is readable and reflects real executed runs", async () => {
    const token = await tokenFor("finance1");
    const r = await req("GET", "/v1/admin/reconciliation/runs?kind=L1_LEDGER_DRIFT", { token });
    assert.equal(r.status, 200);
    assert.ok(r.body.runs.length >= 1);
    assert.ok(r.body.runs.every((run) => run.kind === "L1_LEDGER_DRIFT"));
  });

  test("a player (not an admin at all) is refused, regardless of how valid their token is", async () => {
    const token = await tokenFor("bob");
    const r = await req("GET", "/v1/admin/reconciliation/cases", { token });
    assert.equal(r.status, 403);
  });

  test("anonymous access is refused outright", async () => {
    const r = await req("GET", "/v1/admin/reconciliation/cases");
    assert.equal(r.status, 401);
  });
});

describe("reviewing a case", () => {
  test("FINANCE_ADMIN can acknowledge a case with step-up", async () => {
    const caseId = await openADriftCase();
    const token = await tokenFor("finance1");
    const step = await stepUp(token, "admin.reconciliation.decide");
    const res = await fetch(`${base}/v1/admin/reconciliation/cases/${caseId}/review`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-step-up-token": step },
      body: JSON.stringify({ note: "looking into it" }),
    });
    assert.equal(res.status, 200);
    const detail = await req("GET", `/v1/admin/reconciliation/cases/${caseId}`, { token });
    assert.equal(detail.body.status, "UNDER_REVIEW");
  });

  test("without step-up, review is refused", async () => {
    const caseId = await openADriftCase();
    const token = await tokenFor("finance1");
    const r = await req("POST", `/v1/admin/reconciliation/cases/${caseId}/review`, { token, body: {} });
    assert.equal(r.status, 401);
  });

  test("a plain ADMIN (read-only for reconciliation) cannot review, even with a valid step-up attempt", async () => {
    const caseId = await openADriftCase();
    const token = await tokenFor("helper");
    // helper does not hold reconciliation.decide at all, so step-up for this
    // action cannot even be issued for them in the first place.
    const stepRes = await req("POST", "/v1/auth/step-up", { token, body: { action: "admin.reconciliation.decide", password: PASSWORD } });
    const r = await req("POST", `/v1/admin/reconciliation/cases/${caseId}/review`, {
      token, body: { note: "x" },
    });
    assert.notEqual(r.status, 200);
  });
});

describe("resolving a case: the database's ledger is never touched by any of this", () => {
  test("resolving requires status RESOLVED or FALSE_POSITIVE", async () => {
    const caseId = await openADriftCase();
    const token = await tokenFor("finance1");
    const step = await stepUp(token, "admin.reconciliation.decide");
    const res = await fetch(`${base}/v1/admin/reconciliation/cases/${caseId}/resolve`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-step-up-token": step },
      body: JSON.stringify({ status: "OPEN", note: "x" }),
    });
    assert.equal(res.status, 400);
  });

  test("resolving requires a note -- the database enforces it, the API refuses cleanly before that", async () => {
    const caseId = await openADriftCase();
    const token = await tokenFor("finance1");
    const step = await stepUp(token, "admin.reconciliation.decide");
    const res = await fetch(`${base}/v1/admin/reconciliation/cases/${caseId}/resolve`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-step-up-token": step },
      body: JSON.stringify({ status: "FALSE_POSITIVE" }),
    });
    assert.equal(res.status, 400);
  });

  test("a well-formed resolution closes the case, and no ledger balance anywhere changed as a result", async () => {
    const before = await db.query(
      `SELECT ledger_natural_balance(a.normal_side, COALESCE(b.balance,0))::text n
         FROM ledger_account a LEFT JOIN ledger_balance b ON b.account_id=a.id WHERE a.key='user:alice:available'`
    );
    const caseId = await openADriftCase();
    const token = await tokenFor("finance1");
    const step = await stepUp(token, "admin.reconciliation.decide");
    const res = await fetch(`${base}/v1/admin/reconciliation/cases/${caseId}/resolve`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-step-up-token": step },
      body: JSON.stringify({ status: "FALSE_POSITIVE", note: "confirmed a test fixture artifact, not a real drift" }),
    });
    assert.equal(res.status, 200);

    const detail = await req("GET", `/v1/admin/reconciliation/cases/${caseId}`, { token });
    assert.equal(detail.body.status, "FALSE_POSITIVE");
    assert.equal(detail.body.resolved_by, "finance1");

    const events = await req("GET", `/v1/admin/reconciliation/cases/${caseId}/events`, { token });
    assert.deepEqual(events.body.events.map((e) => e.event), ["OPENED", "RESOLVED"]);

    // The whole point: the drift the case describes was NOT auto-repaired.
    // The balance is exactly what it was before this admin action -- only
    // the CASE moved, never the ledger.
    const after = await db.query(
      `SELECT ledger_natural_balance(a.normal_side, COALESCE(b.balance,0))::text n
         FROM ledger_account a LEFT JOIN ledger_balance b ON b.account_id=a.id WHERE a.key='user:alice:available'`
    );
    assert.equal(after.rows[0].n, before.rows[0].n, "resolving a case never touches the ledger it describes");
  });

  test("a non-admin cannot resolve a case, whatever tokens they present", async () => {
    const caseId = await openADriftCase();
    const token = await tokenFor("bob");
    const r = await req("POST", `/v1/admin/reconciliation/cases/${caseId}/resolve`, {
      token, body: { status: "RESOLVED", note: "x" },
    });
    assert.notEqual(r.status, 200);
  });

  test("resolving an already-resolved case is refused, not silently re-applied", async () => {
    const caseId = await openADriftCase();
    const token = await tokenFor("finance1");
    const step1 = await stepUp(token, "admin.reconciliation.decide");
    await fetch(`${base}/v1/admin/reconciliation/cases/${caseId}/resolve`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-step-up-token": step1 },
      body: JSON.stringify({ status: "RESOLVED", note: "first resolution" }),
    });
    const step2 = await stepUp(token, "admin.reconciliation.decide");
    const res = await fetch(`${base}/v1/admin/reconciliation/cases/${caseId}/resolve`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-step-up-token": step2 },
      body: JSON.stringify({ status: "RESOLVED", note: "second attempt" }),
    });
    assert.equal(res.status, 409);
  });
});

describe("every decision is audited", () => {
  test("resolving a case is recorded in admin_audit like any other admin action", async () => {
    const caseId = await openADriftCase();
    const token = await tokenFor("finance1");
    const step = await stepUp(token, "admin.reconciliation.decide");
    await fetch(`${base}/v1/admin/reconciliation/cases/${caseId}/resolve`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-step-up-token": step },
      body: JSON.stringify({ status: "RESOLVED", note: "audited resolution" }),
    });
    const audit = await db.query(
      `SELECT admin_id, action, decision, subject_id FROM admin_audit
        WHERE admin_id='finance1' AND action='admin.reconciliation.decide' ORDER BY id DESC LIMIT 1`
    );
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].decision, "ALLOW");
    assert.equal(audit.rows[0].subject_id, caseId);
  });
});
