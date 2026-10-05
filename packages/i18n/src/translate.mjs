import { DEFAULT_LOCALE } from "./locales.mjs";

function getPath(obj, dottedKey) {
  let cur = obj;
  for (const part of dottedKey.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

/**
 * A translator bound to one locale. Every user-facing string in the app
 * goes through `t(key, vars?)` -- never a hardcoded literal -- so the same
 * component renders correctly in all ten supported languages.
 *
 * Missing-key behaviour is deliberately layered rather than throwing: fall
 * back to the platform default locale's copy, and only if that is *also*
 * missing, surface the raw key. A shipped page must never crash or go blank
 * because one translation is missing; it should be visibly, obviously
 * untranslated so it gets caught in review.
 */
export function createTranslator(locale, resources, { fallbackLocale = DEFAULT_LOCALE, onMissingKey } = {}) {
  const own = resources[locale] ?? {};
  const fallback = resources[fallbackLocale] ?? {};

  function t(key, vars) {
    const value = getPath(own, key) ?? getPath(fallback, key);
    if (value === undefined) {
      onMissingKey?.(key, locale);
      return key;
    }
    return interpolate(value, vars);
  }

  return { t, locale };
}
