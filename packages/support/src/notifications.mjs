/**
 * Idempotent customer email notifications for ticket events -- the same
 * "claim the slot before ever calling the provider" pattern as
 * packages/auth/src/welcome-email.mjs's sendOnce, applied to
 * support_ticket_notification_sent (migration 0022) instead of
 * security_event's own unique index. A provider retry that resends the same
 * logical request must never produce a second customer email (directive:
 * "Provider retries must not unintentionally create duplicate customer
 * emails").
 *
 * Only four notifications exist, matching the four the product spec names:
 * TICKET_CREATED and STAFF_REPLIED are scoped per MESSAGE (a real, distinct
 * customer-visible reply each deserves its own email, so `messageId`
 * participates in the uniqueness key -- see the migration's own
 * COALESCE(message_id,'') index); WAITING_FOR_USER and TICKET_RESOLVED are
 * ticket-level (no message backs them) and are deliberately "at most once
 * per open episode of that state": a ticket that is reopened (see
 * clearOccurrence, called from the reopen route) gets a fresh slot, but a
 * ticket bouncing between IN_PROGRESS and WAITING_FOR_USER without ever
 * being reopened notifies the customer only the first time -- the
 * conservative reading of "do NOT send excessive notifications for every
 * internal state change".
 */
import { randomUUID } from "node:crypto";

const SENDERS = Object.freeze({
  TICKET_CREATED: "sendTicketCreatedEmail",
  STAFF_REPLIED: "sendTicketStaffRepliedEmail",
  WAITING_FOR_USER: "sendTicketWaitingForUserEmail",
  TICKET_RESOLVED: "sendTicketResolvedEmail",
});

export function createTicketNotificationFlow(db, { emailService }) {
  /**
   * `email`/`locale` may be null (no address on file, or a customer who
   * never set a language preference) -- both are handled as a silent,
   * best-effort no-op, exactly like welcome-email.mjs's own callers do:
   * a missing courtesy notification must never fail the action that
   * triggered it.
   */
  async function notify({ ticketId, notification, messageId = null, email, locale, subject }) {
    const sendMethod = SENDERS[notification];
    if (!sendMethod) throw new Error(`unknown ticket notification: ${notification}`);
    if (!email) return { ok: true, skipped: "NO_EMAIL_ON_FILE" };

    const claimed = await db.transaction(async (tx) => {
      try {
        await tx.query(
          `INSERT INTO support_ticket_notification_sent (id, ticket_id, notification, message_id)
           VALUES ($1,$2,$3,$4)`,
          [`spn_${randomUUID()}`, ticketId, notification, messageId]
        );
        return true;
      } catch (e) {
        if (/support_ticket_notification_sent_once_idx/.test(e.message)) return false;
        throw e;
      }
    });
    if (!claimed) return { ok: true, alreadySent: true };

    try {
      const result = await emailService[sendMethod]({ to: email, locale, ticketId, subject });
      return { ok: result.ok !== false, providerMessageId: result.providerMessageId };
    } catch {
      // The slot is already claimed, on purpose -- this is a best-effort
      // send, not a retryable one (matching welcome-email.mjs's own
      // reasoning): a transient provider outage must not turn into a
      // second attempt once it recovers, since by then the moment (a
      // fresh reply, a status change) may no longer reflect the ticket's
      // current state anyway.
      return { ok: false, reason: "SEND_FAILED" };
    }
  }

  /** Frees the WAITING_FOR_USER/TICKET_RESOLVED slot so a ticket's next
   * episode (after being reopened) can notify again. Never called for
   * TICKET_CREATED/STAFF_REPLIED, which are message-scoped and need no
   * such reset. */
  async function clearOccurrence({ ticketId, notification }) {
    await db.query(
      "DELETE FROM support_ticket_notification_sent WHERE ticket_id = $1 AND notification = $2",
      [ticketId, notification]
    );
  }

  return { notify, clearOccurrence };
}
