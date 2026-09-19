"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n/context";
import { useVisualSettings } from "./TableEnvironment";
import { playSeegaMoveSound, playSeegaCaptureSound } from "@/lib/game-audio";
import styles from "./SeegaBoard.module.css";

const BOARD_SIZE = 5;
const CENTER = 12;

type Move = { from: number; to: number };

type Props = {
  phase: "PLACEMENT" | "MOVEMENT";
  board: number[]; // 25 cells. 0 empty, 1 = seat0, -1 = seat1.
  legalPlacements: number[];
  legalMoves: Move[];
  mySeat: 0 | 1 | null;
  canMove: boolean;
  onMove: (intent: { place: number } | { from: number; to: number }) => void;
};

export function SeegaStoneSvg({ seat }: { seat: "0" | "1" }) {
  const isLimestone = seat === "0";
  const gradId = isLimestone ? "seega-lime-grad" : "seega-basalt-grad";
  const strokeColor = isLimestone ? "#8c7f6b" : "#0d0f12";

  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" className={styles.stoneSvg}>
      <defs>
        <radialGradient id="seega-lime-grad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="45%" stopColor="#EDE5D3" />
          <stop offset="85%" stopColor="#C7B89E" />
          <stop offset="100%" stopColor="#8C795C" />
        </radialGradient>
        <radialGradient id="seega-basalt-grad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#434B59" />
          <stop offset="45%" stopColor="#222730" />
          <stop offset="85%" stopColor="#12151A" />
          <stop offset="100%" stopColor="#08090B" />
        </radialGradient>
        <radialGradient id="seega-specular" cx="30%" cy="25%" r="45%">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.5)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>

      <circle cx="50" cy="50" r="45" fill={`url(#${gradId})`} stroke={strokeColor} strokeWidth="3" />
      <circle cx="50" cy="50" r="42" fill="url(#seega-specular)" />
      {/* Natural Stone Chisel Grain */}
      <circle cx="50" cy="50" r="32" fill="none" stroke="rgba(0, 0, 0, 0.15)" strokeWidth="1" strokeDasharray="4 6" />
    </svg>
  );
}

export function SeegaBoard({ phase, board, legalPlacements, legalMoves, mySeat, canMove, onMove }: Props) {
  const { t } = useI18n();
  const { perspective3D, quality } = useVisualSettings();
  const [selected, setSelected] = useState<number | null>(null);

  const destinationsFromSelected = useMemo(() => {
    if (selected === null) return new Set<number>();
    return new Set(legalMoves.filter((m) => m.from === selected).map((m) => m.to));
  }, [selected, legalMoves]);

  const sourcesWithLegalMove = useMemo(() => new Set(legalMoves.map((m) => m.from)), [legalMoves]);

  function handleCellClick(idx: number) {
    if (!canMove) return;

    if (phase === "PLACEMENT") {
      if (legalPlacements.includes(idx)) {
        playSeegaMoveSound();
        onMove({ place: idx });
      }
      return;
    }

    if (selected !== null && destinationsFromSelected.has(idx)) {
      playSeegaMoveSound();
      onMove({ from: selected, to: idx });
      setSelected(null);
      return;
    }
    if (board[idx] === (mySeat === 0 ? 1 : -1) && sourcesWithLegalMove.has(idx)) {
      setSelected(idx === selected ? null : idx);
      return;
    }
    setSelected(null);
  }

  return (
    <div className={styles.wrap}>
      {/* Phase Badge */}
      <div className={styles.phaseIndicator}>
        <span className={styles.phaseBadge}>
          {phase === "PLACEMENT" ? "Phase 1: Placement" : "Phase 2: Movement"}
        </span>
      </div>

      <div className={[styles.boardContainer, perspective3D ? styles.perspective : ""].join(" ")}>
        <div className={styles.sandstoneSlab}>
          <div className={styles.board} dir="ltr" role="grid" aria-label={t("game.move_history")}>
            {board.map((mark, idx) => {
              const isCenter = idx === CENTER;
              const isPlaceable = phase === "PLACEMENT" && legalPlacements.includes(idx);
              const isSelected = selected === idx;
              const isDestination = destinationsFromSelected.has(idx);
              const isSelectableSource =
                phase === "MOVEMENT" && mark === (mySeat === 0 ? 1 : -1) && sourcesWithLegalMove.has(idx);

              return (
                <button
                  key={idx}
                  type="button"
                  role="gridcell"
                  className={[
                    styles.cell,
                    isCenter ? styles.centerCell : "",
                    isPlaceable ? styles.placeable : "",
                    isDestination ? styles.destination : "",
                    isSelected ? styles.selected : "",
                  ].join(" ")}
                  disabled={!canMove || (phase === "PLACEMENT" ? !isPlaceable : !isSelectableSource && !isDestination)}
                  onClick={() => handleCellClick(idx)}
                >
                  {isCenter && (
                    <svg viewBox="0 0 100 100" className={styles.centerStarSvg} aria-hidden="true">
                      <polygon
                        points="50,15 61,38 85,38 66,54 73,78 50,64 27,78 34,54 15,38 39,38"
                        fill="#C6A867"
                        stroke="#8A7039"
                        strokeWidth="2"
                      />
                    </svg>
                  )}
                  {mark !== 0 && (
                    <motion.div
                      {...(quality !== "low" ? { layoutId: `seega-piece-${idx}` } : {})}
                      className={styles.stoneWrap}
                      initial={false}
                      animate={{
                        scale: isSelected ? 1.15 : 1,
                        y: isSelected ? -8 : 0,
                      }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <SeegaStoneSvg seat={mark > 0 ? "0" : "1"} />
                    </motion.div>
                  )}
                  {isDestination && <span className={styles.destDot} />}
                  {isPlaceable && mark === 0 && <span className={styles.placeHint} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
