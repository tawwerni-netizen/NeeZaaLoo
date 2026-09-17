/**
 * Billiards' OWN registration -- the only file in this directory allowed
 * to import a billiards-specific module, exactly like every other game's
 * own file here (see chess.tsx's own header for why this file exists at
 * all). packages/game-billiards/src/plugin.mjs's own project() emits
 * `{balls, pottedEver, turn, groups, broken, ballInHandFor, lastShot,
 * shotCount}` -- BilliardsBoard is the one place that shape is unpacked.
 */
import { BilliardsBoard } from "@/components/game/BilliardsBoard";
import { registerGame } from "./registry";
import type { GamePlugin } from "./types";

export const billiardsPlugin: GamePlugin = {
  id: "billiards",
  nameKey: "billiards",
  turnModel: "ALTERNATING",
  supportsAI: true,
  difficulties: ["EASY", "MEDIUM", "HARD", "EXPERT"],
  supportsDraw: true,
  cashEnabled: false, // matches game.cash_enabled in db/migrations/0059 -- off until reviewed and flipped on, same as every launch game
  Board: BilliardsBoard,
};

registerGame(billiardsPlugin);
