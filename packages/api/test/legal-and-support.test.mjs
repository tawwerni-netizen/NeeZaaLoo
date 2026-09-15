/**
 * Legal Policies, Consent Status, and Platform Support Config API Tests.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createConsentService } from "../../compliance/src/consent.mjs";
import { createApi } from "../src/server.mjs";

const SIGNING_KEY = "01234567890123456789012345678901";
const ENCRYPTION_KEY = Buffer.alloc(32, 7);
const PASSWORD = "CorrectHorseBattery99!";

describe("Legal Policies and Support Config API", () => {
  let db, auth, consent, api, base, playerToken, adminToken;

  before(async () => {
    db = await PGlite.create();
    await migrate(db);
    auth = createAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY });
    consent = createConsentService(db);

    api = createApi({
      db,
      auth,
      consent,
      rateLimit: { capacity: 1000, refillPerSecond: 1000 },
    });
    await api.listen();
    base = api.url;

    // Register a player
    await auth.register({ playerId: "player1", handle: "player1", password: PASSWORD, termsAccepted: true });
    const loginRes = await auth.login({ identifier: "player1", password: PASSWORD });
    playerToken = loginRes.accessToken;

    // Register an admin
    await auth.register({ playerId: "root", handle: "root", password: PASSWORD, termsAccepted: true });
    await auth.register({ playerId: "admin1", handle: "admin1", password: PASSWORD, termsAccepted: true });
    await db.query(`INSERT INTO admin_user (id, email, display_name, mfa_enrolled) VALUES ('root', 'root@n', 'Root', TRUE), ('admin1', 'a1@n', 'Admin 1', TRUE)`);
    await db.query(`INSERT INTO admin_role_grant (admin_id, role, granted_by, reason) VALUES ('admin1', 'SUPER_ADMIN', 'root', 'initial grant')`);
    const adminLoginRes = await auth.login({ identifier: "admin1", password: PASSWORD });
    adminToken = adminLoginRes.accessToken;
  });

  after(async () => {
    await api.close();
  });

  async function req(method, path, { token, body } = {}) {
    const headers = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json };
  }

  test("GET /v1/legal/policies returns all 9 legal policies", async () => {
    const res = await req("GET", "/v1/legal/policies");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.policies));
    assert.equal(res.body.policies.length >= 9, true);
    assert.ok(res.body.policies.some((p) => p.identifier === "terms_of_service"));
  });

  test("GET /v1/support/config returns default support contacts", async () => {
    const res = await req("GET", "/v1/support/config");
    assert.equal(res.status, 200);
    assert.equal(res.body.phone, "+2 01069999557");
    assert.equal(res.body.email, "support@Nizalo.com");
  });

  test("POST /v1/auth/register with termsAccepted: false is refused", async () => {
    const res = await req("POST", "/v1/auth/register", {
      body: {
        handle: "unconsented",
        password: PASSWORD,
        termsAccepted: false,
      },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error?.code, "TERMS_ACCEPTANCE_REQUIRED");
  });

  test("GET /v1/me/consent/status checks pending policies", async () => {
    const res = await req("GET", "/v1/me/consent/status", { token: playerToken });
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.allAccepted, "boolean");
  });

  test("POST /v1/me/consent/accept records policy acceptance", async () => {
    const res = await req("POST", "/v1/me/consent/accept", {
      token: playerToken,
      body: {
        policyIdentifier: "privacy_policy",
        policyVersion: "1.0.0",
        locale: "en",
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.policyIdentifier, "privacy_policy");
  });

  test("POST /v1/admin/support/config updates support contact info", async () => {
    const stepUp = await auth.stepUp({ playerId: "admin1", action: "admin.support.config.update", password: PASSWORD });
    assert.equal(stepUp.ok, true);

    const headers = { "content-type": "application/json", authorization: `Bearer ${adminToken}`, "x-step-up-token": stepUp.stepUpToken };
    const res = await fetch(`${base}/v1/admin/support/config`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        phone: "+1 800 555 0199",
        email: "support@nizalo.com",
      }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.email, "support@nizalo.com");

    const getRes = await req("GET", "/v1/support/config");
    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.email, "support@nizalo.com");
  });
});
