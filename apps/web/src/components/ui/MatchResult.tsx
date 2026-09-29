"use client";

import React from "react";
import styles from "./MatchResult.module.css";

export type MatchOutcome = "win" | "loss" | "draw";

export interface MatchResultProps {
  outcome: MatchOutcome;
  reason?: string;
  ratingDelta?: number;
  newRating?: number;
  prizeAmountUsdt?: number;
  onRematch?: () => void;
  rematchBusy?: boolean;
  onReplay?: () => void;
  onLobby?: () => void;
  className?: string;
}

export function MatchResult({
  outcome,
  reason = "Standard conclusion",
  ratingDelta,
  newRating,
  prizeAmountUsdt,
  onRematch,
  rematchBusy = false,
  onReplay,
  onLobby,
  className,
}: MatchResultProps) {
  const isWin = outcome === "win";
  const isLoss = outcome === "loss";

  const bannerClass = isWin
    ? styles.bannerWin
    : isLoss
    ? styles.bannerLoss
    : styles.bannerDraw;

  const titleText = isWin ? "VICTORY" : isLoss ? "DEFEAT" : "DRAW";
  const titleClass = isWin
    ? styles.winText
    : isLoss
    ? styles.lossText
    : styles.drawText;

  const icon = isWin ? "🏆" : isLoss ? "⚔️" : "🤝";

  return (
    <div
      className={[styles.container, bannerClass, className].filter(Boolean).join(" ")}
      role="region"
      aria-label={`Match Result: ${titleText}`}
    >
      <div className={styles.trophyIcon} aria-hidden="true">
        {icon}
      </div>
      <h2 className={[styles.title, titleClass].join(" ")}>{titleText}</h2>
      <p className={styles.reason}>{reason}</p>

      <div className={styles.statsGrid}>
        {ratingDelta !== undefined && (
          <div className={styles.statBox}>
            <span className={styles.statLabel}>Rating Delta</span>
            <span className={styles.statValue}>
              {ratingDelta > 0 ? `+${ratingDelta}` : ratingDelta} ELO
            </span>
          </div>
        )}

        {newRating !== undefined && (
          <div className={styles.statBox}>
            <span className={styles.statLabel}>New Rating</span>
            <span className={styles.statValue}>{newRating}</span>
          </div>
        )}

        {prizeAmountUsdt !== undefined && prizeAmountUsdt > 0 && (
          <div className={styles.statBox} style={{ gridColumn: "1 / -1" }}>
            <span className={styles.statLabel}>Prize Credited</span>
            <span className={styles.statValue} style={{ color: "var(--nz-win)" }}>
              +${prizeAmountUsdt.toFixed(2)} USDT
            </span>
          </div>
        )}
      </div>

      <div className={styles.actions}>
        {onRematch && (
          <button
            type="button"
            className={styles.rematchBtn}
            onClick={onRematch}
            disabled={rematchBusy}
          >
            {rematchBusy ? "Sending Challenge..." : "⚔️ Rematch"}
          </button>
        )}
        <div className={styles.secondaryRow}>
          {onReplay && (
            <button type="button" className={styles.secondaryBtn} onClick={onReplay}>
              📼 Review Match
            </button>
          )}
          {onLobby && (
            <button type="button" className={styles.secondaryBtn} onClick={onLobby}>
              🏠 Exit to Lobby
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
