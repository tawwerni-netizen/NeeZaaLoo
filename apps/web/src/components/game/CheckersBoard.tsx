"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/lib/i18n/context";
import { useVisualSettings } from "./TableEnvironment";
import styles from "./CheckersBoard.module.css";

const FILES = "abcdefgh";
const squareLabel = (row: number, col: number) => `${FILES[col]}${8 - row}`;

type Props = {
  board: number[][]; // 8x8, row 0 = rank 8 (top). 0 empty, 1/2 seat0 man/king, -1/-2 seat1 man/king.
  turn: 0 | 1;
  forcedFrom: string | null;
  legalMoves: string[]; // "c3d4" pairs, own seat only
  lastMove: string | null; // the raw "c3d4" intent, or null
  mySeat: 0 | 1 | null;
  canMove: boolean;
  onMove: (move: string) => void;
};

export function CheckersPieceSvg({ isKing, seat }: { isKing: boolean; seat: "0" | "1" }) {
  const isRed = seat === "0";
  const gradId = isRed ? "chk-red-grad" : "chk-dark-grad";
  const strokeColor = isRed ? "#7a1a12" : "#0d0f12";

  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" className={styles.pieceSvg}>
      <defs>
        <radialGradient id="chk-red-grad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FF6B4A" />
          <stop offset="45%" stopColor="#E03818" />
          <stop offset="85%" stopColor="#9E1D0E" />
          <stop offset="100%" stopColor="#5A0E06" />
        </radialGradient>
        <radialGradient id="chk-dark-grad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#4A5260" />
          <stop offset="45%" stopColor="#252A33" />
          <stop offset="85%" stopColor="#14171C" />
          <stop offset="100%" stopColor="#0B0D10" />
        </radialGradient>
        <radialGradient id="chk-specular" cx="30%" cy="25%" r="40%">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.45)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>

      {/* Outer 3D Rim */}
      <circle cx="50" cy="50" r="45" fill={`url(#${gradId})`} stroke={strokeColor} strokeWidth="3" />
      {/* Concentric Lathe Rings */}
      <circle cx="50" cy="50" r="37" fill="none" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="28" fill="none" stroke="rgba(0, 0, 0, 0.35)" strokeWidth="2" />
      <circle cx="50" cy="50" r="24" fill={`url(#${gradId})`} />
      {/* Top Specular Highlight */}
      <circle cx="50" cy="50" r="43" fill="url(#chk-specular)" />

      {/* Gold Crown for King */}
      {isKing && (
        <g filter="drop-shadow(0 2px 3px rgba(0,0,0,0.6))">
          <path
            d="M 28 64 L 72 64 L 70 42 L 59 52 L 50 34 L 41 52 L 30 42 Z"
            fill="#F6D365"
            stroke="#9E782F"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <circle cx="30" cy="40" r="2.5" fill="#FFF" />
          <circle cx="50" cy="32" r="3" fill="#FFF" />
          <circle cx="70" cy="40" r="2.5" fill="#FFF" />
        </g>
      )}
    </svg>
  );
}

export function CheckersBoard({ board, forcedFrom, legalMoves, lastMove, mySeat, canMove, onMove }: Props) {
  const { t } = useI18n();
  const { perspective3D, quality } = useVisualSettings();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setSelected(forcedFrom);
  }, [forcedFrom]);

  const flipped = mySeat === 1;
  const displayRows = flipped ? [...Array(8).keys()].reverse() : [...Array(8).keys()];
  const displayCols = flipped ? [...Array(8).keys()].reverse() : [...Array(8).keys()];

  const destinationsFromSelected = useMemo(() => {
    if (!selected) return new Set<string>();
    const set = new Set<string>();
    for (const m of legalMoves) if (m.startsWith(selected)) set.add(m.slice(2, 4));
    return set;
  }, [selected, legalMoves]);

  const lastMoveSquares = useMemo(() => {
    if (typeof lastMove !== "string" || lastMove.length !== 4) return null;
    return { from: lastMove.slice(0, 2), to: lastMove.slice(2, 4) };
  }, [lastMove]);

  const capturedSquare = useMemo(() => {
    if (!lastMoveSquares) return null;
    const { from, to } = lastMoveSquares;
    if (!isJumpDestination(from, to)) return null;
    const fromFile = FILES.indexOf(from[0] ?? ""), fromRank = Number(from[1]);
    const toFile = FILES.indexOf(to[0] ?? ""), toRank = Number(to[1]);
    const midFile = (fromFile + toFile) / 2, midRank = (fromRank + toRank) / 2;
    return `${FILES[midFile]}${midRank}`;
  }, [lastMoveSquares]);

  function isJumpDestination(from: string, to: string) {
    return Math.abs(FILES.indexOf(to[0] ?? "") - FILES.indexOf(from[0] ?? "")) === 2;
  }

  function handleClick(row: number, col: number) {
    if (!canMove) return;
    const sq = squareLabel(row, col);

    if (forcedFrom) {
      if (destinationsFromSelected.has(sq)) onMove(`${forcedFrom}${sq}`);
      return;
    }

    if (selected && destinationsFromSelected.has(sq)) {
      onMove(`${selected}${sq}`);
      setSelected(null);
      return;
    }

    const piece = board[row]?.[col] ?? 0;
    const isMine = mySeat === 0 ? piece > 0 : piece < 0;
    if (isMine && legalMoves.some((m) => m.startsWith(sq))) {
      setSelected(sq === selected ? null : sq);
    } else {
      setSelected(null);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={[styles.boardContainer, perspective3D ? styles.perspective : ""].join(" ")}>
        <div className={styles.tableBevel}>
          <div className={styles.board} dir="ltr" role="grid" aria-label={t("game.move_history")}>
            {displayRows.map((row) =>
              displayCols.map((col) => {
                const piece = board[row]?.[col] ?? 0;
                const sq = squareLabel(row, col);
                const isDark = (row + col) % 2 === 1;
                const isSelected = selected === sq;
                const isDest = destinationsFromSelected.has(sq);
                const isLast = lastMoveSquares && (lastMoveSquares.from === sq || lastMoveSquares.to === sq);
                const isKingPiece = Math.abs(piece) === 2;
                const isCaptured = capturedSquare === sq;

                return (
                  <button
                    key={sq}
                    type="button"
                    role="gridcell"
                    aria-label={sq}
                    className={[
                      styles.square,
                      isDark ? styles.dark : styles.light,
                      isLast ? styles.lastMove : "",
                      isSelected ? styles.selected : "",
                    ].join(" ")}
                    onClick={() => handleClick(row, col)}
                    disabled={!canMove || !isDark}
                  >
                    {isCaptured && <span key={lastMove} className={styles.captureFlash} aria-hidden="true" />}
                    {piece !== 0 && (
                      <motion.div
                        className={styles.piece}
                        {...(quality !== "low" ? { layoutId: `checkers-piece-${sq}` } : {})}
                        initial={isLast && lastMoveSquares?.to === sq ? { scale: 1.2, y: -12 } : false}
                        animate={{
                          scale: isSelected ? 1.15 : 1,
                          y: isSelected ? -8 : 0,
                          z: isSelected ? 24 : 0,
                        }}
                        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <CheckersPieceSvg isKing={isKingPiece} seat={piece > 0 ? "0" : "1"} />
                      </motion.div>
                    )}
                    {isDest && (
                      <span
                        className={isJumpDestination(selected ?? forcedFrom ?? sq, sq) ? styles.captureHint : styles.moveHint}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
