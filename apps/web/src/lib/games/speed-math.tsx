/**
 * Speed Math's OWN registration -- the only file in this directory
 * allowed to import a speed-math-specific module. Everything generic
 * (DuelShell, ResultCeremony, ModeSelect, DifficultySelect, ...) knows
 * Speed Math only through the GamePlugin object exported below, resolved
 * via the registry at runtime. See chess.tsx's own header for why this
 * file exists at all.
 *
 * packages/game-speed-math/src/plugin.mjs's own project() emits
 * `{scores, you?, current?}` -- unpacked here, and only here. `you`/
 * `current` are absent for a spectator, by design (a spectator sees
 * scores only, per that plugin's own header on why).
 *
 * supportsDraw is false: duel-engine's own allowsDrawOffers() already
 * excludes every SIMULTANEOUS game by default (there is no natural
 * moment to offer or answer one when nobody is "to move"), and Speed
 * Math never opts back in.
 */
import { SpeedMathBoard } from "@/components/game/SpeedMathBoard";
import { registerGame } from "./registry";
import type { BoardProps, GamePlugin } from "./types";

type Question = { a: number; b: number; op: "+" | "-" | "*" | "/"; index: number };
type SpeedMathView = {
  scores?: { correct: [number, number]; answered: [number, number]; total: number };
  you?: { correct: number; wrong: number; answered: number };
  current?: Question | null;
};

function SpeedMathBoardAdapter({ view, mySeat, canMove, onMove }: BoardProps) {
  const v = (view ?? {}) as SpeedMathView;
  if (!v.scores) return null;
  return (
    <SpeedMathBoard
      scores={v.scores}
      you={v.you ?? null}
      current={v.current ?? null}
      mySeat={mySeat}
      canMove={canMove}
      onMove={(intent) => onMove(intent)}
    />
  );
}

export const speedMathPlugin: GamePlugin = {
  id: "speed-math",
  nameKey: "speed_math",
  turnModel: "SIMULTANEOUS",
  supportsAI: true,
  difficulties: ["EASY", "MEDIUM", "HARD", "EXPERT"],
  supportsDraw: false,
  cashEnabled: false,
  Board: SpeedMathBoardAdapter,
};

registerGame(speedMathPlugin);
