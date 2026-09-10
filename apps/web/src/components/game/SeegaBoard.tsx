"use client";

/**
 * The Seega board -- server-authoritative, same discipline as every other
 * board component: selection (which own piece, during the movement
 * phase) is the ONLY client-side state, and a click never places or
 * moves a piece directly -- it only ever calls `onMove({ place })` or
 * `onMove({ from, to })`, sent as an ordinary INTENT.
 *
 * Visual identity: heritage-inspired, not literal -- an abstract
 * geometric lattice (the real, respected decorative language of the
 * region, per this brief's own "culturally respectful, no stereotypes")
 * frames a stone table; pieces are carved basalt and limestone discs,
 * never figurines or cultural iconography. The center square (the one
 * square that starts and stays empty through the whole placement phase,
 * see packages/game-seega/src/seega.mjs's own header) carries a small
 * engraved star, marking its role rather than decorating it. RTL note:
 * forced `dir="ltr"` on the board itself, same reasoning as every other
 * board -- grid geometry never mirrors.
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n/context";
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

export function SeegaBoard({ phase, board, legalPlacements, legalMoves, mySeat, canMove, onMove }: Props) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<number | null>(null);

  const destinationsFromSelected = useMemo(() => {
    if (selected === null) return new Set<number>();
    return new Set(legalMoves.filter((m) => m.from === selected).map((m) => m.to));
  }, [selected, legalMoves]);

  const sourcesWithLegalMove = useMemo(() => new Set(legalMoves.map((m) => m.from)), [legalMoves]);

  function handleCellClick(idx: number) {
    if (!canMove) return;

    if (phase === "PLACEMENT") {
      if (legalPlacements.includes(idx)) onMove({ place: idx });
      return;
    }

    if (selected !== null && destinationsFromSelected.has(idx)) {
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
      <div className={styles.frame}>
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
                  isCenter ? styles.center : "",
                  isPlaceable ? styles.placeable : "",
                  isDestination ? styles.destination : "",
                  isSelected ? styles.selected : "",
                ].join(" ")}
                disabled={!canMove || (phase === "PLACEMENT" ? !isPlaceable : !isSelectableSource && !isDestination)}
                onClick={() => handleCellClick(idx)}
              >
                {isCenter && mark === 0 && <span className={styles.centerMark} aria-hidden="true" />}
                {mark !== 0 && (
                  <motion.span
                    layoutId={`seega-piece-${idx}`}
                    className={[styles.piece, mark > 0 ? styles.pieceA : styles.pieceB].join(" ")}
                    initial={false}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
