"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n/context";
import { ease } from "@/lib/motion";
import { useVisualSettings } from "./TableEnvironment";
import styles from "./GomokuBoard.module.css";

const SIZE = 15;
const STAR_POINTS = [3, 7, 11].flatMap((r) => [3, 7, 11].map((c) => r * SIZE + c));
const AXES: readonly (readonly [number, number])[] = [[0, 1], [1, 0], [1, 1], [1, -1]];

function winningLine(board: number[], lastMove: number | null): number[] | null {
  if (lastMove === null) return null;
  const mark = board[lastMove];
  if (!mark) return null;
  const row0 = Math.floor(lastMove / SIZE), col0 = lastMove % SIZE;
  for (const [dr, dc] of AXES) {
    const cells = [lastMove];
    let r = row0 + dr, c = col0 + dc;
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === mark) {
      cells.push(r * SIZE + c);
      r += dr; c += dc;
    }
    r = row0 - dr; c = col0 - dc;
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === mark) {
      cells.unshift(r * SIZE + c);
      r -= dr; c -= dc;
    }
    if (cells.length >= 5) return cells;
  }
  return null;
}

type Props = {
  board: number[]; // 225 cells. 0 empty, 1 = seat0, -1 = seat1.
  lastMove: number | null;
  legalCells: number[];
  mySeat: 0 | 1 | null;
  canMove: boolean;
  onMove: (cell: number) => void;
};

export function GomokuStoneSvg({ isBlack }: { isBlack: boolean }) {
  const gradId = isBlack ? "gom-slate-grad" : "gom-shell-grad";
  const strokeColor = isBlack ? "#0d0e12" : "#8a7e6d";

  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" className={styles.stoneSvg}>
      <defs>
        <radialGradient id="gom-slate-grad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#3d434f" />
          <stop offset="45%" stopColor="#1e222a" />
          <stop offset="85%" stopColor="#0d0f12" />
          <stop offset="100%" stopColor="#040506" />
        </radialGradient>
        <radialGradient id="gom-shell-grad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="45%" stopColor="#F7F3E9" />
          <stop offset="85%" stopColor="#D9CEBC" />
          <stop offset="100%" stopColor="#A89A84" />
        </radialGradient>
        <radialGradient id="gom-specular" cx="30%" cy="25%" r="45%">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.6)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>

      <circle cx="50" cy="50" r="46" fill={`url(#${gradId})`} stroke={strokeColor} strokeWidth="2.5" />
      <circle cx="50" cy="50" r="44" fill="url(#gom-specular)" />
    </svg>
  );
}

export function GomokuBoard({ board, lastMove, legalCells, mySeat, canMove, onMove }: Props) {
  const { t } = useI18n();
  const { perspective3D } = useVisualSettings();
  const [hoverCell, setHoverCell] = useState<number | null>(null);
  const legalSet = useMemo(() => new Set(legalCells), [legalCells]);
  const winLine = useMemo(() => winningLine(board, lastMove), [board, lastMove]);
  const winSet = useMemo(() => new Set(winLine ?? []), [winLine]);

  return (
    <div className={styles.wrap}>
      <div className={[styles.boardContainer, perspective3D ? styles.perspective : ""].join(" ")}>
        <div className={styles.kayaWoodTable}>
          <div className={styles.board} dir="ltr" role="grid" aria-label={t("game.move_history")}>
            {/* Grid Line Network */}
            <svg className={styles.gridLines} viewBox="0 0 15 15" preserveAspectRatio="none" aria-hidden="true">
              {Array.from({ length: SIZE }).map((_, i) => (
                <line key={`h${i}`} x1={0.5} y1={i + 0.5} x2={14.5} y2={i + 0.5} stroke="#38210f" strokeWidth="0.08" />
              ))}
              {Array.from({ length: SIZE }).map((_, i) => (
                <line key={`v${i}`} x1={i + 0.5} y1={0.5} x2={i + 0.5} y2={14.5} stroke="#38210f" strokeWidth="0.08" />
              ))}
            </svg>

            {/* Brass Hoshi Star Points */}
            {STAR_POINTS.map((idx) => (
              <span
                key={`star-${idx}`}
                className={styles.starPoint}
                style={{ left: `${((idx % SIZE) + 0.5) * (100 / SIZE)}%`, top: `${(Math.floor(idx / SIZE) + 0.5) * (100 / SIZE)}%` }}
                aria-hidden="true"
              />
            ))}

            {/* 5-in-a-row Victory Ray */}
            {winLine && winLine.length > 0 && (
              <svg className={styles.winOverlay} viewBox="0 0 15 15" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="gomoku-win-gold" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FFF" />
                    <stop offset="50%" stopColor="#FF5A2B" />
                    <stop offset="100%" stopColor="#F6D365" />
                  </linearGradient>
                </defs>
                <motion.line
                  x1={(winLine[0]! % SIZE) + 0.5}
                  y1={Math.floor(winLine[0]! / SIZE) + 0.5}
                  x2={(winLine[winLine.length - 1]! % SIZE) + 0.5}
                  y2={Math.floor(winLine[winLine.length - 1]! / SIZE) + 0.5}
                  stroke="url(#gomoku-win-gold)"
                  strokeWidth="0.35"
                  strokeLinecap="round"
                  filter="drop-shadow(0 0 4px #FF5A2B)"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.4, ease: ease.out }}
                />
              </svg>
            )}

            {board.map((mark, cell) => {
              const isLegal = legalSet.has(cell);
              const isNewest = lastMove === cell;
              const isWinning = winSet.has(cell);
              const isPreview = hoverCell === cell && mark === 0 && isLegal;
              const col = cell % SIZE, row = Math.floor(cell / SIZE);

              return (
                <button
                  key={cell}
                  type="button"
                  role="gridcell"
                  aria-label={`${t("game.move_history")} ${cell}`}
                  className={[styles.cell, isWinning ? styles.winningCell : ""].join(" ")}
                  style={{ left: `${((col + 0.5) * 100) / SIZE}%`, top: `${((row + 0.5) * 100) / SIZE}%` }}
                  disabled={!canMove || !isLegal}
                  onClick={() => {
                    if (canMove && isLegal) {
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
                      className={[styles.stoneWrap, isWinning ? styles.winningStone : ""].join(" ")}
                      initial={isNewest ? { scale: 0.2, opacity: 0 } : false}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={isNewest ? { duration: 0.2, ease: ease.snap } : { duration: 0 }}
                    >
                      <GomokuStoneSvg isBlack={mark > 0} />
                    </motion.div>
                  )}
                  {isPreview && mySeat !== null && (
                    <div className={styles.previewStoneWrap}>
                      <GomokuStoneSvg isBlack={mySeat === 0} />
                    </div>
                  )}
                  {isNewest && mark !== 0 && <span className={styles.lastMoveRing} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
