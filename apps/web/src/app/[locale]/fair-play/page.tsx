"use client";

/**
 * Public, crawlable, no RequireAuth. Every claim here is a real, verifiable
 * property of this codebase's own architecture (packages/duel-engine's
 * client/server message asymmetry, packages/reconciliation's replay
 * verification, packages/fairplay's human-review requirement) -- nothing
 * on this page is aspirational copy.
 */
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import styles from "./fair-play.module.css";

export default function FairPlayPage() {
  const { t } = useI18n();
  return (
    <>
      <Header />
      <main className="nz-container">
        <header className={styles.head}>
          <h1 className={styles.heading}>{t("fairPlayPage.heading")}</h1>
          <p className={styles.subhead}>{t("fairPlayPage.subhead")}</p>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>{t("fairPlayPage.server_heading")}</h2>
          <p className={styles.sectionBody}>{t("fairPlayPage.server_body")}</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>{t("fairPlayPage.verify_heading")}</h2>
          <p className={styles.sectionBody}>{t("fairPlayPage.verify_body")}</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>{t("fairPlayPage.review_heading")}</h2>
          <p className={styles.sectionBody}>{t("fairPlayPage.review_body")}</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>{t("fairPlayPage.eligibility_heading")}</h2>
          <p className={styles.sectionBody}>{t("fairPlayPage.eligibility_body")}</p>
        </section>

        <LocaleLink href="/support" className={styles.link}>{t("fairPlayPage.contact_cta")}</LocaleLink>
      </main>
      <Footer />
    </>
  );
}
