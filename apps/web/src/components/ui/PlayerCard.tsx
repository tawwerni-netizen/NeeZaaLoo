"use client";

import React, { type ReactNode } from "react";
import { RatingBadge } from "./RatingBadge";
import styles from "./PlayerCard.module.css";

export interface PlayerCardProps {
  nickname: string;
  avatarUrl?: string | null;
  countryCode?: string; // e.g. "SA", "US", "EG"
  rating?: number;
  active?: boolean;
  status?: "online" | "in-game" | "offline";
  pingMs?: number | null;
  reverse?: boolean;
  clockNode?: ReactNode;
  className?: string;
}

const FLAG_FALLBACK: Record<string, string> = {
  SA: "🇸🇦",
  AE: "🇦🇪",
  EG: "🇪🇬",
  KW: "🇰🇼",
  QA: "🇶🇦",
  US: "🇺🇸",
  GB: "🇬🇧",
  FR: "🇫🇷",
  DE: "🇩🇪",
  IN: "🇮🇳",
  CN: "🇨🇳",
  GLOBAL: "🌐",
};

export function PlayerCard({
  nickname,
  avatarUrl,
  countryCode = "GLOBAL",
  rating = 1500,
  active = false,
  status = "online",
  pingMs,
  reverse = false,
  clockNode,
  className,
}: PlayerCardProps) {
  const initial = (nickname || "?")[0]?.toUpperCase() || "?";
  const flagEmoji = FLAG_FALLBACK[countryCode.toUpperCase()] || "🌐";

  const statusClass =
    status === "online"
      ? styles.statusOnline
      : status === "in-game"
      ? styles.statusInGame
      : styles.statusOffline;

  return (
    <div
      className={[
        styles.card,
        reverse ? styles.reverse : "",
        active ? styles.active : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={styles.avatarWrapper}>
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={nickname} className={styles.avatarImg} />
        ) : (
          <div className={styles.avatarFallback}>{initial}</div>
        )}
        <span
          className={[styles.statusDot, statusClass].join(" ")}
          title={`Status: ${status}`}
        />
      </div>

      <div className={styles.info}>
        <div className={styles.nameRow}>
          <span className={styles.flag} aria-label={`Country: ${countryCode}`}>
            {flagEmoji}
          </span>
          <span className={styles.nickname} title={nickname}>
            {nickname}
          </span>
        </div>
        <div className={styles.metaRow}>
          <RatingBadge rating={rating} showTierName={false} />
          {pingMs !== undefined && pingMs !== null && (
            <span className={styles.ping}>{pingMs}ms</span>
          )}
        </div>
      </div>

      {clockNode && <div className={styles.clockSlot}>{clockNode}</div>}
    </div>
  );
}
