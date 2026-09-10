/**
 * Registers every game this build knows about, by side effect. Adding a
 * new game to the platform is exactly: write its own registration file
 * (see ./chess.tsx for the shape), then add one import line here. Nothing
 * else in the generic factory changes.
 */
import "./chess";
import "./checkers";
import "./connect-four";
import "./xo";
import "./speed-math";
import "./dominoes";
import "./backgammon";
import "./seega";
import "./reversi";
import "./gomoku";

export { getGame, listGames } from "./registry";
export type { GamePlugin, BoardProps, Difficulty } from "./types";
export { DIFFICULTIES } from "./types";
