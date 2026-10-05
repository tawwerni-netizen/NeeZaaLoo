import { renderShell, codeBlock } from "../shell.mjs";

export function renderVerification({ t, locale, email, code, expiresInMinutes }) {
  const bodyHtml = `
    <h1 style="font-size:22px;margin:0 0 16px;">${t("email.verification.heading")}</h1>
    <p style="margin:0 0 8px;">${t("email.verification.body", { email })}</p>
    ${codeBlock(code)}
    <p style="margin:0 0 16px;color:#545B66;font-size:13px;">${t("email.verification.expires_note", { minutes: String(expiresInMinutes) })}</p>
    <p style="margin:0 0 16px;color:#545B66;font-size:13px;">${t("email.verification.ignore_note")}</p>
    <p style="margin:24px 0 0;font-size:13px;color:#545B66;">${t("email.common.support_note")}</p>
  `;
  return {
    subject: t("email.verification.subject"),
    html: renderShell({ locale, title: t("email.verification.subject"), bodyHtml, footerText: t("email.common.footer") }),
    text: [
      t("email.verification.heading"), "", t("email.verification.body", { email }), "", code, "",
      t("email.verification.expires_note", { minutes: String(expiresInMinutes) }),
      t("email.verification.ignore_note"), "", t("email.common.support_note"),
    ].join("\n"),
  };
}
