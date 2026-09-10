/**
 * Reversi's OWN registration -- the only file in this directory allowed
 * to import a reversi-specific module. Everything generic (DuelShell,
 * ResultCeremony, ModeSelect, DifficultySelect, ...) knows Reversi only
 * through the GamePlugin object exported below, resolved via the
 * registry at runtime. See chess.tsx's own header for why this file
 * exists at all.
 *
 * packages/game-reversi/src/plugin.mjs's own project() emits
 * `{board, turn, counts, lastMove, legalMoves?}` -- unpacked here, and
 * only here.
 *
 * supportsDraw is false: standard Othello has no natural mid-game
 * "agree to a draw" moment the way a long positional grind (checkers,
 * chess, Seega) does -- the outcome is only a single disc count at the
 * very end, and can still flip on the last move, so there is nothing
 * sensible to offer early.
 */
import { ReversiBoard } from "@/components/game/ReversiBoard";
import { registerGame } from "./registry";
import type { BoardProps, GamePlugin } from "./types";

type LastMove = { action: "PLACE"; seat: 0 | 1; place: number; flipped: number[] } | { action: "PASS"; seat: 0 | 1 } | null;
type ReversiView = {
  board?: number[];
  legalMoves?: number[];
  lastMove?: LastMove;
};

function ReversiBoardAdapter({ view, mySeat, canMove, onMove }: BoardProps) {
  const v = (view ?? {}) as ReversiView;
  if (!v.board) return null;
  return (
    <ReversiBoard
      board={v.board}
      legalMoves={v.legalMoves ?? []}
      lastMove={v.lastMove ?? null}
      mySeat={mySeat}
      canMove={canMove}
      onMove={(intent) => onMove(intent)}
    />
  );
}

export const reversiPlugin: GamePlugin = {
  id: "reversi",
  nameKey: "reversi",
  turnModel: "ALTERNATING",
  supportsAI: true,
  difficulties: ["EASY", "MEDIUM", "HARD", "EXPERT"],
  supportsDraw: false,
  cashEnabled: false,
  Board: ReversiBoardAdapter,
};

registerGame(reversiPlugin);
