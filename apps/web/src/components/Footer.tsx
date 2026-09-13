"use client";

import { Logo } from "./Logo";
import { LocaleLink } from "./LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import styles from "./Footer.module.css";

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className={styles.footer}>
      <div className={`nz-container ${styles.inner}`}>
        <Logo variant="mark" />
        <nav className={styles.links} aria-label="Footer">
          <LocaleLink href="/learn">{t("footer.learn")}</LocaleLink>
          <LocaleLink href="/tournaments">{t("footer.tournaments")}</LocaleLink>
          <LocaleLink href="/rank">{t("footer.leaderboard")}</LocaleLink>
          <LocaleLink href="/fair-play">{t("footer.fair_play")}</LocaleLink>
          <LocaleLink href="/help">{t("footer.support")}</LocaleLink>
          <LocaleLink href="/help#terms">{t("legal.terms_link")}</LocaleLink>
        </nav>
        <p className={styles.copy}>{t("footer.copyright", { year: String(new Date().getFullYear()) })}</p>
      </div>
    </footer>
  );
}
