"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/lib/i18n/context";
import { transition } from "@/lib/motion";
import { useVisualSettings } from "./TableEnvironment";
import { playDiceRollSound, playCheckerSlideSound, playCheckerHitSound } from "@/lib/game-audio";
import styles from "./BackgammonBoard.module.css";

type LegalAction = { from: number | "BAR"; die: number; to: number | "OFF" };
type Props = {
  board: number[];
  bar: [number, number];
  off: [number, number];
  dice: number[];
  legalActions: LegalAction[] | null;
  mySeat: 0 | 1 | null;
  canMove: boolean;
  onMove: (intent: { from: number | "BAR"; die: number } | { pass: true }) => void;
};

const DISP_TOP = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
const DISP_BOTTOM = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
const MAX_SHOWN = 5;

function DieFace({ value }: { value: number }) {
  const layout: Record<number, Array<[number, number]>> = {
    1: [[50, 50]],
    2: [[28, 28], [72, 72]],
    3: [[28, 28], [50, 50], [72, 72]],
    4: [[28, 28], [72, 28], [28, 72], [72, 72]],
    5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
    6: [[28, 24], [28, 50], [28, 76], [72, 24], [72, 50], [72, 76]],
  };

  return (
    <motion.div
      className={styles.die3d}
      initial={{ rotateX: 180, rotateY: 90, scale: 0.4, opacity: 0 }}
      animate={{ rotateX: 0, rotateY: 0, scale: 1, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <svg viewBox="0 0 100 100" className={styles.dieSvg}>
        <defs>
          <linearGradient id="die-bone-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="60%" stopColor="#F5EFE6" />
            <stop offset="100%" stopColor="#D6CBB8" />
          </linearGradient>
          <radialGradient id="die-pip-grad" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#111" />
            <stop offset="100%" stopColor="#2A2A2A" />
          </radialGradient>
        </defs>
        <rect x="5" y="5" width="90" height="90" rx="18" fill="url(#die-bone-grad)" stroke="#9C8E77" strokeWidth="2.5" />
        <rect x="7" y="7" width="86" height="86" rx="16" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" />
        {(layout[value] ?? []).map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={8.5} fill="url(#die-pip-grad)" filter="drop-shadow(0 1px 1px rgba(255,255,255,0.4))" />
        ))}
      </svg>
    </motion.div>
  );
}

function BackgammonChecker({ seat, muted = false }: { seat: 0 | 1; muted?: boolean }) {
  const isWhite = seat === 0;
  return (
    <div className={[styles.checker3d, isWhite ? styles.checkerWhite : styles.checkerBlack, muted ? styles.checkerMuted : ""].join(" ")}>
      <div className={styles.checkerInnerRim} />
    </div>
  );
}

