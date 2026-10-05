/**
 * The VERIFICATION-purpose flow: request a code, send it, confirm it. Ties
 * together email-challenge.mjs (the generic, purpose-bound secret
 * mechanism), the EmailService (sending), and email-identity.mjs
 * (`markVerified`) -- each of which stays ignorant of the other two.
 * Later slices add login-code.mjs and password-reset.mjs as siblings of
 * this file, reusing the same ChallengePurpose.LOGIN_CODE /
 * PASSWORD_RESET values through the same underlying table.
 */
import { ChallengePurpose, ChallengeError } from "./email-challenge.mjs";
import { writeSecurityEvent } from "./audit.mjs";

const TTL_MS = 30 * 60_000;      // 30 minutes
const COOLDOWN_MS = 60_000;      // 1 minute between resends
const CODE_LENGTH = 8;

export const EmailVerificationError = Object.freeze({
  NO_EMAIL_ON_FILE: "NO_EMAIL_ON_FILE",
  ALREADY_VERIFIED: "ALREADY_VERIFIED",
  COOLDOWN: "COOLDOWN",
  ...ChallengeError,
});

export function createEmailVerificationFlow(db, { emailChallenge, emailIdentity, emailService }) {
  /** Issues a fresh code for the player's current on-file email and sends it. */
  async function request(playerId, { locale } = {}, ctx = {}) {
    const identity = await emailIdentity.getByPlayerId(playerId);
    if (!identity) return { ok: false, reason: EmailVerificationError.NO_EMAIL_ON_FILE };
    if (identity.verified_at) return { ok: false, reason: EmailVerificationError.ALREADY_VERIFIED };

    const issued = await emailChallenge.issue({
      playerId, purpose: ChallengePurpose.VERIFICATION, email: identity.email,
      ttlMs: TTL_MS, codeLength: CODE_LENGTH, cooldownMs: COOLDOWN_MS,
    }, ctx);
    if (!issued.ok) {
      // COOLDOWN is the only failure issue() returns, and it is not an
      // error worth an audit event of its own -- the player just asked
      // twice in a row, which is normal, not suspicious.
      return { ok: false, reason: EmailVerificationError.COOLDOWN, retryAfterMs: issued.retryAfterMs };
    }

    await writeSecurityEvent(db, playerId, "EMAIL_VERIFICATION_REQUESTED", { email: identity.email }, ctx);

    try {
      const sent = await emailService.sendVerificationEmail({
        to: identity.email_display, email: identity.email_display,
        code: issued.code, expiresInMinutes: Math.round(TTL_MS / 60_000), locale,
      });
      if (!sent.ok) {
        await writeSecurityEvent(db, playerId, "EMAIL_VERIFICATION_FAILED", { email: identity.email, reason: sent.reason ?? "PROVIDER_ERROR" }, ctx);
        return { ok: false, reason: "SEND_FAILED" };
      }
      await writeSecurityEvent(db, playerId, "EMAIL_VERIFICATION_SENT", { email: identity.email, providerMessageId: sent.providerMessageId }, ctx);
      return { ok: true, expiresAt: issued.expiresAt };
    } catch {
      await writeSecurityEvent(db, playerId, "EMAIL_VERIFICATION_FAILED", { email: identity.email, reason: "PROVIDER_THREW" }, ctx);
      return { ok: false, reason: "SEND_FAILED" };
    }
  }

  /** Checks `code` and, if it matches, marks the on-file email verified. */
  async function confirm(playerId, code, ctx = {}) {
    const result = await emailChallenge.verify({ playerId, purpose: ChallengePurpose.VERIFICATION, code }, ctx);
    if (!result.ok) return result;
    return emailIdentity.markVerified(playerId, ctx);
  }

  return { request, confirm };
}
