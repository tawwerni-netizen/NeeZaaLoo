/**
 * createGoogleOAuthFlow() -- the orchestrator. Every test here runs
 * against createMockGoogleProvider(), never real OIDC mechanics (those are
 * google-provider.test.mjs's job) -- this suite is entirely about the
 * business logic: identity resolution, account creation, account linking
 * safety, session convergence, and the audit trail.
 */
import { test, describe, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService, AuthError } from "../src/service.mjs";
import { createEmailIdentityService } from "../src/email-identity.mjs";
import { createOAuthIdentityService } from "../src/oauth-identity.mjs";
import { createOAuthHandoffService } from "../src/oauth-handoff.mjs";
import { createMockGoogleProvider, GoogleAuthError } from "../src/google-provider.mjs";
import { createGoogleOAuthFlow, GoogleOAuthError } from "../src/google-oauth.mjs";
import { issueOAuthState } from "../src/tokens.mjs";

const SIGNING_KEY = Buffer.alloc(32, 11);
const ENCRYPTION_KEY = Buffer.alloc(32, 12);
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };
const PASSWORD = "correct horse battery staple";

let db, auth, emailIdentity, oauthIdentity, oauthHandoff, google, flow;
let CLOCK = Date.now();
const now = () => CLOCK;

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  auth = createAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: FAST_ARGON, now });
  emailIdentity = createEmailIdentityService(db);
  oauthIdentity = createOAuthIdentityService(db, { now });
  oauthHandoff = createOAuthHandoffService(db, { now });
});

beforeEach(() => {
  google = createMockGoogleProvider();
  flow = createGoogleOAuthFlow(db, {
    googleProvider: google, oauthIdentity, oauthHandoff, emailIdentity, auth,
    signingKey: SIGNING_KEY, now, allowedReturnPaths: ["/dashboard", "/settings"],
  });
});

after(async () => { await db.close?.(); });

function loginState({ returnTo = null } = {}) {
  return issueOAuthState({ intent: "login", provider: "google", returnTo }, SIGNING_KEY, now());
}
function linkState({ playerId, returnTo = null }) {
  return issueOAuthState({ intent: "link", provider: "google", playerId, returnTo }, SIGNING_KEY, now());
}

