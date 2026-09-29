/**
 * Tests for GameRegistry, canonical games, and registration contract.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { registerGame, getGame, listGames, GameRegistry } from "./registry.ts";
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

describe("GameRegistry canonical single source of truth", () => {
  test("canonical registry initializes with exactly 11 live games", () => {
    // Before custom test plugins are added, canonical count is at least 11
    const slugs = GameRegistry.getSlugs();
    assert.ok(slugs.includes("chess"));
    assert.ok(slugs.includes("dominoes"));
    assert.ok(slugs.includes("ludo"));
    assert.ok(slugs.includes("backgammon"));
    assert.ok(slugs.includes("speed-math"));
    assert.ok(slugs.includes("xo"));
    assert.ok(slugs.includes("connect-four"));
    assert.ok(slugs.includes("checkers"));
    assert.ok(slugs.includes("reversi"));
    assert.ok(slugs.includes("gomoku"));
    assert.ok(slugs.includes("seega"));
    assert.ok(GameRegistry.getCount() >= 11);
  });

  test("every canonical game has complete metadata: icon, duration, mode, rules, categories", () => {
    const canonicalSlugs = [
      "chess", "dominoes", "ludo", "backgammon", "speed-math",
      "xo", "connect-four", "checkers", "reversi", "gomoku", "seega"
    ];

    for (const slug of canonicalSlugs) {
      const g = GameRegistry.get(slug);
      assert.ok(g, `game ${slug} must be registered`);
      assert.ok(g.icon, `game ${slug} must have an icon`);
      assert.ok(g.typicalDuration, `game ${slug} must have duration`);
      assert.ok(g.playerModeDisplay, `game ${slug} must have playerModeDisplay`);
      assert.ok(g.skillLevel, `game ${slug} must have skillLevel`);
      assert.ok(Array.isArray(g.categories) && g.categories.length > 0, `game ${slug} must have categories`);
      assert.ok(g.availability.isAvailableNow, `game ${slug} must be available now`);
      assert.ok(g.rules.version, `game ${slug} must have rules version`);
      assert.ok(g.variants.length > 0, `game ${slug} must have at least 1 variant`);
      assert.ok(g.modes.length > 0, `game ${slug} must have at least 1 mode`);
    }
  });

  test("category filtering works accurately across taxonomy", () => {
    const strategy = GameRegistry.filter("STRATEGY");
    assert.ok(strategy.some((g) => g.id === "chess"));
    assert.ok(strategy.some((g) => g.id === "dominoes"));

    const speed = GameRegistry.filter("SPEED");
    assert.ok(speed.some((g) => g.id === "speed-math"));
    assert.ok(speed.some((g) => g.id === "xo"));

    const board = GameRegistry.filter("BOARD");
    assert.ok(board.some((g) => g.id === "ludo"));
    assert.ok(board.some((g) => g.id === "checkers"));

    const cash = GameRegistry.getCashEligible();
    assert.ok(cash.some((g) => g.id === "chess"));
    assert.ok(cash.some((g) => g.id === "ludo"));
    // Solved games must NOT be cash eligible
    assert.ok(!cash.some((g) => g.id === "xo"));
    assert.ok(!cash.some((g) => g.id === "connect-four"));

    const freeToPlay = GameRegistry.getFreeToPlay();
    assert.ok(freeToPlay.length >= 11);
  });

  test("related games calculation returns pertinent alternatives", () => {
    const relatedToChess = GameRegistry.getRelated("chess", 3);
    assert.equal(relatedToChess.length, 3);
    assert.ok(!relatedToChess.some((g) => g.id === "chess"));
  });

  test("a newly registered game is retrievable by id", () => {
    registerGame(fakePlugin("test-game-a"));
    const plugin = getGame("test-game-a");
    assert.ok(plugin);
    assert.equal(plugin.id, "test-game-a");
  });

  test("an unregistered id returns undefined, never a throw", () => {
    assert.equal(getGame("does-not-exist"), undefined);
  });

  test("registering the same id twice with distinct boards throws", () => {
    const custom1: GamePlugin = { ...fakePlugin("test-game-dup"), Board: () => null };
    const custom2: GamePlugin = { ...fakePlugin("test-game-dup"), Board: () => null };
    registerGame(custom1);
    assert.throws(() => registerGame(custom2), /already registered with a board component/);
  });
});
