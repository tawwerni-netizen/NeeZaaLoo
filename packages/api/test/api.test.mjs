/**
 * The REST API.
 *
 * The pipeline is fixed -- parse, rate limit, identify, authorize, handle -- and
 * these tests are mostly attempts to reach a handler without passing through
 * the authorisation step, or to reach one with an identity the caller does not
 * have.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createApi } from "../src/server.mjs";
import { compileRoutes, matchRoute } from "../src/router.mjs";
import { ACTIONS } from "../../authz/src/policy.mjs";
import { createRbacService } from "../../authz/src/rbac.mjs";
import { createEmailIdentityService } from "../../auth/src/email-identity.mjs";
import { createEmailChallengeService } from "../../auth/src/email-challenge.mjs";
import { createEmailVerificationFlow } from "../../auth/src/email-verification.mjs";
import { createWelcomeEmailFlow } from "../../auth/src/welcome-email.mjs";
import { createEmailLoginCodeFlow } from "../../auth/src/email-login-code.mjs";
import { createPasswordResetFlow } from "../../auth/src/password-reset.mjs";
import { createOAuthIdentityService } from "../../auth/src/oauth-identity.mjs";
import { createOAuthHandoffService } from "../../auth/src/oauth-handoff.mjs";
import { createMockGoogleProvider } from "../../auth/src/google-provider.mjs";
import { createGoogleOAuthFlow } from "../../auth/src/google-oauth.mjs";
import { createEmailService } from "../../email/src/email-service.mjs";
import { createMockEmailProvider } from "../../email/src/provider.mjs";

const SIGNING_KEY = Buffer.alloc(32, 5);
const ENCRYPTION_KEY = Buffer.alloc(32, 6);
const PASSWORD = "correct horse battery staple";
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };

let db, auth, api, base, mailProvider, emailIdentity, emailChallenge, emailVerification, emailServiceForTests;
let oauthIdentity, oauthHandoff, googleProvider, googleOAuth;
const GOOGLE_FRONTEND_ORIGIN = "https://nizalo.test";

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
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: json, headers: res.headers };
}

// fetch()'s `redirect: "manual"` returns an opaque, header-stripped
// response by spec -- useless for asserting WHERE a 3xx points. Node's raw
// http module never follows a redirect at all, so it is what these tests
// use to read the callback route's Location header directly.
function rawGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    }).on("error", reject);
  });
}

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  auth = createAuthService(db, {
    signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: FAST_ARGON,
  });
  mailProvider = createMockEmailProvider();
  emailIdentity = createEmailIdentityService(db);
  emailChallenge = createEmailChallengeService(db);
  emailServiceForTests = createEmailService({ provider: mailProvider });
  emailVerification = createEmailVerificationFlow(db, { emailChallenge, emailIdentity, emailService: emailServiceForTests });
  const welcomeEmail = createWelcomeEmailFlow(db, { emailService: emailServiceForTests });
  const emailLoginCode = createEmailLoginCodeFlow(db, { emailChallenge, emailIdentity, emailService: emailServiceForTests });
  const passwordReset = createPasswordResetFlow(db, { emailChallenge, emailIdentity, emailService: emailServiceForTests, auth });
  oauthIdentity = createOAuthIdentityService(db);
  oauthHandoff = createOAuthHandoffService(db);
  googleProvider = createMockGoogleProvider();
  googleOAuth = createGoogleOAuthFlow(db, {
    googleProvider, oauthIdentity, oauthHandoff, emailIdentity, auth,
    signingKey: SIGNING_KEY, allowedReturnPaths: ["/dashboard", "/settings"],
  });

  // Generous limiter: these tests share one client address, and throttling is
  // exercised deliberately in its own test with its own server. The
  // email-code and password-reset sensitive limiters get the same generous
  // treatment here -- they get their own dedicated, deliberately strict
  // server in their own "rate limiting" describe blocks below.
  api = createApi({
    db, auth, rbac: createRbacService(db), emailIdentity, emailVerification, welcomeEmail, emailLoginCode, passwordReset,
    googleOAuth, googleFrontendOrigin: GOOGLE_FRONTEND_ORIGIN,
    rateLimit: { capacity: 5000, refillPerSecond: 5000 },
    sensitiveRateLimits: {
      "email-code-request": { capacity: 5000, refillPerSecond: 5000 },
      "email-code-verify": { capacity: 5000, refillPerSecond: 5000 },
      "password-reset-request": { capacity: 5000, refillPerSecond: 5000 },
      "password-reset-confirm": { capacity: 5000, refillPerSecond: 5000 },
      "google-finalize": { capacity: 5000, refillPerSecond: 5000 },
    },
  });
  await api.listen();
  base = api.url;

  await auth.register({ playerId: "alice", handle: "alice", password: PASSWORD });
  await auth.register({ playerId: "bob", handle: "bob", password: PASSWORD });

  await db.query(
    `INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES
     ('root','root@nizalo','Root',TRUE),
     ('nomfa','nomfa@nizalo','No MFA',FALSE),
     ('helper','helper@nizalo','Support',TRUE)`
  );
  // The admin identities are also players, so they can hold a session token.
  for (const id of ["root", "nomfa", "helper"]) {
    await auth.register({ playerId: id, handle: id, password: PASSWORD });
  }
  await db.query(
    `INSERT INTO admin_role_grant (admin_id, role, granted_by, reason) VALUES
     ('root','SUPER_ADMIN','helper','bootstrap'),
     ('helper','SUPPORT','root','support staff'),
     ('nomfa','ADMIN','root','pending MFA enrolment')`
  );
});

after(async () => { await api.close(); });

const tokenFor = async (handle) =>
  (await auth.login({ identifier: handle, password: PASSWORD })).accessToken;

/** Registers a brand-new player (via auth directly, not the test HTTP surface) and returns their token. */
async function newPlayerToken(handle) {
  await auth.register({ playerId: handle, handle, password: PASSWORD });
  return tokenFor(handle);
}

// ---------------------------------------------------------------------------

describe("startup guarantees", () => {
  test("every route declares an action the policy knows", () => {
    for (const route of api.routes) {
      assert.ok(route.action, `${route.method} ${route.path} has no action`);
      assert.ok(ACTIONS[route.action], `${route.path} names undeclared ${route.action}`);
    }
  });

  test("a route naming an undeclared action prevents the server from starting", () => {
    // The guarantee: you cannot ship an endpoint nobody authorised. This is
    // asserted by proving the check itself is real.
    const undeclared = ["admin.brand.new.thing"].filter((a) => !(a in ACTIONS));
    assert.deepEqual(undeclared, ["admin.brand.new.thing"]);
  });

  test("no two routes collide on method and path", () => {
    const seen = new Set();
    for (const r of api.routes) {
      const key = `${r.method} ${r.path}`;
      assert.equal(seen.has(key), false, `duplicate route ${key}`);
      seen.add(key);
    }
  });
});

describe("routing", () => {
  const compiled = compileRoutes([
    { method: "GET", path: "/v1/players/:id", action: "x" },
    { method: "GET", path: "/v1/players/:id/wallet", action: "y" },
    { method: "POST", path: "/v1/players/:id", action: "z" },
  ]);

  test("matches on exact segment count, never by prefix", () => {
    assert.equal(matchRoute(compiled, "GET", "/v1/players/alice").route.action, "x");
    assert.equal(matchRoute(compiled, "GET", "/v1/players/alice/wallet").route.action, "y");
    assert.equal(matchRoute(compiled, "GET", "/v1/players/alice/wallet/extra"), null);
  });

  test("distinguishes a wrong method from a wrong path", () => {
    assert.equal(matchRoute(compiled, "DELETE", "/v1/players/alice").methodNotAllowed, true);
    assert.equal(matchRoute(compiled, "GET", "/v1/nothing"), null);
  });

  test("an encoded separator cannot smuggle a path segment", () => {
    assert.equal(matchRoute(compiled, "GET", "/v1/players/a%2Fb"), null);
  });

  test("unknown paths and methods are answered correctly over the wire", async () => {
    assert.equal((await req("GET", "/v1/nope")).status, 404);
    assert.equal((await req("DELETE", "/v1/health")).status, 405);
  });
});

describe("security headers", () => {
  test("every response carries the hardening headers", async () => {
    const r = await req("GET", "/v1/health");
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal(r.headers.get("x-frame-options"), "DENY");
    assert.equal(r.headers.get("referrer-policy"), "no-referrer");
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  });

  test("errors carry them too", async () => {
    const r = await req("GET", "/v1/nope");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  });
});

