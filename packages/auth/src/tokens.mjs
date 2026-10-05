/**
 * Tokens.
 *
 * Two kinds, with deliberately different properties:
 *
 *   ACCESS  -- short-lived, signed, stateless. Verified without a database
 *              round trip, which is why it must expire quickly: there is no
 *              way to revoke one early, so its lifetime IS its blast radius.
 *
 *   REFRESH -- long-lived, opaque, stateful. Random bytes with no structure,
 *              stored only as a SHA-256 hash, single-use, and rotated on every
 *              exchange. Revocable instantly because the database is consulted.
 *
 * The pairing is the point: cheap verification on the hot path, real revocation
 * on the cold one.
 */
import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64u = (str) => Buffer.from(str, "base64url");

/**
 * Mint a signed access token.
 *
 * A compact JWS-like structure rather than a JWT library: we need exactly one
 * algorithm, and "alg" confusion is the classic JWT vulnerability. There is no
 * algorithm field to confuse here -- the verifier only knows how to do one
 * thing.
 */
export function issueAccessToken({ playerId, sessionId, scopes = [], ttlSeconds = 900 }, key, nowMs) {
  const claims = {
    sub: playerId,
    sid: sessionId,
    scp: scopes,
    iat: Math.floor(nowMs / 1000),
    exp: Math.floor(nowMs / 1000) + ttlSeconds,
  };
  const body = b64u(JSON.stringify(claims));
  const sig = b64u(createHmac("sha256", key).update(body).digest());
  return `${body}.${sig}`;
}

/**
 * @returns {{ok:true, claims:object} | {ok:false, reason:string}}
 */
export function verifyAccessToken(token, key, nowMs) {
  if (typeof token !== "string") return { ok: false, reason: "MALFORMED" };
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "MALFORMED" };

  const [body, sig] = parts;
  const expected = createHmac("sha256", key).update(body).digest();
  const given = unb64u(sig);

  // Signature first, always. Never parse a payload we have not authenticated.
  if (given.length !== expected.length) return { ok: false, reason: "BAD_SIGNATURE" };
  if (!timingSafeEqual(given, expected)) return { ok: false, reason: "BAD_SIGNATURE" };

  let claims;
  try {
    claims = JSON.parse(unb64u(body).toString("utf8"));
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }

  const nowS = Math.floor(nowMs / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= nowS) {
    return { ok: false, reason: "EXPIRED" };
  }
  if (typeof claims.iat !== "number" || claims.iat > nowS + 60) {
    return { ok: false, reason: "NOT_YET_VALID" };
  }
  return { ok: true, claims };
}

/** 256 bits of opaque randomness. No structure, nothing to forge. */
export const generateRefreshToken = () => randomBytes(32).toString("base64url");

/**
 * Refresh tokens are stored as SHA-256, not Argon2id.
 *
 * That is deliberate and it is not a weakening: a refresh token already has 256
 * bits of entropy, so there is nothing to brute-force and no dictionary to try.
 * Argon2 exists to slow guessing of LOW-entropy secrets. Using it here would
 * add tens of milliseconds to every token refresh and buy nothing.
 */
export const hashRefreshToken = (token) =>
  createHash("sha256").update(token).digest("hex");

/**
 * Step-up tokens for privileged actions: withdrawals, changing a payout
 * address, disabling 2FA. Bound to one action and very short-lived, so a
 * step-up granted for "view my sessions" cannot be spent on "withdraw".
 */
export function issueStepUpToken({ playerId, action, ttlSeconds = 300 }, key, nowMs) {
  const claims = {
    sub: playerId,
    act: action,
    iat: Math.floor(nowMs / 1000),
    exp: Math.floor(nowMs / 1000) + ttlSeconds,
    typ: "step-up",
  };
  const body = b64u(JSON.stringify(claims));
  const sig = b64u(createHmac("sha256", key).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyStepUpToken(token, action, key, nowMs) {
  const res = verifyAccessToken(token, key, nowMs);
  if (!res.ok) return res;
  if (res.claims.typ !== "step-up") return { ok: false, reason: "WRONG_TOKEN_TYPE" };
  // An access token must never be usable as a step-up, and a step-up for one
  // action must never authorise another.
  if (res.claims.act !== action) return { ok: false, reason: "WRONG_ACTION" };
  return { ok: true, claims: res.claims };
}

/**
 * OAuth "state", signed the same HMAC-compact way as everything else in
 * this file -- stateless by design, no database row for it (see
 * google-oauth.mjs's own header for why that is enough: the CSRF binding
 * this exists for comes from the signature and short expiry, and replay of
 * an authorization CODE is separately impossible because Google's own
 * token endpoint enforces single-use on that side). Carries the one thing
 * that turns a bare "prove you talked to Google" callback into a specific,
 * previously-authorised operation: for a login it is just an intent and an
 * allowlisted return path; for an account-link it additionally carries the
 * ALREADY-authenticated (and, per the policy, already stepped-up) player
 * id that requested the link, since the callback request itself carries no
 * bearer token at all -- it is Google's browser redirect, not a fetch()
 * the frontend controls headers on.
 */
export function issueOAuthState({ intent, provider, playerId = null, returnTo = null, locale = null, ttlSeconds = 600 }, key, nowMs) {
  const claims = {
    intent, provider, playerId, returnTo, locale,
    nonce: b64u(randomBytes(16)),
    iat: Math.floor(nowMs / 1000),
    exp: Math.floor(nowMs / 1000) + ttlSeconds,
    typ: "oauth-state",
  };
  const body = b64u(JSON.stringify(claims));
  const sig = b64u(createHmac("sha256", key).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyOAuthState(state, key, nowMs) {
  const res = verifyAccessToken(state, key, nowMs);
  if (!res.ok) return res;
  if (res.claims.typ !== "oauth-state") return { ok: false, reason: "WRONG_TOKEN_TYPE" };
  return { ok: true, claims: res.claims };
}
