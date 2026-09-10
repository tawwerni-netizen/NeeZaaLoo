"use client";

/**
 * Step 1 of the pre-match flow, for every game: how do you want to play.
 * Exactly four, clearly separated modes -- VS COMPUTER, PLAY WITH FRIEND,
 * RANDOM OPPONENT, TOURNAMENT -- never a fifth "competitive" card standing
 * in for one of them. Reads ONLY the plugin's own declared capabilities
 * (supportsAI) to decide which cards are offered -- never a gameId switch.
 * TOURNAMENT deliberately never opens an inline flow here: the tournament
 * engine is its own, already-complete system (packages/tournament), so
 * this card is a link into the existing tournaments surface, not a
 * duplicate of it.
 */
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import type { GamePlugin } from "@/lib/games";
import styles from "./ModeSelect.module.css";

export type PlayMode = "VS_COMPUTER" | "FRIEND" | "RANDOM_OPPONENT";

export function ModeSelect({ plugin, gameId, onSelect }: {
  plugin: GamePlugin;
  gameId: string;
  onSelect: (mode: PlayMode) => void;
}) {
  const { t } = useI18n();

  return (
    <div>
      <h1 className={styles.heading}>{t("play.mode.heading")}</h1>
      <div className={styles.grid}>
        {plugin.supportsAI && (
          <button className={styles.card} onClick={() => onSelect("VS_COMPUTER")}>
            <span className={styles.cardTitle}>{t("play.mode.vs_computer.title")}</span>
            <span className={styles.cardDescription}>{t("play.mode.vs_computer.description")}</span>
          </button>
        )}
        <button className={styles.card} onClick={() => onSelect("FRIEND")}>
          <span className={styles.cardTitle}>{t("play.mode.friend.title")}</span>
          <span className={styles.cardDescription}>{t("play.mode.friend.description")}</span>
        </button>
        <button className={styles.card} onClick={() => onSelect("RANDOM_OPPONENT")}>
          <span className={styles.cardTitle}>{t("play.mode.random_opponent.title")}</span>
          <span className={styles.cardDescription}>{t("play.mode.random_opponent.description")}</span>
        </button>
        <LocaleLink href={`/tournaments?game=${gameId}`} className={styles.card}>
          <span className={styles.cardTitle}>{t("play.mode.tournament.title")}</span>
          <span className={styles.cardDescription}>{t("play.mode.tournament.description")}</span>
        </LocaleLink>
      </div>
    </div>
  );
}
