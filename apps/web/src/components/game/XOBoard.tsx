"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n/context";
import { ease } from "@/lib/motion";
import { useVisualSettings } from "./TableEnvironment";
import { playPencilMarkSound, playFourInARowSound } from "@/lib/game-audio";
import styles from "./XOBoard.module.css";

const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

type Props = {
  board: number[]; // 9 cells. 0 empty, 1 = X (seat 0), -1 = O (seat 1).
  lastMove: number | null;
  legalCells: number[];
  mySeat: 0 | 1 | null;
  canMove: boolean;
  onMove: (cell: number) => void;
};

function winningLine(board: number[], cell: number | null): readonly [number, number, number] | null {
  if (cell === null) return null;
  const mark = board[cell];
  if (!mark) return null;
  for (const line of LINES) {
    if (line.includes(cell) && line.every((i) => board[i] === mark)) return line;
  }
  return null;
}

export function XOMarkSvg({ mark }: { mark: number }) {
  const isX = mark > 0;
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" className={styles.markSvg}>
      <defs>
        <linearGradient id="xo-x-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFA07A" />
          <stop offset="40%" stopColor="#FF5A2B" />
          <stop offset="100%" stopColor="#E11D48" />
        </linearGradient>
        <linearGradient id="xo-o-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#67E8F9" />
          <stop offset="40%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>
        <filter id="xo-glow-x" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4.5" result="blur1" />
          <feGaussianBlur stdDeviation="9" result="blur2" />
          <feMerge>
            <feMergeNode in="blur2" />
            <feMergeNode in="blur1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="xo-glow-o" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4.5" result="blur1" />
          <feGaussianBlur stdDeviation="9" result="blur2" />
          <feMerge>
            <feMergeNode in="blur2" />
            <feMergeNode in="blur1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {isX ? (
        <g filter="url(#xo-glow-x)">
          {/* Radiant Outer Neon Strokes */}
          <line x1="22" y1="22" x2="78" y2="78" stroke="url(#xo-x-grad)" strokeWidth="13" strokeLinecap="round" />
          <line x1="78" y1="22" x2="22" y2="78" stroke="url(#xo-x-grad)" strokeWidth="13" strokeLinecap="round" />
          {/* Pure Laser Core Highlight */}
          <line x1="22" y1="22" x2="78" y2="78" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" />
          <line x1="78" y1="22" x2="22" y2="78" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" />
        </g>
      ) : (
        <g filter="url(#xo-glow-o)">
          {/* Radiant Outer Neon Circle */}
          <circle cx="50" cy="50" r="28" fill="none" stroke="url(#xo-o-grad)" strokeWidth="12" />
          {/* Pure Laser Core Highlight */}
          <circle cx="50" cy="50" r="28" fill="none" stroke="#FFFFFF" strokeWidth="3.5" />
        </g>
      )}
    </svg>
  );
}

export function XOBoard({ board, lastMove, legalCells, mySeat, canMove, onMove }: Props) {
  const { t } = useI18n();
  const { perspective3D } = useVisualSettings();
  const [hoverCell, setHoverCell] = useState<number | null>(null);
  const winLine = useMemo(() => winningLine(board, lastMove), [board, lastMove]);
  const winSet = useMemo(() => new Set(winLine ?? []), [winLine]);

  useEffect(() => {
    if (winLine) {
      playFourInARowSound();
    }
  }, [winLine]);

  return (
    <div className={styles.wrap}>
      <div className={[styles.boardContainer, perspective3D ? styles.perspective : ""].join(" ")}>
        <div className={styles.chalkboardFrame} dir="ltr">
          <div className={styles.chalkGrid} role="grid" aria-label={t("game.move_history")}>
            {Array.from({ length: 9 }).map((_, cell) => {
              const mark = board[cell] ?? 0;
              const isLegal = legalCells.includes(cell);
              const isWinning = winSet.has(cell);
              const isNewest = lastMove === cell;
              const isHovered = hoverCell === cell;
              const isPreview = isHovered && isLegal && mark === 0;

              return (
                <button
                  key={cell}
                  type="button"
                  role="gridcell"
                  className={[
                    styles.cell,
                    isLegal && canMove ? styles.cellLegal : "",
                    isWinning ? styles.cellWinning : "",
                  ].join(" ")}
                  disabled={!canMove || !isLegal}
                  onClick={() => {
                    if (canMove && isLegal) {
                      playPencilMarkSound();
                      setHoverCell(null);
                      onMove(cell);
                    }
                  }}
                  onPointerEnter={(e) => {
                    if (e.pointerType !== "touch") setHoverCell(cell);
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType !== "touch") setHoverCell((c) => (c === cell ? null : c));
                  }}
                >
                  {mark !== 0 && (
                    <motion.div
                      className={styles.markWrap}
                      initial={isNewest ? { scale: 0.2, rotate: isNewest && mark > 0 ? -45 : 0, opacity: 0 } : false}
                      animate={{ scale: 1, rotate: 0, opacity: 1 }}
                      transition={isNewest ? { duration: 0.26, ease: ease.snap } : { duration: 0 }}
                    >
                      <XOMarkSvg mark={mark} />
                    </motion.div>
                  )}
                  {isPreview && mySeat !== null && (
                    <div className={styles.previewMarkWrap}>
                      <XOMarkSvg mark={mySeat === 0 ? 1 : -1} />
                    </div>
                  )}
                </button>
              );
            })}

            {/* Winning Laser Beam Overlay */}
            {winLine && (
              <svg className={styles.winOverlay} viewBox="0 0 300 300" aria-hidden="true">
                <defs>
                  <linearGradient id="laser-beam" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FFF" />
                    <stop offset="50%" stopColor="#FF5A2B" />
                    <stop offset="100%" stopColor="#FFE699" />
                  </linearGradient>
                </defs>
                <motion.line
                  {...lineCoordsFor(winLine)}
                  stroke="url(#laser-beam)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  filter="drop-shadow(0 0 12px #FF5A2B)"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.35, ease: ease.out }}
                />
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function lineCoordsFor(line: readonly [number, number, number]): { x1: number; y1: number; x2: number; y2: number } {
  const centre = (cell: number) => ({ x: (cell % 3) * 100 + 50, y: Math.floor(cell / 3) * 100 + 50 });
  const a = centre(line[0]);
  const b = centre(line[2]);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}
