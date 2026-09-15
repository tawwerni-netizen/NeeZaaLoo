/**
 * POST /v1/admin/fair-play/cases/:id/decide -- the one real consequence path
 * from the fair-play tribunal. Before this, the admin page rendered three
 * hardcoded mock cases and "Sanction"/"Clear" buttons that only flipped
 * local React state; no backend route existed at all.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createApi } from "../src/server.mjs";

const SIGNING_KEY = Buffer.alloc(32, 33);
const ENCRYPTION_KEY = Buffer.alloc(32, 44);
const PASSWORD = "correct horse battery staple";
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };
const u = (n) => (BigInt(n) * 1_000_000n).toString();

let db, auth, api, base;

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

const tokenFor = async (identifier) => (await auth.login({ identifier, password: PASSWORD })).accessToken;

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  auth = createAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: FAST_ARGON });
  api = createApi({ db, auth, rateLimit: { capacity: 5000, refillPerSecond: 5000 } });
  await api.listen();
  base = api.url;

  for (const p of ["cheaterA", "cheaterB", "root"]) {
    await auth.register({ playerId: p, handle: p, password: PASSWORD });
  }
  await db.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('bootstrap','b@n.test','B',TRUE),('root','root@n.test','Root',TRUE)");
  await db.query("INSERT INTO admin_role_grant (admin_id,role,granted_by,reason) VALUES ('root','SUPER_ADMIN','bootstrap','init')");

  // Give both players real, non-deposit-tied ledger funds across MULTIPLE
  // wallet states, so the seizure test proves it sweeps all five, not just
  // :available.
  for (const p of ["cheaterA", "cheaterB"]) {
    await db.query("SELECT ledger_open_user_wallet($1)", [p]);
    await db.query(
      `SELECT ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb)`,
      [`seed-${p}`, JSON.stringify([
        { account: "platform:custody:USDT:TRON", amount: u(80) },
        { account: `user:${p}:available`, amount: "-" + u(80) },
      ])]
    );
    // Move 30 of it into :locked to simulate an in-progress cash duel stake.
    await db.query(
      `SELECT ledger_post($1,'WITHDRAWAL_LOCK','SYSTEM',NULL,$2::jsonb)`,
      [`lock-${p}`, JSON.stringify([
        { account: `user:${p}:available`, amount: u(30) },
        { account: `user:${p}:locked`, amount: "-" + u(30) },
      ])]
    );
  }
});

after(async () => { await api.close(); });

async function stepUp(token, action) {
  const s = await req("POST", "/v1/auth/step-up", { token, body: { action, password: PASSWORD } });
  assert.equal(s.status, 200, `step-up failed: ${JSON.stringify(s.body)}`);
  return s.body.stepUpToken;
}

async function openCase(playerId, caseId) {
  await db.query(
    `INSERT INTO fairplay_case (id, player_id, category, status, risk_score)
     VALUES ($1,$2,'ENGINE_ASSISTANCE','OPEN',92)`,
    [caseId, playerId]
  );
}

describe("Fair-play tribunal decisions", () => {
  test("a non-admin cannot decide a case at all", async () => {
    await openCase("cheaterA", "case_noauth");
    const token = await tokenFor("cheaterA");
    const r = await req("POST", "/v1/admin/fair-play/cases/case_noauth/decide", {
      token, body: { decision: "ACCOUNT_CLOSURE", note: "self-sanction attempt" },
    });
    assert.equal(r.status, 403);
  });

  test("SANCTION: bans the account, seizes EVERY non-zero wallet state, and records a full audit trail", async () => {
    await openCase("cheaterA", "case_sanction");
    const rootToken = await tokenFor("root");
    const step = await stepUp(rootToken, "admin.fairplay.decide");

    const res = await req("POST", "/v1/admin/fair-play/cases/case_sanction/decide", {
      token: rootToken,
      headers: { "x-step-up-token": step },
      body: { decision: "ACCOUNT_CLOSURE", note: "Confirmed Stockfish correlation, 98.7%" },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.decision, "ACCOUNT_CLOSURE");
    assert.equal(res.body.playerId, "cheaterA");

    // Both non-zero states (available: 50 left after locking 30 of 80,
    // locked: 30) were seized; pending/withdrawable/restricted were zero
    // and correctly produced no entry at all.
    const states = Object.fromEntries(res.body.seized.map((s) => [s.state, s.amountMinor]));
    assert.equal(states.available, u(50));
    assert.equal(states.locked, u(30));
    assert.equal(Object.keys(states).length, 2, `expected exactly 2 seized states, got: ${JSON.stringify(states)}`);

    // The account is genuinely banned -- login now fails with the
    // cheating-specific code, not a generic one.
    const loginAttempt = await auth.login({ identifier: "cheaterA", password: PASSWORD });
    assert.equal(loginAttempt.ok, false);
    assert.equal(loginAttempt.reason, "ACCOUNT_DISABLED_CHEATING");

    // The player's wallet is genuinely empty now.
    const avail = await db.query(
      "SELECT ledger_natural_balance(normal_side, balance) AS bal FROM ledger_account a JOIN ledger_balance b ON b.account_id=a.id WHERE a.key='user:cheaterA:available'"
    );
    assert.equal(BigInt(avail.rows[0].bal), 0n);
    const locked = await db.query(
      "SELECT ledger_natural_balance(normal_side, balance) AS bal FROM ledger_account a JOIN ledger_balance b ON b.account_id=a.id WHERE a.key='user:cheaterA:locked'"
    );
    assert.equal(BigInt(locked.rows[0].bal), 0n);

    // platform:confiscated actually received the full 80 USDT.
    const confiscated = await db.query(
      "SELECT ledger_natural_balance(normal_side, balance) AS bal FROM ledger_account a JOIN ledger_balance b ON b.account_id=a.id WHERE a.key='platform:confiscated'"
    );
    assert.equal(BigInt(confiscated.rows[0].bal), BigInt(u(80)));

    // Case row and its immutable event log both reflect the real decision.
    const caseRow = await db.query("SELECT status, decision, decided_by, funds_held FROM fairplay_case WHERE id='case_sanction'");
    assert.equal(caseRow.rows[0].status, "DECIDED");
    assert.equal(caseRow.rows[0].decision, "ACCOUNT_CLOSURE");
    assert.equal(caseRow.rows[0].decided_by, "root");
    assert.equal(caseRow.rows[0].funds_held, true);

    const event = await db.query(
      "SELECT event, actor_id FROM fairplay_case_event WHERE case_id='case_sanction' ORDER BY id DESC LIMIT 1"
    );
    assert.equal(event.rows[0].event, "SANCTIONED_ACCOUNT_CLOSURE_AND_FUNDS_SEIZED");
    assert.equal(event.rows[0].actor_id, "root");
  });

  test("CLEAR: closes the case with no action on the player or their wallet", async () => {
    await openCase("cheaterB", "case_clear");
    const rootToken = await tokenFor("root");
    const step = await stepUp(rootToken, "admin.fairplay.decide");

    const res = await req("POST", "/v1/admin/fair-play/cases/case_clear/decide", {
      token: rootToken,
      headers: { "x-step-up-token": step },
      body: { decision: "NONE", note: "Timing variance is natural, human hesitation on the sacrifice." },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const caseRow = await db.query("SELECT status, decision FROM fairplay_case WHERE id='case_clear'");
    assert.equal(caseRow.rows[0].status, "CLOSED_NO_ACTION");
    assert.equal(caseRow.rows[0].decision, "NONE");

    // cheaterB's funds and account are completely untouched.
    const loginAttempt = await auth.login({ identifier: "cheaterB", password: PASSWORD });
    assert.equal(loginAttempt.ok, true);
    const avail = await db.query(
      "SELECT ledger_natural_balance(normal_side, balance) AS bal FROM ledger_account a JOIN ledger_balance b ON b.account_id=a.id WHERE a.key='user:cheaterB:available'"
    );
    assert.equal(BigInt(avail.rows[0].bal), BigInt(u(50)));
  });

  test("a case that's already been decided cannot be decided again", async () => {
    const rootToken = await tokenFor("root");
    const step = await stepUp(rootToken, "admin.fairplay.decide");
    const res = await req("POST", "/v1/admin/fair-play/cases/case_sanction/decide", {
      token: rootToken,
      headers: { "x-step-up-token": step },
      body: { decision: "NONE", note: "trying to un-sanction after the fact" },
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, "ALREADY_DECIDED");
  });

  test("GET /v1/admin/fair-play returns real cases with the player's handle joined in", async () => {
    const rootToken = await tokenFor("root");
    const res = await req("GET", "/v1/admin/fair-play", { token: rootToken });
    assert.equal(res.status, 200);
    const found = res.body.cases.find((c) => c.id === "case_sanction");
    assert.ok(found, "the decided case should still be listed");
    assert.equal(found.player_handle, "cheaterA");
    assert.equal(found.decision, "ACCOUNT_CLOSURE");
  });
});
