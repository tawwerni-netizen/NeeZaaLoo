import { renderShell } from "../shell.mjs";

export function renderPasswordResetConfirmation({ t, locale }) {
  const bodyHtml = `
    <h1 style="font-size:22px;margin:0 0 16px;">${t("email.password_reset_confirmation.heading")}</h1>
    <p style="margin:0 0 16px;">${t("email.password_reset_confirmation.body")}</p>
    <p style="margin:0 0 16px;color:#545B66;font-size:13px;">${t("email.password_reset_confirmation.warning")}</p>
    <p style="margin:24px 0 0;font-size:13px;color:#545B66;">${t("email.common.support_note")}</p>
  `;
  return {
    subject: t("email.password_reset_confirmation.subject"),
    html: renderShell({ locale, title: t("email.password_reset_confirmation.subject"), bodyHtml, footerText: t("email.common.footer") }),
    text: [
      t("email.password_reset_confirmation.heading"), "", t("email.password_reset_confirmation.body"),
      "", t("email.password_reset_confirmation.warning"), "", t("email.common.support_note"),
    ].join("\n"),
  };
}
