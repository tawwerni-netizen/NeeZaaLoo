/**
 * The single source of truth for which languages the PLAYER-FACING platform
 * supports (web, Android, emails, backend-generated user messages). Nothing
 * outside this file should hardcode a locale code -- adding or removing a
 * language means editing this list and dropping in a resource file, not
 * touching application components.
 *
 * The admin/control-panel surface is a deliberately separate, English-only
 * context (see ADMIN_LOCALE below) -- it must never read from a visitor's
 * device locale or account preference.
 */

// The product's official language list is exactly these six -- restated
// explicitly, more than once, as en/zh/hi/es/ar/fr. An earlier pass of this
// registry shipped ten (adding ja/de/pt/ru/ko instead of hi) before that was
// pinned down; this is the reconciliation to the current, authoritative
// spec, not a redesign of the registry itself -- everything that reads from
// SUPPORTED_LOCALES/SUPPORTED_LOCALE_CODES needed no change at all, which is
// exactly the point of centralizing the list here in the first place.
export const SUPPORTED_LOCALES = [
  { code: "en", name: "English", nativeName: "English", dir: "ltr", intlTag: "en-US" },
  { code: "zh", name: "Chinese", nativeName: "中文", dir: "ltr", intlTag: "zh-CN" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", dir: "ltr", intlTag: "hi" },
  { code: "es", name: "Spanish", nativeName: "Español", dir: "ltr", intlTag: "es" },
  { code: "ar", name: "Arabic", nativeName: "العربية", dir: "rtl", intlTag: "ar" },
  { code: "fr", name: "French", nativeName: "Français", dir: "ltr", intlTag: "fr" },
];

export const SUPPORTED_LOCALE_CODES = Object.freeze(SUPPORTED_LOCALES.map((l) => l.code));

export const DEFAULT_LOCALE = "en";

/** The one and only locale the admin/control-panel surface is ever allowed to render in. */
export const ADMIN_LOCALE = "en";

const BY_CODE = new Map(SUPPORTED_LOCALES.map((l) => [l.code, l]));

export function isSupportedLocale(code) {
  return BY_CODE.has(code);
}

export function localeInfo(code) {
  return BY_CODE.get(code) ?? null;
}

export function directionFor(code) {
  return BY_CODE.get(code)?.dir ?? "ltr";
}

Object.freeze(SUPPORTED_LOCALES);
for (const entry of SUPPORTED_LOCALES) Object.freeze(entry);
