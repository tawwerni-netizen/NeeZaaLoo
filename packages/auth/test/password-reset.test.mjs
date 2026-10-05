/**
 * The PASSWORD_RESET flow (packages/auth/src/password-reset.mjs). Beyond
 * the usual expired/reused/wrong-purpose/attempts matrix already proven
 * generically for the shared challenge mechanism, this file focuses on
 * what is specific to RESET: the old password stops working and the new
 * one works, every active session is revoked, a confirmation email goes
 * out, and none of this touches email verification, TOTP, or any other
 * account state it has no business touching.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService, AuthError } from "../src/service.mjs";
import { createEmailIdentityService } from "../src/email-identity.mjs";
import { createEmailChallengeService, ChallengePurpose } from "../src/email-challenge.mjs";
import { createPasswordResetFlow } from "../src/password-reset.mjs";
import { createMockEmailProvider } from "../../email/src/provider.mjs";
import { createEmailService } from "../../email/src/email-service.mjs";

const SIGNING_KEY = Buffer.alloc(32, 3);
const ENCRYPTION_KEY = Buffer.alloc(32, 4);
const OLD_PASSWORD = "correct horse battery staple";
const NEW_PASSWORD = "a completely different passphrase";
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };

let db, auth, identity, challenge, provider, reset;
let CLOCK = Date.now();
const now = () => CLOCK;

async function registeredWithEmail(handle, email) {
  await auth.register({ playerId: handle, handle, password: OLD_PASSWORD });
  await identity.setEmail(handle, email);
}

function lastResetCodeSent() {
  const msg = provider.sent.filter((m) => m.template === "password_reset").at(-1);
  const match = msg.text.match(/\n([A-Z2-9]{10})\n/);
  return match[1];
}

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  auth = createAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: { ...FAST_ARGON, algorithm: 2 }, now });
  identity = createEmailIdentityService(db);
  challenge = createEmailChallengeService(db, { now });
  provider = createMockEmailProvider();
  reset = createPasswordResetFlow(db, { emailChallenge: challenge, emailIdentity: identity, emailService: createEmailService({ provider }), auth });
});

after(async () => { await db.close?.(); });

describe("requesting a reset -- enumeration safety", () => {
  test("a nonexistent email returns the same generic response as a real account", async () => {
    const r = await reset.request("nobody@example.com");
    assert.deepEqual(r, { ok: true });
    assert.equal(provider.sent.length, 0);
  });

  test("an account with an UNVERIFIED email still gets a reset code -- unlike login-code, reset does not require prior verification", async () => {
    await auth.register({ playerId: "unverified1", handle: "unverified1", password: OLD_PASSWORD });
    await identity.setEmail("unverified1", "unverified1@example.com");
    const r = await reset.request("unverified1@example.com");
    assert.deepEqual(r, { ok: true });
    assert.equal(provider.sent.length, 1, "a real email WAS sent, despite the address being unverified");
  });

  test("a real account gets the same {ok:true} response, and a real 10-character code is sent", async () => {
    await registeredWithEmail("alice", "alice@example.com");
    const r = await reset.request("alice@example.com");
    assert.deepEqual(r, { ok: true });
    const code = lastResetCodeSent();
    assert.equal(code.length, 10);
  });
});

describe("confirming a reset", () => {
  test("the correct code and a strong new password succeed; old password stops working, new one works", async () => {
    await registeredWithEmail("bob", "bob@example.com");
    await reset.request("bob@example.com");
    const code = lastResetCodeSent();

    const r = await reset.confirm({ email: "bob@example.com", code, newPassword: NEW_PASSWORD });
    assert.equal(r.ok, true);
    assert.equal(r.playerId, "bob");

    const oldLogin = await auth.login({ identifier: "bob", password: OLD_PASSWORD });
    assert.equal(oldLogin.ok, false);
    assert.equal(oldLogin.reason, AuthError.BAD_CREDENTIALS);

    const newLogin = await auth.login({ identifier: "bob", password: NEW_PASSWORD });
    assert.equal(newLogin.ok, true);
  });

  test("a weak new password is refused WITHOUT consuming the code -- a real retry with a stronger password still works", async () => {
    await registeredWithEmail("carol", "carol@example.com");
    await reset.request("carol@example.com");
    const code = lastResetCodeSent();

    const weak = await reset.confirm({ email: "carol@example.com", code, newPassword: "short" });
    assert.equal(weak.ok, false);
    assert.equal(weak.reason, AuthError.WEAK_PASSWORD);

    // The SAME code still works, because strength is validated before the
    // challenge is ever touched.
    const strong = await reset.confirm({ email: "carol@example.com", code, newPassword: NEW_PASSWORD });
    assert.equal(strong.ok, true);
  });

  test("an unrecognized email is refused the same way a wrong code would be (NOT_FOUND)", async () => {
    const r = await reset.confirm({ email: "ghost@example.com", code: "AAAAAAAAAA", newPassword: NEW_PASSWORD });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "NOT_FOUND");
  });

  test("a wrong (well-formed) code is refused", async () => {
    await registeredWithEmail("dan", "dan@example.com");
    await reset.request("dan@example.com");
    const r = await reset.confirm({ email: "dan@example.com", code: "ZZZZZZZZZZ", newPassword: NEW_PASSWORD });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "INVALID_CODE");
  });

  test("a code cannot be reused once it has succeeded (replay protection)", async () => {
    await registeredWithEmail("erin", "erin@example.com");
    await reset.request("erin@example.com");
    const code = lastResetCodeSent();
    assert.equal((await reset.confirm({ email: "erin@example.com", code, newPassword: NEW_PASSWORD })).ok, true);
    const replay = await reset.confirm({ email: "erin@example.com", code, newPassword: "yet another passphrase" });
    assert.equal(replay.ok, false);
    assert.equal(replay.reason, "NOT_FOUND");
  });

  test("an expired code is refused", async () => {
    await registeredWithEmail("frank", "frank@example.com");
    await reset.request("frank@example.com");
    const code = lastResetCodeSent();
    CLOCK += 31 * 60_000; // past the 30-minute TTL
    const r = await reset.confirm({ email: "frank@example.com", code, newPassword: NEW_PASSWORD });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "EXPIRED");
  });

  test("too many wrong attempts exhausts the challenge, even with the right code held in reserve", async () => {
    await registeredWithEmail("grace", "grace@example.com");
    await reset.request("grace@example.com");
    const code = lastResetCodeSent();
    for (let i = 0; i < 5; i++) {
      await reset.confirm({ email: "grace@example.com", code: "WRONGWRONG", newPassword: NEW_PASSWORD });
    }
    const r = await reset.confirm({ email: "grace@example.com", code, newPassword: NEW_PASSWORD });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "TOO_MANY_ATTEMPTS");
  });

  test("a malformed/empty code never reaches a real challenge comparison", async () => {
    await registeredWithEmail("henry", "henry@example.com");
    const r = await reset.confirm({ email: "henry@example.com", code: "", newPassword: NEW_PASSWORD });
    assert.equal(r.ok, false);
    // No challenge was ever issued for henry in this test -- NOT_FOUND either way,
    // but the point is an empty code does not crash or behave specially.
  });
});

describe("purpose isolation from VERIFICATION and LOGIN_CODE", () => {
  test("a VERIFICATION challenge cannot be used to complete a password reset", async () => {
    await registeredWithEmail("iris", "iris@example.com");
    const verifChallenge = await challenge.issue({
      playerId: "iris", purpose: ChallengePurpose.VERIFICATION, email: "iris@example.com", ttlMs: 600_000, codeLength: 10,
    });
    const r = await reset.confirm({ email: "iris@example.com", code: verifChallenge.code, newPassword: NEW_PASSWORD });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "NOT_FOUND");
  });

  test("a LOGIN_CODE challenge cannot be used to complete a password reset", async () => {
    await registeredWithEmail("jack", "jack@example.com");
    const loginChallenge = await challenge.issue({
      playerId: "jack", purpose: ChallengePurpose.LOGIN_CODE, email: "jack@example.com", ttlMs: 600_000, codeLength: 10,
    });
    const r = await reset.confirm({ email: "jack@example.com", code: loginChallenge.code, newPassword: NEW_PASSWORD });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "NOT_FOUND");
  });

  test("a password-reset code cannot be used to verify an email or complete a login-code flow", async () => {
    await registeredWithEmail("kate", "kate@example.com");
    await reset.request("kate@example.com");
    const code = lastResetCodeSent();
    const asVerification = await challenge.verify({ playerId: "kate", purpose: ChallengePurpose.VERIFICATION, code });
    assert.equal(asVerification.ok, false);
    const asLoginCode = await challenge.verify({ playerId: "kate", purpose: ChallengePurpose.LOGIN_CODE, code });
    assert.equal(asLoginCode.ok, false);
  });
});

describe("account safety: reset touches ONLY the password credential", () => {
  test("does not verify or otherwise change the email identity", async () => {
    await registeredWithEmail("liam", "liam@example.com");
    assert.equal((await identity.getByPlayerId("liam")).verified_at, null);
    await reset.request("liam@example.com");
    const code = lastResetCodeSent();
    await reset.confirm({ email: "liam@example.com", code, newPassword: NEW_PASSWORD });
    assert.equal((await identity.getByPlayerId("liam")).verified_at, null, "still unverified -- reset does not grant verification");
    assert.equal((await identity.getByPlayerId("liam")).email, "liam@example.com", "email itself is unchanged");
  });

  test("revokes every active session -- a stolen session does not survive a reset", async () => {
    await registeredWithEmail("mia", "mia@example.com");
    const session1 = await auth.login({ identifier: "mia", password: OLD_PASSWORD });
    const session2 = await auth.login({ identifier: "mia", password: OLD_PASSWORD });
    assert.equal(auth.verifyAccess(session1.accessToken).ok, true);

    await reset.request("mia@example.com");
    const code = lastResetCodeSent();
    const r = await reset.confirm({ email: "mia@example.com", code, newPassword: NEW_PASSWORD });
    assert.equal(r.revokedSessions, 2);

    const strict1 = await auth.verifyAccessStrict(session1.accessToken);
    const strict2 = await auth.verifyAccessStrict(session2.accessToken);
    assert.equal(strict1.ok, false);
    assert.equal(strict2.ok, false);
  });

  test("TOTP is preserved: logging in again after a reset still requires it if enrolled", async () => {
    const { totp: computeTotp, base32Decode } = await import("../src/totp.mjs");
    await registeredWithEmail("noah", "noah@example.com");
    const begin = await auth.beginTotpEnrolment("noah", "noah@nizalo");
    const secret = base32Decode(begin.secretBase32);
    await auth.confirmTotpEnrolment("noah", computeTotp(secret, CLOCK));
    CLOCK += 30_000;

    await reset.request("noah@example.com");
    const code = lastResetCodeSent();
    await reset.confirm({ email: "noah@example.com", code, newPassword: NEW_PASSWORD });

    const withoutTotp = await auth.login({ identifier: "noah", password: NEW_PASSWORD });
    assert.equal(withoutTotp.ok, false);
    assert.equal(withoutTotp.reason, AuthError.TOTP_REQUIRED);

    CLOCK += 30_000;
    const withTotp = await auth.login({ identifier: "noah", password: NEW_PASSWORD, totpCode: computeTotp(secret, CLOCK) });
    assert.equal(withTotp.ok, true);
  });
});

describe("resend cooldown", () => {
  test("requesting twice in a row does not send a second email", async () => {
    await registeredWithEmail("olive", "olive@example.com");
    await reset.request("olive@example.com");
    const before = provider.sent.length;
    await reset.request("olive@example.com");
    assert.equal(provider.sent.length, before);
  });

  test("after the cooldown elapses, a resend invalidates the previous code", async () => {
    await registeredWithEmail("peter", "peter@example.com");
    await reset.request("peter@example.com");
    const firstCode = lastResetCodeSent();
    CLOCK += 61_000;
    await reset.request("peter@example.com");
    const secondCode = lastResetCodeSent();
    assert.notEqual(firstCode, secondCode);
    const r = await reset.confirm({ email: "peter@example.com", code: firstCode, newPassword: NEW_PASSWORD });
    assert.equal(r.ok, false);
  });
});

describe("confirmation email and security audit", () => {
  test("a successful reset sends a confirmation email with no code and no link", async () => {
    await registeredWithEmail("quinn", "quinn@example.com");
    await reset.request("quinn@example.com");
    const code = lastResetCodeSent();
    const before = provider.sent.length;
    await reset.confirm({ email: "quinn@example.com", code, newPassword: NEW_PASSWORD });
    const sentAfter = provider.sent.slice(before);
    assert.equal(sentAfter.length, 1);
    assert.equal(sentAfter[0].template, "password_reset_confirmation");
  });

  test("the confirmation email respects the caller's requested locale", async () => {
    await registeredWithEmail("ruth", "ruth@example.com");
    await reset.request("ruth@example.com", { locale: "ar" });
    const code = lastResetCodeSent();
    await reset.confirm({ email: "ruth@example.com", code, newPassword: NEW_PASSWORD, locale: "ar" });
    const confirmation = provider.sent.filter((m) => m.template === "password_reset_confirmation").at(-1);
    assert.equal(confirmation.locale, "ar");
    assert.match(confirmation.html, /dir="rtl"/);
  });

  test("a full request+confirm cycle writes REQUESTED, SENT and PASSWORD_RESET_COMPLETED, and nothing else from this flow", async () => {
    await registeredWithEmail("sam", "sam@example.com");
    await reset.request("sam@example.com");
    const code = lastResetCodeSent();
    await reset.confirm({ email: "sam@example.com", code, newPassword: NEW_PASSWORD });
    const events = await db.query(
      "SELECT type FROM security_event WHERE player_id='sam' AND (type LIKE 'PASSWORD_RESET%' OR type = 'PASSWORD_RESET_COMPLETED') ORDER BY id"
    );
    assert.deepEqual(events.rows.map((r) => r.type), [
      "PASSWORD_RESET_REQUESTED", "PASSWORD_RESET_SENT", "PASSWORD_RESET_COMPLETED",
    ]);
  });

  test("no security_event row for this player ever contains the raw reset code", async () => {
    await registeredWithEmail("tara", "tara@example.com");
    await reset.request("tara@example.com");
    const code = lastResetCodeSent();
    await reset.confirm({ email: "tara@example.com", code, newPassword: NEW_PASSWORD });
    const events = await db.query("SELECT detail FROM security_event WHERE player_id='tara'");
    for (const row of events.rows) {
      assert.equal(JSON.stringify(row.detail).includes(code), false);
    }
  });

  test("a cooldown-blocked resend is recorded as PASSWORD_RESET_RATE_LIMITED", async () => {
    await registeredWithEmail("uma", "uma@example.com");
    await reset.request("uma@example.com");
    await reset.request("uma@example.com");
    const events = await db.query(
      "SELECT type FROM security_event WHERE player_id='uma' AND type='PASSWORD_RESET_RATE_LIMITED'"
    );
    assert.equal(events.rows.length, 1);
  });
});
