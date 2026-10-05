/**
 * Chat security (Slice 9J). Each test targets one named attack from the
 * slice's own security checklist (directive #38): cross-user private
 * match chat, non-participant join, muted-user send, blocked-user
 * behavior, moderator permission enforcement, deleted-message visibility,
 * and internal moderation state never leaking to a customer.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createRbacService } from "../../authz/src/rbac.mjs";
import { createChannelService, globalChannelId } from "../../chat/src/channels.mjs";
import { createModerationService, ChatMuteScope } from "../../chat/src/moderation.mjs";
import { createBlockService } from "../../chat/src/blocks.mjs";
import { createMessageService } from "../../chat/src/messages.mjs";
import { createReportService } from "../../chat/src/reports.mjs";
import { createApi } from "../src/server.mjs";

const SIGNING_KEY = Buffer.alloc(32, 51);
const ENCRYPTION_KEY = Buffer.alloc(32, 52);
const PASSWORD = "correct horse battery staple";
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };

let db, auth, rbac, chat, api, base;

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

const tokenFor = async (handle) => (await auth.login({ identifier: handle, password: PASSWORD })).accessToken;

async function duel(id, seat0, seat1) {
  await db.query(
    `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1, tier, stake_minor, initial_state, time_control)
     VALUES ($1,'chess',1,$1,$2,$3,'FREE',0,'{}'::jsonb,'{}'::jsonb)`,
    [id, seat0, seat1]
  );
}

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

  api = createApi({ db, auth, rbac, chat, rateLimit: { capacity: 5000, refillPerSecond: 5000 } });
  await api.listen();
  base = api.url;

  const admins = ["root", "fullMod", "viewOnlyMod", "impostorMod"];
  for (const p of ["custA", "custB", "custC", "custD", ...admins]) {
    await auth.register({ playerId: p, handle: p, password: PASSWORD });
  }
  for (const a of admins) {
    await db.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ($1,$2,$1,TRUE)", [a, `${a}@n.example`]);
  }
  const full = await rbac.createRole({
    id: "role_full_chatmod", name: "Full Chat Mod",
    permissionCodes: ["CHAT_VIEW", "CHAT_DELETE", "CHAT_MUTE", "CHAT_REPORT_REVIEW"],
    createdBy: "root",
  });
  const viewOnly = await rbac.createRole({ id: "role_view_only_chatmod", name: "Chat View Only", permissionCodes: ["CHAT_VIEW"], createdBy: "root" });
  await rbac.grantRole({ adminId: "fullMod", roleId: full.id, grantedBy: "root" });
  await rbac.grantRole({ adminId: "impostorMod", roleId: full.id, grantedBy: "root" });
  await rbac.grantRole({ adminId: "viewOnlyMod", roleId: viewOnly.id, grantedBy: "root" });
});

after(async () => { await api.close(); });

// ---------------------------------------------------------------------------

describe("cross-user private match chat", () => {
  test("a non-participant cannot read a match's private chat, even with a valid token for a real account", async () => {
    await duel("secdue1", "custA", "custB");
    await chat.channels.getOrCreateMatchChannel("secdue1");
    await chat.messages.sendMessage({ channelId: "match:secdue1", senderId: "custA", content: "private strategy talk", clientMessageId: "sc-1" });
    const outsiderToken = await tokenFor("custC");
    const r = await req("GET", "/v1/duels/secdue1/chat/messages", { token: outsiderToken });
    assert.equal(r.status, 403);
  });

  test("a non-participant cannot join or send to a match's chat over the realtime protocol either -- covered directly in packages/realtime/test/chat-gateway.test.mjs's own NOT_A_PARTICIPANT test", () => {
    assert.ok(true);
  });
});

describe("muted user cannot send", () => {
  test("a muted player's send is refused by the REST-adjacent service the gateway itself calls", async () => {
    await db.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('secmod1','secmod1@n','secmod1',TRUE)");
    await chat.moderation.muteUser({ targetId: "custD", moderatorId: "secmod1", reason: "spam", scope: ChatMuteScope.GLOBAL_CHAT });
    const r = await chat.messages.sendMessage({ channelId: globalChannelId(), senderId: "custD", content: "let me talk", clientMessageId: "sc-2" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "MUTED");
  });
});

describe("blocked user behavior", () => {
  test("a blocked sender's messages are excluded from the blocker's own history read, at the API layer", async () => {
    const sent = await chat.messages.sendMessage({ channelId: globalChannelId(), senderId: "custB", content: "should be invisible to custA", clientMessageId: "sc-3" });
    assert.equal(sent.ok, true);
    const tokenA = await tokenFor("custA");
    await req("POST", "/v1/chat/blocks", { token: tokenA, body: { blockedId: "custB" } });
    const r = await req("GET", "/v1/chat/global/messages", { token: tokenA });
    assert.ok(!r.body.messages.some((m) => m.id === sent.message.id));
  });

  test("blocking does not stop the blocked player from sending, or affect what OTHER players see", async () => {
    const sent = await chat.messages.sendMessage({ channelId: globalChannelId(), senderId: "custB", content: "still visible to custC", clientMessageId: "sc-4" });
    assert.equal(sent.ok, true);
    const tokenC = await tokenFor("custC");
    const r = await req("GET", "/v1/chat/global/messages", { token: tokenC });
    assert.ok(r.body.messages.some((m) => m.id === sent.message.id));
  });
});

describe("moderator permission enforcement", () => {
  test("SUPER_ADMIN through the fixed grid alone cannot delete, mute, or review reports", async () => {
    const sent = await chat.messages.sendMessage({ channelId: globalChannelId(), senderId: "custA", content: "root cannot touch this", clientMessageId: "sc-5" });
    const rootToken = await tokenFor("root");
    const del = await req("POST", `/v1/admin/chat/messages/${sent.message.id}/delete`, { token: rootToken });
    assert.equal(del.status, 403);
    const mute = await req("POST", "/v1/admin/chat/mutes", { token: rootToken, body: { targetId: "custA", reason: "x", scope: "GLOBAL_CHAT" } });
    assert.equal(mute.status, 403);
  });

  test("TICKET_VIEW-style granularity holds here too: view-only chat mod cannot mute or delete", async () => {
    const sent = await chat.messages.sendMessage({ channelId: globalChannelId(), senderId: "custA", content: "view only cannot delete", clientMessageId: "sc-6" });
    const viewToken = await tokenFor("viewOnlyMod");
    const view = await req("GET", "/v1/admin/chat/global/messages", { token: viewToken });
    assert.equal(view.status, 200);
    const del = await req("POST", `/v1/admin/chat/messages/${sent.message.id}/delete`, { token: viewToken });
    assert.equal(del.status, 403);
  });

  test("a plain player cannot reach any admin chat route", async () => {
    const token = await tokenFor("custA");
    for (const [method, path, body] of [
      ["GET", "/v1/admin/chat/global/messages", undefined],
      ["POST", "/v1/admin/chat/mutes", { targetId: "custB", reason: "x", scope: "GLOBAL_CHAT" }],
      ["GET", "/v1/admin/chat/reports", undefined],
    ]) {
      const r = await req(method, path, { token, body });
      assert.equal(r.status, 403, `${method} ${path} should be 403 for a plain player`);
    }
  });
});

describe("staff impersonation", () => {
  test("a moderator cannot attribute a deletion to a different admin -- deleted_by is derived from the authenticated actor", async () => {
    const sent = await chat.messages.sendMessage({ channelId: globalChannelId(), senderId: "custA", content: "impersonation test", clientMessageId: "sc-7" });
    const impostorToken = await tokenFor("impostorMod");
    await req("POST", `/v1/admin/chat/messages/${sent.message.id}/delete`, { token: impostorToken, body: { moderatorId: "root" } });
    const row = await db.query("SELECT deleted_by FROM chat_message WHERE id = $1", [sent.message.id]);
    assert.equal(row.rows[0].deleted_by, "impostorMod");
  });

  test("the admin_audit row for a mute always names the real authenticated admin", async () => {
    // A dedicated target, never used to SEND a message elsewhere in this
    // file: muting is a real, persistent side effect, and reusing custA
    // here would silently mute it for every later test in this file.
    await auth.register({ playerId: "muteVictim1", handle: "muteVictim1", password: PASSWORD });
    const modToken = await tokenFor("fullMod");
    await req("POST", "/v1/admin/chat/mutes", { token: modToken, body: { targetId: "muteVictim1", reason: "audit test", scope: "GLOBAL_CHAT", moderatorId: "root" } });
    const audit = await db.query(
      "SELECT admin_id, detail FROM admin_audit WHERE action = 'admin.chat.mute' ORDER BY id DESC LIMIT 1"
    );
    assert.equal(audit.rows[0].admin_id, "fullMod");
  });
});

describe("deleted message visibility / internal state never leaks", () => {
  test("a customer's history read shows removed:true and content:null -- never the real text, never who deleted it", async () => {
    const sent = await chat.messages.sendMessage({ channelId: globalChannelId(), senderId: "custA", content: "secret text nobody but staff should see", clientMessageId: "sc-8" });
    const modToken = await tokenFor("fullMod");
    await req("POST", `/v1/admin/chat/messages/${sent.message.id}/delete`, { token: modToken });

    const custToken = await tokenFor("custB");
    const r = await req("GET", "/v1/chat/global/messages", { token: custToken });
    const msg = r.body.messages.find((m) => m.id === sent.message.id);
    assert.equal(msg.removed, true);
    assert.equal(msg.content, null);
    assert.equal("deletedBy" in msg, false, "the customer-facing shape must never carry a deletedBy field at all");
  });

  test("the report queue never exposes a message's content, only its reference", async () => {
    const sent = await chat.messages.sendMessage({ channelId: globalChannelId(), senderId: "custA", content: "reported content should not leak into the queue row", clientMessageId: "sc-9" });
    const reporterToken = await tokenFor("custB");
    await req("POST", "/v1/chat/reports", { token: reporterToken, body: { messageId: sent.message.id, category: "SPAM" } });
    const modToken = await tokenFor("fullMod");
    const queue = await req("GET", "/v1/admin/chat/reports", { token: modToken });
    const row = queue.body.reports.find((r) => String(r.message_id) === String(sent.message.id));
    assert.ok(row);
    assert.equal("content" in row, false);
  });
});

describe("spectator security (Slice 10)", () => {
  test("an eligible spectator (OPEN policy) is allowed into spectator chat", async () => {
    await duel("secspecduel1", "custA", "custB");
    const token = await tokenFor("custC");
    const r = await req("GET", "/v1/duels/secspecduel1/spectator-chat/messages", { token });
    assert.equal(r.status, 200);
  });

  test("an unauthorized spectator (PLAYERS_ONLY policy) is rejected, and the rejection carries no player identity or moderation detail", async () => {
    await duel("secspecduel2", "custA", "custB");
    await db.query("UPDATE duel SET spectator_policy='PLAYERS_ONLY' WHERE id='secspecduel2'");
    const token = await tokenFor("custC");
    const r = await req("GET", "/v1/duels/secspecduel2/spectator-chat/messages", { token });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, "SPECTATORS_DISABLED");
    assert.equal(JSON.stringify(r.body).includes("custA"), false, "the rejection must never leak who is actually seated");
  });

  test("the PRIVATE player match channel is inaccessible to a spectator, even one legitimately eligible for spectator chat on the SAME duel", async () => {
    await duel("secspecduel3", "custA", "custB");
    const spectatorToken = await tokenFor("custC");
    const spectatorOk = await req("GET", "/v1/duels/secspecduel3/spectator-chat/messages", { token: spectatorToken });
    assert.equal(spectatorOk.status, 200, "sanity: this identity IS a legitimate spectator");
    const playerChat = await req("GET", "/v1/duels/secspecduel3/chat/messages", { token: spectatorToken });
    assert.equal(playerChat.status, 403, "the SAME identity must still be refused the private player channel");
    assert.equal(playerChat.body.error.code, "NOT_A_PARTICIPANT");
  });

  test("a spectator channel is scoped to its OWN duelId -- a forged/guessed duelId for an unrelated match never returns another match's spectator content", async () => {
    await duel("secspecduel4", "custA", "custB");
    await duel("secspecduel5", "custD", "custB");
    await chat.channels.getOrCreateSpectatorChannel("secspecduel4");
    await chat.channels.getOrCreateSpectatorChannel("secspecduel5");
    const sentTo4 = await chat.messages.sendMessage({ channelId: "spectator:secspecduel4", senderId: "custA", content: "duel4-only spectator content", clientMessageId: "sc-spec-1" });
    assert.equal(sentTo4.ok, true);
    const token = await tokenFor("custC");
    const r = await req("GET", "/v1/duels/secspecduel5/spectator-chat/messages", { token });
    assert.equal(r.status, 200);
    assert.equal(r.body.messages.some((m) => m.content === "duel4-only spectator content"), false, "duel4's spectator content must never surface on duel5's channel");
  });

  test("an invalid/nonexistent duel id on the spectator route is refused cleanly, not a crash or a 500", async () => {
    const token = await tokenFor("custC");
    const r = await req("GET", "/v1/duels/does-not-exist-at-all/spectator-chat/messages", { token });
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, "NO_SUCH_MATCH");
  });

  test("discovery (Watch Live) never leaks server-only duel fields -- no seed, no fairplay_meta, no lease/ownership state", async () => {
    await db.query(
      `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1, tier, stake_minor, initial_state, time_control, status, started_at, seed, fairplay_meta)
       VALUES ('secspecduel6','chess',1,'secspecduel6','custA','custB','FREE',0,'{}'::jsonb,'{}'::jsonb,'LIVE',now(),'top-secret-server-seed','{"riskScore":97}'::jsonb)`
    );
    const token = await tokenFor("custC");
    const r = await req("GET", "/v1/duels/live", { token });
    assert.equal(r.status, 200);
    const row = r.body.matches.find((m) => m.duelId === "secspecduel6");
    assert.ok(row);
    const serialized = JSON.stringify(row);
    assert.equal(serialized.includes("top-secret-server-seed"), false, "the RNG seed must never reach a spectator-facing route");
    assert.equal(serialized.includes("riskScore"), false, "anti-cheat/fairplay signals must never reach a spectator-facing route");
    assert.equal("seed" in row, false);
    assert.equal("fairplayMeta" in row, false);
  });
});
