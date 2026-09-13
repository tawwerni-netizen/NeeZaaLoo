/**
 * Dominoes' OWN registration -- the only file in this directory allowed
 * to import a dominoes-specific module. Everything generic (DuelShell,
 * ResultCeremony, ModeSelect, DifficultySelect, ...) knows Dominoes only
 * through the GamePlugin object exported below, resolved via the
 * registry at runtime. See chess.tsx's own header for why this file
 * exists at all.
 *
 * packages/game-dominoes/src/plugin.mjs's own project() emits
 * `{line, turn, handCounts, hand?, mustPlayTile?, canPass?}` -- unpacked
 * here, and only here. `hand`/`mustPlayTile`/`canPass` are absent for a
 * spectator, by design (see that plugin's own header on why a hand is
 * private even from a spectator, unlike every other launch game).
 *
 * supportsDraw is false: this ruleset's only draw condition (an equal-
 * pip block) is a position-derived OUTCOME, never something either
 * player offers or agrees to mid-game -- there is no draw-offer moment
 * in Dominoes at all.
 */
import { DominoesBoard } from "@/components/game/DominoesBoard";
import { registerGame } from "./registry";
import type { BoardProps, GamePlugin } from "./types";

type Tile = [number, number];
type DominoesView = {
  line?: { left: number | null; right: number | null; tiles: { tile: Tile; orientation: [number, number] }[] };
  handCounts?: [number, number];
  hand?: Tile[];
  mustPlayTile?: Tile | null;
  canPass?: boolean;
};

function DominoesBoardAdapter({ view, mySeat, canMove, onMove }: BoardProps) {
  const v = (view ?? {}) as DominoesView;
  if (!v.line) return null;
  return (
    <DominoesBoard
      line={v.line}
      handCounts={v.handCounts ?? [0, 0]}
      hand={v.hand ?? null}
      mustPlayTile={v.mustPlayTile ?? null}
      canPass={v.canPass ?? false}
      mySeat={mySeat}
      canMove={canMove}
      onMove={(intent) => onMove(intent)}
    />
  );
}

export const dominoesPlugin: GamePlugin = {
  id: "dominoes",
  nameKey: "dominoes",
  turnModel: "ALTERNATING",
  supportsAI: true,
  difficulties: ["EASY", "MEDIUM", "HARD", "EXPERT"],
  supportsDraw: false,
  cashEnabled: true,
  Board: DominoesBoardAdapter,
};

registerGame(dominoesPlugin);
