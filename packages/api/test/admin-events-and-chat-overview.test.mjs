/**
 * Two admin panels caught by the same route/policy audit pass that found the
 * risk_alert/reconciliation_case/security_event column bugs in GET /v1/admin/
 * risk: the Topbar Bell feed (GET /v1/admin/events) queried admin_audit's
 * actor_id/created_at (real columns: admin_id/at) and security_event's and
 * tournament_event's created_at (real column: at); the Chat Moderation
 * overview (GET /v1/admin/chat) queried tables named chat_report and
 * player_block that never existed (the real tables are content_report,
 * reused from profile moderation, and chat_block). Every one of those errors
 * was silently caught to an empty array, so both panels always rendered
 * nothing no matter how much real data existed underneath.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createApi } from "../src/server.mjs";

const SIGNING_KEY = Buffer.alloc(32, 21);
const ENCRYPTION_KEY = Buffer.alloc(32, 22);
const PASSWORD = "correct horse battery staple";
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };

let db, auth, api, base;

async function req(method, path, { token } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
}

const tokenFor = async (handle) => (await auth.login({ identifier: handle, password: PASSWORD })).accessToken;

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  auth = createAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: FAST_ARGON });
  api = createApi({ db, auth, rateLimit: { capacity: 5000, refillPerSecond: 5000 } });
  await api.listen();
  base = api.url;

  for (const p of ["rootAdmin", "reporter", "reported"]) {
    await auth.register({ playerId: p, handle: p, password: PASSWORD });
  }
  await db.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('bootstrap','b@n.test','B',TRUE),('rootAdmin','root@n.test','Root',TRUE)");
  await db.query("INSERT INTO admin_role_grant (admin_id,role,granted_by,reason) VALUES ('rootAdmin','SUPER_ADMIN','bootstrap','init')");

  await db.query(
    `INSERT INTO admin_audit (admin_id, action, decision, subject_type, subject_id)
     VALUES ('rootAdmin', 'admin.rbac.manage', 'ALLOW', 'admin_role_grant', 'reportedAdmin')`
  );
  await db.query(
    "INSERT INTO security_event (player_id, type, detail) VALUES ('reported', 'LOCKOUT', '{}'::jsonb)"
  );

  await db.query(
    `INSERT INTO content_report (id, reporter_id, subject_player_id, content_type, category, reason, status)
     VALUES ('rep1', 'reporter', 'reported', 'PLAYER', 'ABUSE', 'toxic language in global chat', 'OPEN')`
  );
  await db.query(
    "INSERT INTO chat_block (blocker_id, blocked_id) VALUES ('reporter', 'reported')"
  );
});

after(async () => { await api.close(); });

describe("GET /v1/admin/events -- the Topbar Bell feed", () => {
  test("real audit and security rows are actually returned, not silently swallowed to empty", async () => {
    const token = await tokenFor("rootAdmin");
    const r = await req("GET", "/v1/admin/events", { token });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.events.length > 0, "expected at least the seeded admin_audit and security_event rows");
    assert.ok(r.body.events.some((e) => e.event_type === "AUDIT"), "an AUDIT event (the SUPER_ADMIN role grant) should appear");
    assert.ok(r.body.events.some((e) => e.event_type === "SECURITY"), "the seeded LOCKOUT security_event should appear");
    // created_at must be a real, parseable timestamp -- proof the column
    // alias actually resolved against a real column, not undefined.
    for (const e of r.body.events) assert.ok(!Number.isNaN(new Date(e.created_at).getTime()), `bad created_at on ${JSON.stringify(e)}`);
  });
});

describe("GET /v1/admin/chat -- the Chat Moderation overview", () => {
  test("real content_report and chat_block rows are actually returned", async () => {
    const token = await tokenFor("rootAdmin");
    const r = await req("GET", "/v1/admin/chat", { token });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.reports.length, 1, JSON.stringify(r.body.reports));
    assert.equal(r.body.reports[0].id, "rep1");
    assert.equal(r.body.reports[0].reason, "toxic language in global chat");
    assert.equal(r.body.blocks.length, 1, JSON.stringify(r.body.blocks));
    assert.equal(r.body.blocks[0].blocker_id, "reporter");
    assert.equal(r.body.blocks[0].blocked_id, "reported");
  });
});
