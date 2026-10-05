/**
 * Shared between middleware.ts and the client.
 *
 * Two cookies, deliberately: `LOCALE_COOKIE` is the effective locale --
 * middleware reads only this one to route every request, and it gets
 * written both by middleware's own device-locale guess AND by a
 * deliberate language-switcher choice, so on its own it cannot tell those
 * two cases apart. `LOCALE_EXPLICIT_COOKIE` marks the second case only:
 * "a real person picked this, in this browser". auth-context.tsx checks
 * that marker before ever overriding the active locale with a signed-in
 * player's saved account preference -- see the comment there for why that
 * ordering (explicit choice > saved preference > device guess) matters.
 */
export const LOCALE_COOKIE = "nz_locale";
export const LOCALE_EXPLICIT_COOKIE = "nz_locale_explicit";
export const LOCALE_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;
