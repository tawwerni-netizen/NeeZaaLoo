"use client";

/**
 * The Dominoes board -- server-authoritative, same discipline as every
 * other board component: selection (which hand tile, then which end) is
 * the ONLY client-side state, and a click never places a tile directly
 * -- it only ever calls `onMove({ tile, end? })` or `onMove({ pass: true })`,
 * sent as an ordinary INTENT.
 *
 * Which ends a given hand tile could legally attach to is recomputed
 * HERE, from the public line alone, purely so the hand can grey out
 * dead tiles and skip the end-picker when only one end is possible --
 * exactly the same "client mirrors the rule for display, server is the
 * only one who enforces it" split every other board component (XOBoard's
 * win-line, CheckersBoard's destination highlighting) already uses.
 *
 * Visual identity: a felt table (this game's own material, distinct from
 * chess's board and checkers' walnut) under ivory tiles with real pip
 * geometry -- the brief's own "premium table experience, physical-feeling
 * pieces, clean tile interaction". RTL note: forced `dir="ltr"` on the
 * table itself, same reasoning as every other board -- the line of play
 * is geometry, not text, and never mirrors.
 */
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/lib/i18n/context";
import { transition } from "@/lib/motion";
import styles from "./DominoesBoard.module.css";

type Tile = [number, number];
type LineTile = { tile: Tile; orientation: [number, number] };
type Line = { left: number | null; right: number | null; tiles: LineTile[] };

type Props = {
  line: Line;
  handCounts: [number, number];
  hand: Tile[] | null; // null for a spectator
  mustPlayTile: Tile | null;
  canPass: boolean;
  mySeat: 0 | 1 | null;
  canMove: boolean;
  onMove: (intent: { tile: Tile; end?: "LEFT" | "RIGHT" } | { pass: true }) => void;
};

function sameTile(a: Tile, b: Tile) {
  return a[0] === b[0] && a[1] === b[1];
}

function legalEndsFor(tile: Tile, line: Line): Array<"LEFT" | "RIGHT" | "ANY"> {
  if (line.tiles.length === 0) return ["ANY"];
  const ends: Array<"LEFT" | "RIGHT"> = [];
  if (tile[0] === line.left || tile[1] === line.left) ends.push("LEFT");
  if (tile[0] === line.right || tile[1] === line.right) ends.push("RIGHT");
  return ends;
}

const PIP_LAYOUTS: Record<number, Array<[number, number]>> = {
  0: [],
  1: [[50, 50]],
  2: [[26, 26], [74, 74]],
  3: [[26, 26], [50, 50], [74, 74]],
  4: [[26, 26], [74, 26], [26, 74], [74, 74]],
  5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
  6: [[26, 20], [26, 50], [26, 80], [74, 20], [74, 50], [74, 80]],
};

function Pips({ value }: { value: number }) {
  return (
    <svg viewBox="0 0 100 100" className={styles.pips} aria-hidden="true">
      {(PIP_LAYOUTS[value] ?? []).map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={9} />
      ))}
    </svg>
  );
}

function DominoTile({
  values, size = "md", faded = false, glow = false,
}: {
  values: [number, number]; size?: "sm" | "md" | "lg"; faded?: boolean; glow?: boolean;
}) {
  return (
    <div className={[styles.tile, styles[`tile-${size}`], faded ? styles.faded : "", glow ? styles.glow : ""].join(" ")}>
      <div className={styles.half}><Pips value={values[0]} /></div>
      <div className={styles.divider} />
      <div className={styles.half}><Pips value={values[1]} /></div>
    </div>
  );
}

export function DominoesBoard({ line, handCounts, hand, mustPlayTile, canPass, mySeat, canMove, onMove }: Props) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<Tile | null>(null);

  const selectedEnds = useMemo(
    () => (selected ? legalEndsFor(selected, line) : []),
    [selected, line]
  );

  function handleTileClick(tile: Tile) {
    if (!canMove) return;
    if (mustPlayTile && !sameTile(tile, mustPlayTile)) return;
    const ends = legalEndsFor(tile, line);
    if (ends.length === 0) return;
    if (ends[0] === "ANY") {
      onMove({ tile });
      return;
    }
    if (ends.length === 1) {
      onMove({ tile, end: ends[0] as "LEFT" | "RIGHT" });
      return;
    }
    setSelected(tile);
  }

  function handleEndClick(end: "LEFT" | "RIGHT") {
    if (!selected) return;
    onMove({ tile: selected, end });
    setSelected(null);
  }

  const opponentSeat = mySeat === null ? null : mySeat === 0 ? 1 : 0;

  return (
    <div className={styles.wrap}>
      {opponentSeat !== null && (
        <div className={styles.opponentRow}>
          <span className={styles.handCountLabel}>{t("game.dominoes.tiles_left", { count: handCounts[opponentSeat] })}</span>
          <div className={styles.opponentTiles}>
            {Array.from({ length: handCounts[opponentSeat] }).map((_, i) => (
              <div key={i} className={styles.tileBack} />
            ))}
          </div>
        </div>
      )}

      <div className={styles.table}>
        <div className={styles.lineViewport} dir="ltr">
          <div className={styles.line}>
            {line.tiles.length === 0 && <span className={styles.emptyHint}>{t("game.dominoes.empty_line")}</span>}
            {line.tiles.map((lt, i) => (
              <DominoTile key={i} values={lt.orientation} size="md" />
            ))}
          </div>
          {selected && selectedEnds.includes("LEFT") && (
            <button type="button" className={[styles.endZone, styles.endLeft].join(" ")} onClick={() => handleEndClick("LEFT")}>
              {t("game.dominoes.play_here")}
            </button>
          )}
          {selected && selectedEnds.includes("RIGHT") && (
            <button type="button" className={[styles.endZone, styles.endRight].join(" ")} onClick={() => handleEndClick("RIGHT")}>
              {t("game.dominoes.play_here")}
            </button>
          )}
        </div>
      </div>

      {hand && (
        <div className={styles.handRow} dir="ltr">
          <AnimatePresence initial={false}>
            {hand.map((tile) => {
              const forced = mustPlayTile !== null;
              const isForcedTile = forced && sameTile(tile, mustPlayTile!);
              const legal = !forced || isForcedTile;
              const ends = legalEndsFor(tile, line);
              const playable = canMove && legal && ends.length > 0;
              const isSelected = selected !== null && sameTile(tile, selected);
              return (
                <motion.button
                  key={`${tile[0]}-${tile[1]}`}
                  type="button"
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  whileHover={{ y: playable ? -6 : 0 }}
                  whileTap={{ scale: playable ? 0.96 : 1 }}
                  transition={transition.ui}
                  className={styles.handTile}
                  disabled={!playable}
                  onClick={() => handleTileClick(tile)}
                  aria-pressed={isSelected}
                >
                  <DominoTile values={tile} size="lg" faded={!playable} glow={isSelected} />
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {canMove && canPass && (
        <button type="button" className={styles.passButton} onClick={() => onMove({ pass: true })}>
          {t("game.dominoes.pass")}
        </button>
      )}
    </div>
  );
}
