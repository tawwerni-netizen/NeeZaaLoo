"use client";

import React from "react";
import Link from "next/link";
import styles from "./TournamentCard.module.css";

export type TournamentStatus = "REGISTERING" | "LIVE" | "COMPLETED";

export interface TournamentCardProps {
  id: string;
  title: string;
  gameSlug: string;
  gameName: string;
  gameIcon: string;
  status: TournamentStatus;
  entryFeeUsdt: number;
  prizePoolUsdt: number;
  registeredCount: number;
  maxParticipants: number;
  startsAt?: string;
  locale?: string;
  className?: string;
}

export function TournamentCard({
  id,
  title,
  gameName,
  gameIcon,
  status,
  entryFeeUsdt,
  prizePoolUsdt,
  registeredCount,
  maxParticipants,
  startsAt,
  locale = "en",
  className,
}: TournamentCardProps) {
  const isRegistering = status === "REGISTERING";
  const isLive = status === "LIVE";
  const progressPercent = Math.min(100, Math.round((registeredCount / maxParticipants) * 100));

  const statusClass = isRegistering
    ? styles.statusRegistering
    : isLive
    ? styles.statusLive
    : styles.statusCompleted;

  const statusLabel = isRegistering
    ? "Registration Open"
    : isLive
    ? "LIVE"
    : "Finished";

  return (
    <article
      className={[styles.card, className].filter(Boolean).join(" ")}
      aria-labelledby={`tournament-title-${id}`}
    >
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <span className={styles.gameIcon} aria-hidden="true">
            {gameIcon}
          </span>
          <div>
            <h3 id={`tournament-title-${id}`} className={styles.title}>
              {title}
            </h3>
            <p className={styles.gameName}>{gameName}</p>
          </div>
        </div>
        <span className={[styles.statusBadge, statusClass].join(" ")}>
          {statusLabel}
        </span>
      </div>

      <div className={styles.metricsGrid}>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Guaranteed Prize</span>
          <span className={[styles.metricValue, styles.prizeValue].join(" ")}>
            ${prizePoolUsdt.toLocaleString()} USDT
          </span>
        </div>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Entry Fee</span>
          <span className={styles.metricValue}>
            {entryFeeUsdt === 0 ? "Free Entry" : `$${entryFeeUsdt} USDT`}
          </span>
        </div>
      </div>

      <div className={styles.progressArea}>
        <div className={styles.progressLabelRow}>
          <span>Brackets</span>
          <span>
            {registeredCount} / {maxParticipants} Players
          </span>
        </div>
        <div className={styles.progressBarBg}>
          <div
            className={styles.progressBarFill}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <Link
        href={`/${locale}/tournaments/${id}`}
        className={styles.actionBtn}
      >
        {isRegistering ? "Join Tournament" : isLive ? "Spectate Live" : "View Bracket"}
      </Link>
    </article>
  );
}
