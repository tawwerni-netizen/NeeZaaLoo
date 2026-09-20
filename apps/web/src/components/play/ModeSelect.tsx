"use client";

/**
 * Step 1 of the pre-match flow, for every game: how do you want to play.
 * Exactly four, clearly separated modes -- VS COMPUTER, PLAY WITH FRIEND,
 * RANDOM OPPONENT, TOURNAMENT.
 * 
 * Re-architected with Cyber-Luxury tactile cards, live pulsing status badges,
 * custom glowing vector icons, and procedural Web Audio interaction sound effects.
 */
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import type { GamePlugin } from "@/lib/games";
import { playCardHoverSound, playModeSelectSound } from "@/lib/game-audio";
import styles from "./ModeSelect.module.css";

export type PlayMode = "VS_COMPUTER" | "FRIEND" | "RANDOM_OPPONENT";

export function ModeSelect({ plugin, gameId, onSelect }: {
  plugin: GamePlugin;
  gameId: string;
  onSelect: (mode: PlayMode) => void;
}) {
  const { t, dir } = useI18n();
  const isRtl = dir === "rtl";

  const handleSelect = (mode: PlayMode) => {
    try {
      playModeSelectSound();
    } catch {
      // Audio optional
    }
    onSelect(mode);
  };

  const handleHover = () => {
    try {
      playCardHoverSound();
    } catch {
      // Audio optional
    }
  };

  return (
    <div className={styles.container}>
      {/* Section Header */}
      <div className={styles.header}>
        <div className={styles.badge}>
          <span className={styles.pulseDot} />
          <span>{t("play.mode.select_badge")}</span>
        </div>
        <h2 className={styles.heading}>
          {t("play.mode.heading")}
        </h2>
        <p className={styles.subheading}>
          {t("play.mode.subheading")}
        </p>
      </div>

      {/* 4 Cyber-Tactile Luxury Mode Cards */}
      <div className={styles.grid}>
        {/* 1. VS COMPUTER */}
        {plugin.supportsAI && (
          <button
            type="button"
            className={`${styles.card} ${styles.cardAi}`}
            onClick={() => handleSelect("VS_COMPUTER")}
            onMouseEnter={handleHover}
          >
            <div className={styles.cardHeader}>
              <div className={`${styles.iconWrap} ${styles.iconAi}`}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <circle cx="12" cy="5" r="2" />
                  <path d="M12 7v4" />
                  <line x1="8" y1="16" x2="8" y2="16.01" />
                  <line x1="16" y1="16" x2="16.01" y2="16" />
                </svg>
              </div>
              <span className={`${styles.pillBadge} ${styles.pillAi}`}>
                {t("play.mode.vs_computer.badge")}
              </span>
            </div>

            <div className={styles.cardBody}>
              <h3 className={styles.cardTitle}>
                {t("play.mode.vs_computer.title")}
              </h3>
              <p className={styles.cardDescription}>
                {t("play.mode.vs_computer.description")}
              </p>
            </div>

            <div className={styles.cardFooter}>
              <span className={styles.footerTag}>
                <span className={styles.statusDot} />
                {t("play.mode.vs_computer.tag")}
              </span>
              <span className={styles.actionArrow}>
                {isRtl ? "←" : "→"}
              </span>
            </div>
          </button>
        )}

        {/* 2. PLAY WITH FRIEND */}
        <button
          type="button"
          className={`${styles.card} ${styles.cardFriend}`}
          onClick={() => handleSelect("FRIEND")}
          onMouseEnter={handleHover}
        >
          <div className={styles.cardHeader}>
            <div className={`${styles.iconWrap} ${styles.iconFriend}`}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <span className={`${styles.pillBadge} ${styles.pillFriend}`}>
              {t("play.mode.friend.badge")}
            </span>
          </div>

          <div className={styles.cardBody}>
            <h3 className={styles.cardTitle}>
              {t("play.mode.friend.title")}
            </h3>
            <p className={styles.cardDescription}>
              {t("play.mode.friend.description")}
            </p>
          </div>

          <div className={styles.cardFooter}>
            <span className={styles.footerTag}>
              <span className={styles.statusDot} />
              {t("play.mode.friend.tag")}
            </span>
            <span className={styles.actionArrow}>
              {isRtl ? "←" : "→"}
            </span>
          </div>
        </button>

        {/* 3. RANDOM OPPONENT / 1v1 DUEL */}
        <button
          type="button"
          className={`${styles.card} ${styles.cardMatch}`}
          onClick={() => handleSelect("RANDOM_OPPONENT")}
          onMouseEnter={handleHover}
        >
          <div className={styles.cardHeader}>
            <div className={`${styles.iconWrap} ${styles.iconMatch}`}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <span className={`${styles.pillBadge} ${styles.pillMatch}`}>
              {t("play.mode.random_opponent.badge")}
            </span>
          </div>

          <div className={styles.cardBody}>
            <h3 className={styles.cardTitle}>
              {t("play.mode.random_opponent.title")}
            </h3>
            <p className={styles.cardDescription}>
              {t("play.mode.random_opponent.description")}
            </p>
          </div>

          <div className={styles.cardFooter}>
            <span className={styles.footerTag}>
              <span className={styles.pulseDot} />
              {t("play.mode.random_opponent.tag")}
            </span>
            <span className={styles.actionArrow}>
              {isRtl ? "←" : "→"}
            </span>
          </div>
        </button>

        {/* 4. TOURNAMENT */}
        <LocaleLink
          href={`/tournaments?game=${gameId}`}
          className={`${styles.card} ${styles.cardTournament}`}
          onMouseEnter={handleHover}
          onClick={() => {
            try { playModeSelectSound(); } catch {}
          }}
        >
          <div className={styles.cardHeader}>
            <div className={`${styles.iconWrap} ${styles.iconTournament}`}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.45 1-1 1H7v4h10v-4h-2c-.55 0-1-.45-1-1v-2.34" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
            </div>
            <span className={`${styles.pillBadge} ${styles.pillTournament}`}>
              {t("play.mode.tournament.badge")}
            </span>
          </div>

          <div className={styles.cardBody}>
            <h3 className={styles.cardTitle}>
              {t("play.mode.tournament.title")}
            </h3>
            <p className={styles.cardDescription}>
              {t("play.mode.tournament.description")}
            </p>
          </div>

          <div className={styles.cardFooter}>
            <span className={styles.footerTag}>
              <span className={styles.statusDot} />
              {t("play.mode.tournament.tag")}
            </span>
            <span className={styles.actionArrow}>
              {isRtl ? "←" : "→"}
            </span>
          </div>
        </LocaleLink>
      </div>
    </div>
  );
}
