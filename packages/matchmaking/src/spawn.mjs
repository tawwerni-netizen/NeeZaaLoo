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
};
