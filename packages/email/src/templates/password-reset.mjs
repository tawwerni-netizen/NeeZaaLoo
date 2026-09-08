import { renderShell, codeBlock } from "../shell.mjs";

export function renderPasswordReset({ t, locale, code, expiresInMinutes }) {
  const bodyHtml = `
    <h1 style="font-size:22px;margin:0 0 16px;">${t("email.password_reset.heading")}</h1>
    <p style="margin:0 0 8px;">${t("email.password_reset.body")}</p>
    ${codeBlock(code)}
    <p style="margin:0 0 16px;color:#545B66;font-size:13px;">${t("email.password_reset.expires_note", { minutes: String(expiresInMinutes) })}</p>
    <p style="margin:0 0 16px;color:#545B66;font-size:13px;">${t("email.password_reset.ignore_note")}</p>
    <p style="margin:24px 0 0;font-size:13px;color:#545B66;">${t("email.common.support_note")}</p>
  `;
  return {
    subject: t("email.password_reset.subject"),
    html: renderShell({ locale, title: t("email.password_reset.subject"), bodyHtml, footerText: t("email.common.footer") }),
    text: [
      t("email.password_reset.heading"), "", t("email.password_reset.body"), "", code, "",
      t("email.password_reset.expires_note", { minutes: String(expiresInMinutes) }),
      t("email.password_reset.ignore_note"), "", t("email.common.support_note"),
    ].join("\n"),
  };
}
