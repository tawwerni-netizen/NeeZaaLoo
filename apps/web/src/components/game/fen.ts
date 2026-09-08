/**
 * Pure FEN parsing for DISPLAY only. This never decides legality, a
 * result, or a clock reading -- those are exactly the concepts the
 * server-authoritative architecture never lets a client compute (see
 * packages/duel-engine's own header). This file only turns the board
 * placement field of a FEN the SERVER sent into a renderable 8x8 grid.
 */
export type Piece = { type: "p" | "n" | "b" | "r" | "q" | "k"; colour: "w" | "b" };

/** rank 8 (index 0) down to rank 1 (index 7), each a-file (index 0) to h-file (index 7). */
export function parseFenBoard(fen: string): (Piece | null)[][] {
  const placement = fen.trim().split(/\s+/)[0] ?? "";
  const rows = placement.split("/");
  return rows.map((row) => {
    const squares: (Piece | null)[] = [];
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) squares.push(null);
      } else {
        squares.push({
          type: ch.toLowerCase() as Piece["type"],
          colour: ch === ch.toUpperCase() ? "w" : "b",
        });
      }
    }
    return squares;
  });
}

/** "w" | "b" -- the side to move, straight from the FEN's own second field. */
export function sideToMoveFromFen(fen: string): "w" | "b" {
  return (fen.trim().split(/\s+/)[1] as "w" | "b" | undefined) ?? "w";
}

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

/** "e2" -> {file: 4, rank: 1} (0-indexed, rank 0 = rank "1"). */
export function algebraicToCoord(sq: string): { file: number; rank: number } {
  return { file: FILES.indexOf(sq.charAt(0)), rank: Number(sq.charAt(1)) - 1 };
}

export function squareAt(board: (Piece | null)[][], file: number, rank: number): Piece | null {
  // board[0] is rank 8; rank 0 (algebraic "1") is board's last row.
  return board[7 - rank]?.[file] ?? null;
}

const GLYPH: Record<string, string> = {
  wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
  bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟",
};

export function pieceGlyph(piece: Piece): string {
  return GLYPH[`${piece.colour}${piece.type}`] ?? "";
}
