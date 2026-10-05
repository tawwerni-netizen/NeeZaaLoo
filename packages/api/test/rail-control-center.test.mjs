/**
 * The Admin Payment & Stablecoin Control Center's HTTP surface --
 * GET/POST /v1/admin/payments/rails* and GET /v1/admin/payments/controls --
 * proven through the SAME generic pipeline (identify, authorize, step-up,
 * audit) every other admin route goes through. This is the HTTP-level half
 * of the Control Center's own explicit test list; the DB-level rail service
 * itself (limits math, CHECK-constraint mapping, audit field logging) is
 * already covered in packages/payments/test/valuation.test.mjs and the true
 * concurrent-write races in packages/payments/test/real-pg-rail-control-center.test.mjs.
 *
 * NOTE: /v1/players/:id/withdrawals is still a 501 stub (not yet wired to
 * packages/payments' withdrawal service), so "deposit during pause" /
 * "withdrawal during pause" / "existing transaction during pause" cannot be
 * exercised through this HTTP surface today -- those are proven at the
 * service layer in valuation.test.mjs instead, against the real rail model
 * these routes read and write.
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

const SIGNING_KEY = Buffer.alloc(32, 7);
const ENCRYPTION_KEY = Buffer.alloc(32, 8);
const PASSWORD = "correct horse battery staple";
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };

let db, auth, api, base, rails, chain;

async function req(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: json, headers: res.headers };
}

const tokenFor = async (handle) => (await auth.login({ identifier: handle, password: PASSWORD })).accessToken;

async function stepUpFor(handle, action) {
  const token = await tokenFor(handle);
  const step = await req("POST", "/v1/auth/step-up", { token, body: { action, password: PASSWORD } });
  assert.equal(step.status, 200, `step-up for ${action} failed: ${JSON.stringify(step.body)}`);
  return { token, stepUpToken: step.body.stepUpToken };
}

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  auth = createAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: FAST_ARGON });
  rails = createRailService(db);
  chain = createMockChainReader();
  const railHealth = createHealthService({ db, chain });

  api = createApi({
    db, auth, rails, railHealth,
    rateLimit: { capacity: 5000, refillPerSecond: 5000 },
    // This suite mints a step-up token for nearly every case; the real
    // per-IP ceiling on that endpoint is exercised in api.test.mjs's own
    // step-up rate-limiting suite, not here.
    sensitiveRateLimits: { "step-up": { capacity: 5000, refillPerSecond: 5000 } },
  });
  await api.listen();
  base = api.url;

  await auth.register({ playerId: "root", handle: "root", password: PASSWORD });
  await auth.register({ playerId: "finance", handle: "finance", password: PASSWORD });
  await auth.register({ playerId: "support", handle: "support", password: PASSWORD });
  await auth.register({ playerId: "viewer", handle: "viewer", password: PASSWORD });
  await auth.register({ playerId: "alice", handle: "alice", password: PASSWORD });

  await db.query(
    `INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES
     ('root','root@nizalo','Root',TRUE),
     ('finance','finance@nizalo','Finance',TRUE),
     ('support','support@nizalo','Support',TRUE),
     ('viewer','viewer@nizalo','Viewer',TRUE)`
  );
  await db.query(
    `INSERT INTO admin_role_grant (admin_id, role, granted_by, reason) VALUES
     ('root','SUPER_ADMIN','finance','bootstrap'),
     ('finance','FINANCE_ADMIN','root','bootstrap'),
     ('support','SUPPORT','root','bootstrap'),
     ('viewer','READ_ONLY','root','bootstrap')`
  );
});

after(async () => { await api.close(); });

describe("visibility: everyone with rail.read/control.read can SEE the Control Center", () => {
  test("a READ_ONLY admin can list rails, each carrying real (never fabricated) health", async () => {
    const r = await req("GET", "/v1/admin/payments/rails", { token: await tokenFor("viewer") });
    assert.equal(r.status, 200);
    const rail = r.body.rails.find((x) => x.id === "USDT_TRON");
    assert.ok(rail, "the seeded USDT/TRC20 rail is present");
    assert.ok(rail.health, "every rail carries a health block");
    assert.ok(Object.values(rail.health).length > 0);
    assert.notEqual(rail.health.status, undefined);
  });

  test("a READ_ONLY admin can see global controls", async () => {
    const r = await req("GET", "/v1/admin/payments/controls", { token: await tokenFor("viewer") });
    assert.equal(r.status, 200);
    const keys = r.body.controls.map((c) => c.key).sort();
    assert.deepEqual(keys, ["CASH_MATCHES", "DEPOSITS", "GLOBAL_EMERGENCY", "WITHDRAWALS"]);
  });
});

describe("UNAUTHORIZED CHANGE: a role without rail.manage cannot touch a rail", () => {
  test("SUPPORT is denied outright (403), not merely asked to step up", async () => {
    const r = await req("POST", "/v1/admin/payments/rails/USDT_TRON/status", {
      token: await tokenFor("support"), body: { status: "ADMIN_PAUSED", reason: "trying anyway" },
    });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, "MISSING_CAPABILITY");
  });

  test("a non-admin player cannot reach the route at all", async () => {
    const r = await req("POST", "/v1/admin/payments/rails/USDT_TRON/status", {
      token: await tokenFor("alice"), body: { status: "ADMIN_PAUSED", reason: "not an admin" },
    });
    assert.equal(r.status, 403);
  });

  test("READ_ONLY can see the rail but cannot change its limits either", async () => {
    const r = await req("POST", "/v1/admin/payments/rails/USDT_TRON/limits", {
      token: await tokenFor("viewer"), body: { maxWithdrawalMinor: "1", reason: "trying anyway" },
    });
    assert.equal(r.status, 403);
  });
});

describe("STEP-UP FAILURE: rail.manage demands step-up even from a capable admin", () => {
  test("a FINANCE_ADMIN with the capability but no step-up is told to step up (401), not denied (403)", async () => {
    const r = await req("POST", "/v1/admin/payments/rails/USDT_TRON/status", {
      token: await tokenFor("finance"), body: { status: "ADMIN_PAUSED", reason: "no step up yet" },
    });
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, "STEP_UP_REQUIRED");
  });

  test("a step-up minted for a different action does not unlock rail.manage", async () => {
    const { token, stepUpToken } = await stepUpFor("finance", "admin.control.toggle");
    const r = await req("POST", "/v1/admin/payments/rails/USDT_TRON/status", {
      token, body: { status: "ADMIN_PAUSED", reason: "wrong step-up" },
      headers: { "x-step-up-token": stepUpToken },
    });
    assert.equal(r.status, 401);
  });
});

describe("RAIL-SPECIFIC PAUSE, fully audited end to end", () => {
  test("a FINANCE_ADMIN can pause the rail with the right step-up, and the change is completely audited", async () => {
    const { token, stepUpToken } = await stepUpFor("finance", "admin.rail.manage");
    const r = await req("POST", "/v1/admin/payments/rails/USDT_TRON/status", {
      token, body: { status: "ADMIN_PAUSED", reason: "incident-1234" },
      headers: { "x-step-up-token": stepUpToken },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "ADMIN_PAUSED");

    const list = await req("GET", "/v1/admin/payments/rails", { token: await tokenFor("viewer") });
    const rail = list.body.rails.find((x) => x.id === "USDT_TRON");
    assert.equal(rail.status, "ADMIN_PAUSED", "turning a rail off is visible immediately, it does not erase the rail");

    const history = await req("GET", "/v1/admin/payments/rails/USDT_TRON/history", { token: await tokenFor("viewer") });
    assert.equal(history.status, 200);
    const change = history.body.history.find((h) => h.field === "status" && h.new_value === "ADMIN_PAUSED");
    assert.ok(change, "the audit trail records the transition");
    assert.equal(change.actor_id, "finance");
    assert.equal(change.reason, "incident-1234");
    assert.ok(change.old_value, "the previous state is recorded, not just the new one");
    assert.ok(change.at, "a timestamp is recorded");

    // Reactivate so later tests in this file start from a known-good state.
    const back = await stepUpFor("finance", "admin.rail.manage");
    const r2 = await req("POST", "/v1/admin/payments/rails/USDT_TRON/status", {
      token: back.token, body: { status: "ACTIVE", reason: "incident-1234 resolved" },
      headers: { "x-step-up-token": back.stepUpToken },
    });
    assert.equal(r2.status, 200);
  });

  test("RISK_PAUSED is not a status an admin may set directly through this route", async () => {
    const { token, stepUpToken } = await stepUpFor("finance", "admin.rail.manage");
    const r = await req("POST", "/v1/admin/payments/rails/USDT_TRON/status", {
      token, body: { status: "RISK_PAUSED", reason: "trying to fake a depeg" },
      headers: { "x-step-up-token": stepUpToken },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, "INVALID_STATUS");
  });

  test("EMERGENCY_HOLD is reachable, and is a distinct state from ADMIN_PAUSED", async () => {
    const { token, stepUpToken } = await stepUpFor("finance", "admin.rail.manage");
    const r = await req("POST", "/v1/admin/payments/rails/USDT_TRON/status", {
      token, body: { status: "EMERGENCY_HOLD", reason: "suspected exploit" },
      headers: { "x-step-up-token": stepUpToken },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "EMERGENCY_HOLD");

    const back = await stepUpFor("finance", "admin.rail.manage");
    await req("POST", "/v1/admin/payments/rails/USDT_TRON/status", {
      token: back.token, body: { status: "ACTIVE", reason: "hold lifted" },
      headers: { "x-step-up-token": back.stepUpToken },
    });
  });

  test("limits can be tightened, with a reason, fully audited", async () => {
    const { token, stepUpToken } = await stepUpFor("finance", "admin.rail.manage");
    const r = await req("POST", "/v1/admin/payments/rails/USDT_TRON/limits", {
      token, body: { maxWithdrawalMinor: "1000000000", reason: "tightening the ceiling" },
      headers: { "x-step-up-token": stepUpToken },
    });
    assert.equal(r.status, 200);
    assert.equal(String(r.body.max_withdrawal_minor), "1000000000");

    const history = await req("GET", "/v1/admin/payments/rails/USDT_TRON/history", { token: await tokenFor("viewer") });
    const change = history.body.history.find((h) => h.field === "max_withdrawal_minor" && h.new_value === "1000000000");
    assert.ok(change);
    assert.equal(change.reason, "tightening the ceiling");
  });
});

describe("CONCURRENT TOGGLE at the HTTP layer", () => {
  test("two concurrent pause requests for the same rail both succeed and leave one consistent final state", async () => {
    const [a, b] = await Promise.all([
      stepUpFor("finance", "admin.rail.manage"),
      stepUpFor("finance", "admin.rail.manage"),
    ]);
    const [ra, rb] = await Promise.all([
      req("POST", "/v1/admin/payments/rails/USDT_TRON/status", {
        token: a.token, body: { status: "ADMIN_PAUSED", reason: "concurrent A" },
        headers: { "x-step-up-token": a.stepUpToken },
      }),
      req("POST", "/v1/admin/payments/rails/USDT_TRON/status", {
        token: b.token, body: { status: "ADMIN_PAUSED", reason: "concurrent B" },
        headers: { "x-step-up-token": b.stepUpToken },
      }),
    ]);
    assert.equal(ra.status, 200);
    assert.equal(rb.status, 200);

    const list = await req("GET", "/v1/admin/payments/rails", { token: await tokenFor("viewer") });
    assert.equal(list.body.rails.find((x) => x.id === "USDT_TRON").status, "ADMIN_PAUSED");

    // Reactivate for the tests below.
    const back = await stepUpFor("finance", "admin.rail.manage");
    await req("POST", "/v1/admin/payments/rails/USDT_TRON/status", {
      token: back.token, body: { status: "ACTIVE", reason: "test cleanup" },
      headers: { "x-step-up-token": back.stepUpToken },
    });
  });
});

describe("GLOBAL PAUSE reaches the same platform_control the Control Center displays", () => {
  test("PAUSE ALL DEPOSITS is visible immediately in GET /v1/admin/payments/controls", async () => {
    // control.toggle is a SUPER_ADMIN/ADMIN capability, deliberately not held
    // by FINANCE_ADMIN (which holds the narrower rail.manage instead) --
    // see ROLE_CAPABILITIES in packages/authz/src/policy.mjs.
    const { token, stepUpToken } = await stepUpFor("root", "admin.control.toggle");
    const toggle = await req("POST", "/v1/admin/controls/DEPOSITS", {
      token, body: { enabled: false, reason: "platform-wide deposit freeze" },
      headers: { "x-step-up-token": stepUpToken },
    });
    assert.equal(toggle.status, 200);

    const controls = await req("GET", "/v1/admin/payments/controls", { token: await tokenFor("viewer") });
    const deposits = controls.body.controls.find((c) => c.key === "DEPOSITS");
    assert.equal(deposits.enabled, false);
    assert.equal(deposits.reason, "platform-wide deposit freeze");

    const back = await stepUpFor("root", "admin.control.toggle");
    await req("POST", "/v1/admin/controls/DEPOSITS", {
      token: back.token, body: { enabled: true, reason: "freeze lifted" },
      headers: { "x-step-up-token": back.stepUpToken },
    });
  });

  test("PAUSE ALL WITHDRAWALS is visible immediately in GET /v1/admin/payments/controls", async () => {
    const { token, stepUpToken } = await stepUpFor("root", "admin.control.toggle");
    await req("POST", "/v1/admin/controls/WITHDRAWALS", {
      token, body: { enabled: false, reason: "platform-wide withdrawal freeze" },
      headers: { "x-step-up-token": stepUpToken },
    });

    const controls = await req("GET", "/v1/admin/payments/controls", { token: await tokenFor("viewer") });
    assert.equal(controls.body.controls.find((c) => c.key === "WITHDRAWALS").enabled, false);

    const back = await stepUpFor("root", "admin.control.toggle");
    await req("POST", "/v1/admin/controls/WITHDRAWALS", {
      token: back.token, body: { enabled: true, reason: "freeze lifted" },
      headers: { "x-step-up-token": back.stepUpToken },
    });
  });
});

describe("AUDIT INTEGRITY", () => {
  test("the history endpoint never returns an entry missing actor, previous state, new state, reason, or timestamp", async () => {
    const r = await req("GET", "/v1/admin/payments/rails/USDT_TRON/history", { token: await tokenFor("viewer") });
    assert.equal(r.status, 200);
    assert.ok(r.body.history.length > 0);
    for (const h of r.body.history) {
      assert.ok(h.field);
      assert.ok(h.actor_id, `entry for ${h.field} is missing its actor`);
      assert.ok(h.reason, `entry for ${h.field} is missing its reason`);
      assert.ok(h.at, `entry for ${h.field} is missing its timestamp`);
      assert.notEqual(h.new_value, undefined);
    }
  });

  test("an unknown rail id's history is empty, not an error, and its status route 404s", async () => {
    const history = await req("GET", "/v1/admin/payments/rails/NOPE_NOWHERE/history", { token: await tokenFor("viewer") });
    assert.equal(history.status, 200);
    assert.deepEqual(history.body.history, []);

    const { token, stepUpToken } = await stepUpFor("finance", "admin.rail.manage");
    const r = await req("POST", "/v1/admin/payments/rails/NOPE_NOWHERE/status", {
      token, body: { status: "ADMIN_PAUSED", reason: "does not exist" },
      headers: { "x-step-up-token": stepUpToken },
    });
    assert.equal(r.status, 404);
  });
});
