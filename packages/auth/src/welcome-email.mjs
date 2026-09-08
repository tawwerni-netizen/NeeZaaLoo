/**
 * Sends the welcome email at most once per player, ever -- see
 * db/migrations/0018_email_challenges.sql's `security_event_welcome_once`
 * partial unique index, the actual guarantee behind this. A retried
 * registration call, a duplicate PATCH /v1/me/email, two browser tabs
 * racing: all of them call this the same way, and at most one of them
 * ever gets past the INSERT.
 */
import { writeSecurityEvent } from "./audit.mjs";

export function createWelcomeEmailFlow(db, { emailService }) {
  async function sendOnce({ playerId, nickname, email, locale }, ctx = {}) {
    // Claim the "requested" slot first, inside its own short transaction --
    // this is the actual idempotency boundary. Only the caller that wins
    // this INSERT goes on to call the email provider at all.
    const claimed = await db.transaction(async (tx) => {
      try {
        await writeSecurityEvent(tx, playerId, "WELCOME_EMAIL_REQUESTED", { email }, ctx);
        return true;
      } catch (e) {
        if (/security_event_welcome_once/.test(e.message)) return false;
        throw e;
      }
    });

    if (!claimed) return { ok: true, alreadySent: true };

    // A provider failure -- returned or thrown -- must never surface as a
    // failure of whatever action triggered the welcome email (setting an
    // email address succeeded; a courtesy email did not go out). The slot
    // above is already claimed, on purpose: this is a best-effort send,
    // not a retryable one, so a transient provider outage does not turn
    // into a second welcome email once it recovers.
    try {
      const result = await emailService.sendWelcomeEmail({ to: email, nickname, locale });
      if (!result.ok) {
        await writeSecurityEvent(db, playerId, "WELCOME_EMAIL_FAILED", { email, reason: result.reason ?? "PROVIDER_ERROR" }, ctx);
        return { ok: false, reason: "SEND_FAILED" };
      }
      await writeSecurityEvent(db, playerId, "WELCOME_EMAIL_SENT", { email, providerMessageId: result.providerMessageId }, ctx);
      return { ok: true, alreadySent: false };
    } catch {
      await writeSecurityEvent(db, playerId, "WELCOME_EMAIL_FAILED", { email, reason: "PROVIDER_THREW" }, ctx);
      return { ok: false, reason: "SEND_FAILED" };
    }
  }

  return { sendOnce };
}
