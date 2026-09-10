"use client";

/**
 * A real, public, crawlable page -- no RequireAuth. Content reuses the
 * SAME per-game descriptions the homepage's 10-games grid already shows
 * (home.games.<nameKey>.description) rather than a second, divergent copy
 * of the same facts, and the catalogue itself comes from listGames(), so a
 * game this build doesn't register can never appear here as a dead link.
 */
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import { listGames } from "@/lib/games";
import styles from "./learn.module.css";

export default function LearnPage() {
  const { t } = useI18n();
  const games = listGames();

  return (
    <>
      <Header />
      <main className="nz-container">
        <header className={styles.head}>
          <h1 className={styles.heading}>{t("learnPage.heading")}</h1>
          <p className={styles.subhead}>{t("learnPage.subhead")}</p>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>{t("learnPage.how_heading")}</h2>
          <p className={styles.sectionBody}>{t("learnPage.how_body")}</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>{t("learnPage.games_heading")}</h2>
          <p className={styles.sectionBody}>{t("learnPage.games_body")}</p>
          <div className={styles.grid}>
            {games.map((game) => {
              const name = t(`common.game_names.${game.nameKey}`);
              return (
                <LocaleLink key={game.id} href={`/play/${game.id}`} className={styles.card}>
                  <h3 className={styles.cardTitle}>{name}</h3>
                  <p className={styles.cardBody}>{t(`home.games.${game.nameKey}.description`)}</p>
                  <span className={styles.cardCta}>{t("learnPage.cta_play", { name })}</span>
                </LocaleLink>
              );
            })}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>{t("learnPage.fair_heading")}</h2>
          <p className={styles.sectionBody}>{t("learnPage.fair_body")}</p>
          <LocaleLink href="/fair-play" className={styles.link}>{t("learnPage.fair_cta")}</LocaleLink>
        </section>
      </main>
      <Footer />
    </>
  );
}
