/**
 * Registers every game this build knows about, by side effect. Adding a
 * new game to the platform is exactly: write its own registration file
 * (see ./chess.tsx for the shape), then add one import line here. Nothing
 * else in the generic factory changes.
 */
import "./chess";

export { getGame, listGames } from "./registry";
export type { GamePlugin, BoardProps, Difficulty } from "./types";
export { DIFFICULTIES } from "./types";
