"use client";

import { LocaleLink } from "@/components/LocaleLink";
import { Button } from "@/components/Button";
import { useI18n } from "@/lib/i18n/context";
import styles from "./LearnTeaser.module.css";

export function LearnTeaser() {
  const { t } = useI18n();
  return (
    <section className={styles.section}>
      <div className={`nz-container ${styles.inner}`}>
        <div>
          <h2 className={styles.heading}>{t("home.learn.heading")}</h2>
          <p className={styles.body}>{t("home.learn.body")}</p>
        </div>
        <LocaleLink href="/learn">
          <Button variant="secondary">{t("home.learn.cta")}</Button>
        </LocaleLink>
      </div>
    </section>
  );
}
