"use client";

/**
 * The Reversi/Othello board -- server-authoritative, same discipline as
 * every other board component: a click never places or flips a piece
 * directly -- it only ever calls `onMove({ place })` or
 * `onMove({ pass: true })`, sent as an ordinary INTENT. Which discs a
 * placement would flip is never computed here for legality (the server
 * is the only authority); `legalMoves` is purely the plugin's own
 * projection, used only to highlight playable squares.
 *
 * Flip animation: `lastMove` -- the plugin's own project()-level record of
 * the last placement, `{ action: "PLACE", place, flipped }`, public
 * information safe for a spectator too -- drives a 3D flip-in-place on
 * exactly the discs that placement just turned, the classic, satisfying
 * Othello disc turn. Everything else renders at rest with no animation,
 * so a fresh page load or reconnect never "replays" history.
 *
 * Visual identity: clean, strategic, high-contrast, premium -- a
 * near-black board, crisp grid, and pure high-contrast discs, no felt,
 * no wood, deliberately the coldest/most minimal launch board on the
 * platform. RTL note: forced `dir="ltr"` -- grid geometry never mirrors.
 */
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n/context";
import styles from "./ReversiBoard.module.css";

type LastMove = { action: "PLACE"; seat: 0 | 1; place: number; flipped: number[] } | { action: "PASS"; seat: 0 | 1 } | null;

type Props = {
  board: number[]; // 64 cells. 0 empty, 1 = seat0 (Black), -1 = seat1 (White).
  legalMoves: number[];
  lastMove: LastMove;
  mySeat: 0 | 1 | null;
  canMove: boolean;
  onMove: (intent: { place: number } | { pass: true }) => void;
};

export function ReversiBoard({ board, legalMoves, lastMove, canMove, onMove }: Props) {
  const { t } = useI18n();
  const flipped = new Set(lastMove?.action === "PLACE" ? lastMove.flipped : []);
  const justPlaced = lastMove?.action === "PLACE" ? lastMove.place : null;
  const mustPass = canMove && legalMoves.length === 0;

  return (
    <div className={styles.wrap}>
      <div className={styles.board} dir="ltr" role="grid" aria-label={t("game.move_history")}>
        {board.map((mark, idx) => {
          const isLegal = legalMoves.includes(idx);
          return (
            <button
              key={idx}
              type="button"
              role="gridcell"
              className={[styles.cell, isLegal ? styles.legal : ""].join(" ")}
              disabled={!canMove || !isLegal}
              onClick={() => onMove({ place: idx })}
            >
              {isLegal && mark === 0 && <span className={styles.hint} aria-hidden="true" />}
              {mark !== 0 && (
                <motion.span
                  key={`${idx}-${mark > 0 ? "a" : "b"}`}
                  className={[styles.disc, mark > 0 ? styles.discA : styles.discB].join(" ")}
                  initial={flipped.has(idx) || justPlaced === idx ? { rotateY: 90, opacity: 0.4 } : false}
                  animate={{ rotateY: 0, opacity: 1 }}
                  transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
                />
              )}
            </button>
          );
        })}
      </div>

      {mustPass && (
        <button type="button" className={styles.passButton} onClick={() => onMove({ pass: true })}>
          {t("game.reversi.pass")}
        </button>
      )}
    </div>
  );
}
