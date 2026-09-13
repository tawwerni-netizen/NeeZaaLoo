"use client";

import { LocaleLink } from "@/components/LocaleLink";
import { Button } from "@/components/Button";
import { useI18n } from "@/lib/i18n/context";
import styles from "./LearnTeaser.module.css";

export function LearnTeaser() {
  const { t, dir } = useI18n();
  const isRtl = dir === "rtl";

  return (
    <section className={styles.section} dir={isRtl ? "rtl" : "ltr"}>
      <div className={`nz-container ${styles.inner}`}>
        <div className={styles.copy}>
          <span className={styles.badge}>
            {isRtl ? "أدلة القواعد المعتمدة" : "SANCTIONED RULES"}
          </span>
          <h2 className={styles.heading}>{t("home.learn.heading")}</h2>
          <p className={styles.body}>{t("home.learn.body")}</p>
          <div className={styles.actions}>
            <LocaleLink href="/learn">
              <Button variant="secondary">{t("home.learn.cta")}</Button>
            </LocaleLink>
          </div>
        </div>

        <div className={styles.visualWrapper}>
          <picture style={{ width: "100%", height: "100%", display: "block" }}>
            <source srcSet="/images/banners/banner-certified-skill.webp" type="image/webp" />
            <img
              src="/images/banners/banner-certified-skill.jpg"
              alt="Nizalo Official Game Rules"
              className={styles.teaserImg}
              loading="lazy"
              decoding="async"
            />
          </picture>
          <div className={styles.imgOverlay} />
        </div>
      </div>
    </section>
  );
}
