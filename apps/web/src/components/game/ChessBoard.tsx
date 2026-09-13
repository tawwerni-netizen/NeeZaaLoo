"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { parseFenBoard, squareAt, sideToMoveFromFen, FILES } from "./fen";
import { ChessPieceSvg } from "./ChessPieceSvg";
import { useI18n } from "@/lib/i18n/context";
import { useVisualSettings } from "./TableEnvironment";
import styles from "./ChessBoard.module.css";

type Props = {
  fen: string;
  legalMoves: string[];
  lastMove: { from: string; to: string } | null;
  inCheck: boolean;
  mySeat: 0 | 1 | null;
  canMove: boolean;
  onMove: (uci: string) => void;
};

const PROMO_PIECES = ["q", "r", "b", "n"] as const;

export function ChessBoard({ fen, legalMoves, lastMove, inCheck, mySeat, canMove, onMove }: Props) {
  const { t } = useI18n();
  const { perspective3D, quality } = useVisualSettings();
  const board = useMemo(() => parseFenBoard(fen), [fen]);
  const sideToMove = useMemo(() => sideToMoveFromFen(fen), [fen]);
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingPromo, setPendingPromo] = useState<{ from: string; to: string } | null>(null);

  const flipped = mySeat === 1;
  const displayFiles = flipped ? [...FILES].reverse() : FILES;
  const displayRanks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];

  const destinationsFromSelected = useMemo(() => {
    if (!selected) return new Set<string>();
    const set = new Set<string>();
    for (const uci of legalMoves) {
      if (uci.startsWith(selected)) set.add(uci.slice(2, 4));
    }
    return set;
  }, [selected, legalMoves]);

  function squareLabel(file: number, rank: number): string {
    return `${FILES[file]}${rank + 1}`;
  }

  function handleSquareClick(file: number, rank: number) {
    if (!canMove || pendingPromo) return;
    const sq = squareLabel(file, rank);
    const piece = squareAt(board, file, rank);

    if (selected && destinationsFromSelected.has(sq)) {
      const matching = legalMoves.filter((m) => m.startsWith(selected) && m.slice(2, 4) === sq);
      if (matching.length > 1) {
        setPendingPromo({ from: selected, to: sq });
      } else if (matching[0]) {
        onMove(matching[0]);
      }
      setSelected(null);
      return;
    }

    if (piece && piece.colour === (mySeat === 0 ? "w" : "b") && legalMoves.some((m) => m.startsWith(sq))) {
      setSelected(sq === selected ? null : sq);
    } else {
      setSelected(null);
    }
  }

  function choosePromotion(piece: (typeof PROMO_PIECES)[number]) {
    if (!pendingPromo) return;
    onMove(`${pendingPromo.from}${pendingPromo.to}${piece}`);
    setPendingPromo(null);
  }

  return (
    <div className={styles.wrap}>
      <div className={[styles.boardContainer, perspective3D ? styles.perspective : ""].join(" ")}>
        {/* Outer 3D Table Bevel Frame */}
        <div className={styles.tableBevel}>
          {/* Rank notations on left rim */}
          <div className={styles.rankNotations} aria-hidden="true">
            {displayRanks.map((r) => (
              <span key={r}>{r}</span>
            ))}
          </div>

          <div className={styles.board} dir="ltr" role="grid" aria-label={t("game.move_history")}>
            {displayRanks.map((rank) =>
              displayFiles.map((fileLetter) => {
                const file = FILES.indexOf(fileLetter);
                const r = rank - 1;
                const piece = squareAt(board, file, r);
                const sq = squareLabel(file, r);
                const isLight = (file + r) % 2 === 1;
                const isSelected = selected === sq;
                const isDest = destinationsFromSelected.has(sq);
                const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
                const isKingInCheck = inCheck && piece?.type === "k" && piece.colour === sideToMove;

                return (
                  <button
                    key={sq}
                    type="button"
                    role="gridcell"
                    aria-label={sq}
                    className={[
                      styles.square,
                      isLight ? styles.light : styles.dark,
                      isLast ? styles.lastMove : "",
                      isSelected ? styles.selected : "",
                      isKingInCheck ? styles.inCheck : "",
                    ].join(" ")}
                    onClick={() => handleSquareClick(file, r)}
                    disabled={!canMove}
                  >
                    {piece && (
                      <motion.div
                        className={styles.pieceContainer}
                        {...(quality !== "low" ? { layoutId: `chess-piece-${sq}` } : {})}
                        initial={isLast && lastMove?.to === sq ? { scale: 1.15, y: -10 } : false}
                        animate={{
                          scale: isSelected ? 1.14 : 1,
                          y: isSelected ? -8 : 0,
                          z: isSelected ? 20 : 0,
                        }}
                        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <ChessPieceSvg type={piece.type} colour={piece.colour} />
                      </motion.div>
                    )}
                    {isDest && (
                      <span
                        className={piece ? styles.captureRing : styles.moveDot}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* File notations on bottom rim */}
          <div className={styles.fileNotations} aria-hidden="true">
            {displayFiles.map((f) => (
              <span key={f}>{f}</span>
            ))}
          </div>
        </div>
      </div>

      {pendingPromo && (
        <div className={styles.promoOverlay} role="dialog" aria-label={t("game.promote_title")}>
          <div className={styles.promoCard}>
            <p className={styles.promoTitle}>{t("game.promote_title")}</p>
            <div className={styles.promoChoices}>
              {PROMO_PIECES.map((p) => (
                <button key={p} type="button" className={styles.promoChoice} onClick={() => choosePromotion(p)}>
                  <div className={styles.promoPieceWrap}>
                    <ChessPieceSvg type={p} colour={mySeat === 0 ? "w" : "b"} />
                  </div>
                  <span className={styles.promoLabel}>
                    {t(`game.promote_${p === "q" ? "queen" : p === "r" ? "rook" : p === "b" ? "bishop" : "knight"}`)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
