"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/lib/i18n/context";
import { transition } from "@/lib/motion";
import { useVisualSettings } from "./TableEnvironment";
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

function legalEndsFor(tile: Tile, line?: Line): Array<"LEFT" | "RIGHT" | "ANY"> {
  if (!line || !Array.isArray(line.tiles) || line.tiles.length === 0) return ["ANY"];
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
      <defs>
        <radialGradient id="pip-inset" cx="40%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#111" />
          <stop offset="80%" stopColor="#252525" />
          <stop offset="100%" stopColor="#444" />
        </radialGradient>
      </defs>
      {(PIP_LAYOUTS[value] ?? []).map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={9.5} fill="url(#pip-inset)" filter="drop-shadow(0 1px 1px rgba(255,255,255,0.4))" />
      ))}
    </svg>
  );
}

function DominoTile({
  values = [0, 0], size = "md", faded = false, glow = false,
}: {
  values?: [number, number] | Tile; size?: "sm" | "md" | "lg"; faded?: boolean; glow?: boolean;
}) {
  const safeValues: [number, number] = Array.isArray(values) && values.length === 2 ? values : [0, 0];
  return (
    <div className={[styles.tile3d, styles[`tile-${size}`], faded ? styles.faded : "", glow ? styles.glow : ""].join(" ")}>
      {/* 3D Tile Face */}
      <div className={styles.tileFace}>
        <div className={styles.half}><Pips value={safeValues[0] ?? 0} /></div>
        <div className={styles.divider}>
          {/* Metallic brass center spinner rivet */}
          <span className={styles.spinnerRivet} />
        </div>
        <div className={styles.half}><Pips value={safeValues[1] ?? 0} /></div>
      </div>
    </div>
  );
}

export function DominoesBoard({ line, handCounts, hand, mustPlayTile, canPass, mySeat, canMove, onMove }: Props) {
  const { t } = useI18n();
  const { perspective3D, quality } = useVisualSettings();
  const [selected, setSelected] = useState<Tile | null>(null);

  const selectedEnds = useMemo(
    () => (selected ? legalEndsFor(selected, line) : []),
    [selected, line]
  );

  function handleTileClick(tile: Tile) {
    if (!canMove) return;
    if (mustPlayTile && !sameTile(tile, mustPlayTile)) return;
    // Allow deselecting the active tile
    if (selected && sameTile(tile, selected)) {
      setSelected(null);
      return;
    }
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

  function handleEndClick(end: "LEFT" | "RIGHT", e?: React.SyntheticEvent) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (!selected) return;
    onMove({ tile: selected, end });
    setSelected(null);
  }

  const opponentSeat = mySeat === null ? null : mySeat === 0 ? 1 : 0;
  const oppCount = opponentSeat !== null && handCounts && typeof handCounts[opponentSeat] === "number"
    ? Math.max(0, handCounts[opponentSeat])
    : 0;
  const safeTiles = Array.isArray(line?.tiles) ? line.tiles : [];

  return (
    <div className={styles.wrap}>
      {opponentSeat !== null && (
        <div className={styles.opponentRow}>
          <span className={styles.handCountLabel}>{t("game.dominoes.tiles_left", { count: oppCount })}</span>
          <div className={styles.opponentTiles}>
            {Array.from({ length: oppCount }).map((_, i) => (
              <div key={i} className={styles.tileBack} />
            ))}
          </div>
        </div>
      )}

      {/* 3D Felt Table Surface */}
      <div className={[styles.tableContainer, perspective3D ? styles.perspective : ""].join(" ")}>
        <div className={styles.tableFelt} onClick={() => setSelected(null)}>
          <div className={styles.lineViewport} dir="ltr">
            <div className={styles.line} onClick={(e) => e.stopPropagation()}>
              {safeTiles.length === 0 && <span className={styles.emptyHint}>{t("game.dominoes.empty_line")}</span>}
              {safeTiles.map((lt, i) => {
                const isLeftEnd = i === 0 && selected && selectedEnds.includes("LEFT");
                const isRightEnd = i === safeTiles.length - 1 && selected && selectedEnds.includes("RIGHT");
                const orientation = lt?.orientation ?? lt?.tile ?? [0, 0];
                return (
                  <motion.div
                    key={i}
                    initial={i === safeTiles.length - 1 ? { scale: 1.15, y: -8, opacity: 0 } : false}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    style={{ cursor: (isLeftEnd || isRightEnd) ? "pointer" : "default" }}
                    onClick={(e) => {
                      if (isLeftEnd) handleEndClick("LEFT", e);
                      else if (isRightEnd) handleEndClick("RIGHT", e);
                    }}
                  >
                    <DominoTile values={orientation} size="md" glow={Boolean(isLeftEnd || isRightEnd)} />
                  </motion.div>
                );
              })}
            </div>
            {selected && selectedEnds.includes("LEFT") && (
              <button
                type="button"
                className={[styles.endZone, styles.endLeft].join(" ")}
                onClick={(e) => handleEndClick("LEFT", e)}
                onTouchEnd={(e) => handleEndClick("LEFT", e)}
              >
                <span className={styles.endZoneGlow} />
                {t("game.dominoes.play_here")}
              </button>
            )}
            {selected && selectedEnds.includes("RIGHT") && (
              <button
                type="button"
                className={[styles.endZone, styles.endRight].join(" ")}
                onClick={(e) => handleEndClick("RIGHT", e)}
                onTouchEnd={(e) => handleEndClick("RIGHT", e)}
              >
                <span className={styles.endZoneGlow} />
                {t("game.dominoes.play_here")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3D Hand Tray */}
      {hand && (
        <div className={styles.handTrayWrap} dir="ltr">
          <div className={styles.handTrayBevel}>
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
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: isSelected ? -10 : 0, scale: isSelected ? 1.08 : 1 }}
                    exit={{ opacity: 0, y: -16 }}
                    whileHover={{ y: playable ? -8 : 0 }}
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
