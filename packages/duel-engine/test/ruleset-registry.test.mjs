import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RulesetRegistry, getRuleset, listAllRulesets } from "../src/ruleset-registry.mjs";

describe("Authoritative Ruleset Registry (Single Source of Truth)", () => {
  const EXPECTED_GAMES = [
    "chess",
    "dominoes",
    "ludo",
    "backgammon",
    "speed_math",
    "xo",
    "connect_four",
    "checkers",
    "reversi",
    "gomoku",
    "seega",
  ];

  it("contains all 11 canonical launch games", () => {
    const registeredKeys = Object.keys(RulesetRegistry);
    for (const game of EXPECTED_GAMES) {
      assert.ok(registeredKeys.includes(game), `Missing expected game: ${game}`);
      assert.ok(RulesetRegistry[game].defaultVariant, `Game ${game} must specify defaultVariant`);
      assert.ok(Object.keys(RulesetRegistry[game].variants).length > 0, `Game ${game} must have variants`);
    }
    assert.equal(registeredKeys.length, 11);
  });

  it("getRuleset resolves correctly for both hyphenated and underscored slugs", () => {
    // Connect Four
    const c4_hyphen = getRuleset("connect-four");
    const c4_under = getRuleset("connect_four");
    assert.equal(c4_hyphen.game, "connect_four");
    assert.equal(c4_under.game, "connect_four");
    assert.equal(c4_hyphen.name, c4_under.name);

    // Speed Math
    const sm_hyphen = getRuleset("speed-math");
    const sm_under = getRuleset("speed_math");
    assert.equal(sm_hyphen.game, "speed_math");
    assert.equal(sm_under.game, "speed_math");
  });

  it("supports explicit variant retrieval for multi-variant games", () => {
    // Dominoes: Traditional Block vs All-Fives
    const block = getRuleset("dominoes", "traditional_block");
    const allFives = getRuleset("dominoes", "all_fives");
    assert.equal(block.variant, "traditional_block");
    assert.equal(allFives.variant, "all_fives");
    assert.notEqual(block.name, allFives.name);
    assert.ok(allFives.rulesDocument.scoring, "All-Fives has explicit scoring rules");

    // Gomoku: Freestyle vs RIF Tournament
    const freestyle = getRuleset("gomoku", "standard_freestyle");
    const rif = getRuleset("gomoku", "rif_tournament");
    assert.equal(freestyle.variant, "standard_freestyle");
    assert.equal(rif.variant, "rif_tournament");
    assert.notEqual(freestyle.version, rif.version);

    // Chess: Standard FIDE vs Blitz
    const chessStd = getRuleset("chess", "standard");
    const chessBlitz = getRuleset("chess", "blitz");
    assert.equal(chessStd.variant, "standard");
    assert.equal(chessBlitz.variant, "blitz");
  });

  it("every variant satisfies full rules document completeness", () => {
    const all = listAllRulesets();
    assert.ok(all.length >= 14, `Expected at least 14 ruleset variants, found ${all.length}`);

    for (const r of all) {
      assert.ok(r.game, `Ruleset must have game identifier`);
      assert.ok(r.variant, `Ruleset must have variant identifier`);
      assert.ok(r.name, `Ruleset ${r.game}:${r.variant} must have name`);
      assert.ok(r.nameAr, `Ruleset ${r.game}:${r.variant} must have nameAr`);
      assert.ok(r.version, `Ruleset ${r.game}:${r.variant} must have version`);
      assert.ok(r.source, `Ruleset ${r.game}:${r.variant} must have governing source`);
      assert.ok(r.effectiveDate, `Ruleset ${r.game}:${r.variant} must have effectiveDate`);
      assert.equal(typeof r.cashEligible, "boolean", `Ruleset ${r.game}:${r.variant} cashEligible must be boolean`);
      assert.equal(typeof r.tournamentEligible, "boolean", `Ruleset ${r.game}:${r.variant} tournamentEligible must be boolean`);
      assert.ok(r.boardDefinition?.type, `Ruleset ${r.game}:${r.variant} must define board type`);
      assert.ok(r.boardDefinition?.setupDescription, `Ruleset ${r.game}:${r.variant} must have setup description`);
      assert.ok(r.timeControls?.defaultProfile, `Ruleset ${r.game}:${r.variant} must have default time profile`);
      assert.ok(r.timeControls?.allowedProfiles?.length > 0, `Ruleset ${r.game}:${r.variant} must have allowed time profiles`);

      // Rules document (Bilingual En & Ar)
      const doc = r.rulesDocument;
      assert.ok(doc, `Ruleset ${r.game}:${r.variant} must have rulesDocument`);
      assert.ok(doc.overview, `Ruleset ${r.game}:${r.variant} must have overview`);
      assert.ok(doc.overviewAr, `Ruleset ${r.game}:${r.variant} must have overviewAr`);
      assert.ok(doc.setup, `Ruleset ${r.game}:${r.variant} must have setup`);
      assert.ok(doc.setupAr, `Ruleset ${r.game}:${r.variant} must have setupAr`);
      assert.ok(doc.legalMoves || doc.movementAndCapture, `Ruleset ${r.game}:${r.variant} must describe legal moves`);
      assert.ok(doc.legalMovesAr || doc.movementAndCaptureAr, `Ruleset ${r.game}:${r.variant} must describe legal moves in Arabic`);
      assert.ok(Array.isArray(doc.winConditions) && doc.winConditions.length > 0, `Ruleset ${r.game}:${r.variant} must list win conditions`);
      assert.ok(Array.isArray(doc.winConditionsAr) && doc.winConditionsAr.length > 0, `Ruleset ${r.game}:${r.variant} must list win conditions in Arabic`);
      assert.ok(Array.isArray(doc.drawConditions), `Ruleset ${r.game}:${r.variant} must list draw conditions`);
      assert.ok(Array.isArray(doc.drawConditionsAr), `Ruleset ${r.game}:${r.variant} must list draw conditions in Arabic`);
      assert.ok(["DETERMINISTIC", "SERVER_SEEDED"].includes(doc.rngPolicy), `Ruleset ${r.game}:${r.variant} must have valid rngPolicy`);
      assert.ok(doc.rngDescription, `Ruleset ${r.game}:${r.variant} must have rngDescription`);
      assert.ok(doc.rngDescriptionAr, `Ruleset ${r.game}:${r.variant} must have rngDescriptionAr`);
      assert.ok(doc.fairPlay, `Ruleset ${r.game}:${r.variant} must describe fair play policy`);
      assert.ok(doc.fairPlayAr, `Ruleset ${r.game}:${r.variant} must describe fair play policy in Arabic`);
      assert.ok(r.sourceAr, `Ruleset ${r.game}:${r.variant} must have sourceAr`);
    }
  });

  it("enforces solved games cash eligibility policy (XO & Connect Four must be non-cash)", () => {
    const xo = getRuleset("xo");
    assert.equal(xo.cashEligible, false, "XO is mathematically solved and must not be cash eligible");
    assert.equal(xo.tournamentEligible, false);

    const c4 = getRuleset("connect_four");
    assert.equal(c4.cashEligible, false, "Connect Four is solved and must not be cash eligible");
    assert.equal(c4.tournamentEligible, false);

    const chess = getRuleset("chess");
    assert.equal(chess.cashEligible, true);
    assert.equal(chess.tournamentEligible, true);

    const dominoes = getRuleset("dominoes");
    assert.equal(dominoes.cashEligible, true);

    const backgammon = getRuleset("backgammon");
    assert.equal(backgammon.cashEligible, true);
  });
});
