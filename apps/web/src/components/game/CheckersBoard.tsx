"use client";

/**
 * The Checkers board -- server-authoritative, the same discipline as
 * ChessBoard.tsx: selection is the ONLY client-side state, `legalMoves`
 * is the plugin's own projection (packages/game-checkers/src/plugin.mjs's
 * project()), and a click never moves a piece directly -- it only ever
 * calls `onMove("c3d4")`, sent as an ordinary INTENT.
 *
 * Mandatory multi-jump: when the server's own state carries a
 * `forcedFrom` square (packages/game-checkers/src/checkers.mjs's own
 * rule -- a capturing piece that can jump again MUST), that square is
 * auto-selected and is the ONLY selectable square; the player cannot
 * even try to move a different piece, matching what the server would
 * refuse anyway.
 *
 * RTL note: forced `dir="ltr"` internally, exactly like the chess board,
 * for the same reason -- a board's own geometry never mirrors.
 */
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
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

export function CheckersBoard({ board, forcedFrom, legalMoves, lastMove, mySeat, canMove, onMove }: Props) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);

  // The server's own forced-continuation square always wins over whatever
  // the player had clicked -- it is not a suggestion.
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

  // Capture effect: the square the last move jumped OVER, if it was a
  // capture -- the midpoint between from and to. Re-keyed on `lastMove`
  // itself so the flash animation replays for every new capture, not just
  // the first one to land on a given square.
  const capturedSquare = useMemo(() => {
    if (!lastMoveSquares) return null;
    const { from, to } = lastMoveSquares;
    if (!isJumpDestination(from, to)) return null;
    const fromFile = FILES.indexOf(from[0] ?? ""), fromRank = Number(from[1]);
    const toFile = FILES.indexOf(to[0] ?? ""), toRank = Number(to[1]);
    const midFile = (fromFile + toFile) / 2, midRank = (fromRank + toRank) / 2;
    return `${FILES[midFile]}${midRank}`;
  }, [lastMoveSquares]);

  // A checkers capture always LANDS on an empty square (you jump OVER the
  // captured piece, never onto it) -- so, unlike chess, "is this
  // destination a capture" can never be read off what currently occupies
  // the destination cell. It IS always exactly 2 files/ranks away from
  // the origin, where a simple move is always exactly 1 -- a fixed
  // geometric fact of this ruleset, not a heuristic.
  function isJumpDestination(from: string, to: string) {
    return Math.abs(FILES.indexOf(to[0] ?? "") - FILES.indexOf(from[0] ?? "")) === 2;
  }

  function handleClick(row: number, col: number) {
    if (!canMove) return;
    const sq = squareLabel(row, col);

    if (forcedFrom) {
      // Only the forced piece's own destinations are ever legal right now.
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
                  <span
                    className={[styles.piece, isKingPiece ? styles.king : ""].join(" ")}
                    data-seat={piece > 0 ? "0" : "1"}
                  >
                    {isKingPiece && <span className={styles.crown} aria-hidden="true">&#9813;</span>}
                  </span>
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
  );
}
