"use client";

/**
 * Three real, verifiable properties of this platform's own architecture --
 * not marketing language. Each point corresponds to something actually
 * true in packages/duel-engine (server-authoritative state), packages/
 * reconciliation (independent replay verification), and packages/fairplay
 * (no automated sanction on a single weak signal, human review required).
 */
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import styles from "./TrustFairPlaySection.module.css";

const POINTS = ["server", "verify", "human"] as const;

export function TrustFairPlaySection() {
  const { t } = useI18n();
  return (
    <section className={styles.section}>
      <div className="nz-container">
        <div className={styles.head}>
          <h2 className={styles.heading}>{t("home.trust.heading")}</h2>
          <p className={styles.body}>{t("home.trust.body")}</p>
        </div>

        <div className={styles.points}>
          {POINTS.map((key) => (
            <div key={key} className={styles.point}>
              <h3 className={styles.pointTitle}>{t(`home.trust.point_${key}`)}</h3>
              <p className={styles.pointBody}>{t(`home.trust.point_${key}_body`)}</p>
            </div>
          ))}
        </div>

        <LocaleLink href="/fair-play" className={styles.cta}>{t("home.trust.cta")}</LocaleLink>
      </div>
    </section>
  );
}
