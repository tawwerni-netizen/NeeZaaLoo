/**
 * Thin, typed wrapper around `@nizalo/i18n` (packages/i18n) -- the package
 * itself is the canonical source for the locale registry and the
 * resolution algorithm; this file only adds the TypeScript types that
 * plain `.mjs` cannot carry across the package boundary (`allowJs` lets us
 * import it directly rather than re-implementing the logic here).
 */
import {
  SUPPORTED_LOCALES as SUPPORTED_LOCALES_UNTYPED,
  SUPPORTED_LOCALE_CODES as SUPPORTED_LOCALE_CODES_UNTYPED,
  DEFAULT_LOCALE as DEFAULT_LOCALE_UNTYPED,
  directionFor as directionForUntyped,
  isSupportedLocale as isSupportedLocaleUntyped,
} from "../../../../../packages/i18n/src/locales.mjs";
import { resolveLocale as resolveLocaleUntyped } from "../../../../../packages/i18n/src/resolve.mjs";

// Kept in sync with packages/i18n/src/locales.mjs by hand -- see that
// file's own comment for why there is no single source of truth that can
// span the JS/TS boundary. A mismatch here only weakens type-checking, it
// never changes runtime behaviour: every actual decision (which locales
// exist, which one a request resolves to) still comes from the .mjs file.
export type SupportedLocale = "en" | "zh" | "hi" | "es" | "ar" | "fr";
export type TextDirection = "ltr" | "rtl";

export type LocaleInfo = {
  code: SupportedLocale;
  name: string;
  nativeName: string;
  dir: TextDirection;
  intlTag: string;
};

export const SUPPORTED_LOCALES = SUPPORTED_LOCALES_UNTYPED as LocaleInfo[];
export const SUPPORTED_LOCALE_CODES = SUPPORTED_LOCALE_CODES_UNTYPED as SupportedLocale[];
export const DEFAULT_LOCALE = DEFAULT_LOCALE_UNTYPED as SupportedLocale;

export function directionFor(locale: string): TextDirection {
  return directionForUntyped(locale) as TextDirection;
}

export function isSupportedLocale(code: string | null | undefined): code is SupportedLocale {
  return isSupportedLocaleUntyped(code);
}

type ResolveArgs = {
  explicit?: string | null;
  saved?: string | null;
  acceptLanguage?: string | null;
};

// The .mjs source's default-destructured parameters (`explicit = null`,
// etc.) give TypeScript's allowJs inference a narrower shape than this
// function actually accepts at runtime (every one of those also takes a
// real string). Recast the function itself at the boundary rather than the
// call site, so every caller here still gets the real, useful signature.
const resolveLocaleTyped = resolveLocaleUntyped as (args: ResolveArgs) => string;

export function resolveLocale(args: ResolveArgs): SupportedLocale {
  return resolveLocaleTyped(args) as SupportedLocale;
}
