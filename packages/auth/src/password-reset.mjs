/**
 * The PASSWORD_RESET-purpose flow: request a reset code, confirm it with
 * a new password. Shares email-challenge.mjs's mechanism exactly as
 * email-verification.mjs and email-login-code.mjs do, with the same
 * strict purpose isolation (a PASSWORD_RESET challenge is invisible to
 * every other purpose's lookup, and vice versa).
 *
 * Two differences from the sibling flows worth calling out:
 *
 *   - request() does NOT require the email to be verified. Login-code
 *     deliberately does (it is a passwordless LOGIN mechanism, so prior
 *     verification is the thing being relied on); reset is a recovery
 *     mechanism, and completing it is itself proof of inbox access. Gating
 *     recovery on a separate, earlier verification step would strand a
 *     player who set an email but never confirmed it and then forgot
 *     their password, with no way back into their own account.
 *   - confirm() validates the NEW PASSWORD's strength before touching the
 *     challenge at all. Unlike email-login-code's TOTP gate (which cannot
 *     be checked before the code, because the code IS the thing being
 *     gated), password strength is a pure, stateless check -- validating
 *     it first means a weak password does not burn an otherwise-good
 *     reset code, at no security cost.
 */
import { ChallengePurpose, ChallengeError } from "./email-challenge.mjs";
import { checkPasswordStrength, AuthError } from "./service.mjs";
import { writeSecurityEvent } from "./audit.mjs";

const TTL_MS = 30 * 60_000;   // 30 minutes
const COOLDOWN_MS = 60_000;   // 1 minute between resends
const CODE_LENGTH = 10;       // higher entropy than verification's 8 -- this credential alone grants full account control

export function createPasswordResetFlow(db, { emailChallenge, emailIdentity, emailService, auth }) {
  /** Always returns { ok: true } -- enumeration-safe by construction, exactly like email-login-code.mjs's request(). */
  async function request(rawEmail, { locale } = {}, ctx = {}) {
    const identity = await emailIdentity.getByEmail(rawEmail);
    if (!identity) return { ok: true };

    const issued = await emailChallenge.issue({
      playerId: identity.player_id, purpose: ChallengePurpose.PASSWORD_RESET, email: identity.email,
      ttlMs: TTL_MS, codeLength: CODE_LENGTH, cooldownMs: COOLDOWN_MS,
    }, ctx);
    if (!issued.ok) {
      await writeSecurityEvent(db, identity.player_id, "PASSWORD_RESET_RATE_LIMITED", { email: identity.email }, ctx);
      return { ok: true };
    }

    await writeSecurityEvent(db, identity.player_id, "PASSWORD_RESET_REQUESTED", { email: identity.email }, ctx);
    try {
      const sent = await emailService.sendPasswordResetEmail({
        to: identity.email_display, code: issued.code, expiresInMinutes: Math.round(TTL_MS / 60_000), locale,
      });
      if (!sent.ok) {
        await writeSecurityEvent(db, identity.player_id, "PASSWORD_RESET_FAILED", { email: identity.email, reason: sent.reason ?? "PROVIDER_ERROR" }, ctx);
      } else {
        await writeSecurityEvent(db, identity.player_id, "PASSWORD_RESET_SENT", { email: identity.email, providerMessageId: sent.providerMessageId }, ctx);
      }
    } catch {
      await writeSecurityEvent(db, identity.player_id, "PASSWORD_RESET_FAILED", { email: identity.email, reason: "PROVIDER_THREW" }, ctx);
    }
    return { ok: true };
  }

  /**
   * Confirms `code` for `email` and, if valid, sets `newPassword` via
   * auth.resetPassword() -- the same session-revocation, same Argon2id
   * hashing, same audit trail every other password change uses (see that
   * method's own doc comment in service.mjs). A confirmation email is
   * sent best-effort; its failure never undoes or fails the reset itself.
   */
  async function confirm({ email, code, newPassword, locale }, ctx = {}) {
    const weak = checkPasswordStrength(newPassword);
    if (weak) return { ok: false, reason: AuthError.WEAK_PASSWORD, detail: weak };

    const identity = await emailIdentity.getByEmail(email);
    if (!identity) return { ok: false, reason: ChallengeError.NOT_FOUND };

    const verified = await emailChallenge.verify(
      { playerId: identity.player_id, purpose: ChallengePurpose.PASSWORD_RESET, code }, ctx
    );
    if (!verified.ok) return verified;

    const reset = await auth.resetPassword({ playerId: identity.player_id, newPassword }, ctx);
    if (!reset.ok) return reset;

    try {
      const sent = await emailService.sendPasswordResetConfirmation({ to: identity.email_display, locale });
      if (!sent.ok) await writeSecurityEvent(db, identity.player_id, "PASSWORD_RESET_CONFIRMATION_FAILED", { email: identity.email }, ctx);
    } catch {
      await writeSecurityEvent(db, identity.player_id, "PASSWORD_RESET_CONFIRMATION_FAILED", { email: identity.email }, ctx);
    }

    return { ok: true, playerId: identity.player_id, revokedSessions: reset.revokedSessions };
  }

  return { request, confirm };
}
