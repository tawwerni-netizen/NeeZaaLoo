/**
 * Checkers' OWN registration -- the only file in this directory allowed to
 * import a checkers-specific module. Everything generic (DuelShell,
 * ResultCeremony, ModeSelect, DifficultySelect, ...) knows Checkers only
 * through the GamePlugin object exported below, resolved via the registry
 * at runtime. See chess.tsx's own header for why this file exists at all.
 *
 * packages/game-checkers/src/plugin.mjs's own project() emits
 * `{board, turn, forcedFrom, pieceCounts, legalMoves?}` -- unpacked here,
 * and only here.
 */
import { CheckersBoard } from "@/components/game/CheckersBoard";
import { registerGame } from "./registry";
import type { BoardProps, GamePlugin } from "./types";

type CheckersView = {
  board?: number[][];
  turn?: 0 | 1;
  forcedFrom?: string | null;
  legalMoves?: string[];
};

function CheckersBoardAdapter({ view, lastMove, mySeat, canMove, onMove }: BoardProps) {
  const v = (view ?? {}) as CheckersView;
  if (!v.board) return null;
  return (
    <CheckersBoard
      board={v.board}
      turn={v.turn ?? 0}
      forcedFrom={v.forcedFrom ?? null}
      legalMoves={v.legalMoves ?? []}
      lastMove={typeof lastMove === "string" ? lastMove : null}
      mySeat={mySeat}
      canMove={canMove}
      onMove={(move) => onMove(move)}
    />
  );
}

export const checkersPlugin: GamePlugin = {
  id: "checkers",
  nameKey: "checkers",
  turnModel: "ALTERNATING",
  supportsAI: true,
  difficulties: ["EASY", "MEDIUM", "HARD", "EXPERT"],
  supportsDraw: true,
  cashEnabled: false, // a solved-adjacent game -- see db/migrations/0028's own comment
  Board: CheckersBoardAdapter,
};

registerGame(checkersPlugin);
