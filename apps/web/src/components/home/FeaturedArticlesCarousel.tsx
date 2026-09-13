"use client";

import React from "react";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import { EDITORIAL_ARTICLES_MAP } from "@/lib/editorial/articles-map";
import styles from "./FeaturedArticlesCarousel.module.css";

export const FeaturedArticlesCarousel: React.FC = () => {
  const { t, locale } = useI18n();
  // Filter for pillar articles
  const articles = EDITORIAL_ARTICLES_MAP.filter((a) => a.type === "PILLAR").slice(0, 8);

  return (
    <div className={styles.carousel} aria-label="Featured Articles">
      {articles.map((article) => {
        const title =
          locale === "ar" && article.titleAr
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
              <span className={styles.badge}>{article.type}</span>
              <h3 className={styles.title}>{title}</h3>
            </div>
            <span className={styles.readButton}>
              {t("nav.learn") || "Read Guide"} →
            </span>
          </LocaleLink>
        );
      })}
    </div>
  );
};
