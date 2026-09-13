"use client";

/**
 * No app exists yet -- no store link, no QR code, no fabricated rating.
 * The badge says "Coming soon" honestly rather than the section pretending
 * a download is one tap away.
 */
import { useI18n } from "@/lib/i18n/context";
import styles from "./DownloadAppTeaser.module.css";

export function DownloadAppTeaser() {
  const { t } = useI18n();
  return (
    <section className={styles.section} id="download">
      <div className={`nz-container ${styles.inner}`}>
        <span className={styles.badge}>{t("home.download.badge")}</span>
        <h2 className={styles.heading}>{t("home.download.heading")}</h2>
        <p className={styles.body}>{t("home.download.body")}</p>
      </div>
    </section>
  );
}
