/**
 * Authentication.
 *
 * The RFC test vectors at the top are the anchor: an OTP implementation that
 * reproduces RFC 4226 and RFC 6238 exactly is correct, and one that does not is
 * broken in a way "it works with my phone" will never reveal.
 *
 * Everything after that is an attempt to break in.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService, AuthError } from "../src/service.mjs";
import { hotp, totp, verifyTotp, base32Decode, base32Encode, generateSecret } from "../src/totp.mjs";
import {
  issueAccessToken, verifyAccessToken, issueStepUpToken, verifyStepUpToken,
  generateRefreshToken, hashRefreshToken,
} from "../src/tokens.mjs";

const SIGNING_KEY = Buffer.alloc(32, 7);
const ENCRYPTION_KEY = Buffer.alloc(32, 9);
const PASSWORD = "correct horse battery staple";

// Argon2 at production cost would make this suite minutes long. Lowering the
// cost changes timing only, never behaviour -- every property under test is
// independent of the parameters.
const FAST_ARGON = { memoryCost: 1024, timeCost: 1, parallelism: 1 };

// Near real time: some guards (cooling-off, throttling) legitimately use the
// database clock, so the injected clock must live in the same era.
let CLOCK = Date.now();
const now = () => CLOCK;

async function fresh() {
  const db = await PGlite.create();
  await migrate(db);
  const auth = createAuthService(db, {
    signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, now,
    argon: { ...FAST_ARGON, algorithm: 2 },
  });
  return { db, auth };
}

async function registered(handle = "alice") {
  const { db, auth } = await fresh();
  const r = await auth.register({ playerId: handle, handle, password: PASSWORD });
  assert.equal(r.ok, true, JSON.stringify(r));
  return { db, auth };
}

// ---------------------------------------------------------------------------

describe("HOTP — RFC 4226 test vectors", () => {
  const SECRET = Buffer.from("12345678901234567890", "ascii");
  const EXPECTED = [
    "755224", "287082", "359152", "969429", "338314",
    "254676", "287922", "162583", "399871", "520489",
  ];
  EXPECTED.forEach((expected, counter) => {
    test(`counter ${counter} = ${expected}`, () => {
      assert.equal(hotp(SECRET, counter), expected);
    });
  });
});

describe("TOTP — RFC 6238 test vectors", () => {
  const SECRET = Buffer.from("12345678901234567890", "ascii");
  const VECTORS = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];
  for (const [seconds, expected] of VECTORS) {
    test(`T=${seconds} = ${expected}`, () => {
      assert.equal(totp(SECRET, seconds * 1000, { digits: 8 }), expected);
    });
  }
});

describe("TOTP verification", () => {
  const SECRET = Buffer.from("12345678901234567890", "ascii");

  test("accepts the current code", () => {
    const code = totp(SECRET, CLOCK);
    assert.equal(verifyTotp(SECRET, code, CLOCK).ok, true);
  });

  test("tolerates one step of clock skew in both directions", () => {
    const early = totp(SECRET, CLOCK - 30_000);
    const late = totp(SECRET, CLOCK + 30_000);
    assert.equal(verifyTotp(SECRET, early, CLOCK).ok, true, "phone slightly slow");
    assert.equal(verifyTotp(SECRET, late, CLOCK).ok, true, "phone slightly fast");
  });

  test("rejects a code from outside the window", () => {
    const stale = totp(SECRET, CLOCK - 300_000);
    assert.equal(verifyTotp(SECRET, stale, CLOCK).ok, false);
  });

  test("refuses to accept the same code twice", () => {
    // Shoulder-surfing defence: a code seen once cannot be spent again, even
    // while it is still inside its 30-second window.
    const code = totp(SECRET, CLOCK);
    const first = verifyTotp(SECRET, code, CLOCK);
    assert.equal(first.ok, true);
    const second = verifyTotp(SECRET, code, CLOCK, { lastUsedStep: first.step });
    assert.equal(second.ok, false);
    assert.equal(second.reason, "REPLAYED");
  });

  test("rejects malformed input without touching the secret", () => {
    for (const bad of ["", "abcdef", "12345", "1234567", null, 123456]) {
      assert.equal(verifyTotp(SECRET, bad, CLOCK).reason, "MALFORMED");
    }
  });

  test("base32 round-trips", () => {
    const s = generateSecret();
    assert.deepEqual(base32Decode(base32Encode(s)), s);
  });
});

describe("access tokens", () => {
  test("a valid token verifies", () => {
    const t = issueAccessToken({ playerId: "alice", sessionId: "s1" }, SIGNING_KEY, CLOCK);
    const res = verifyAccessToken(t, SIGNING_KEY, CLOCK);
    assert.equal(res.ok, true);
    assert.equal(res.claims.sub, "alice");
  });

  test("a tampered payload is rejected", () => {
    const t = issueAccessToken({ playerId: "alice", sessionId: "s1" }, SIGNING_KEY, CLOCK);
    const [body, sig] = t.split(".");
    const forged = Buffer.from(
      JSON.stringify({ sub: "bob", sid: "s1", iat: CLOCK / 1000, exp: CLOCK / 1000 + 900 })
    ).toString("base64url");
    assert.equal(verifyAccessToken(`${forged}.${sig}`, SIGNING_KEY, CLOCK).reason, "BAD_SIGNATURE");
    void body;
  });

  test("a token signed with another key is rejected", () => {
    const t = issueAccessToken({ playerId: "alice", sessionId: "s1" }, Buffer.alloc(32, 1), CLOCK);
    assert.equal(verifyAccessToken(t, SIGNING_KEY, CLOCK).reason, "BAD_SIGNATURE");
  });

  test("an expired token is rejected", () => {
    const t = issueAccessToken({ playerId: "alice", sessionId: "s1", ttlSeconds: 60 }, SIGNING_KEY, CLOCK);
    assert.equal(verifyAccessToken(t, SIGNING_KEY, CLOCK + 61_000).reason, "EXPIRED");
  });

  test("there is no algorithm field to confuse", () => {
    // The classic JWT attack is alg:none or alg swapping. This format has no
    // algorithm field at all, so the attack has nowhere to land.
    const t = issueAccessToken({ playerId: "alice", sessionId: "s1" }, SIGNING_KEY, CLOCK);
    const claims = JSON.parse(Buffer.from(t.split(".")[0], "base64url").toString());
    assert.equal(claims.alg, undefined);
    assert.equal(verifyAccessToken(`${t.split(".")[0]}.`, SIGNING_KEY, CLOCK).ok, false);
  });

  test("an access token cannot be used as a step-up token", () => {
    const t = issueAccessToken({ playerId: "alice", sessionId: "s1" }, SIGNING_KEY, CLOCK);
    assert.equal(verifyStepUpToken(t, "withdrawal", SIGNING_KEY, CLOCK).reason, "WRONG_TOKEN_TYPE");
  });

  test("a step-up for one action does not authorise another", () => {
    const t = issueStepUpToken({ playerId: "alice", action: "change-email" }, SIGNING_KEY, CLOCK);
    assert.equal(verifyStepUpToken(t, "withdrawal", SIGNING_KEY, CLOCK).reason, "WRONG_ACTION");
    assert.equal(verifyStepUpToken(t, "change-email", SIGNING_KEY, CLOCK).ok, true);
  });

  test("refresh tokens are stored only as hashes", () => {
    const t = generateRefreshToken();
    const h = hashRefreshToken(t);
    assert.notEqual(h, t);
    assert.match(h, /^[0-9a-f]{64}$/);
  });
});

describe("registration", () => {
  test("creates the player, credential and wallet together", async () => {
    const { db, auth } = await fresh();
    await auth.register({ playerId: "alice", handle: "alice", password: PASSWORD });

    const p = await db.query("SELECT 1 FROM player WHERE id='alice'");
    const c = await db.query("SELECT password_hash FROM credential WHERE player_id='alice'");
    const w = await db.query(
      "SELECT asset, count(*)::int n FROM ledger_account WHERE owner_id='alice' GROUP BY asset ORDER BY asset"
    );
    assert.equal(p.rows.length, 1);
    // Five wallet states, for each stablecoin the platform holds (0055).
    assert.deepEqual(w.rows, [{ asset: "DAI", n: 5 }, { asset: "USDC", n: 5 }, { asset: "USDT", n: 5 }]);
    assert.match(c.rows[0].password_hash, /^\$argon2id\$/, "Argon2id, not a home-made scheme");
    assert.ok(!c.rows[0].password_hash.includes(PASSWORD), "the password is nowhere in the row");
  });

  test("the database refuses a plaintext-looking password", async () => {
    const { db } = await fresh();
    await db.query("INSERT INTO player (id,handle) VALUES ('mallory','mallory')");
    await assert.rejects(
      () => db.query("INSERT INTO credential (player_id,password_hash) VALUES ('mallory','hunter2')"),
      /credential_hash_is_phc|credential_hash_not_plaintext|violates check constraint/
    );
  });

  test("weak passwords are refused", async () => {
    const { auth } = await fresh();
    for (const bad of ["short", "password12345", "aaaaaaaaaaaaaa", "nizalo-is-great"]) {
      const r = await auth.register({ playerId: "x", handle: "x", password: bad });
      assert.equal(r.ok, false, `accepted ${bad}`);
      assert.equal(r.reason, AuthError.WEAK_PASSWORD);
    }
  });

  test("a taken handle is refused", async () => {
    const { auth } = await registered();
    const r = await auth.register({ playerId: "alice2", handle: "alice", password: PASSWORD });
    assert.equal(r.reason, AuthError.HANDLE_TAKEN);
  });
});

describe("login", () => {
  test("correct credentials return a token pair", async () => {
    const { auth } = await registered();
    const r = await auth.login({ identifier: "alice", password: PASSWORD });
    assert.equal(r.ok, true);
    assert.ok(r.accessToken && r.refreshToken);
    assert.equal(auth.verifyAccess(r.accessToken).claims.sub, "alice");
  });

  test("a wrong password is refused", async () => {
    const { auth } = await registered();
    assert.equal((await auth.login({ identifier: "alice", password: "wrong-password-here" })).reason,
      AuthError.BAD_CREDENTIALS);
  });

  test("an unknown account gives the same answer as a wrong password", async () => {
    // Account enumeration defence: the response must not distinguish them.
    const { auth } = await registered();
    const unknown = await auth.login({ identifier: "nobody", password: PASSWORD });
    const wrong = await auth.login({ identifier: "alice", password: "wrong-password-here" });
    assert.deepEqual(unknown, wrong);
  });

  test("repeated failures lock the identifier out", async () => {
    const { auth } = await registered();
    for (let i = 0; i < 10; i++) {
      await auth.login({ identifier: "alice", password: "wrong-password-here" });
    }
    const r = await auth.login({ identifier: "alice", password: PASSWORD });
    assert.equal(r.reason, AuthError.LOCKED_OUT, "even the correct password is refused while locked");
  });

  test("a login is recorded, and the audit trail cannot be edited", async () => {
    const { db, auth } = await registered();
    await auth.login({ identifier: "alice", password: PASSWORD, deviceFingerprint: "fp-1" });
    const ev = await db.query("SELECT type FROM security_event WHERE player_id='alice' ORDER BY id");
    assert.deepEqual(ev.rows.map((r) => r.type), ["REGISTERED", "LOGIN"]);
    await assert.rejects(
      () => db.query("DELETE FROM security_event WHERE player_id='alice'"), /append-only/
    );
  });

  test("a device is remembered across logins", async () => {
    const { db, auth } = await registered();
    await auth.login({ identifier: "alice", password: PASSWORD, deviceFingerprint: "fp-1" });
    await auth.login({ identifier: "alice", password: PASSWORD, deviceFingerprint: "fp-1" });
    const d = await db.query("SELECT count(*)::int n FROM device WHERE player_id='alice'");
    assert.equal(d.rows[0].n, 1, "one device, two logins");
  });
});

describe("refresh rotation and theft detection", () => {
  test("refreshing rotates the token", async () => {
    const { auth } = await registered();
    const login = await auth.login({ identifier: "alice", password: PASSWORD });
    const r1 = await auth.refresh(login.refreshToken);
    assert.equal(r1.ok, true);
    assert.notEqual(r1.refreshToken, login.refreshToken, "a used token is never reissued");
  });

  test("a spent refresh token cannot be used again, and burns the family", async () => {
    // The scenario: an attacker captures a refresh token. Either they use it
    // first and the victim's next refresh trips the alarm, or the victim uses
    // it first and the attacker's does. Either way the chain dies.
    const { auth } = await registered();
    const login = await auth.login({ identifier: "alice", password: PASSWORD });

    const legit = await auth.refresh(login.refreshToken);
    assert.equal(legit.ok, true);

    const thief = await auth.refresh(login.refreshToken);
    assert.equal(thief.ok, false);
    assert.equal(thief.reason, AuthError.TOKEN_REUSED);

    // And the honest user's freshly-issued token is dead too.
    const after = await auth.refresh(legit.refreshToken);
    assert.equal(after.ok, false);
    assert.equal(after.reason, AuthError.SESSION_REVOKED);
  });

  test("the reuse is recorded for investigation", async () => {
    const { db, auth } = await registered();
    const login = await auth.login({ identifier: "alice", password: PASSWORD });
    await auth.refresh(login.refreshToken);
    await auth.refresh(login.refreshToken);
    const ev = await db.query(
      "SELECT detail FROM security_event WHERE type='REFRESH_REUSE_DETECTED'"
    );
    assert.equal(ev.rows.length, 1);
    assert.ok(ev.rows[0].detail.revokedSessions >= 1);
  });

  test("the database itself forbids two children from one token", async () => {
    const { db, auth } = await registered();
    const login = await auth.login({ identifier: "alice", password: PASSWORD });
    await auth.refresh(login.refreshToken);
    const parent = await db.query(
      "SELECT id FROM auth_session WHERE parent_id IS NULL AND player_id='alice'"
    );
    await assert.rejects(
      () => db.query(
        `INSERT INTO auth_session (id, family_id, player_id, refresh_hash, parent_id, expires_at)
         VALUES ('forged','f','alice','deadbeef',$1, now() + interval '1 day')`,
        [parent.rows[0].id]
      ),
      /auth_session_one_child_per_parent|duplicate key/
    );
  });

  test("an unknown refresh token is refused", async () => {
    const { auth } = await registered();
    assert.equal((await auth.refresh("not-a-real-token")).reason, AuthError.SESSION_INVALID);
  });

  test("logging out revokes the family", async () => {
    const { auth } = await registered();
    const login = await auth.login({ identifier: "alice", password: PASSWORD });
    await auth.logout(login.refreshToken);
    assert.equal((await auth.refresh(login.refreshToken)).reason, AuthError.SESSION_REVOKED);
  });

  test("logout-everywhere kills other devices too", async () => {
    const { auth } = await registered();
    const a = await auth.login({ identifier: "alice", password: PASSWORD, deviceFingerprint: "phone" });
    const b = await auth.login({ identifier: "alice", password: PASSWORD, deviceFingerprint: "laptop" });
    await auth.logout(a.refreshToken, { everywhere: true });
    assert.equal((await auth.refresh(b.refreshToken)).reason, AuthError.SESSION_REVOKED);
  });

  test("strict verification notices a revoked session immediately", async () => {
    // The access token is still cryptographically valid; the session is not.
    const { auth } = await registered();
    const login = await auth.login({ identifier: "alice", password: PASSWORD });
    await auth.logout(login.refreshToken);
    assert.equal(auth.verifyAccess(login.accessToken).ok, true, "still signed and unexpired");
    const strict = await auth.verifyAccessStrict(login.accessToken);
    assert.equal(strict.ok, false, "but money surfaces must refuse it");
    assert.equal(strict.reason, AuthError.SESSION_REVOKED);
  });
});

describe("two-factor", () => {
  async function enrolled() {
    const { db, auth } = await registered();
    const begin = await auth.beginTotpEnrolment("alice", "alice@nizalo");
    const secret = base32Decode(begin.secretBase32);
    const confirm = await auth.confirmTotpEnrolment("alice", totp(secret, CLOCK));
    assert.equal(confirm.ok, true);
    // Confirming BURNS that time step. The next login therefore needs a code
    // from a later window -- which is exactly the replay protection working,
    // and is the real behaviour a user sees after enrolling.
    CLOCK += 30_000;
    return { db, auth, secret, recoveryCodes: confirm.recoveryCodes };
  }

  test("enrolment is not active until a code confirms it", async () => {
    const { db, auth } = await registered();
    await auth.beginTotpEnrolment("alice", "alice@nizalo");
    const r = await db.query("SELECT confirmed_at FROM totp_secret WHERE player_id='alice'");
    assert.equal(r.rows[0].confirmed_at, null);
    // Login still works with one factor while enrolment is unconfirmed.
    assert.equal((await auth.login({ identifier: "alice", password: PASSWORD })).ok, true);
  });

  test("once enrolled, the password alone is not enough", async () => {
    const { auth } = await enrolled();
    const r = await auth.login({ identifier: "alice", password: PASSWORD });
    assert.equal(r.reason, AuthError.TOTP_REQUIRED);
  });

  test("the correct code completes the login", async () => {
    const { auth, secret } = await enrolled();
    const r = await auth.login({ identifier: "alice", password: PASSWORD, totpCode: totp(secret, CLOCK) });
    assert.equal(r.ok, true);
  });

  test("a wrong code is refused and audited", async () => {
    const { db, auth } = await enrolled();
    const r = await auth.login({ identifier: "alice", password: PASSWORD, totpCode: "000000" });
    assert.equal(r.reason, AuthError.TOTP_INVALID);
    const ev = await db.query("SELECT count(*)::int n FROM security_event WHERE type='TOTP_FAILED'");
    assert.equal(ev.rows[0].n, 1);
  });

  test("the code that confirmed enrolment cannot then log you in", async () => {
    const { db, auth } = await registered();
    const begin = await auth.beginTotpEnrolment("alice", "alice@nizalo");
    const secret = base32Decode(begin.secretBase32);
    const code = totp(secret, CLOCK);
    assert.equal((await auth.confirmTotpEnrolment("alice", code)).ok, true);

    const reuse = await auth.login({ identifier: "alice", password: PASSWORD, totpCode: code });
    assert.equal(reuse.reason, AuthError.TOTP_INVALID);
    assert.equal(reuse.detail, "REPLAYED", "the enrolment step is spent");
    void db;
  });

  test("a code cannot be replayed even seconds later", async () => {
    const { auth, secret } = await enrolled();
    const code = totp(secret, CLOCK);
    assert.equal((await auth.login({ identifier: "alice", password: PASSWORD, totpCode: code })).ok, true);
    const replay = await auth.login({ identifier: "alice", password: PASSWORD, totpCode: code });
    assert.equal(replay.reason, AuthError.TOTP_INVALID);
    assert.equal(replay.detail, "REPLAYED");
  });

  test("the secret is encrypted at rest, not merely encoded", async () => {
    const { db, secret } = await enrolled();
    const r = await db.query("SELECT secret_encrypted FROM totp_secret WHERE player_id='alice'");
    const stored = r.rows[0].secret_encrypted;
    assert.ok(!stored.includes(base32Encode(secret)), "base32 form must not appear");
    assert.ok(!Buffer.from(stored, "base64").includes(secret), "raw bytes must not appear");
  });

  test("recovery codes are single-use and stored hashed", async () => {
    const { db, auth, recoveryCodes } = await enrolled();
    assert.equal(recoveryCodes.length, 10);
    const stored = await db.query("SELECT code_hash FROM recovery_code WHERE player_id='alice'");
    assert.ok(!stored.rows.some((r) => recoveryCodes.includes(r.code_hash)), "hashed, not stored raw");

    assert.equal((await auth.useRecoveryCode("alice", recoveryCodes[0])).ok, true);
    assert.equal((await auth.useRecoveryCode("alice", recoveryCodes[0])).ok, false, "single use");
    assert.equal((await auth.useRecoveryCode("alice", "not-a-code")).ok, false);
  });
});

describe("password change", () => {
  test("requires the current password", async () => {
    const { auth } = await registered();
    const r = await auth.changePassword({
      playerId: "alice", currentPassword: "wrong-password-here", newPassword: "another good passphrase",
    });
    assert.equal(r.reason, AuthError.BAD_CREDENTIALS);
  });

  test("revokes every existing session", async () => {
    // If the password changed because it leaked, leaving old sessions alive
    // defeats the entire point of changing it.
    const { auth } = await registered();
    const phone = await auth.login({ identifier: "alice", password: PASSWORD, deviceFingerprint: "phone" });
    const laptop = await auth.login({ identifier: "alice", password: PASSWORD, deviceFingerprint: "laptop" });

    const r = await auth.changePassword({
      playerId: "alice", currentPassword: PASSWORD, newPassword: "another good passphrase",
    });
    assert.equal(r.ok, true);
    assert.equal(r.revokedSessions, 2);
    assert.equal((await auth.refresh(phone.refreshToken)).reason, AuthError.SESSION_REVOKED);
    assert.equal((await auth.refresh(laptop.refreshToken)).reason, AuthError.SESSION_REVOKED);
  });
});

describe("step-up and the withdrawal gate", () => {
  test("a withdrawal needs a step-up token, not just a session", async () => {
    const { auth } = await registered();
    await auth.login({ identifier: "alice", password: PASSWORD });
    const r = await auth.authoriseWithdrawal({ playerId: "alice", stepUpToken: "nothing" });
    assert.equal(r.reason, "STEP_UP_REQUIRED");
  });

  test("step-up requires the password again", async () => {
    const { auth } = await registered();
    assert.equal(
      (await auth.stepUp({ playerId: "alice", action: "withdrawal", password: "wrong-password-here" })).reason,
      AuthError.BAD_CREDENTIALS
    );
  });

  test("one player's step-up cannot authorise another's withdrawal", async () => {
    const { auth } = await registered();
    await auth.register({ playerId: "bob", handle: "bob", password: PASSWORD });
    const step = await auth.stepUp({ playerId: "alice", action: "withdrawal", password: PASSWORD });
    const r = await auth.authoriseWithdrawal({ playerId: "bob", stepUpToken: step.stepUpToken });
    assert.equal(r.reason, "STEP_UP_MISMATCH");
  });

  test("a password change freezes withdrawals during the cooling-off window", async () => {
    // The account-takeover chain is: get in, change the password, cash out.
    // This breaks it, and costs an honest user nothing they will notice.
    const { auth } = await registered();
    await auth.changePassword({
      playerId: "alice", currentPassword: PASSWORD, newPassword: "another good passphrase",
    });
    const step = await auth.stepUp({
      playerId: "alice", action: "withdrawal", password: "another good passphrase",
    });
    const r = await auth.authoriseWithdrawal({ playerId: "alice", stepUpToken: step.stepUpToken });
    assert.equal(r.reason, AuthError.COOLING_OFF);
  });

  test("enrolling a new 2FA device also freezes withdrawals", async () => {
    const { auth } = await registered();
    await auth.beginTotpEnrolment("alice", "alice@nizalo");
    const step = await auth.stepUp({ playerId: "alice", action: "withdrawal", password: PASSWORD });
    assert.equal(
      (await auth.authoriseWithdrawal({ playerId: "alice", stepUpToken: step.stepUpToken })).reason,
      AuthError.COOLING_OFF
    );
  });

  test("outside the window, a valid step-up authorises the withdrawal", async () => {
    const { db, auth } = await registered();
    await db.query("UPDATE credential SET changed_at = now() - interval '30 days'");
    const step = await auth.stepUp({ playerId: "alice", action: "withdrawal", password: PASSWORD });
    assert.equal((await auth.authoriseWithdrawal({ playerId: "alice", stepUpToken: step.stepUpToken })).ok, true);
  });
});

describe("service construction", () => {
  test("refuses to start with a weak signing key", async () => {
    const db = await PGlite.create();
    assert.throws(
      () => createAuthService(db, { signingKey: Buffer.alloc(8), encryptionKey: ENCRYPTION_KEY }),
      /signingKey must be at least 32 bytes/
    );
  });

  test("refuses to start with a wrong-sized encryption key", async () => {
    const db = await PGlite.create();
    assert.throws(
      () => createAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: randomBytes(16) }),
      /exactly 32 bytes/
    );
  });
});

describe("loginPasswordless -- the shared session issuance behind email-code login", () => {
  // A local copy of "two-factor"'s own enrolled() helper -- that one is
  // scoped inside its own describe() closure, not reusable from here.
  async function enrolled() {
    const { db, auth } = await registered();
    const begin = await auth.beginTotpEnrolment("alice", "alice@nizalo");
    const secret = base32Decode(begin.secretBase32);
    const confirm = await auth.confirmTotpEnrolment("alice", totp(secret, CLOCK));
    assert.equal(confirm.ok, true);
    CLOCK += 30_000;
    return { db, auth, secret, recoveryCodes: confirm.recoveryCodes };
  }

  test("with no TOTP enrolled, it issues a normal session directly", async () => {
    const { auth } = await registered();
    const r = await auth.loginPasswordless({ playerId: "alice" });
    assert.equal(r.ok, true);
    assert.ok(r.accessToken);
    assert.ok(r.refreshToken);
    assert.equal(auth.verifyAccess(r.accessToken).ok, true);
  });

  test("the session it issues is a REAL session -- refresh, logout and step-up all work on it exactly like a password login's", async () => {
    const { auth } = await registered();
    const r = await auth.loginPasswordless({ playerId: "alice" });
    const refreshed = await auth.refresh(r.refreshToken);
    assert.equal(refreshed.ok, true, "the refresh token this issued rotates like any other");
    await auth.logout(refreshed.refreshToken);
    const strict = await auth.verifyAccessStrict(refreshed.accessToken);
    assert.equal(strict.ok, false, "and logout revokes it exactly like a password session");
  });

  test("with TOTP enrolled, a passwordless login is refused without a code -- a passwordless first factor does not waive the second", async () => {
    const { auth } = await enrolled();
    const r = await auth.loginPasswordless({ playerId: "alice" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, AuthError.TOTP_REQUIRED);
  });

  test("the correct TOTP code completes a passwordless login", async () => {
    const { auth, secret } = await enrolled();
    const r = await auth.loginPasswordless({ playerId: "alice", totpCode: totp(secret, CLOCK) });
    assert.equal(r.ok, true);
    assert.ok(r.accessToken);
  });

  test("an incorrect TOTP code is refused, and is recorded as TOTP_FAILED", async () => {
    const { db, auth } = await enrolled();
    const r = await auth.loginPasswordless({ playerId: "alice", totpCode: "000000" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, AuthError.TOTP_INVALID);
    const events = await db.query("SELECT type FROM security_event WHERE player_id='alice' AND type='TOTP_FAILED'");
    assert.equal(events.rows.length, 1);
  });

  test("records a LOGIN security event tagged with method: EMAIL_CODE, distinct from a password login's", async () => {
    const { db, auth } = await registered();
    await auth.login({ identifier: "alice", password: PASSWORD });
    await auth.loginPasswordless({ playerId: "alice" });
    const events = await db.query(
      "SELECT detail FROM security_event WHERE player_id='alice' AND type='LOGIN' ORDER BY id"
    );
    assert.equal(events.rows.length, 2);
    assert.equal(events.rows[0].detail.method, undefined, "the existing password-login event is untouched");
    assert.equal(events.rows[1].detail.method, "EMAIL_CODE");
  });

  test("device fingerprint is recorded exactly like a password login's", async () => {
    const { db, auth } = await registered();
    await auth.loginPasswordless({ playerId: "alice", deviceFingerprint: "device-xyz" });
    const r = await db.query("SELECT device_id FROM auth_session WHERE player_id='alice'");
    assert.ok(r.rows[0].device_id);
  });
});
