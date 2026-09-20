"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Logo } from "./Logo";
import { Button } from "./Button";
import { LocaleLink } from "./LocaleLink";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { NotificationCenter } from "./notifications/NotificationCenter";
import { UserMenu } from "./UserMenu";
import { useAuth } from "@/lib/auth-context";
import { useAuthPopup } from "@/lib/auth-popup-context";
import { useWalletBalance } from "@/lib/use-wallet-balance";
import { useI18n } from "@/lib/i18n/context";
import { transition } from "@/lib/motion";
import { WealthWalletIcon } from "@/components/icons/WealthWalletIcon";
import styles from "./Header.module.css";

type NavItem = { href?: string; label: string; icon: string; items?: { href: string; label: string; icon?: string; }[] };

const DEPOSIT_LABELS: Record<string, string> = {
  ar: "إيداع",
  en: "Deposit",
  es: "Depositar",
  fr: "Dépôt",
  hi: "जमा",
  zh: "充值",
};

export function Header() {
  const pathname = usePathname();
  const { player, loading, logout } = useAuth();
  const { openPopup } = useAuthPopup();
  const { totalUsd, availableUsd, loading: balanceLoading } = useWalletBalance();
  const { locale, t } = useI18n();
  const reduceMotion = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);

  const PRIMARY_NAV = [
    { href: "/play", label: t("nav.arena"), icon: "⚔️" },
    { href: "/games", label: t("nav.games"), icon: "🎲" },
    { href: "/tournaments", label: t("nav.tournaments"), icon: "🏆" },
    { href: "/clans", label: t("nav.clans"), icon: "🛡️" },
    { href: "/rank", label: t("nav.rank"), icon: "👑" },
    { href: "/wallet", label: t("nav.wallet"), icon: "💰" },
  ];

  const isActive = (href: string) => pathname === `/${locale}${href}`;

  function closeMenu() { setMenuOpen(false); }

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header className={styles.header}>
      <div className={`nz-container ${styles.inner}`}>
        <LocaleLink href="/" aria-label={t("nav.home_aria_label")} className={styles.brand}>
          <Logo />
        </LocaleLink>

        <nav className={styles.primaryNav} aria-label="Primary">
          {PRIMARY_NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <LocaleLink
                key={item.href}
                href={item.href}
                className={active ? styles.navLinkActive : styles.navLink}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label}</span>
                {active && <span className={styles.activeIndicator} />}
              </LocaleLink>
            );
          })}
        </nav>

        {/* Desktop Secondary Actions */}
        <div className={styles.secondary}>
          {loading ? null : player ? (
            <>
              {/* Ultra-Professional Wallet Balance & Deposit Widget */}
              <div className={styles.walletBalanceWidget}>
                <LocaleLink
                  href="/wallet"
                  className={styles.walletBalanceMain}
                  title={
                    locale === "ar"
                      ? `إجمالي الرصيد: ${totalUsd.toFixed(2)} $ (المتاح للعب: ${availableUsd.toFixed(2)} $)`
                      : `Total Balance: $${totalUsd.toFixed(2)} (Available to play: $${availableUsd.toFixed(2)})`
                  }
                >
                  <div className={styles.walletIconWrap}>
                    <span className={styles.walletLiveDot} />
                    <span className={styles.walletIcon}>
                      <WealthWalletIcon size={19} />
                    </span>
                  </div>
                  <div className={styles.walletAmountWrap}>
                    <span className={styles.walletAmountNum}>
                      {balanceLoading ? (
                        <span className={styles.walletShimmer}>0.00</span>
                      ) : (
                        `${totalUsd.toFixed(2)}`
                      )}
                    </span>
                    <span className={styles.walletAssetTag}>USDT</span>
                  </div>
                </LocaleLink>

                <LocaleLink
                  href="/wallet"
                  className={styles.walletDepositQuickBtn}
                  title={locale === "ar" ? "إيداع وشحن الرصيد فوراً" : "Deposit funds"}
                >
                  <span className={styles.walletDepositPlus}>+</span>
                  <span className={styles.walletDepositLabel}>
                    {DEPOSIT_LABELS[locale] || "Deposit"}
                  </span>
                </LocaleLink>
              </div>

              <LocaleLink href="/chat" className={styles.chatPill} aria-label={t("nav.chat")}>
                <span className={styles.chatIcon}>💬</span>
              </LocaleLink>
              <NotificationCenter />
              <UserMenu />
              <div className={styles.headerDivider} />
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={openPopup}>{t("nav.log_in")}</Button>
              <LocaleLink href="/play">
                <Button variant="primary">{t("nav.play_now")}</Button>
              </LocaleLink>
              <div className={styles.headerDivider} />
            </>
          )}
          <LanguageSwitcher />
        </div>

        {/* Mobile Header Actions (Visible on mobile/tablet screens) */}
        <div className={styles.mobileActions}>
          {loading ? null : player ? (
            <>
              <LocaleLink
                href="/wallet"
                className={styles.mobileWalletBalancePill}
                aria-label={t("nav.wallet")}
                title={locale === "ar" ? "رصيد المحفظة" : "Wallet Balance"}
              >
                <span className={styles.walletIcon}>
                  <WealthWalletIcon size={16} />
                </span>
                <span className={styles.mobileBalanceNum}>
                  {totalUsd.toFixed(2)}
                </span>
                <span className={styles.mobileDepositPlus}>+</span>
              </LocaleLink>
              <LocaleLink href="/chat" className={styles.mobileChatBtn} aria-label={t("nav.chat")}>
                <span className={styles.chatIcon}>💬</span>
              </LocaleLink>
              <NotificationCenter />
              <LanguageSwitcher variant="compact" />
            </>
          ) : (
            <>
              <LocaleLink href="/play" className={styles.mobileHeaderPlayBtn}>
                <span>⚔️</span>
                <span>{t("nav.play_now")}</span>
              </LocaleLink>
              <LanguageSwitcher variant="compact" />
            </>
          )}

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
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className={styles.mobilePanel}
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={transition.reveal}
          >
            {/* User Profile Card or Guest Welcome Banner */}
            {loading ? null : player ? (
              <div className={styles.mobileUserCard}>
                <div className={styles.mobileUserMain}>
                  <div className={styles.mobileUserAvatar}>
                    {player.handle ? player.handle.charAt(0).toUpperCase() : "U"}
                  </div>
                  <div className={styles.mobileUserInfo}>
                    <div className={styles.mobileUserHandle}>{player.handle}</div>
                    <div className={styles.mobileUserStatus}>
                      <span className={styles.onlineDot} />
                      <span>{locale === "ar" ? "متصل الآن" : "Online"}</span>
                      {player.isAdmin && <span className={styles.adminTag}>Admin</span>}
                    </div>
                  </div>
                </div>

                {/* Mobile Drawer Balance Showcase */}
                <div className={styles.mobileDrawerBalanceBox}>
                  <div className={styles.mobileDrawerBalanceLabel}>
                    <WealthWalletIcon size={16} />
                    <span>{locale === "ar" ? "رصيد المحفظة:" : "Wallet Balance:"}</span>
                  </div>
                  <div className={styles.mobileDrawerBalanceVal}>
                    {totalUsd.toFixed(2)} <span style={{ fontSize: "11px", color: "#4ade80" }}>USDT</span>
                  </div>
                </div>

                <div className={styles.mobileUserActions}>
                  <LocaleLink href="/wallet" className={styles.mobileCardWalletBtn} onClick={closeMenu}>
                    <span className={styles.walletIcon}>
                      <WealthWalletIcon size={18} />
                    </span>
                    <span>{t("nav.wallet")}</span>
                  </LocaleLink>
                  <LocaleLink href="/profile" className={styles.mobileCardProfileBtn} onClick={closeMenu}>
                    <span>{locale === "ar" ? "الملف الشخصي" : "Profile"}</span>
                  </LocaleLink>
                </div>
              </div>
            ) : (
               <div className={styles.mobileGuestCard}>
                <div className={styles.mobileGuestTitle}>
                  {locale === "ar" ? "ميدان نزلو للمبارزات" : "Nizalo Duel Arena"}
                </div>
                <p className={styles.mobileGuestSubtitle}>
                  {locale === "ar"
                    ? "ألعاب مهارية معتمدة، تحكيم خادم فوري بدون أي عنصر حظ."
                    : "100% skill-based games with instant server-side matchmaking."}
                </p>
                <div className={styles.mobileGuestButtons}>
                  <Button variant="ghost" onClick={() => { closeMenu(); openPopup(); }}>
                    {t("nav.log_in")}
                  </Button>
                  <LocaleLink href="/play" onClick={closeMenu}>
                    <Button variant="primary">
                      {t("nav.play_now")}
                    </Button>
                  </LocaleLink>
                </div>
              </div>
            )}

            {/* Primary Navigation Grid */}
            <div className={styles.mobileNavSection}>
              <div className={styles.mobileSectionTitle}>
                {locale === "ar" ? "القائمة الرئيسية" : "Main Navigation"}
              </div>
              <div className={styles.mobileNavGrid}>
                {PRIMARY_NAV.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <LocaleLink
                      key={item.href}
                      href={item.href}
                      className={active ? styles.mobileNavTileActive : styles.mobileNavTile}
                      onClick={closeMenu}
                    >
                      <span className={styles.mobileNavTileIcon}>{item.icon}</span>
                      <span className={styles.mobileNavTileLabel}>{item.label}</span>
                      {active && <span className={styles.activeGlowDot} />}
                    </LocaleLink>
                  );
                })}
              </div>
            </div>

            {/* Quick Services (If Logged in) */}
            {player && (
              <div className={styles.mobileServicesSection}>
                <div className={styles.mobileSectionTitle}>
                  {locale === "ar" ? "خدمات الحساب" : "Account Services"}
                </div>
                <div className={styles.mobileServicesGrid}>
                  <LocaleLink href="/chat" className={styles.mobileServiceItem} onClick={closeMenu}>
                    <span className={styles.serviceIcon}>💬</span>
                    <span className={styles.serviceLabel}>{t("nav.chat")}</span>
                  </LocaleLink>
                  <LocaleLink href="/wallet" className={styles.mobileServiceItem} onClick={closeMenu}>
                    <span className={styles.serviceIcon}>💎</span>
                    <span className={styles.serviceLabel}>{t("nav.wallet")}</span>
                  </LocaleLink>
                  <LocaleLink href="/referrals" className={styles.mobileServiceItem} onClick={closeMenu}>
                    <span className={styles.serviceIcon}>🎁</span>
                    <span className={styles.serviceLabel}>{t("nav.referrals")}</span>
                  </LocaleLink>
                  <LocaleLink href="/help" className={styles.mobileServiceItem} onClick={closeMenu}>
                    <span className={styles.serviceIcon}>❓</span>
                    <span className={styles.serviceLabel}>{t("nav.support")}</span>
                  </LocaleLink>
                  {player.isAdmin && (
                    <LocaleLink href="/admin" className={styles.mobileServiceItem} onClick={closeMenu}>
                      <span className={styles.serviceIcon}>🛡️</span>
                      <span className={styles.serviceLabel}>{t("nav.admin") || "Admin"}</span>
                    </LocaleLink>
                  )}
                </div>
              </div>
            )}

            {/* Footer Bar: Language and Logout */}
            <div className={styles.mobileFooterBar}>
              <div className={styles.mobileControls}>
                <LanguageSwitcher dropDirection="up" onSelect={closeMenu} />
              </div>
              {player && (
                <button
                  type="button"
                  className={styles.mobileLogoutBtn}
                  onClick={() => { closeMenu(); void logout(); }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span>{t("nav.log_out")}</span>
                </button>
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
