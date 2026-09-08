/**
 * Chess's OWN registration -- the only file in this directory allowed to
 * import a chess-specific module. Everything generic (DuelShell,
 * ResultCeremony, ModeSelect, DifficultySelect, ...) knows Chess only
 * through the GamePlugin object exported below, resolved via the
 * registry at runtime; none of it imports this file directly.
 *
 * The adapter below exists for exactly one reason: packages/game-chess/
 * src/plugin.mjs's own project() emits `{fen, moves, ply, inCheck,
 * legalMoves?}` -- a shape only Chess's rules define -- while the
 * generic factory's BoardProps carries that as an opaque `view: unknown`
 * on principle (see types.ts's own header). This is the one seam where
 * the opaque value is finally unpacked, and it happens here, in Chess's
 * own file, not in anything shared.
 */
import { ChessBoard } from "@/components/game/ChessBoard";
import { registerGame } from "./registry";
import type { BoardProps, GamePlugin } from "./types";

type ChessView = {
  fen?: string;
  legalMoves?: string[];
  inCheck?: boolean;
};

function ChessBoardAdapter({ view, lastMove, mySeat, canMove, onMove }: BoardProps) {
  const v = (view ?? {}) as ChessView;
  if (!v.fen) return null;
  return (
    <ChessBoard
      fen={v.fen}
      legalMoves={v.legalMoves ?? []}
      lastMove={lastMove as { from: string; to: string } | null}
      inCheck={Boolean(v.inCheck)}
      mySeat={mySeat}
      canMove={canMove}
      onMove={(uci) => onMove(uci)}
    />
  );
}

export const chessPlugin: GamePlugin = {
  id: "chess",
  nameKey: "chess",
  turnModel: "ALTERNATING",
  supportsAI: true,
  difficulties: ["EASY", "MEDIUM", "HARD", "EXPERT"],
  supportsDraw: true,
  cashEnabled: false, // matches game.cash_enabled in db/migrations/0003 -- off until Phase 6 compliance
  Board: ChessBoardAdapter,
};

registerGame(chessPlugin);
