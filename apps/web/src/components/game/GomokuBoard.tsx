"use client";

/**
 * The Gomoku board -- server-authoritative, same discipline as every
 * other board component: no client-side state beyond a hover preview,
 * and a click never places a stone directly -- it only ever calls
 * `onMove(cell)`, sent as an ordinary INTENT.
 *
 * Deliberately NOT XO's identity: stones sit ON the intersections of a
 * thin 15x15 line grid (the classic Gomoku/Go board convention), never
 * filling a cell, with real star-point (hoshi) markers -- a completely
 * different geometry, material and rhythm from XO's open 3x3 cell grid.
 * Win-line highlighting is computed CLIENT-SIDE from the public board
 * (perfect information, like every other launch game) purely for
 * display, exactly like XO's own winningLine() -- it never decides the
 * result. RTL note: forced `dir="ltr"` internally -- board geometry
 * never mirrors.
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n/context";
import { ease } from "@/lib/motion";
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
  legalCells: number[]; // own seat only
  mySeat: 0 | 1 | null;
  canMove: boolean;
  onMove: (cell: number) => void;
};

export function GomokuBoard({ board, lastMove, legalCells, mySeat, canMove, onMove }: Props) {
  const { t } = useI18n();
  const [hoverCell, setHoverCell] = useState<number | null>(null);
  const legalSet = useMemo(() => new Set(legalCells), [legalCells]);
  const winLine = useMemo(() => winningLine(board, lastMove), [board, lastMove]);
  const winSet = useMemo(() => new Set(winLine ?? []), [winLine]);

  return (
    <div className={styles.wrap}>
      <div className={styles.board} dir="ltr" role="grid" aria-label={t("game.move_history")}>
        <svg className={styles.gridLines} viewBox="0 0 15 15" preserveAspectRatio="none" aria-hidden="true">
          {Array.from({ length: SIZE }).map((_, i) => (
            <line key={`h${i}`} x1={0.5} y1={i + 0.5} x2={14.5} y2={i + 0.5} />
          ))}
          {Array.from({ length: SIZE }).map((_, i) => (
            <line key={`v${i}`} x1={i + 0.5} y1={0.5} x2={i + 0.5} y2={14.5} />
          ))}
        </svg>
        {STAR_POINTS.map((idx) => (
          <span
            key={`star-${idx}`}
            className={styles.starPoint}
            style={{ left: `${((idx % SIZE) + 0.5) * (100 / SIZE)}%`, top: `${(Math.floor(idx / SIZE) + 0.5) * (100 / SIZE)}%` }}
            aria-hidden="true"
          />
        ))}

        {winLine && winLine.length > 0 && (
          <svg className={styles.winOverlay} viewBox="0 0 15 15" preserveAspectRatio="none" aria-hidden="true">
            <motion.line
              x1={(winLine[0]! % SIZE) + 0.5}
              y1={Math.floor(winLine[0]! / SIZE) + 0.5}
              x2={(winLine[winLine.length - 1]! % SIZE) + 0.5}
              y2={Math.floor(winLine[winLine.length - 1]! / SIZE) + 0.5}
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
              onClick={() => onMove(cell)}
              onMouseEnter={() => setHoverCell(cell)}
              onMouseLeave={() => setHoverCell((c) => (c === cell ? null : c))}
            >
              {mark !== 0 && (
                <motion.span
                  className={[styles.stone, mark > 0 ? styles.stoneA : styles.stoneB, isWinning ? styles.glow : ""].join(" ")}
                  initial={isNewest ? { scale: 0.2, opacity: 0 } : false}
                  animate={{ scale: 1, opacity: 1 }}
                  whileTap={{ scale: 0.94 }}
                  transition={isNewest ? { duration: 0.2, ease: ease.snap } : { duration: 0 }}
                />
              )}
              {isPreview && mySeat !== null && (
                <span className={[styles.stone, styles.previewStone, mySeat === 0 ? styles.stoneA : styles.stoneB].join(" ")} />
              )}
              {isNewest && mark !== 0 && <span className={styles.lastMoveRing} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
