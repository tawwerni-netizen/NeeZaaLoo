/**
 * Ludo registration.
 */
import { LudoBoard } from "@/components/game/LudoBoard";
import { registerGame } from "./registry";
import type { BoardProps, GamePlugin } from "./types";

type LudoView = {
  turn: number;
  phase: "ROLL" | "MOVE";
  currentRoll: number | null;
  rollCount: number;
  tokens: number[][];
  legalMoves: number[];
};

function LudoBoardAdapter({ view, mySeat, canMove, onMove }: BoardProps) {
  const v = (view ?? {
    turn: 0,
    phase: "ROLL",
    currentRoll: null,
    rollCount: 0,
    tokens: [[0, 0, 0, 0], [0, 0, 0, 0]],
    legalMoves: [],
  }) as LudoView;

  return (
    <LudoBoard
      turn={v.turn}
      phase={v.phase}
      currentRoll={v.currentRoll}
      rollCount={v.rollCount}
      tokens={v.tokens}
      legalMoves={v.legalMoves}
      mySeat={mySeat}
      canMove={canMove}
      onMove={onMove}
    />
  );
}

export const ludoPlugin: GamePlugin = {
  id: "ludo",
  nameKey: "ludo", // Make sure this key exists in localization or is fine falling back
  turnModel: "ALTERNATING",
  supportsAI: true,
  difficulties: ["EASY", "MEDIUM", "HARD", "EXPERT"], // Same as dominoes
  supportsDraw: false,
  cashEnabled: true,
  Board: LudoBoardAdapter,
};

registerGame(ludoPlugin);
