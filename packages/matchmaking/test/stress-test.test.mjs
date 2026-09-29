import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MatchOrchestrator } from "../src/match-orchestrator.mjs";
import { MatchState, AbortReason } from "../src/lifecycle.mjs";
import { RealtimeMessageType } from "../../realtime/src/resync-protocol.mjs";
import { ChessPlugin } from "../../game-chess/src/plugin.mjs";

describe("Matchmaking & Match Lifecycle Stress & Concurrency Suite", () => {
  it("handles high concurrency matchmaking across 60 players in diverse games and tiers", async () => {
    let mockTime = 1_000_000;
    const orchestrator = new MatchOrchestrator({ now: () => mockTime });

    const games = ["chess", "gomoku", "seega"];
    const tiers = ["FREE", "CASH"];
    const ratings = [1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100];

    const players = [];
    for (let i = 0; i < 60; i++) {
      const game = games[i % games.length];
      const tier = tiers[i % tiers.length];
      const rating = ratings[i % ratings.length];
      const playerId = `player_stress_${i}`;

      // Established rating setup for cash play
      orchestrator.pool.setGameRating(playerId, game, {
        rating,
        rd: 45,
        gamesPlayed: 30,
      });

      players.push({
        playerId,
        gameId: game,
        variantId: "standard",
        tier,
        stakeMinor: tier === "CASH" ? 2_000_000n : 0n,
      });
    }

    // Concurrent enqueue using Promise.all
    const enqueueResults = await Promise.all(
      players.map((p) => Promise.resolve(orchestrator.enqueuePlayer(p)))
    );

    for (const res of enqueueResults) {
      assert.equal(res.ok, true, `Player should enqueue successfully: ${JSON.stringify(res)}`);
    }

    // Run matchmaking sweep
    const matched = orchestrator.runMatchmaking();
    assert.ok(matched.length > 0, "Should generate matched pairings");

    // Verify isolation guarantees across all generated matches
    for (const match of matched) {
      assert.ok(match.players[0] !== match.players[1], "Player cannot match against themselves");
      
      const p1Game = players.find((p) => p.playerId === match.players[0]).gameId;
      const p2Game = players.find((p) => p.playerId === match.players[1]).gameId;
      assert.equal(p1Game, p2Game, "Matches must strictly share the same game");
      assert.equal(p1Game, match.gameId);

      const p1Tier = players.find((p) => p.playerId === match.players[0]).tier;
      const p2Tier = players.find((p) => p.playerId === match.players[1]).tier;
      assert.equal(p1Tier, p2Tier, "Matches must strictly share the same tier");
      assert.equal(p1Tier, match.tier);

      // Verify rating delta within tolerance
      const r1 = orchestrator.pool.getGameRating(match.players[0], match.gameId).rating;
      const r2 = orchestrator.pool.getGameRating(match.players[1], match.gameId).rating;
      const delta = Math.abs(r1 - r2);
      assert.ok(delta <= 400, `Rating delta (${delta}) should be within tolerance window`);
    }

    // Verify empirical telemetry calculation
    const telemetry = orchestrator.pool.getTelemetry();
    assert.ok(telemetry.sampleSize >= matched.length);
    assert.ok(typeof telemetry.averageQueueTimeMs === "number");
    assert.ok(typeof telemetry.p90QueueTimeMs === "number");
  });

  it("handles simultaneous acceptance at the exact same millisecond across 20 matches", async () => {
    let mockTime = 2_000_000;
    const orchestrator = new MatchOrchestrator({ now: () => mockTime });

    // Seed 40 players for 20 matches
    const pairs = [];
    for (let i = 0; i < 20; i++) {
      const pA = `batch_pA_${i}`;
      const pB = `batch_pB_${i}`;
      orchestrator.pool.setGameRating(pA, "chess", { rating: 1500, rd: 40, gamesPlayed: 25 });
      orchestrator.pool.setGameRating(pB, "chess", { rating: 1500, rd: 40, gamesPlayed: 25 });

      orchestrator.enqueuePlayer({ playerId: pA, gameId: "chess", tier: "FREE" });
      orchestrator.enqueuePlayer({ playerId: pB, gameId: "chess", tier: "FREE" });
    }

    const matches = orchestrator.runMatchmaking();
    assert.equal(matches.length, 20);

    // Simultaneous acceptance of all 40 players at the exact same tick
    const confirmationPromises = [];
    for (const match of matches) {
      confirmationPromises.push(
        orchestrator.handleConfirmation(match.matchId, match.players[0], true, ChessPlugin),
        orchestrator.handleConfirmation(match.matchId, match.players[1], true, ChessPlugin)
      );
    }

    const results = await Promise.all(confirmationPromises);
    assert.equal(results.length, 40);

    // Verify all 20 matches advanced to LIVE
    for (const match of matches) {
      const lifecycle = orchestrator.matches.get(match.matchId);
      assert.equal(lifecycle.state, MatchState.LIVE, "Match should transition to LIVE upon mutual acceptance");

      const duel = orchestrator.gameStates.get(match.matchId);
      assert.ok(duel, "Duel engine state should be initialized");
      assert.equal(duel.status, "LIVE");
    }
  });

  it("resolves simultaneous move submissions, turn order race conditions, and duplicate nonces", async () => {
    let mockTime = 3_000_000;
    const orchestrator = new MatchOrchestrator({ now: () => mockTime });

    orchestrator.pool.setGameRating("white_player", "chess", { rating: 1600, rd: 40, gamesPlayed: 20 });
    orchestrator.pool.setGameRating("black_player", "chess", { rating: 1600, rd: 40, gamesPlayed: 20 });

    orchestrator.enqueuePlayer({ playerId: "white_player", gameId: "chess", tier: "FREE" });
    orchestrator.enqueuePlayer({ playerId: "black_player", gameId: "chess", tier: "FREE" });

    const matches = orchestrator.runMatchmaking();
    const matchId = matches[0].matchId;

    await orchestrator.handleConfirmation(matchId, "white_player", true, ChessPlugin);
    await orchestrator.handleConfirmation(matchId, "black_player", true, ChessPlugin);

    // White's turn is first.
    // Simulate simultaneous move submissions from both players at the same millisecond:
    const [resWhite, resBlack] = await Promise.all([
      Promise.resolve(
        orchestrator.submitMove(matchId, ChessPlugin, {
          playerId: "white_player",
          intent: "e2e4",
          nonce: 1,
          baseVersion: 0,
        })
      ),
      Promise.resolve(
        orchestrator.submitMove(matchId, ChessPlugin, {
          playerId: "black_player",
          intent: "e7e5",
          nonce: 1,
          baseVersion: 0,
        })
      ),
    ]);

    // White is the active player -> move must succeed
    assert.equal(resWhite.ok, true, `White move must succeed: ${JSON.stringify(resWhite)}`);
    assert.equal(resWhite.seq, 1);
    assert.equal(resWhite.eventId, `evt_${matchId}_1`);

    // Black is NOT the active player -> out of turn move must be strictly rejected
    assert.equal(resBlack.ok, false);
    assert.ok(
      resBlack.reason === "NOT_YOUR_TURN" || resBlack.reason === "STALE_VERSION",
      `Expected NOT_YOUR_TURN or STALE_VERSION, got: ${resBlack.reason}`
    );

    // Test Duplicate Nonce Replay Attack from White:
    const replayRes = orchestrator.submitMove(matchId, ChessPlugin, {
      playerId: "white_player",
      intent: "d2d4",
      nonce: 1, // Stale/duplicate nonce
      baseVersion: 2,
    });
    assert.equal(replayRes.ok, false);
    assert.equal(replayRes.reason, "REPLAYED_ACTION");

    // Monotonic sequence verification: Black plays legal response
    mockTime += 1000;
    const resBlackLegal = orchestrator.submitMove(matchId, ChessPlugin, {
      playerId: "black_player",
      intent: "e7e5",
      nonce: 1,
      baseVersion: 2,
    });
    assert.equal(resBlackLegal.ok, true);
    assert.equal(resBlackLegal.seq, 2);
    assert.equal(resBlackLegal.eventId, `evt_${matchId}_2`);
  });

  it("handles duplicate requests with idempotency key deduplication", () => {
    let mockTime = 4_000_000;
    const orchestrator = new MatchOrchestrator({ now: () => mockTime });

    orchestrator.pool.setGameRating("user_clicker", "chess", { rating: 1500, rd: 50, gamesPlayed: 15 });

    const key = "rapid_click_uuid_12345";
    const attempts = [];
    for (let i = 0; i < 10; i++) {
      attempts.push(
        orchestrator.enqueuePlayer({
          playerId: "user_clicker",
          gameId: "chess",
          tier: "FREE",
          idempotencyKey: key,
        })
      );
    }

    // First attempt creates ticket
    assert.equal(attempts[0].ok, true);
    assert.equal(attempts[0].idempotent, undefined);
    const originalTicketId = attempts[0].ticketId;

    // Remaining 9 attempts are deduplicated idempotently
    for (let i = 1; i < 10; i++) {
      assert.equal(attempts[i].ok, true);
      assert.equal(attempts[i].idempotent, true);
      assert.equal(attempts[i].ticketId, originalTicketId);
    }
  });

  it("executes seamless disconnect, 30s grace period, and authoritative snapshot resync", async () => {
    let mockTime = 5_000_000;
    const orchestrator = new MatchOrchestrator({ now: () => mockTime });

    orchestrator.pool.setGameRating("player_alice", "chess", { rating: 1500, rd: 40, gamesPlayed: 20 });
    orchestrator.pool.setGameRating("player_bob", "chess", { rating: 1500, rd: 40, gamesPlayed: 20 });

    orchestrator.enqueuePlayer({ playerId: "player_alice", gameId: "chess", tier: "FREE" });
    orchestrator.enqueuePlayer({ playerId: "player_bob", gameId: "chess", tier: "FREE" });

    const matches = orchestrator.runMatchmaking();
    const matchId = matches[0].matchId;

    await orchestrator.handleConfirmation(matchId, "player_alice", true, ChessPlugin);
    await orchestrator.handleConfirmation(matchId, "player_bob", true, ChessPlugin);

    // Initial connection
    orchestrator.connectPlayer(matchId, "player_alice", "sock_alice_1");
    orchestrator.connectPlayer(matchId, "player_bob", "sock_bob_1");

    // Make opening move
    orchestrator.submitMove(matchId, ChessPlugin, {
      playerId: "player_alice",
      intent: "e2e4",
      nonce: 1,
      baseVersion: 0,
    });

    // Alice abruptly drops connection (tab closed or WiFi disconnected)
    mockTime += 2000;
    const discRes = orchestrator.disconnectPlayer(matchId, "player_alice", "sock_alice_1");
    assert.equal(discRes.ok, true);
    assert.equal(discRes.gracePeriodMs, 30_000);

    // Alice's presence is now marked as in grace period
    const midSnap = orchestrator.getAuthoritativeSnapshot(matchId);
    const alicePres = midSnap.presence.find((p) => p.playerId === "player_alice");
    assert.equal(alicePres.connected, false);
    assert.equal(alicePres.inGracePeriod, true);
    assert.ok(alicePres.graceRemainingMs <= 30_000 && alicePres.graceRemainingMs > 0);

    // Bob plays response move while Alice is reconnecting
    mockTime += 3000;
    const resBob = orchestrator.submitMove(matchId, ChessPlugin, {
      playerId: "player_bob",
      intent: "e7e5",
      nonce: 1,
      baseVersion: 2,
    });
    assert.equal(resBob.ok, true, `Bob move should succeed: ${JSON.stringify(resBob)}`);

    // Alice reconnects on a new device/tab (sock_alice_2) at +10s (well within 30s grace)
    mockTime += 5000;
    const reconnRes = orchestrator.connectPlayer(matchId, "player_alice", "sock_alice_2");
    assert.equal(reconnRes.ok, true);
    assert.equal(reconnRes.wasDisconnected, true);

    // Alice requests Authoritative STATE_SNAPSHOT since seq 0
    const fullSnapshot = orchestrator.getAuthoritativeSnapshot(matchId, 0);
    assert.equal(fullSnapshot.t, RealtimeMessageType.STATE_SNAPSHOT);
    assert.equal(fullSnapshot.seq, 2);
    assert.equal(fullSnapshot.lastEventId, `evt_${matchId}_2`);
    assert.ok(fullSnapshot.state);
    assert.ok(fullSnapshot.clock);
    assert.equal(fullSnapshot.missedEvents.length, 2);

    // Alice's presence is now active, grace period cleared
    const aliceReconnPres = fullSnapshot.presence.find((p) => p.playerId === "player_alice");
    assert.equal(aliceReconnPres.connected, true);
    assert.equal(aliceReconnPres.inGracePeriod, false);

    // Alice immediately makes move 3 on reconnected session
    const move3 = orchestrator.submitMove(matchId, ChessPlugin, {
      playerId: "player_alice",
      intent: "g1f3",
      nonce: 2,
      baseVersion: 4,
    });
    assert.equal(move3.ok, true, `Alice move 3 should succeed: ${JSON.stringify(move3)}`);
    assert.equal(move3.ok, true);
    assert.equal(move3.seq, 3);
  });

  it("handles duplicate match settlement triggers idempotently", async () => {
    let mockTime = 6_000_000;
    let ledgerCallCount = 0;
    const mockSettlement = {
      reserve: async () => ({ ok: true }),
      settle: async () => {
        ledgerCallCount++;
        return { ok: true, transactionId: "tx_mock_ledger_555", rakeMinor: "100000" };
      },
    };

    const orchestrator = new MatchOrchestrator({ settlement: mockSettlement, now: () => mockTime });

    orchestrator.pool.setGameRating("winner", "chess", { rating: 1600, rd: 40, gamesPlayed: 20 });
    orchestrator.pool.setGameRating("loser", "chess", { rating: 1600, rd: 40, gamesPlayed: 20 });

    orchestrator.enqueuePlayer({ playerId: "winner", gameId: "chess", tier: "CASH", stakeMinor: 2_000_000n });
    orchestrator.enqueuePlayer({ playerId: "loser", gameId: "chess", tier: "CASH", stakeMinor: 2_000_000n });

    const matches = orchestrator.runMatchmaking();
    const matchId = matches[0].matchId;

    await orchestrator.handleConfirmation(matchId, "winner", true, ChessPlugin);
    await orchestrator.handleConfirmation(matchId, "loser", true, ChessPlugin);

    // Trigger match finish
    const termRes1 = await orchestrator.handleMatchFinished(matchId, ChessPlugin, { result: "1-0", reason: "checkmate" });
    assert.equal(termRes1.state, MatchState.COMPLETED);
    assert.equal(termRes1.settlementTxId, "tx_mock_ledger_555");
    assert.equal(ledgerCallCount, 1);

    // Repeat match finish call (duplicate settlement event or worker retry)
    const termRes2 = await orchestrator.handleMatchFinished(matchId, ChessPlugin, { result: "1-0", reason: "checkmate" });
    assert.equal(termRes2.state, MatchState.COMPLETED);
    assert.equal(ledgerCallCount, 1, "Ledger settlement must NOT be called more than once");
  });
});
