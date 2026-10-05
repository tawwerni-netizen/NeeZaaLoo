/**
 * The VERIFICATION flow end to end: request a code, receive it via the
 * mock provider, confirm it. Every test that tries to break in --
 * expired, reused, wrong purpose, too many attempts -- is proving the
 * same underlying claim: a code issued for VERIFICATION can be spent
 * exactly once, only before it expires, only by the player it was issued
 * for, and never for anything else.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createEmailIdentityService } from "../src/email-identity.mjs";
import { createEmailChallengeService, ChallengePurpose } from "../src/email-challenge.mjs";
import { createEmailVerificationFlow, EmailVerificationError } from "../src/email-verification.mjs";
import { createMockEmailProvider } from "../../email/src/provider.mjs";
import { createEmailService } from "../../email/src/email-service.mjs";

let db, provider, identity, challenge, verification;
let CLOCK = Date.now();
const now = () => CLOCK;

async function freshPlayerWithEmail(id, email) {
  await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [id]);
  await identity.setEmail(id, email);
}

function lastSentCode() {
  const msg = provider.sent[provider.sent.length - 1];
  const match = msg.text.match(/\n([A-Z0-9]{8})\n/);
  return match[1];
}

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  identity = createEmailIdentityService(db);
  challenge = createEmailChallengeService(db, { now });
  provider = createMockEmailProvider();
  verification = createEmailVerificationFlow(db, {
    emailChallenge: challenge, emailIdentity: identity, emailService: createEmailService({ provider }),
  });
});

after(async () => { await db.close?.(); });

describe("requesting a verification code", () => {
  test("refuses with NO_EMAIL_ON_FILE when the player has not set an email", async () => {
    await db.query("INSERT INTO player (id, handle) VALUES ('noemail','noemail')");
    const r = await verification.request("noemail");
    assert.equal(r.ok, false);
    assert.equal(r.reason, EmailVerificationError.NO_EMAIL_ON_FILE);
  });

  test("a well-formed request sends exactly one email, to the address on file, with a code", async () => {
    await freshPlayerWithEmail("alice", "alice@example.com");
    const r = await verification.request("alice", { locale: "en" });
    assert.equal(r.ok, true);
    const msg = provider.sent.at(-1);
    assert.equal(msg.to, "alice@example.com");
    assert.equal(msg.template, "verification");
    assert.match(msg.text, /[A-Z0-9]{8}/);
  });

  test("refuses with ALREADY_VERIFIED once the email is confirmed", async () => {
    await freshPlayerWithEmail("bob", "bob@example.com");
    await verification.request("bob");
    await verification.confirm("bob", lastSentCode());
    const r = await verification.request("bob");
    assert.equal(r.ok, false);
    assert.equal(r.reason, EmailVerificationError.ALREADY_VERIFIED);
  });

  test("requesting twice in a row is refused with COOLDOWN, and does not send a second email", async () => {
    await freshPlayerWithEmail("carol", "carol@example.com");
    await verification.request("carol");
    const before = provider.sent.length;
    const r = await verification.request("carol");
    assert.equal(r.ok, false);
    assert.equal(r.reason, EmailVerificationError.COOLDOWN);
    assert.equal(provider.sent.length, before);
  });

  test("after the cooldown elapses, a resend is allowed and invalidates the previous code", async () => {
    await freshPlayerWithEmail("dave", "dave@example.com");
    await verification.request("dave");
    const firstCode = lastSentCode();
    CLOCK += 61_000; // past the 60s cooldown
    await verification.request("dave");
    const secondCode = lastSentCode();
    assert.notEqual(firstCode, secondCode);

    // The OLD code no longer works, even though it hasn't expired.
    const r = await verification.confirm("dave", firstCode);
    assert.equal(r.ok, false);
  });
});

describe("confirming a verification code", () => {
  test("the correct code verifies the email and is reflected on the identity", async () => {
    await freshPlayerWithEmail("erin", "erin@example.com");
    await verification.request("erin");
    const r = await verification.confirm("erin", lastSentCode());
    assert.equal(r.ok, true);
    assert.ok((await identity.getByPlayerId("erin")).verified_at);
  });

  test("an incorrect code is refused and does not verify", async () => {
    await freshPlayerWithEmail("frank", "frank@example.com");
    await verification.request("frank");
    const r = await verification.confirm("frank", "WRONGCOD");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "INVALID_CODE");
    assert.equal((await identity.getByPlayerId("frank")).verified_at, null);
  });

  test("a code cannot be reused once it has succeeded (replay protection)", async () => {
    await freshPlayerWithEmail("grace", "grace@example.com");
    await verification.request("grace");
    const code = lastSentCode();
    const first = await verification.confirm("grace", code);
    assert.equal(first.ok, true);
    const replay = await verification.confirm("grace", code);
    assert.equal(replay.ok, false);
    assert.equal(replay.reason, "NOT_FOUND"); // no active challenge left -- it was consumed
  });

  test("an expired code is refused even though it is otherwise correct", async () => {
    await freshPlayerWithEmail("henry", "henry@example.com");
    await verification.request("henry");
    const code = lastSentCode();
    CLOCK += 31 * 60_000; // past the 30-minute TTL
    const r = await verification.confirm("henry", code);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "EXPIRED");
  });

  test("too many wrong attempts exhausts the challenge, even with the right code held in reserve", async () => {
    await freshPlayerWithEmail("iris", "iris@example.com");
    await verification.request("iris");
    const code = lastSentCode();
    for (let i = 0; i < 5; i++) {
      const r = await verification.confirm("iris", "XXXXXXXX");
      assert.equal(r.ok, false);
    }
    // The 5 wrong attempts have exhausted max_attempts=5 -- the real code no longer works.
    const r = await verification.confirm("iris", code);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "TOO_MANY_ATTEMPTS");
  });

  test("a code cannot be used for a different player, even if guessed correctly", async () => {
    await freshPlayerWithEmail("jack", "jack@example.com");
    await freshPlayerWithEmail("kate", "kate@example.com");
    await verification.request("jack");
    const jacksCode = lastSentCode();
    // kate never requested a challenge, so there is nothing for her to
    // confirm against, regardless of what code is presented.
    const r = await verification.confirm("kate", jacksCode);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "NOT_FOUND");
  });
});

describe("purpose isolation", () => {
  test("a challenge issued for a different purpose is invisible to VERIFICATION's own lookup", async () => {
    await db.query("INSERT INTO player (id, handle) VALUES ('liam','liam')");
    // Issue directly at the challenge-service level for a different
    // purpose -- simulating what a future login-code/password-reset flow
    // will do -- and confirm VERIFICATION's confirm() cannot see it at all.
    const other = await challenge.issue({
      playerId: "liam", purpose: ChallengePurpose.PASSWORD_RESET, email: "liam@example.com", ttlMs: 600_000,
    });
    assert.equal(other.ok, true);
    const r = await verification.confirm("liam", other.code);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "NOT_FOUND");
  });
});

describe("changing email resets verification (Slice 1 behaviour, preserved)", () => {
  test("verifying, then changing the email, drops verified_at and requires a fresh code", async () => {
    await freshPlayerWithEmail("mia", "mia-old@example.com");
    await verification.request("mia");
    await verification.confirm("mia", lastSentCode());
    assert.ok((await identity.getByPlayerId("mia")).verified_at);

    await identity.setEmail("mia", "mia-new@example.com");
    assert.equal((await identity.getByPlayerId("mia")).verified_at, null);

    const r = await verification.request("mia");
    assert.equal(r.ok, true);
    assert.equal(provider.sent.at(-1).to, "mia-new@example.com");
  });
});
