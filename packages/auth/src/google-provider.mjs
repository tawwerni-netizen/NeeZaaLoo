/**
 * The Google OIDC provider abstraction. Every place that needs to talk to
 * Google -- build the redirect URL, exchange an authorization code, and
 * above all validate an ID token's issuer/audience/expiry/signature/subject
 * -- goes through this interface, never a raw fetch() or hand-rolled
 * crypto scattered through google-oauth.mjs. Two implementations:
 *
 *   createGoogleOidcProvider -- the real thing, for production. Signature
 *   verification and JWKS handling are `jose`'s job, not this codebase's:
 *   this is exactly the "do not manually implement cryptography if a
 *   maintained library can safely do it" case, unlike this package's own
 *   access/refresh/step-up tokens (see tokens.mjs's header for why THOSE
 *   are hand-rolled HMAC instead -- a single fixed algorithm we chose
 *   ourselves is not the same threat model as verifying signatures made by
 *   a third party's rotating public keys).
 *
 *   createMockGoogleProvider -- for tests. No network, no real JWTs: it
 *   lets a test register a fake "token" (an opaque handle) that maps to
 *   whatever claims or error the test wants back, so the orchestrator's
 *   business logic (google-oauth.mjs) can be tested completely
 *   independently of real OIDC mechanics. The mechanics themselves --
 *   signature/issuer/audience/expiry validation against genuinely signed
 *   tokens -- are tested directly against createGoogleOidcProvider in
 *   google-provider.test.mjs, with an INJECTED local JWKS so that test
 *   suite never touches the network either.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";

export const GOOGLE_ISSUERS = Object.freeze(["https://accounts.google.com", "accounts.google.com"]);
const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";

export const GoogleAuthError = Object.freeze({
  INVALID_GRANT: "INVALID_GRANT",     // code exchange failed: used, expired, or wrong redirect_uri
  PROVIDER_ERROR: "PROVIDER_ERROR",   // network failure or a non-400 error from Google
  BAD_SIGNATURE: "BAD_SIGNATURE",
  BAD_ISSUER: "BAD_ISSUER",
  BAD_AUDIENCE: "BAD_AUDIENCE",
  EXPIRED: "EXPIRED",
  MALFORMED: "MALFORMED",
  NO_SUBJECT: "NO_SUBJECT",
});

function classifyJoseError(err) {
  const code = err?.code ?? "";
  if (code === "ERR_JWT_EXPIRED") return GoogleAuthError.EXPIRED;
  if (code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED") return GoogleAuthError.BAD_SIGNATURE;
  if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED" && err.claim === "iss") return GoogleAuthError.BAD_ISSUER;
  if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED" && err.claim === "aud") return GoogleAuthError.BAD_AUDIENCE;
  return GoogleAuthError.MALFORMED;
}

/**
 * @param jwks - injectable for tests (a `jose` JWTVerifyGetKey); defaults to
 *   Google's real, rotating public keys fetched (and cached) lazily by
 *   `jose` itself on first verification, never at construction time.
 * @param fetchImpl - injectable so a test could exercise exchangeCode()
 *   without a real network call; production leaves this as the global
 *   `fetch` Node already provides.
 */
