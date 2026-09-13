"use client";

import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n/context";
import { useVisualSettings } from "./TableEnvironment";
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

export function ReversiDiscSvg({ isBlack }: { isBlack: boolean }) {
  const gradId = isBlack ? "rev-black-grad" : "rev-white-grad";
  const strokeColor = isBlack ? "#080a0d" : "#7d7363";

  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" className={styles.discSvg}>
      <defs>
        <radialGradient id="rev-black-grad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#3d4452" />
          <stop offset="45%" stopColor="#1e222a" />
          <stop offset="85%" stopColor="#0d0f12" />
          <stop offset="100%" stopColor="#050608" />
        </radialGradient>
        <radialGradient id="rev-white-grad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="45%" stopColor="#F5EFE3" />
          <stop offset="85%" stopColor="#D8CDBC" />
          <stop offset="100%" stopColor="#A89A84" />
        </radialGradient>
        <radialGradient id="rev-specular" cx="30%" cy="25%" r="45%">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.55)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>

      <circle cx="50" cy="50" r="45" fill={`url(#${gradId})`} stroke={strokeColor} strokeWidth="2.5" />
      <circle cx="50" cy="50" r="37" fill="none" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="43" fill="url(#rev-specular)" />
    </svg>
  );
}

export function ReversiBoard({ board, legalMoves, lastMove, canMove, onMove }: Props) {
  const { t } = useI18n();
  const { perspective3D } = useVisualSettings();
  const flipped = new Set(lastMove?.action === "PLACE" ? lastMove.flipped : []);
  const justPlaced = lastMove?.action === "PLACE" ? lastMove.place : null;
  const mustPass = canMove && legalMoves.length === 0;

  return (
    <div className={styles.wrap}>
      <div className={[styles.boardContainer, perspective3D ? styles.perspective : ""].join(" ")}>
        <div className={styles.tableBevel}>
          <div className={styles.board} dir="ltr" role="grid" aria-label={t("game.move_history")}>
            {board.map((mark, idx) => {
              const isLegal = legalMoves.includes(idx);
              const isFlipping = flipped.has(idx);
              const isNewest = justPlaced === idx;

              return (
                <button
                  key={idx}
                  type="button"
                  role="gridcell"
                  className={[styles.cell, isLegal ? styles.legal : ""].join(" ")}
                  disabled={!canMove || !isLegal}
                  onClick={() => onMove({ place: idx })}
                >
                  {isLegal && mark === 0 && <span className={styles.hintDot} aria-hidden="true" />}
                  {mark !== 0 && (
                    <motion.div
                      key={`${idx}-${mark > 0 ? "b" : "w"}`}
                      className={styles.discWrap}
                      initial={isFlipping ? { rotateY: 90, scale: 0.8 } : isNewest ? { scale: 0.3, opacity: 0 } : false}
                      animate={{ rotateY: 0, scale: 1, opacity: 1 }}
                      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <ReversiDiscSvg isBlack={mark > 0} />
                    </motion.div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {mustPass && (
        <button type="button" className={styles.passButton} onClick={() => onMove({ pass: true })}>
          {t("game.reversi.pass")}
        </button>
      )}
    </div>
  );
}
