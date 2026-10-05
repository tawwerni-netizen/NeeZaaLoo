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

  const isPlay = pathWithoutLocale.startsWith("/play");
  const isGames = pathWithoutLocale.startsWith("/games");
  const isRank = pathWithoutLocale.startsWith("/rank");
  const isWallet = pathWithoutLocale.startsWith("/wallet");
  const isProfile = pathWithoutLocale.startsWith("/profile");

  return (
    <nav className={styles.bottomNav} aria-label="Mobile Navigation">
      <div className={styles.navContainer}>
        {/* 1. Play */}
        <LocaleLink
          href="/play"
          className={[styles.navItem, isPlay ? styles.active : ""].join(" ")}
          aria-label={t("nav.play_now") || "Play"}
        >
          <span className={styles.navIconWrap}>
            <span className={styles.emojiIcon}>⚔️</span>
          </span>
          <span className={styles.navLabel}>
            {locale === "ar" ? "العب" : "Play"}
          </span>
          {isPlay && <span className={styles.activeIndicator} />}
        </LocaleLink>

        {/* 2. Games */}
        <LocaleLink
          href="/games"
          className={[styles.navItem, isGames ? styles.active : ""].join(" ")}
          aria-label={t("nav.games") || "Games"}
        >
          <span className={styles.navIconWrap}>
            <span className={styles.emojiIcon}>🎲</span>
          </span>
          <span className={styles.navLabel}>
            {t("nav.games") || (locale === "ar" ? "الألعاب" : "Games")}
          </span>
          {isGames && <span className={styles.activeIndicator} />}
        </LocaleLink>

        {/* 3. Rank */}
        <LocaleLink
          href="/rank"
          className={[styles.navItem, isRank ? styles.active : ""].join(" ")}
          aria-label={t("nav.rank") || "Rank"}
        >
          <span className={styles.navIconWrap}>
            <span className={styles.emojiIcon}>👑</span>
          </span>
          <span className={styles.navLabel}>
            {t("nav.rank") || (locale === "ar" ? "التصنيف" : "Rank")}
          </span>
          {isRank && <span className={styles.activeIndicator} />}
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
            <span className={styles.navLabel}>
              {t("nav.wallet") || (locale === "ar" ? "المحفظة" : "Wallet")}
            </span>
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
            <span className={styles.navLabel}>
              {t("nav.wallet") || (locale === "ar" ? "المحفظة" : "Wallet")}
            </span>
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
            <span className={styles.navLabel}>
              {t("nav.profile") || (locale === "ar" ? "حسابي" : "Profile")}
            </span>
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
