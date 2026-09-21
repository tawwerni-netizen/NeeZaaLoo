"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { parseFenBoard, squareAt, sideToMoveFromFen, FILES, applyMoveOptimistic, type Piece } from "./fen";
import { ChessPieceSvg } from "./ChessPieceSvg";
import { useI18n } from "@/lib/i18n/context";
import { useVisualSettings } from "./TableEnvironment";
import { playPieceSound, CHESS_THEMES, type ChessBoardTheme } from "@/lib/chess-audio";
import { ChessAmbientPlayer } from "./ChessAmbientPlayer";
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
  const serverBoard = useMemo(() => parseFenBoard(fen), [fen]);
  const sideToMove = useMemo(() => sideToMoveFromFen(fen), [fen]);
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingPromo, setPendingPromo] = useState<{ from: string; to: string } | null>(null);
  const [theme, setTheme] = useState<ChessBoardTheme>("emerald");
  const lastSoundMoveRef = useRef<string | null>(null);

  // Optimistic UI state: updates the board with 0ms latency when the user plays
  const [optimisticState, setOptimisticState] = useState<{
    board: (Piece | null)[][];
    lastMove: { from: string; to: string };
  } | null>(null);

  // Whenever authoritative server FEN arrives, clear optimistic state
  useEffect(() => {
    setOptimisticState(null);
  }, [fen]);

  const activeBoard = optimisticState?.board ?? serverBoard;
  const activeLastMove = optimisticState?.lastMove ?? lastMove;
  const effectiveCanMove = canMove && !optimisticState;

  useEffect(() => {
    try {
      const saved = localStorage.getItem("nizalo_chess_theme") as ChessBoardTheme | null;
      if (saved && CHESS_THEMES[saved]) setTheme(saved);
    } catch {}
  }, []);

  function handleThemeChange(tId: ChessBoardTheme) {
    setTheme(tId);
    try {
      localStorage.setItem("nizalo_chess_theme", tId);
    } catch {}
  }

  // Play piece-specific sound when opponent moves
  useEffect(() => {
    if (!lastMove) return;
    const moveKey = `${lastMove.from}-${lastMove.to}`;
    if (lastSoundMoveRef.current === moveKey) return;
    lastSoundMoveRef.current = moveKey;

    const destFile = FILES.indexOf(lastMove.to[0] || "");
    const destRank = parseInt(lastMove.to[1] || "1", 10) - 1;
    const piece = squareAt(serverBoard, destFile, destRank);
    playPieceSound(piece?.type || "p", false, inCheck);
  }, [lastMove, serverBoard, inCheck]);

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
    if (!effectiveCanMove || pendingPromo) return;
    const sq = squareLabel(file, rank);
    const piece = squareAt(activeBoard, file, rank);

    if (selected && destinationsFromSelected.has(sq)) {
      const matching = legalMoves.filter((m) => m.startsWith(selected) && m.slice(2, 4) === sq);
      const fromFile = FILES.indexOf(selected[0] || "");
      const fromRank = parseInt(selected[1] || "1", 10) - 1;
      const movingPiece = squareAt(activeBoard, fromFile, fromRank);
      const destPiece = squareAt(activeBoard, file, rank);

      if (matching.length > 1) {
        setPendingPromo({ from: selected, to: sq });
      } else if (matching[0]) {
        playPieceSound(movingPiece?.type || "p", Boolean(destPiece), inCheck);
        lastSoundMoveRef.current = `${selected}-${sq}`;
        // Apply move immediately to local board for 0ms visual feedback
        const nextBoard = applyMoveOptimistic(activeBoard, selected, sq);
        setOptimisticState({
          board: nextBoard,
          lastMove: { from: selected, to: sq },
        });
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

  function choosePromotion(promoPiece: (typeof PROMO_PIECES)[number]) {
    if (!pendingPromo) return;
    playPieceSound(promoPiece, false, inCheck);
    lastSoundMoveRef.current = `${pendingPromo.from}-${pendingPromo.to}`;
    // Apply promotion immediately to local board for 0ms visual feedback
    const nextBoard = applyMoveOptimistic(activeBoard, pendingPromo.from, pendingPromo.to, promoPiece);
    setOptimisticState({
      board: nextBoard,
      lastMove: { from: pendingPromo.from, to: pendingPromo.to },
    });
    onMove(`${pendingPromo.from}${pendingPromo.to}${promoPiece}`);
    setPendingPromo(null);
  }


  const currentColors = CHESS_THEMES[theme] || CHESS_THEMES.emerald;

  return (
    <div
      className={styles.wrap}
      style={{
        "--theme-sq-light": currentColors.lightSq,
        "--theme-sq-dark": currentColors.darkSq,
        "--board-border": currentColors.border,
      } as React.CSSProperties}
    >
      {/* Theme Picker & Ambient Music Controls */}
      <div className={styles.themeControls}>
        <div className={styles.themeSelector}>
          {(Object.keys(CHESS_THEMES) as ChessBoardTheme[]).map((tId) => (
            <button
              key={tId}
              type="button"
              className={`${styles.themeBtn} ${theme === tId ? styles.themeBtnActive : ""}`}
              onClick={() => handleThemeChange(tId)}
              title={CHESS_THEMES[tId].nameAr}
            >
              <span
                className={styles.themeColorDot}
                style={{ background: CHESS_THEMES[tId].darkSq }}
              />
              <span>{CHESS_THEMES[tId].nameAr}</span>
            </button>
          ))}
        </div>
        <ChessAmbientPlayer />
      </div>

      <div className={[styles.boardContainer, perspective3D ? styles.perspective : ""].join(" ")}>
        {/* Outer 3D Table Bevel Frame - strictly LTR for universal chess notation alignment */}
        <div className={styles.tableBevel} dir="ltr">
          {/* Rank notations on left rim */}
          <div className={styles.rankNotations} dir="ltr" aria-hidden="true">
            {displayRanks.map((r) => (
              <span key={r}>{r}</span>
            ))}
          </div>

          <div className={styles.board} dir="ltr" role="grid" aria-label={t("game.move_history")}>
            {displayRanks.map((rank) =>
              displayFiles.map((fileLetter) => {
                const file = FILES.indexOf(fileLetter);
                const r = rank - 1;
                const piece = squareAt(activeBoard, file, r);
                const sq = squareLabel(file, r);
                const isLight = (file + r) % 2 === 1;
                const isSelected = selected === sq;
                const isDest = destinationsFromSelected.has(sq);
                const isLast = activeLastMove && (activeLastMove.from === sq || activeLastMove.to === sq);
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
                    disabled={!effectiveCanMove}
                  >
                    {piece && (
                      <motion.div
                        className={styles.pieceContainer}
                        {...(quality !== "low" ? { layoutId: `chess-piece-${sq}` } : {})}
                        initial={isLast && activeLastMove?.to === sq ? { scale: 1.15, y: -10 } : false}
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
          <div className={styles.fileNotations} dir="ltr" aria-hidden="true">
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
