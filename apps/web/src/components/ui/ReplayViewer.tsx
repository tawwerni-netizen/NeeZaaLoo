"use client";

import React, { useState, useEffect } from "react";
import styles from "./ReplayViewer.module.css";

export interface ReplayMove {
  index: number;
  notation: string;
  player: string;
  timestamp?: number;
}

export interface ReplayViewerProps {
  moves: ReplayMove[];
  currentMoveIndex: number;
  onSelectMove: (index: number) => void;
  className?: string;
}

export function ReplayViewer({
  moves,
  currentMoveIndex,
  onSelectMove,
  className,
}: ReplayViewerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const totalMoves = moves.length;

  useEffect(() => {
    if (!isPlaying) return;
    if (currentMoveIndex >= totalMoves - 1) {
      setIsPlaying(false);
      return;
    }
    const interval = setInterval(() => {
      onSelectMove(currentMoveIndex + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, currentMoveIndex, totalMoves, onSelectMove]);

  const handleFirst = () => onSelectMove(0);
  const handlePrev = () => onSelectMove(Math.max(0, currentMoveIndex - 1));
  const handleNext = () => onSelectMove(Math.min(totalMoves - 1, currentMoveIndex + 1));
  const handleLast = () => onSelectMove(totalMoves - 1);
  const togglePlay = () => setIsPlaying((p) => !p);

  return (
    <div
      className={[styles.container, className].filter(Boolean).join(" ")}
      role="region"
      aria-label="Replay Controls"
    >
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.controlBtn}
          onClick={handleFirst}
          disabled={currentMoveIndex <= 0}
          aria-label="First move"
        >
          ⏮
        </button>
        <button
          type="button"
          className={styles.controlBtn}
          onClick={handlePrev}
          disabled={currentMoveIndex <= 0}
          aria-label="Previous move"
        >
          ◀
        </button>
        <button
          type="button"
          className={[styles.controlBtn, styles.playPauseBtn].join(" ")}
          onClick={togglePlay}
          disabled={totalMoves === 0}
          aria-label={isPlaying ? "Pause replay" : "Play replay"}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <button
          type="button"
          className={styles.controlBtn}
          onClick={handleNext}
          disabled={currentMoveIndex >= totalMoves - 1}
          aria-label="Next move"
        >
          ▶
        </button>
        <button
          type="button"
          className={styles.controlBtn}
          onClick={handleLast}
          disabled={currentMoveIndex >= totalMoves - 1}
          aria-label="Last move"
        >
          ⏭
        </button>
        <span className={styles.stepIndicator}>
          {totalMoves > 0 ? `${currentMoveIndex + 1} / ${totalMoves}` : "0 / 0"}
        </span>
      </div>

      <div className={styles.moveList}>
        {moves.map((m, idx) => (
          <button
            key={m.index}
            type="button"
            className={[
              styles.moveItem,
              idx === currentMoveIndex ? styles.moveActive : "",
            ].join(" ")}
            onClick={() => onSelectMove(idx)}
          >
            <span className={styles.moveNumber}>{idx + 1}.</span>
            <span className={styles.moveNotation}>{m.notation}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
