"use client";

/**
 * Primary navigation.
 *
 * Primary: PLAY · GAMES · TOURNAMENTS · WATCH · RANK · LEARN.
 * Secondary: WALLET · PROFILE · SUPPORT · DOWNLOAD APP (signed in), or the
 * auth entry points (signed out) -- both open the SAME popup
 * (lib/auth-popup-context.tsx) rather than navigating away, so a visitor
 * never loses the page they were reading to get there. /login and
 * /register still exist and work on their own for deep links and non-JS
 * fallback; the popup is a faster path to the same place, not a
 * replacement for them.
 *
 * Wallet and Download App have no real page yet -- rendered as an honest,
 * disabled "Soon" item rather than a link to a page that doesn't exist,
 * the same rule apps/web/src/components/admin/AdminSidebar.tsx already
 * applies to its own not-yet-built surfaces.
 *
 * Below 880px the whole nav collapses behind a single menu toggle -- six
 * primary items plus secondary ones has no honest way to fit a phone
 * screen otherwise.
 */
import { useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Logo } from "./Logo";
import { Button } from "./Button";
import { LocaleLink } from "./LocaleLink";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "@/lib/auth-context";
import { useAuthPopup } from "@/lib/auth-popup-context";
import { useI18n } from "@/lib/i18n/context";
import { transition } from "@/lib/motion";
import styles from "./Header.module.css";

type NavItem = { href: string; label: string };

export function Header() {
  const pathname = usePathname();
  const { player, loading, logout } = useAuth();
  const { openPopup } = useAuthPopup();
  const { locale, t } = useI18n();
  const reduceMotion = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);

  const PRIMARY_NAV: NavItem[] = [
    { href: "/play", label: t("nav.play") },
    { href: "/games", label: t("nav.games") },
    { href: "/tournaments", label: t("nav.tournaments") },
    { href: "/watch", label: t("nav.watch") },
    { href: "/rank", label: t("nav.rank") },
    { href: "/learn", label: t("nav.learn") },
  ];

  const isActive = (href: string) => pathname === `/${locale}${href}`;

  function closeMenu() { setMenuOpen(false); }

  return (
    <header className={styles.header}>
      <div className={`nz-container ${styles.inner}`}>
        <LocaleLink href="/" aria-label={t("nav.home_aria_label")} className={styles.brand}>
          <Logo />
        </LocaleLink>

        <nav className={styles.primaryNav} aria-label="Primary">
          {PRIMARY_NAV.map((item, i) => (
            <LocaleLink
              key={`${item.href}-${i}`}
              href={item.href}
              className={isActive(item.href) ? styles.navActive : styles.navLink}
            >
              {item.label}
            </LocaleLink>
          ))}
        </nav>

        <div className={styles.secondary}>
          <ThemeToggle />
          <LanguageSwitcher />
          {loading ? null : player ? (
            <>
              <LocaleLink href="/referrals" className={styles.navLink}>Referrals</LocaleLink>
              <LocaleLink href="/wallet" className={styles.navLink}>{t("nav.wallet")}</LocaleLink>
              <LocaleLink href="/profile" className={styles.navLink}>{player.handle}</LocaleLink>
              <LocaleLink href="/help" className={styles.navLink}>{t("nav.support")}</LocaleLink>
              <LocaleLink href="/#download" className={styles.navLink}>
                {t("nav.download_app")}
              </LocaleLink>
              <Button variant="ghost" onClick={() => void logout()}>{t("nav.log_out")}</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={openPopup}>{t("nav.log_in")}</Button>
              <Button variant="primary" onClick={openPopup}>{t("nav.play_now")}</Button>
            </>
          )}
        </div>

        <button
          type="button"
          className={styles.menuToggle}
          aria-label={t("nav.menu_aria_label")}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MenuIcon open={menuOpen} />
        </button>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className={styles.mobilePanel}
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={transition.reveal}
          >
            <nav className={styles.mobileNav} aria-label="Primary">
              {PRIMARY_NAV.map((item, i) => (
                <LocaleLink
                  key={`m-${item.href}-${i}`}
                  href={item.href}
                  className={isActive(item.href) ? styles.mobileNavActive : styles.mobileNavLink}
                  onClick={closeMenu}
                >
                  {item.label}
                </LocaleLink>
              ))}
            </nav>
            <div className={styles.mobileDivider} />
            <div className={styles.mobileLanguage}>
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
            <div className={styles.mobileSecondary}>
              {loading ? null : player ? (
                <>
                  <LocaleLink href="/referrals" className={styles.mobileNavLink} onClick={closeMenu}>Referrals</LocaleLink>
                  <LocaleLink href="/wallet" className={styles.mobileNavLink} onClick={closeMenu}>{t("nav.wallet")}</LocaleLink>
                  <LocaleLink href="/profile" className={styles.mobileNavLink} onClick={closeMenu}>{player.handle}</LocaleLink>
                  <LocaleLink href="/help" className={styles.mobileNavLink} onClick={closeMenu}>{t("nav.support")}</LocaleLink>
                  <Button variant="ghost" onClick={() => { closeMenu(); void logout(); }}>{t("nav.log_out")}</Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => { closeMenu(); openPopup(); }}>{t("nav.log_in")}</Button>
                  <Button variant="primary" onClick={() => { closeMenu(); openPopup(); }}>{t("nav.play_now")}</Button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {open ? (
        <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <path d="M3 6H17M3 10H17M3 14H17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
}