export function BackgammonBoard({ board, bar, off, dice, legalActions, mySeat, canMove, onMove }: Props) {
  const { t } = useI18n();
  const { perspective3D } = useVisualSettings();
  const [selected, setSelected] = useState<number | "BAR" | null>(null);

  const flip = mySeat === 1;
  const toAbsolute = (rel: number) => (flip ? 23 - rel : rel);

  const destinationsFromSelected = useMemo(() => {
    if (selected === null || !legalActions) return new Map<string, LegalAction>();
    const map = new Map<string, LegalAction>();
    for (const a of legalActions) {
      if (a.from === selected) map.set(String(a.to), a);
    }
    return map;
  }, [selected, legalActions]);

  const sourcesWithLegalMove = useMemo(() => {
    if (!legalActions) return new Set<string>();
    return new Set(legalActions.map((a) => String(a.from)));
  }, [legalActions]);

  function pointOwnerAndCount(idx: number): { seat: 0 | 1 | null; count: number } {
    const v = board[idx] ?? 0;
    if (v === 0) return { seat: null, count: 0 };
    return v > 0 ? { seat: 0, count: v } : { seat: 1, count: -v };
  }

  const prevDiceRef = useRef<string>("");
  useEffect(() => {
    const diceStr = (dice || []).join(",");
    if (diceStr && diceStr !== prevDiceRef.current) {
      playDiceRollSound();
    }
    prevDiceRef.current = diceStr;
  }, [dice]);

  function handlePointClick(idx: number) {
    if (!canMove || !legalActions) return;
    const { seat, count } = pointOwnerAndCount(idx);
    const dest = destinationsFromSelected.get(String(idx));
    if (selected !== null && dest) {
      if (seat !== null && mySeat !== null && seat !== mySeat && count === 1) {
        playCheckerHitSound();
      } else {
        playCheckerSlideSound();
      }
      onMove({ from: selected, die: dest.die });
      setSelected(null);
      return;
    }
    if (seat === mySeat && sourcesWithLegalMove.has(String(idx))) {
      setSelected(idx === selected ? null : idx);
    }
  }

  function handleBarClick() {
    if (!canMove || !legalActions || mySeat === null) return;
    if (bar[mySeat] > 0 && sourcesWithLegalMove.has("BAR")) {
      setSelected(selected === "BAR" ? null : "BAR");
    }
  }

  function handleOffClick() {
    if (!canMove || selected === null) return;
    const dest = destinationsFromSelected.get("OFF");
    if (dest) {
      playCheckerSlideSound();
      onMove({ from: selected, die: dest.die });
      setSelected(null);
    }
  }

  function renderPoint(rel: number, edge: "top" | "bottom") {
    const idx = toAbsolute(rel);
    const { seat, count } = pointOwnerAndCount(idx);
    const isSelected = selected === idx;
    const isDestination = selected !== null && destinationsFromSelected.has(String(idx));
    const isSelectable = canMove && seat === mySeat && sourcesWithLegalMove.has(String(idx));
    const shown = Math.min(count, MAX_SHOWN);
    const overflow = count - shown;

    return (
      <button
        key={idx}
        type="button"
        className={[
          styles.point,
          styles[edge],
          idx % 2 === 0 ? styles.pointLight : styles.pointDark,
          isSelected ? styles.pointSelected : "",
          isDestination ? styles.pointDestination : "",
        ].join(" ")}
        disabled={!isSelectable && !isDestination}
        onClick={() => handlePointClick(idx)}
        aria-label={`point ${idx}`}
      >
        <div className={styles.pointTriangle} />
        <div className={styles.checkerStack}>
          {seat !== null && Array.from({ length: shown }).map((_, i) => (
            <BackgammonChecker key={i} seat={seat} />
          ))}
          {overflow > 0 && <span className={styles.overflowLabel}>+{overflow}</span>}
        </div>
        {isDestination && <span className={styles.destDot} />}
      </button>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.diceRow}>
        <AnimatePresence mode="popLayout">
          {dice.map((d, i) => <DieFace key={`${dice.length}-${i}-${d}`} value={d} />)}
        </AnimatePresence>
      </div>

      <div className={[styles.boardContainer, perspective3D ? styles.perspective : ""].join(" ")}>
        <div className={styles.attacheCase} dir="ltr">
          <div className={styles.feltBed}>
            {/* Top Left Quadrant */}
            <div className={[styles.quadrant, styles.top].join(" ")}>
              {DISP_TOP.slice(0, 6).map((rel) => renderPoint(rel, "top"))}
            </div>

            {/* Raised Center Bar */}
            <button
              type="button"
              className={[styles.barSlot, selected === "BAR" ? styles.barSelected : ""].join(" ")}
              onClick={handleBarClick}
              disabled={mySeat === null || bar[mySeat] === 0 || !sourcesWithLegalMove.has("BAR")}
              aria-label={t("game.backgammon.bar")}
            >
              <div className={styles.barLeather} />
              {bar[0] > 0 && (
                <div className={styles.barGroup}>
                  {Array.from({ length: bar[0] }).map((_, i) => <BackgammonChecker key={i} seat={0} />)}
                </div>
              )}
              {bar[1] > 0 && (
                <div className={styles.barGroup}>
                  {Array.from({ length: bar[1] }).map((_, i) => <BackgammonChecker key={i} seat={1} />)}
                </div>
              )}
            </button>

            {/* Top Right Quadrant */}
            <div className={[styles.quadrant, styles.top].join(" ")}>
              {DISP_TOP.slice(6, 12).map((rel) => renderPoint(rel, "top"))}
            </div>

            {/* Bottom Left Quadrant */}
            <div className={[styles.quadrant, styles.bottom].join(" ")}>
              {DISP_BOTTOM.slice(0, 6).map((rel) => renderPoint(rel, "bottom"))}
            </div>

            {/* Bottom Right Quadrant */}
            <div className={[styles.quadrant, styles.bottom].join(" ")}>
              {DISP_BOTTOM.slice(6, 12).map((rel) => renderPoint(rel, "bottom"))}
            </div>
          </div>
        </div>
      </div>

      {/* Bear-off Tray */}
      <div className={styles.offRow}>
        <span className={styles.offLabel}>{t("game.backgammon.borne_off")}</span>
        <button
          type="button"
          className={[styles.offTray, selected !== null && destinationsFromSelected.has("OFF") ? styles.pointDestination : ""].join(" ")}
          onClick={handleOffClick}
          disabled={!canMove || selected === null || !destinationsFromSelected.has("OFF")}
        >
          <span className={styles.offCount}>{mySeat !== null ? off[mySeat] : off[0]}</span>
          <span className={styles.offCountOpp}>{mySeat !== null ? off[mySeat === 0 ? 1 : 0] : off[1]}</span>
        </button>
      </div>
    </div>
  );
}
