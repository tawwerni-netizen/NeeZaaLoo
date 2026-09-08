"use client";

/**
 * The core ethical loop, stated plainly: TRY -> COMPETE -> IMPROVE -> CLIMB
 * -> WIN. Numbered steps here encode something real -- an actual sequence
 * a player moves through -- not a decorative device.
 */
import { useI18n } from "@/lib/i18n/context";
import styles from "./HowItWorks.module.css";

const STEPS = [
  { n: "01", key: "try" },
  { n: "02", key: "compete" },
  { n: "03", key: "improve" },
  { n: "04", key: "climb" },
  { n: "05", key: "win" },
] as const;

export function HowItWorks() {
  const { t } = useI18n();
  return (
    <section className={styles.section}>
      <div className="nz-container">
        <h2 className={styles.heading}>{t("home.how.heading")}</h2>
        <ol className={styles.steps}>
          {STEPS.map((step) => (
            <li key={step.n} className={styles.step}>
              <span className={styles.number}>{step.n}</span>
              <h3 className={styles.stepTitle}>{t(`home.how.steps.${step.key}.title`)}</h3>
              <p className={styles.stepBody}>{t(`home.how.steps.${step.key}.body`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
