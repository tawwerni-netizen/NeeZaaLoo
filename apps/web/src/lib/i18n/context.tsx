"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createTranslator } from "../../../../../packages/i18n/src/translate.mjs";
import { RESOURCES } from "./resources";
import { DEFAULT_LOCALE, directionFor, type SupportedLocale, type TextDirection } from "./locale";

type Translate = (key: string, vars?: Record<string, string | number>) => string;

type I18nState = {
  locale: SupportedLocale;
  dir: TextDirection;
  t: Translate;
};

const I18nContext = createContext<I18nState | null>(null);

/**
 * Wraps the app with the translator for exactly one, already-resolved
 * locale (decided server-side by middleware.ts, before this ever mounts --
 * see docs on the resolution order: explicit choice > saved account
 * preference > device locale > English). No client-side detection or
 * flash-of-untranslated-content here by design.
 */
export function I18nProvider({ locale, children }: { locale: SupportedLocale; children: ReactNode }) {
  const value = useMemo<I18nState>(() => {
    const { t } = createTranslator(locale, RESOURCES, { fallbackLocale: DEFAULT_LOCALE }) as { t: Translate };
    return { locale, dir: directionFor(locale), t };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nState {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
