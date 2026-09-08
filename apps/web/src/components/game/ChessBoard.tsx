"use client";

/**
 * The Chess board -- a real, playable, server-authoritative board.
 *
 * Selection state (which square is picked, which promotion is pending) is
 * the ONLY client-side state here. Everything else -- whose turn it is,
 * which moves are legal, whether a move is even accepted -- comes from
 * the server: `legalMoves` is the plugin's own projection
 * (packages/game-chess/src/plugin.mjs's `project()`), and a click never
 * moves a piece directly -- it only ever calls `onMove(uci)`, which the
 * game page sends as an ordinary INTENT. If the server refuses it
 * (REJECTED), the board simply never receives a new position and the
 * selection clears; there is no client-side "undo" because the client
 * never committed anything client-side to begin with.
 *
 * RTL note: the board's own internal square geometry is forced `dir="ltr"`
 * regardless of the page's writing direction. Files a-h always run the
 * same way a real chess record does in every language; only the
 * surrounding chrome (labels, player strips) follows the page's own
 * direction. Mirroring the board under Arabic would make a replay
 * unreadable against every other record of the same game.
 */
import { useMemo, useState } from "react";
import { parseFenBoard, squareAt, pieceGlyph, sideToMoveFromFen, FILES } from "./fen";
import { useI18n } from "@/lib/i18n/context";
import styles from "./ChessBoard.module.css";

type Props = {
  fen: string;
  legalMoves: string[];
  lastMove: { from: string; to: string } | null;
  inCheck: boolean;
  mySeat: 0 | 1 | null;
  canMove: boolean; // it is genuinely this viewer's turn AND the game is live
  onMove: (uci: string) => void;
};

const PROMO_PIECES = ["q", "r", "b", "n"] as const;

export function ChessBoard({ fen, legalMoves, lastMove, inCheck, mySeat, canMove, onMove }: Props) {
  const { t } = useI18n();
  const board = useMemo(() => parseFenBoard(fen), [fen]);
  const sideToMove = useMemo(() => sideToMoveFromFen(fen), [fen]);
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingPromo, setPendingPromo] = useState<{ from: string; to: string } | null>(null);

  // Black plays from Black's own side of the table -- ordinary chess UX,
  // and unrelated to page writing direction (see this file's own header).
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
        // Every match differs only in its trailing promotion letter.
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
                {piece && <span className={styles.piece} data-colour={piece.colour}>{pieceGlyph(piece)}</span>}
                {isDest && <span className={piece ? styles.captureHint : styles.moveHint} aria-hidden="true" />}
              </button>
            );
          })
        )}
      </div>

      {pendingPromo && (
        <div className={styles.promoOverlay} role="dialog" aria-label={t("game.promote_title")}>
          <div className={styles.promoCard}>
            <p className={styles.promoTitle}>{t("game.promote_title")}</p>
            <div className={styles.promoChoices}>
              {PROMO_PIECES.map((p) => (
                <button key={p} type="button" className={styles.promoChoice} onClick={() => choosePromotion(p)}>
                  {pieceGlyph({ type: p, colour: mySeat === 0 ? "w" : "b" })}
                  <span className={styles.promoLabel}>{t(`game.promote_${p === "q" ? "queen" : p === "r" ? "rook" : p === "b" ? "bishop" : "knight"}`)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
