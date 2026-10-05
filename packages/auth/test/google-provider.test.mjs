/**
 * createGoogleOidcProvider() -- the ONE place that talks real OIDC. This
 * suite signs genuine JWTs with a locally generated key pair and verifies
 * them against an INJECTED local JWKS (jose's createLocalJWKSet), so every
 * one of these tests exercises the real signature/issuer/audience/expiry
 * validation path with zero network access -- never Google's actual JWKS
 * endpoint. The orchestrator's business logic (google-oauth.mjs) is tested
 * separately, against createMockGoogleProvider(), precisely so that suite
 * never needs to know or care what a real JWT looks like.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from "jose";
import { createGoogleOidcProvider, GoogleAuthError, GOOGLE_ISSUERS } from "../src/google-provider.mjs";

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const KID = "test-key-1";

let privateKey, jwks, provider;

before(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  jwk.kid = KID;
  jwk.alg = "RS256";
  jwks = createLocalJWKSet({ keys: [jwk] });
  provider = createGoogleOidcProvider({
    clientId: CLIENT_ID, clientSecret: "shh", redirectUri: "https://api.nizalo.com/v1/auth/google/callback", jwks,
  });
});

async function sign(claims, { exp = "10m", key = privateKey, kid = KID } = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key);
}

describe("buildAuthorizationUrl", () => {
  test("carries client_id, redirect_uri, response_type=code, scope, and the given state", () => {
    const url = new URL(provider.buildAuthorizationUrl({ state: "opaque-state-value" }));
    assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.equal(url.searchParams.get("client_id"), CLIENT_ID);
    assert.equal(url.searchParams.get("redirect_uri"), "https://api.nizalo.com/v1/auth/google/callback");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("state"), "opaque-state-value");
    assert.match(url.searchParams.get("scope"), /openid/);
  });

  test("never requests offline access -- this product has no use for a refresh token", () => {
    const url = new URL(provider.buildAuthorizationUrl({ state: "s" }));
    assert.equal(url.searchParams.get("access_type"), "online");
  });
});

describe("validateIdToken -- real signature, issuer, audience and expiry checks", () => {
  test("a genuinely valid Google-shaped token verifies and yields the expected claims", async () => {
    const token = await sign({
      iss: GOOGLE_ISSUERS[0], aud: CLIENT_ID, sub: "1234567890",
      email: "player@example.com", email_verified: true, name: "Test Player",
    });
    const r = await provider.validateIdToken(token);
    assert.equal(r.ok, true);
    assert.equal(r.subject, "1234567890");
    assert.equal(r.email, "player@example.com");
    assert.equal(r.emailVerified, true);
    assert.equal(r.name, "Test Player");
  });

  test("the OTHER accepted issuer form (bare 'accounts.google.com') also verifies", async () => {
    const token = await sign({ iss: GOOGLE_ISSUERS[1], aud: CLIENT_ID, sub: "1234567890" });
    const r = await provider.validateIdToken(token);
    assert.equal(r.ok, true);
  });

  test("email_verified defaults to false, and a missing email yields null, never undefined leaking through", async () => {
    const token = await sign({ iss: GOOGLE_ISSUERS[0], aud: CLIENT_ID, sub: "no-email-user" });
    const r = await provider.validateIdToken(token);
    assert.equal(r.ok, true);
    assert.equal(r.email, null);
    assert.equal(r.emailVerified, false);
  });

  test("a wrong issuer is rejected as BAD_ISSUER", async () => {
    const token = await sign({ iss: "https://evil.example.com", aud: CLIENT_ID, sub: "1234567890" });
    const r = await provider.validateIdToken(token);
    assert.equal(r.ok, false);
    assert.equal(r.reason, GoogleAuthError.BAD_ISSUER);
  });

  test("a wrong audience (token was issued for a DIFFERENT client id) is rejected as BAD_AUDIENCE", async () => {
    const token = await sign({ iss: GOOGLE_ISSUERS[0], aud: "someone-elses-client-id", sub: "1234567890" });
    const r = await provider.validateIdToken(token);
    assert.equal(r.ok, false);
    assert.equal(r.reason, GoogleAuthError.BAD_AUDIENCE);
  });

  test("an expired token is rejected as EXPIRED", async () => {
    const token = await sign({ iss: GOOGLE_ISSUERS[0], aud: CLIENT_ID, sub: "1234567890" }, { exp: "-10m" });
    const r = await provider.validateIdToken(token);
    assert.equal(r.ok, false);
    assert.equal(r.reason, GoogleAuthError.EXPIRED);
  });

  test("a token signed by a DIFFERENT key than the one in the JWKS is rejected as BAD_SIGNATURE", async () => {
    const otherPair = await generateKeyPair("RS256");
    const token = await new SignJWT({ iss: GOOGLE_ISSUERS[0], aud: CLIENT_ID, sub: "1234567890" })
      .setProtectedHeader({ alg: "RS256", kid: KID })
      .setExpirationTime("10m")
      .sign(otherPair.privateKey);
    const r = await provider.validateIdToken(token);
    assert.equal(r.ok, false);
    assert.equal(r.reason, GoogleAuthError.BAD_SIGNATURE);
  });

  test("a structurally malformed token is rejected as MALFORMED, not a thrown exception", async () => {
    const r = await provider.validateIdToken("not-a-real-jwt-at-all");
    assert.equal(r.ok, false);
    assert.equal(r.reason, GoogleAuthError.MALFORMED);
  });

  test("a token with no subject claim at all is rejected as NO_SUBJECT", async () => {
    // Sign successfully (valid signature/issuer/audience) but omit `sub`
    // entirely -- this must be caught as a distinct, explicit check, not
    // an accidental `undefined` silently treated as a valid identity.
    const token = await sign({ iss: GOOGLE_ISSUERS[0], aud: CLIENT_ID });
    const r = await provider.validateIdToken(token);
    assert.equal(r.ok, false);
    assert.equal(r.reason, GoogleAuthError.NO_SUBJECT);
  });
});

describe("exchangeCode", () => {
  test("posts the expected token-exchange request and returns the id_token on success", async () => {
    let capturedUrl, capturedBody;
    const fetchImpl = async (url, opts) => {
      capturedUrl = url;
      capturedBody = new URLSearchParams(opts.body);
      return { ok: true, json: async () => ({ id_token: "fake-id-token", access_token: "fake-access-token" }) };
    };
    const p = createGoogleOidcProvider({
      clientId: CLIENT_ID, clientSecret: "the-secret", redirectUri: "https://api.nizalo.com/v1/auth/google/callback",
      jwks, fetchImpl,
    });
    const r = await p.exchangeCode("auth-code-123");
    assert.equal(r.ok, true);
    assert.equal(r.idToken, "fake-id-token");
    assert.equal("accessToken" in r, false, "the access token must never be returned to the caller");
    assert.equal(capturedUrl, "https://oauth2.googleapis.com/token");
    assert.equal(capturedBody.get("code"), "auth-code-123");
    assert.equal(capturedBody.get("client_id"), CLIENT_ID);
    assert.equal(capturedBody.get("client_secret"), "the-secret");
    assert.equal(capturedBody.get("grant_type"), "authorization_code");
  });

  test("a 400 from Google (used/expired/malformed code) is reported as INVALID_GRANT", async () => {
    const p = createGoogleOidcProvider({
      clientId: CLIENT_ID, clientSecret: "s", redirectUri: "https://x/callback", jwks,
      fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error: "invalid_grant" }) }),
    });
    const r = await p.exchangeCode("used-code");
    assert.equal(r.ok, false);
    assert.equal(r.reason, GoogleAuthError.INVALID_GRANT);
  });

  test("a 5xx or other non-400 failure is reported as PROVIDER_ERROR", async () => {
    const p = createGoogleOidcProvider({
      clientId: CLIENT_ID, clientSecret: "s", redirectUri: "https://x/callback", jwks,
      fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
    });
    const r = await p.exchangeCode("code");
    assert.equal(r.ok, false);
    assert.equal(r.reason, GoogleAuthError.PROVIDER_ERROR);
  });

  test("a network failure (fetch throws) is reported as PROVIDER_ERROR, never an unhandled rejection", async () => {
    const p = createGoogleOidcProvider({
      clientId: CLIENT_ID, clientSecret: "s", redirectUri: "https://x/callback", jwks,
      fetchImpl: async () => { throw new Error("ECONNRESET"); },
    });
    const r = await p.exchangeCode("code");
    assert.equal(r.ok, false);
    assert.equal(r.reason, GoogleAuthError.PROVIDER_ERROR);
  });

  test("a response missing id_token is reported as MALFORMED", async () => {
    const p = createGoogleOidcProvider({
      clientId: CLIENT_ID, clientSecret: "s", redirectUri: "https://x/callback", jwks,
      fetchImpl: async () => ({ ok: true, json: async () => ({ access_token: "x" }) }),
    });
    const r = await p.exchangeCode("code");
    assert.equal(r.ok, false);
    assert.equal(r.reason, GoogleAuthError.MALFORMED);
  });
});
