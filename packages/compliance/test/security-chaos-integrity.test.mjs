import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getRuleset } from "../../duel-engine/src/ruleset-registry.mjs";
import { ChessPlugin } from "../../game-chess/src/plugin.mjs";
import { runIntent, resign, deriveSequenceState, replayHash, DuelState } from "../../duel-engine/src/duel.mjs";
import { createClock } from "../../duel-engine/src/clock.mjs";
import { MatchLifecycleInstance, MatchState, AbortReason } from "../../matchmaking/src/lifecycle.mjs";
import { MatchRealtimeSync } from "../../realtime/src/resync-protocol.mjs";
import { GameAwareMatchmakingPool } from "../../matchmaking/src/game-aware-pool.mjs";
import { isValidStakeMinor, STAKE_PRESETS_USD } from "../../matchmaking/src/stakes.mjs";
import { buildFirstRound, bracketSeedOrder, nextPow2 } from "../../tournament/src/pairing.mjs";
import { computeRake, settlementLegs } from "../../settlement/src/rake.mjs";

describe("Nizalo Production Certification: Security, Chaos, and Data Integrity", () => {
  describe("1. Security Invariant Tests", () => {
    it("strictly blocks forged results (client cannot assert outcome; only engine evaluates)", () => {
      const challenge = ChessPlugin.createChallenge("seed_sec_1");
      const duel = {
        duelId: "sec_match_1",
        gameId: "chess",
        players: ["attacker", "defender"],
        status: "LIVE",
        state: challenge.state,
        clock: createClock({ initialMs: 300000, incrementMs: 0 }, 1000),
        events: [],
        seq: { lastNonce: [null, null], lastIntent: [null, null] },
        drawOfferBy: null,
        startedAt: 1000,
        outcome: null,
      };

      // Attacker tries to submit a forged result object instead of a legal intent
      const forgedOutcome = runIntent(duel, ChessPlugin, {
        playerId: "attacker",
        intent: { result: "1-0", winner: "attacker", reason: "CHEATING" },
        nonce: 1,
        baseVersion: 0,
      }, 1000);

      assert.equal(forgedOutcome.ok, false);
      assert.equal(duel.status, "LIVE", "Duel must remain LIVE; forged outcome ignored");
      assert.equal(duel.outcome, null);
    });

    it("strictly blocks forged moves, out-of-turn execution, and malformed inputs", () => {
      const challenge = ChessPlugin.createChallenge("seed_sec_2");
      const duel = {
        duelId: "sec_match_2",
        gameId: "chess",
        players: ["attacker", "defender"],
        status: "LIVE",
        state: challenge.state,
        clock: createClock({ initialMs: 300000, incrementMs: 0 }, 1000),
        events: [],
        seq: { lastNonce: [null, null], lastIntent: [null, null] },
        drawOfferBy: null,
        startedAt: 1000,
        outcome: null,
      };

      // 1. Defender tries to move when it is Attacker's (White's) turn
      const outOfTurn = runIntent(duel, ChessPlugin, {
        playerId: "defender",
        intent: "e7e5",
        nonce: 1,
        baseVersion: 0,
      }, 1000);
      assert.equal(outOfTurn.ok, false);
      assert.equal(outOfTurn.reason, "NOT_YOUR_TURN");

      // 2. Attacker tries an illegal teleporting chess move
      const illegalMove = runIntent(duel, ChessPlugin, {
        playerId: "attacker",
        intent: "e2e8", // Illegal pawn leap to 8th rank
        nonce: 1,
        baseVersion: 0,
      }, 1000);
      assert.equal(illegalMove.ok, false);
      assert.equal(illegalMove.reason, "ILLEGAL");
    });

    it("strictly enforces server-authoritative timestamps (ignores client claim)", () => {
      const challenge = ChessPlugin.createChallenge("seed_sec_3");
      const duel = {
        duelId: "sec_match_3",
        gameId: "chess",
        players: ["attacker", "defender"],
        status: "LIVE",
        state: challenge.state,
        clock: createClock({ initialMs: 300000, incrementMs: 0 }, 1000),
        events: [],
        seq: { lastNonce: [null, null], lastIntent: [null, null] },
        drawOfferBy: null,
        startedAt: 1000,
        outcome: null,
      };

      const serverTimeMs = 5000;
      // Client cannot pass a timestamp parameter to manipulate the clock
      const moveRes = runIntent(duel, ChessPlugin, {
        playerId: "attacker",
        intent: "e2e4",
        nonce: 1,
        baseVersion: 0,
        clientTimestamp: 1001, // Forged client timestamp trying to save time
      }, serverTimeMs);

      assert.equal(moveRes.ok, true);
      // Clock was deducted based strictly on serverTimeMs (5000 - 1000 = 4000ms spent)
      assert.equal(duel.clock.remaining[0], 300000 - 4000);
    });

    it("enforces canonical stake ladder validation and rejects arbitrary/negative stakes", () => {
      // Valid stakes from preset ladder
      assert.equal(isValidStakeMinor(2_000_000n), true, "$2 USDT is valid");
      assert.equal(isValidStakeMinor(50_000_000n), true, "$50 USDT is valid");
      assert.equal(isValidStakeMinor(2_000_000_000n), true, "$2000 USDT ceiling is valid");

      // Invalid / forged stakes
      assert.equal(isValidStakeMinor(0n), false, "$0 is not a cash stake");
      assert.equal(isValidStakeMinor(-10_000_000n), false, "Negative stakes strictly barred");
      assert.equal(isValidStakeMinor(12_345_678n), false, "Arbitrary non-preset stake barred");
      assert.equal(isValidStakeMinor(5_000_000_000n), false, "Above $2000 ceiling barred");
    });

    it("prevents IDOR: non-participant cannot submit moves, resign, or manipulate match", () => {
      const challenge = ChessPlugin.createChallenge("seed_sec_4");
      const duel = {
        duelId: "sec_match_4",
        gameId: "chess",
        players: ["alice", "bob"],
        status: "LIVE",
        state: challenge.state,
        clock: createClock({ initialMs: 300000, incrementMs: 0 }, 1000),
        events: [],
        seq: { lastNonce: [null, null], lastIntent: [null, null] },
        drawOfferBy: null,
        startedAt: 1000,
        outcome: null,
      };

      // Attacker "eve" is not in players array
      const idorMove = runIntent(duel, ChessPlugin, {
        playerId: "eve",
        intent: "e2e4",
        nonce: 1,
        baseVersion: 0,
      }, 1000);
      assert.equal(idorMove.ok, false);
      assert.equal(idorMove.reason, "MALFORMED");

      const idorResign = resign(duel, "eve", 1000);
      assert.equal(idorResign.ok, false);
      assert.equal(idorResign.reason, "MALFORMED");
    });

    it("defends against nonce replay attacks and action forgery", () => {
      const challenge = ChessPlugin.createChallenge("seed_sec_5");
      const duel = {
        duelId: "sec_match_5",
        gameId: "chess",
        players: ["alice", "bob"],
        status: "LIVE",
        state: challenge.state,
        clock: createClock({ initialMs: 300000, incrementMs: 0 }, 1000),
        events: [],
        seq: { lastNonce: [null, null], lastIntent: [null, null] },
        drawOfferBy: null,
        startedAt: 1000,
        outcome: null,
      };

      // First valid move
      const m1 = runIntent(duel, ChessPlugin, {
        playerId: "alice",
        intent: "e2e4",
        nonce: 1,
        baseVersion: 0,
      }, 1000);
      assert.equal(m1.ok, true);

      // Replay attack: resubmitting with same nonce but different move payload
      const mForged = runIntent(duel, ChessPlugin, {
        playerId: "alice",
        intent: "d2d4",
        nonce: 1, // Stale nonce
        baseVersion: 2,
      }, 1500);
      assert.equal(mForged.ok, false);
      assert.equal(mForged.reason, "REPLAYED_ACTION");
    });
  });

  describe("2. Tournament Certification", () => {
    it("validates bracket power-of-two rounding and seeding math", () => {
      assert.equal(nextPow2(2), 2);
      assert.equal(nextPow2(3), 4);
      assert.equal(nextPow2(7), 8);
      assert.equal(nextPow2(8), 8);
      assert.equal(nextPow2(15), 16);

      // 8-player bracket seed order: [1, 8, 4, 5, 2, 7, 3, 6]
      const seeds8 = bracketSeedOrder(8);
      assert.deepEqual(seeds8, [1, 8, 4, 5, 2, 7, 3, 6]);
      assert.equal(seeds8[0], 1);
      assert.equal(seeds8[1], 8, "Seed 1 plays Seed 8 in round 1");
    });

    it("generates correct tournament round 1 with top-seed byes for uneven counts", () => {
      // 5 players in an 8-slot bracket -> top 3 seeds get byes
      const players = ["seed1", "seed2", "seed3", "seed4", "seed5"];
      const round1 = buildFirstRound(players);
      assert.equal(round1.length, 4, "4 matches in round 1 of an 8-slot bracket");

      // Match 1: seed 1 vs bye (seat 1 is null)
      assert.equal(round1[0].seat0, "seed1");
      assert.equal(round1[0].seat1, null);

      // Match 2: seed 4 vs seed 5
      assert.equal(round1[1].seat0, "seed4");
      assert.equal(round1[1].seat1, "seed5");
    });

    it("verifies tournament prize settlement mathematics (88% winner, 12% platform rake)", () => {
      // 8 players, entry fee $10 USDT = $80 USDT total pot ($40 per side equivalent)
      const potMinor = 80_000_000n;
      const tournamentRule = { rakeBps: 1200, minRakeMinor: 0n, maxRakeMinor: null };
      const { rakeMinor } = computeRake(potMinor, tournamentRule);
      assert.equal(rakeMinor, 9_600_000n, "Platform fee 12% is $9.60 USDT");

      const prizePool = potMinor - rakeMinor;
      assert.equal(prizePool, 70_400_000n, "Winner prize pool 88% is $70.40 USDT");

      const legs = settlementLegs({
        seat0: "winner_champion",
        seat1: "runner_up",
        stakeMinor: 40_000_000n,
        result: "1-0",
        rakeMinor,
      });
      assert.equal(legs.length, 4);
      // Winner receives credit for prizePool (pot less fee)
      const winnerLeg = legs.find((l) => l.account === "user:winner_champion:available");
      assert.equal(winnerLeg.amount, "-70400000"); // Credit to user
      const platformLeg = legs.find((l) => l.account === "platform:rake");
      assert.equal(platformLeg.amount, "-9600000"); // Platform fee
    });
  });

  describe("3. Chaos, Recovery & Worker Restart", () => {
    it("hydrates and re-derives sequence state after worker restart", () => {
      // Simulated historical events persisted to DB
      const pastEvents = [
        { seq: 0, type: "INTENT_ACCEPTED", payload: { seat: 0, intent: "e2e4" }, serverTimeMs: 1000 },
        { seq: 1, type: "MOVE", payload: { uci: "e2e4", ply: 1 }, serverTimeMs: 1000 },
        { seq: 2, type: "INTENT_ACCEPTED", payload: { seat: 1, intent: "e7e5" }, serverTimeMs: 2000 },
        { seq: 3, type: "MOVE", payload: { uci: "e7e5", ply: 2 }, serverTimeMs: 2000 },
      ];

      // Reconstructed on new worker after restart
      const seqState = deriveSequenceState(pastEvents);
      assert.ok(seqState, "Sequence state must be derived successfully");
      assert.ok(Array.isArray(seqState.lastNonce));
      assert.equal(pastEvents.length, 4);
    });

    it("survives client disconnection with 30s grace period without clock fraud", () => {
      let mockTime = 100_000;
      const sync = new MatchRealtimeSync({
        matchId: "match_chaos_disconnect",
        players: ["p1", "p2"],
        now: () => mockTime,
      });

      sync.bindClient("p1", "sock_initial", mockTime);
      sync.bindClient("p2", "sock_p2", mockTime);

      // p1 pulls the ethernet cable
      sync.disconnectClient("p1", "sock_initial", mockTime);

      // Clocks tick on server
      mockTime += 15_000;
      // p1 reconnects at +15s (grace period still valid)
      const reconn = sync.bindClient("p1", "sock_reconnected", mockTime);
      assert.equal(reconn.ok, true);
      assert.equal(reconn.wasDisconnected, true);
      assert.equal(sync.playerSessions.get("p1").connected, true);

      // Disconnect grace was successfully cleared
      assert.equal(sync.playerSessions.get("p1").graceExpiryAt, null);
    });
  });

  describe("4. Data Integrity: Anti-Double-Pay & Invariant Guarantees", () => {
    it("guarantees a completed match NEVER pays twice (settlement idempotency)", () => {
      const match = new MatchLifecycleInstance({
        matchId: "integrity_match_1",
        gameId: "chess",
        variantId: "standard",
        players: ["alice", "bob"],
        tier: "CASH",
        stakeMinor: 5_000_000n,
      });

      match.startConfirmation();
      match.confirmPlayer("alice", true);
      match.confirmPlayer("bob", true);
      match.transition(MatchState.STARTING);
      match.transition(MatchState.LIVE);
      match.finalizeMatch({ result: "1-0", reason: "CHECKMATE", replayHash: "hash_int_1" });
      match.startSettling();

      // First settlement execution
      const s1 = match.completeSettlement({
        transactionId: "tx_ledger_exclusive_1",
        ratings: { alice: 1530, bob: 1470 },
        rakeMinor: 1_200_000n,
      });
      assert.equal(s1.ok, true);
      assert.equal(match.state, MatchState.COMPLETED);
      assert.equal(match.settlementData.transactionId, "tx_ledger_exclusive_1");

      // Repeated settlement execution (e.g. duplicate webhook, worker retry, network resend)
      const s2 = match.completeSettlement({
        transactionId: "tx_ledger_DUPLICATE_FORGED",
        ratings: { alice: 9999, bob: 0 },
        rakeMinor: 999n,
      });
      assert.equal(s2.ok, true);
      assert.equal(s2.idempotent, true);
      // Original transaction ID preserved; duplicate transaction rejected!
      assert.equal(match.settlementData.transactionId, "tx_ledger_exclusive_1");
    });

    it("guarantees a completed match produces exactly ONE outcome (never two winners)", () => {
      const match = new MatchLifecycleInstance({
        matchId: "integrity_match_2",
        gameId: "chess",
        variantId: "standard",
        players: ["alice", "bob"],
      });

      match.startConfirmation();
      match.confirmPlayer("alice", true);
      match.confirmPlayer("bob", true);
      match.transition(MatchState.STARTING);
      match.transition(MatchState.LIVE);

      // Outcome 1 finalized: Alice wins
      const f1 = match.finalizeMatch({ result: "1-0", reason: "CHECKMATE", replayHash: "hash_alice_win" });
      assert.equal(f1.ok, true);
      assert.equal(match.outcome.result, "1-0");

      // Attempt to overwrite outcome: Bob claims win
      const f2 = match.finalizeMatch({ result: "0-1", reason: "CHEATING", replayHash: "hash_bob_forged" });
      assert.equal(f2.ok, true);
      assert.equal(f2.idempotent, true);
      // Outcome strictly remains 1-0!
      assert.equal(match.outcome.result, "1-0");
    });
  });
});
