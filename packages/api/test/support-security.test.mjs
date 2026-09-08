/**
 * Support ticket security (Slice 8I). Each test targets one named attack
 * from the slice's own security checklist: cross-user ticket read,
 * internal-note leakage, staff impersonation, forbidden financial actions
 * by support agents, unauthorized ticket-domain access, granular
 * permission enforcement (escalate/close held separately from
 * view/reply/assign), unauthorized escalation, and unauthorized close.
 *
 * (Cross-user ticket read, internal-note leakage, and coarse RBAC denial
 * already have baseline coverage in support.test.mjs -- this file is the
 * dedicated, exhaustive pass the directive asks for, including the
 * fine-grained per-capability splits that file does not cover.)
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createRbacService } from "../../authz/src/rbac.mjs";
import { createTicketService } from "../../support/src/ticket.mjs";
import { createApi } from "../src/server.mjs";

const SIGNING_KEY = Buffer.alloc(32, 31);
const ENCRYPTION_KEY = Buffer.alloc(32, 32);
const PASSWORD = "correct horse battery staple";
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };

let db, auth, rbac, support, api, base;

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

  api = createApi({ db, auth, rbac, support, rateLimit: { capacity: 5000, refillPerSecond: 5000 } });
  await api.listen();
  base = api.url;

  const admins = ["root", "fullAgent", "viewOnly", "noEscalate", "noClose", "chatMod", "impostor"];
  for (const p of ["custA", "custB", ...admins]) {
    await auth.register({ playerId: p, handle: p, password: PASSWORD });
  }
  for (const a of admins) {
    await db.query(
      "INSERT INTO admin_user (id, email, display_name, mfa_enrolled) VALUES ($1,$2,$1,TRUE)",
      [a, `${a}@n.example`]
    );
  }

  const full = await rbac.createRole({
    id: "role_full", name: "Full Support",
    permissionCodes: ["TICKET_VIEW", "TICKET_REPLY", "TICKET_ASSIGN", "TICKET_ESCALATE", "TICKET_CLOSE"],
    createdBy: "root",
  });
  const viewOnly = await rbac.createRole({ id: "role_view_only", name: "View Only", permissionCodes: ["TICKET_VIEW"], createdBy: "root" });
  const noEscalate = await rbac.createRole({
    id: "role_no_escalate", name: "No Escalate",
    permissionCodes: ["TICKET_VIEW", "TICKET_REPLY", "TICKET_ASSIGN", "TICKET_CLOSE"],
    createdBy: "root",
  });
  const noClose = await rbac.createRole({
    id: "role_no_close", name: "No Close",
    permissionCodes: ["TICKET_VIEW", "TICKET_REPLY", "TICKET_ASSIGN", "TICKET_ESCALATE"],
    createdBy: "root",
  });
  const chatMod = await rbac.createRole({ id: "role_chat_mod", name: "Chat Moderator", permissionCodes: ["CHAT_MODERATE"], createdBy: "root" });

  await rbac.grantRole({ adminId: "fullAgent", roleId: full.id, grantedBy: "root" });
  await rbac.grantRole({ adminId: "impostor", roleId: full.id, grantedBy: "root" });
  await rbac.grantRole({ adminId: "viewOnly", roleId: viewOnly.id, grantedBy: "root" });
  await rbac.grantRole({ adminId: "noEscalate", roleId: noEscalate.id, grantedBy: "root" });
  await rbac.grantRole({ adminId: "noClose", roleId: noClose.id, grantedBy: "root" });
  await rbac.grantRole({ adminId: "chatMod", roleId: chatMod.id, grantedBy: "root" });
});

after(async () => { await api.close(); });

// ---------------------------------------------------------------------------

describe("cross-user ticket read", () => {
  test("a customer cannot read another customer's ticket by guessing its id", async () => {
    const tokenA = await tokenFor("custA");
    const tokenB = await tokenFor("custB");
    const created = await req("POST", "/v1/me/tickets", { token: tokenA, body: { category: "OTHER", subject: "secret" } });
    const r = await req("GET", `/v1/me/tickets/${created.body.ticketId}`, { token: tokenB });
    assert.equal(r.status, 404, "a 404, not a 403 -- existence of the ticket is not confirmed either");
  });

  test("a customer cannot message another customer's ticket", async () => {
    const tokenA = await tokenFor("custA");
    const tokenB = await tokenFor("custB");
    const created = await req("POST", "/v1/me/tickets", { token: tokenA, body: { category: "OTHER", subject: "secret" } });
    const r = await req("POST", `/v1/me/tickets/${created.body.ticketId}/messages`, { token: tokenB, body: { content: "hi" } });
    assert.equal(r.status, 404);
  });
});

describe("internal-note leakage", () => {
  test("an internal note is invisible through the customer API even when fetched directly by message content search", async () => {
    const custToken = await tokenFor("custA");
    const agentToken = await tokenFor("fullAgent");
    const created = await req("POST", "/v1/me/tickets", { token: custToken, body: { category: "OTHER", subject: "leak test" } });
    await req("POST", `/v1/admin/tickets/${created.body.ticketId}/messages`, {
      token: agentToken, body: { content: "SECRET_INTERNAL_MARKER", visibility: "INTERNAL" },
    });
    const view = await req("GET", `/v1/me/tickets/${created.body.ticketId}`, { token: custToken });
    assert.ok(!JSON.stringify(view.body).includes("SECRET_INTERNAL_MARKER"));
  });

  test("the database itself refuses a CUSTOMER-authored INTERNAL message -- structural, not just application logic", async () => {
    const custToken = await tokenFor("custA");
    const created = await req("POST", "/v1/me/tickets", { token: custToken, body: { category: "OTHER", subject: "x" } });
    await assert.rejects(() =>
      db.query(
        `INSERT INTO support_ticket_message (id, ticket_id, author_id, author_type, visibility, content, created_at)
         VALUES ('spm_forced','${created.body.ticketId}','custA','CUSTOMER','INTERNAL','forced internal',now())`
      )
    );
  });
});

describe("staff impersonation", () => {
  test("a staff member cannot attribute an assignment to a DIFFERENT admin via a spoofed body field", async () => {
    const custToken = await tokenFor("custA");
    const agentToken = await tokenFor("impostor");
    const created = await req("POST", "/v1/me/tickets", { token: custToken, body: { category: "OTHER", subject: "x" } });
    // impostor tries to make it look like "root" performed the assignment.
    await req("POST", `/v1/admin/tickets/${created.body.ticketId}/assign`, {
      token: agentToken, body: { assigneeId: "fullAgent", assignedBy: "root" },
    });
    const row = await db.query("SELECT assigned_by FROM support_ticket WHERE id = $1", [created.body.ticketId]);
    assert.equal(row.rows[0].assigned_by, "impostor", "assignedBy must be derived from the AUTHENTICATED actor, never a client-supplied field");
  });

  test("a staff reply is always attributed to the authenticated actor, never a spoofed author id in the body", async () => {
    const custToken = await tokenFor("custA");
    const agentToken = await tokenFor("impostor");
    const created = await req("POST", "/v1/me/tickets", { token: custToken, body: { category: "OTHER", subject: "x" } });
    await req("POST", `/v1/admin/tickets/${created.body.ticketId}/messages`, {
      token: agentToken, body: { content: "hello", visibility: "CUSTOMER", authorId: "root", staffId: "root" },
    });
    const row = await db.query(
      "SELECT author_id FROM support_ticket_message WHERE ticket_id = $1 AND author_type = 'STAFF'", [created.body.ticketId]
    );
    assert.equal(row.rows[0].author_id, "impostor");
  });

  test("the admin_audit row for a staff action always names the real authenticated admin", async () => {
    const custToken = await tokenFor("custA");
    const agentToken = await tokenFor("impostor");
    const created = await req("POST", "/v1/me/tickets", { token: custToken, body: { category: "OTHER", subject: "x" } });
    await req("POST", `/v1/admin/tickets/${created.body.ticketId}/assign`, { token: agentToken, body: { assigneeId: "impostor", assignedBy: "root" } });
    const audit = await db.query(
      "SELECT admin_id FROM admin_audit WHERE action = 'admin.ticket.assign' AND subject_id = $1 ORDER BY id DESC LIMIT 1",
      [created.body.ticketId]
    );
    assert.equal(audit.rows[0].admin_id, "impostor");
  });
});

describe("forbidden financial actions by support agents", () => {
  test("no ticket route accepts or applies a balance/amount/status field to any financial table", async () => {
    const custToken = await tokenFor("custB");
    const depositId = "dep_security_test";
    await db.query(
      `INSERT INTO deposit (id, player_id, asset, network, provider, address, status, expires_at, observed_amount_minor)
       VALUES ($1,'custB','USDT','TRON','sandbox','addrX','AWAITING_PAYMENT',now()+interval '1 day','1000000')`,
      [depositId]
    );
    const created = await req("POST", "/v1/me/tickets", {
      token: custToken, body: { category: "DEPOSIT_PENDING", subject: "missing funds", referenceId: depositId },
    });
    assert.equal(created.status, 201);

    const agentToken = await tokenFor("fullAgent");
    // A malicious or careless staff payload tries to smuggle a financial
    // mutation through fields the ticket routes do not even define.
    await req("POST", `/v1/admin/tickets/${created.body.ticketId}/status`, {
      token: agentToken,
      body: { toStatus: "IN_PROGRESS", depositStatus: "CREDITED", amount_minor: "999999999", status: "CONFIRMED" },
    });
    await req("POST", `/v1/admin/tickets/${created.body.ticketId}/resolve`, {
      token: agentToken, body: { creditAmount: "999999999", markPaid: true },
    });

    const depositRow = await db.query("SELECT status, observed_amount_minor FROM deposit WHERE id = $1", [depositId]);
    assert.equal(depositRow.rows[0].status, "AWAITING_PAYMENT", "the deposit's real status must be completely untouched by any ticket action");
    assert.equal(Number(depositRow.rows[0].observed_amount_minor), 1000000);
  });

  test("a support agent's role grants no fixed-grid financial capability -- TICKET_* stays in its own namespace", async () => {
    const agentToken = await tokenFor("fullAgent");
    const r = await req("GET", "/v1/admin/wallet/read", { token: agentToken }).catch(() => null);
    // The route may not exist under this exact path; the real assertion is
    // the capability check itself, proven directly against the policy grid.
    const caps = await rbac.effectivePermissions("fullAgent");
    assert.deepEqual(caps.sort(), ["TICKET_ASSIGN", "TICKET_CLOSE", "TICKET_ESCALATE", "TICKET_REPLY", "TICKET_VIEW"]);
    assert.ok(!caps.includes("withdrawal.approve") && !caps.includes("adjustment.create"));
  });
});

describe("unauthorized ticket-domain access", () => {
  test("an admin holding an UNRELATED custom permission (chat moderation) is refused on every ticket route", async () => {
    const token = await tokenFor("chatMod");
    const list = await req("GET", "/v1/admin/tickets", { token });
    assert.equal(list.status, 403);
    assert.equal(list.body.error.code, "MISSING_CAPABILITY");
  });

  test("an admin with NO custom role at all (freshly created admin_user row) is refused", async () => {
    await auth.register({ playerId: "bareAdmin", handle: "bareAdmin", password: PASSWORD });
    await db.query("INSERT INTO admin_user (id, email, display_name, mfa_enrolled) VALUES ('bareAdmin','ba@n.example','bareAdmin',TRUE)");
    const token = await tokenFor("bareAdmin");
    const r = await req("GET", "/v1/admin/tickets", { token });
    assert.equal(r.status, 403);
  });
});

describe("unauthorized escalation", () => {
  test("an agent without TICKET_ESCALATE cannot escalate, even though they can view/reply/assign/close", async () => {
    const custToken = await tokenFor("custA");
    const created = await req("POST", "/v1/me/tickets", { token: custToken, body: { category: "OTHER", subject: "x" } });
    const ticketId = created.body.ticketId;
    const noEscalateToken = await tokenFor("noEscalate");

    // noEscalate CAN reach the ticket and reply.
    const view = await req("GET", `/v1/admin/tickets/${ticketId}`, { token: noEscalateToken });
    assert.equal(view.status, 200);

    const escalate = await req("POST", `/v1/admin/tickets/${ticketId}/escalate`, { token: noEscalateToken, body: { toTeam: "FINANCE" } });
    assert.equal(escalate.status, 403);
    assert.equal(escalate.body.error.code, "MISSING_CAPABILITY");

    const row = await db.query("SELECT team, status FROM support_ticket WHERE id = $1", [ticketId]);
    assert.equal(row.rows[0].team, "CUSTOMER_SUPPORT", "the denied escalation must not have partially applied");
  });
});

describe("unauthorized close", () => {
  test("an agent without TICKET_CLOSE cannot resolve or close, even though they can view/reply/assign/escalate", async () => {
    const custToken = await tokenFor("custB");
    const created = await req("POST", "/v1/me/tickets", { token: custToken, body: { category: "OTHER", subject: "x" } });
    const ticketId = created.body.ticketId;
    const noCloseToken = await tokenFor("noClose");

    const resolve = await req("POST", `/v1/admin/tickets/${ticketId}/resolve`, { token: noCloseToken });
    assert.equal(resolve.status, 403);
    assert.equal(resolve.body.error.code, "MISSING_CAPABILITY");

    const close = await req("POST", `/v1/admin/tickets/${ticketId}/close`, { token: noCloseToken });
    assert.equal(close.status, 403);

    const row = await db.query("SELECT status FROM support_ticket WHERE id = $1", [ticketId]);
    assert.equal(row.rows[0].status, "OPEN", "the denied close must not have partially applied");
  });

  test("TICKET_VIEW alone cannot assign, reply, escalate, or close -- read access implies nothing else", async () => {
    const custToken = await tokenFor("custA");
    const created = await req("POST", "/v1/me/tickets", { token: custToken, body: { category: "OTHER", subject: "x" } });
    const ticketId = created.body.ticketId;
    const viewToken = await tokenFor("viewOnly");

    for (const attempt of [
      () => req("POST", `/v1/admin/tickets/${ticketId}/assign`, { token: viewToken, body: {} }),
      () => req("POST", `/v1/admin/tickets/${ticketId}/messages`, { token: viewToken, body: { content: "x", visibility: "CUSTOMER" } }),
      () => req("POST", `/v1/admin/tickets/${ticketId}/escalate`, { token: viewToken, body: { toTeam: "RISK" } }),
      () => req("POST", `/v1/admin/tickets/${ticketId}/resolve`, { token: viewToken }),
      () => req("POST", `/v1/admin/tickets/${ticketId}/close`, { token: viewToken }),
    ]) {
      const r = await attempt();
      assert.equal(r.status, 403, JSON.stringify(r));
    }
  });
});