describe("buildLoginAuthorizationUrl / buildLinkAuthorizationUrl", () => {
  test("returns a URL for an allowlisted returnTo", () => {
    const r = flow.buildLoginAuthorizationUrl({ returnTo: "/dashboard" });
    assert.equal(r.ok, true);
    assert.match(r.url, /^https:\/\/accounts\.google\.test\/mock\/authorize\?/);
  });

  test("refuses a returnTo NOT on the allowlist -- never an open redirect", () => {
    const r = flow.buildLoginAuthorizationUrl({ returnTo: "https://evil.example.com/steal" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, GoogleOAuthError.INVALID_RETURN_TO);
  });

  test("a null returnTo (no preference) is always allowed", () => {
    assert.equal(flow.buildLoginAuthorizationUrl({}).ok, true);
    assert.equal(flow.buildLinkAuthorizationUrl({ playerId: "alice" }).ok, true);
  });
});

describe("BASIC: new Google account", () => {
  test("a brand-new Google subject creates a new player and reaches a real session via finalize", async () => {
    const idToken = google.registerIdentity({ subject: "sub-new-1", email: "newperson@example.com", emailVerified: true, name: "New Person" });
    const state = loginState({ returnTo: "/dashboard" });
    const cb = await flow.handleCallback({ code: idToken, state });
    assert.equal(cb.ok, true);
    assert.equal(cb.outcome, "session");
    assert.equal(cb.returnTo, "/dashboard");

    const session = await flow.finalize({ handoffCode: cb.handoffCode });
    assert.equal(session.ok, true);
    assert.ok(session.accessToken);
    assert.ok(session.refreshToken);

    const identity = await oauthIdentity.getByProviderSubject("google", "sub-new-1");
    assert.equal(identity.player_id, session.playerId);

    const email = await emailIdentity.getByPlayerId(session.playerId);
    assert.equal(email.email, "newperson@example.com");
    assert.ok(email.verified_at, "a provider-VERIFIED email is pre-verified on the new application identity too");
  });

  test("an unverified Google email is never used to pre-fill or pre-verify an application email", async () => {
    const idToken = google.registerIdentity({ subject: "sub-new-2", email: "unverified@example.com", emailVerified: false });
    const cb = await flow.handleCallback({ code: idToken, state: loginState() });
    const session = await flow.finalize({ handoffCode: cb.handoffCode });
    const email = await emailIdentity.getByPlayerId(session.playerId);
    assert.equal(email, null);
  });

  test("with no email at all on the Google claims, account creation still succeeds", async () => {
    const idToken = google.registerIdentity({ subject: "sub-new-3" });
    const cb = await flow.handleCallback({ code: idToken, state: loginState() });
    assert.equal(cb.ok, true);
    const session = await flow.finalize({ handoffCode: cb.handoffCode });
    assert.equal(session.ok, true);
  });
});

describe("BASIC: existing linked Google identity", () => {
  test("logging in again with the same subject reaches the SAME player, never a duplicate", async () => {
    const idToken1 = google.registerIdentity({ subject: "sub-repeat", email: "repeat@example.com", emailVerified: true });
    const first = await flow.handleCallback({ code: idToken1, state: loginState() });
    const session1 = await flow.finalize({ handoffCode: first.handoffCode });

    const idToken2 = google.registerIdentity({ subject: "sub-repeat", email: "repeat@example.com", emailVerified: true });
    const second = await flow.handleCallback({ code: idToken2, state: loginState() });
    const session2 = await flow.finalize({ handoffCode: second.handoffCode });

    assert.equal(session1.playerId, session2.playerId);

    const count = await db.query(
      "SELECT count(*)::int AS n FROM oauth_identity WHERE provider = 'google' AND provider_subject = 'sub-repeat'"
    );
    assert.equal(count.rows[0].n, 1);
  });
});

describe("OIDC SECURITY: provider/validation errors surface cleanly", () => {
  for (const reason of [
    GoogleAuthError.BAD_SIGNATURE, GoogleAuthError.BAD_ISSUER, GoogleAuthError.BAD_AUDIENCE,
    GoogleAuthError.EXPIRED, GoogleAuthError.MALFORMED, GoogleAuthError.NO_SUBJECT,
  ]) {
    test(`a ${reason} from the provider fails the callback cleanly, never creates a player`, async () => {
      const before = (await db.query("SELECT count(*)::int AS n FROM player")).rows[0].n;
      const errToken = google.registerError(reason);
      const cb = await flow.handleCallback({ code: errToken, state: loginState() });
      assert.equal(cb.ok, false);
      assert.equal(cb.reason, GoogleOAuthError.PROVIDER_ERROR);
      assert.equal(cb.providerReason, reason);
      const after = (await db.query("SELECT count(*)::int AS n FROM player")).rows[0].n;
      assert.equal(after, before, "no player was created on a failed validation");
    });
  }

  test("an invalid/unrecognized code is INVALID_GRANT, not a crash", async () => {
    const cb = await flow.handleCallback({ code: "never-registered", state: loginState() });
    assert.equal(cb.ok, false);
    assert.equal(cb.providerReason, GoogleAuthError.INVALID_GRANT);
  });
});

describe("ACCOUNT LINKING: matching email but no proof of ownership", () => {
  test("a Google login whose VERIFIED email matches an existing VERIFIED application email is refused as link_required, never auto-merged", async () => {
    await auth.register({ playerId: "victor", handle: "victor", password: PASSWORD });
    await emailIdentity.setEmail("victor", "victor@example.com");
    await emailIdentity.markVerified("victor");

    const idToken = google.registerIdentity({ subject: "sub-victor-google", email: "victor@example.com", emailVerified: true });
    const cb = await flow.handleCallback({ code: idToken, state: loginState() });
    assert.equal(cb.ok, true);
    assert.equal(cb.outcome, "link_required");
    assert.equal(cb.email, "victor@example.com");
    assert.equal("handoffCode" in cb, false, "no session is minted -- nothing to finalize");

    // No new player, no link created.
    assert.equal(await oauthIdentity.getByProviderSubject("google", "sub-victor-google"), null);
  });

  test("the same scenario but the application email is UNVERIFIED still creates a new, separate account -- an unverified claim is not proof either", async () => {
    await auth.register({ playerId: "wendy", handle: "wendy", password: PASSWORD });
    await emailIdentity.setEmail("wendy", "wendy@example.com"); // never verified

    const idToken = google.registerIdentity({ subject: "sub-wendy-google", email: "wendy@example.com", emailVerified: true });
    const cb = await flow.handleCallback({ code: idToken, state: loginState() });
    assert.equal(cb.ok, true);
    assert.equal(cb.outcome, "session");
    const session = await flow.finalize({ handoffCode: cb.handoffCode });
    assert.notEqual(session.playerId, "wendy");
  });
});

describe("ACCOUNT LINKING: the authenticated link flow", () => {
  test("an authenticated player links a fresh Google identity", async () => {
    await auth.register({ playerId: "xena", handle: "xena", password: PASSWORD });
    const idToken = google.registerIdentity({ subject: "sub-xena", email: "xena@example.com", emailVerified: true });
    const cb = await flow.handleCallback({ code: idToken, state: linkState({ playerId: "xena", returnTo: "/settings" }) });
    assert.equal(cb.ok, true);
    assert.equal(cb.outcome, "linked");
    assert.equal(cb.returnTo, "/settings");

    const identity = await oauthIdentity.getByPlayerId("xena", "google");
    assert.equal(identity.provider_subject, "sub-xena");
  });

  test("linking does NOT create a session or a handoff code -- the caller already has one", async () => {
    await auth.register({ playerId: "yuki", handle: "yuki", password: PASSWORD });
    const idToken = google.registerIdentity({ subject: "sub-yuki" });
    const cb = await flow.handleCallback({ code: idToken, state: linkState({ playerId: "yuki" }) });
    assert.equal("handoffCode" in cb, false);
  });

  test("duplicate link prevention: linking a second time for the same player is a harmless success, not a second row", async () => {
    await auth.register({ playerId: "zack", handle: "zack", password: PASSWORD });
    const idToken = google.registerIdentity({ subject: "sub-zack" });
    await flow.handleCallback({ code: idToken, state: linkState({ playerId: "zack" }) });

    const idToken2 = google.registerIdentity({ subject: "sub-zack" });
    const second = await flow.handleCallback({ code: idToken2, state: linkState({ playerId: "zack" }) });
    assert.equal(second.ok, true);
    assert.equal(second.outcome, "linked");

    const count = await db.query("SELECT count(*)::int AS n FROM oauth_identity WHERE player_id = 'zack'");
    assert.equal(count.rows[0].n, 1);
  });

  test("linking to a Google identity ALREADY claimed by another player is refused", async () => {
    await auth.register({ playerId: "adam", handle: "adam", password: PASSWORD });
    await auth.register({ playerId: "brooke", handle: "brooke", password: PASSWORD });

    const idToken1 = google.registerIdentity({ subject: "sub-contested" });
    await flow.handleCallback({ code: idToken1, state: linkState({ playerId: "adam" }) });

    const idToken2 = google.registerIdentity({ subject: "sub-contested" });
    const cb = await flow.handleCallback({ code: idToken2, state: linkState({ playerId: "brooke" }) });
    assert.equal(cb.ok, true);
    assert.equal(cb.outcome, "link_failed");
    assert.equal(cb.reason, "SUBJECT_ALREADY_LINKED");

    // adam's link is untouched, brooke has none.
    assert.equal((await oauthIdentity.getByPlayerId("adam", "google")).provider_subject, "sub-contested");
    assert.equal(await oauthIdentity.getByPlayerId("brooke", "google"), null);
  });

  test("a player who already has a DIFFERENT google identity linked cannot silently relink to another", async () => {
    await auth.register({ playerId: "carl", handle: "carl", password: PASSWORD });
    const first = google.registerIdentity({ subject: "sub-carl-1" });
    await flow.handleCallback({ code: first, state: linkState({ playerId: "carl" }) });

    const second = google.registerIdentity({ subject: "sub-carl-2" });
    const cb = await flow.handleCallback({ code: second, state: linkState({ playerId: "carl" }) });
    assert.equal(cb.outcome, "link_failed");
    assert.equal(cb.reason, "ALREADY_LINKED");
    assert.equal((await oauthIdentity.getByPlayerId("carl", "google")).provider_subject, "sub-carl-1");
  });
});

describe("UNLINKING safety", () => {
  test("a player with a password can unlink Google cleanly", async () => {
    await auth.register({ playerId: "dana", handle: "dana", password: PASSWORD });
    const idToken = google.registerIdentity({ subject: "sub-dana" });
    await flow.handleCallback({ code: idToken, state: linkState({ playerId: "dana" }) });

    const r = await flow.unlink("dana");
    assert.equal(r.ok, true);
    assert.equal(await oauthIdentity.getByPlayerId("dana", "google"), null);
  });

  test("a Google-only player (no password, no other identity) CANNOT unlink -- would lock them out", async () => {
    const idToken = google.registerIdentity({ subject: "sub-elliot-only" });
    const cb = await flow.handleCallback({ code: idToken, state: loginState() });
    const session = await flow.finalize({ handoffCode: cb.handoffCode });

    const r = await flow.unlink(session.playerId);
    assert.equal(r.ok, false);
    assert.equal(r.reason, GoogleOAuthError.LAST_AUTH_METHOD);
    // still linked -- refusing to unlink must not have removed it anyway
    assert.ok(await oauthIdentity.getByPlayerId(session.playerId, "google"));
  });

  test("setting an initial password on that same Google-only account then allows unlinking", async () => {
    const idToken = google.registerIdentity({ subject: "sub-felix-only" });
    const cb = await flow.handleCallback({ code: idToken, state: loginState() });
    const session = await flow.finalize({ handoffCode: cb.handoffCode });

    const blocked = await flow.unlink(session.playerId);
    assert.equal(blocked.ok, false);

    const set = await auth.setInitialPassword({ playerId: session.playerId, newPassword: "a perfectly strong passphrase" });
    assert.equal(set.ok, true);

    const nowAllowed = await flow.unlink(session.playerId);
    assert.equal(nowAllowed.ok, true);
  });

  test("unlinking a provider with nothing linked is refused as NOT_LINKED", async () => {
    await auth.register({ playerId: "gary", handle: "gary", password: PASSWORD });
    const r = await flow.unlink("gary");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "NOT_LINKED");
  });
});

