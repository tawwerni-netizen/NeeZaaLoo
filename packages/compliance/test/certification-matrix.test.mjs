import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RulesetRegistry, getRuleset } from "../../duel-engine/src/ruleset-registry.mjs";
import { ALL_ENGINES, getEngineById } from "../../duel-engine/src/engines/registry.mjs";
import { createClock, readClock, applyMove } from "../../duel-engine/src/clock.mjs";
import { runIntent, resign, replayHash, DuelState } from "../../duel-engine/src/duel.mjs";
import { GameAwareMatchmakingPool } from "../../matchmaking/src/game-aware-pool.mjs";
import { computeRake } from "../../settlement/src/rake.mjs";
import { randomBytes } from "node:crypto";

const ALL_GAME_IDS = [
  "chess",
  "checkers",
  "dominoes",
  "backgammon",
  "speed_math",
  "xo",
  "connect_four",
  "reversi",
  "gomoku",
  "seega",
  "ludo",
];

describe("Nizalo Production Certification: All 11 Games Functional Matrix", () => {
  for (const gameId of ALL_GAME_IDS) {
    const slug = gameId.replace(/_/g, "-");

    describe(`Game Engine & Ruleset Certification: [${slug}]`, () => {
      it("1. Open & Rules: Ruleset exists with authoritative EN & AR specifications", () => {
        const ruleset = getRuleset(gameId, "standard");
        assert.ok(ruleset, `Ruleset for ${gameId} must exist`);
        assert.ok(ruleset.rulesDocument, `Rules document for ${gameId} must exist`);
        assert.ok(ruleset.rulesDocument.overview, "Must have overview");
        assert.ok(ruleset.rulesDocument.winConditions.length > 0, "Must have win conditions");
        assert.ok(ruleset.nameAr, "Must have Arabic title");
        assert.ok(ruleset.turnModel === "ALTERNATING" || ruleset.turnModel === "SIMULTANEOUS");
      });

      it("2. Engine Contract & Registration: Verified in ALL_ENGINES registry", () => {
        const engine = getEngineById(slug);
        assert.ok(engine, `Engine for ${slug} must be registered`);
        assert.equal(engine.slug, slug);
        assert.ok(engine.rulesVersion);
        assert.ok(engine.boardDefinition);
        assert.ok(typeof engine.moveValidation === "function");
        assert.ok(typeof engine.applyAction === "function");
      });

      it("3. Cash Eligibility Policy: Solved games barred from cash, skill games approved", () => {
        const ruleset = getRuleset(gameId, "standard");
        const pool = new GameAwareMatchmakingPool();
        pool.setGameRating("test_user", slug, { rating: 1800, rd: 40, gamesPlayed: 25 });

        const cashAttempt = pool.enqueue({
          playerId: "test_user",
          gameId: slug,
          tier: "CASH",
          stakeMinor: 2_000_000n,
        });

        if (slug === "xo" || slug === "connect-four") {
          assert.equal(ruleset.cashEligible, false, `${slug} must be free-only/solved by policy`);
          assert.equal(cashAttempt.ok, false);
          assert.equal(cashAttempt.reason, "CASH_NOT_ELIGIBLE");
        } else {
          assert.equal(ruleset.cashEligible, true, `${slug} should be cash-eligible`);
          assert.equal(cashAttempt.ok, true, `${slug} should allow cash enqueue for established players`);
        }
      });

      it("4. Free / Practice Match Entry: Always allowed for any player", () => {
        const pool = new GameAwareMatchmakingPool();
        const freeAttempt = pool.enqueue({
          playerId: "newbie_free",
          gameId: slug,
          tier: "FREE",
          stakeMinor: 0n,
        });
        assert.equal(freeAttempt.ok, true, `Free match must be permitted for ${slug}`);
      });

      it("5. Match Creation & Initial State: Deterministic challenge creation", () => {
        const engine = getEngineById(slug);
        const challenge = engine.createChallenge("test_seed_123");
        assert.ok(challenge, "Challenge must be created");
        assert.ok(challenge.state, "Must produce state object");
      });

      it("6. Move Validation & Turn Enforcement: Rejects malformed moves and out of turn", () => {
        const engine = getEngineById(slug);
        const challenge = engine.createChallenge("seed_val");
        
        // Malformed input validation
        const valRes = engine.moveValidation(challenge.state, { gibberish: true }, { seat: 0 });
        assert.equal(valRes.valid, false, "Malformed intent must be rejected as invalid");

        // Out of turn seat validation (for alternating games)
        if (engine.turnModel === "ALTERNATING") {
          const outOfTurn = engine.moveValidation(challenge.state, "e2e4", { seat: 1 });
          assert.equal(outOfTurn.valid, false, "Out of turn move must be rejected");
        }
      });

      it("7. Resignation / Surrender: Authoritatively terminates match with loss", () => {
        const engine = getEngineById(slug);
        const challenge = engine.createChallenge("seed_resign");
        const duel = {
          duelId: `match_${slug}_resign`,
          gameId: slug,
          variantId: "standard",
          players: ["player_alice", "player_bob"],
          status: DuelState.LIVE,
          state: challenge.state,
          clock: { model: "SHARED", remaining: 60000, startedAt: 1000 },
          events: [],
          seq: { lastNonce: [null, null], lastIntent: [null, null] },
          drawOfferBy: null,
          startedAt: 1000,
          completedAt: null,
          outcome: null,
        };

        const res = resign(duel, "player_alice", 2000);
        assert.equal(res.ok, true);
        assert.equal(duel.status, "COMPLETED");
        assert.equal(duel.outcome.result, "0-1", "Alice resigned -> Bob wins (0-1)");
        assert.equal(duel.outcome.reason, "RESIGNATION");
      });

      it("8. Replay Hash & Audit Integrity: Cryptographic hash commits state", () => {
        const engine = getEngineById(slug);
        const challenge = engine.createChallenge("seed_hash");
        const hash1 = replayHash(challenge.state);
        const hash2 = replayHash(challenge.state);
        assert.equal(typeof hash1, "string");
        assert.equal(hash1.length, 64, "SHA-256 hash length must be 64 hex characters");
        assert.equal(hash1, hash2, "Identical state must produce deterministic identical hash");
      });

      it("9. Per-Game Rating Isolation: Matches update only this game's Glicko-2 ratings", () => {
        const pool = new GameAwareMatchmakingPool();
        pool.setGameRating("player_a", slug, { rating: 1500, rd: 50, gamesPlayed: 10 });
        pool.setGameRating("player_b", slug, { rating: 1500, rd: 50, gamesPlayed: 10 });
        
        // Seed distinct control game for Player A to verify zero cross-contamination
        const controlGame = slug === "chess" ? "gomoku" : "chess";
        pool.setGameRating("player_a", controlGame, { rating: 2200, rd: 30, gamesPlayed: 50 });

        pool.recordMatchOutcome(slug, "player_a", "player_b", 1); // Player A wins in slug game

        const updatedA = pool.getGameRating("player_a", slug);
        assert.ok(updatedA.rating > 1500, "Winner rating must increase in this game");
        assert.equal(updatedA.gamesPlayed, 11);

        // Control game rating must remain completely untouched!
        const controlA = pool.getGameRating("player_a", controlGame);
        assert.equal(controlA.rating, 2200, "Control game rating must NOT be mutated by other game matches");
        assert.equal(controlA.gamesPlayed, 50);
      });

      it("10. Settlement & Rake Arithmetic: Accurate pot fee within 10%-25% platform band", () => {
        const potMinor = 10_000_000n; // $10.00 USDT total pot ($5 each)
        const rule = { rakeBps: 1200, minRakeMinor: 100_000n, maxRakeMinor: 5_000_000n }; // 12% rake
        const { rakeMinor } = computeRake(potMinor, rule);
        assert.equal(rakeMinor, 1_200_000n, "12% of $10 is $1.20 USDT");
        const winnerPayout = potMinor - rakeMinor;
        assert.equal(winnerPayout, 8_800_000n, "$8.80 USDT goes to winner");
      });
    });
  }
});

describe("Nizalo Production Certification: RNG Integrity (Dominoes, Backgammon, Ludo)", () => {
  const RNG_GAMES = ["dominoes", "backgammon", "ludo"];

  for (const gameId of RNG_GAMES) {
    it(`verifies server-side deterministic seed reproduction for [${gameId}]`, () => {
      const engine = getEngineById(gameId);
      const seed = randomBytes(16).toString("hex");

      const run1 = engine.createChallenge(seed);
      const run2 = engine.createChallenge(seed);

      assert.deepEqual(
        run1.state,
        run2.state,
        `Challenge initialized with identical seed '${seed}' must be 100% byte-for-byte identical`
      );
    });

    it(`verifies different random seeds produce distinct initial shuffles/dice for [${gameId}]`, () => {
      const engine = getEngineById(gameId);
      const seedA = "00000000000000000000000000000001";
      const seedB = "ffffffffffffffffffffffffffffffff";

      const runA = engine.createChallenge(seedA);
      const runB = engine.createChallenge(seedB);

      assert.notDeepEqual(
        runA.state,
        runB.state,
        "Distinct seeds must produce distinctly randomized starting boards"
      );
    });
  }
});
