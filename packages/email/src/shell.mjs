/**
 * The one HTML wrapper every template renders its content into -- per the
 * requirement not to duplicate a full HTML document per language, only the
 * translated strings vary; the markup and inline styles here are shared by
 * every locale, including a `dir` flip for Arabic.
 *
 * Inline styles throughout: most email clients strip <style> blocks, so
 * this is the one place in the whole platform where that is the correct
 * choice rather than a shortcut.
 */
import { directionFor } from "../../i18n/src/locales.mjs";

const BRAND_ORANGE = "#CC3A14"; // deepened for AA contrast against white text, matches tokens.css --nz-accent
const INK = "#0B0D10";
const MUTED = "#545B66";
const LINE = "#E2E5EA";

export function renderShell({ locale, title, bodyHtml, footerText }) {
  const dir = directionFor(locale);
  const align = dir === "rtl" ? "right" : "left";
  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#F7F8FA;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0"
               style="background:#FFFFFF;border:1px solid ${LINE};border-radius:12px;overflow:hidden;max-width:480px;width:100%;">
          <tr>
            <td style="padding:24px 32px;border-bottom:1px solid ${LINE};text-align:${align};">
              <span style="font-size:18px;font-weight:700;letter-spacing:0.02em;color:${INK};">NIZALO</span>
            </td>
          </tr>
          <tr>
            <td dir="${dir}" style="padding:32px;text-align:${align};font-size:15px;line-height:1.6;color:${INK};">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid ${LINE};text-align:${align};font-size:12px;color:${MUTED};">
              ${escapeHtml(footerText)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function button(href, label) {
  return `<a href="${href}" style="display:inline-block;background:${BRAND_ORANGE};color:#FFFFFF;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;margin:16px 0;">${escapeHtml(label)}</a>`;
}

export function codeBlock(code) {
  return `<div style="font-family:ui-monospace,'IBM Plex Mono',monospace;font-size:28px;font-weight:700;letter-spacing:0.12em;background:#F0F2F5;border-radius:8px;padding:16px 24px;text-align:center;margin:16px 0;">${escapeHtml(code)}</div>`;
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
