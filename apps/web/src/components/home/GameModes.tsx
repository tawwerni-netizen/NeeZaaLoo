"use client";

/**
 * The two live games. Per the phase instructions: future-ready placeholders
 * may exist ARCHITECTURALLY, but nothing unfinished is advertised as
 * playable here -- only Chess and Speed Math get a card with a working
 * "Play" action.
 */
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import styles from "./GameModes.module.css";

const GAME_IDS = ["chess", "speed_math"] as const;
const GAME_ROUTE_ID: Record<(typeof GAME_IDS)[number], string> = { chess: "chess", speed_math: "speed-math" };

export function GameModes() {
  const { t } = useI18n();

  return (
    <section className={styles.section}>
      <div className="nz-container">
        <h2 className={styles.heading}>{t("home.games.heading")}</h2>
        <div className={styles.grid}>
          {GAME_IDS.map((id) => {
            const name = t(`common.game_names.${id}`);
            return (
              <div key={id} className={styles.card}>
                <h3 className={styles.cardTitle}>{name}</h3>
                <p className={styles.cardDescription}>{t(`home.games.${id}.description`)}</p>
                <dl className={styles.meta}>
                  <div>
                    <dt>{t("home.games.duration_label")}</dt>
                    <dd>{t(`home.games.${id}.duration`)}</dd>
                  </div>
                  <div>
                    <dt>{t("home.games.mode_label")}</dt>
                    <dd>{t(`home.games.${id}.mode`)}</dd>
                  </div>
                </dl>
                <LocaleLink href={`/play/${GAME_ROUTE_ID[id]}`}>
                  <Button variant="secondary" className={styles.cardAction}>
                    {t("home.games.play_cta", { name })}
                  </Button>
                </LocaleLink>
              </div>
            );
          })}
          <div className={styles.comingSoon}>
            <h3 className={styles.cardTitle}>{t("home.games.coming_soon.title")}</h3>
            <p className={styles.cardDescription}>{t("home.games.coming_soon.body")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
