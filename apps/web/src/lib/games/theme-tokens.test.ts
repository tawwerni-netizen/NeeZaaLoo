import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { GAME_THEME_TOKENS, getGameThemeTokens } from "./theme-tokens.ts";

const EXPECTED_GAMES = [
  "chess",
  "dominoes",
  "ludo",
  "backgammon",
  "speed-math",
  "xo",
  "connect-four",
  "checkers",
  "reversi",
  "gomoku",
  "seega",
];

describe("GameThemeTokens System", () => {
  test("defines comprehensive tokens for all 11 games", () => {
    for (const gameId of EXPECTED_GAMES) {
      const theme = GAME_THEME_TOKENS[gameId];
      assert.ok(theme, `Theme for ${gameId} should exist`);
      assert.equal(theme.gameId, gameId);
      assert.ok(theme.persona.ar, `persona.ar missing for ${gameId}`);
      assert.ok(theme.persona.en, `persona.en missing for ${gameId}`);
      assert.ok(theme.tagline.ar, `tagline.ar missing for ${gameId}`);
      assert.ok(theme.tagline.en, `tagline.en missing for ${gameId}`);
      assert.ok(theme.countdownVibe.ar, `countdownVibe.ar missing for ${gameId}`);
      assert.ok(theme.countdownVibe.en, `countdownVibe.en missing for ${gameId}`);
      assert.match(theme.soundMaterial, /^(wood|ceramic|glass|metal)$/);
      assert.ok(theme.turnPulseColor, `turnPulseColor missing for ${gameId}`);
      assert.match(theme.palette.primary, /^#/);
      assert.match(theme.palette.bg, /^#/);
      assert.ok(theme.palette.cardGradient.includes("linear-gradient"));
      
      // Mode copy
      assert.ok(theme.modes.ai.title.ar, `modes.ai.title.ar missing for ${gameId}`);
      assert.ok(theme.modes.friend.title.ar, `modes.friend.title.ar missing for ${gameId}`);
      assert.ok(theme.modes.match.title.ar, `modes.match.title.ar missing for ${gameId}`);
      assert.ok(theme.modes.tournament.title.ar, `modes.tournament.title.ar missing for ${gameId}`);
      
      assert.ok(theme.modes.ai.desc.en, `modes.ai.desc.en missing for ${gameId}`);
      assert.ok(theme.modes.friend.desc.en, `modes.friend.desc.en missing for ${gameId}`);
      assert.ok(theme.modes.match.desc.en, `modes.match.desc.en missing for ${gameId}`);
      assert.ok(theme.modes.tournament.desc.en, `modes.tournament.desc.en missing for ${gameId}`);
    }
  });

  test("getGameThemeTokens returns exact theme for known game and fallback for unknown", () => {
    const ludo = getGameThemeTokens("ludo");
    assert.equal(ludo.gameId, "ludo");
    assert.equal(ludo.soundMaterial, "ceramic");

    const unknown = getGameThemeTokens("some-unknown-game");
    assert.equal(unknown.gameId, "some-unknown-game");
    const chessTheme = GAME_THEME_TOKENS.chess!;
    assert.equal(unknown.palette.primary, chessTheme.palette.primary);
  });
});

