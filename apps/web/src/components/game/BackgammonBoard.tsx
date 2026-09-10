"use client";

/**
 * The Backgammon board -- server-authoritative, same discipline as every
 * other board component: selection (which point, or the bar) is the
 * ONLY client-side state, and a click never moves a checker directly --
 * it only ever calls `onMove({ from, die })` or `onMove({ pass: true })`,
 * sent as an ordinary INTENT. `legalActions` (own turn only) is the
 * plugin's own projection; nothing here re-derives legality.
 *
 * Both seats get an IDENTICAL relative view -- "my home is bottom-right,
 * my checkers run counter-clockwise into it" -- via a seat-relative
 * re-labelling (`toAbsolute`/`toDisplay`, mirroring seat 1's own index
 * through `23 - idx`) rather than literally mirroring the DOM, the same
 * spirit as CheckersBoard's own `flipped` handling. RTL note: forced
 * `dir="ltr"` on the board itself -- this is geometry, never text.
 *
 * Visual identity: a luxury felt-and-wood board, tactile ivory/obsidian
 * checkers, and a premium dice-roll flourish -- the brief's own "luxury
 * board, tactile pieces, premium dice animation, subtle depth,
 * satisfying movement".
 */
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/lib/i18n/context";
import { transition } from "@/lib/motion";
import styles from "./BackgammonBoard.module.css";

type LegalAction = { from: number | "BAR"; die: number; to: number | "OFF" };
type Props = {
  board: number[];
  bar: [number, number];
  off: [number, number];
  dice: number[];
  legalActions: LegalAction[] | null; // null unless it is genuinely this seat's turn
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
    <motion.svg
      viewBox="0 0 100 100"
      className={styles.die}
      initial={{ rotate: -35, scale: 0.5, opacity: 0 }}
      animate={{ rotate: 0, scale: 1, opacity: 1 }}
      transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <rect x="4" y="4" width="92" height="92" rx="16" />
      {(layout[value] ?? []).map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r={9} />)}
    </motion.svg>
  );
}

function Checker({ seat, muted = false }: { seat: 0 | 1; muted?: boolean }) {
  return <div className={[styles.checker, seat === 0 ? styles.checkerA : styles.checkerB, muted ? styles.checkerMuted : ""].join(" ")} />;
}

export function BackgammonBoard({ board, bar, off, dice, legalActions, mySeat, canMove, onMove }: Props) {
  const { t } = useI18n();
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

  function handlePointClick(idx: number) {
    if (!canMove || !legalActions) return;
    const { seat } = pointOwnerAndCount(idx);
    const dest = destinationsFromSelected.get(String(idx));
    if (selected !== null && dest) {
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
        <div className={styles.checkerStack}>
          {seat !== null && Array.from({ length: shown }).map((_, i) => (
            <Checker key={i} seat={seat} />
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

      <div className={styles.board} dir="ltr">
        <div className={[styles.quadrant, styles.top].join(" ")}>
          {DISP_TOP.slice(0, 6).map((rel) => renderPoint(rel, "top"))}
        </div>
        <div className={[styles.quadrant, styles.top].join(" ")}>
          {DISP_TOP.slice(6, 12).map((rel) => renderPoint(rel, "top"))}
        </div>

        <button
          type="button"
          className={[styles.barSlot, selected === "BAR" ? styles.pointSelected : ""].join(" ")}
          onClick={handleBarClick}
          disabled={mySeat === null || bar[mySeat] === 0 || !sourcesWithLegalMove.has("BAR")}
          aria-label={t("game.backgammon.bar")}
        >
          {bar[0] > 0 && (
            <div className={styles.barGroup}>
              {Array.from({ length: bar[0] }).map((_, i) => <Checker key={i} seat={0} />)}
            </div>
          )}
          {bar[1] > 0 && (
            <div className={styles.barGroup}>
              {Array.from({ length: bar[1] }).map((_, i) => <Checker key={i} seat={1} />)}
            </div>
          )}
        </button>

        <div className={[styles.quadrant, styles.bottom].join(" ")}>
          {DISP_BOTTOM.slice(0, 6).map((rel) => renderPoint(rel, "bottom"))}
        </div>
        <div className={[styles.quadrant, styles.bottom].join(" ")}>
          {DISP_BOTTOM.slice(6, 12).map((rel) => renderPoint(rel, "bottom"))}
        </div>
      </div>

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
