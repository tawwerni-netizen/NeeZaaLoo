import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../src/service.mjs";
import { createEmailIdentityService } from "../src/email-identity.mjs";
import { createOAuthIdentityService } from "../src/oauth-identity.mjs";
import { getAuthMethods } from "../src/auth-methods.mjs";

const SIGNING_KEY = Buffer.alloc(32, 31);
const ENCRYPTION_KEY = Buffer.alloc(32, 32);
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };

let db, auth, emailIdentity, oauthIdentity;

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  auth = createAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: FAST_ARGON });
  emailIdentity = createEmailIdentityService(db);
  oauthIdentity = createOAuthIdentityService(db);
});

after(async () => { await db.close?.(); });

test("a freshly registered player: password configured, everything else off", async () => {
  await auth.register({ playerId: "alice", handle: "alice", password: "correct horse battery staple" });
  const r = await getAuthMethods(db, "alice");
  assert.deepEqual(r, {
    email: { exists: false, verified: false },
    password: { configured: true },
    google: { connected: false },
    totp: { enabled: false },
  });
});

test("an unverified email shows exists:true, verified:false", async () => {
  await auth.register({ playerId: "bob", handle: "bob", password: "correct horse battery staple" });
  await emailIdentity.setEmail("bob", "bob@example.com");
  const r = await getAuthMethods(db, "bob");
  assert.deepEqual(r.email, { exists: true, verified: false });
});

test("a verified email shows verified:true", async () => {
  await auth.register({ playerId: "carol", handle: "carol", password: "correct horse battery staple" });
  await emailIdentity.setEmail("carol", "carol@example.com");
  await emailIdentity.markVerified("carol");
  const r = await getAuthMethods(db, "carol");
  assert.deepEqual(r.email, { exists: true, verified: true });
});

test("a linked Google identity shows connected:true", async () => {
  await auth.register({ playerId: "dan", handle: "dan", password: "correct horse battery staple" });
  await oauthIdentity.link({ playerId: "dan", provider: "google", subject: "sub-dan" });
  const r = await getAuthMethods(db, "dan");
  assert.equal(r.google.connected, true);
});

test("a Google-only account: password not configured, google connected", async () => {
  await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", ["erin"]);
  await oauthIdentity.link({ playerId: "erin", provider: "google", subject: "sub-erin" });
  const r = await getAuthMethods(db, "erin");
  assert.equal(r.password.configured, false);
  assert.equal(r.google.connected, true);
});

test("TOTP enrolled but not yet confirmed shows enabled:false", async () => {
  await auth.register({ playerId: "frank", handle: "frank", password: "correct horse battery staple" });
  await auth.beginTotpEnrolment("frank", "frank@nizalo");
  const r = await getAuthMethods(db, "frank");
  assert.equal(r.totp.enabled, false);
});

test("TOTP confirmed shows enabled:true", async () => {
  const { totp: computeTotp, base32Decode } = await import("../src/totp.mjs");
  await auth.register({ playerId: "grace", handle: "grace", password: "correct horse battery staple" });
  const begin = await auth.beginTotpEnrolment("grace", "grace@nizalo");
  const secret = base32Decode(begin.secretBase32);
  await auth.confirmTotpEnrolment("grace", computeTotp(secret, Date.now()));
  const r = await getAuthMethods(db, "grace");
  assert.equal(r.totp.enabled, true);
});

test("the returned object never contains a provider subject, token, or internal id -- only the four documented booleans/flags", async () => {
  await auth.register({ playerId: "henry", handle: "henry", password: "correct horse battery staple" });
  await oauthIdentity.link({ playerId: "henry", provider: "google", subject: "super-secret-looking-subject-id-12345" });
  const r = await getAuthMethods(db, "henry");
  const serialized = JSON.stringify(r);
  assert.equal(serialized.includes("super-secret-looking-subject-id-12345"), false);
  assert.deepEqual(Object.keys(r).sort(), ["email", "google", "password", "totp"]);
});
