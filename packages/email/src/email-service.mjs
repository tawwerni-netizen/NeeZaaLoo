/**
 * The provider-agnostic EmailService. Every place in this codebase that
 * needs to send a player an email calls one of these methods -- never
 * `provider.send()` directly, and never a vendor SDK. This is also the one
 * place that knows the official sender address and binds a translator to
 * the recipient's locale before handing content to a template.
 *
 * sendWelcomeEmail, sendVerificationEmail, sendLoginCode,
 * sendPasswordResetEmail and sendPasswordResetConfirmation are
 * implemented. sendSecurityNotification arrives in its own later slice,
 * as a `send<X>()` method following this exact same shape: bind a
 * translator, call a template, call `provider.send()`, return the
 * provider result. Nothing about this file's structure needs to change to
 * add it.
 */
import { OFFICIAL_SENDER } from "./provider.mjs";
import { renderWelcome } from "./templates/welcome.mjs";
import { renderVerification } from "./templates/verification.mjs";
import { renderLoginCode } from "./templates/login-code.mjs";
import { renderPasswordReset } from "./templates/password-reset.mjs";
import { renderPasswordResetConfirmation } from "./templates/password-reset-confirmation.mjs";
import {
  renderTicketCreated, renderTicketStaffReplied, renderTicketWaitingForUser, renderTicketResolved,
} from "./templates/ticket-notifications.mjs";
// @ts-ignore -- resolved at the workspace root; see packages/api's own cross-package import convention.
import { createTranslator } from "../../i18n/src/translate.mjs";
import { loadResources } from "../../i18n/src/resources.mjs";
import { DEFAULT_LOCALE } from "../../i18n/src/locales.mjs";

export function createEmailService({ provider, sender = OFFICIAL_SENDER, resources = null, appBaseUrl = "https://nizalo.com" }) {
  const allResources = resources ?? loadResources();

  function translatorFor(locale) {
    return createTranslator(locale ?? DEFAULT_LOCALE, allResources, { fallbackLocale: DEFAULT_LOCALE }).t;
  }

  async function sendWelcomeEmail({ to, nickname, locale }) {
    const t = translatorFor(locale);
    const { subject, html, text } = renderWelcome({ t, locale, nickname, playUrl: `${appBaseUrl}/${locale ?? DEFAULT_LOCALE}/play` });
    return provider.send({ to, from: sender, subject, html, text, locale, template: "welcome", metadata: { nickname } });
  }

  async function sendVerificationEmail({ to, email, code, expiresInMinutes, locale }) {
    const t = translatorFor(locale);
    const { subject, html, text } = renderVerification({ t, locale, email, code, expiresInMinutes });
    return provider.send({ to, from: sender, subject, html, text, locale, template: "verification", metadata: { expiresInMinutes } });
  }

  async function sendLoginCode({ to, code, expiresInMinutes, locale }) {
    const t = translatorFor(locale);
    const { subject, html, text } = renderLoginCode({ t, locale, code, expiresInMinutes });
    return provider.send({ to, from: sender, subject, html, text, locale, template: "login_code", metadata: { expiresInMinutes } });
  }

  async function sendPasswordResetEmail({ to, code, expiresInMinutes, locale }) {
    const t = translatorFor(locale);
    const { subject, html, text } = renderPasswordReset({ t, locale, code, expiresInMinutes });
    return provider.send({ to, from: sender, subject, html, text, locale, template: "password_reset", metadata: { expiresInMinutes } });
  }

  async function sendPasswordResetConfirmation({ to, locale }) {
    const t = translatorFor(locale);
    const { subject, html, text } = renderPasswordResetConfirmation({ t, locale });
    return provider.send({ to, from: sender, subject, html, text, locale, template: "password_reset_confirmation", metadata: {} });
  }

  // --- Support tickets (Slice 8) ----------------------------------------------
  // All four take the same shape: {to, locale, ticketId, subject}. `subject`
  // is the ticket's own subject line -- ordinary customer text, escaped
  // inside the template itself before it reaches the HTML (see
  // ticket-notifications.mjs's own header). Which of these four to call, and
  // at most how often, is notifications.mjs's decision -- this is purely the
  // rendering + send step, same division as every method above it.
  function ticketUrlFor(locale, ticketId) {
    return `${appBaseUrl}/${locale ?? DEFAULT_LOCALE}/support/tickets/${ticketId}`;
  }

  async function sendTicketCreatedEmail({ to, locale, ticketId, subject }) {
    const t = translatorFor(locale);
    const { subject: emailSubject, html, text } = renderTicketCreated({ t, locale, subject, ticketUrl: ticketUrlFor(locale, ticketId) });
    return provider.send({ to, from: sender, subject: emailSubject, html, text, locale, template: "ticket_created", metadata: { ticketId } });
  }

  async function sendTicketStaffRepliedEmail({ to, locale, ticketId, subject }) {
    const t = translatorFor(locale);
    const { subject: emailSubject, html, text } = renderTicketStaffReplied({ t, locale, subject, ticketUrl: ticketUrlFor(locale, ticketId) });
    return provider.send({ to, from: sender, subject: emailSubject, html, text, locale, template: "ticket_staff_replied", metadata: { ticketId } });
  }

  async function sendTicketWaitingForUserEmail({ to, locale, ticketId, subject }) {
    const t = translatorFor(locale);
    const { subject: emailSubject, html, text } = renderTicketWaitingForUser({ t, locale, subject, ticketUrl: ticketUrlFor(locale, ticketId) });
    return provider.send({ to, from: sender, subject: emailSubject, html, text, locale, template: "ticket_waiting_for_user", metadata: { ticketId } });
  }

  async function sendTicketResolvedEmail({ to, locale, ticketId, subject }) {
    const t = translatorFor(locale);
    const { subject: emailSubject, html, text } = renderTicketResolved({ t, locale, subject, ticketUrl: ticketUrlFor(locale, ticketId) });
    return provider.send({ to, from: sender, subject: emailSubject, html, text, locale, template: "ticket_resolved", metadata: { ticketId } });
  }

  return {
    sendWelcomeEmail, sendVerificationEmail, sendLoginCode,
    sendPasswordResetEmail, sendPasswordResetConfirmation,
    sendTicketCreatedEmail, sendTicketStaffRepliedEmail, sendTicketWaitingForUserEmail, sendTicketResolvedEmail,
  };
}
