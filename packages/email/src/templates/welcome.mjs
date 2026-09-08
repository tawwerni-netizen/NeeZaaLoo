import { renderShell, button } from "../shell.mjs";

/**
 * `t` is a translator already bound to the recipient's locale (see
 * packages/i18n/src/translate.mjs) -- this file only ever calls `t()`, it
 * never branches on locale itself. That is what "shared template
 * structure, localized resources" means in practice: one function, six
 * languages, no per-language copy of this file.
 */
export function renderWelcome({ t, locale, nickname, playUrl }) {
  const bodyHtml = `
    <h1 style="font-size:22px;margin:0 0 16px;">${t("email.welcome.heading")}</h1>
    <p style="margin:0 0 16px;">${t("email.welcome.body")}</p>
    <p style="margin:0 0 8px;color:#545B66;">${t("email.welcome.nav_note")}</p>
    ${button(playUrl, t("email.welcome.cta"))}
    <p style="margin:24px 0 0;font-size:13px;color:#545B66;">${t("email.common.support_note")}</p>
  `;
  return {
    subject: t("email.welcome.subject", { nickname }),
    html: renderShell({ locale, title: t("email.welcome.subject", { nickname }), bodyHtml, footerText: t("email.common.footer") }),
    text: [t("email.welcome.heading"), "", t("email.welcome.body"), "", t("email.welcome.nav_note"), "", playUrl, "", t("email.common.support_note")].join("\n"),
  };
}
