"use client";

import React from "react";
import { LocaleLink } from "@/components/LocaleLink";
import { GameThumbnail } from "@/components/game/GameThumbnail";
import { getGame } from "@/lib/games";
import { useI18n } from "@/lib/i18n/context";
import styles from "./HomeGameCard.module.css";

type HomeGameCardProps = {
  gameId: string;
};

export const HomeGameCard: React.FC<HomeGameCardProps> = ({ gameId }) => {
  const game = getGame(gameId);
  const { t } = useI18n();
  if (!game) return null;

  const titleKey = game.nameKey;
  const title = t(`common.game_names.${titleKey}`);
  const tagline = t(`common.game_taglines.${titleKey}`);

  const badgeInfo = [
    { label: t("common.turn_model"), value: t(`common.turn_model_${game.turnModel}`) },
    { label: t("common.cash_enabled"), value: game.cashEnabled ? t("common.yes") : t("common.no") },
  ];

  return (
    <div className={styles.card}>
      <LocaleLink href={`/games/${gameId}`} className={styles.link}>
        <GameThumbnail gameId={gameId} />
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.tagline}>{tagline}</p>
        <div className={styles.badgeRow}>
          {badgeInfo.map((b) => (
            <span key={b.label} className={styles.badge}>
              {b.label}: {b.value}
            </span>
          ))}
        </div>
        <button type="button" className={styles.playButton}>
          {t("dashboard.play_now")}
        </button>
      </LocaleLink>
    </div>
  );
};
