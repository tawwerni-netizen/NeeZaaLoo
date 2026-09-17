/**
 * Registers every game this build knows about, in canonical priority order:
 * 1. Chess (الشطرنج)
 * 2. Billiards (البلياردو)
 * 3. Dominoes (الضمنة)
 * 4. Backgammon (طاولة الزهر)
 * Followed by high-velocity / high-liquidity skill games:
 * 5. Speed Math (أولمبياد الحساب السريع)
 * 6. XO Blitz (إكس أو الخاطفة)
 * 7. Connect Four (أربعة في صف)
 * 8. Checkers (الداما)
 * 9. Reversi (ريفيرسي)
 * 10. Gomoku (غوموكو)
 * 11. Seega (السيجة)
 */
import "./chess";
import "./billiards";
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
