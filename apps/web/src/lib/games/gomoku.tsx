/**
 * Gomoku's OWN registration -- the only file in this directory allowed
 * to import a gomoku-specific module. Everything generic (DuelShell,
 * ResultCeremony, ModeSelect, DifficultySelect, ...) knows Gomoku only
 * through the GamePlugin object exported below, resolved via the
 * registry at runtime. See chess.tsx's own header for why this file
 * exists at all.
 *
 * packages/game-gomoku/src/plugin.mjs's own project() emits
 * `{board, turn, lastMove, legalCells?}` -- unpacked here, and only
 * here. Structurally identical in shape to XO's own view, at 225 cells
 * instead of 9.
 */
import { GomokuBoard } from "@/components/game/GomokuBoard";
import { registerGame } from "./registry";
import type { BoardProps, GamePlugin } from "./types";

type GomokuView = {
  board?: number[];
  lastMove?: number | null;
  legalCells?: number[];
};

function GomokuBoardAdapter({ view, mySeat, canMove, onMove }: BoardProps) {
  const v = (view ?? {}) as GomokuView;
  if (!v.board) return null;
  return (
    <GomokuBoard
      board={v.board}
      lastMove={v.lastMove ?? null}
      legalCells={v.legalCells ?? []}
      mySeat={mySeat}
      canMove={canMove}
      onMove={(cell) => onMove(cell)}
    />
  );
}

export const gomokuPlugin: GamePlugin = {
  id: "gomoku",
  nameKey: "gomoku",
  turnModel: "ALTERNATING",
  supportsAI: true,
  difficulties: ["EASY", "MEDIUM", "HARD", "EXPERT"],
  supportsDraw: true,
  cashEnabled: false,
  Board: GomokuBoardAdapter,
};

registerGame(gomokuPlugin);
