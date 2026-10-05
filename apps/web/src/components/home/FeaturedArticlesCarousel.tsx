"use client";

import React from "react";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import { EDITORIAL_ARTICLES_MAP } from "@/lib/editorial/articles-map";
import styles from "./FeaturedArticlesCarousel.module.css";

const BADGE_I18N: Record<string, string> = {
  ar: "دليل شامل",
  en: "GUIDE",
  es: "GUÍA",
  fr: "GUIDE",
  hi: "गाइड",
  zh: "攻略指南",
};

const READ_BUTTON_I18N: Record<string, string> = {
  ar: "قراءة الدليل ←",
  en: "Read Guide →",
  es: "Leer guía →",
  fr: "Lire le guide →",
  hi: "गाइड पढ़ें →",
  zh: "阅读攻略 →",
};

export const FeaturedArticlesCarousel: React.FC = () => {
  const { locale, dir } = useI18n();
  const isRtl = dir === "rtl" || locale === "ar";
  // Filter for pillar articles
  const articles = EDITORIAL_ARTICLES_MAP.filter((a) => a.type === "PILLAR").slice(0, 8);

  const badgeText = BADGE_I18N[locale] || BADGE_I18N.en;
  const readText = READ_BUTTON_I18N[locale] || READ_BUTTON_I18N.en;

  return (
    <div className={styles.carousel} aria-label="Featured Articles">
      {articles.map((article) => {
        const title =
          isRtl && article.titleAr
            ? article.titleAr
            : article.title;
        const slug = article.slug;

        return (
          <LocaleLink
            href={`/learn/${slug}`}
            key={article.id}
            className={styles.card}
          >
            <div className={styles.info}>
              <span className={styles.badge}>{badgeText}</span>
              <h3 className={styles.title}>{title}</h3>
            </div>
            <span className={styles.readButton}>
              {readText}
            </span>
          </LocaleLink>
        );
      })}
    </div>
  );
};
