/**
 * The Game Factory's own tests -- the registry is the one piece of the
 * factory with real logic worth testing in isolation (register/get/list,
 * and the duplicate-id guard that keeps a copy-paste mistake in a new
 * game's registration from silently shadowing an existing one). Board
 * components and the generic shell are exercised by the live-browser
 * Chess regression instead; there is no component-testing framework in
 * this app to unit-test JSX against.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { registerGame, getGame, listGames } from "./registry.ts";
import type { GamePlugin } from "./types.ts";

function fakePlugin(id: string): GamePlugin {
  return {
    id,
    nameKey: id,
    turnModel: "ALTERNATING",
    supportsAI: false,
    difficulties: [],
    supportsDraw: false,
    cashEnabled: false,
    Board: () => null,
  };
}

describe("game registry", () => {
  test("a registered game is retrievable by id", () => {
    registerGame(fakePlugin("test-game-a"));
    const plugin = getGame("test-game-a");
    assert.ok(plugin);
    assert.equal(plugin.id, "test-game-a");
  });

  test("an unregistered id returns undefined, never a throw", () => {
    assert.equal(getGame("does-not-exist"), undefined);
  });

  test("registering the same id twice throws -- a copy-paste mistake fails loudly", () => {
    registerGame(fakePlugin("test-game-b"));
    assert.throws(() => registerGame(fakePlugin("test-game-b")), /already registered/);
  });

  test("listGames returns every registered plugin, including ones registered by other tests in this process", () => {
    registerGame(fakePlugin("test-game-c"));
    const all = listGames();
    assert.ok(all.some((g) => g.id === "test-game-c"));
    assert.ok(all.some((g) => g.id === "test-game-a"));
  });
});
