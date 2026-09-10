"use client";

/**
 * The XO board -- server-authoritative, same discipline as every other
 * board component: no client-side state beyond a hover preview, and a
 * click never places a mark directly -- it only ever calls `onMove(cell)`,
 * sent as an ordinary INTENT.
 *
 * Deliberately NOT rendered as filled squares (chess/checkers) or holes
 * in a frame (Connect Four) -- XO gets its own identity: an open, precise
 * grid with the marks drawn as real geometry (an SVG X and O, not a glyph
 * font falling back to whatever the OS ships), because the brief is
 * "fast, elegant, joyful" and a plain text "X"/"O" reads as a placeholder,
 * not a finished game.
 *
 * Win-line highlighting is computed CLIENT-SIDE from the public board
 * (perfect information, like every other launch game) purely for
 * display; it never decides the result.
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n/context";
import { ease } from "@/lib/motion";
import styles from "./XOBoard.module.css";

const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

type Props = {
  board: number[]; // 9 cells. 0 empty, 1 = X (seat 0), -1 = O (seat 1).
  lastMove: number | null;
  legalCells: number[]; // own seat only
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

export function XOBoard({ board, lastMove, legalCells, mySeat, canMove, onMove }: Props) {
  const { t } = useI18n();
  const [hoverCell, setHoverCell] = useState<number | null>(null);
  const winLine = useMemo(() => winningLine(board, lastMove), [board, lastMove]);
  const winSet = useMemo(() => new Set(winLine ?? []), [winLine]);

  return (
    <div className={styles.wrap}>
      <div className={styles.board} dir="ltr" role="grid" aria-label={t("game.move_history")}>
        {board.map((mark, cell) => {
          const isLegal = legalCells.includes(cell);
          const isNewest = lastMove === cell;
          const isWinning = winSet.has(cell);
          const isPreview = hoverCell === cell && mark === 0 && isLegal;
          return (
            <button
              key={cell}
              type="button"
              role="gridcell"
              aria-label={`${t("game.move_history")} ${cell}`}
              className={[styles.cell, isWinning ? styles.winning : ""].join(" ")}
              disabled={!canMove || !isLegal}
              onClick={() => onMove(cell)}
              onMouseEnter={() => setHoverCell(cell)}
              onMouseLeave={() => setHoverCell((c) => (c === cell ? null : c))}
            >
              {mark !== 0 && (
                <motion.svg
                  viewBox="0 0 100 100"
                  className={styles.mark}
                  data-seat={mark > 0 ? "0" : "1"}
                  initial={isNewest ? { scale: 0.4, opacity: 0 } : false}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={isNewest ? { duration: 0.22, ease: ease.snap } : { duration: 0 }}
                >
                  {mark > 0 ? (
                    <>
                      <line x1="22" y1="22" x2="78" y2="78" />
                      <line x1="78" y1="22" x2="22" y2="78" />
                    </>
                  ) : (
                    <circle cx="50" cy="50" r="30" fill="none" />
                  )}
                </motion.svg>
              )}
              {isPreview && mySeat !== null && (
                <svg viewBox="0 0 100 100" className={`${styles.mark} ${styles.previewMark}`} data-seat={String(mySeat)}>
                  {mySeat === 0 ? (
                    <>
                      <line x1="22" y1="22" x2="78" y2="78" />
                      <line x1="78" y1="22" x2="22" y2="78" />
                    </>
                  ) : (
                    <circle cx="50" cy="50" r="30" fill="none" />
                  )}
                </svg>
              )}
            </button>
          );
        })}
        {winLine && (
          <svg className={styles.winOverlay} viewBox="0 0 300 300" aria-hidden="true">
            <motion.line
              {...lineCoordsFor(winLine)}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.3, ease: ease.out }}
            />
          </svg>
        )}
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
