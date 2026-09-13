/**
 * The EmailProvider boundary. Business logic (packages/auth's verification
 * and welcome-email flows) only ever calls `provider.send({...})` -- it
 * never imports a vendor SDK, holds a vendor API key, or knows how the
 * message actually leaves the building. Swapping providers in production
 * (SES, Postgres-backed queue, Resend, whatever gets configured later) is a
 * new file implementing this same `send()` shape, not a change to any
 * flow that sends mail.
 *
 * `send()` contract: takes { to, subject, html, text, locale, template,
 * metadata }, returns { ok: true, providerMessageId } or { ok: false,
 * reason }. It must never throw for an ordinary delivery failure -- a
 * provider outage is data the caller needs to record (see
 * WELCOME_EMAIL_FAILED / EMAIL_VERIFICATION_FAILED in the security-event
 * log), not an exception that skips that bookkeeping.
 */

export const OFFICIAL_SENDER = "info@nizalo.com";

/**
 * Deterministic, in-memory, for tests. Every send is recorded and
 * inspectable -- recipient, subject, locale, template, metadata -- so a
 * test can assert exactly what would have been sent without any real
 * delivery, network access, or provider credentials.
 */
export function createMockEmailProvider() {
  const sent = [];
  return {
    async send(message) {
      const record = { ...message, sentAt: Date.now(), providerMessageId: `mock_${sent.length + 1}` };
      sent.push(record);
      return { ok: true, providerMessageId: record.providerMessageId };
    },
    get sent() { return sent; },
    reset() { sent.length = 0; },
  };
}

/**
 * Local-development convenience ONLY. Prints the recipient, subject and
 * rendered body to the console so a developer running this app without
 * real email credentials can still see a verification code or a welcome
 * email they triggered. Refuses to construct at all in production --
 * this must never become the thing that writes a password-reset code to a
 * production log file.
 */
export function createConsoleEmailProvider({ nodeEnv = process.env.NODE_ENV } = {}) {
  if (nodeEnv === "production") {
    throw new Error("createConsoleEmailProvider must never be used with NODE_ENV=production");
  }
  return {
    async send(message) {
      // eslint-disable-next-line no-console
      console.log(`[email:dev-only] to=${message.to} locale=${message.locale} template=${message.template} subject="${message.subject}"`);
      // eslint-disable-next-line no-console
      console.log(message.text ?? message.html);
      return { ok: true, providerMessageId: `console_${Date.now()}` };
    },
  };
}

import nodemailer from "nodemailer";

export function createSmtpEmailProvider(config) {
  const transporter = nodemailer.createTransport(config);
  return {
    async send(message) {
      try {
        const info = await transporter.sendMail({
          from: OFFICIAL_SENDER,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
        return { ok: true, providerMessageId: info.messageId };
      } catch (error) {
        console.error("[email:smtp] Delivery failed:", error);
        return { ok: false, reason: "SMTP_DELIVERY_FAILED" };
      }
    }
  };
}
