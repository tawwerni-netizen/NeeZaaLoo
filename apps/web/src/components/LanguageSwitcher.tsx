"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n/locale";
import { LOCALE_COOKIE, LOCALE_EXPLICIT_COOKIE, LOCALE_COOKIE_MAX_AGE_S } from "@/lib/i18n/constants";
import { FlagIcon } from "./FlagIcon";
import styles from "./LanguageSwitcher.module.css";

function pathWithoutLocale(pathname: string): string {
  const segments = pathname.split("/");
  return "/" + segments.slice(2).join("/");
}

interface LanguageSwitcherProps {
  variant?: "full" | "compact";
  dropDirection?: "down" | "up";
  onSelect?: () => void;
}

export function LanguageSwitcher({ dropDirection = "down", onSelect, variant = "full" }: LanguageSwitcherProps = {}) {
  const { locale, t } = useI18n();
  const { player, setLocale } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function onSelectLocale(next: SupportedLocale) {
    setIsOpen(false);
    onSelect?.();
    if (next === locale) return;

    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_S}; samesite=lax`;
    document.cookie = `${LOCALE_EXPLICIT_COOKIE}=1; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_S}; samesite=lax`;
    if (player) void setLocale(next);

    startTransition(() => {
      router.push(`/${next}${pathWithoutLocale(pathname)}`);
      router.refresh();
    });
  }

  const currentLocale = (SUPPORTED_LOCALES.find((l) => l.code === locale) ?? SUPPORTED_LOCALES[0])!;

  return (
    <div className={styles.wrap} ref={containerRef}>
      <button
        type="button"
        className={`${styles.triggerBtn} ${isOpen ? styles.triggerActive : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={t("settings.language")}
        title={t("settings.language")}
      >
        <span className={styles.flagIcon} aria-hidden="true">
          <FlagIcon locale={currentLocale.code} className={styles.flagSvg} />
        </span>
        {variant !== "compact" && <span className={styles.langName}>{currentLocale.nativeName}</span>}
        <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`} aria-hidden="true">
          ▾
        </span>
      </button>

      {isOpen && (
        <div
          className={`${styles.dropdown} ${dropDirection === "up" ? styles.dropdownUp : ""}`}
          role="listbox"
          aria-label={t("settings.language")}
        >
          {SUPPORTED_LOCALES.map((l) => {
            const isSelected = l.code === locale;
            return (
              <button
                key={l.code}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`${styles.optionBtn} ${isSelected ? styles.optionSelected : ""}`}
                onClick={() => onSelectLocale(l.code)}
              >
                <span className={styles.optionFlag} aria-hidden="true">
                  <FlagIcon locale={l.code} className={styles.flagSvg} />
                </span>
                <span className={styles.optionText}>{l.nativeName}</span>
                {isSelected && (
                  <span className={styles.checkIcon} aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