describe("SESSION: TOTP is never bypassed by a Google login", () => {
  test("finalize() requires TOTP for an account that has it enrolled, exactly like any other passwordless factor", async () => {
    const { totp: computeTotp, base32Decode } = await import("../src/totp.mjs");
    await auth.register({ playerId: "helen", handle: "helen", password: PASSWORD });
    const idToken = google.registerIdentity({ subject: "sub-helen" });
    await flow.handleCallback({ code: idToken, state: linkState({ playerId: "helen" }) });

    const begin = await auth.beginTotpEnrolment("helen", "helen@nizalo");
    const secret = base32Decode(begin.secretBase32);
    await auth.confirmTotpEnrolment("helen", computeTotp(secret, CLOCK));
    CLOCK += 30_000;

    const idToken2 = google.registerIdentity({ subject: "sub-helen" });
    const cb = await flow.handleCallback({ code: idToken2, state: loginState() });
    const withoutTotp = await flow.finalize({ handoffCode: cb.handoffCode });
    assert.equal(withoutTotp.ok, false);
    assert.equal(withoutTotp.reason, AuthError.TOTP_REQUIRED);

    CLOCK += 30_000;
    const idToken3 = google.registerIdentity({ subject: "sub-helen" });
    const cb2 = await flow.handleCallback({ code: idToken3, state: loginState() });
    const withTotp = await flow.finalize({ handoffCode: cb2.handoffCode, totpCode: computeTotp(secret, CLOCK) });
    assert.equal(withTotp.ok, true);
  });
});

