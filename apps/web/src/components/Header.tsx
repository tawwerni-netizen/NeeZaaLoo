"use client";

/**
 * Primary navigation. Fixed per docs/brand/BRAND_GUIDELINES.md §8:
 * PLAY · RANK · TOURNAMENT · LEARN, with CASH GAMES / PROFILE / WALLET /
 * SUPPORT as secondary. Cash Games is a section, not the header's visual
 * anchor -- it sits with the other secondary items, not styled to compete
 * with the primary four.
 */
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { Button } from "./Button";
import { LocaleLink } from "./LocaleLink";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import styles from "./Header.module.css";

export function Header() {
  const pathname = usePathname();
  const { player, loading, logout } = useAuth();
  const { locale, t } = useI18n();

  const PRIMARY_NAV = [
    { href: "/play", label: t("nav.play") },
    { href: "/rank", label: t("nav.rank") },
    { href: "/tournaments", label: t("nav.tournament") },
    { href: "/learn", label: t("nav.learn") },
  ];

  return (
    <header className={styles.header}>
      <div className={`nz-container ${styles.inner}`}>
        <LocaleLink href="/" aria-label={t("nav.home_aria_label")}>
          <Logo />
        </LocaleLink>

        <nav className={styles.primaryNav} aria-label="Primary">
          {PRIMARY_NAV.map((item) => (
            <LocaleLink
              key={item.href}
              href={item.href}
              className={pathname === `/${locale}${item.href}` ? styles.navActive : styles.navLink}
            >
              {item.label}
            </LocaleLink>
          ))}
        </nav>

        <div className={styles.secondary}>
          <LanguageSwitcher />
          {loading ? null : player ? (
            <>
              <LocaleLink href="/wallet" className={styles.navLink}>{t("nav.wallet")}</LocaleLink>
              <LocaleLink href="/chat" className={styles.navLink}>{t("nav.chat")}</LocaleLink>
              <LocaleLink href="/watch" className={styles.navLink}>{t("nav.watch")}</LocaleLink>
              <LocaleLink href="/support" className={styles.navLink}>{t("nav.support")}</LocaleLink>
              <LocaleLink href="/settings/security" className={styles.navLink}>{t("nav.security")}</LocaleLink>
              <LocaleLink href="/profile" className={styles.navLink}>{player.handle}</LocaleLink>
              <Button variant="ghost" onClick={() => void logout()}>{t("nav.log_out")}</Button>
            </>
          ) : (
            <>
              <LocaleLink href="/login" className={styles.navLink}>{t("nav.log_in")}</LocaleLink>
              <LocaleLink href="/register">
                <Button variant="primary">{t("nav.play_now")}</Button>
              </LocaleLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
