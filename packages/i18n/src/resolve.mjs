import { SUPPORTED_LOCALE_CODES, DEFAULT_LOCALE, isSupportedLocale } from "./locales.mjs";

/**
 * Parses an HTTP `Accept-Language` header into locale codes ordered by
 * quality value, highest first. Ignores malformed entries rather than
 * throwing -- a header a browser or bot sends wrong should degrade to "no
 * preference detected", never a 500.
 */
export function parseAcceptLanguage(header) {
  if (!header || typeof header !== "string") return [];
  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? Number(qParam.trim().slice(2)) : 1;
      return { tag: tag?.trim().toLowerCase(), q: Number.isFinite(q) ? q : 1 };
    })
    .filter((e) => e.tag)
    .sort((a, b) => b.q - a.q)
    .map((e) => e.tag);
}

/** "en-US" / "en_US" / "EN" all match the supported base language "en". */
function baseLanguage(tag) {
  return tag.split(/[-_]/)[0]?.toLowerCase() ?? "";
}

export function matchSupportedLocale(tags, supported = SUPPORTED_LOCALE_CODES) {
  for (const tag of tags) {
    if (supported.includes(tag)) return tag;
  }
  for (const tag of tags) {
    const base = baseLanguage(tag);
    if (supported.includes(base)) return base;
  }
  return null;
}

/**
 * The platform-wide locale resolution order (see docs/i18n or the platform
 * localization requirement this implements):
 *
 *   1. an explicit, in-this-request user choice (e.g. the language switcher)
 *   2. a previously saved account preference (logged-in users)
 *   3. the visitor's device/browser locale (Accept-Language)
 *   4. English
 *
 * A logged-in user's saved preference always outranks their current device
 * locale -- switching phones or OS language must never silently change a
 * signed-in user's platform language out from under them.
 */
export function resolveLocale({
  explicit = null,
  saved = null,
  acceptLanguage = null,
  supported = SUPPORTED_LOCALE_CODES,
  fallback = DEFAULT_LOCALE,
} = {}) {
  if (explicit && supported.includes(explicit)) return explicit;
  if (saved && supported.includes(saved)) return saved;

  const deviceTags = Array.isArray(acceptLanguage) ? acceptLanguage : parseAcceptLanguage(acceptLanguage);
  const deviceMatch = matchSupportedLocale(deviceTags, supported);
  if (deviceMatch) return deviceMatch;

  return supported.includes(fallback) ? fallback : DEFAULT_LOCALE;
}

export { isSupportedLocale };
