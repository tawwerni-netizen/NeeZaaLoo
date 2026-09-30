import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { GAME_CAPABILITIES, getGameCapability } from "./capabilities.ts";

describe("Game Capabilities & Game-Specific Setup Architecture", () => {
  const canonical11 = [
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

  test("all 11 canonical launch games have tailored capability specifications", () => {
    for (const id of canonical11) {
      const cap = getGameCapability(id);
      assert.ok(cap, `Capability must exist for ${id}`);
      assert.ok(cap.titleEn, `titleEn must be defined for ${id}`);
      assert.ok(cap.titleAr, `titleAr must be defined for ${id}`);
      assert.ok(cap.taglineEn, `taglineEn must be defined for ${id}`);
      assert.ok(cap.taglineAr, `taglineAr must be defined for ${id}`);
      assert.ok(cap.recommendedStakes.length > 0, `recommendedStakes must exist for ${id}`);
    }
  });

  test("chess supports authentic FIDE time controls", () => {
    const chess = getGameCapability("chess");
    assert.equal(chess.setupType, "time_control");
    assert.ok(chess.timeControls && chess.timeControls.length >= 3);
    const hasBlitz = chess.timeControls.some((tc) => tc.id === "BLITZ_3_2");
    const hasBullet = chess.timeControls.some((tc) => tc.id === "BULLET_1_0");
    const hasRapid = chess.timeControls.some((tc) => tc.id === "RAPID_10_0");
    assert.ok(hasBlitz, "Chess must support Blitz 3+2");
    assert.ok(hasBullet, "Chess must support Bullet 1+0");
    assert.ok(hasRapid, "Chess must support Rapid 10+0");
  });

  test("dominoes supports traditional vs American all-fives variants", () => {
    const dom = getGameCapability("dominoes");
    assert.equal(dom.setupType, "variant_select");
    assert.ok(dom.variants && dom.variants.length >= 2);
    const hasTrad = dom.variants.some((v) => v.id === "TRADITIONAL");
    const hasAmer = dom.variants.some((v) => v.id === "AMERICAN");
    assert.ok(hasTrad, "Dominoes must support Traditional Draw/Block");
    assert.ok(hasAmer, "Dominoes must support American All-Fives");
  });

  test("ludo supports 1v1 quick duel and 4-player royale", () => {
    const ludo = getGameCapability("ludo");
    assert.equal(ludo.setupType, "player_count");
    assert.ok(ludo.playerCountOptions && ludo.playerCountOptions.length >= 2);
    assert.ok(ludo.playerCountOptions.some((p) => p.count === 2));
    assert.ok(ludo.playerCountOptions.some((p) => p.count === 4));
  });

  test("backgammon supports 1, 3, and 5 match points", () => {
    const bg = getGameCapability("backgammon");
    assert.equal(bg.setupType, "match_points");
    assert.ok(bg.matchPoints && bg.matchPoints.length >= 3);
    assert.ok(bg.matchPoints.some((m) => m.points === 1));
    assert.ok(bg.matchPoints.some((m) => m.points === 3));
    assert.ok(bg.matchPoints.some((m) => m.points === 5));
  });

  test("speed math supports sprint blitz and endurance configurations", () => {
    const sm = getGameCapability("speed-math");
    assert.equal(sm.setupType, "sprint_config");
    assert.ok(sm.sprintOptions && sm.sprintOptions.length >= 2);
    assert.ok(sm.sprintOptions.some((s) => s.questions === 10));
    assert.ok(sm.sprintOptions.some((s) => s.questions === 20));
  });

  test("xo and connect four support multi-round series formats to prevent draw bias", () => {
    const xo = getGameCapability("xo");
    assert.equal(xo.setupType, "series_format");
    assert.ok(xo.seriesOptions && xo.seriesOptions.length >= 2);
    assert.ok(xo.seriesOptions.some((s) => s.id === "BEST_OF_3"));

    const c4 = getGameCapability("connect-four");
    assert.equal(c4.setupType, "series_format");
    assert.ok(c4.seriesOptions && c4.seriesOptions.length >= 2);
  });

  test("canonical games (checkers, reversi, gomoku, seega) declare canonical direct standard", () => {
    const directGames = ["checkers", "reversi", "gomoku", "seega"];
    for (const id of directGames) {
      const g = getGameCapability(id);
      assert.equal(g.setupType, "canonical_direct");
    }
  });
});
