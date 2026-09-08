/**
 * Four templates for Slice 8 (Customer Support): TICKET_CREATED,
 * STAFF_REPLIED, WAITING_FOR_USER, TICKET_RESOLVED. Never rendered for an
 * INTERNAL note or a routine status move -- see notifications.mjs, the one
 * place that decides which of these four to send.
 *
 * `subject` here is the TICKET's own subject line -- ordinary customer-typed
 * text, not shape-restricted the way a nickname is, so unlike {nickname} in
 * welcome.mjs this cannot be interpolated into bodyHtml unescaped: it goes
 * through escapeHtml() before it ever reaches the HTML translation string,
 * exactly the same as a CHECK this template avoids letting a ticket subject
 * turn into markup injected into an outgoing email.
 */
import { renderShell, button, escapeHtml } from "../shell.mjs";

function renderTicketEmail(kind, { t, locale, subject, ticketUrl }) {
  const safeSubject = escapeHtml(subject);
  const bodyHtml = `
    <h1 style="font-size:22px;margin:0 0 16px;">${t(`email.${kind}.heading`)}</h1>
    <p style="margin:0 0 8px;">${t(`email.${kind}.body`)}</p>
    <p style="margin:0 0 16px;color:#545B66;font-size:13px;">${t("email.ticket_common.subject_label")}: ${safeSubject}</p>
    ${button(ticketUrl, t("email.ticket_common.view_cta"))}
    <p style="margin:24px 0 0;font-size:13px;color:#545B66;">${t("email.common.support_note")}</p>
  `;
  return {
    subject: t(`email.${kind}.subject`),
    html: renderShell({ locale, title: t(`email.${kind}.subject`), bodyHtml, footerText: t("email.common.footer") }),
    text: [
      t(`email.${kind}.heading`), "", t(`email.${kind}.body`), "",
      `${t("email.ticket_common.subject_label")}: ${subject}`, "",
      ticketUrl, "", t("email.common.support_note"),
    ].join("\n"),
  };
}

export const renderTicketCreated = (args) => renderTicketEmail("ticket_created", args);
export const renderTicketStaffReplied = (args) => renderTicketEmail("ticket_staff_replied", args);
export const renderTicketWaitingForUser = (args) => renderTicketEmail("ticket_waiting_for_user", args);
export const renderTicketResolved = (args) => renderTicketEmail("ticket_resolved", args);
