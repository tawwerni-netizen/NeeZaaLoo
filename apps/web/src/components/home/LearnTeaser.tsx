"use client";

import { LocaleLink } from "@/components/LocaleLink";
import { Button } from "@/components/Button";
import { useI18n } from "@/lib/i18n/context";
import styles from "./LearnTeaser.module.css";

const BADGE_I18N: Record<string, string> = {
  ar: "أدلة القواعد المعتمدة",
  en: "SANCTIONED RULES",
  es: "REGLAS OFICIALES",
  fr: "RÈGLES OFFICIELLES",
  hi: "आधिकारिक नियम",
  zh: "官方认证规则",
};

const ALT_I18N: Record<string, string> = {
  ar: "قواعد ألعاب نيزالو الرسمية",
  en: "Nizalo Official Game Rules",
  es: "Reglas Oficiales de Juegos de Nizalo",
  fr: "Règles Officielles des Jeux Nizalo",
  hi: "निज़ालो आधिकारिक खेल नियम",
  zh: "Nizalo 官方游戏规则指南",
};

export function LearnTeaser() {
  const { t, dir, locale } = useI18n();
  const isRtl = dir === "rtl";

  const badgeText = BADGE_I18N[locale] || BADGE_I18N.en;
  const altText = ALT_I18N[locale] || ALT_I18N.en;

  return (
    <section className={styles.section} dir={isRtl ? "rtl" : "ltr"}>
      <div className={`nz-container ${styles.inner}`}>
        <div className={styles.copy}>
          <span className={styles.badge}>
            {badgeText}
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
              alt={altText}
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
