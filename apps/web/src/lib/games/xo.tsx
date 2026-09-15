/**
 * XO's OWN registration -- the only file in this directory allowed to
 * import an xo-specific module. Everything generic (DuelShell,
 * ResultCeremony, ModeSelect, DifficultySelect, ...) knows XO only
 * through the GamePlugin object exported below, resolved via the
 * registry at runtime. See chess.tsx's own header for why this file
 * exists at all.
 *
 * packages/game-xo/src/plugin.mjs's own project() emits
 * `{board, turn, lastMove, legalCells?}` -- unpacked here, and only here.
 */
import { XOBoard } from "@/components/game/XOBoard";
import { registerGame } from "./registry";
import type { BoardProps, GamePlugin } from "./types";

type XOView = {
  board?: number[];
  lastMove?: number | null;
  legalCells?: number[];
};

function XOBoardAdapter({ view, mySeat, canMove, onMove }: BoardProps) {
  const v = (view ?? {}) as XOView;
  if (!v.board) return null;
  const fallbackLegal = v.board.map((m, idx) => (m === 0 ? idx : -1)).filter((idx) => idx >= 0);
  return (
    <XOBoard
      board={v.board}
      lastMove={v.lastMove ?? null}
      legalCells={v.legalCells && v.legalCells.length > 0 ? v.legalCells : fallbackLegal}
      mySeat={mySeat}
      canMove={canMove}
      onMove={(cell) => onMove(cell)}
    />
  );
}

export const xoPlugin: GamePlugin = {
  id: "xo",
  nameKey: "xo",
  turnModel: "ALTERNATING",
  supportsAI: true,
  difficulties: ["EASY", "MEDIUM", "HARD", "EXPERT"],
  supportsDraw: true,
  cashEnabled: true, // a solved game -- see db/migrations/0029's own comment
  Board: XOBoardAdapter,
};

registerGame(xoPlugin);