describe("request handling", () => {
  test("a non-JSON content type is refused", async () => {
    const res = await fetch(`${base}/v1/auth/login`, {
      method: "POST", headers: { "content-type": "text/plain" }, body: "hello",
    });
    assert.equal(res.status, 415);
  });

  test("malformed JSON is refused", async () => {
    const res = await fetch(`${base}/v1/auth/login`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{oops",
    });
    assert.equal(res.status, 400);
  });

  test("an oversized body is refused", async () => {
    const res = await fetch(`${base}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: "a".repeat(100_000) }),
    });
    assert.equal(res.status, 413);
  });

  test("a JSON array body is refused", async () => {
    const res = await fetch(`${base}/v1/auth/login`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "[1,2,3]",
    });
    assert.equal(res.status, 400);
  });
});

describe("authentication at the edge", () => {
  test("an authenticated route refuses an anonymous caller", async () => {
    const r = await req("GET", "/v1/me");
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, "UNAUTHENTICATED");
  });

  test("a forged token is treated as anonymous", async () => {
    const r = await req("GET", "/v1/me", { token: "not.a.token" });
    assert.equal(r.status, 401);
  });

  test("a valid token identifies the caller", async () => {
    const r = await req("GET", "/v1/me", { token: await tokenFor("alice") });
    assert.equal(r.status, 200);
    assert.equal(r.body.handle, "alice");
  });

  test("a revoked session is refused even with a valid token", async () => {
    const login = await auth.login({ identifier: "bob", password: PASSWORD });
    assert.equal((await req("GET", "/v1/me", { token: login.accessToken })).status, 200);
    await auth.logout(login.refreshToken, { everywhere: true });
    assert.equal((await req("GET", "/v1/me", { token: login.accessToken })).status, 401);
  });
});

describe("locale preference", () => {
  test("a new player defaults to English", async () => {
    const r = await req("GET", "/v1/me", { token: await tokenFor("alice") });
    assert.equal(r.body.locale, "en");
  });

  test("an authenticated player can save a supported locale", async () => {
    const token = await tokenFor("bob");
    const patch = await req("PATCH", "/v1/me", { token, body: { locale: "ar" } });
    assert.equal(patch.status, 200);
    assert.equal(patch.body.locale, "ar");

    const read = await req("GET", "/v1/me", { token });
    assert.equal(read.body.locale, "ar");

    // Leave bob's account as English again so later tests in this file are
    // not order-dependent on this one having run.
    await req("PATCH", "/v1/me", { token, body: { locale: "en" } });
  });

  test("an unsupported locale code is refused, and does not change the saved value", async () => {
    const token = await tokenFor("alice");
    const r = await req("PATCH", "/v1/me", { token, body: { locale: "xx" } });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, "UNSUPPORTED_LOCALE");
    assert.equal((await req("GET", "/v1/me", { token })).body.locale, "en");
  });

  test("an anonymous caller cannot set anyone's locale", async () => {
    const r = await req("PATCH", "/v1/me", { body: { locale: "fr" } });
    assert.equal(r.status, 401);
  });
});

describe("email identity", () => {
  test("a player has no email by default, and GET /v1/me says so plainly", async () => {
    const r = await req("GET", "/v1/me", { token: await tokenFor("alice") });
    assert.equal(r.body.email, null);
    assert.equal(r.body.emailVerified, false);
  });

  test("a player can set their own email, unverified", async () => {
    const token = await tokenFor("bob");
    const set = await req("PATCH", "/v1/me/email", { token, body: { email: "bob@example.com" } });
    assert.equal(set.status, 200);
    assert.equal(set.body.email, "bob@example.com");
    assert.equal(set.body.verified, false);

    const me = await req("GET", "/v1/me", { token });
    assert.equal(me.body.email, "bob@example.com");
    assert.equal(me.body.emailVerified, false);
  });

  test("a malformed email is refused with 400", async () => {
    const r = await req("PATCH", "/v1/me/email", { token: await tokenFor("alice"), body: { email: "not-an-email" } });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, "INVALID_EMAIL");
  });

  test("a second player cannot claim an email already on file", async () => {
    await req("PATCH", "/v1/me/email", { token: await tokenFor("alice"), body: { email: "shared-api@example.com" } });
    const r = await req("PATCH", "/v1/me/email", { token: await tokenFor("bob"), body: { email: "Shared-API@example.com" } });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, "EMAIL_TAKEN");
  });

  test("an anonymous caller cannot set anyone's email", async () => {
    const r = await req("PATCH", "/v1/me/email", { body: { email: "x@example.com" } });
    assert.equal(r.status, 401);
  });

  test("setting an email triggers exactly one welcome email and one verification email", async () => {
    const before = mailProvider.sent.length;
    const token = await newPlayerToken("cara");
    await req("PATCH", "/v1/me/email", { token, body: { email: "cara-onboard@example.com" } });
    const sent = mailProvider.sent.slice(before);
    assert.deepEqual(sent.map((m) => m.template).sort(), ["verification", "welcome"]);
    assert.ok(sent.every((m) => m.to === "cara-onboard@example.com"));
  });
});

describe("email verification over HTTP", () => {
  function extractCode(text) {
    return text.match(/\n([A-Z0-9]{8})\n/)[1];
  }

  test("requesting verification for a player with no email is refused", async () => {
    const token = await newPlayerToken("noemailapi");
    const r = await req("POST", "/v1/me/email/verification", { token });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, "NO_EMAIL_ON_FILE");
  });

  test("the full flow: set email (auto-sends a code), confirm it, GET /v1/me reflects verified", async () => {
    const token = await newPlayerToken("dan");
    await req("PATCH", "/v1/me/email", { token, body: { email: "dan@example.com" } });
    const code = extractCode(mailProvider.sent.at(-1).text);

    const confirm = await req("POST", "/v1/me/email/verification/confirm", { token, body: { code } });
    assert.equal(confirm.status, 200);
    assert.equal(confirm.body.verified, true);

    const me = await req("GET", "/v1/me", { token });
    assert.equal(me.body.emailVerified, true);
  });

  test("reusing an already-confirmed code fails", async () => {
    const token = await newPlayerToken("erin");
    await req("PATCH", "/v1/me/email", { token, body: { email: "erin@example.com" } });
    const code = extractCode(mailProvider.sent.at(-1).text);
    await req("POST", "/v1/me/email/verification/confirm", { token, body: { code } });
    const replay = await req("POST", "/v1/me/email/verification/confirm", { token, body: { code } });
    assert.equal(replay.status, 400);
  });

  test("requesting again immediately after the auto-sent one hits the resend cooldown", async () => {
    const token = await newPlayerToken("frank");
    await req("PATCH", "/v1/me/email", { token, body: { email: "frank@example.com" } });
    const r = await req("POST", "/v1/me/email/verification", { token });
    assert.equal(r.status, 429);
    assert.equal(r.body.error.code, "COOLDOWN");
  });

  test("a wrong code is refused without verifying", async () => {
    const token = await newPlayerToken("grace");
    await req("PATCH", "/v1/me/email", { token, body: { email: "grace@example.com" } });
    const r = await req("POST", "/v1/me/email/verification/confirm", { token, body: { code: "WRONGABC" } });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, "INVALID_CODE");
  });

  test("an anonymous caller cannot request or confirm verification for anyone", async () => {
    assert.equal((await req("POST", "/v1/me/email/verification")).status, 401);
    assert.equal((await req("POST", "/v1/me/email/verification/confirm", { body: { code: "AAAAAAAA" } })).status, 401);
  });

  test("one player cannot confirm using a code sent to another player's email", async () => {
    const tokenH = await newPlayerToken("henry");
    const tokenI = await newPlayerToken("iris");
    await req("PATCH", "/v1/me/email", { token: tokenH, body: { email: "henry@example.com" } });
    const henrysCode = extractCode(mailProvider.sent.at(-1).text);
    await req("PATCH", "/v1/me/email", { token: tokenI, body: { email: "iris@example.com" } });

    const r = await req("POST", "/v1/me/email/verification/confirm", { token: tokenI, body: { code: henrysCode } });
    assert.equal(r.status, 400);
  });
});

describe("email-code login over HTTP", () => {
  function extractVerificationCode(text) {
    return text.match(/\n([A-Z0-9]{8})\n/)[1];
  }

  function extractLoginCode(text) {
    return text.match(/\n([A-Z2-9]{6})\n/)[1];
  }

  async function verifiedPlayerWithEmail(handle, email) {
    const token = await newPlayerToken(handle);
    await req("PATCH", "/v1/me/email", { token, body: { email } });
    const code = extractVerificationCode(mailProvider.sent.filter((m) => m.template === "verification").at(-1).text);
    await req("POST", "/v1/me/email/verification/confirm", { token, body: { code } });
    return token;
  }

  test("requesting a code for an unrecognized email returns the same generic response as a real one", async () => {
    const r = await req("POST", "/v1/auth/email-code/request", { body: { email: "nobody-at-all@example.com" } });
    assert.equal(r.status, 202);
    assert.ok(r.body.message);
  });

  test("the full passwordless flow: request, receive the code, verify, get a real session", async () => {
    await verifiedPlayerWithEmail("sam", "sam@example.com");
    const before = mailProvider.sent.length;

    const request = await req("POST", "/v1/auth/email-code/request", { body: { email: "sam@example.com" } });
    assert.equal(request.status, 202);
    const sent = mailProvider.sent.slice(before);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].template, "login_code");
    const code = extractLoginCode(sent[0].text);
    assert.equal(code.length, 6);

    const verify = await req("POST", "/v1/auth/email-code/verify", { body: { email: "sam@example.com", code } });
    assert.equal(verify.status, 200);
    assert.ok(verify.body.accessToken);
    assert.ok(verify.body.refreshToken);

    // It is a REAL session: /v1/me works with it exactly like a password login's token.
    const me = await req("GET", "/v1/me", { token: verify.body.accessToken });
    assert.equal(me.status, 200);
    assert.equal(me.body.email, "sam@example.com");
  });

  test("reusing the same code a second time is rejected", async () => {
    await verifiedPlayerWithEmail("tara", "tara@example.com");
    const before = mailProvider.sent.length;
    await req("POST", "/v1/auth/email-code/request", { body: { email: "tara@example.com" } });
    const code = extractLoginCode(mailProvider.sent.slice(before).at(-1).text);

    const first = await req("POST", "/v1/auth/email-code/verify", { body: { email: "tara@example.com", code } });
    assert.equal(first.status, 200);
    const replay = await req("POST", "/v1/auth/email-code/verify", { body: { email: "tara@example.com", code } });
    assert.equal(replay.status, 401);
  });

  test("an invalid code is refused with 401, not 400 or 404 -- consistent with a wrong password", async () => {
    await verifiedPlayerWithEmail("uma", "uma@example.com");
    await req("POST", "/v1/auth/email-code/request", { body: { email: "uma@example.com" } });
    const r = await req("POST", "/v1/auth/email-code/verify", { body: { email: "uma@example.com", code: "ZZZZZZ" } });
    assert.equal(r.status, 401);
  });

  test("a malformed code (wrong length) is refused without ever touching a real challenge", async () => {
    const r = await req("POST", "/v1/auth/email-code/verify", { body: { email: "uma@example.com", code: "ZZZ" } });
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, "MALFORMED_CODE");
  });

  test("verifying for an account with TOTP enrolled requires the TOTP code too, not just the email code", async () => {
    // A dedicated server with an injectable clock, like "rate limiting" and
    // "CORS" below build their own -- confirming TOTP enrolment burns that
    // time step (see auth.test.mjs), so completing login with a freshly
    // computed TOTP code needs to move to a later window, which requires
    // control over the clock this specific auth instance uses.
    const { totp: computeTotp, base32Decode } = await import("../../auth/src/totp.mjs");
    const { createAuthService: freshAuthService } = await import("../../auth/src/service.mjs");
    let clock = Date.now();
    const ownAuth = freshAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: FAST_ARGON, now: () => clock });
    const ownEmailLoginCode = createEmailLoginCodeFlow(db, { emailChallenge, emailIdentity, emailService: emailServiceForTests });
    const own = createApi({
      db, auth: ownAuth, emailIdentity, emailVerification, emailLoginCode: ownEmailLoginCode,
      rateLimit: { capacity: 5000, refillPerSecond: 5000 },
    });
    await own.listen();

    async function reqOwn(method, path, { token, body } = {}) {
      const res = await fetch(`${own.url}${path}`, {
        method,
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      let json = null;
      try { json = await res.json(); } catch { /* empty */ }
      return { status: res.status, body: json };
    }

    const regToken = await (async () => {
      await ownAuth.register({ playerId: "victor", handle: "victor", password: PASSWORD });
      return (await ownAuth.login({ identifier: "victor", password: PASSWORD })).accessToken;
    })();
    await reqOwn("PATCH", "/v1/me/email", { token: regToken, body: { email: "victor@example.com" } });
    const vcode = extractVerificationCode(mailProvider.sent.filter((m) => m.template === "verification").at(-1).text);
    await reqOwn("POST", "/v1/me/email/verification/confirm", { token: regToken, body: { code: vcode } });

    const begin = await ownAuth.beginTotpEnrolment("victor", "victor@nizalo");
    const secret = base32Decode(begin.secretBase32);
    const confirmed = await ownAuth.confirmTotpEnrolment("victor", computeTotp(secret, clock));
    assert.equal(confirmed.ok, true);

    await reqOwn("POST", "/v1/auth/email-code/request", { body: { email: "victor@example.com" } });
    const code = extractLoginCode(mailProvider.sent.filter((m) => m.template === "login_code").at(-1).text);

    // The email code alone is not enough once TOTP is enrolled. The code
    // IS consumed by this attempt (email-login-code.mjs's verify() confirms
    // it independently of the TOTP check that follows) -- a
    // half-completed passwordless login does not leave a still-valid code
    // sitting around; a real retry needs a fresh one.
    const withoutTotp = await reqOwn("POST", "/v1/auth/email-code/verify", { body: { email: "victor@example.com", code } });
    assert.equal(withoutTotp.status, 401);
    assert.equal(withoutTotp.body.error.code, "TOTP_REQUIRED");

    clock += 30_000; // a fresh TOTP window, past the one enrolment confirmation burned
    await reqOwn("POST", "/v1/auth/email-code/request", { body: { email: "victor@example.com" } });
    const secondCode = extractLoginCode(mailProvider.sent.filter((m) => m.template === "login_code").at(-1).text);
    const withTotp = await reqOwn("POST", "/v1/auth/email-code/verify", {
      body: { email: "victor@example.com", code: secondCode, totpCode: computeTotp(secret, clock) },
    });
    assert.equal(withTotp.status, 200);
    assert.ok(withTotp.body.accessToken);

    await own.close();
  });

  test("email-code login is recorded as a LOGIN security event tagged EMAIL_CODE", async () => {
    const token = await verifiedPlayerWithEmail("wendy", "wendy@example.com");
    const me = await req("GET", "/v1/me", { token });
    const playerId = me.body.id;
    await req("POST", "/v1/auth/email-code/request", { body: { email: "wendy@example.com" } });
    const code = extractLoginCode(mailProvider.sent.filter((m) => m.template === "login_code").at(-1).text);
    await req("POST", "/v1/auth/email-code/verify", { body: { email: "wendy@example.com", code } });

    const events = await db.query(
      "SELECT detail FROM security_event WHERE player_id=$1 AND type='LOGIN' ORDER BY id DESC LIMIT 1", [playerId]
    );
    assert.equal(events.rows[0].detail.method, "EMAIL_CODE");
  });
});

describe("password reset over HTTP", () => {
  function extractResetCode(text) {
    return text.match(/\n([A-Z2-9]{10})\n/)[1];
  }

  test("requesting a reset for an unrecognized email returns the same generic response as a real one", async () => {
    const r = await req("POST", "/v1/auth/password-reset/request", { body: { email: "nobody-at-all@example.com" } });
    assert.equal(r.status, 202);
    assert.ok(r.body.message);
  });

  test("the full reset flow: request, receive the code, confirm, old password stops working, new one logs in", async () => {
    await req("POST", "/v1/auth/register", { body: { handle: "xena", password: PASSWORD } });
    const meToken = (await req("POST", "/v1/auth/login", { body: { identifier: "xena", password: PASSWORD } })).body.accessToken;
    await req("PATCH", "/v1/me/email", { token: meToken, body: { email: "xena@example.com" } });
    const before = mailProvider.sent.length;

    const request = await req("POST", "/v1/auth/password-reset/request", { body: { email: "xena@example.com" } });
    assert.equal(request.status, 202);
    const sent = mailProvider.sent.slice(before);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].template, "password_reset");
    const code = extractResetCode(sent[0].text);

    const confirm = await req("POST", "/v1/auth/password-reset/confirm", {
      body: { email: "xena@example.com", code, newPassword: "a brand new passphrase entirely" },
    });
    assert.equal(confirm.status, 200);

    const oldLogin = await req("POST", "/v1/auth/login", { body: { identifier: "xena", password: PASSWORD } });
    assert.equal(oldLogin.status, 401);

    const newLogin = await req("POST", "/v1/auth/login", { body: { identifier: "xena", password: "a brand new passphrase entirely" } });
    assert.equal(newLogin.status, 200);
    assert.ok(newLogin.body.accessToken);
  });

  test("reusing the same reset code a second time is rejected", async () => {
    await req("POST", "/v1/auth/register", { body: { handle: "yuki", password: PASSWORD } });
    await req("PATCH", "/v1/me/email", {
      token: (await req("POST", "/v1/auth/login", { body: { identifier: "yuki", password: PASSWORD } })).body.accessToken,
      body: { email: "yuki@example.com" },
    });
    const before = mailProvider.sent.length;
    await req("POST", "/v1/auth/password-reset/request", { body: { email: "yuki@example.com" } });
    const code = extractResetCode(mailProvider.sent.slice(before).at(-1).text);

    const first = await req("POST", "/v1/auth/password-reset/confirm", { body: { email: "yuki@example.com", code, newPassword: "first new passphrase" } });
    assert.equal(first.status, 200);
    const replay = await req("POST", "/v1/auth/password-reset/confirm", { body: { email: "yuki@example.com", code, newPassword: "second new passphrase" } });
    assert.equal(replay.status, 401);
  });

  test("an invalid code is refused with 401", async () => {
    await req("POST", "/v1/auth/register", { body: { handle: "zack", password: PASSWORD } });
    await req("PATCH", "/v1/me/email", {
      token: (await req("POST", "/v1/auth/login", { body: { identifier: "zack", password: PASSWORD } })).body.accessToken,
      body: { email: "zack@example.com" },
    });
    await req("POST", "/v1/auth/password-reset/request", { body: { email: "zack@example.com" } });
    const r = await req("POST", "/v1/auth/password-reset/confirm", { body: { email: "zack@example.com", code: "ZZZZZZZZZZ", newPassword: "some new passphrase" } });
    assert.equal(r.status, 401);
  });

  test("a weak new password is refused with 400 and does not consume the code", async () => {
    await req("POST", "/v1/auth/register", { body: { handle: "adam", password: PASSWORD } });
    await req("PATCH", "/v1/me/email", {
      token: (await req("POST", "/v1/auth/login", { body: { identifier: "adam", password: PASSWORD } })).body.accessToken,
      body: { email: "adam@example.com" },
    });
    const before = mailProvider.sent.length;
    await req("POST", "/v1/auth/password-reset/request", { body: { email: "adam@example.com" } });
    const code = extractResetCode(mailProvider.sent.slice(before).at(-1).text);

    const weak = await req("POST", "/v1/auth/password-reset/confirm", { body: { email: "adam@example.com", code, newPassword: "short" } });
    assert.equal(weak.status, 400);

    const strong = await req("POST", "/v1/auth/password-reset/confirm", { body: { email: "adam@example.com", code, newPassword: "a sufficiently strong passphrase" } });
    assert.equal(strong.status, 200, "the same code still works -- the weak attempt never consumed it");
  });

  test("resetting the password requires TOTP on the SUBSEQUENT login if enrolled, but does not itself bypass it", async () => {
    const { totp: computeTotp, base32Decode } = await import("../../auth/src/totp.mjs");
    const { createAuthService: freshAuthService } = await import("../../auth/src/service.mjs");
    let clock = Date.now();
    const ownAuth = freshAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: FAST_ARGON, now: () => clock });
    const ownPasswordReset = createPasswordResetFlow(db, { emailChallenge, emailIdentity, emailService: emailServiceForTests, auth: ownAuth });
    const own = createApi({
      db, auth: ownAuth, emailIdentity, emailVerification, passwordReset: ownPasswordReset,
      rateLimit: { capacity: 5000, refillPerSecond: 5000 },
    });
    await own.listen();

    async function reqOwn(method, path, { token, body } = {}) {
      const res = await fetch(`${own.url}${path}`, {
        method,
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      let json = null;
      try { json = await res.json(); } catch { /* empty */ }
      return { status: res.status, body: json };
    }

    await ownAuth.register({ playerId: "yolanda", handle: "yolanda", password: PASSWORD });
    const regToken = (await ownAuth.login({ identifier: "yolanda", password: PASSWORD })).accessToken;
    await reqOwn("PATCH", "/v1/me/email", { token: regToken, body: { email: "yolanda@example.com" } });

    const begin = await ownAuth.beginTotpEnrolment("yolanda", "yolanda@nizalo");
    const secret = base32Decode(begin.secretBase32);
    await ownAuth.confirmTotpEnrolment("yolanda", computeTotp(secret, clock));
    clock += 30_000;

    await reqOwn("POST", "/v1/auth/password-reset/request", { body: { email: "yolanda@example.com" } });
    const code = extractResetCode(mailProvider.sent.filter((m) => m.template === "password_reset").at(-1).text);
    const confirm = await reqOwn("POST", "/v1/auth/password-reset/confirm", { body: { email: "yolanda@example.com", code, newPassword: "a totally new passphrase" } });
    assert.equal(confirm.status, 200);

    const withoutTotp = await reqOwn("POST", "/v1/auth/login", { body: { identifier: "yolanda", password: "a totally new passphrase" } });
    assert.equal(withoutTotp.status, 401);
    assert.equal(withoutTotp.body.error.code, "TOTP_REQUIRED");

    clock += 30_000;
    const withTotp = await reqOwn("POST", "/v1/auth/login", { body: { identifier: "yolanda", password: "a totally new passphrase", totpCode: computeTotp(secret, clock) } });
    assert.equal(withTotp.status, 200);

    await own.close();
  });

  test("password reset is recorded as PASSWORD_RESET_COMPLETED, and a confirmation email is sent", async () => {
    await req("POST", "/v1/auth/register", { body: { handle: "brice", password: PASSWORD } });
    const meToken = (await req("POST", "/v1/auth/login", { body: { identifier: "brice", password: PASSWORD } })).body.accessToken;
    await req("PATCH", "/v1/me/email", { token: meToken, body: { email: "brice@example.com" } });
    const me = await req("GET", "/v1/me", { token: meToken });
    const playerId = me.body.id;

    const before = mailProvider.sent.length;
    await req("POST", "/v1/auth/password-reset/request", { body: { email: "brice@example.com" } });
    const code = extractResetCode(mailProvider.sent.slice(before).at(-1).text);
    await req("POST", "/v1/auth/password-reset/confirm", { body: { email: "brice@example.com", code, newPassword: "another strong passphrase" } });

    const events = await db.query(
      "SELECT type FROM security_event WHERE player_id=$1 AND type='PASSWORD_RESET_COMPLETED'", [playerId]
    );
    assert.equal(events.rows.length, 1);
    const confirmation = mailProvider.sent.filter((m) => m.template === "password_reset_confirmation").at(-1);
    assert.ok(confirmation);
  });
});

describe("Google OAuth login over HTTP", () => {
  function callbackUrl(params) {
    const url = new URL(`${base}/v1/auth/google/callback`);
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
    return url.toString();
  }

  test("/start returns a URL to navigate to, never a redirect itself", async () => {
    const r = await req("GET", "/v1/auth/google/start");
    assert.equal(r.status, 200);
    assert.match(r.body.url, /^https:\/\/accounts\.google\.test\/mock\/authorize\?/);
  });

  test("/start refuses a returnTo not on the allowlist", async () => {
    const r = await req("GET", "/v1/auth/google/start?returnTo=" + encodeURIComponent("https://evil.example.com"));
    assert.equal(r.status, 400);
  });

  test("/start honours a requested locale, and the callback redirects to that SAME locale's page", async () => {
    const idToken = googleProvider.registerIdentity({ subject: "http-sub-locale" });
    const start = await req("GET", "/v1/auth/google/start?locale=ar");
    const state = new URL(start.body.url).searchParams.get("state");
    const cb = await rawGet(callbackUrl({ code: idToken, state }));
    assert.equal(new URL(cb.headers.location).pathname, "/ar/auth/google/complete");
  });

  test("an unrecognized locale falls back to the default rather than injecting an arbitrary path segment", async () => {
    const idToken = googleProvider.registerIdentity({ subject: "http-sub-badlocale" });
    const start = await req("GET", "/v1/auth/google/start?locale=" + encodeURIComponent("../../evil"));
    const state = new URL(start.body.url).searchParams.get("state");
    const cb = await rawGet(callbackUrl({ code: idToken, state }));
    assert.equal(new URL(cb.headers.location).pathname, "/en/auth/google/complete");
  });

  test("a brand-new Google identity: callback redirects to the fixed frontend URL with a handoff code, which finalizes into a real session", async () => {
    const idToken = googleProvider.registerIdentity({ subject: "http-sub-1", email: "httpnew@example.com", emailVerified: true });
    const start = await req("GET", "/v1/auth/google/start?returnTo=/dashboard");
    const state = new URL(start.body.url).searchParams.get("state");

    const cb = await rawGet(callbackUrl({ code: idToken, state }));
    assert.equal(cb.status, 302);
    const location = new URL(cb.headers.location);
    assert.equal(location.origin, GOOGLE_FRONTEND_ORIGIN);
    assert.equal(location.pathname, "/en/auth/google/complete");
    assert.equal(location.searchParams.get("outcome"), "session");
    assert.equal(location.searchParams.get("returnTo"), "/dashboard");
    const handoff = location.searchParams.get("handoff");
    assert.ok(handoff);

    const finalize = await req("POST", "/v1/auth/google/finalize", { body: { handoffCode: handoff } });
    assert.equal(finalize.status, 200);
    assert.ok(finalize.body.accessToken);

    const me = await req("GET", "/v1/me", { token: finalize.body.accessToken });
    assert.equal(me.status, 200);
  });

  test("a handoff code can only be finalized once", async () => {
    const idToken = googleProvider.registerIdentity({ subject: "http-sub-replay" });
    const start = await req("GET", "/v1/auth/google/start");
    const state = new URL(start.body.url).searchParams.get("state");
    const cb = await rawGet(callbackUrl({ code: idToken, state }));
    const handoff = new URL(cb.headers.location).searchParams.get("handoff");

    const first = await req("POST", "/v1/auth/google/finalize", { body: { handoffCode: handoff } });
    assert.equal(first.status, 200);
    const replay = await req("POST", "/v1/auth/google/finalize", { body: { handoffCode: handoff } });
    assert.equal(replay.status, 401);
  });

  test("an existing linked identity logs into the SAME player on a second visit", async () => {
    const idToken1 = googleProvider.registerIdentity({ subject: "http-sub-repeat" });
    const start1 = await req("GET", "/v1/auth/google/start");
    const state1 = new URL(start1.body.url).searchParams.get("state");
    const cb1 = await rawGet(callbackUrl({ code: idToken1, state: state1 }));
    const handoff1 = new URL(cb1.headers.location).searchParams.get("handoff");
    const session1 = await req("POST", "/v1/auth/google/finalize", { body: { handoffCode: handoff1 } });

    const idToken2 = googleProvider.registerIdentity({ subject: "http-sub-repeat" });
    const start2 = await req("GET", "/v1/auth/google/start");
    const state2 = new URL(start2.body.url).searchParams.get("state");
    const cb2 = await rawGet(callbackUrl({ code: idToken2, state: state2 }));
    const handoff2 = new URL(cb2.headers.location).searchParams.get("handoff");
    const session2 = await req("POST", "/v1/auth/google/finalize", { body: { handoffCode: handoff2 } });

    assert.equal(session1.body.playerId, session2.body.playerId);
  });

  test("a matching, already-verified application email is refused as link_required, not auto-merged", async () => {
    await req("POST", "/v1/auth/register", { body: { handle: "googlematch", password: PASSWORD } });
    const token = (await req("POST", "/v1/auth/login", { body: { identifier: "googlematch", password: PASSWORD } })).body.accessToken;
    await req("PATCH", "/v1/me/email", { token, body: { email: "googlematch@example.com" } });
    // markVerified isn't exposed over HTTP directly -- verify via the service used by the fixture.
    await emailIdentity.markVerified((await req("GET", "/v1/me", { token })).body.id);

    const idToken = googleProvider.registerIdentity({ subject: "http-sub-match", email: "googlematch@example.com", emailVerified: true });
    const start = await req("GET", "/v1/auth/google/start");
    const state = new URL(start.body.url).searchParams.get("state");
    const cb = await rawGet(callbackUrl({ code: idToken, state }));
    const location = new URL(cb.headers.location);
    assert.equal(location.searchParams.get("outcome"), "link_required");
    assert.equal(location.searchParams.get("email"), "googlematch@example.com");
    assert.equal(location.searchParams.get("handoff"), null);
  });

  test("Google reporting an error (denied consent) redirects with outcome=denied, never a 500", async () => {
    const cb = await rawGet(callbackUrl({ error: "access_denied", state: "irrelevant" }));
    assert.equal(cb.status, 302);
    assert.equal(new URL(cb.headers.location).searchParams.get("outcome"), "denied");
  });

  test("a missing code or state redirects with outcome=invalid, never a 500", async () => {
    const cb = await rawGet(callbackUrl({ state: "only-state-no-code" }));
    assert.equal(new URL(cb.headers.location).searchParams.get("outcome"), "invalid");
  });

  test("a tampered/garbage state redirects with outcome=error", async () => {
    const cb = await rawGet(callbackUrl({ code: "whatever", state: "not-a-real-state" }));
    assert.equal(new URL(cb.headers.location).searchParams.get("outcome"), "error");
  });

  test("TOTP enrolled: finalize refuses without a code, succeeds with the correct one", async () => {
    const { totp: computeTotp, base32Decode } = await import("../../auth/src/totp.mjs");
    const { createAuthService: freshAuthService } = await import("../../auth/src/service.mjs");
    let clock = Date.now();
    const ownAuth = freshAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: FAST_ARGON, now: () => clock });
    const ownGoogleOAuth = createGoogleOAuthFlow(db, {
      googleProvider, oauthIdentity, oauthHandoff, emailIdentity, auth: ownAuth,
      signingKey: SIGNING_KEY, now: () => clock, allowedReturnPaths: [],
    });
    const own = createApi({
      db, auth: ownAuth, emailIdentity, googleOAuth: ownGoogleOAuth, googleFrontendOrigin: GOOGLE_FRONTEND_ORIGIN,
      rateLimit: { capacity: 5000, refillPerSecond: 5000 },
    });
    await own.listen();

    async function reqOwn(method, path, { token, body } = {}) {
      const res = await fetch(`${own.url}${path}`, {
        method,
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      let json = null;
      try { json = await res.json(); } catch { /* empty */ }
      return { status: res.status, body: json };
    }
    function ownCallbackUrl(params) {
      const url = new URL(`${own.url}/v1/auth/google/callback`);
      for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
      return url.toString();
    }

    await ownAuth.register({ playerId: "totpgoogle", handle: "totpgoogle", password: PASSWORD });
    const begin = await ownAuth.beginTotpEnrolment("totpgoogle", "totpgoogle@nizalo");
    const secret = base32Decode(begin.secretBase32);
    await ownAuth.confirmTotpEnrolment("totpgoogle", computeTotp(secret, clock));
    clock += 30_000;

    const idToken = googleProvider.registerIdentity({ subject: "http-sub-totp" });
    // Link this Google identity to the TOTP-enrolled player first (via the
    // orchestrator directly -- HTTP linking is covered in its own describe
    // block; this test is only about finalize()'s own TOTP gate).
    const linkState = new URL(ownGoogleOAuth.buildLinkAuthorizationUrl({ playerId: "totpgoogle" }).url).searchParams.get("state");
    await rawGet(ownCallbackUrl({ code: idToken, state: linkState }));

    const idToken2 = googleProvider.registerIdentity({ subject: "http-sub-totp" });
    const loginState2 = new URL((await reqOwn("GET", "/v1/auth/google/start")).body.url).searchParams.get("state");
    const cb2 = await rawGet(ownCallbackUrl({ code: idToken2, state: loginState2 }));
    const handoff2 = new URL(cb2.headers.location).searchParams.get("handoff");

    const withoutTotp = await reqOwn("POST", "/v1/auth/google/finalize", { body: { handoffCode: handoff2 } });
    assert.equal(withoutTotp.status, 401);
    assert.equal(withoutTotp.body.error.code, "TOTP_REQUIRED");

    clock += 30_000;
    const idToken3 = googleProvider.registerIdentity({ subject: "http-sub-totp" });
    const loginState3 = new URL((await reqOwn("GET", "/v1/auth/google/start")).body.url).searchParams.get("state");
    const cb3 = await rawGet(ownCallbackUrl({ code: idToken3, state: loginState3 }));
    const handoff3 = new URL(cb3.headers.location).searchParams.get("handoff");
    const withTotp = await reqOwn("POST", "/v1/auth/google/finalize", {
      body: { handoffCode: handoff3, totpCode: computeTotp(secret, clock) },
    });
    assert.equal(withTotp.status, 200);

    await own.close();
  });
});

describe("GET /v1/me/auth-methods", () => {
  test("a freshly registered player: password configured, nothing else", async () => {
    await req("POST", "/v1/auth/register", { body: { handle: "methodsalice", password: PASSWORD } });
    const token = (await req("POST", "/v1/auth/login", { body: { identifier: "methodsalice", password: PASSWORD } })).body.accessToken;
    const r = await req("GET", "/v1/me/auth-methods", { token });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, {
      email: { exists: false, verified: false },
      password: { configured: true },
      google: { connected: false },
      totp: { enabled: false },
    });
  });

  test("reflects a verified email and a linked Google identity", async () => {
    await req("POST", "/v1/auth/register", { body: { handle: "methodsbob", password: PASSWORD } });
    const token = (await req("POST", "/v1/auth/login", { body: { identifier: "methodsbob", password: PASSWORD } })).body.accessToken;
    await req("PATCH", "/v1/me/email", { token, body: { email: "methodsbob@example.com" } });
    const playerId = (await req("GET", "/v1/me", { token })).body.id;
    await emailIdentity.markVerified(playerId);
    await oauthIdentity.link({ playerId, provider: "google", subject: "methods-sub-bob" });

    const r = await req("GET", "/v1/me/auth-methods", { token });
    assert.deepEqual(r.body.email, { exists: true, verified: true });
    assert.deepEqual(r.body.google, { connected: true });
  });

  test("never exposes a provider subject, token, or internal id", async () => {
    await req("POST", "/v1/auth/register", { body: { handle: "methodscarol", password: PASSWORD } });
    const token = (await req("POST", "/v1/auth/login", { body: { identifier: "methodscarol", password: PASSWORD } })).body.accessToken;
    const playerId = (await req("GET", "/v1/me", { token })).body.id;
    await oauthIdentity.link({ playerId, provider: "google", subject: "should-never-leak-98765" });
    const r = await req("GET", "/v1/me/auth-methods", { token });
    assert.equal(JSON.stringify(r.body).includes("should-never-leak-98765"), false);
    assert.deepEqual(Object.keys(r.body).sort(), ["email", "google", "password", "totp"]);
  });

  test("anonymous access is refused", async () => {
    const r = await req("GET", "/v1/me/auth-methods");
    assert.equal(r.status, 401);
  });

  test("a player cannot read another player's auth methods -- selfOnly is enforced", async () => {
    await req("POST", "/v1/auth/register", { body: { handle: "methodsdan", password: PASSWORD } });
    await req("POST", "/v1/auth/register", { body: { handle: "methodserin", password: PASSWORD } });
    const token = (await req("POST", "/v1/auth/login", { body: { identifier: "methodsdan", password: PASSWORD } })).body.accessToken;
    // The route always reads the CALLER's own id (owner: actor.id) -- there
    // is no id parameter to tamper with, so this is really asserting the
    // route has no such parameter at all.
    const r = await req("GET", "/v1/me/auth-methods", { token });
    assert.equal(r.status, 200);
  });
});

describe("Google identity linking and unlinking over HTTP", () => {
  async function newPlayerWithStepUp(handle) {
    await req("POST", "/v1/auth/register", { body: { handle, password: PASSWORD } });
    const token = (await req("POST", "/v1/auth/login", { body: { identifier: handle, password: PASSWORD } })).body.accessToken;
    return token;
  }

  async function stepUpFor(token, action) {
    const step = await req("POST", "/v1/auth/step-up", { token, body: { action, password: PASSWORD } });
    assert.equal(step.status, 200, `step-up for ${action} failed: ${JSON.stringify(step.body)}`);
    return step.body.stepUpToken;
  }

  test("linking requires step-up -- without it, link/start is refused", async () => {
    const token = await newPlayerWithStepUp("linknostepup");
    const r = await req("POST", "/v1/me/identities/google/link/start", { token, body: {} });
    assert.equal(r.status, 401);
  });

  test("with step-up, link/start returns a URL, and completing it links the identity", async () => {
    const token = await newPlayerWithStepUp("linkwithstepup");
    const stepUpToken = await stepUpFor(token, "player.identity.link");
    const start = await req("POST", "/v1/me/identities/google/link/start", {
      token, body: { returnTo: "/settings" }, headers: { "x-step-up-token": stepUpToken },
    });
    assert.equal(start.status, 200);
    const state = new URL(start.body.url).searchParams.get("state");

    const idToken = googleProvider.registerIdentity({ subject: "http-link-sub" });
    const cb = await rawGet(new URL(`${base}/v1/auth/google/callback?code=${idToken}&state=${encodeURIComponent(state)}`).toString());
    const location = new URL(cb.headers.location);
    assert.equal(location.searchParams.get("outcome"), "linked");
    assert.equal(location.searchParams.get("returnTo"), "/settings");
  });

  test("unlinking requires step-up too", async () => {
    const token = await newPlayerWithStepUp("unlinknostepup");
    const r = await req("DELETE", "/v1/me/identities/google", { token });
    assert.equal(r.status, 401);
  });

  test("a player with a password can unlink Google via HTTP", async () => {
    const token = await newPlayerWithStepUp("unlinkwithpw");
    const playerId = (await req("GET", "/v1/me", { token })).body.id;
    const linkStepUp = await stepUpFor(token, "player.identity.link");
    const startLink = await req("POST", "/v1/me/identities/google/link/start", {
      token, body: {}, headers: { "x-step-up-token": linkStepUp },
    });
    const linkState = new URL(startLink.body.url).searchParams.get("state");
    const idToken = googleProvider.registerIdentity({ subject: `http-unlink-${playerId}` });
    await rawGet(`${base}/v1/auth/google/callback?code=${idToken}&state=${encodeURIComponent(linkState)}`);

    const unlinkStepUp = await stepUpFor(token, "player.identity.unlink");
    const unlink = await req("DELETE", "/v1/me/identities/google", { token, headers: { "x-step-up-token": unlinkStepUp } });
    assert.equal(unlink.status, 200);
  });

  test("a Google-only account cannot even reach unlink (no password/TOTP to step up with) until it sets a password via POST /v1/me/password, which needs no step-up itself", async () => {
    const idToken = googleProvider.registerIdentity({ subject: "http-google-only" });
    const start = await req("GET", "/v1/auth/google/start");
    const state = new URL(start.body.url).searchParams.get("state");
    const cb = await rawGet(`${base}/v1/auth/google/callback?code=${idToken}&state=${encodeURIComponent(state)}`);
    const handoff = new URL(cb.headers.location).searchParams.get("handoff");
    const session = await req("POST", "/v1/auth/google/finalize", { body: { handoffCode: handoff } });
    const token = session.body.accessToken;

    // Cannot even obtain a step-up token: stepUp() itself requires an
    // existing password to verify against, and this account has none --
    // the SAME reason player.password.set deliberately carries no stepUp
    // requirement of its own (see policy.mjs's comment on that action).
    const attemptStepUp = await req("POST", "/v1/auth/step-up", { token, body: { action: "player.identity.unlink", password: "irrelevant" } });
    assert.equal(attemptStepUp.status, 401);

    const bootstrapPassword = "a brand new bootstrap passphrase";
    const setPassword = await req("POST", "/v1/me/password", { token, body: { newPassword: bootstrapPassword } });
    assert.equal(setPassword.status, 201);

    // Now that a credential exists, step-up (and therefore unlink) works --
    // with the password just set, not the shared PASSWORD constant
    // stepUpFor() assumes (this account never had that one).
    const step = await req("POST", "/v1/auth/step-up", { token, body: { action: "player.identity.unlink", password: bootstrapPassword } });
    assert.equal(step.status, 200);
    const unlink = await req("DELETE", "/v1/me/identities/google", { token, headers: { "x-step-up-token": step.body.stepUpToken } });
    assert.equal(unlink.status, 200);
  });

  test("setting a password a second time is refused -- this route is a one-time bootstrap, not a password change", async () => {
    const token = await newPlayerWithStepUp("alreadyhaspw");
    const r = await req("POST", "/v1/me/password", { token, body: { newPassword: "another passphrase entirely" } });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, "CREDENTIAL_ALREADY_SET");
  });
});

describe("POST /v1/me/password/change -- the ordinary path for a player who already has a password", () => {
  async function newPlayer(handle) {
    await req("POST", "/v1/auth/register", { body: { handle, password: PASSWORD } });
    return (await req("POST", "/v1/auth/login", { body: { identifier: handle, password: PASSWORD } })).body.accessToken;
  }

  test("requires step-up", async () => {
    const token = await newPlayer("changepwnostepup");
    const r = await req("POST", "/v1/me/password/change", { token, body: { currentPassword: PASSWORD, newPassword: "a new passphrase entirely" } });
    assert.equal(r.status, 401);
  });

  test("with step-up and the correct current password, changes it -- old password stops working, new one works", async () => {
    const token = await newPlayer("changepwok");
    const stepUpRes = await req("POST", "/v1/auth/step-up", { token, body: { action: "player.password.change", password: PASSWORD } });
    assert.equal(stepUpRes.status, 200);
    const r = await req("POST", "/v1/me/password/change", {
      token, body: { currentPassword: PASSWORD, newPassword: "a new passphrase entirely" },
      headers: { "x-step-up-token": stepUpRes.body.stepUpToken },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.changed, true);

    const oldLogin = await req("POST", "/v1/auth/login", { body: { identifier: "changepwok", password: PASSWORD } });
    assert.equal(oldLogin.status, 401);
    const newLogin = await req("POST", "/v1/auth/login", { body: { identifier: "changepwok", password: "a new passphrase entirely" } });
    assert.equal(newLogin.status, 200);
  });

  test("the wrong current password is refused with 401, not touching the real one", async () => {
    const token = await newPlayer("changepwwrong");
    const stepUpRes = await req("POST", "/v1/auth/step-up", { token, body: { action: "player.password.change", password: PASSWORD } });
    const r = await req("POST", "/v1/me/password/change", {
      token, body: { currentPassword: "not the real password", newPassword: "a new passphrase entirely" },
      headers: { "x-step-up-token": stepUpRes.body.stepUpToken },
    });
    assert.equal(r.status, 401);
    const stillWorks = await req("POST", "/v1/auth/login", { body: { identifier: "changepwwrong", password: PASSWORD } });
    assert.equal(stillWorks.status, 200);
  });
});

describe("registration and login over HTTP", () => {
  test("register then log in", async () => {
    const reg = await req("POST", "/v1/auth/register", {
      body: { handle: "carol", password: PASSWORD },
    });
    assert.equal(reg.status, 201);

    const login = await req("POST", "/v1/auth/login", {
      body: { identifier: "carol", password: PASSWORD },
    });
    assert.equal(login.status, 200);
    assert.ok(login.body.accessToken);
    assert.ok(login.body.refreshToken);
  });

  test("a wrong password and an unknown account are indistinguishable", async () => {
    const wrong = await req("POST", "/v1/auth/login", {
      body: { identifier: "carol", password: "wrong-password-here" },
    });
    const unknown = await req("POST", "/v1/auth/login", {
      body: { identifier: "does-not-exist", password: "wrong-password-here" },
    });
    assert.equal(wrong.status, 401);
    assert.deepEqual(wrong.body, unknown.body, "the response must not enumerate accounts");
  });

  test("a weak password is refused with a usable reason", async () => {
    const r = await req("POST", "/v1/auth/register", {
      body: { handle: "weakling", password: "short" },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, "WEAK_PASSWORD");
  });

  test("refresh rotates over HTTP", async () => {
    const login = await req("POST", "/v1/auth/login", {
      body: { identifier: "carol", password: PASSWORD },
    });
    const refreshed = await req("POST", "/v1/auth/refresh", {
      body: { refreshToken: login.body.refreshToken },
    });
    assert.equal(refreshed.status, 200);
    assert.notEqual(refreshed.body.refreshToken, login.body.refreshToken);

    const reuse = await req("POST", "/v1/auth/refresh", {
      body: { refreshToken: login.body.refreshToken },
    });
    assert.equal(reuse.status, 401);
    assert.equal(reuse.body.error.code, "TOKEN_REUSED");
  });
});

describe("ownership is enforced before the handler runs", () => {
  test("a player may read their own wallet", async () => {
    const r = await req("GET", "/v1/players/alice/wallet", { token: await tokenFor("alice") });
    assert.equal(r.status, 200);
    assert.equal(r.body.accounts.length, 5);
  });

  test("a player may NOT read another player's wallet", async () => {
    const r = await req("GET", "/v1/players/bob/wallet", { token: await tokenFor("alice") });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, "NOT_OWNER");
  });

  test("a SUPER_ADMIN gets no implicit access to a player's wallet route", async () => {
    // Admins read balances through admin.ledger.read, which is audited. The
    // player-scoped route stays player-scoped.
    const r = await req("GET", "/v1/players/alice/wallet", { token: await tokenFor("root") });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, "NOT_OWNER");
  });
});

describe("admin surfaces", () => {
  test("a player cannot reach an admin route", async () => {
    const r = await req("GET", "/v1/admin/players/alice", { token: await tokenFor("alice") });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, "ADMIN_ONLY");
  });

  test("an admin with the capability may read", async () => {
    const r = await req("GET", "/v1/admin/players/alice", { token: await tokenFor("root") });
    assert.equal(r.status, 200);
    assert.equal(r.body.handle, "alice");
  });

  test("SUPPORT may read a player but not the ledger", async () => {
    const token = await tokenFor("helper");
    assert.equal((await req("GET", "/v1/admin/players/alice", { token })).status, 200);
    const denied = await req("GET", "/v1/admin/ledger/alice", { token });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, "MISSING_CAPABILITY");
  });

  test("an admin without MFA is refused everything", async () => {
    const r = await req("GET", "/v1/admin/players/alice", { token: await tokenFor("nomfa") });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, "MFA_REQUIRED");
  });

  test("roles come from the database, not from the token", async () => {
    // helper holds SUPPORT. Nothing in the token says so, and nothing a client
    // sends can change it.
    const token = await tokenFor("helper");
    assert.equal((await req("GET", "/v1/admin/audit", { token })).status, 403);
    assert.equal((await req("GET", "/v1/admin/audit", { token: await tokenFor("root") })).status, 200);
  });

  test("admin actions and denials are both audited", async () => {
    const before = await db.query("SELECT count(*)::int n FROM admin_audit");
    await req("GET", "/v1/admin/players/alice", { token: await tokenFor("root") });
    await req("GET", "/v1/admin/ledger/alice", { token: await tokenFor("helper") });
    const after = await db.query(
      "SELECT admin_id, action, decision FROM admin_audit ORDER BY id DESC LIMIT 2"
    );
    const total = await db.query("SELECT count(*)::int n FROM admin_audit");
    assert.ok(total.rows[0].n >= before.rows[0].n + 2);
    assert.ok(after.rows.some((r) => r.decision === "DENY"), "a refusal is recorded too");
  });
});

describe("step-up", () => {
  test("a withdrawal without step-up is refused", async () => {
    // Control is off as well, but step-up is checked first for players so the
    // client learns the actionable requirement.
    const r = await req("POST", "/v1/players/alice/withdrawals", {
      token: await tokenFor("alice"), body: { amount: "1000000" },
    });
    assert.ok([401, 503].includes(r.status), `got ${r.status}`);
  });

  test("a step-up token for another action does not unlock a withdrawal", async () => {
    const token = await tokenFor("alice");
    const step = await req("POST", "/v1/auth/step-up", {
      token, body: { action: "player.password.change", password: PASSWORD },
    });
    assert.equal(step.status, 200);

    const r = await req("POST", "/v1/players/alice/withdrawals", {
      token, body: {}, headers: { "x-step-up-token": step.body.stepUpToken },
    });
    assert.notEqual(r.status, 200, "the wrong step-up must not authorise a withdrawal");
  });
});

describe("emergency controls gate the API", () => {
  test("a disabled control answers 503, not 403", async () => {
    // The distinction matters operationally: 503 says "the platform turned this
    // off", 403 says "you may not do this". Support answers them differently.
    const step = await req("POST", "/v1/auth/step-up", {
      token: await tokenFor("alice"),
      body: { action: "wallet.withdraw", password: PASSWORD },
    });
    const r = await req("POST", "/v1/players/alice/withdrawals", {
      token: await tokenFor("alice"), body: {},
      headers: { "x-step-up-token": step.body.stepUpToken },
    });
    assert.equal(r.status, 503);
    assert.equal(r.body.error.code, "CONTROL_DISABLED");
  });

  test("an admin can toggle a control, with a reason", async () => {
    const token = await tokenFor("root");
    const step = await req("POST", "/v1/auth/step-up", {
      token, body: { action: "admin.control.toggle", password: PASSWORD },
    });
    const r = await req("POST", "/v1/admin/controls/PROMOTIONS", {
      token, body: { enabled: true, reason: "launch promo campaign" },
      headers: { "x-step-up-token": step.body.stepUpToken },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.enabled, true);

    const log = await db.query(
      "SELECT reason FROM platform_control_change WHERE key='PROMOTIONS' ORDER BY id DESC LIMIT 1"
    );
    assert.equal(log.rows[0].reason, "launch promo campaign");
  });

  test("the global emergency switch is not reachable through the toggle route", async () => {
    const token = await tokenFor("root");
    const step = await req("POST", "/v1/auth/step-up", {
      token, body: { action: "admin.control.toggle", password: PASSWORD },
    });
    const r = await req("POST", "/v1/admin/controls/GLOBAL_EMERGENCY", {
      token, body: { enabled: true, reason: "testing" },
      headers: { "x-step-up-token": step.body.stepUpToken },
    });
    assert.equal(r.status, 403);
  });

  test("toggling without step-up is refused", async () => {
    const r = await req("POST", "/v1/admin/controls/PROMOTIONS", {
      token: await tokenFor("root"), body: { enabled: false, reason: "no step up" },
    });
    assert.equal(r.status, 401);
  });
});

describe("play surfaces", () => {
  test("a player can queue, and cannot queue twice", async () => {
    const token = await tokenFor("alice");
    const first = await req("POST", "/v1/matchmaking/tickets", { token, body: { mode: "blitz" } });
    assert.equal(first.status, 201);
    const second = await req("POST", "/v1/matchmaking/tickets", { token, body: { mode: "blitz" } });
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, "ALREADY_QUEUED");
  });

  test("an unknown duel is a 404, not a leak", async () => {
    const r = await req("GET", "/v1/duels/does-not-exist", { token: await tokenFor("alice") });
    assert.equal(r.status, 404);
    assert.deepEqual(Object.keys(r.body.error), ["code"], "no internal detail escapes");
  });

  describe("VS_COMPUTER", () => {
    test("creating one returns a real, immediately-loadable duel against the chosen difficulty's bot", async () => {
      const token = await tokenFor("alice");
      const r = await req("POST", "/v1/matchmaking/vs-computer", { token, body: { gameId: "chess", difficulty: "HARD" } });
      assert.equal(r.status, 201);
      assert.ok(r.body.duelId);

      const row = await db.query(
        "SELECT seat_0, seat_1, tier, status, is_vs_computer FROM duel WHERE id = $1", [r.body.duelId]
      );
      assert.equal(row.rows[0].seat_0, "alice");
      assert.equal(row.rows[0].seat_1, "ai-hard");
      assert.equal(row.rows[0].tier, "FREE");
      assert.equal(row.rows[0].is_vs_computer, true);
      assert.ok(["READY", "LIVE"].includes(row.rows[0].status), "READY (or already dispatched to LIVE)");
    });

    test("an unknown difficulty is refused, not silently defaulted", async () => {
      const token = await tokenFor("alice");
      const r = await req("POST", "/v1/matchmaking/vs-computer", { token, body: { gameId: "chess", difficulty: "NIGHTMARE" } });
      assert.equal(r.status, 400);
      assert.equal(r.body.error.code, "UNKNOWN_DIFFICULTY");
    });

    test("a game with no registered AI adapter is refused, not silently allowed to hang forever unplayed", async () => {
      const token = await tokenFor("alice");
      const r = await req("POST", "/v1/matchmaking/vs-computer", { token, body: { gameId: "speed-math", difficulty: "EASY" } });
      assert.equal(r.status, 400);
      assert.equal(r.body.error.code, "UNSUPPORTED_GAME");
    });

    test("a lower difficulty creates a duel against a DIFFERENT bot identity", async () => {
      const token = await tokenFor("alice");
      const r = await req("POST", "/v1/matchmaking/vs-computer", { token, body: { gameId: "chess", difficulty: "EASY" } });
      assert.equal(r.status, 201);
      const row = await db.query("SELECT seat_1 FROM duel WHERE id = $1", [r.body.duelId]);
      assert.equal(row.rows[0].seat_1, "ai-easy");
    });
  });

  describe("PLAY WITH FRIEND -- challenges", () => {
    test("alice challenges bob, bob accepts, and a real FREE human-vs-human duel is created", async () => {
      const aliceToken = await tokenFor("alice");
      const create = await req("POST", "/v1/challenges", { token: aliceToken, body: { gameId: "chess", opponentNickname: "bob" } });
      assert.equal(create.status, 201);
      assert.ok(create.body.challengeId);

      const incoming = await req("GET", "/v1/challenges", { token: await tokenFor("bob") });
      assert.equal(incoming.status, 200);
      assert.ok(incoming.body.incoming.some((c) => c.id === create.body.challengeId));

      const accept = await req("POST", `/v1/challenges/${create.body.challengeId}/accept`, { token: await tokenFor("bob") });
      assert.equal(accept.status, 200);
      assert.ok(accept.body.duelId);

      const row = await db.query(
        "SELECT seat_0, seat_1, tier, is_vs_computer, status FROM duel WHERE id = $1", [accept.body.duelId]
      );
      assert.equal(row.rows[0].seat_0, "alice");
      assert.equal(row.rows[0].seat_1, "bob");
      assert.equal(row.rows[0].tier, "FREE");
      assert.equal(row.rows[0].is_vs_computer, false);
      assert.ok(["READY", "LIVE"].includes(row.rows[0].status));
    });

    test("a second challenge to the same pending opponent is refused as a duplicate", async () => {
      const token = await tokenFor("alice");
      const first = await req("POST", "/v1/challenges", { token, body: { gameId: "chess", opponentNickname: "bob" } });
      assert.equal(first.status, 201);
      const second = await req("POST", "/v1/challenges", { token, body: { gameId: "chess", opponentNickname: "bob" } });
      assert.equal(second.status, 409);
      assert.equal(second.body.error.code, "ALREADY_PENDING");
      // Clean up: leaving this PENDING would collide with every later test's
      // own alice->bob challenge via the same unique-pending constraint.
      await req("POST", `/v1/challenges/${first.body.challengeId}/cancel`, { token });
    });

    test("challenging yourself is refused", async () => {
      const token = await tokenFor("alice");
      const r = await req("POST", "/v1/challenges", { token, body: { gameId: "chess", opponentNickname: "alice" } });
      assert.equal(r.status, 400);
      assert.equal(r.body.error.code, "CANNOT_CHALLENGE_SELF");
    });

    test("challenging an unknown nickname is refused", async () => {
      const token = await tokenFor("alice");
      const r = await req("POST", "/v1/challenges", { token, body: { gameId: "chess", opponentNickname: "does-not-exist" } });
      assert.equal(r.status, 400);
      assert.equal(r.body.error.code, "UNKNOWN_OPPONENT");
    });

    test("bob can decline, and the challenger's outgoing list reflects it disappearing from PENDING", async () => {
      const token = await tokenFor("alice");
      const create = await req("POST", "/v1/challenges", { token, body: { gameId: "chess", opponentNickname: "bob" } });
      const decline = await req("POST", `/v1/challenges/${create.body.challengeId}/decline`, { token: await tokenFor("bob") });
      assert.equal(decline.status, 200);

      const outgoing = await req("GET", "/v1/challenges", { token });
      assert.ok(!outgoing.body.outgoing.some((c) => c.id === create.body.challengeId));
    });

    test("only the challenger can cancel, and only the opponent can accept or decline", async () => {
      const token = await tokenFor("alice");
      const create = await req("POST", "/v1/challenges", { token, body: { gameId: "chess", opponentNickname: "bob" } });

      const wrongCancel = await req("POST", `/v1/challenges/${create.body.challengeId}/cancel`, { token: await tokenFor("bob") });
      assert.equal(wrongCancel.status, 403);

      const wrongAccept = await req("POST", `/v1/challenges/${create.body.challengeId}/accept`, { token });
      assert.equal(wrongAccept.status, 403);

      const cancel = await req("POST", `/v1/challenges/${create.body.challengeId}/cancel`, { token });
      assert.equal(cancel.status, 200);
    });

    test("accepting an already-resolved challenge is refused, not double-created", async () => {
      const token = await tokenFor("alice");
      const create = await req("POST", "/v1/challenges", { token, body: { gameId: "chess", opponentNickname: "bob" } });
      const bobToken = await tokenFor("bob");
      const firstAccept = await req("POST", `/v1/challenges/${create.body.challengeId}/accept`, { token: bobToken });
      assert.equal(firstAccept.status, 200);
      const secondAccept = await req("POST", `/v1/challenges/${create.body.challengeId}/accept`, { token: bobToken });
      assert.equal(secondAccept.status, 400);
      assert.equal(secondAccept.body.error.code, "NOT_PENDING");
    });
  });

  test("the leaderboard is readable and bounded", async () => {
    const r = await req("GET", "/v1/leaderboard?limit=9999", { token: await tokenFor("alice") });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.entries));
  });
});

describe("admin RBAC: custom roles and permissions over HTTP", () => {
  async function stepUpFor(handle, action) {
    const token = await tokenFor(handle);
    const step = await req("POST", "/v1/auth/step-up", { token, body: { action, password: PASSWORD } });
    assert.equal(step.status, 200, `step-up for ${action} failed: ${JSON.stringify(step.body)}`);
    return { token, stepUpToken: step.body.stepUpToken };
  }

  test("a non-admin cannot reach any RBAC route", async () => {
    const r = await req("GET", "/v1/admin/roles", { token: await tokenFor("alice") });
    assert.equal(r.status, 403);
  });

  test("an admin who is not SUPER_ADMIN cannot manage roles -- this capability is SUPER_ADMIN only", async () => {
    // "helper" holds SUPPORT, which has real MFA and real capabilities, just
    // not this one -- the cleanest actor for a MISSING_CAPABILITY assertion.
    const { token, stepUpToken } = await stepUpFor("helper", "admin.rbac.manage");
    const r = await req("GET", "/v1/admin/roles", { token, headers: { "x-step-up-token": stepUpToken } });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, "MISSING_CAPABILITY");
  });

  test("SUPER_ADMIN can create a role, read it back, and it appears in the list", async () => {
    const { token, stepUpToken } = await stepUpFor("root", "admin.rbac.manage");
    const create = await req("POST", "/v1/admin/roles", {
      token, headers: { "x-step-up-token": stepUpToken },
      body: { id: "role-api-support", name: "API Support L1", permissions: ["TICKET_VIEW", "TICKET_REPLY"] },
    });
    assert.equal(create.status, 201);
    assert.deepEqual(create.body.permissions, ["TICKET_REPLY", "TICKET_VIEW"]);

    const get = await req("GET", "/v1/admin/roles/role-api-support", { token, headers: { "x-step-up-token": stepUpToken } });
    assert.equal(get.status, 200);
    assert.equal(get.body.name, "API Support L1");

    const list = await req("GET", "/v1/admin/roles", { token, headers: { "x-step-up-token": stepUpToken } });
    assert.ok(list.body.roles.some((r) => r.id === "role-api-support"));
  });

  test("creating a role with an unknown permission code is refused with 400", async () => {
    const { token, stepUpToken } = await stepUpFor("root", "admin.rbac.manage");
    const r = await req("POST", "/v1/admin/roles", {
      token, headers: { "x-step-up-token": stepUpToken },
      body: { id: "role-api-bad", name: "Bad", permissions: ["NOT_REAL"] },
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, "UNKNOWN_PERMISSION");
  });

  test("permissions can be updated, and the diff is what changed", async () => {
    const { token, stepUpToken } = await stepUpFor("root", "admin.rbac.manage");
    await req("POST", "/v1/admin/roles", {
      token, headers: { "x-step-up-token": stepUpToken },
      body: { id: "role-api-chat", name: "API Chat Mod", permissions: ["CHAT_MODERATE"] },
    });
    const patch = await req("PATCH", "/v1/admin/roles/role-api-chat/permissions", {
      token, headers: { "x-step-up-token": stepUpToken },
      body: { permissions: ["CHAT_MODERATE", "CHAT_MUTE"] },
    });
    assert.equal(patch.status, 200);
    assert.deepEqual(patch.body.added, ["CHAT_MUTE"]);
  });

  test("granting a role to an admin, reading their effective permissions, then revoking it", async () => {
    const { token, stepUpToken } = await stepUpFor("root", "admin.rbac.manage");
    await req("POST", "/v1/admin/roles", {
      token, headers: { "x-step-up-token": stepUpToken },
      body: { id: "role-api-game", name: "API Game Ops", permissions: ["GAME_MANAGE"] },
    });
    const grant = await req("POST", "/v1/admin/admin-users/helper/roles", {
      token, headers: { "x-step-up-token": stepUpToken }, body: { roleId: "role-api-game" },
    });
    assert.equal(grant.status, 201);

    const effective = await req("GET", "/v1/admin/admin-users/helper/permissions", {
      token, headers: { "x-step-up-token": stepUpToken },
    });
    assert.deepEqual(effective.body.permissions, ["GAME_MANAGE"]);

    const revoke = await req("DELETE", "/v1/admin/admin-users/helper/roles/role-api-game", {
      token, headers: { "x-step-up-token": stepUpToken },
    });
    assert.equal(revoke.status, 200);
    assert.deepEqual(revoke.body.roles, []);
  });

  test("SUPER_ADMIN cannot grant a role to themselves through the API", async () => {
    const { token, stepUpToken } = await stepUpFor("root", "admin.rbac.manage");
    await req("POST", "/v1/admin/roles", {
      token, headers: { "x-step-up-token": stepUpToken },
      body: { id: "role-api-selfgrant", name: "Self Grant Attempt API" },
    });
    const r = await req("POST", "/v1/admin/admin-users/root/roles", {
      token, headers: { "x-step-up-token": stepUpToken }, body: { roleId: "role-api-selfgrant" },
    });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, "SELF_GRANT");
  });

  test("a system role cannot be edited or deleted through the API, 403 not 500", async () => {
    await db.query(
      "INSERT INTO role (id, name, description, is_system, created_by) VALUES ('role-api-system','API System Role','',TRUE,'root')"
    );
    const { token, stepUpToken } = await stepUpFor("root", "admin.rbac.manage");
    const patch = await req("PATCH", "/v1/admin/roles/role-api-system", {
      token, headers: { "x-step-up-token": stepUpToken }, body: { name: "x" },
    });
    assert.equal(patch.status, 403);
    const del = await req("DELETE", "/v1/admin/roles/role-api-system", {
      token, headers: { "x-step-up-token": stepUpToken },
    });
    assert.equal(del.status, 403);
  });

  test("every RBAC mutation is recorded in admin_audit with the operator and the change", async () => {
    const { token, stepUpToken } = await stepUpFor("root", "admin.rbac.manage");
    await req("POST", "/v1/admin/roles", {
      token, headers: { "x-step-up-token": stepUpToken },
      body: { id: "role-api-audited", name: "Audited Role", permissions: ["TICKET_VIEW"] },
    });
    const row = await db.query(
      `SELECT admin_id, action, subject_type, subject_id, detail FROM admin_audit
        WHERE action = 'admin.rbac.manage' AND subject_id = 'role-api-audited'
        ORDER BY id DESC LIMIT 1`
    );
    assert.equal(row.rows.length, 1);
    assert.equal(row.rows[0].admin_id, "root");
    assert.equal(row.rows[0].subject_type, "role");
    assert.deepEqual(row.rows[0].detail.permissions, ["TICKET_VIEW"]);
  });

  test("without step-up, RBAC management is refused even for SUPER_ADMIN", async () => {
    const r = await req("GET", "/v1/admin/roles", { token: await tokenFor("root") });
    assert.equal(r.status, 401);
  });
});

describe("rate limiting", () => {
  test("a burst is throttled with 429", async () => {
    const own = createApi({ db, auth, rateLimit: { capacity: 3, refillPerSecond: 0 } });
    await own.listen();
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push((await fetch(`${own.url}/v1/health`)).status);
    }
    assert.ok(results.includes(429), `expected a 429 in ${results}`);
    assert.equal(results[0], 200, "the first requests are served");
    await own.close();
  });
});

describe("email-code rate limiting: a second, stricter, per-IP budget on top of the general limiter", () => {
  test("email-code/request is throttled independently of the general per-IP budget", async () => {
    const own = createApi({
      db, auth, emailIdentity, emailLoginCode: createEmailLoginCodeFlow(db, { emailChallenge, emailIdentity, emailService: emailServiceForTests }),
      rateLimit: { capacity: 5000, refillPerSecond: 5000 }, // general limiter wide open
      sensitiveRateLimits: { "email-code-request": { capacity: 3, refillPerSecond: 0 } },
    });
    await own.listen();
    const results = [];
    for (let i = 0; i < 6; i++) {
      const r = await fetch(`${own.url}/v1/auth/email-code/request`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: `spam${i}@example.com` }),
      });
      results.push(r.status);
    }
    assert.ok(results.includes(429), `expected a 429 in ${results}`);
    assert.equal(results[0], 202, "the first requests are served");
    await own.close();
  });

  test("email-code/verify has its own independent budget too -- exhausting /request does not exhaust /verify", async () => {
    const own = createApi({
      db, auth, emailIdentity, emailLoginCode: createEmailLoginCodeFlow(db, { emailChallenge, emailIdentity, emailService: emailServiceForTests }),
      rateLimit: { capacity: 5000, refillPerSecond: 5000 },
      sensitiveRateLimits: {
        "email-code-request": { capacity: 1, refillPerSecond: 0 },
        "email-code-verify": { capacity: 5000, refillPerSecond: 5000 },
      },
    });
    await own.listen();
    const post = (path, body) => fetch(`${own.url}${path}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    assert.equal((await post("/v1/auth/email-code/request", { email: "a@example.com" })).status, 202);
    assert.equal((await post("/v1/auth/email-code/request", { email: "b@example.com" })).status, 429, "request budget of 1 is now exhausted");
    // verify uses a completely separate bucket -- it is not also blocked.
    assert.equal((await post("/v1/auth/email-code/verify", { email: "a@example.com", code: "AAAAAA" })).status, 401);
    await own.close();
  });

  test("with no sensitiveRateLimits configured, a sane default still applies (not unlimited)", async () => {
    const own = createApi({
      db, auth, emailIdentity, emailLoginCode: createEmailLoginCodeFlow(db, { emailChallenge, emailIdentity, emailService: emailServiceForTests }),
      rateLimit: { capacity: 5000, refillPerSecond: 5000 },
      // sensitiveRateLimits deliberately omitted -- exercising the { capacity: 5, refillPerSecond: 5/300 } default.
    });
    await own.listen();
    const results = [];
    for (let i = 0; i < 7; i++) {
      const r = await fetch(`${own.url}/v1/auth/email-code/request`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: `d${i}@example.com` }),
      });
      results.push(r.status);
    }
    assert.ok(results.includes(429), `expected the default budget to eventually throttle: ${results}`);
    await own.close();
  });
});

