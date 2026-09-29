"use client";

import React, { useEffect, useState } from "react";
import styles from "./MatchmakingCard.module.css";
import { Body, Caption, Num } from "./Typography";

export interface MatchmakingCardProps {
  gameTitle: string;
  mode?: string;
  stake?: {
    amount: number;
    currency: string;
  } | null;
  statusText?: string;
  rating?: number;
  initialElapsedSeconds?: number;
  onCancel: () => void;
  className?: string;
}

export function MatchmakingCard({
  gameTitle,
  mode = "Ranked 1v1",
  stake,
  statusText = "Searching for a worthy opponent...",
  rating,
  initialElapsedSeconds = 0,
  onCancel,
  className = "",
}: MatchmakingCardProps) {
  const [elapsed, setElapsed] = useState(initialElapsedSeconds);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatElapsed = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainingSecs = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${remainingSecs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={`${styles.container} ${className}`}
      role="region"
      aria-label={`Matchmaking for ${gameTitle}`}
      aria-live="polite"
    >
      <div className={styles.radar} aria-hidden="true">
        <div className={styles.radarRings} />
        <div className={styles.sweepLine} />
        <div className={styles.radarCenter} />
      </div>

      <h2 className={styles.title}>{gameTitle}</h2>

      <div className={styles.matchParams}>
        <span className={styles.paramBadge}>{mode}</span>
        {rating !== undefined && (
          <span className={styles.paramBadge}>Skill: {rating} ELO</span>
        )}
        {stake && stake.amount > 0 ? (
          <span className={styles.paramBadge}>
            Stake: {stake.amount} {stake.currency}
          </span>
        ) : (
          <span className={styles.paramBadge}>Free Practice</span>
        )}
      </div>

      <Body size="sm">{statusText}</Body>

      <div className={styles.timer} aria-label={`Time elapsed: ${formatElapsed(elapsed)}`}>
        {formatElapsed(elapsed)}
      </div>

      <button
        type="button"
        className={styles.cancelBtn}
        onClick={onCancel}
        aria-label="Cancel matchmaking"
      >
        Cancel Matchmaking
      </button>
    </div>
  );
}
