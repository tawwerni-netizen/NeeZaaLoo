import { renderShell, codeBlock } from "../shell.mjs";

export function renderLoginCode({ t, locale, code, expiresInMinutes }) {
  const bodyHtml = `
    <h1 style="font-size:22px;margin:0 0 16px;">${t("email.login_code.heading")}</h1>
    <p style="margin:0 0 8px;">${t("email.login_code.body")}</p>
    ${codeBlock(code)}
    <p style="margin:0 0 16px;color:#545B66;font-size:13px;">${t("email.login_code.expires_note", { minutes: String(expiresInMinutes) })}</p>
    <p style="margin:0 0 16px;color:#545B66;font-size:13px;">${t("email.login_code.ignore_note")}</p>
    <p style="margin:24px 0 0;font-size:13px;color:#545B66;">${t("email.common.support_note")}</p>
  `;
  return {
    subject: t("email.login_code.subject"),
    html: renderShell({ locale, title: t("email.login_code.subject"), bodyHtml, footerText: t("email.common.footer") }),
    text: [
      t("email.login_code.heading"), "", t("email.login_code.body"), "", code, "",
      t("email.login_code.expires_note", { minutes: String(expiresInMinutes) }),
      t("email.login_code.ignore_note"), "", t("email.common.support_note"),
    ].join("\n"),
  };
}
