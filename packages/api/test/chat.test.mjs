/**
 * The chat REST surface (Slice 9): history, blocking, reporting, and the
 * staff moderation routes. Sending itself is exercised in the realtime
 * gateway tests, not here -- see packages/realtime/test/chat-gateway.test.mjs.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createRbacService } from "../../authz/src/rbac.mjs";
import { createChannelService, globalChannelId, matchChannelId } from "../../chat/src/channels.mjs";
import { createModerationService } from "../../chat/src/moderation.mjs";
import { createBlockService } from "../../chat/src/blocks.mjs";
import { createMessageService } from "../../chat/src/messages.mjs";
import { createReportService } from "../../chat/src/reports.mjs";
import { createApi } from "../src/server.mjs";

const SIGNING_KEY = Buffer.alloc(32, 41);
const ENCRYPTION_KEY = Buffer.alloc(32, 42);
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

const tokenFor = async (handle) =>
  (await auth.login({ identifier: handle, password: PASSWORD })).accessToken;

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

  for (const p of ["custA", "custB", "custC", "root", "modAgent", "viewOnlyMod"]) {
    await auth.register({ playerId: p, handle: p, password: PASSWORD });
  }
  for (const a of ["root", "modAgent", "viewOnlyMod"]) {
    await db.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ($1,$2,$1,TRUE)", [a, `${a}@n.example`]);
  }
  const full = await rbac.createRole({
    id: "role_chat_mod", name: "Chat Mod",
    permissionCodes: ["CHAT_VIEW", "CHAT_DELETE", "CHAT_MUTE", "CHAT_REPORT_REVIEW"],
    createdBy: "root",
  });
  const viewOnly = await rbac.createRole({ id: "role_chat_view_only", name: "Chat View Only", permissionCodes: ["CHAT_VIEW"], createdBy: "root" });
  await rbac.grantRole({ adminId: "modAgent", roleId: full.id, grantedBy: "root" });
  await rbac.grantRole({ adminId: "viewOnlyMod", roleId: viewOnly.id, grantedBy: "root" });
});

after(async () => { await api.close(); });

// ---------------------------------------------------------------------------

describe("global chat history", () => {
  test("an authenticated player can read global history", async () => {
    await chat.messages.sendMessage({ channelId: globalChannelId(), senderId: "custA", content: "hello world", clientMessageId: "g1" });
    const token = await tokenFor("custA");
    const r = await req("GET", "/v1/chat/global/messages", { token });
    assert.equal(r.status, 200);
    assert.ok(r.body.messages.some((m) => m.content === "hello world"));
  });

  test("anonymous access is refused", async () => {
    const r = await req("GET", "/v1/chat/global/messages", {});
    assert.equal(r.status, 401);
  });

  test("a blocked sender's messages are absent from the viewer's own read", async () => {
    await chat.messages.sendMessage({ channelId: globalChannelId(), senderId: "custB", content: "unique-blockable-text", clientMessageId: "g2" });
    const tokenA = await tokenFor("custA");
    await req("POST", "/v1/chat/blocks", { token: tokenA, body: { blockedId: "custB" } });
    const r = await req("GET", "/v1/chat/global/messages", { token: tokenA });
    assert.ok(!r.body.messages.some((m) => m.content === "unique-blockable-text"));
  });
});

describe("match chat history", () => {
  test("a seated participant can read the match channel, lazily created on first access", async () => {
    await duel("apid1", "custA", "custB");
    await chat.channels.getOrCreateMatchChannel("apid1");
    const sent = await chat.messages.sendMessage({ channelId: matchChannelId("apid1"), senderId: "custA", content: "gg", clientMessageId: "m1" });
    assert.equal(sent.ok, true, JSON.stringify(sent));
    const token = await tokenFor("custA");
    const r = await req("GET", "/v1/duels/apid1/chat/messages", { token });
    assert.equal(r.status, 200);
    assert.ok(r.body.messages.some((m) => m.content === "gg"));
  });

  test("a non-participant is refused, even with a valid token for a real account", async () => {
    await duel("apid2", "custA", "custB");
    const token = await tokenFor("custC");
    const r = await req("GET", "/v1/duels/apid2/chat/messages", { token });
    assert.equal(r.status, 403);
  });

  test("a nonexistent duel is refused cleanly", async () => {
    const token = await tokenFor("custA");
    const r = await req("GET", "/v1/duels/no-such-duel/chat/messages", { token });
    assert.equal(r.status, 404);
  });
});

describe("blocking", () => {
  test("a player can block, list, and unblock another player", async () => {
    const token = await tokenFor("custA");
    const block = await req("POST", "/v1/chat/blocks", { token, body: { blockedId: "custC" } });
    assert.equal(block.status, 201);
    const list = await req("GET", "/v1/chat/blocks", { token });
    assert.ok(list.body.blocked.some((b) => b.blocked_id === "custC"));
    const unblock = await req("DELETE", "/v1/chat/blocks/custC", { token });
    assert.equal(unblock.status, 200);
    const listAfter = await req("GET", "/v1/chat/blocks", { token });
    assert.ok(!listAfter.body.blocked.some((b) => b.blocked_id === "custC"));
  });

  test("a player cannot block themselves", async () => {
    const token = await tokenFor("custB");
    const r = await req("POST", "/v1/chat/blocks", { token, body: { blockedId: "custB" } });
    assert.equal(r.status, 400);
  });
});

describe("reporting", () => {
  test("a player can report a message", async () => {
    const sent = await chat.messages.sendMessage({ channelId: globalChannelId(), senderId: "custB", content: "reportable content", clientMessageId: "rp1" });
    const token = await tokenFor("custA");
    const r = await req("POST", "/v1/chat/reports", { token, body: { messageId: sent.message.id, category: "SPAM", reason: "obvious spam" } });
    assert.equal(r.status, 201);
  });

  test("a player can report another player generally", async () => {
    const token = await tokenFor("custA");
    const r = await req("POST", "/v1/chat/reports", { token, body: { subjectPlayerId: "custC", category: "HARASSMENT", reason: "repeated DMs" } });
    assert.equal(r.status, 201);
  });

  test("reporting yourself is refused", async () => {
    const sent = await chat.messages.sendMessage({ channelId: globalChannelId(), senderId: "custA", content: "my own text", clientMessageId: "rp2" });
    const token = await tokenFor("custA");
    const r = await req("POST", "/v1/chat/reports", { token, body: { messageId: sent.message.id, category: "OTHER" } });
    assert.equal(r.status, 400);
  });
});

describe("staff moderation RBAC", () => {
  test("SUPER_ADMIN through the fixed grid alone has no chat moderation access", async () => {
    const token = await tokenFor("root");
    const r = await req("GET", "/v1/admin/chat/reports", { token });
    assert.equal(r.status, 403);
  });

  test("a plain player is refused on every admin chat route", async () => {
    const token = await tokenFor("custA");
    const r = await req("GET", "/v1/admin/chat/global/messages", { token });
    assert.equal(r.status, 403);
  });

  test("a chat moderator can view, delete, and mute", async () => {
    const sent = await chat.messages.sendMessage({ channelId: globalChannelId(), senderId: "custB", content: "moderate me", clientMessageId: "modtest1" });
    const modToken = await tokenFor("modAgent");

    const view = await req("GET", "/v1/admin/chat/global/messages", { token: modToken });
    assert.equal(view.status, 200);
    assert.ok(view.body.messages.some((m) => m.content === "moderate me"));

    const del = await req("POST", `/v1/admin/chat/messages/${sent.message.id}/delete`, { token: modToken });
    assert.equal(del.status, 200);

    const mute = await req("POST", "/v1/admin/chat/mutes", { token: modToken, body: { targetId: "custB", reason: "spam", scope: "GLOBAL_CHAT" } });
    assert.equal(mute.status, 201);
    const muteId = mute.body.muteId;

    const mutesList = await req("GET", "/v1/admin/chat/mutes/custB", { token: modToken });
    assert.ok(mutesList.body.mutes.some((m) => m.id === muteId));

    const revoke = await req("POST", `/v1/admin/chat/mutes/${muteId}/revoke`, { token: modToken });
    assert.equal(revoke.status, 200);
  });

  test("a view-only moderator cannot delete or mute", async () => {
    const sent = await chat.messages.sendMessage({ channelId: globalChannelId(), senderId: "custB", content: "cannot moderate this", clientMessageId: "modtest2" });
    const viewToken = await tokenFor("viewOnlyMod");

    const view = await req("GET", "/v1/admin/chat/global/messages", { token: viewToken });
    assert.equal(view.status, 200);

    const del = await req("POST", `/v1/admin/chat/messages/${sent.message.id}/delete`, { token: viewToken });
    assert.equal(del.status, 403);

    const mute = await req("POST", "/v1/admin/chat/mutes", { token: viewToken, body: { targetId: "custB", reason: "x", scope: "GLOBAL_CHAT" } });
    assert.equal(mute.status, 403);
  });

  test("a deleted message's real content and a removed:true flag come back for staff, never for a customer", async () => {
    const sent = await chat.messages.sendMessage({ channelId: globalChannelId(), senderId: "custC", content: "secret original text", clientMessageId: "modtest3" });
    const modToken = await tokenFor("modAgent");
    await req("POST", `/v1/admin/chat/messages/${sent.message.id}/delete`, { token: modToken });

    const staffView = await req("GET", "/v1/admin/chat/global/messages", { token: modToken });
    const staffMsg = staffView.body.messages.find((m) => m.id === sent.message.id);
    assert.equal(staffMsg.removed, true);
    assert.equal(staffMsg.content, "secret original text");

    const custToken = await tokenFor("custA");
    const custView = await req("GET", "/v1/chat/global/messages", { token: custToken });
    const custMsg = custView.body.messages.find((m) => m.id === sent.message.id);
    assert.equal(custMsg.removed, true);
    assert.equal(custMsg.content, null);
  });

  test("every staff moderation action lands in admin_audit with a CHAT_* event", async () => {
    const sent = await chat.messages.sendMessage({ channelId: globalChannelId(), senderId: "custB", content: "audit me", clientMessageId: "modtest4" });
    const modToken = await tokenFor("modAgent");
    await req("POST", `/v1/admin/chat/messages/${sent.message.id}/delete`, { token: modToken });
    const audit = await db.query(
      "SELECT detail FROM admin_audit WHERE admin_id = 'modAgent' AND action = 'admin.chat.delete' ORDER BY id DESC LIMIT 1"
    );
    assert.equal(audit.rows[0].detail.event, "CHAT_MESSAGE_DELETED");
  });
});

describe("spectator chat history (Slice 10)", () => {
  test("any authenticated player can read a real duel's spectator chat under the default OPEN policy", async () => {
    await duel("specrestduel1", "custA", "custB");
    await chat.channels.getOrCreateSpectatorChannel("specrestduel1");
    const sent = await chat.messages.sendMessage({ channelId: "spectator:specrestduel1", senderId: "custA", content: "hi from the players", clientMessageId: "sr1" });
    assert.equal(sent.ok, true, `setup send must succeed, got ${JSON.stringify(sent)}`);
    const token = await tokenFor("custC");
    const r = await req("GET", "/v1/duels/specrestduel1/spectator-chat/messages", { token });
    assert.equal(r.status, 200);
    assert.equal(r.body.channelId, "spectator:specrestduel1");
    assert.ok(r.body.messages.some((m) => m.content === "hi from the players"));
  });

  test("PLAYERS_ONLY spectator policy returns 403 to a non-participant, over REST", async () => {
    await duel("specrestduel2", "custA", "custB");
    await db.query("UPDATE duel SET spectator_policy='PLAYERS_ONLY' WHERE id='specrestduel2'");
    const token = await tokenFor("custC");
    const r = await req("GET", "/v1/duels/specrestduel2/spectator-chat/messages", { token });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, "SPECTATORS_DISABLED");
  });

  test("a seated player can always read their own match's spectator chat, even under PLAYERS_ONLY", async () => {
    await duel("specrestduel3", "custA", "custB");
    await db.query("UPDATE duel SET spectator_policy='PLAYERS_ONLY' WHERE id='specrestduel3'");
    const token = await tokenFor("custA");
    const r = await req("GET", "/v1/duels/specrestduel3/spectator-chat/messages", { token });
    assert.equal(r.status, 200);
  });

  test("anonymous access to spectator chat is refused", async () => {
    await duel("specrestduel4", "custA", "custB");
    const r = await req("GET", "/v1/duels/specrestduel4/spectator-chat/messages", {});
    assert.equal(r.status, 401);
  });
});

describe("spectator discovery / Watch Live (Slice 10)", () => {
  test("a LIVE, OPEN-policy duel appears in the live-matches list with real player data, no fabricated fields", async () => {
    await db.query(
      `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1, tier, stake_minor, initial_state, time_control, status, started_at)
       VALUES ('specdiscoduel1','chess',1,'specdiscoduel1','custA','custB','FREE',0,'{}'::jsonb,'{}'::jsonb,'LIVE',now())`
    );
    const token = await tokenFor("custC");
    const r = await req("GET", "/v1/duels/live", { token });
    assert.equal(r.status, 200);
    const row = r.body.matches.find((m) => m.duelId === "specdiscoduel1");
    assert.ok(row, "the real live duel must be listed");
    assert.equal(row.gameId, "chess");
    assert.deepEqual(row.players.map((p) => p.handle).sort(), ["custA", "custB"]);
  });

  test("a PLAYERS_ONLY duel is excluded from discovery entirely -- never advertised, never a fake 'private' placeholder", async () => {
    await db.query(
      `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1, tier, stake_minor, initial_state, time_control, status, started_at, spectator_policy)
       VALUES ('specdiscoduel2','chess',1,'specdiscoduel2','custA','custB','FREE',0,'{}'::jsonb,'{}'::jsonb,'LIVE',now(),'PLAYERS_ONLY')`
    );
    const token = await tokenFor("custC");
    const r = await req("GET", "/v1/duels/live", { token });
    assert.equal(r.status, 200);
    assert.ok(!r.body.matches.some((m) => m.duelId === "specdiscoduel2"));
  });

  test("a COMPLETED duel never appears in the live-matches list", async () => {
    await db.query(
      `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1, tier, stake_minor, initial_state, time_control, status, started_at, completed_at, result, termination_reason)
       VALUES ('specdiscoduel3','chess',1,'specdiscoduel3','custA','custB','FREE',0,'{}'::jsonb,'{}'::jsonb,'COMPLETED',now(),now(),'1-0','RESIGNATION')`
    );
    const token = await tokenFor("custC");
    const r = await req("GET", "/v1/duels/live", { token });
    assert.ok(!r.body.matches.some((m) => m.duelId === "specdiscoduel3"));
  });

  test("anonymous discovery access is allowed -- the Live Arena is a public showcase, like a homepage scoreboard", async () => {
    const r = await req("GET", "/v1/duels/live", {});
    assert.equal(r.status, 200);
  });
});
