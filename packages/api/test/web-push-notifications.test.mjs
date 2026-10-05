/**
 * Web Push Notifications API Integration Tests.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createApi } from "../src/server.mjs";
import { sendPushToPlayer } from "../src/push-notifications.mjs";

const SIGNING_KEY = "01234567890123456789012345678901";
const ENCRYPTION_KEY = Buffer.alloc(32, 7);
const PASSWORD = "CorrectHorseBattery99!";

describe("Web Push Notifications API", () => {
  let db, auth, api, base, playerToken;

  before(async () => {
    db = await PGlite.create();
    await migrate(db);
    auth = createAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY });

    api = createApi({
      db,
      auth,
      rateLimit: { capacity: 1000, refillPerSecond: 1000 },
    });
    await api.listen();
    base = api.url;

    // Register test player
    await auth.register({ playerId: "push_player_1", handle: "push_player_1", password: PASSWORD, termsAccepted: true });
    const loginRes = await auth.login({ identifier: "push_player_1", password: PASSWORD });
    playerToken = loginRes.accessToken;
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

  test("GET /v1/notifications/vapid-public-key returns the public key without authentication", async () => {
    const res = await req("GET", "/v1/notifications/vapid-public-key");
    assert.equal(res.status, 200);
    assert.ok(res.body.publicKey);
    assert.equal(typeof res.body.publicKey, "string");
    assert.ok(res.body.publicKey.length > 30);
  });

  test("POST /v1/me/push-subscriptions requires authentication", async () => {
    const res = await req("POST", "/v1/me/push-subscriptions", {
      body: { endpoint: "https://example.com/push/123", keys: { p256dh: "key1", auth: "auth1" } },
    });
    assert.equal(res.status, 401);
  });

  test("POST /v1/me/push-subscriptions registers a valid subscription", async () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/test-device-1";
    const res = await req("POST", "/v1/me/push-subscriptions", {
      token: playerToken,
      body: {
        endpoint,
        keys: {
          p256dh: "BCVxsr7N_eNg6gDb-q_dummy_key_p256dh",
          auth: "dummy_auth_secret",
        },
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);

    const rows = await db.query("SELECT player_id, endpoint FROM push_subscription WHERE player_id = 'push_player_1'");
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].endpoint, endpoint);
  });

  test("POST /v1/me/push-subscriptions updates existing subscription idempotently", async () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/test-device-1";
    const res = await req("POST", "/v1/me/push-subscriptions", {
      token: playerToken,
      body: {
        endpoint,
        keys: {
          p256dh: "updated_p256dh_key",
          auth: "updated_auth_secret",
        },
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);

    const rows = await db.query("SELECT p256dh FROM push_subscription WHERE endpoint = $1", [endpoint]);
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].p256dh, "updated_p256dh_key");
  });

  test("DELETE /v1/me/push-subscriptions removes subscription", async () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/test-device-1";
    const res = await req("DELETE", "/v1/me/push-subscriptions", {
      token: playerToken,
      body: { endpoint },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);

    const rows = await db.query("SELECT * FROM push_subscription WHERE endpoint = $1", [endpoint]);
    assert.equal(rows.rows.length, 0);
  });

  test("sendPushToPlayer gracefully handles players with 0 subscriptions", async () => {
    const result = await sendPushToPlayer(db, "player_without_devices", {
      title: "Test Alert",
      body: "Match Starting",
    });
    assert.equal(result.sent, 0);
    assert.equal(result.failed, 0);
  });
});
