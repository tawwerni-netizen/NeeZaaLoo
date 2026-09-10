/**
 * Default initial-state spawners for the dispatch worker.
 *
 * `mm_pair()` needs a fresh `initial_state` (and, for games that need one, an
 * unpredictable seed) at the moment a NEW duel is created -- it has no
 * opinion of its own about what a "starting position" looks like for a given
 * game, by design (that is a game concern, not a matchmaking concern). This
 * is the one place that knowledge lives for the dispatch worker.
 *
 * A spawner is a zero-argument function returning `{ initialState, seed }`:
 *   - `initialState` becomes the duel's `initial_state` column -- the exact
 *     "recipe" object the plugin's own `rehydrate()` expects, never the full
 *     generated state.
 *   - `seed` becomes the duel's top-level `seed` column. It is currently
 *     unused by `rehydrate()` on any registered plugin (a vestigial/future
 *     audit field -- see realtime/store.mjs), so games without a meaningful
 *     seed may return `null`.
 *
 * Adding a third Skill Duel game means adding one entry here, not touching
 * the worker: the worker only ever calls whatever function this map holds
 * for a given `gameId`.
 */
import { randomUUID } from "node:crypto";
import { START_FEN } from "../../game-chess/src/chess.mjs";

export const DEFAULT_SPAWNERS = {
  chess: () => ({ initialState: { fen: START_FEN }, seed: null }),

  "speed-math": () => {
    // The seed must never be predictable or reused -- it is the only thing
    // standing between "identical question set for both players" and
    // "identical question set an opponent could look up in advance".
    const seed = randomUUID();
    return { initialState: { seed, config: {} }, seed };
  },

  // Checkers, Connect Four and XO all always start from the same fixed
  // position -- no per-duel randomness to persist, exactly like chess's
  // own entry above (see each plugin's own matchmakingDefaults()).
  checkers: () => ({ initialState: {}, seed: null }),
  "connect-four": () => ({ initialState: {}, seed: null }),
  xo: () => ({ initialState: {}, seed: null }),

  // Dominoes and Backgammon are the second and third games (after Speed
  // Math) whose starting position is NOT fixed: Dominoes deals a private
  // hand to each player, and Backgammon's opening leader and first roll
  // both come from the server's own dice. Both are generated from this
  // seed -- see each plugin's own header on why that must never be
  // Math.random -- and the seed itself must never be predictable or
  // reused, exactly like Speed Math's own entry above.
  dominoes: () => {
    const seed = randomUUID();
    return { initialState: { seed }, seed };
  },
  backgammon: () => {
    const seed = randomUUID();
    return { initialState: { seed }, seed };
  },

  // Seega and Reversi both always start from the same fixed position (an
  // empty board for Seega's own placement phase; the standard four-disc
  // opening for Reversi) -- no per-duel randomness, exactly like
  // checkers/Connect Four/XO's own entries above.
  seega: () => ({ initialState: {}, seed: null }),
  reversi: () => ({ initialState: {}, seed: null }),

  // Gomoku always starts from the same empty board -- no per-duel
  // randomness, exactly like XO's own entry above.
  gomoku: () => ({ initialState: {}, seed: null }),
};
