"use client";

/**
 * The Connect Four board -- server-authoritative, same discipline as
 * ChessBoard.tsx and CheckersBoard.tsx: the ONLY client state is a hover
 * preview of where a token would land, purely cosmetic. A click never
 * drops a token directly -- it only ever calls `onMove(column)`, sent as
 * an ordinary INTENT.
 *
 * The interaction model is deliberately column-based, not cell-based:
 * this is the one launch game where a player picks a COLUMN, never a
 * specific square -- gravity decides the rest, exactly like the physical
 * game.
 *
 * Line-completion highlighting is computed CLIENT-SIDE from the public
 * board (Connect Four is perfect information, like chess and checkers)
 * purely for display -- it never decides the result; the server's own
 * evaluate() already has, by the time this ever renders a winning
 * position at all.
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n/context";
import { ease } from "@/lib/motion";
import styles from "./ConnectFourBoard.module.css";

const COLS = 7, ROWS = 6;

type Props = {
  board: number[][]; // 6 rows (row 0 = bottom) x 7 cols. 0 empty, 1 seat0, -1 seat1.
  turn: 0 | 1;
  lastMove: { row: number; col: number } | null;
  legalColumns: number[]; // own seat only
  mySeat: 0 | 1 | null;
  canMove: boolean;
  onMove: (col: number) => void;
};

const DIRECTIONS: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]];

/** Display-only: the four cells of a completed line through `lastMove`, or null. */
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

export function ConnectFourBoard({ board, turn, lastMove, legalColumns, canMove, onMove }: Props) {
  const { t } = useI18n();
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
      <div className={styles.frame} dir="ltr">
        <div className={styles.grid} role="grid" aria-label={t("game.move_history")}>
          {Array.from({ length: ROWS }).map((_, displayRow) => {
            const row = ROWS - 1 - displayRow; // render top-to-bottom; row 0 is the bottom
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
                  <span className={styles.hole}>
                    {token !== 0 && (
                      <motion.span
                        className={[styles.token, isWinning ? styles.winning : ""].join(" ")}
                        data-seat={token > 0 ? "0" : "1"}
                        initial={isNewest ? { y: "-520%" } : false}
                        animate={{ y: 0 }}
                        transition={isNewest ? { duration: 0.42, ease: ease.snap } : { duration: 0 }}
                      />
                    )}
                    {isPreview && <span className={styles.previewToken} data-seat={turn === 0 ? "0" : "1"} aria-hidden="true" />}
                  </span>
                </button>
              );
            });
          })}
        </div>
      </div>
    </div>
  );
}
