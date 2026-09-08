/**
 * The frontend Game Plugin contract -- the presentation-layer sibling of
 * packages/duel-engine/src/duel.mjs's own plugin contract. That file is
 * the authority on RULES (a plugin there owns applyIntent/evaluate/
 * project and nothing else); this is the authority on RENDERING (a
 * plugin here owns a Board component and a small declaration of what it
 * supports, and nothing else). Neither file knows the other exists.
 *
 * The generic factory (DuelShell, ResultCeremony, MatchmakingFlow,
 * ModeSelect, DifficultySelect, ...) NEVER imports a game's own module
 * and never switches on `gameId`. It reads exactly this shape, resolved
 * once through the registry (./registry.ts), and nothing else. A new
 * game is exactly one file that fills in this type and one import line
 * in ./index.ts -- see that file's own header.
 */
import type { ComponentType } from "react";

export type Difficulty = "EASY" | "MEDIUM" | "HARD" | "EXPERT";

export const DIFFICULTIES: readonly Difficulty[] = ["EASY", "MEDIUM", "HARD", "EXPERT"];

/**
 * What a game's own Board component receives. `view` and `lastMove` are
 * deliberately `unknown` here -- their real shape is whatever that
 * game's plugin.project() on the SERVER emits (a FEN string for chess,
 * a question/answer pair for Speed Math, hand tiles for Dominoes later),
 * and only that game's own Board component may know it. DuelShell reads
 * none of it; it only ever passes it through.
 */
export type BoardProps = {
  view: unknown;
  lastMove: unknown;
  /** True while it is genuinely this viewer's turn AND the duel is live --
   * already resolved against the server's own clock.toMove, never
   * something a Board re-derives. */
  canMove: boolean;
  mySeat: 0 | 1 | null;
  /** Send one intent -- a UCI string, an {answer:5} object, whatever this
   * game's own plugin.applyIntent expects. Never validated client-side;
   * the server may refuse it exactly like any other intent. */
  onMove: (intent: unknown) => void;
};

export type GamePlugin = {
  /** Matches a game's own backend plugin `id` exactly (see
   * packages/duel-engine/src/duel.mjs's registerPlugin) -- the same
   * string that names the row in the `game` table and the key every
   * duel/rating/matchmaking record already carries. */
  id: string;
  /** i18n key suffix: the display name lives at `common.game_names.<nameKey>`,
   * never duplicated here as a literal string (six locales, one source). */
  nameKey: string;
  turnModel: "ALTERNATING" | "SIMULTANEOUS";
  /** Whether packages/matchmaking/src/vs-computer.mjs's own
   * AI_SUPPORTED_GAMES set includes this game -- DifficultySelect renders
   * nothing at all when this is false, rather than offering a choice
   * that would 400 on submit. */
  supportsAI: boolean;
  /** Empty when supportsAI is false. */
  difficulties: readonly Difficulty[];
  /** Whether duel-engine's offerDraw/declineDraw/acceptDraw apply --
   * false for a SIMULTANEOUS game by default (see duel.mjs's own
   * allowsDrawOffers()), surfaced here so the shell knows whether to
   * ever show the draw banner/button at all. */
  supportsDraw: boolean;
  /** Mirrors `game.cash_enabled` -- StakeSelect shows "Free only" rather
   * than a stake amount when this is false. A solved game (Connect Four,
   * XO) is never cash-eligible regardless of this flag's value; that
   * policy lives server-side and this is only ever a display hint. */
  cashEnabled: boolean;
  Board: ComponentType<BoardProps>;
};
