/**
 * Seega's OWN registration -- the only file in this directory allowed to
 * import a seega-specific module. Everything generic (DuelShell,
 * ResultCeremony, ModeSelect, DifficultySelect, ...) knows Seega only
 * through the GamePlugin object exported below, resolved via the
 * registry at runtime. See chess.tsx's own header for why this file
 * exists at all.
 *
 * packages/game-seega/src/plugin.mjs's own project() emits
 * `{phase, board, turn, placedCount, legalPlacements?, legalMoves?}` --
 * unpacked here, and only here.
 */
import { SeegaBoard } from "@/components/game/SeegaBoard";
import { registerGame } from "./registry";
import type { BoardProps, GamePlugin } from "./types";

type SeegaMove = { from: number; to: number };
type SeegaView = {
  phase?: "PLACEMENT" | "MOVEMENT";
  board?: number[];
  legalPlacements?: number[];
  legalMoves?: SeegaMove[];
};

function SeegaBoardAdapter({ view, mySeat, canMove, onMove }: BoardProps) {
  const v = (view ?? {}) as SeegaView;
  if (!v.board || !v.phase) return null;
  return (
    <SeegaBoard
      phase={v.phase}
      board={v.board}
      legalPlacements={v.legalPlacements ?? []}
      legalMoves={v.legalMoves ?? []}
      mySeat={mySeat}
      canMove={canMove}
      onMove={(intent) => onMove(intent)}
    />
  );
}

export const seegaPlugin: GamePlugin = {
  id: "seega",
  nameKey: "seega",
  turnModel: "ALTERNATING",
  supportsAI: true,
  difficulties: ["EASY", "MEDIUM", "HARD", "EXPERT"],
  // true: a genuine positional grind (movement phase, repetition/40-move
  // draws) is exactly the shape checkers' own draw offer already fits --
  // two players may reasonably agree a position is dead long before the
  // 40-move rule would end it for them.
  supportsDraw: true,
  cashEnabled: true,
  Board: SeegaBoardAdapter,
};

registerGame(seegaPlugin);
