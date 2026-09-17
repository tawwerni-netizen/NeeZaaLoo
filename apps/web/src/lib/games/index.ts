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
 *
 * Billiards (packages/game-billiards, apps/web/src/lib/games/billiards.tsx)
 * is intentionally NOT registered here -- hidden platform-wide per an
 * explicit decision, not removed. The backend plugin is still wired into
 * api/worker/gateway and the game.is_live/cash_enabled/auto_tournaments_enabled
 * flags are FALSE in the database (the real, server-enforced kill switch --
 * see server.mjs's own is_live check on duel creation), so re-enabling it
 * later is: re-add the import below, flip is_live back to TRUE.
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
