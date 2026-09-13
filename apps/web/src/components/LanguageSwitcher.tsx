"use client";

/**
 * The one control that lets a visitor override automatic language
 * detection (per the platform's locale-resolution order: explicit choice
 * beats a saved account preference beats the device's own language). For a
 * signed-in player, the choice is also saved to their account via
 * `PATCH /v1/me`, so it survives switching devices -- see
 * packages/i18n/src/resolve.mjs for why that ordering exists.
 */
import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n/locale";
import { LOCALE_COOKIE, LOCALE_EXPLICIT_COOKIE, LOCALE_COOKIE_MAX_AGE_S } from "@/lib/i18n/constants";
import styles from "./LanguageSwitcher.module.css";

// A visible icon per language, per the brand's own language-selector spec --
// these are convenience symbols for a LANGUAGE choice, not a claim that any
// language belongs to one country; picking a widely-recognized flag for each
// is a legibility aid, same as SUPPORTED_LOCALES' own nativeName already is.
const LOCALE_FLAG: Record<SupportedLocale, string> = {
  en: "🇬🇧", zh: "🇨🇳", hi: "🇮🇳", es: "🇪🇸", ar: "🇸🇦", fr: "🇫🇷",
};

function pathWithoutLocale(pathname: string): string {
  const segments = pathname.split("/");
  // segments[0] is "" (leading slash), segments[1] is the locale segment.
  return "/" + segments.slice(2).join("/");
}

export function LanguageSwitcher() {
  const { locale, t } = useI18n();
  const { player, setLocale } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  function onChange(next: SupportedLocale) {
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_S}; samesite=lax`;
    document.cookie = `${LOCALE_EXPLICIT_COOKIE}=1; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_S}; samesite=lax`;
    if (player) void setLocale(next);
    startTransition(() => {
      router.push(`/${next}${pathWithoutLocale(pathname)}`);
      router.refresh();
    });
  }

  return (
    <div className={styles.wrap}>
      <span className={styles.iconPrefix} aria-hidden="true">
        {LOCALE_FLAG[locale] || "🌐"}
      </span>
      <select
        className={styles.select}
        value={locale}
        onChange={(e) => onChange(e.target.value as SupportedLocale)}
        aria-label={t("settings.language")}
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l.code} value={l.code}>{LOCALE_FLAG[l.code]} {l.nativeName}</option>
        ))}
      </select>
      <span className={styles.chevron} aria-hidden="true">▾</span>
    </div>
  );
}
