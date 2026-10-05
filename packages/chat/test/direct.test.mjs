import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createDirectChatService } from "../src/direct.mjs";

let db, directChat;

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  directChat = createDirectChatService(db);

  // Seed test players
  await db.query(`
    INSERT INTO player (id, handle, bio, is_ai) VALUES
    ('u1', 'ahmed_king', 'Chess master', false),
    ('u2', 'sara_pro', 'Gomoku legend', false),
    ('u3', 'khaled99', 'Speed math fan', false),
    ('bot_chess', 'chess_engine', 'AI Engine', true)
  `);

  // Seed emails
  await db.query(`
    INSERT INTO email_identity (id, player_id, email, email_display) VALUES
    ('e1', 'u1', 'ahmed@example.com', 'ahmed@example.com'),
    ('e2', 'u2', 'sara@test.com', 'sara@test.com'),
    ('e3', 'u3', 'khaled@games.io', 'khaled@games.io')
  `);
});

after(async () => {
  await db.close?.();
});

describe("Direct Chat & Friends Service", () => {
  test("searchMembers: searches by handle and email, excludes bots and self", async () => {
    // Search by nickname
    const res1 = await directChat.searchMembers({ query: "ahmed", currentUserId: "u2" });
    assert.strictEqual(res1.length, 1);
    assert.strictEqual(res1[0].handle, "ahmed_king");

    // Search by email
    const res2 = await directChat.searchMembers({ query: "khaled@games", currentUserId: "u1" });
    assert.strictEqual(res2.length, 1);
    assert.strictEqual(res2[0].handle, "khaled99");

    // Excludes self
    const resSelf = await directChat.searchMembers({ query: "ahmed", currentUserId: "u1" });
    assert.strictEqual(resSelf.length, 0);

    // Excludes bots
    const resBot = await directChat.searchMembers({ query: "chess", currentUserId: "u1" });
    assert.ok(resBot.every(m => m.id !== "bot_chess"));
  });

  test("friendship lifecycle: send request, idempotent, list friends, remove friend", async () => {
    // u1 sends friend request to u2
    const req1 = await directChat.sendFriendRequest("u1", "u2");
    assert.strictEqual(req1.ok, true);
    assert.strictEqual(req1.status, "ACCEPTED");

    // Duplicate request is idempotent
    const reqDup = await directChat.sendFriendRequest("u1", "u2");
    assert.strictEqual(reqDup.ok, true);

    // List friends for u1
    const f1 = await directChat.listFriends("u1");
    assert.strictEqual(f1.length, 1);
    assert.strictEqual(f1[0].id, "u2");
    assert.strictEqual(f1[0].handle, "sara_pro");

    // List friends for u2 (symmetric acceptance)
    const f2 = await directChat.listFriends("u2");
    assert.strictEqual(f2.length, 1);
    assert.strictEqual(f2[0].id, "u1");

    // Remove friend
    const rem = await directChat.removeFriend("u1", "u2");
    assert.strictEqual(rem.ok, true);

    const f1After = await directChat.listFriends("u1");
    assert.strictEqual(f1After.length, 0);
  });

  test("direct messaging: send, retrieve, deduplicate by clientMessageId, conversations", async () => {
    // u1 sends DM to u3
    const msg1 = await directChat.sendDirectMessage({
      senderId: "u1",
      receiverId: "u3",
      content: "Hello Khaled! Want to play Speed Math?",
      clientMessageId: "cmsg-1",
    });
    assert.strictEqual(msg1.ok, true);
    assert.ok(msg1.messageId);

    // Deduplication with same clientMessageId
    const msg1Dup = await directChat.sendDirectMessage({
      senderId: "u1",
      receiverId: "u3",
      content: "Hello Khaled! Want to play Speed Math?",
      clientMessageId: "cmsg-1",
    });
    assert.strictEqual(msg1Dup.ok, true);
    assert.strictEqual(msg1Dup.messageId, msg1.messageId);

    // u3 sends reply to u1
    const msg2 = await directChat.sendDirectMessage({
      senderId: "u3",
      receiverId: "u1",
      content: "Sure, lets do 3 minutes challenge!",
      clientMessageId: "cmsg-2",
    });
    assert.strictEqual(msg2.ok, true);

    // Check conversations for u1
    const convs1 = await directChat.listConversations("u1");
    assert.strictEqual(convs1.length, 1);
    assert.strictEqual(convs1[0].partnerId, "u3");
    assert.strictEqual(convs1[0].partnerHandle, "khaled99");
    assert.strictEqual(convs1[0].lastMessage.content, "Sure, lets do 3 minutes challenge!");

    // Read messages thread from u1 perspective (marks received messages read)
    const thread1 = await directChat.getDirectMessages("u1", "u3");
    assert.strictEqual(thread1.length, 2);
    assert.strictEqual(thread1[0].isMine, true);
    assert.strictEqual(thread1[1].isMine, false);

    // Check unread count is now 0 after reading
    const convs1After = await directChat.listConversations("u1");
    assert.strictEqual(convs1After[0].unreadCount, 0);
  });
});
