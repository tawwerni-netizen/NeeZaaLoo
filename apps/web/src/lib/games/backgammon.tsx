/**
 * Backgammon's OWN registration -- the only file in this directory
 * allowed to import a backgammon-specific module. Everything generic
 * (DuelShell, ResultCeremony, ModeSelect, DifficultySelect, ...) knows
 * Backgammon only through the GamePlugin object exported below, resolved
 * via the registry at runtime. See chess.tsx's own header for why this
 * file exists at all.
 *
 * packages/game-backgammon/src/plugin.mjs's own project() emits
 * `{board, bar, off, turn, dice, legalActions?}` -- unpacked here, and
 * only here. `legalActions` is present only when it is genuinely this
 * seat's own turn (see that plugin's own header).
 *
 * supportsDraw is false: this ruleset has no draw condition at all (see
 * backgammon.mjs's own header) -- there is no position a draw offer
 * could ever apply to.
 */
import { BackgammonBoard } from "@/components/game/BackgammonBoard";
import { registerGame } from "./registry";
import type { BoardProps, GamePlugin } from "./types";

type LegalAction = { from: number | "BAR"; die: number; to: number | "OFF" };
type BackgammonView = {
  board?: number[];
  bar?: [number, number];
  off?: [number, number];
  dice?: number[];
  legalActions?: LegalAction[];
};

function BackgammonBoardAdapter({ view, mySeat, canMove, onMove }: BoardProps) {
  const v = (view ?? {}) as BackgammonView;
  if (!v.board) return null;
  return (
    <BackgammonBoard
      board={v.board}
      bar={v.bar ?? [0, 0]}
      off={v.off ?? [0, 0]}
      dice={v.dice ?? []}
      legalActions={v.legalActions ?? null}
      mySeat={mySeat}
      canMove={canMove}
      onMove={(intent) => onMove(intent)}
    />
  );
}

export const backgammonPlugin: GamePlugin = {
  id: "backgammon",
  nameKey: "backgammon",
  turnModel: "ALTERNATING",
  supportsAI: true,
  difficulties: ["EASY", "MEDIUM", "HARD", "EXPERT"],
  supportsDraw: false,
  cashEnabled: true,
  Board: BackgammonBoardAdapter,
};

registerGame(backgammonPlugin);
