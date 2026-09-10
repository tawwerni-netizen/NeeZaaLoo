/**
 * Connect Four's OWN registration -- the only file in this directory
 * allowed to import a connect-four-specific module. See chess.tsx's own
 * header for why this file exists at all.
 *
 * packages/game-connect-four/src/plugin.mjs's own project() emits
 * `{board, turn, lastMove, legalColumns?}` -- unpacked here, and only
 * here. Note this game's OWN `lastMove` (a `{row,col}` object, straight
 * from the plugin's own state) is used instead of the generic BoardProps
 * `lastMove` DuelShell forwards (the raw intent -- here, a bare column
 * number, which is not enough on its own to know which row it landed in
 * for the drop animation).
 */
import { ConnectFourBoard } from "@/components/game/ConnectFourBoard";
import { registerGame } from "./registry";
import type { BoardProps, GamePlugin } from "./types";

type ConnectFourView = {
  board?: number[][];
  turn?: 0 | 1;
  lastMove?: { row: number; col: number } | null;
  legalColumns?: number[];
};

function ConnectFourBoardAdapter({ view, mySeat, canMove, onMove }: BoardProps) {
  const v = (view ?? {}) as ConnectFourView;
  if (!v.board) return null;
  return (
    <ConnectFourBoard
      board={v.board}
      turn={v.turn ?? 0}
      lastMove={v.lastMove ?? null}
      legalColumns={v.legalColumns ?? []}
      mySeat={mySeat}
      canMove={canMove}
      onMove={(col) => onMove(col)}
    />
  );
}

export const connectFourPlugin: GamePlugin = {
  id: "connect-four",
  nameKey: "connect_four",
  turnModel: "ALTERNATING",
  supportsAI: true,
  difficulties: ["EASY", "MEDIUM", "HARD", "EXPERT"],
  supportsDraw: true,
  cashEnabled: false, // a solved game -- see db/migrations/0028's own comment
  Board: ConnectFourBoardAdapter,
};

registerGame(connectFourPlugin);
