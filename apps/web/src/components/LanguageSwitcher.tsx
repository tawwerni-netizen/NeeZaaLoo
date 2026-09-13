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

function pathWithoutLocale(pathname: string): string {
  const segments = pathname.split("/");
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
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      </span>
      <select
        className={styles.select}
        value={locale}
        onChange={(e) => onChange(e.target.value as SupportedLocale)}
        aria-label={t("settings.language")}
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l.code} value={l.code}>{l.nativeName}</option>
        ))}
      </select>
      <span className={styles.chevron} aria-hidden="true">▾</span>
    </div>
  );
}
