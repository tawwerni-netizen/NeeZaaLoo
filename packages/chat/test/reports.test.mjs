import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createReportService, ChatReportCategory, ReportError } from "../src/reports.mjs";
import { globalChannelId } from "../src/channels.mjs";

let db, reports;

async function player(id) { await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [id]); }

async function message(id, senderId, content) {
  const r = await db.query(
    "INSERT INTO chat_message (channel_id, sender_id, content, client_message_id) VALUES ($1,$2,$3,$4) RETURNING id",
    [globalChannelId(), senderId, content, id]
  );
  return r.rows[0].id;
}

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  reports = createReportService(db);
});

after(async () => { await db.close?.(); });

describe("reportMessage", () => {
  test("a valid report is recorded, subject derived from the REAL message row, not client-supplied", async () => {
    await player("sender1"); await player("reporter1");
    const messageId = await message("m1", "sender1", "spam link here");
    const r = await reports.reportMessage({ reporterId: "reporter1", messageId, category: ChatReportCategory.SPAM, reason: "obvious spam" });
    assert.equal(r.ok, true);
    const row = await db.query("SELECT subject_player_id, content_type, category, message_id, status FROM content_report WHERE id = $1", [r.reportId]);
    assert.equal(row.rows[0].subject_player_id, "sender1");
    assert.equal(row.rows[0].content_type, "CHAT_MESSAGE");
    assert.equal(row.rows[0].category, "SPAM");
    assert.equal(String(row.rows[0].message_id), String(messageId));
    assert.equal(row.rows[0].status, "OPEN");
  });

  test("a player cannot report their own message", async () => {
    await player("sender2");
    const messageId = await message("m2", "sender2", "my own message");
    const r = await reports.reportMessage({ reporterId: "sender2", messageId, category: ChatReportCategory.OTHER, reason: null });
    assert.equal(r.ok, false);
    assert.equal(r.reason, ReportError.CANNOT_REPORT_SELF);
  });

  test("reporting a nonexistent message is refused cleanly", async () => {
    await player("reporter2");
    const r = await reports.reportMessage({ reporterId: "reporter2", messageId: "999999999", category: ChatReportCategory.SPAM, reason: null });
    assert.equal(r.ok, false);
    assert.equal(r.reason, ReportError.NOT_FOUND);
  });

  test("an invalid category is refused", async () => {
    await player("sender3"); await player("reporter3");
    const messageId = await message("m3", "sender3", "x");
    const r = await reports.reportMessage({ reporterId: "reporter3", messageId, category: "NOT_A_REAL_CATEGORY", reason: null });
    assert.equal(r.ok, false);
    assert.equal(r.reason, ReportError.INVALID_CATEGORY);
  });
});

describe("reportPlayer", () => {
  test("a valid player report is recorded", async () => {
    await player("target1"); await player("reporter4");
    const r = await reports.reportPlayer({ reporterId: "reporter4", subjectPlayerId: "target1", category: ChatReportCategory.HARASSMENT, reason: "repeated DMs" });
    assert.equal(r.ok, true);
    const row = await db.query("SELECT content_type, category FROM content_report WHERE id = $1", [r.reportId]);
    assert.equal(row.rows[0].content_type, "PLAYER");
    assert.equal(row.rows[0].category, "HARASSMENT");
  });

  test("a player cannot report themselves", async () => {
    await player("self2");
    const r = await reports.reportPlayer({ reporterId: "self2", subjectPlayerId: "self2", category: ChatReportCategory.OTHER, reason: null });
    assert.equal(r.ok, false);
    assert.equal(r.reason, ReportError.CANNOT_REPORT_SELF);
  });
});

describe("listQueue / reviewReport", () => {
  test("the queue lists only OPEN chat/player reports, newest first", async () => {
    await player("sender4"); await player("reporter5");
    const messageId = await message("m4", "sender4", "queue test");
    await reports.reportMessage({ reporterId: "reporter5", messageId, category: ChatReportCategory.ABUSE, reason: null });
    const queue = await reports.listQueue();
    assert.ok(queue.length >= 1);
    assert.ok(queue.every((r) => r.status === "OPEN"));
  });

  test("reviewing a report moves it out of the OPEN queue", async () => {
    await player("sender5"); await player("reporter6");
    const messageId = await message("m5", "sender5", "review test");
    const created = await reports.reportMessage({ reporterId: "reporter6", messageId, category: ChatReportCategory.THREATS, reason: null });
    const before = (await reports.listQueue()).length;
    const reviewed = await reports.reviewReport({ reportId: created.reportId, status: "REVIEWED" });
    assert.equal(reviewed.ok, true);
    const after = (await reports.listQueue()).length;
    assert.equal(after, before - 1);
  });

  test("reviewing a nonexistent report is refused cleanly", async () => {
    const r = await reports.reviewReport({ reportId: "does-not-exist", status: "REVIEWED" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, ReportError.NOT_FOUND);
  });
});
