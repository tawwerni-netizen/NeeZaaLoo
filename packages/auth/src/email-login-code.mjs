/**
 * The LOGIN_CODE-purpose flow: request a 6-character passwordless login
 * code, verify it. Reuses email-challenge.mjs's generic mechanism exactly
 * as email-verification.mjs does, with three deliberate differences from
 * verification's 8-character flow:
 *
 *   - codeLength is 6, not 8 (this slice's own requirement) -- the same
 *     generateCode()/CODE_ALPHABET from email-challenge.mjs, just a
 *     shorter length. Nothing about the alphabet or hashing changes.
 *   - shorter TTL (10 minutes, not 30): this code IS the login credential
 *     itself, not a one-time confirmation of an address already trusted.
 *   - request() is enumeration-safe: it is called from an UNAUTHENTICATED
 *     route (you do not know who you are yet -- that is the whole point),
 *     so it always returns the same generic success shape regardless of
 *     whether the email belongs to an account, has no account, or has an
 *     unverified email. Compare email-verification.mjs's request(), which
 *     is self-scoped (an authenticated player asking about their OWN
 *     account) and can safely return a specific reason.
 *
 * verify() only confirms the code and returns which player it belongs to
 * -- it does NOT create a session. That is deliberately left to the
 * caller (the API route), which calls packages/auth/src/service.mjs's
 * `loginPasswordless()` next -- the exact same session/TOTP machinery
 * `login()` uses, so this never becomes "a second kind of session".
 */
import { ChallengePurpose, ChallengeError, CODE_ALPHABET } from "./email-challenge.mjs";
import { writeSecurityEvent } from "./audit.mjs";

const TTL_MS = 10 * 60_000;   // 10 minutes
const COOLDOWN_MS = 60_000;   // 1 minute between resends
const CODE_LENGTH = 6;
// Built FROM CODE_ALPHABET, not hand-written next to it -- a literal
// `[A-Z2-9]` looks equivalent at a glance but silently accepts I/L/O
// (they're in A-Z too), which are exactly the characters that alphabet
// exists to exclude.
const CODE_SHAPE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export const EmailLoginCodeError = Object.freeze({
  MALFORMED_CODE: "MALFORMED_CODE",
  ...ChallengeError,
});

/** Trim + uppercase -- the one normalization applied to user-typed input before it is ever hashed or compared. */
export function normalizeLoginCode(input) {
  return typeof input === "string" ? input.trim().toUpperCase() : "";
}

export function createEmailLoginCodeFlow(db, { emailChallenge, emailIdentity, emailService }) {
  /**
   * Always returns { ok: true } -- enumeration-safe by construction, not by
   * convention. A caller cannot distinguish "no such account", "account
   * exists but email unverified", "on cooldown", or "sent" from the return
   * value alone. Every one of those paths still writes its own
   * security_event, so the real story is fully auditable server-side.
   */
  async function request(rawEmail, { locale } = {}, ctx = {}) {
    const identity = await emailIdentity.getByEmail(rawEmail);
    // An unverified email is not yet trusted as proof of ownership -- see
    // this file's header comment. Silently declining to send is
    // indistinguishable, from the outside, from "no such account".
    if (!identity || !identity.verified_at) return { ok: true };

    const issued = await emailChallenge.issue({
      playerId: identity.player_id, purpose: ChallengePurpose.LOGIN_CODE, email: identity.email,
      ttlMs: TTL_MS, codeLength: CODE_LENGTH, cooldownMs: COOLDOWN_MS,
    }, ctx);
    if (!issued.ok) {
      // COOLDOWN is the only failure issue() returns. Recorded, but the
      // caller still sees the same generic { ok: true }.
      await writeSecurityEvent(db, identity.player_id, "EMAIL_LOGIN_CODE_RATE_LIMITED", { email: identity.email }, ctx);
      return { ok: true };
    }

    await writeSecurityEvent(db, identity.player_id, "EMAIL_LOGIN_CODE_REQUESTED", { email: identity.email }, ctx);
    try {
      const sent = await emailService.sendLoginCode({
        to: identity.email_display, code: issued.code, expiresInMinutes: Math.round(TTL_MS / 60_000), locale,
      });
      if (!sent.ok) {
        await writeSecurityEvent(db, identity.player_id, "EMAIL_LOGIN_CODE_FAILED", { email: identity.email, reason: sent.reason ?? "PROVIDER_ERROR" }, ctx);
      } else {
        await writeSecurityEvent(db, identity.player_id, "EMAIL_LOGIN_CODE_SENT", { email: identity.email, providerMessageId: sent.providerMessageId }, ctx);
      }
    } catch {
      await writeSecurityEvent(db, identity.player_id, "EMAIL_LOGIN_CODE_FAILED", { email: identity.email, reason: "PROVIDER_THREW" }, ctx);
    }
    return { ok: true };
  }

  /**
   * Checks `code` for `email` and, if valid, returns the player it
   * belongs to. Does not touch sessions -- see this file's header.
   */
  async function verify({ email, code }, ctx = {}) {
    const normalized = normalizeLoginCode(code);
    if (!CODE_SHAPE.test(normalized)) {
      return { ok: false, reason: EmailLoginCodeError.MALFORMED_CODE };
    }

    const identity = await emailIdentity.getByEmail(email);
    if (!identity) {
      // Same NOT_FOUND a wrong/expired code would produce -- an
      // unrecognized email must not be distinguishable from a real
      // account with no active challenge.
      return { ok: false, reason: ChallengeError.NOT_FOUND };
    }

    const result = await emailChallenge.verify(
      { playerId: identity.player_id, purpose: ChallengePurpose.LOGIN_CODE, code: normalized }, ctx
    );
    if (!result.ok) return result;

    await writeSecurityEvent(db, identity.player_id, "EMAIL_LOGIN_CODE_VERIFIED", { email: identity.email }, ctx);
    return { ok: true, playerId: identity.player_id };
  }

  return { request, verify };
}
