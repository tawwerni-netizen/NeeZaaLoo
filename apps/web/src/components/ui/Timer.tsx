"use client";

import React, { useMemo } from "react";
import styles from "./Timer.module.css";

export interface TimerProps {
  remainingMs: number | null | undefined;
  active?: boolean;
  warningThresholdMs?: number; // default 10,000ms
  criticalThresholdMs?: number; // default 5,000ms
  className?: string;
  label?: string;
}

export function formatTime(ms: number): string {
  if (ms <= 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const mm = minutes.toString().padStart(2, "0");
  const ss = seconds.toString().padStart(2, "0");

  // Show tenths if under 10 seconds
  if (ms < 10000 && ms > 0) {
    const tenths = Math.floor((ms % 1000) / 100);
    return `${mm}:${ss}.${tenths}`;
  }

  return `${mm}:${ss}`;
}

export function Timer({
  remainingMs,
  active = false,
  warningThresholdMs = 10000,
  criticalThresholdMs = 5000,
  className,
  label = "Clock",
}: TimerProps) {
  const isAvailable = remainingMs !== null && remainingMs !== undefined;
  const timeStr = useMemo(
    () => (isAvailable ? formatTime(remainingMs) : "--:--"),
    [isAvailable, remainingMs]
  );

  const isCritical =
    active && isAvailable && remainingMs <= criticalThresholdMs && remainingMs > 0;
  const isWarning =
    active &&
    isAvailable &&
    !isCritical &&
    remainingMs <= warningThresholdMs &&
    remainingMs > 0;

  const stateClass = isCritical
    ? styles.critical
    : isWarning
    ? styles.warning
    : active
    ? styles.active
    : "";

  return (
    <div
      className={[styles.timerContainer, stateClass, className].filter(Boolean).join(" ")}
      role="timer"
      aria-label={`${label}: ${timeStr}`}
      aria-live={isCritical ? "assertive" : "off"}
    >
      <span className={styles.clockIcon} aria-hidden="true">
        ⏱️
      </span>
      <span className={styles.timeDisplay}>{timeStr}</span>
    </div>
  );
}