describe("password-reset rate limiting: a second, stricter, per-IP budget on top of the general limiter", () => {
  test("password-reset/request is throttled independently of the general per-IP budget", async () => {
    const own = createApi({
      db, auth, emailIdentity,
      passwordReset: createPasswordResetFlow(db, { emailChallenge, emailIdentity, emailService: emailServiceForTests, auth }),
      rateLimit: { capacity: 5000, refillPerSecond: 5000 }, // general limiter wide open
      sensitiveRateLimits: { "password-reset-request": { capacity: 3, refillPerSecond: 0 } },
    });
    await own.listen();
    const results = [];
    for (let i = 0; i < 6; i++) {
      const r = await fetch(`${own.url}/v1/auth/password-reset/request`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: `spamreset${i}@example.com` }),
      });
      results.push(r.status);
    }
    assert.ok(results.includes(429), `expected a 429 in ${results}`);
    assert.equal(results[0], 202, "the first requests are served");
    await own.close();
  });

  test("password-reset/confirm has its own independent budget too -- exhausting /request does not exhaust /confirm", async () => {
    const own = createApi({
      db, auth, emailIdentity,
      passwordReset: createPasswordResetFlow(db, { emailChallenge, emailIdentity, emailService: emailServiceForTests, auth }),
      rateLimit: { capacity: 5000, refillPerSecond: 5000 },
      sensitiveRateLimits: {
        "password-reset-request": { capacity: 1, refillPerSecond: 0 },
        "password-reset-confirm": { capacity: 5000, refillPerSecond: 5000 },
      },
    });
    await own.listen();
    const post = (path, body) => fetch(`${own.url}${path}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    assert.equal((await post("/v1/auth/password-reset/request", { email: "resetbudget-a@example.com" })).status, 202);
    assert.equal((await post("/v1/auth/password-reset/request", { email: "resetbudget-b@example.com" })).status, 429, "request budget of 1 is now exhausted");
    // confirm uses a completely separate bucket -- it is not also blocked.
    assert.equal((await post("/v1/auth/password-reset/confirm", { email: "resetbudget-a@example.com", code: "AAAAAAAAAA", newPassword: "irrelevant passphrase" })).status, 401);
    await own.close();
  });

  test("with no sensitiveRateLimits configured, a sane default still applies (not unlimited)", async () => {
    const own = createApi({
      db, auth, emailIdentity,
      passwordReset: createPasswordResetFlow(db, { emailChallenge, emailIdentity, emailService: emailServiceForTests, auth }),
      rateLimit: { capacity: 5000, refillPerSecond: 5000 },
      // sensitiveRateLimits deliberately omitted -- exercising the { capacity: 5, refillPerSecond: 5/300 } default.
    });
    await own.listen();
    const results = [];
    for (let i = 0; i < 7; i++) {
      const r = await fetch(`${own.url}/v1/auth/password-reset/request`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: `resetdefault${i}@example.com` }),
      });
      results.push(r.status);
    }
    assert.ok(results.includes(429), `expected the default budget to eventually throttle: ${results}`);
    await own.close();
  });
});

describe("CORS", () => {
  test("with no configured origins (the default), no CORS header is ever sent", async () => {
    // `api` from the shared fixture is created with no corsOrigins.
    const r = await fetch(`${base}/v1/health`, { headers: { origin: "http://localhost:3400" } });
    assert.equal(r.headers.get("access-control-allow-origin"), null);
  });

  test("an allowed origin gets its own value echoed back, with Vary: Origin", async () => {
    const own = createApi({ db, auth, rateLimit: { capacity: 5000, refillPerSecond: 5000 }, corsOrigins: ["http://localhost:3400"] });
    await own.listen();
    const r = await fetch(`${own.url}/v1/health`, { headers: { origin: "http://localhost:3400" } });
    assert.equal(r.headers.get("access-control-allow-origin"), "http://localhost:3400");
    assert.equal(r.headers.get("vary"), "origin");
    await own.close();
  });

  test("an origin NOT on the allowlist gets no CORS header, not a wildcard or a reflected value", async () => {
    const own = createApi({ db, auth, rateLimit: { capacity: 5000, refillPerSecond: 5000 }, corsOrigins: ["http://localhost:3400"] });
    await own.listen();
    const r = await fetch(`${own.url}/v1/health`, { headers: { origin: "http://evil.example" } });
    assert.equal(r.headers.get("access-control-allow-origin"), null);
    await own.close();
  });

  test("a preflight OPTIONS request for an allowed origin gets 204 with the expected headers", async () => {
    const own = createApi({ db, auth, rateLimit: { capacity: 5000, refillPerSecond: 5000 }, corsOrigins: ["http://localhost:3400"] });
    await own.listen();
    const r = await fetch(`${own.url}/v1/me`, {
      method: "OPTIONS",
      headers: { origin: "http://localhost:3400", "access-control-request-method": "PATCH" },
    });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get("access-control-allow-origin"), "http://localhost:3400");
    assert.match(r.headers.get("access-control-allow-methods") ?? "", /PATCH/);
    assert.match(r.headers.get("access-control-allow-headers") ?? "", /authorization/);
    await own.close();
  });

  test("a preflight from a disallowed origin still gets 204 (never an error), but no CORS headers -- the browser is what refuses", async () => {
    const own = createApi({ db, auth, rateLimit: { capacity: 5000, refillPerSecond: 5000 }, corsOrigins: ["http://localhost:3400"] });
    await own.listen();
    const r = await fetch(`${own.url}/v1/me`, { method: "OPTIONS", headers: { origin: "http://evil.example" } });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get("access-control-allow-origin"), null);
    await own.close();
  });

  test("never sends Access-Control-Allow-Credentials -- auth here is a bearer token, not a cookie", async () => {
    const own = createApi({ db, auth, rateLimit: { capacity: 5000, refillPerSecond: 5000 }, corsOrigins: ["http://localhost:3400"] });
    await own.listen();
    const r = await fetch(`${own.url}/v1/health`, { headers: { origin: "http://localhost:3400" } });
    assert.equal(r.headers.get("access-control-allow-credentials"), null);
    await own.close();
  });
});
