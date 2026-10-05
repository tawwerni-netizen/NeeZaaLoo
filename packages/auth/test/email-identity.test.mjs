/**
 * Email identity (db/migrations/0016_email_identity.sql,
 * src/email-identity.mjs). The property under test throughout: an email
 * address identifies at most one account, normalization is consistent, and
 * changing an email always drops verification -- proving you owned the old
 * address is never treated as proof you own the new one.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createEmailIdentityService, normalizeEmail, EmailIdentityError } from "../src/email-identity.mjs";

let db, identity;

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  identity = createEmailIdentityService(db);
  for (const id of ["alice", "bob", "carol"]) {
    await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [id]);
  }
});

after(async () => { await db.close?.(); });

describe("normalization", () => {
  test("trims whitespace and lowercases", () => {
    assert.equal(normalizeEmail("  Alice@Example.COM  "), "alice@example.com");
  });

  test("a non-string normalizes to an empty string, not a throw", () => {
    assert.equal(normalizeEmail(undefined), "");
    assert.equal(normalizeEmail(null), "");
  });
});

describe("setting an email", () => {
  test("a well-formed email is accepted and stored normalized, display form preserved", async () => {
    const r = await identity.setEmail("alice", "  Alice.W@Example.COM ");
    assert.equal(r.ok, true);
    assert.equal(r.identity.email, "alice.w@example.com");
    assert.equal(r.identity.email_display, "Alice.W@Example.COM");
    assert.equal(r.identity.verified_at, null);
  });

  test("a malformed email is refused before touching the database", async () => {
    const r = await identity.setEmail("bob", "not-an-email");
    assert.equal(r.ok, false);
    assert.equal(r.reason, EmailIdentityError.INVALID_EMAIL);
    assert.equal(await identity.getByPlayerId("bob"), null);
  });

  test("two players cannot claim the same normalized email, even with different casing", async () => {
    await identity.setEmail("bob", "shared@example.com");
    const r = await identity.setEmail("carol", "Shared@Example.com");
    assert.equal(r.ok, false);
    assert.equal(r.reason, EmailIdentityError.EMAIL_TAKEN);
  });

  test("a player may re-set their OWN email to the same or a different address", async () => {
    const r1 = await identity.setEmail("bob", "bob-new@example.com");
    assert.equal(r1.ok, true);
    const r2 = await identity.setEmail("bob", "bob-newer@example.com");
    assert.equal(r2.ok, true);
    assert.equal((await identity.getByPlayerId("bob")).email, "bob-newer@example.com");
  });

  test("changing email resets verification", async () => {
    await identity.setEmail("carol", "carol@example.com");
    await identity.markVerified("carol");
    assert.ok((await identity.getByPlayerId("carol")).verified_at);

    await identity.setEmail("carol", "carol-2@example.com");
    assert.equal((await identity.getByPlayerId("carol")).verified_at, null);
  });

  test("setting an email writes an EMAIL_SET security event", async () => {
    await identity.setEmail("alice", "alice2@example.com", { ip: "10.0.0.1" });
    const r = await db.query(
      "SELECT type, detail, ip FROM security_event WHERE player_id='alice' AND type='EMAIL_SET' ORDER BY id DESC LIMIT 1"
    );
    assert.equal(r.rows[0].detail.email, "alice2@example.com");
    assert.equal(r.rows[0].ip, "10.0.0.1");
  });
});

describe("lookups", () => {
  test("getByEmail finds a player regardless of the case/whitespace used to look it up", async () => {
    await identity.setEmail("alice", "lookup-me@example.com");
    const found = await identity.getByEmail("  Lookup-Me@EXAMPLE.com");
    assert.equal(found.player_id, "alice");
  });

  test("getByEmail returns null for an address nobody has", async () => {
    assert.equal(await identity.getByEmail("nobody@example.com"), null);
  });
});

describe("markVerified", () => {
  test("marking verified twice is idempotent, and says so", async () => {
    await identity.setEmail("bob", "bob-verify@example.com");
    const first = await identity.markVerified("bob");
    assert.equal(first.ok, true);
    assert.equal(first.alreadyVerified, undefined);
    const second = await identity.markVerified("bob");
    assert.equal(second.ok, true);
    assert.equal(second.alreadyVerified, true);
  });

  test("marking verified with no email on file is refused, not a crash", async () => {
    await db.query("INSERT INTO player (id, handle) VALUES ('dave','dave')");
    const r = await identity.markVerified("dave");
    assert.equal(r.ok, false);
    assert.equal(r.reason, EmailIdentityError.NOT_FOUND);
  });

  test("verifying writes an EMAIL_VERIFIED security event exactly once", async () => {
    // A dedicated player: "carol" already accumulated one EMAIL_VERIFIED
    // event in an earlier test in this file, which would make an exact
    // count here order-dependent.
    await db.query("INSERT INTO player (id, handle) VALUES ('erin','erin')");
    await identity.setEmail("erin", "erin-verify@example.com");
    await identity.markVerified("erin");
    await identity.markVerified("erin");
    const r = await db.query(
      "SELECT count(*)::int AS n FROM security_event WHERE player_id='erin' AND type='EMAIL_VERIFIED'"
    );
    assert.equal(r.rows[0].n, 1);
  });
});

describe("database constraints hold even if the service layer is bypassed", () => {
  test("the shape check refuses a malformed email inserted directly", async () => {
    await assert.rejects(() =>
      db.query(
        "INSERT INTO email_identity (id, player_id, email, email_display) VALUES ('x','dave','not-an-email','not-an-email')"
      )
    );
  });

  test("a player cannot hold two email_identity rows", async () => {
    await identity.setEmail("dave", "dave@example.com");
    await assert.rejects(() =>
      db.query(
        "INSERT INTO email_identity (id, player_id, email, email_display) VALUES ('y','dave','dave2@example.com','dave2@example.com')"
      )
    );
  });
});
