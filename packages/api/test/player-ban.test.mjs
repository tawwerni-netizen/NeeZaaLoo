import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createRbacService } from "../../authz/src/rbac.mjs";
import { createChannelService, globalChannelId } from "../../chat/src/channels.mjs";
import { createModerationService } from "../../chat/src/moderation.mjs";
import { createBlockService } from "../../chat/src/blocks.mjs";
import { createMessageService } from "../../chat/src/messages.mjs";
import { createReportService } from "../../chat/src/reports.mjs";
import { createDirectChatService } from "../../chat/src/direct.mjs";
import { createApi } from "../src/server.mjs";

const SIGNING_KEY = Buffer.alloc(32, 77);
const ENCRYPTION_KEY = Buffer.alloc(32, 88);
const PASSWORD = "correct horse battery staple";
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };

let db, auth, rbac, chat, directChat, api, base;

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

const tokenFor = async (handle) =>
  (await auth.login({ identifier: handle, password: PASSWORD })).accessToken;

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  auth = createAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: FAST_ARGON });
  rbac = createRbacService(db);
  const channels = createChannelService(db);
  const moderation = createModerationService(db);
  const blocks = createBlockService(db);
  const messages = createMessageService(db, { channels, moderation, blocks });
  const reports = createReportService(db);
  chat = { channels, moderation, blocks, messages, reports };
  directChat = createDirectChatService(db);

  api = createApi({ db, auth, rbac, chat, directChat, rateLimit: { capacity: 5000, refillPerSecond: 5000 } });
  await api.listen();
  base = api.url;

  for (const p of ["adminSuper", "adminMod", "badPlayer", "innocentPlayer"]) {
    await auth.register({ playerId: p, handle: p, password: PASSWORD });
  }

  // Seed super admin
  await db.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('bootstrap','bootstrap@n.test','Bootstrap',TRUE)");
  await db.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ($1,$2,$1,TRUE)", ["adminSuper", "adminSuper@nizalo.internal"]);
  await db.query("INSERT INTO admin_role_grant (admin_id,role,granted_by,reason) VALUES ('adminSuper','SUPER_ADMIN','bootstrap','init')");
});

after(async () => {
  await api.close();
});

describe("Admin player promotion and chat moderation capability", () => {
  test("promoting a player to Admin grants ADMIN role and chat moderation capability", async () => {
    const superToken = await tokenFor("adminSuper");
    const step = await req("POST", "/v1/auth/step-up", {
      token: superToken,
      body: { action: "admin.rbac.manage", password: PASSWORD },
    });
    assert.equal(step.status, 200, `step-up failed: ${JSON.stringify(step.body)}`);
    const promoteRes = await req("POST", "/v1/admin/players/adminMod/promote", {
      token: superToken,
      headers: { "x-step-up-token": step.body.stepUpToken },
    });
    assert.equal(promoteRes.status, 200, JSON.stringify(promoteRes.body));

    const modToken = await tokenFor("adminMod");
    // Send a message as badPlayer
    const sent = await chat.messages.sendMessage({
      channelId: globalChannelId(),
      senderId: "badPlayer",
      content: "offensive content here",
      clientMessageId: "ban_test_msg_1",
    });
    assert.equal(sent.ok, true);

    // adminMod can delete this message
    const delRes = await req("POST", `/v1/admin/chat/messages/${sent.message.id}/delete`, { token: modToken });
    assert.equal(delRes.status, 200);
    assert.equal(delRes.body.ok, true);

    // adminMod can mute badPlayer
    const muteRes = await req("POST", "/v1/admin/chat/mutes", {
      token: modToken,
      body: { targetId: "badPlayer", reason: "toxic language", scope: "ALL_CHAT", durationMs: 3600000 },
    });
    assert.equal(muteRes.status, 201);
    assert.equal(muteRes.body.ok, true);
    const muteId = muteRes.body.muteId;

    // adminMod can list active mutes
    const mutesList = await req("GET", "/v1/admin/chat/mutes", { token: modToken });
    assert.equal(mutesList.status, 200);
    const foundMute = mutesList.body.mutes.find((m) => m.id === muteId);
    assert.ok(foundMute);
    assert.equal(foundMute.target_id, "badPlayer");
    assert.equal(foundMute.reason, "toxic language");

    // adminMod can revoke the mute
    const revokeRes = await req("POST", `/v1/admin/chat/mutes/${muteId}/revoke`, { token: modToken });
    assert.equal(revokeRes.status, 200);
    assert.equal(revokeRes.body.ok, true);
  });
});

describe("Admin player site-wide banning", () => {
  test("banning a player disables account, revokes sessions, and blocks logins", async () => {
    const modToken = await tokenFor("adminMod");
    const badLogin = await auth.login({ identifier: "badPlayer", password: PASSWORD });
    assert.equal(badLogin.ok, true);
    const initialBadToken = badLogin.accessToken;
    const initialBadRefresh = badLogin.refreshToken;

    // Ban the bad player
    const banRes = await req("POST", "/v1/admin/players/badPlayer/ban", {
      token: modToken,
      body: { reason: "Severe terms of service violation" },
    });
    assert.equal(banRes.status, 200);
    assert.equal(banRes.body.ok, true);

    // Request with existing token is rejected because its session was revoked
    const meRes = await req("GET", "/v1/me", { token: initialBadToken });
    assert.equal(meRes.status, 401);
    assert.equal(meRes.body.error.code, "UNAUTHENTICATED");

    // Refresh is rejected because session was revoked
    const refreshRes = await auth.refresh(initialBadRefresh);
    assert.equal(refreshRes.ok, false);
    assert.equal(refreshRes.reason, "SESSION_REVOKED");

    // Login is rejected with ACCOUNT_DISABLED
    const loginRes = await auth.login({ identifier: "badPlayer", password: PASSWORD });
    assert.equal(loginRes.ok, false);
    assert.equal(loginRes.reason, "ACCOUNT_DISABLED");

    // GET /v1/admin/players reflects disabled_at
    const listRes = await req("GET", "/v1/admin/players?q=badPlayer", { token: modToken });
    assert.equal(listRes.status, 200);
    const found = listRes.body.players.find((p) => p.id === "badPlayer");
    assert.ok(found.disabled_at);
    assert.equal(found.disabled_reason, "Severe terms of service violation");

    // Admin cannot ban themselves
    const selfBan = await req("POST", "/v1/admin/players/adminMod/ban", { token: modToken });
    assert.equal(selfBan.status, 400);

    // Unban player restores access
    const unbanRes = await req("POST", "/v1/admin/players/badPlayer/unban", { token: modToken });
    assert.equal(unbanRes.status, 200);
    assert.equal(unbanRes.body.ok, true);

    // Player can now log in again
    const loginAfterUnban = await auth.login({ identifier: "badPlayer", password: PASSWORD });
    assert.equal(loginAfterUnban.ok, true);
  });
});
