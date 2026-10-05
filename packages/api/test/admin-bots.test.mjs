import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createApi } from "../src/server.mjs";

const SIGNING_KEY = Buffer.alloc(32, 21);
const ENCRYPTION_KEY = Buffer.alloc(32, 22);
const PASSWORD = "correct horse battery staple";
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };

let db, auth, api, base;

async function req(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers["content-type"] = "application/json";
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
}

const tokenFor = async (handle) => (await auth.login({ identifier: handle, password: PASSWORD })).accessToken;

before(async () => {
  db = await PGlite.create();
  await migrate(db);

  auth = createAuthService(db, {
    signingKey: SIGNING_KEY,
    encryptionKey: ENCRYPTION_KEY,
    argon: FAST_ARGON,
  });

  api = createApi({
    db,
    auth,
    rateLimiting: false,
    controls: {
      DEPOSITS: true,
      WITHDRAWALS: true,
      MATCHMAKING: true,
      CASH_MATCHES: true,
      TOURNAMENTS: true,
      GLOBAL_EMERGENCY: false,
    },
  });
  await api.listen();
  base = api.url;

  // Seed admins
  await auth.register({ playerId: "root", handle: "root", password: PASSWORD });
  await auth.register({ playerId: "viewer", handle: "viewer", password: PASSWORD });
  await db.query(
    `INSERT INTO admin_user (id, email, display_name, mfa_enrolled)
     VALUES ('root', 'root@nizalo.test', 'Root Admin', TRUE),
            ('viewer', 'viewer@nizalo.test', 'Viewer Admin', TRUE)`
  );
  await db.query(
    `INSERT INTO admin_role_grant (admin_id, role, granted_by, reason)
     VALUES ('root', 'SUPER_ADMIN', 'viewer', 'Bootstrap')`
  );

  // Seed standard player
  await auth.register({ playerId: "regular_joe", handle: "regular_joe", password: PASSWORD });
});

after(async () => {
  await api.close();
  await db.close();
});

describe("Admin Bot Control API", () => {
  test("regular player cannot access bot endpoints", async () => {
    const playerToken = await tokenFor("regular_joe");
    const getRes = await req("GET", "/v1/admin/bots/overview", { token: playerToken });
    assert.equal(getRes.status, 403);

    const postRes = await req("POST", "/v1/admin/bots/config", {
      token: playerToken,
      body: { key: "ai_difficulty", value: { mode: "INVINCIBLE" } },
    });
    assert.equal(postRes.status, 403);
  });

  test("super admin can get bot overview with stats and config", async () => {
    const adminToken = await tokenFor("root");
    const res = await req("GET", "/v1/admin/bots/overview", { token: adminToken });
    assert.equal(res.status, 200);
    assert.ok(res.body.config);
    assert.ok(res.body.stats);
    assert.equal(typeof res.body.stats.total_bots, "number");
    assert.equal(typeof res.body.stats.standing_by_count, "number");
    assert.ok(Array.isArray(res.body.bots));
  });

  test("super admin can update bot configuration", async () => {
    const adminToken = await tokenFor("root");
    const updateRes = await req("POST", "/v1/admin/bots/config", {
      token: adminToken,
      body: {
        key: "ai_difficulty",
        value: { mode: "INVINCIBLE", blunder_chance: 0, think_ms: 1000 },
      },
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.ok, true);
    assert.equal(updateRes.body.config.key, "ai_difficulty");
    assert.equal(updateRes.body.config.value.mode, "INVINCIBLE");
  });

  test("updating bot config rejects invalid key", async () => {
    const adminToken = await tokenFor("root");
    const badRes = await req("POST", "/v1/admin/bots/config", {
      token: adminToken,
      body: { key: "non_existent_key", value: {} },
    });
    assert.equal(badRes.status, 400);
  });

  test("super admin can top up bot balance", async () => {
    const adminToken = await tokenFor("root");
    await db.query("INSERT INTO player (id, handle, is_ai) VALUES ('bot_ar_001', 'bot_ar_001', TRUE) ON CONFLICT (id) DO NOTHING");
    await db.query("SELECT ledger_open_user_wallet('bot_ar_001', 'USDT')");

    const topupRes = await req("POST", "/v1/admin/bots/topup", {
      token: adminToken,
      body: { botId: "bot_ar_001", amountUsdt: 100 },
    });
    assert.equal(topupRes.status, 200);
    assert.equal(topupRes.body.ok, true);
    assert.equal(topupRes.body.toppedUpCount, 1);
  });
});
