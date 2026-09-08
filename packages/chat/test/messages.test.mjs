import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createChannelService, globalChannelId } from "../src/channels.mjs";
import { createModerationService, ChatMuteScope } from "../src/moderation.mjs";
import { createBlockService } from "../src/blocks.mjs";
import { createMessageService, ChatMessageError } from "../src/messages.mjs";
import { ChatContentError } from "../src/validate.mjs";
import { createMockAvatarStorage } from "../../profile/src/avatar-storage.mjs";

let db, channels, moderation, blocks, messages, avatarStorage;
let CLOCK = Date.now();

async function player(id, handle = id) {
  await db.query("INSERT INTO player (id, handle) VALUES ($1,$2)", [id, handle]);
}

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
  avatarStorage = createMockAvatarStorage();
  channels = createChannelService(db);
  moderation = createModerationService(db, { now: () => CLOCK });
  blocks = createBlockService(db);
  messages = createMessageService(db, { channels, moderation, blocks, avatarStorage, now: () => CLOCK });
});

after(async () => { await db.close?.(); });

describe("sendMessage", () => {
  test("a valid message to the global channel succeeds and projects nickname/avatar/badge", async () => {
    await player("alice1", "AliceHandle");
    const r = await messages.sendMessage({ channelId: globalChannelId(), senderId: "alice1", content: "hello everyone", clientMessageId: "cm-1" });
    assert.equal(r.ok, true);
    assert.equal(r.message.nickname, "AliceHandle");
    assert.equal(r.message.content, "hello everyone");
    assert.equal(r.message.removed, false);
    assert.ok(r.message.id);
  });

  test("an invalid channel is refused", async () => {
    await player("alice2");
    const r = await messages.sendMessage({ channelId: "no-such-channel", senderId: "alice2", content: "hi", clientMessageId: "cm-2" });
    assert.equal(r.ok, false);
  });

  test("a non-participant cannot send to a match channel", async () => {
    await player("m1a"); await player("m1b"); await player("outsider1");
    await duel("mdue1", "m1a", "m1b");
    const ch = await channels.getOrCreateMatchChannel("mdue1");
    const r = await messages.sendMessage({ channelId: ch.id, senderId: "outsider1", content: "let me in", clientMessageId: "cm-3" });
    assert.equal(r.ok, false);
  });

  test("empty content is refused", async () => {
    await player("alice3");
    const r = await messages.sendMessage({ channelId: globalChannelId(), senderId: "alice3", content: "   ", clientMessageId: "cm-4" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, ChatContentError.EMPTY);
  });

  test("content over 1000 characters is refused", async () => {
    await player("alice4");
    const r = await messages.sendMessage({ channelId: globalChannelId(), senderId: "alice4", content: "x".repeat(1001), clientMessageId: "cm-5" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, ChatContentError.TOO_LONG);
  });

  test("malformed Unicode (a lone, unpaired surrogate) never crashes or corrupts the send -- it is not a control character, so it persists safely rather than being silently dropped", async () => {
    await player("alice4b");
    const withLoneSurrogate = "hi " + String.fromCharCode(0xd800) + " there";
    const r = await messages.sendMessage({ channelId: globalChannelId(), senderId: "alice4b", content: withLoneSurrogate, clientMessageId: "cm-4b" });
    assert.equal(r.ok, true);
    // Round-tripping through history must not throw or truncate the row --
    // the DB driver's UTF-8 encoding of an unpaired surrogate substitutes
    // U+FFFD rather than raising, which is exactly the safe, inert outcome
    // this test is pinning down.
    const [fromHistory] = await messages.listHistory({ channelId: globalChannelId(), viewerId: "alice4b", limit: 1 });
    assert.equal(fromHistory.id, r.message.id);
    assert.ok(fromHistory.content.startsWith("hi "));
  });

  test("a missing clientMessageId is refused", async () => {
    await player("alice5");
    const r = await messages.sendMessage({ channelId: globalChannelId(), senderId: "alice5", content: "hi", clientMessageId: "" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, ChatMessageError.INVALID_CLIENT_MESSAGE_ID);
  });

  test("a retry with the SAME clientMessageId is deduped, not a second message", async () => {
    await player("bob1");
    const first = await messages.sendMessage({ channelId: globalChannelId(), senderId: "bob1", content: "unique text one", clientMessageId: "cm-dup" });
    assert.equal(first.ok, true);
    assert.equal(first.deduped, false);
    const retry = await messages.sendMessage({ channelId: globalChannelId(), senderId: "bob1", content: "unique text one", clientMessageId: "cm-dup" });
    assert.equal(retry.ok, true);
    assert.equal(retry.deduped, true);
    assert.equal(retry.message.id, first.message.id);
    const count = await db.query("SELECT count(*)::int AS n FROM chat_message WHERE sender_id = 'bob1' AND client_message_id = 'cm-dup'");
    assert.equal(count.rows[0].n, 1);
  });

  test("a DIFFERENT clientMessageId with the same content shortly after is rejected as a duplicate-content flood", async () => {
    await player("bob2");
    const first = await messages.sendMessage({ channelId: globalChannelId(), senderId: "bob2", content: "spam me", clientMessageId: "cm-a" });
    assert.equal(first.ok, true);
    const second = await messages.sendMessage({ channelId: globalChannelId(), senderId: "bob2", content: "spam me", clientMessageId: "cm-b" });
    assert.equal(second.ok, false);
    assert.equal(second.reason, ChatMessageError.DUPLICATE_MESSAGE);
  });

  test("the SAME content after the cooldown window elapses is accepted again", async () => {
    await player("bob3");
    await messages.sendMessage({ channelId: globalChannelId(), senderId: "bob3", content: "repeat me", clientMessageId: "cm-c" });
    CLOCK += 6000;
    const r = await messages.sendMessage({ channelId: globalChannelId(), senderId: "bob3", content: "repeat me", clientMessageId: "cm-d" });
    assert.equal(r.ok, true);
  });

  test("a DIFFERENT message right after is never blocked by the duplicate-content cooldown", async () => {
    await player("bob4");
    await messages.sendMessage({ channelId: globalChannelId(), senderId: "bob4", content: "first message", clientMessageId: "cm-e" });
    const r = await messages.sendMessage({ channelId: globalChannelId(), senderId: "bob4", content: "a totally different message", clientMessageId: "cm-f" });
    assert.equal(r.ok, true);
  });

  test("a muted player cannot send to the scope they are muted in", async () => {
    await player("muted1");
    await db.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('mod1','mod1@n','mod1',TRUE)");
    await moderation.muteUser({ targetId: "muted1", moderatorId: "mod1", reason: "spam", scope: ChatMuteScope.GLOBAL_CHAT });
    const r = await messages.sendMessage({ channelId: globalChannelId(), senderId: "muted1", content: "let me talk", clientMessageId: "cm-g" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, ChatMessageError.MUTED);
  });

  test("an ALL_CHAT mute blocks a match channel send too", async () => {
    await player("muted2a"); await player("muted2b");
    await db.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('mod2','mod2@n','mod2',TRUE)");
    await duel("mdue2", "muted2a", "muted2b");
    const ch = await channels.getOrCreateMatchChannel("mdue2");
    await moderation.muteUser({ targetId: "muted2a", moderatorId: "mod2", reason: "abuse", scope: ChatMuteScope.ALL_CHAT });
    const r = await messages.sendMessage({ channelId: ch.id, senderId: "muted2a", content: "gg", clientMessageId: "cm-h" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, ChatMessageError.MUTED);
  });

  test("a MATCH_CHAT mute does NOT block a global chat send", async () => {
    await player("muted3a"); await player("muted3b");
    await db.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('mod3','mod3@n','mod3',TRUE)");
    await duel("mdue3", "muted3a", "muted3b");
    await moderation.muteUser({ targetId: "muted3a", moderatorId: "mod3", reason: "match toxicity", scope: ChatMuteScope.MATCH_CHAT });
    const r = await messages.sendMessage({ channelId: globalChannelId(), senderId: "muted3a", content: "hi global", clientMessageId: "cm-i" });
    assert.equal(r.ok, true);
  });
});

describe("listHistory", () => {
  test("returns messages newest-first by default, using id ordering not timestamps", async () => {
    await player("hist1");
    const chan = `hist-chan-${Date.now()}`;
    await db.query("INSERT INTO chat_channel (id, type) VALUES ($1, 'GLOBAL')", [chan]);
    await messages.sendMessage({ channelId: chan, senderId: "hist1", content: "first", clientMessageId: "h1" });
    await messages.sendMessage({ channelId: chan, senderId: "hist1", content: "second", clientMessageId: "h2" });
    await messages.sendMessage({ channelId: chan, senderId: "hist1", content: "third", clientMessageId: "h3" });
    const page = await messages.listHistory({ channelId: chan, viewerId: "hist1" });
    assert.deepEqual(page.map((m) => m.content), ["third", "second", "first"]);
  });

  test("`before` pages backward into older history", async () => {
    await player("hist2");
    const chan = `hist-chan2-${Date.now()}`;
    await db.query("INSERT INTO chat_channel (id, type) VALUES ($1, 'GLOBAL')", [chan]);
    const ids = [];
    for (const text of ["a", "b", "c", "d"]) {
      const r = await messages.sendMessage({ channelId: chan, senderId: "hist2", content: text, clientMessageId: `hb-${text}` });
      ids.push(r.message.id);
    }
    const firstPage = await messages.listHistory({ channelId: chan, viewerId: "hist2", limit: 2 });
    assert.deepEqual(firstPage.map((m) => m.content), ["d", "c"]);
    const secondPage = await messages.listHistory({ channelId: chan, viewerId: "hist2", before: firstPage[firstPage.length - 1].id, limit: 2 });
    assert.deepEqual(secondPage.map((m) => m.content), ["b", "a"]);
  });

  test("`after` recovers missed messages in chronological order for a reconnecting client", async () => {
    await player("hist3");
    const chan = `hist-chan3-${Date.now()}`;
    await db.query("INSERT INTO chat_channel (id, type) VALUES ($1, 'GLOBAL')", [chan]);
    const first = await messages.sendMessage({ channelId: chan, senderId: "hist3", content: "seen before disconnect", clientMessageId: "ha-1" });
    await messages.sendMessage({ channelId: chan, senderId: "hist3", content: "missed 1", clientMessageId: "ha-2" });
    await messages.sendMessage({ channelId: chan, senderId: "hist3", content: "missed 2", clientMessageId: "ha-3" });
    const missed = await messages.listHistory({ channelId: chan, viewerId: "hist3", after: first.message.id });
    assert.deepEqual(missed.map((m) => m.content), ["missed 1", "missed 2"]);
  });

  test("a message from a blocked player never appears in the viewer's history", async () => {
    await player("blocker1"); await player("blockee1");
    const chan = `hist-chan4-${Date.now()}`;
    await db.query("INSERT INTO chat_channel (id, type) VALUES ($1, 'GLOBAL')", [chan]);
    await messages.sendMessage({ channelId: chan, senderId: "blockee1", content: "annoying message", clientMessageId: "hbl-1" });
    await blocks.blockPlayer("blocker1", "blockee1");
    const page = await messages.listHistory({ channelId: chan, viewerId: "blocker1" });
    assert.equal(page.length, 0);
  });

  test("blocking does not affect what OTHER viewers see", async () => {
    await player("blocker2"); await player("blockee2"); await player("bystander2");
    const chan = `hist-chan5-${Date.now()}`;
    await db.query("INSERT INTO chat_channel (id, type) VALUES ($1, 'GLOBAL')", [chan]);
    await messages.sendMessage({ channelId: chan, senderId: "blockee2", content: "visible to most", clientMessageId: "hbl-2" });
    await blocks.blockPlayer("blocker2", "blockee2");
    const bystanderView = await messages.listHistory({ channelId: chan, viewerId: "bystander2" });
    assert.equal(bystanderView.length, 1);
  });

  test("a removed message still appears in the list (for ordering) but with content replaced by null and removed:true", async () => {
    await player("del1");
    const chan = `hist-chan6-${Date.now()}`;
    await db.query("INSERT INTO chat_channel (id, type) VALUES ($1, 'GLOBAL')", [chan]);
    const sent = await messages.sendMessage({ channelId: chan, senderId: "del1", content: "will be removed", clientMessageId: "hdel-1" });
    await db.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('moddel','moddel@n','moddel',TRUE)");
    await messages.moderateDelete({ messageId: sent.message.id, moderatorId: "moddel" });
    const page = await messages.listHistory({ channelId: chan, viewerId: "del1" });
    assert.equal(page.length, 1);
    assert.equal(page[0].removed, true);
    assert.equal(page[0].content, null);
  });
});

describe("listHistoryForStaff", () => {
  test("ignores the viewer's block list -- staff sees the real conversation regardless of anyone's personal blocks", async () => {
    await player("sblocker1"); await player("sblockee1");
    const chan = `staff-chan1-${Date.now()}`;
    await db.query("INSERT INTO chat_channel (id, type) VALUES ($1, 'GLOBAL')", [chan]);
    await messages.sendMessage({ channelId: chan, senderId: "sblockee1", content: "hello", clientMessageId: "sb-1" });
    await blocks.blockPlayer("sblocker1", "sblockee1");
    const staffView = await messages.listHistoryForStaff({ channelId: chan });
    assert.equal(staffView.length, 1);
  });

  test("a removed message keeps its real content and names the remover, for audit", async () => {
    await player("sdel1");
    const chan = `staff-chan2-${Date.now()}`;
    await db.query("INSERT INTO chat_channel (id, type) VALUES ($1, 'GLOBAL')", [chan]);
    const sent = await messages.sendMessage({ channelId: chan, senderId: "sdel1", content: "original text", clientMessageId: "sd-1" });
    await db.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('smod1','smod1@n','smod1',TRUE)");
    await messages.moderateDelete({ messageId: sent.message.id, moderatorId: "smod1" });
    const staffView = await messages.listHistoryForStaff({ channelId: chan });
    assert.equal(staffView[0].removed, true);
    assert.equal(staffView[0].content, "original text");
    assert.equal(staffView[0].deletedBy, "smod1");
  });
});

describe("moderateDelete", () => {
  test("deleting an already-deleted message is refused, not silently re-applied", async () => {
    await player("del2");
    const sent = await messages.sendMessage({ channelId: globalChannelId(), senderId: "del2", content: "delete me once", clientMessageId: "hdel-2" });
    await db.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('moddel2','moddel2@n','moddel2',TRUE)");
    const first = await messages.moderateDelete({ messageId: sent.message.id, moderatorId: "moddel2" });
    assert.equal(first.ok, true);
    const second = await messages.moderateDelete({ messageId: sent.message.id, moderatorId: "moddel2" });
    assert.equal(second.ok, false);
    assert.equal(second.reason, ChatMessageError.ALREADY_REMOVED);
  });

  test("deleting a nonexistent message is refused cleanly", async () => {
    await db.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('moddel3','moddel3@n','moddel3',TRUE)");
    const r = await messages.moderateDelete({ messageId: "999999999", moderatorId: "moddel3" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, ChatMessageError.NOT_FOUND);
  });

  test("a successful delete publishes a minimal 'chat:removed' event on the bus, with NO moderator id or reason", async () => {
    const published = [];
    const busMessages = createMessageService(db, {
      channels, moderation, blocks, avatarStorage, now: () => CLOCK,
      bus: { publish: (topic, payload) => published.push({ topic, payload }) },
    });
    await player("del3");
    const sent = await busMessages.sendMessage({ channelId: globalChannelId(), senderId: "del3", content: "delete me for the bus", clientMessageId: "hdel-bus-1" });
    await db.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('moddel4','moddel4@n','moddel4',TRUE)");
    const del = await busMessages.moderateDelete({ messageId: sent.message.id, moderatorId: "moddel4" });
    assert.equal(del.ok, true);
    assert.equal(published.length, 1);
    assert.equal(published[0].topic, "chat:removed");
    assert.deepEqual(Object.keys(published[0].payload).sort(), ["channelId", "messageId"]);
    assert.equal(published[0].payload.messageId, sent.message.id);
  });

  test("moderateDelete works exactly the same with no bus configured -- publishing is optional, never required for the delete itself", async () => {
    await player("del4");
    const sent = await messages.sendMessage({ channelId: globalChannelId(), senderId: "del4", content: "no bus here", clientMessageId: "hdel-nobus-1" });
    await db.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('moddel5','moddel5@n','moddel5',TRUE)");
    const del = await messages.moderateDelete({ messageId: sent.message.id, moderatorId: "moddel5" });
    assert.equal(del.ok, true);
  });
});

describe("match channel lifecycle affects sendMessage (Slice 10)", () => {
  test("a send to a match channel past its post-game deadline is refused with POST_GAME_CLOSED, even though history is still readable", async () => {
    await player("lifeS1a"); await player("lifeS1b");
    await duel("duel-lifeS1", "lifeS1a", "lifeS1b");
    const ch = await channels.getOrCreateMatchChannel("duel-lifeS1");
    const before = await messages.sendMessage({ channelId: ch.id, senderId: "lifeS1a", content: "while live", clientMessageId: "life-s1-1" });
    assert.equal(before.ok, true);

    await channels.markMatchCompleted("duel-lifeS1", { at: CLOCK, windowMs: 1 });
    // Advance the shared clock past the 1ms window.
    const savedClock = CLOCK;
    CLOCK += 1000;
    const after = await messages.sendMessage({ channelId: ch.id, senderId: "lifeS1a", content: "after the window closed", clientMessageId: "life-s1-2" });
    assert.equal(after.ok, false);
    assert.equal(after.reason, "POST_GAME_CLOSED");

    // Existing history remains fully readable for the participant.
    const history = await messages.listHistory({ channelId: ch.id, viewerId: "lifeS1a", limit: 10 });
    assert.ok(history.some((m) => m.content === "while live"));
    CLOCK = savedClock;
  });
});
