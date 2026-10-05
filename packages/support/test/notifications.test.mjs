/**
 * Idempotent ticket notifications (notifications.mjs, backed by
 * support_ticket_notification_sent, migration 0022). The property under
 * test: no matter how many times notify() is called for the same logical
 * event, at most one email actually goes out -- and a ticket-level
 * notification's slot can be freed on reopen so a genuinely NEW episode can
 * notify again.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createMockEmailProvider } from "../../email/src/provider.mjs";
import { createEmailService } from "../../email/src/email-service.mjs";
import { createTicketNotificationFlow } from "../src/notifications.mjs";
import { createTicketService } from "../src/ticket.mjs";

let db, provider, notifications, tickets;

async function player(id, handle = id) {
  await db.query("INSERT INTO player (id, handle) VALUES ($1,$2)", [id, handle]);
}

async function agent(id) {
  await player(id);
  await db.query("INSERT INTO admin_user (id, email, display_name, mfa_enrolled) VALUES ($1,$1,$1,TRUE)", [id]);
}

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  provider = createMockEmailProvider();
  notifications = createTicketNotificationFlow(db, { emailService: createEmailService({ provider }) });
  tickets = createTicketService(db);
});

after(async () => { await db.close?.(); });

describe("notify", () => {
  test("the first call for a ticket-level notification actually sends", async () => {
    await player("cust1");
    const created = await tickets.createTicket({ playerId: "cust1", category: "OTHER", subject: "Help" });
    const r = await notifications.notify({
      ticketId: created.ticketId, notification: "TICKET_CREATED",
      email: "cust1@example.com", locale: "en", subject: "Help",
    });
    assert.equal(r.ok, true);
    assert.equal(r.alreadySent, undefined);
    assert.equal(provider.sent.length, 1);
    assert.equal(provider.sent[0].template, "ticket_created");
  });

  test("a second call for the SAME ticket+notification is a silent no-op", async () => {
    await player("cust2");
    const created = await tickets.createTicket({ playerId: "cust2", category: "OTHER", subject: "Help" });
    const before = provider.sent.length;
    await notifications.notify({ ticketId: created.ticketId, notification: "TICKET_CREATED", email: "cust2@example.com", locale: "en", subject: "Help" });
    const r = await notifications.notify({ ticketId: created.ticketId, notification: "TICKET_CREATED", email: "cust2@example.com", locale: "en", subject: "Help" });
    assert.equal(r.ok, true);
    assert.equal(r.alreadySent, true);
    assert.equal(provider.sent.length, before + 1, "no additional email was sent");
  });

  test("concurrent calls for the same new ticket+notification still send exactly once", async () => {
    await player("cust3");
    const created = await tickets.createTicket({ playerId: "cust3", category: "OTHER", subject: "Help" });
    const before = provider.sent.length;
    const results = await Promise.all([
      notifications.notify({ ticketId: created.ticketId, notification: "TICKET_RESOLVED", email: "cust3@example.com", locale: "en", subject: "Help" }),
      notifications.notify({ ticketId: created.ticketId, notification: "TICKET_RESOLVED", email: "cust3@example.com", locale: "en", subject: "Help" }),
      notifications.notify({ ticketId: created.ticketId, notification: "TICKET_RESOLVED", email: "cust3@example.com", locale: "en", subject: "Help" }),
    ]);
    assert.ok(results.every((r) => r.ok));
    assert.equal(results.filter((r) => !r.alreadySent).length, 1, "exactly one of the three actually sent");
    assert.equal(provider.sent.length - before, 1);
  });

  test("TWO DIFFERENT staff replies (two distinct messageIds) each notify -- message-scoped, not ticket-scoped", async () => {
    await player("cust4");
    await agent("agent4");
    const created = await tickets.createTicket({ playerId: "cust4", category: "OTHER", subject: "Help" });
    const reply1 = await tickets.sendStaffMessage({ ticketId: created.ticketId, staffId: "agent4", content: "first reply", visibility: "CUSTOMER" });
    const reply2 = await tickets.sendStaffMessage({ ticketId: created.ticketId, staffId: "agent4", content: "second reply", visibility: "CUSTOMER" });
    const before = provider.sent.length;
    await notifications.notify({ ticketId: created.ticketId, notification: "STAFF_REPLIED", messageId: reply1.messageId, email: "cust4@example.com", locale: "en", subject: "Help" });
    await notifications.notify({ ticketId: created.ticketId, notification: "STAFF_REPLIED", messageId: reply2.messageId, email: "cust4@example.com", locale: "en", subject: "Help" });
    assert.equal(provider.sent.length - before, 2, "each distinct reply gets its own email");
  });

  test("the SAME messageId retried is a no-op, not a second email for that reply", async () => {
    await player("cust5");
    await agent("agent5");
    const created = await tickets.createTicket({ playerId: "cust5", category: "OTHER", subject: "Help" });
    const reply = await tickets.sendStaffMessage({ ticketId: created.ticketId, staffId: "agent5", content: "a reply", visibility: "CUSTOMER" });
    const before = provider.sent.length;
    await notifications.notify({ ticketId: created.ticketId, notification: "STAFF_REPLIED", messageId: reply.messageId, email: "cust5@example.com", locale: "en", subject: "Help" });
    await notifications.notify({ ticketId: created.ticketId, notification: "STAFF_REPLIED", messageId: reply.messageId, email: "cust5@example.com", locale: "en", subject: "Help" });
    assert.equal(provider.sent.length - before, 1);
  });

  test("no email address on file is a silent, successful skip, never a thrown error", async () => {
    await player("cust6");
    const created = await tickets.createTicket({ playerId: "cust6", category: "OTHER", subject: "Help" });
    const before = provider.sent.length;
    const r = await notifications.notify({ ticketId: created.ticketId, notification: "TICKET_CREATED", email: null, locale: "en", subject: "Help" });
    assert.equal(r.ok, true);
    assert.equal(r.skipped, "NO_EMAIL_ON_FILE");
    assert.equal(provider.sent.length, before);
  });

  test("never sends for an internal note or a routine status move -- only the four named notifications exist", async () => {
    await player("cust7");
    const created = await tickets.createTicket({ playerId: "cust7", category: "OTHER", subject: "Help" });
    await assert.rejects(
      () => notifications.notify({ ticketId: created.ticketId, notification: "INTERNAL_NOTE_ADDED", email: "cust7@example.com", locale: "en", subject: "Help" })
    );
  });

  test("a ticket-level notification's HTML never leaks the raw ticket subject as markup", async () => {
    await player("cust8");
    const created = await tickets.createTicket({ playerId: "cust8", category: "OTHER", subject: '<img src=x onerror=alert(1)>' });
    await notifications.notify({ ticketId: created.ticketId, notification: "TICKET_CREATED", email: "cust8@example.com", locale: "en", subject: '<img src=x onerror=alert(1)>' });
    const sent = provider.sent.at(-1);
    assert.ok(!sent.html.includes("<img src=x"), "the raw tag must not appear unescaped in the email HTML");
    assert.ok(sent.html.includes("&lt;img"), "the escaped form should be present instead");
  });
});

describe("clearOccurrence", () => {
  test("freeing the slot lets a reopened ticket's resolution notify again", async () => {
    await player("cust9");
    const created = await tickets.createTicket({ playerId: "cust9", category: "OTHER", subject: "Help" });
    const before = provider.sent.length;

    await notifications.notify({ ticketId: created.ticketId, notification: "TICKET_RESOLVED", email: "cust9@example.com", locale: "en", subject: "Help" });
    assert.equal(provider.sent.length, before + 1);

    // A second resolve without clearing is a no-op, as usual.
    await notifications.notify({ ticketId: created.ticketId, notification: "TICKET_RESOLVED", email: "cust9@example.com", locale: "en", subject: "Help" });
    assert.equal(provider.sent.length, before + 1);

    await notifications.clearOccurrence({ ticketId: created.ticketId, notification: "TICKET_RESOLVED" });
    await notifications.notify({ ticketId: created.ticketId, notification: "TICKET_RESOLVED", email: "cust9@example.com", locale: "en", subject: "Help" });
    assert.equal(provider.sent.length, before + 2, "the freed slot allows a genuinely new episode to notify again");
  });
});