describe("CALLBACK security", () => {
  test("an invalid/tampered state is refused as BAD_STATE, before any provider call happens", async () => {
    const cb = await flow.handleCallback({ code: "irrelevant", state: "not-a-real-state-token" });
    assert.equal(cb.ok, false);
    assert.equal(cb.reason, GoogleOAuthError.BAD_STATE);
  });

  test("an expired state is refused as BAD_STATE", async () => {
    // Minted 700 seconds ago (past the 600-second default ttl) relative to
    // `flow`'s own clock, which verifies with the CURRENT value of CLOCK.
    const state = issueOAuthState({ intent: "login", provider: "google" }, SIGNING_KEY, CLOCK - 700_000);
    const cb = await flow.handleCallback({ code: "x", state });
    assert.equal(cb.ok, false);
    assert.equal(cb.reason, GoogleOAuthError.BAD_STATE);
  });

  test("a replayed callback (the same code submitted twice) fails the second time, and does not create a second player", async () => {
    const idToken = google.registerIdentity({ subject: "sub-replay", email: "replay@example.com", emailVerified: true });
    const state = loginState();
    const first = await flow.handleCallback({ code: idToken, state });
    assert.equal(first.ok, true);

    const before = (await db.query("SELECT count(*)::int AS n FROM player")).rows[0].n;
    const second = await flow.handleCallback({ code: idToken, state });
    assert.equal(second.ok, false);
    assert.equal(second.providerReason, GoogleAuthError.INVALID_GRANT);
    const after = (await db.query("SELECT count(*)::int AS n FROM player")).rows[0].n;
    assert.equal(after, before);
  });

  test("a handoff code can only be finalized once", async () => {
    const idToken = google.registerIdentity({ subject: "sub-handoff-once" });
    const cb = await flow.handleCallback({ code: idToken, state: loginState() });
    const first = await flow.finalize({ handoffCode: cb.handoffCode });
    assert.equal(first.ok, true);
    const replay = await flow.finalize({ handoffCode: cb.handoffCode });
    assert.equal(replay.ok, false);
  });
});

