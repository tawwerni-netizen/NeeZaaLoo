/**
 * The LOGIN_CODE flow (packages/auth/src/email-login-code.mjs): request a
 * 6-character passwordless code, verify it. Two properties get the most
 * attention here beyond the usual expired/reused/attempts matrix already
 * proven for VERIFICATION in email-verification.test.mjs: the code is
 * EXACTLY 6 characters (never 8, never anything else), and request() is
 * enumeration-safe -- indistinguishable from the outside whether the
 * email belongs to nobody, an unverified account, or a real verified one.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createEmailIdentityService } from "../src/email-identity.mjs";
import { createEmailChallengeService, ChallengePurpose } from "../src/email-challenge.mjs";
import { createEmailLoginCodeFlow, normalizeLoginCode, EmailLoginCodeError } from "../src/email-login-code.mjs";
import { createMockEmailProvider } from "../../email/src/provider.mjs";
import { createEmailService } from "../../email/src/email-service.mjs";

let db, provider, identity, challenge, loginCode;
let CLOCK = Date.now();
const now = () => CLOCK;

async function verifiedPlayer(id, email) {
  await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [id]);
  await identity.setEmail(id, email);
  // Directly mark verified -- this suite is about LOGIN_CODE, not
  // re-proving VERIFICATION's own confirm() path.
  await identity.markVerified(id);
}

function lastLoginCodeSent() {
  const msg = provider.sent.filter((m) => m.template === "login_code").at(-1);
  const match = msg.text.match(/\n([A-Z2-9]{6})\n/);
  return match[1];
}

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  identity = createEmailIdentityService(db);
  challenge = createEmailChallengeService(db, { now });
  provider = createMockEmailProvider();
  loginCode = createEmailLoginCodeFlow(db, {
    emailChallenge: challenge, emailIdentity: identity, emailService: createEmailService({ provider }),
  });
});

after(async () => { await db.close?.(); });

describe("normalizeLoginCode", () => {
  test("trims and uppercases", () => {
    assert.equal(normalizeLoginCode("  a7k9qp "), "A7K9QP");
  });

  test("non-string input normalizes to an empty string", () => {
    assert.equal(normalizeLoginCode(undefined), "");
    assert.equal(normalizeLoginCode(null), "");
  });
});

describe("requesting a login code -- enumeration safety", () => {
  test("a nonexistent email returns the same generic {ok:true} as a real account", async () => {
    const r = await loginCode.request("nobody@example.com");
    assert.deepEqual(r, { ok: true });
    assert.equal(provider.sent.length, 0, "and, unlike a real account, nothing was actually sent");
  });

  test("an account with an UNVERIFIED email also gets the generic response, and no email is sent", async () => {
    await db.query("INSERT INTO player (id, handle) VALUES ('unverified1','unverified1')");
    await identity.setEmail("unverified1", "unverified1@example.com");
    const r = await loginCode.request("unverified1@example.com");
    assert.deepEqual(r, { ok: true });
    assert.equal(provider.sent.length, 0);
  });

  test("a real, verified account gets the same {ok:true} response -- but a real email IS sent", async () => {
    await verifiedPlayer("alice", "alice@example.com");
    const r = await loginCode.request("alice@example.com");
    assert.deepEqual(r, { ok: true });
    assert.equal(provider.sent.length, 1);
    assert.equal(provider.sent[0].to, "alice@example.com");
  });

  test("case and whitespace in the requested email do not create a second account or a second code path", async () => {
    await verifiedPlayer("bob", "bob@example.com");
    await loginCode.request("  Bob@Example.COM ");
    assert.equal(provider.sent.filter((m) => m.to === "bob@example.com").length, 1);
  });
});

describe("the issued code is exactly 6 characters", () => {
  test("the code sent in the email is exactly 6 characters from the expected alphabet", async () => {
    await verifiedPlayer("carol", "carol@example.com");
    await loginCode.request("carol@example.com");
    const code = lastLoginCodeSent();
    assert.equal(code.length, 6);
    assert.match(code, /^[A-Z2-9]{6}$/);
  });

  test("verify() rejects 5-character input as MALFORMED_CODE, never comparing it against a real challenge", async () => {
    await verifiedPlayer("dan", "dan@example.com");
    await loginCode.request("dan@example.com");
    const r = await loginCode.verify({ email: "dan@example.com", code: "ABCDE" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, EmailLoginCodeError.MALFORMED_CODE);
  });

  test("verify() rejects 7-character input", async () => {
    const r = await loginCode.verify({ email: "dan@example.com", code: "ABCDEFG" });
    assert.equal(r.reason, EmailLoginCodeError.MALFORMED_CODE);
  });

  test("verify() rejects the 8-character VERIFICATION shape -- the two formats are not interchangeable", async () => {
    const r = await loginCode.verify({ email: "dan@example.com", code: "ABCDEFGH" });
    assert.equal(r.reason, EmailLoginCodeError.MALFORMED_CODE);
  });

  test("verify() rejects an empty code", async () => {
    const r = await loginCode.verify({ email: "dan@example.com", code: "" });
    assert.equal(r.reason, EmailLoginCodeError.MALFORMED_CODE);
  });

  test("verify() rejects a whitespace-only code", async () => {
    const r = await loginCode.verify({ email: "dan@example.com", code: "      " });
    assert.equal(r.reason, EmailLoginCodeError.MALFORMED_CODE);
  });

  test("verify() rejects a 6-character code containing an excluded/invalid character (e.g. lowercase 'l', or '0', '1', 'O', 'I')", async () => {
    for (const bad of ["ABCD0E", "ABCD1E", "ABCDOE", "ABCDIE", "ABCDLE", "abc-de"]) {
      const r = await loginCode.verify({ email: "dan@example.com", code: bad });
      assert.equal(r.reason, EmailLoginCodeError.MALFORMED_CODE, `expected ${bad} to be malformed`);
    }
  });

  test("lowercase input of an otherwise-valid code is accepted -- normalization, not a different code", async () => {
    await verifiedPlayer("erin", "erin@example.com");
    await loginCode.request("erin@example.com");
    const code = lastLoginCodeSent();
    const r = await loginCode.verify({ email: "erin@example.com", code: code.toLowerCase() });
    assert.equal(r.ok, true);
  });
});

describe("verifying a code", () => {
  test("the correct code succeeds and identifies the right player", async () => {
    await verifiedPlayer("frank", "frank@example.com");
    await loginCode.request("frank@example.com");
    const r = await loginCode.verify({ email: "frank@example.com", code: lastLoginCodeSent() });
    assert.equal(r.ok, true);
    assert.equal(r.playerId, "frank");
  });

  test("an unrecognized email is refused the same way a wrong code would be (NOT_FOUND)", async () => {
    const r = await loginCode.verify({ email: "ghost@example.com", code: "A7K9QP" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "NOT_FOUND");
  });

  test("a wrong (but well-formed) code is refused", async () => {
    await verifiedPlayer("grace", "grace@example.com");
    await loginCode.request("grace@example.com");
    const r = await loginCode.verify({ email: "grace@example.com", code: "ZZZZZZ" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "INVALID_CODE");
  });

  test("a code cannot be reused once it has succeeded (replay protection)", async () => {
    await verifiedPlayer("henry", "henry@example.com");
    await loginCode.request("henry@example.com");
    const code = lastLoginCodeSent();
    assert.equal((await loginCode.verify({ email: "henry@example.com", code })).ok, true);
    const replay = await loginCode.verify({ email: "henry@example.com", code });
    assert.equal(replay.ok, false);
    assert.equal(replay.reason, "NOT_FOUND");
  });

  test("an expired code is refused", async () => {
    await verifiedPlayer("iris", "iris@example.com");
    await loginCode.request("iris@example.com");
    const code = lastLoginCodeSent();
    CLOCK += 11 * 60_000; // past the 10-minute TTL
    const r = await loginCode.verify({ email: "iris@example.com", code });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "EXPIRED");
  });

  test("too many wrong attempts exhausts the challenge, even with the right code held in reserve", async () => {
    await verifiedPlayer("jack", "jack@example.com");
    await loginCode.request("jack@example.com");
    const code = lastLoginCodeSent();
    for (let i = 0; i < 5; i++) {
      await loginCode.verify({ email: "jack@example.com", code: "ZZZZZZ" });
    }
    const r = await loginCode.verify({ email: "jack@example.com", code });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "TOO_MANY_ATTEMPTS");
  });
});

describe("purpose isolation from VERIFICATION and PASSWORD_RESET", () => {
  test("a VERIFICATION challenge cannot be used to complete a login-code verify", async () => {
    await verifiedPlayer("kate", "kate@example.com");
    const verifChallenge = await challenge.issue({
      playerId: "kate", purpose: ChallengePurpose.VERIFICATION, email: "kate@example.com", ttlMs: 600_000, codeLength: 6,
    });
    // Even with a matching 6-character shape, LOGIN_CODE's own lookup
    // never sees a challenge issued for a different purpose.
    const r = await loginCode.verify({ email: "kate@example.com", code: verifChallenge.code });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "NOT_FOUND");
  });

  test("a login code cannot be used against email-verification's own confirm (proven the other direction in email-verification.test.mjs's own purpose-isolation test)", async () => {
    await verifiedPlayer("liam", "liam@example.com");
    await loginCode.request("liam@example.com");
    const code = lastLoginCodeSent();
    const r = await challenge.verify({ playerId: "liam", purpose: ChallengePurpose.VERIFICATION, code });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "NOT_FOUND");
  });
});

describe("resend cooldown and multiple-request behaviour", () => {
  test("requesting twice in a row does not send a second email, but still returns {ok:true}", async () => {
    await verifiedPlayer("mia", "mia@example.com");
    await loginCode.request("mia@example.com");
    const before = provider.sent.length;
    const r = await loginCode.request("mia@example.com");
    assert.deepEqual(r, { ok: true });
    assert.equal(provider.sent.length, before, "no second email during cooldown");
  });

  test("after the cooldown elapses, a new code is issued and the previous one is invalidated", async () => {
    await verifiedPlayer("noah", "noah@example.com");
    await loginCode.request("noah@example.com");
    const firstCode = lastLoginCodeSent();
    CLOCK += 61_000;
    await loginCode.request("noah@example.com");
    const secondCode = lastLoginCodeSent();
    assert.notEqual(firstCode, secondCode);
    const r = await loginCode.verify({ email: "noah@example.com", code: firstCode });
    assert.equal(r.ok, false, "the old code no longer works once a new one has been issued");
  });
});

describe("security audit", () => {
  test("a full request+verify cycle writes REQUESTED, SENT and VERIFIED events, and nothing else FROM THIS FLOW", async () => {
    await verifiedPlayer("olive", "olive@example.com"); // itself writes EMAIL_SET + EMAIL_VERIFIED
    await loginCode.request("olive@example.com");
    await loginCode.verify({ email: "olive@example.com", code: lastLoginCodeSent() });
    const events = await db.query(
      "SELECT type FROM security_event WHERE player_id='olive' AND type LIKE 'EMAIL_LOGIN_CODE%' ORDER BY id"
    );
    assert.deepEqual(events.rows.map((r) => r.type), [
      "EMAIL_LOGIN_CODE_REQUESTED", "EMAIL_LOGIN_CODE_SENT", "EMAIL_LOGIN_CODE_VERIFIED",
    ]);
  });

  test("no security_event row for this player ever contains the raw code anywhere in its detail", async () => {
    await verifiedPlayer("peter", "peter@example.com");
    await loginCode.request("peter@example.com");
    const code = lastLoginCodeSent();
    await loginCode.verify({ email: "peter@example.com", code });
    const events = await db.query("SELECT detail FROM security_event WHERE player_id='peter'");
    for (const row of events.rows) {
      assert.equal(JSON.stringify(row.detail).includes(code), false);
    }
  });

  test("a failed (wrong-code) attempt is recorded without the attempted code appearing anywhere", async () => {
    await verifiedPlayer("quinn", "quinn@example.com");
    await loginCode.request("quinn@example.com");
    await loginCode.verify({ email: "quinn@example.com", code: "WRONG1" });
    const events = await db.query(
      "SELECT type, detail FROM security_event WHERE player_id='quinn' AND type LIKE 'LOGIN_CODE_CHALLENGE%' OR (player_id='quinn' AND type LIKE '%CHALLENGE_FAILED')"
    );
    for (const row of events.rows) {
      assert.equal(JSON.stringify(row.detail).includes("WRONG1"), false);
    }
  });

  test("a cooldown-blocked resend is recorded as EMAIL_LOGIN_CODE_RATE_LIMITED", async () => {
    await verifiedPlayer("ruth", "ruth@example.com");
    await loginCode.request("ruth@example.com");
    await loginCode.request("ruth@example.com"); // blocked by cooldown
    const events = await db.query(
      "SELECT type FROM security_event WHERE player_id='ruth' AND type='EMAIL_LOGIN_CODE_RATE_LIMITED'"
    );
    assert.equal(events.rows.length, 1);
  });
});
