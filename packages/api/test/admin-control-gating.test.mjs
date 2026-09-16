/**
 * Regression coverage for a route/policy audit pass: four admin mutation
 * routes (games toggle x3, risk/resolve) were gated by a READ-only action
 * (admin.control.read / admin.risk.read) instead of the write action that
 * already existed in policy.mjs (admin.control.toggle / admin.risk.decide).
 * Practical impact: RISK_ADMIN, FINANCE_ADMIN, ANALYST and READ_ONLY all
 * hold control.read but NOT control.toggle -- under the bug, any of those
 * roles could flip cash-mode or live-status on any game platform-wide, a
 * capability the role matrix deliberately withholds from them.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createApi } from "../src/server.mjs";

const SIGNING_KEY = Buffer.alloc(32, 55);
const ENCRYPTION_KEY = Buffer.alloc(32, 66);
const PASSWORD = "correct horse battery staple";
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };

let db, auth, api, base, gameId;

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
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
}

const tokenFor = async (handle) => (await auth.login({ identifier: handle, password: PASSWORD })).accessToken;

async function stepUp(token, action) {
  const s = await req("POST", "/v1/auth/step-up", { token, body: { action, password: PASSWORD } });
  assert.equal(s.status, 200, `step-up failed: ${JSON.stringify(s.body)}`);
  return s.body.stepUpToken;
}

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  auth = createAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: FAST_ARGON });
  api = createApi({ db, auth, rateLimit: { capacity: 5000, refillPerSecond: 5000 } });
  await api.listen();
  base = api.url;

  for (const p of ["rootAdmin", "riskAdmin"]) {
    await auth.register({ playerId: p, handle: p, password: PASSWORD });
  }
  await db.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('bootstrap','b@n.test','B',TRUE),('rootAdmin','root@n.test','Root',TRUE),('riskAdmin','risk@n.test','Risk',TRUE)");
  await db.query("INSERT INTO admin_role_grant (admin_id,role,granted_by,reason) VALUES ('rootAdmin','SUPER_ADMIN','bootstrap','init')");
  await db.query("INSERT INTO admin_role_grant (admin_id,role,granted_by,reason) VALUES ('riskAdmin','RISK_ADMIN','bootstrap','init')");

  const g = await db.query("SELECT id FROM game LIMIT 1");
  gameId = g.rows[0].id;

  await db.query(
    `INSERT INTO reconciliation_case (id, category, severity, status, subject_type, subject_id)
     VALUES ('case1', 'LEDGER_DRIFT', 'WARNING', 'OPEN', 'ledger_account', 'platform:custody:USDT:TRON')`
  );
});

after(async () => { await api.close(); });

describe("Admin control-toggle and risk-decide gating (route/policy audit fix)", () => {
  test("a RISK_ADMIN (control.read only, no control.toggle) cannot toggle a game's cash/tournament/live status", async () => {
    const riskToken = await tokenFor("riskAdmin");

    for (const suffix of ["toggle-tournaments", "toggle-cash", "toggle-status"]) {
      const r = await req("POST", `/v1/admin/games/${gameId}/${suffix}`, { token: riskToken });
      assert.equal(r.status, 403, `${suffix} should be forbidden for RISK_ADMIN, got ${r.status}: ${JSON.stringify(r.body)}`);
    }
  });

  test("a SUPER_ADMIN with step-up CAN toggle a game's cash mode", async () => {
    const rootToken = await tokenFor("rootAdmin");
    const step = await stepUp(rootToken, "admin.game.manage");
    const before = await db.query("SELECT cash_enabled FROM game WHERE id = $1", [gameId]);

    const r = await req("POST", `/v1/admin/games/${gameId}/toggle-cash`, {
      token: rootToken,
      headers: { "x-step-up-token": step },
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.game.cash_enabled, !before.rows[0].cash_enabled);
  });

  test("a RISK_ADMIN (risk.read AND risk.decide) can resolve a reconciliation case with step-up", async () => {
    const riskToken = await tokenFor("riskAdmin");
    const step = await stepUp(riskToken, "admin.risk.decide");
    const r = await req("POST", "/v1/admin/risk/resolve", {
      token: riskToken,
      headers: { "x-step-up-token": step },
      body: { id: "case1", type: "reconciliation_case" },
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.status, "RESOLVED");
  });

  test("resolving a reconciliation case without step-up is rejected", async () => {
    const riskToken = await tokenFor("riskAdmin");
    const r = await req("POST", "/v1/admin/risk/resolve", {
      token: riskToken,
      body: { id: "case1", type: "reconciliation_case" },
    });
    assert.equal(r.status, 401);
  });

  test("a fair-play case ('risk_alert' in the Risk Radar's shape) cannot be waved resolved from this endpoint -- it must go through the audited Tribunal decide flow", async () => {
    const rootToken = await tokenFor("rootAdmin");
    await db.query(
      `INSERT INTO fairplay_case (id, player_id, category, status, risk_score)
       VALUES ('fpcase1', 'rootAdmin', 'ENGINE_ASSISTANCE', 'OPEN', 75)`
    );
    const step = await stepUp(rootToken, "admin.risk.decide");
    const r = await req("POST", "/v1/admin/risk/resolve", {
      token: rootToken,
      headers: { "x-step-up-token": step },
      body: { id: "fpcase1", type: "risk_alert" },
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, "USE_FAIRPLAY_TRIBUNAL");

    // The case is untouched -- still OPEN, not silently no-op'd into a fake RESOLVED.
    const c = await db.query("SELECT status FROM fairplay_case WHERE id='fpcase1'");
    assert.equal(c.rows[0].status, "OPEN");
  });

  test("GET /v1/admin/risk surfaces real open fair-play cases, reconciliation cases, and security events -- not silently-empty phantom queries", async () => {
    const rootToken = await tokenFor("rootAdmin");
    const r = await req("GET", "/v1/admin/risk", { token: rootToken });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.alerts.some((a) => a.id === "fpcase1"), "open fairplay_case should be listed under alerts");
    assert.ok(r.body.reconciliationCases.length >= 1, "the reconciliation case seeded in before() should be listed");
  });
});
