"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n/context";
import { ease } from "@/lib/motion";
import { useVisualSettings } from "./TableEnvironment";
import styles from "./ConnectFourBoard.module.css";

const COLS = 7, ROWS = 6;

type Props = {
  board: number[][]; // 6 rows (row 0 = bottom) x 7 cols. 0 empty, 1 seat0, -1 seat1.
  turn: 0 | 1;
  lastMove: { row: number; col: number } | null;
  legalColumns: number[];
  mySeat: 0 | 1 | null;
  canMove: boolean;
  onMove: (col: number) => void;
};

const DIRECTIONS: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]];

function winningLine(board: number[][], row: number, col: number): [number, number][] | null {
  const token = board[row]?.[col] ?? 0;
  if (!token) return null;
  for (const [dr, dc] of DIRECTIONS) {
    const cells: [number, number][] = [[row, col]];
    for (let step = 1; step < 4; step++) {
      const r = row + dr * step, c = col + dc * step;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r]?.[c] !== token) break;
      cells.push([r, c]);
    }
    for (let step = 1; step < 4; step++) {
      const r = row - dr * step, c = col - dc * step;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r]?.[c] !== token) break;
      cells.unshift([r, c]);
    }
    if (cells.length >= 4) return cells.slice(0, 4);
  }
  return null;
}

export function ConnectFourTokenSvg({ seat, isWinning }: { seat: "0" | "1"; isWinning?: boolean }) {
  const isRed = seat === "0";
  const gradId = isRed ? "c4-red-grad" : "c4-gold-grad";
  const strokeColor = isRed ? "#7a1a12" : "#947019";

  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" className={styles.tokenSvg}>
      <defs>
        <radialGradient id="c4-red-grad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FF7A5C" />
          <stop offset="40%" stopColor="#E53916" />
          <stop offset="85%" stopColor="#A81E08" />
          <stop offset="100%" stopColor="#5E0F04" />
        </radialGradient>
        <radialGradient id="c4-gold-grad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFE885" />
          <stop offset="40%" stopColor="#F5B324" />
          <stop offset="85%" stopColor="#BD7C0A" />
          <stop offset="100%" stopColor="#6E4402" />
        </radialGradient>
        <radialGradient id="c4-specular" cx="30%" cy="25%" r="45%">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.6)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>

      <circle cx="50" cy="50" r="46" fill={`url(#${gradId})`} stroke={strokeColor} strokeWidth="3" />
      <circle cx="50" cy="50" r="36" fill="none" stroke="rgba(255, 255, 255, 0.25)" strokeWidth="2" />
      <circle cx="50" cy="50" r="26" fill="none" stroke="rgba(0, 0, 0, 0.3)" strokeWidth="2" />
      <circle cx="50" cy="50" r="44" fill="url(#c4-specular)" />
    </svg>
  );
}

export function ConnectFourBoard({ board, turn, lastMove, legalColumns, canMove, onMove }: Props) {
  const { t } = useI18n();
  const { perspective3D } = useVisualSettings();
  const [hoverCol, setHoverCol] = useState<number | null>(null);

  const winLine = useMemo(
    () => (lastMove ? winningLine(board, lastMove.row, lastMove.col) : null),
    [board, lastMove]
  );
  const winSet = useMemo(() => new Set((winLine ?? []).map(([r, c]) => `${r}-${c}`)), [winLine]);

  const previewRow = useMemo(() => {
    if (hoverCol === null || !legalColumns.includes(hoverCol)) return null;
    for (let r = 0; r < ROWS; r++) if (board[r]?.[hoverCol] === 0) return r;
    return null;
  }, [hoverCol, board, legalColumns]);

  return (
    <div className={styles.wrap}>
      {/* Top Column Drop Selector */}
      <div className={styles.dropSelectorRow} dir="ltr">
        {Array.from({ length: COLS }).map((_, col) => {
          const isLegal = legalColumns.includes(col);
          const isHovered = hoverCol === col;
          return (
            <button
              key={col}
              type="button"
              className={[styles.dropColumnBtn, isHovered && isLegal ? styles.dropActive : ""].join(" ")}
              disabled={!canMove || !isLegal}
              onClick={() => onMove(col)}
              onMouseEnter={() => setHoverCol(col)}
              onMouseLeave={() => setHoverCol((c) => (c === col ? null : c))}
              aria-label={`Drop in column ${col + 1}`}
            >
              {isHovered && isLegal && <span className={styles.dropArrow}>▼</span>}
            </button>
          );
        })}
      </div>

      {/* 3D Vertical Standing Grid */}
      <div className={[styles.gridContainer, perspective3D ? styles.perspective : ""].join(" ")}>
        <div className={styles.verticalStandFrame} dir="ltr">
          {/* Left and Right 3D Stand Feet */}
          <div className={styles.standFootLeft} aria-hidden="true" />
          <div className={styles.standFootRight} aria-hidden="true" />

          {/* Front Grid Bezel */}
          <div className={styles.rackHousing}>
            <div className={styles.grid} role="grid" aria-label={t("game.move_history")}>
              {Array.from({ length: ROWS }).map((_, displayRow) => {
                const row = ROWS - 1 - displayRow;
                return Array.from({ length: COLS }).map((_, col) => {
                  const token = board[row]?.[col] ?? 0;
                  const isNewest = lastMove?.row === row && lastMove?.col === col;
                  const isWinning = winSet.has(`${row}-${col}`);
                  const isPreview = previewRow === row && hoverCol === col && token === 0;

                  return (
                    <button
                      key={`${row}-${col}`}
                      type="button"
                      role="gridcell"
                      aria-label={`${t("game.move_history")} ${row},${col}`}
                      className={styles.cell}
                      disabled={!canMove || !legalColumns.includes(col)}
                      onClick={() => onMove(col)}
                      onMouseEnter={() => setHoverCol(col)}
                      onMouseLeave={() => setHoverCol((c) => (c === col ? null : c))}
                    >
                      <span className={styles.holeBevel}>
                        {token !== 0 && (
                          <motion.div
                            className={[styles.tokenWrap, isWinning ? styles.winningToken : ""].join(" ")}
                            initial={isNewest ? { y: -380, opacity: 0 } : false}
                            animate={{ y: 0, opacity: 1 }}
                            transition={isNewest ? { duration: 0.38, ease: ease.snap } : { duration: 0 }}
                          >
                            <ConnectFourTokenSvg seat={token > 0 ? "0" : "1"} isWinning={isWinning} />
                          </motion.div>
                        )}
                        {isPreview && (
                          <div className={styles.previewTokenWrap}>
                            <ConnectFourTokenSvg seat={turn === 0 ? "0" : "1"} />
                          </div>
                        )}
                      </span>
                    </button>
                  );
                });
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