export function createGoogleOidcProvider({
  clientId, clientSecret, redirectUri,
  jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URI)),
  fetchImpl = fetch,
}) {
  function buildAuthorizationUrl({ state, scope = "openid email profile" }) {
    const url = new URL(GOOGLE_AUTH_ENDPOINT);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scope);
    url.searchParams.set("state", state);
    // Never request offline access (a refresh token) -- this product has no
    // use for one, and directive #9's "if refresh tokens are not required,
    // do not store them" is easiest to honour by never asking Google to
    // issue one in the first place.
    url.searchParams.set("access_type", "online");
    return url.toString();
  }

  async function exchangeCode(code) {
    let res;
    try {
      res = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code, client_id: clientId, client_secret: clientSecret,
          redirect_uri: redirectUri, grant_type: "authorization_code",
        }),
      });
    } catch {
      return { ok: false, reason: GoogleAuthError.PROVIDER_ERROR };
    }
    if (!res.ok) {
      // Google returns 400 for a used/expired/malformed code (invalid_grant)
      // and 401 for a bad client_id/secret pairing -- both are refused the
      // same way to the caller (login fails cleanly); only the reason
      // differs for logging/diagnostics, never surfaced to the end user.
      return { ok: false, reason: res.status === 400 ? GoogleAuthError.INVALID_GRANT : GoogleAuthError.PROVIDER_ERROR };
    }
    let body;
    try {
      body = await res.json();
    } catch {
      return { ok: false, reason: GoogleAuthError.MALFORMED };
    }
    if (typeof body.id_token !== "string" || !body.id_token) {
      return { ok: false, reason: GoogleAuthError.MALFORMED };
    }
    // The access token (if any) is deliberately dropped here, not returned
    // to the caller -- this product has no use for it (it never calls a
    // Google API on the user's behalf), and directive #9's "do not store
    // OAuth access tokens unnecessarily" is easiest to honour by never
    // letting it leave this function.
    return { ok: true, idToken: body.id_token };
  }

  async function validateIdToken(idToken) {
    let result;
    try {
      result = await jwtVerify(idToken, jwks, { issuer: GOOGLE_ISSUERS, audience: clientId });
    } catch (err) {
      return { ok: false, reason: classifyJoseError(err) };
    }
    const { payload } = result;
    if (typeof payload.sub !== "string" || !payload.sub) {
      return { ok: false, reason: GoogleAuthError.NO_SUBJECT };
    }
    return {
      ok: true,
      subject: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === "string" ? payload.name : null,
    };
  }

  return { buildAuthorizationUrl, exchangeCode, validateIdToken };
}

/**
 * A test double covering the exact same three-method interface. `code` and
 * `idToken` are opaque as far as any caller is concerned -- tests register
 * a fixture under a name via registerIdentity()/registerError() and pass
 * that name through the flow exactly like a real code/token, without ever
 * constructing a real JWT.
 */
export function createMockGoogleProvider() {
  const fixtures = new Map();
  const exchanged = new Set();
  let counter = 0;

  function registerIdentity({ subject, email = null, emailVerified = false, name = null }) {
    const handle = `mock_${++counter}`;
    fixtures.set(handle, { ok: true, subject, email, emailVerified, name });
    return handle;
  }

  function registerError(reason) {
    const handle = `mock_err_${++counter}`;
    fixtures.set(handle, { ok: false, reason });
    return handle;
  }

  function buildAuthorizationUrl({ state, scope = "openid email profile" }) {
    const url = new URL("https://accounts.google.test/mock/authorize");
    url.searchParams.set("state", state);
    url.searchParams.set("scope", scope);
    return url.toString();
  }

  // The mock's "code" IS the fixture handle -- exchanging it just hands
  // back the same handle as the "idToken", so validateIdToken below can
  // look the fixture up again. Two hops, same as the real provider's
  // shape, without inventing a second, parallel fixture map. Single-use,
  // exactly like Google's own authorization codes: a second exchange of
  // the same code is INVALID_GRANT, which is what makes a "replayed
  // callback" test meaningful against this mock instead of only against
  // real Google.
  async function exchangeCode(code) {
    if (!fixtures.has(code) || exchanged.has(code)) return { ok: false, reason: GoogleAuthError.INVALID_GRANT };
    exchanged.add(code);
    return { ok: true, idToken: code };
  }

  async function validateIdToken(idToken) {
    const fixture = fixtures.get(idToken);
    if (!fixture) return { ok: false, reason: GoogleAuthError.MALFORMED };
    return fixture;
  }

  return { buildAuthorizationUrl, exchangeCode, validateIdToken, registerIdentity, registerError };
}
