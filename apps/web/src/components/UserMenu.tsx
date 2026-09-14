"use client";

import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LocaleLink } from "./LocaleLink";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import styles from "./UserMenu.module.css";

export function UserMenu() {
  const { player, logout } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (!player) return null;

  const initial = player.handle ? player.handle.charAt(0).toUpperCase() : "U";

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerActive : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={player.handle}
      >
        <span className={styles.avatarCircle}>{initial}</span>
        <span className={styles.handleText}>{player.handle}</span>
        <svg className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.menu}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
          >
            <div className={styles.menuHeader}>
              <div className={styles.menuUserHandle}>{player.handle}</div>
              <div className={styles.menuUserBadge}>● Online</div>
            </div>

            <LocaleLink href="/profile" className={styles.menuItem} onClick={() => setOpen(false)}>
              👤 {t("nav.profile") || "Profile"}
            </LocaleLink>
            <LocaleLink href="/referrals" className={styles.menuItem} onClick={() => setOpen(false)}>
              🎁 {t("nav.referrals")}
            </LocaleLink>
            <LocaleLink href="/help" className={styles.menuItem} onClick={() => setOpen(false)}>
              ❓ {t("nav.support")}
            </LocaleLink>

            {player.isAdmin && (
              <LocaleLink href="/admin" className={styles.menuItem} onClick={() => setOpen(false)}>
                ⚙️ {t("nav.admin") || "Admin Dashboard"}
              </LocaleLink>
            )}

            <div className={styles.divider} />

            <button
              type="button"
              className={`${styles.menuItem} ${styles.logoutItem}`}
              onClick={() => {
                setOpen(false);
                void logout();
              }}
            >
              🚪 {t("nav.log_out")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
