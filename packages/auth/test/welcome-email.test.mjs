/**
 * Welcome-email idempotency (db/migrations/0018_email_challenges.sql's
 * security_event_welcome_once, packages/auth/src/welcome-email.mjs). The
 * property under test throughout: no matter how many times sendOnce() is
 * called for the same player -- sequentially or concurrently -- at most
 * one email actually goes out.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createWelcomeEmailFlow } from "../src/welcome-email.mjs";
import { createMockEmailProvider } from "../../email/src/provider.mjs";
import { createEmailService } from "../../email/src/email-service.mjs";

let db, provider, welcome;

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  provider = createMockEmailProvider();
  welcome = createWelcomeEmailFlow(db, { emailService: createEmailService({ provider }) });
  for (const id of ["alice", "bob", "carol"]) {
    await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [id]);
  }
});

after(async () => { await db.close?.(); });

describe("sendOnce", () => {
  test("the first call actually sends", async () => {
    const r = await welcome.sendOnce({ playerId: "alice", nickname: "alice", email: "alice@example.com", locale: "en" });
    assert.equal(r.ok, true);
    assert.equal(r.alreadySent, false);
    assert.equal(provider.sent.length, 1);
  });

  test("a second call for the same player is a silent no-op, not a second email", async () => {
    const before = provider.sent.length;
    const r = await welcome.sendOnce({ playerId: "alice", nickname: "alice", email: "alice@example.com", locale: "en" });
    assert.equal(r.ok, true);
    assert.equal(r.alreadySent, true);
    assert.equal(provider.sent.length, before, "no additional email was sent");
  });

  test("concurrent calls for the same NEW player still send exactly once", async () => {
    const before = provider.sent.length;
    const results = await Promise.all([
      welcome.sendOnce({ playerId: "bob", nickname: "bob", email: "bob@example.com", locale: "en" }),
      welcome.sendOnce({ playerId: "bob", nickname: "bob", email: "bob@example.com", locale: "en" }),
      welcome.sendOnce({ playerId: "bob", nickname: "bob", email: "bob@example.com", locale: "en" }),
    ]);
    assert.ok(results.every((r) => r.ok));
    assert.equal(results.filter((r) => r.alreadySent === false).length, 1, "exactly one of the three actually sent");
    assert.equal(provider.sent.length - before, 1);
  });

  test("writes WELCOME_EMAIL_REQUESTED and WELCOME_EMAIL_SENT security events", async () => {
    await welcome.sendOnce({ playerId: "carol", nickname: "carol", email: "carol@example.com", locale: "en" });
    const events = await db.query(
      "SELECT type FROM security_event WHERE player_id='carol' ORDER BY id"
    );
    assert.deepEqual(events.rows.map((r) => r.type), ["WELCOME_EMAIL_REQUESTED", "WELCOME_EMAIL_SENT"]);
  });

  test("a provider failure is recorded as WELCOME_EMAIL_FAILED and does not throw", async () => {
    await db.query("INSERT INTO player (id, handle) VALUES ('dave','dave')");
    const failingProvider = { async send() { return { ok: false, reason: "PROVIDER_DOWN" }; } };
    const failingWelcome = createWelcomeEmailFlow(db, { emailService: createEmailService({ provider: failingProvider }) });
    const r = await failingWelcome.sendOnce({ playerId: "dave", nickname: "dave", email: "dave@example.com", locale: "en" });
    assert.equal(r.ok, false);
    const events = await db.query("SELECT type FROM security_event WHERE player_id='dave' ORDER BY id");
    assert.deepEqual(events.rows.map((r) => r.type), ["WELCOME_EMAIL_REQUESTED", "WELCOME_EMAIL_FAILED"]);
  });

  test("a provider that throws is treated the same as one that returns ok:false", async () => {
    await db.query("INSERT INTO player (id, handle) VALUES ('erin','erin')");
    const throwingProvider = { async send() { throw new Error("network down"); } };
    const throwingWelcome = createWelcomeEmailFlow(db, { emailService: createEmailService({ provider: throwingProvider }) });
    await assert.doesNotReject(() =>
      throwingWelcome.sendOnce({ playerId: "erin", nickname: "erin", email: "erin@example.com", locale: "en" })
    );
    const events = await db.query("SELECT type FROM security_event WHERE player_id='erin' AND type='WELCOME_EMAIL_FAILED'");
    assert.equal(events.rows.length, 1);
  });
});
