/**
 * Registers every game this build knows about, in canonical priority order:
 * 1. Chess (الشطرنج)
 * 2. Dominoes (الضمنة)
 * 3. Ludo (لودو الأساطير)
 * 4. Backgammon (طاولة الزهر)
 * 5. Speed Math (أولمبياد الحساب السريع)
 * 6. XO Blitz (إكس أو الخاطفة)
 * 7. Connect Four (أربعة في صف)
 * 8. Checkers (الداما)
 * 9. Reversi (ريفيرسي)
 * 10. Gomoku (غوموكو)
 * 11. Seega (السيجة)
 */
import "./chess";
import "./dominoes";
import "./ludo";
import "./backgammon";
import "./speed-math";
import "./xo";
import "./connect-four";
import "./checkers";
import "./reversi";
import "./gomoku";
import "./seega";

export { GameRegistry, getGame, listGames, registerGame } from "./registry";
export type {
  GameDefinition,
  GamePlugin,
  GameCategory,
  GameVariant,
  GameAvailability,
  GameAvailabilityStatus,
  GameMode,
  GameModeType,
  GameStakeEligibility,
  RulesVersion,
  BoardProps,
  Difficulty,
} from "./types";
export { DIFFICULTIES } from "./types";
