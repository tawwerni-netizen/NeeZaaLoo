import { localeInfo, DEFAULT_LOCALE } from "./locales.mjs";

function intlTag(locale) {
  return localeInfo(locale)?.intlTag ?? localeInfo(DEFAULT_LOCALE).intlTag;
}

/**
 * Thin, locale-aware wrappers over the platform's native `Intl` APIs --
 * deliberately not a formatting library of our own. Every date, number and
 * currency shown to a player must go through one of these, never a
 * hand-rolled `toLocaleDateString()` call with an assumed locale, so the
 * formatting actually follows the platform's own locale-resolution order
 * rather than the server or browser's ambient default.
 */
export function formatDate(date, locale, options = {}) {
  return new Intl.DateTimeFormat(intlTag(locale), options).format(date instanceof Date ? date : new Date(date));
}

export function formatRelativeTime(value, unit, locale) {
  return new Intl.RelativeTimeFormat(intlTag(locale), { numeric: "auto" }).format(value, unit);
}

export function formatNumber(value, locale, options = {}) {
  return new Intl.NumberFormat(intlTag(locale), options).format(value);
}

/**
 * The platform's accounting currency is always USD (per the platform
 * financial architecture) -- only the *presentation* (symbol placement,
 * grouping separators, decimal marks) is locale-aware. This never changes
 * what asset a balance or price actually denominates.
 */
export function formatCurrency(amount, locale, currency = "USD") {
  return new Intl.NumberFormat(intlTag(locale), { style: "currency", currency }).format(amount);
}

export function formatPercent(value, locale, options = {}) {
  return new Intl.NumberFormat(intlTag(locale), { style: "percent", ...options }).format(value);
}