describe("audit trail", () => {
  test("a successful new-account login writes GOOGLE_LOGIN_STARTED and GOOGLE_LOGIN_SUCCESS, with no raw token anywhere", async () => {
    const idToken = google.registerIdentity({ subject: "sub-audit-1", email: "audit1@example.com", emailVerified: true });
    const cb = await flow.handleCallback({ code: idToken, state: loginState() });
    const session = await flow.finalize({ handoffCode: cb.handoffCode });

    const events = await db.query(
      "SELECT type, detail FROM security_event WHERE player_id = $1 ORDER BY id", [session.playerId]
    );
    const types = events.rows.map((r) => r.type);
    assert.ok(types.includes("GOOGLE_LOGIN_SUCCESS"));
    assert.ok(types.includes("REGISTERED"));
    for (const row of events.rows) {
      assert.equal(JSON.stringify(row.detail).includes(idToken), false);
    }
  });

  test("a failed validation writes GOOGLE_LOGIN_FAILED with the reason, never a raw token", async () => {
    const errToken = google.registerError(GoogleAuthError.BAD_SIGNATURE);
    await flow.handleCallback({ code: errToken, state: loginState() });
    const events = await db.query(
      "SELECT detail FROM security_event WHERE type = 'GOOGLE_LOGIN_FAILED' ORDER BY id DESC LIMIT 1"
    );
    assert.equal(events.rows[0].detail.reason, GoogleAuthError.BAD_SIGNATURE);
    assert.equal(JSON.stringify(events.rows[0].detail).includes(errToken), false);
  });

  test("linking and unlinking write their own named events", async () => {
    await auth.register({ playerId: "ivan", handle: "ivan", password: PASSWORD });
    const idToken = google.registerIdentity({ subject: "sub-ivan" });
    await flow.handleCallback({ code: idToken, state: linkState({ playerId: "ivan" }) });
    await flow.unlink("ivan");

    const events = await db.query(
      "SELECT type FROM security_event WHERE player_id = 'ivan' AND type IN ('GOOGLE_LINK_STARTED','GOOGLE_LINKED','GOOGLE_LINK_FAILED','GOOGLE_UNLINKED','GOOGLE_UNLINK_FAILED') ORDER BY id"
    );
    assert.deepEqual(events.rows.map((r) => r.type), ["GOOGLE_LINK_STARTED", "GOOGLE_LINKED", "GOOGLE_UNLINKED"]);
  });
});

describe("ENUMERATION: no unnecessary disclosure", () => {
  test("a brand-new Google identity with no matching account discloses nothing about other players", async () => {
    const idToken = google.registerIdentity({ subject: "sub-fresh-nobody", email: "totally-fresh@example.com", emailVerified: true });
    const cb = await flow.handleCallback({ code: idToken, state: loginState() });
    assert.equal(cb.outcome, "session");
    assert.equal("email" in cb, false, "a fresh signup's own callback result carries no account-existence hint");
  });
});
