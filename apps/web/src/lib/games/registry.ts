/**
 * The frontend game registry -- the presentation-layer sibling of
 * packages/duel-engine/src/duel.mjs's own `registerPlugin(registry, plugin)`.
 * Deliberately as small: register, get, list. Nothing here ever imports a
 * specific game's module or branches on a gameId string -- see ./index.ts
 * for the one place per-game registration actually happens, and this
 * file's own header in types.ts for why that separation is the whole
 * point of the exercise.
 */
import type { GamePlugin } from "./types";

const registry = new Map<string, GamePlugin>();

/** A game module calls this once, at import time (see ./index.ts). Throws
 * on a duplicate id -- exactly like the backend's own registerPlugin --
 * so a copy-paste mistake in a new game's registration fails loudly at
 * startup rather than silently shadowing an existing game. */
export function registerGame(plugin: GamePlugin): void {
  if (registry.has(plugin.id)) {
    throw new Error(`game "${plugin.id}" is already registered`);
  }
  registry.set(plugin.id, plugin);
}

export function getGame(id: string): GamePlugin | undefined {
  return registry.get(id);
}

export function listGames(): GamePlugin[] {
  return [...registry.values()];
}
