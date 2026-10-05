"use client";

/**
 * Four real platform features, one compact grid -- Global Rank, Your
 * Mastery, Daily Challenge, Friend Challenge. Each names a real, working
 * feature (packages/rating's Global Skill Score, packages/mastery,
 * packages/engagement's daily challenges, the friend-challenge flow in
 * packages/matchmaking) and links to where it actually lives. Deliberately
 * ONE section rather than four near-identical full-width ones: four stacked
 * "heading / paragraph / button" blocks would read as the exact repetition
 * the redesign brief asks to avoid.
 */
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import styles from "./FeatureGrid.module.css";

const ITEMS = [
  { key: "rank", href: "/rank", glyph: "📈" },
  { key: "mastery", href: "/profile", glyph: "🎖️" },
  { key: "dailyChallenge", href: "/home", glyph: "🎯" },
  { key: "friendChallenge", href: "/play", glyph: "⚔️" },
] as const;

export function FeatureGrid() {
  const { t } = useI18n();
  return (
    <section className={styles.section}>
      <div className={`nz-container ${styles.grid}`}>
        {ITEMS.map((item) => (
          <LocaleLink key={item.key} href={item.href} className={styles.card}>
            <span className={styles.glyph} aria-hidden="true">{item.glyph}</span>
            <h3 className={styles.title}>{t(`home.${item.key}.heading`)}</h3>
            <p className={styles.body}>{t(`home.${item.key}.body`)}</p>
            <span className={styles.cta}>{t(`home.${item.key}.cta`)}</span>
          </LocaleLink>
        ))}
      </div>
    </section>
  );
}
