/**
 * Registers every game this build knows about, in canonical priority order:
 * 1. Chess (الشطرنج)
 * 2. Dominoes (الضمنة)
 * 3. Backgammon (طاولة الزهر)
 * Followed by high-velocity / high-liquidity skill games:
 * 4. Speed Math (أولمبياد الحساب السريع)
 * 5. XO Blitz (إكس أو الخاطفة)
 * 6. Connect Four (أربعة في صف)
 * 7. Checkers (الداما)
 * 8. Reversi (ريفيرسي)
 * 9. Gomoku (غوموكو)
 * 10. Seega (السيجة)
 */
import "./chess";
import "./dominoes";
import "./backgammon";
import "./speed-math";
import "./xo";
import "./connect-four";
import "./checkers";
import "./reversi";
import "./gomoku";
import "./seega";

export { getGame, listGames } from "./registry";
export type { GamePlugin, BoardProps, Difficulty } from "./types";
export { DIFFICULTIES } from "./types";
