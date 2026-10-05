"use client";

/**
 * Step 1 of the pre-match flow, tailored specifically for each game:
 * How do you want to play?
 * Exactly four clearly separated modes -- VS COMPUTER, PLAY WITH FRIEND,
 * RANDOM OPPONENT, TOURNAMENT.
 * 
 * Re-architected with Game Theme Tokens:
 * 1. Bespoke game-specific titles, descriptions, and tags (no generic template feel).
 * 2. Cyber-Tactile luxury cards, live pulsing status badges, and glowing vector icons.
 * 3. Procedural Web Audio interaction sound effects.
 */
import { useMemo } from "react";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import type { GamePlugin } from "@/lib/games";
import { getGameThemeTokens } from "@/lib/games/theme-tokens";
import { playCardHoverSound, playModeSelectSound } from "@/lib/game-audio";
import styles from "./ModeSelect.module.css";

export type PlayMode = "VS_COMPUTER" | "FRIEND" | "RANDOM_OPPONENT";

export function ModeSelect({ plugin, gameId, onSelect }: {
  plugin: GamePlugin;
  gameId: string;
  onSelect: (mode: PlayMode) => void;
}) {
  const { t, locale, dir } = useI18n();
  const isRtl = dir === "rtl";
  const gameTokens = useMemo(() => getGameThemeTokens(gameId), [gameId]);

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
    <div
      className={styles.container}
      style={{
        "--game-accent": gameTokens.palette.accent,
        "--game-glow": gameTokens.palette.glow,
      } as React.CSSProperties}
    >
      {/* Section Header */}
      <div className={styles.header}>
        <div className={styles.badge} style={{ borderColor: gameTokens.palette.border }}>
          <span className={styles.pulseDot} style={{ background: gameTokens.palette.accent }} />
          <span>{gameTokens.persona[locale] || gameTokens.persona.en || t("play.mode.select_badge")}</span>
        </div>
        <h2 className={styles.heading}>
          {t("play.mode.heading")}
        </h2>
        <p className={styles.subheading}>
          {gameTokens.tagline[locale] || gameTokens.tagline.en || t("play.mode.subheading")}
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
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polygon points="12 8 13.5 11 17 11.5 14.5 14 15 17.5 12 16 9 17.5 9.5 14 7 11.5 10.5 11 12 8" />
                </svg>
              </div>
              <span className={`${styles.pillBadge} ${styles.pillAi}`}>
                {gameTokens.modes.ai.badge[locale] || gameTokens.modes.ai.badge.en || t("play.mode.vs_computer.badge")}
              </span>
            </div>

            <div className={styles.cardBody}>
              <h3 className={styles.cardTitle}>
                {gameTokens.modes.ai.title[locale] || gameTokens.modes.ai.title.en || t("play.mode.vs_computer.title")}
              </h3>
              <p className={styles.cardDescription}>
                {gameTokens.modes.ai.desc[locale] || gameTokens.modes.ai.desc.en || t("play.mode.vs_computer.description")}
              </p>
            </div>

            <div className={styles.cardFooter}>
              <span className={styles.footerTag}>
                <span className={styles.statusDot} />
                {gameTokens.modes.ai.tag[locale] || gameTokens.modes.ai.tag.en || t("play.mode.vs_computer.tag")}
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
              {gameTokens.modes.friend.badge[locale] || gameTokens.modes.friend.badge.en || t("play.mode.friend.badge")}
            </span>
          </div>

          <div className={styles.cardBody}>
            <h3 className={styles.cardTitle}>
              {gameTokens.modes.friend.title[locale] || gameTokens.modes.friend.title.en || t("play.mode.friend.title")}
            </h3>
            <p className={styles.cardDescription}>
              {gameTokens.modes.friend.desc[locale] || gameTokens.modes.friend.desc.en || t("play.mode.friend.description")}
            </p>
          </div>

          <div className={styles.cardFooter}>
            <span className={styles.footerTag}>
              <span className={styles.statusDot} />
              {gameTokens.modes.friend.tag[locale] || gameTokens.modes.friend.tag.en || t("play.mode.friend.tag")}
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
              {gameTokens.modes.match.badge[locale] || gameTokens.modes.match.badge.en || t("play.mode.random_opponent.badge")}
            </span>
          </div>

          <div className={styles.cardBody}>
            <h3 className={styles.cardTitle}>
              {gameTokens.modes.match.title[locale] || gameTokens.modes.match.title.en || t("play.mode.random_opponent.title")}
            </h3>
            <p className={styles.cardDescription}>
              {gameTokens.modes.match.desc[locale] || gameTokens.modes.match.desc.en || t("play.mode.random_opponent.description")}
            </p>
          </div>

          <div className={styles.cardFooter}>
            <span className={styles.footerTag}>
              <span className={styles.pulseDot} />
              {gameTokens.modes.match.tag[locale] || gameTokens.modes.match.tag.en || t("play.mode.random_opponent.tag")}
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
              {gameTokens.modes.tournament.badge[locale] || gameTokens.modes.tournament.badge.en || t("play.mode.tournament.badge")}
            </span>
          </div>

          <div className={styles.cardBody}>
            <h3 className={styles.cardTitle}>
              {gameTokens.modes.tournament.title[locale] || gameTokens.modes.tournament.title.en || t("play.mode.tournament.title")}
            </h3>
            <p className={styles.cardDescription}>
              {gameTokens.modes.tournament.desc[locale] || gameTokens.modes.tournament.desc.en || t("play.mode.tournament.description")}
            </p>
          </div>

          <div className={styles.cardFooter}>
            <span className={styles.footerTag}>
              <span className={styles.statusDot} />
              {gameTokens.modes.tournament.tag[locale] || gameTokens.modes.tournament.tag.en || t("play.mode.tournament.tag")}
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
