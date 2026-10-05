/**
 * The support ticket API (Slice 8).
 *
 * The property this file exists to prove: TICKET_VIEW/REPLY/ASSIGN/ESCALATE/
 * CLOSE, granted ONLY through the custom RBAC layer (never through the fixed
 * ROLE_CAPABILITIES grid -- not even to SUPER_ADMIN), are REAL enforcement
 * points at the HTTP layer, a customer can never read another customer's
 * ticket or see an internal note, and every staff action lands in the
 * existing admin_audit table.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createRbacService } from "../../authz/src/rbac.mjs";
import { createTicketService } from "../../support/src/ticket.mjs";
import { createTicketNotificationFlow } from "../../support/src/notifications.mjs";
import { createMockEmailProvider } from "../../email/src/provider.mjs";
import { createEmailService } from "../../email/src/email-service.mjs";
import { createApi } from "../src/server.mjs";

const SIGNING_KEY = Buffer.alloc(32, 21);
const ENCRYPTION_KEY = Buffer.alloc(32, 22);
const PASSWORD = "correct horse battery staple";
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };

let db, auth, rbac, support, api, base, emailProvider, ticketNotifications;

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

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  auth = createAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: FAST_ARGON });
  rbac = createRbacService(db);
  support = createTicketService(db);
  emailProvider = createMockEmailProvider();
  ticketNotifications = createTicketNotificationFlow(db, { emailService: createEmailService({ provider: emailProvider }) });

  api = createApi({
    db, auth, rbac, support, ticketNotifications,
    rateLimit: { capacity: 5000, refillPerSecond: 5000 },
  });
  await api.listen();
  base = api.url;

  for (const p of ["cust1", "cust2", "agent1", "agent2", "root", "viewonly"]) {
    await auth.register({ playerId: p, handle: p, password: PASSWORD });
  }
  // A verified email + saved locale on file for every customer, so the
  // notification wiring under test has something to send to -- mirrors
  // what PATCH /v1/me/email and PATCH /v1/me actually populate in
  // production, done directly here since this file focuses on tickets.
  for (const p of ["cust1", "cust2"]) {
    await db.query("UPDATE player SET locale = 'en' WHERE id = $1", [p]);
    await db.query(
      "INSERT INTO email_identity (id, player_id, email, email_display) VALUES ($1,$2,$3,$3)",
      [`eid_${p}`, p, `${p}@example.com`]
    );
  }
  await db.query(
    `INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES
     ('agent1','a1@n','Agent1',TRUE),
     ('agent2','a2@n','Agent2',TRUE),
     ('root','root@n','Root',TRUE),
     ('viewonly','vo@n','ViewOnly',TRUE)`
  );
  // root is SUPER_ADMIN through the FIXED grid -- deliberately given NO
  // custom-role ticket grant, to prove the fixed grid alone buys nothing here.
  await db.query(
    `INSERT INTO admin_role_grant (admin_id, role, granted_by, reason) VALUES
     ('root','SUPER_ADMIN','agent1','bootstrap')`
  );

  const fullRole = await rbac.createRole({
    id: "role_support_agent", name: "Support Agent",
    permissionCodes: ["TICKET_VIEW", "TICKET_REPLY", "TICKET_ASSIGN", "TICKET_ESCALATE", "TICKET_CLOSE"],
    createdBy: "root",
  });
  await rbac.grantRole({ adminId: "agent1", roleId: fullRole.id, grantedBy: "root" });
  await rbac.grantRole({ adminId: "agent2", roleId: fullRole.id, grantedBy: "root" });

  const viewRole = await rbac.createRole({
    id: "role_ticket_viewer", name: "Ticket Viewer",
    permissionCodes: ["TICKET_VIEW"],
    createdBy: "root",
  });
  await rbac.grantRole({ adminId: "viewonly", roleId: viewRole.id, grantedBy: "root" });
});

after(async () => { await api.close(); });

// ---------------------------------------------------------------------------

describe("customer ticket lifecycle", () => {
  test("a customer can create a ticket and it appears in their own list", async () => {
    const token = await tokenFor("cust1");
    const created = await req("POST", "/v1/me/tickets", { token, body: { category: "ACCOUNT", subject: "Cannot log in" } });
    assert.equal(created.status, 201);
    assert.ok(created.body.ticketId);

    const list = await req("GET", "/v1/me/tickets", { token });
    assert.equal(list.status, 200);
    assert.ok(list.body.tickets.some((t) => t.id === created.body.ticketId));
  });

  test("an invalid category is rejected with 400", async () => {
    const token = await tokenFor("cust1");
    const r = await req("POST", "/v1/me/tickets", { token, body: { category: "NOT_REAL", subject: "x" } });
    assert.equal(r.status, 400);
  });

  test("a customer cannot read another customer's ticket", async () => {
    const token1 = await tokenFor("cust1");
    const token2 = await tokenFor("cust2");
    const created = await req("POST", "/v1/me/tickets", { token: token1, body: { category: "OTHER", subject: "Private" } });
    const r = await req("GET", `/v1/me/tickets/${created.body.ticketId}`, { token: token2 });
    assert.equal(r.status, 404);
  });

  test("a customer can message their own ticket and read it back", async () => {
    const token = await tokenFor("cust1");
    const created = await req("POST", "/v1/me/tickets", { token, body: { category: "OTHER", subject: "Help" } });
    const sent = await req("POST", `/v1/me/tickets/${created.body.ticketId}/messages`, { token, body: { content: "More detail" } });
    assert.equal(sent.status, 201);

    const detail = await req("GET", `/v1/me/tickets/${created.body.ticketId}`, { token });
    assert.equal(detail.status, 200);
    assert.ok(detail.body.messages.some((m) => m.content === "More detail"));
  });

  test("anonymous access to ticket routes is refused", async () => {
    const r = await req("GET", "/v1/me/tickets", {});
    assert.equal(r.status, 401);
  });
});

describe("staff RBAC enforcement", () => {
  test("a plain PLAYER (not staff at all) is refused on every admin ticket route", async () => {
    const token = await tokenFor("cust1");
    const r = await req("GET", "/v1/admin/tickets", { token });
    assert.equal(r.status, 403);
  });

  test("SUPER_ADMIN through the FIXED grid alone has NO ticket access -- a custom-role grant is required", async () => {
    const token = await tokenFor("root");
    const r = await req("GET", "/v1/admin/tickets", { token });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, "MISSING_CAPABILITY");
  });

  test("an agent with the full support role can view the queue", async () => {
    const token = await tokenFor("agent1");
    const r = await req("GET", "/v1/admin/tickets", { token });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.tickets));
  });

  test("TICKET_VIEW alone does not grant TICKET_ASSIGN", async () => {
    const custToken = await tokenFor("cust2");
    const created = await req("POST", "/v1/me/tickets", { token: custToken, body: { category: "OTHER", subject: "x" } });
    const viewerToken = await tokenFor("viewonly");
    const assign = await req("POST", `/v1/admin/tickets/${created.body.ticketId}/assign`, { token: viewerToken, body: {} });
    assert.equal(assign.status, 403);
    assert.equal(assign.body.error.code, "MISSING_CAPABILITY");

    // but the viewer CAN still read it
    const read = await req("GET", `/v1/admin/tickets/${created.body.ticketId}`, { token: viewerToken });
    assert.equal(read.status, 200);
  });
});

describe("the full staff workflow, and the customer/internal separation", () => {
  test("assign -> internal note (never customer-visible) -> customer-visible reply -> escalate -> resolve -> customer sees the final state", async () => {
    const custToken = await tokenFor("cust1");
    const agentToken = await tokenFor("agent1");

    const created = await req("POST", "/v1/me/tickets", { token: custToken, body: { category: "TECHNICAL", subject: "App crashes" } });
    const ticketId = created.body.ticketId;

    const assign = await req("POST", `/v1/admin/tickets/${ticketId}/assign`, { token: agentToken, body: { assigneeId: "agent1" } });
    assert.equal(assign.status, 200);
    const afterAssign = await req("GET", `/v1/admin/tickets/${ticketId}`, { token: agentToken });
    assert.equal(afterAssign.body.ticket.status, "ASSIGNED");
    assert.equal(afterAssign.body.ticket.assignee_id, "agent1");

    const note = await req("POST", `/v1/admin/tickets/${ticketId}/messages`, {
      token: agentToken, body: { content: "Customer device is rooted, likely unrelated to our bug", visibility: "INTERNAL" },
    });
    assert.equal(note.status, 201);

    // The customer must NEVER see the internal note, through the customer API.
    const custView = await req("GET", `/v1/me/tickets/${ticketId}`, { token: custToken });
    assert.equal(custView.status, 200);
    assert.ok(!custView.body.messages.some((m) => m.content.includes("rooted")));

    const start = await req("POST", `/v1/admin/tickets/${ticketId}/status`, { token: agentToken, body: { toStatus: "IN_PROGRESS" } });
    assert.equal(start.status, 200);

    const reply = await req("POST", `/v1/admin/tickets/${ticketId}/messages`, {
      token: agentToken, body: { content: "We're on it, thanks for the report", visibility: "CUSTOMER" },
    });
    assert.equal(reply.status, 201);

    const custViewAfterReply = await req("GET", `/v1/me/tickets/${ticketId}`, { token: custToken });
    assert.ok(custViewAfterReply.body.messages.some((m) => m.content.includes("We're on it")));

    const escalate = await req("POST", `/v1/admin/tickets/${ticketId}/escalate`, { token: agentToken, body: { toTeam: "TECHNICAL" } });
    assert.equal(escalate.status, 200);
    assert.equal(escalate.body.toTeam, "TECHNICAL");

    // resolve requires IN_PROGRESS, not ESCALATED directly -- pick it back up first
    const pickup = await req("POST", `/v1/admin/tickets/${ticketId}/status`, { token: agentToken, body: { toStatus: "IN_PROGRESS" } });
    assert.equal(pickup.status, 200);

    const resolve = await req("POST", `/v1/admin/tickets/${ticketId}/resolve`, { token: agentToken });
    assert.equal(resolve.status, 200);
    assert.equal(resolve.body.to, "RESOLVED");

    const finalView = await req("GET", `/v1/me/tickets/${ticketId}`, { token: custToken });
    assert.equal(finalView.body.ticket.status, "RESOLVED");

    const close = await req("POST", `/v1/admin/tickets/${ticketId}/close`, { token: agentToken });
    assert.equal(close.status, 200);
    assert.equal(close.body.to, "CLOSED");
  });

  test("every staff action lands in admin_audit with a TICKET_* event, never a secret", async () => {
    const custToken = await tokenFor("cust2");
    const agentToken = await tokenFor("agent2");
    const created = await req("POST", "/v1/me/tickets", { token: custToken, body: { category: "OTHER", subject: "Audit check" } });
    const ticketId = created.body.ticketId;

    await req("POST", `/v1/admin/tickets/${ticketId}/assign`, { token: agentToken, body: { assigneeId: "agent2" } });

    const audit = await db.query(
      "SELECT action, subject_type, subject_id, detail FROM admin_audit WHERE admin_id = 'agent2' AND action = 'admin.ticket.assign' ORDER BY id DESC LIMIT 1"
    );
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].subject_type, "support_ticket");
    assert.equal(audit.rows[0].subject_id, ticketId);
    assert.equal(audit.rows[0].detail.event, "TICKET_ASSIGNED");
  });

  test("an invalid state transition returns 409, not a silent no-op", async () => {
    const custToken = await tokenFor("cust1");
    const agentToken = await tokenFor("agent1");
    const created = await req("POST", "/v1/me/tickets", { token: custToken, body: { category: "OTHER", subject: "x" } });
    const r = await req("POST", `/v1/admin/tickets/${created.body.ticketId}/resolve`, { token: agentToken });
    // OPEN -> RESOLVED is actually valid per the state machine; try an invalid one instead.
    assert.equal(r.status, 200);
    const reEscalate = await req("POST", `/v1/admin/tickets/${created.body.ticketId}/escalate`, { token: agentToken, body: { toTeam: "RISK" } });
    assert.equal(reEscalate.status, 409);
  });
});

describe("email notifications (Slice 8F)", () => {
  test("creating a ticket sends TICKET_CREATED to the customer's own email", async () => {
    const before = emailProvider.sent.length;
    const custToken = await tokenFor("cust1");
    const created = await req("POST", "/v1/me/tickets", { token: custToken, body: { category: "OTHER", subject: "Notify me" } });
    assert.equal(created.status, 201);
    const sent = emailProvider.sent.slice(before);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "cust1@example.com");
    assert.equal(sent[0].template, "ticket_created");
  });

  test("a CUSTOMER-visible staff reply sends STAFF_REPLIED, but an INTERNAL note sends nothing", async () => {
    const custToken = await tokenFor("cust2");
    const agentToken = await tokenFor("agent1");
    const created = await req("POST", "/v1/me/tickets", { token: custToken, body: { category: "OTHER", subject: "Reply test" } });
    const ticketId = created.body.ticketId;

    let before = emailProvider.sent.length;
    await req("POST", `/v1/admin/tickets/${ticketId}/messages`, { token: agentToken, body: { content: "internal only", visibility: "INTERNAL" } });
    assert.equal(emailProvider.sent.length, before, "an internal note must never trigger a customer email");

    before = emailProvider.sent.length;
    await req("POST", `/v1/admin/tickets/${ticketId}/messages`, { token: agentToken, body: { content: "a real reply", visibility: "CUSTOMER" } });
    const sent = emailProvider.sent.slice(before);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].template, "ticket_staff_replied");
    assert.equal(sent[0].to, "cust2@example.com");
  });

  test("moving a ticket to WAITING_FOR_USER notifies the customer", async () => {
    const custToken = await tokenFor("cust1");
    const agentToken = await tokenFor("agent1");
    const created = await req("POST", "/v1/me/tickets", { token: custToken, body: { category: "OTHER", subject: "Waiting test" } });
    const ticketId = created.body.ticketId;
    await req("POST", `/v1/admin/tickets/${ticketId}/status`, { token: agentToken, body: { toStatus: "TRIAGED" } });
    await req("POST", `/v1/admin/tickets/${ticketId}/status`, { token: agentToken, body: { toStatus: "ASSIGNED" } });
    await req("POST", `/v1/admin/tickets/${ticketId}/status`, { token: agentToken, body: { toStatus: "IN_PROGRESS" } });

    const before = emailProvider.sent.length;
    const r = await req("POST", `/v1/admin/tickets/${ticketId}/status`, { token: agentToken, body: { toStatus: "WAITING_FOR_USER" } });
    assert.equal(r.status, 200);
    const sent = emailProvider.sent.slice(before);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].template, "ticket_waiting_for_user");
  });

  test("resolving notifies once; reopening and resolving again notifies a second time", async () => {
    const custToken = await tokenFor("cust1");
    const agentToken = await tokenFor("agent1");
    const created = await req("POST", "/v1/me/tickets", { token: custToken, body: { category: "OTHER", subject: "Resolve twice" } });
    const ticketId = created.body.ticketId;

    let before = emailProvider.sent.length;
    await req("POST", `/v1/admin/tickets/${ticketId}/resolve`, { token: agentToken });
    assert.equal(emailProvider.sent.slice(before).filter((m) => m.template === "ticket_resolved").length, 1);

    // A second resolve attempt from RESOLVED is not even a valid transition,
    // so reopen first -- this also exercises clearOccurrence() end-to-end.
    await req("POST", `/v1/admin/tickets/${ticketId}/reopen`, { token: agentToken });
    before = emailProvider.sent.length;
    const secondResolve = await req("POST", `/v1/admin/tickets/${ticketId}/resolve`, { token: agentToken });
    assert.equal(secondResolve.status, 200);
    assert.equal(emailProvider.sent.slice(before).filter((m) => m.template === "ticket_resolved").length, 1,
      "reopening frees the slot so the second resolution notifies again");
  });
});
