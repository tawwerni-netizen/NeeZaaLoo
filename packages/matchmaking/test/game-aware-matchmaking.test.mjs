import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GameAwareMatchmakingPool, MatchmakingEligibilityError, createPoolKey } from "../src/game-aware-pool.mjs";

describe("Game-Aware Matchmaking & Rating Isolation", () => {
  it("maintains independent Glicko-2 ratings per game (Chess rating never affects Gomoku)", () => {
    let mockTime = 1_000_000;
    const pool = new GameAwareMatchmakingPool({ now: () => mockTime });

    // Seed player Alice with Master rating in Chess (2200, RD 40, 50 games)
    pool.setGameRating("alice", "chess", { rating: 2200, rd: 40, gamesPlayed: 50 });

    // Seed player Alice with Beginner rating in Gomoku (1100, RD 60, 20 games)
    pool.setGameRating("alice", "gomoku", { rating: 1100, rd: 60, gamesPlayed: 20 });

    const chessRating = pool.getGameRating("alice", "chess");
    const gomokuRating = pool.getGameRating("alice", "gomoku");
    const dominoesRating = pool.getGameRating("alice", "dominoes"); // unplayed

    assert.equal(chessRating.rating, 2200);
    assert.equal(chessRating.rd, 40);
    assert.equal(chessRating.isEstablished, true);

    assert.equal(gomokuRating.rating, 1100);
    assert.equal(gomokuRating.rd, 60);
    assert.equal(gomokuRating.isEstablished, true);

    // Unplayed game starts with default Glicko-2
    assert.equal(dominoesRating.rating, 1500);
    assert.equal(dominoesRating.rd, 350);
    assert.equal(dominoesRating.gamesPlayed, 0);
    assert.equal(dominoesRating.isEstablished, false);

    // Alice plays a Gomoku match and wins
    pool.setGameRating("bob", "gomoku", { rating: 1150, rd: 50, gamesPlayed: 25 });
    pool.recordMatchOutcome("gomoku", "alice", "bob", 1); // Alice wins Gomoku

    const updatedGomoku = pool.getGameRating("alice", "gomoku");
    const unaffectedChess = pool.getGameRating("alice", "chess");

    assert.ok(updatedGomoku.rating > 1100, "Gomoku rating must rise on victory");
    assert.equal(unaffectedChess.rating, 2200, "Chess rating must be 100% untouched by Gomoku match!");
  });

  it("calculates optional global Nizalo Skill Score separately for profile display", () => {
    const pool = new GameAwareMatchmakingPool();
    pool.setGameRating("carol", "chess", { rating: 2000, rd: 50, gamesPlayed: 30 });
    pool.setGameRating("carol", "backgammon", { rating: 1800, rd: 60, gamesPlayed: 25 });

    const globalScore = pool.calculateGlobalSkillScore("carol");
    assert.ok(globalScore.globalScore >= 1800 && globalScore.globalScore <= 2000);
    assert.equal(globalScore.establishedGames, 2);
  });

  it("enforces rating uncertainty (RD) and games played requirement for CASH play", () => {
    const pool = new GameAwareMatchmakingPool();

    // Player with provisional/uncertain rating (RD 350, 0 games)
    pool.setGameRating("newbie", "chess", { rating: 1500, rd: 350, gamesPlayed: 0 });

    const cashAttempt = pool.enqueue({
      playerId: "newbie",
      gameId: "chess",
      variantId: "standard",
      tier: "CASH",
      stakeMinor: 5_000_000n, // $5 USDT
    });

    assert.equal(cashAttempt.ok, false);
    assert.equal(cashAttempt.reason, MatchmakingEligibilityError.RATING_NOT_ESTABLISHED);

    // Free play is permitted for provisional players
    const freeAttempt = pool.enqueue({
      playerId: "newbie",
      gameId: "chess",
      variantId: "standard",
      tier: "FREE",
      stakeMinor: 0n,
    });
    assert.equal(freeAttempt.ok, true);
  });

  it("strictly enforces solved games policy (XO and Connect Four cannot be queued for cash)", () => {
    const pool = new GameAwareMatchmakingPool();
    pool.setGameRating("pro", "xo", { rating: 2000, rd: 40, gamesPlayed: 50 });
    pool.setGameRating("pro", "connect-four", { rating: 2000, rd: 40, gamesPlayed: 50 });

    // XO cash attempt
    const xoCash = pool.enqueue({
      playerId: "pro",
      gameId: "xo",
      tier: "CASH",
      stakeMinor: 2_000_000n,
    });
    assert.equal(xoCash.ok, false);
    assert.equal(xoCash.reason, MatchmakingEligibilityError.CASH_NOT_ELIGIBLE);

    // Connect Four cash attempt
    const c4Cash = pool.enqueue({
      playerId: "pro",
      gameId: "connect-four",
      tier: "CASH",
      stakeMinor: 2_000_000n,
    });
    assert.equal(c4Cash.ok, false);
    assert.equal(c4Cash.reason, MatchmakingEligibilityError.CASH_NOT_ELIGIBLE);
  });

  it("enforces account risk status (banned/suspended players blocked)", () => {
    const pool = new GameAwareMatchmakingPool();
    pool.setGameRating("cheater", "chess", { rating: 1800, rd: 50, gamesPlayed: 20 });
    pool.setAccountRisk("cheater", { status: "BANNED", riskScore: 95 });

    const res = pool.enqueue({
      playerId: "cheater",
      gameId: "chess",
      tier: "CASH",
      stakeMinor: 5_000_000n,
    });

    assert.equal(res.ok, false);
    assert.equal(res.reason, MatchmakingEligibilityError.ACCOUNT_SUSPENDED);
  });

  it("prevents double queue joins across games and handles duplicate clicks via idempotency key", () => {
    let mockTime = 1000;
    const pool = new GameAwareMatchmakingPool({ now: () => mockTime });

    // First join: Chess
    const join1 = pool.enqueue({
      playerId: "dan",
      gameId: "chess",
      tier: "FREE",
      idempotencyKey: "click-1",
    });
    assert.equal(join1.ok, true);

    // Duplicate click with same idempotencyKey: returns cached ticket
    const dupClick = pool.enqueue({
      playerId: "dan",
      gameId: "chess",
      tier: "FREE",
      idempotencyKey: "click-1",
    });
    assert.equal(dupClick.ok, true);
    assert.equal(dupClick.idempotent, true);
    assert.equal(dupClick.ticketId, join1.ticketId);

    // Attempting to queue for a SECOND game (e.g. Dominoes) while queued for Chess: REJECTED
    const join2 = pool.enqueue({
      playerId: "dan",
      gameId: "dominoes",
      tier: "FREE",
    });
    assert.equal(join2.ok, false);
    assert.equal(join2.reason, MatchmakingEligibilityError.ALREADY_QUEUED);
  });

  it("widens rating tolerance dynamically over queue time", () => {
    let currentTime = 10_000;
    const pool = new GameAwareMatchmakingPool({ now: () => currentTime, baseTolerance: 60 });

    // Alice: rating 1500, enqueued at t=10_000
    pool.setGameRating("alice", "chess", { rating: 1500 });
    pool.enqueue({ playerId: "alice", gameId: "chess", variantId: "standard", tier: "FREE" });

    // Bob: rating 1650 (delta 150, beyond initial 60 tolerance), enqueued at t=10_000
    pool.setGameRating("bob", "chess", { rating: 1650 });
    pool.enqueue({ playerId: "bob", gameId: "chess", variantId: "standard", tier: "FREE" });

    const poolKey = createPoolKey("chess", "standard", "FREE", 0n, null, "any");

    // At t=10_000 (0s elapsed): tolerance = 60, delta = 150 -> NO MATCH
    let pairRes = pool.pairPool(poolKey, 10_000);
    assert.equal(pairRes.paired, false);

    // At t=25_000 (15s elapsed): tolerance = 60 + (15 * 4) = 120, delta = 150 -> NO MATCH
    pairRes = pool.pairPool(poolKey, 25_000);
    assert.equal(pairRes.paired, false);

    // At t=35_000 (25s elapsed): tolerance = 60 + (25 * 4) = 160 >= 150 -> MATCH FOUND!
    pairRes = pool.pairPool(poolKey, 35_000);
    assert.equal(pairRes.paired, true);
    assert.equal(pairRes.match.ratingDelta, 150);
  });

  it("computes accurate empirical telemetry without fabricated 5s marketing claims", () => {
    let currentTime = 0;
    const pool = new GameAwareMatchmakingPool({ now: () => currentTime });

    // Pair 1: waited 12,000ms
    currentTime = 0;
    pool.enqueue({ playerId: "p1", gameId: "chess", tier: "FREE" });
    pool.enqueue({ playerId: "p2", gameId: "chess", tier: "FREE" });
    currentTime = 12_000;
    pool.pairPool(createPoolKey("chess", "standard", "FREE", 0n, null, "any"), currentTime);

    // Pair 2: waited 18,000ms
    currentTime = 20_000;
    pool.enqueue({ playerId: "p3", gameId: "chess", tier: "FREE" });
    pool.enqueue({ playerId: "p4", gameId: "chess", tier: "FREE" });
    currentTime = 38_000;
    pool.pairPool(createPoolKey("chess", "standard", "FREE", 0n, null, "any"), currentTime);

    const telemetry = pool.getTelemetry();
    assert.equal(telemetry.sampleSize, 2);
    assert.equal(telemetry.averageQueueTimeMs, 15_000); // (12000 + 18000) / 2
    assert.ok(telemetry.medianQueueTimeMs > 0);
  });
});
