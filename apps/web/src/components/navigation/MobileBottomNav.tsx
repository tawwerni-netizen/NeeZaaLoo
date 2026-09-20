"use client";

import { usePathname } from "next/navigation";
import { LocaleLink } from "@/components/LocaleLink";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { useWalletBalance } from "@/lib/use-wallet-balance";
import { useAuthPopup } from "@/lib/auth-popup-context";
import { WealthWalletIcon } from "@/components/icons/WealthWalletIcon";
import styles from "./MobileBottomNav.module.css";

export function MobileBottomNav() {
  const pathname = usePathname();
  const { player } = useAuth();
  const { t, locale } = useI18n();
  const { totalUsd } = useWalletBalance();
  const { openPopup } = useAuthPopup();

  // Hide on admin routes and on active game duel screens so mobile board has full viewport
  if (pathname.includes("/admin") || pathname.includes("/game/")) {
    return null;
  }

  // Normalize path without locale prefix (e.g. "/ar/play" -> "/play")
  const pathWithoutLocale = pathname.replace(new RegExp(`^/${locale}`), "") || "/";

  const isHome = pathWithoutLocale === "/";
  const isArena = pathWithoutLocale.startsWith("/play") || pathWithoutLocale.startsWith("/games");
  const isTournaments = pathWithoutLocale.startsWith("/tournaments");
  const isWallet = pathWithoutLocale.startsWith("/wallet");
  const isProfile = pathWithoutLocale.startsWith("/profile");

  return (
    <nav className={styles.bottomNav} aria-label="Mobile Navigation">
      <div className={styles.navContainer}>
        {/* 1. Home */}
        <LocaleLink
          href="/"
          className={[styles.navItem, isHome ? styles.active : ""].join(" ")}
          aria-label={t("nav.home_aria_label")}
        >
          <span className={styles.navIconWrap}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </span>
          <span className={styles.navLabel}>{locale === "ar" ? "الرئيسية" : "Home"}</span>
          {isHome && <span className={styles.activeIndicator} />}
        </LocaleLink>

        {/* 2. Arena / Play */}
        <LocaleLink
          href="/play"
          className={[styles.navItem, isArena ? styles.active : ""].join(" ")}
          aria-label={t("nav.arena")}
        >
          <span className={styles.navIconWrap}>
            <span className={styles.emojiIcon}>⚔️</span>
          </span>
          <span className={styles.navLabel}>{t("nav.arena")}</span>
          {isArena && <span className={styles.activeIndicator} />}
        </LocaleLink>

        {/* 3. Tournaments */}
        <LocaleLink
          href="/tournaments"
          className={[styles.navItem, isTournaments ? styles.active : ""].join(" ")}
          aria-label={t("nav.tournaments")}
        >
          <span className={styles.navIconWrap}>
            <span className={styles.emojiIcon}>🏆</span>
          </span>
          <span className={styles.navLabel}>{t("nav.tournaments")}</span>
          {isTournaments && <span className={styles.activeIndicator} />}
        </LocaleLink>

        {/* 4. Wallet */}
        {player ? (
          <LocaleLink
            href="/wallet"
            className={[styles.navItem, isWallet ? styles.active : ""].join(" ")}
            aria-label={t("nav.wallet")}
          >
            <span className={styles.navIconWrap}>
              <WealthWalletIcon size={20} />
              {totalUsd > 0 && (
                <span className={styles.balanceBadge}>${totalUsd.toFixed(0)}</span>
              )}
            </span>
            <span className={styles.navLabel}>{t("nav.wallet")}</span>
            {isWallet && <span className={styles.activeIndicator} />}
          </LocaleLink>
        ) : (
          <button
            type="button"
            onClick={openPopup}
            className={[styles.navItem, isWallet ? styles.active : ""].join(" ")}
            aria-label={t("nav.wallet")}
          >
            <span className={styles.navIconWrap}>
              <WealthWalletIcon size={20} />
            </span>
            <span className={styles.navLabel}>{t("nav.wallet")}</span>
          </button>
        )}

        {/* 5. Profile or Login */}
        {player ? (
          <LocaleLink
            href="/profile"
            className={[styles.navItem, isProfile ? styles.active : ""].join(" ")}
            aria-label={t("nav.profile")}
          >
            <span className={styles.navIconWrap}>
              <span className={styles.profileAvatar}>
                {player.handle ? player.handle.charAt(0).toUpperCase() : "👤"}
              </span>
            </span>
            <span className={styles.navLabel}>{t("nav.profile")}</span>
            {isProfile && <span className={styles.activeIndicator} />}
          </LocaleLink>
        ) : (
          <button
            type="button"
            onClick={openPopup}
            className={styles.navItem}
            aria-label={t("nav.log_in")}
          >
            <span className={styles.navIconWrap}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <span className={styles.navLabel}>{t("nav.log_in")}</span>
          </button>
        )}
      </div>
    </nav>
  );
}
