import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MatchLifecycleInstance, MatchState, AbortReason } from "../src/lifecycle.mjs";
import { MatchRealtimeSync, RealtimeMessageType, HEARTBEAT_TIMEOUT_MS, DISCONNECT_GRACE_PERIOD_MS } from "../../realtime/src/resync-protocol.mjs";
import { MatchOrchestrator } from "../src/match-orchestrator.mjs";

describe("Match Lifecycle & Resilience State Machine", () => {
  it("strictly enforces valid sequential transitions through all 12 states", () => {
    let mockTime = 1_000_000;
    const match = new MatchLifecycleInstance({
      matchId: "match_lifecycle_test",
      gameId: "chess",
      variantId: "standard",
      players: ["alice", "bob"],
      now: () => mockTime,
    });

    // Initial state is MATCH_FOUND
    assert.equal(match.state, MatchState.MATCH_FOUND);

    // Illegal jump: MATCH_FOUND -> LIVE
    const illegalJump = match.transition(MatchState.LIVE);
    assert.equal(illegalJump.ok, false);
    assert.equal(illegalJump.reason, "INVALID_TRANSITION");
    assert.equal(illegalJump.current, MatchState.MATCH_FOUND);

    // Valid: MATCH_FOUND -> CONFIRMING
    const tConfirming = match.startConfirmation();
    assert.equal(tConfirming.ok, true);
    assert.equal(match.state, MatchState.CONFIRMING);

    // Idempotent: repeat transition to CONFIRMING
    const idempConfirming = match.transition(MatchState.CONFIRMING);
    assert.equal(idempConfirming.ok, true);
    assert.equal(idempConfirming.idempotent, true);

    // Confirm both players -> READY
    const cAlice = match.confirmPlayer("alice", true);
    assert.equal(cAlice.ok, true);
    assert.equal(cAlice.allConfirmed, false);
    assert.equal(match.state, MatchState.CONFIRMING);

    const cBob = match.confirmPlayer("bob", true);
    assert.equal(cBob.ok, true);
    assert.equal(cBob.allConfirmed, true);
    assert.equal(match.state, MatchState.READY);

    // Valid: READY -> STARTING -> LIVE
    assert.equal(match.transition(MatchState.STARTING).ok, true);
    assert.equal(match.transition(MatchState.LIVE).ok, true);
    assert.equal(match.state, MatchState.LIVE);

    // Valid: LIVE -> FINISHING -> FINALIZING
    assert.equal(match.finalizeMatch({ result: "1-0", reason: "checkmate", replayHash: "0xhash123" }).ok, true);
    assert.equal(match.state, MatchState.FINALIZING);

    // Valid: FINALIZING -> SETTLING
    assert.equal(match.startSettling().ok, true);
    assert.equal(match.state, MatchState.SETTLING);

    // Valid: SETTLING -> COMPLETED
    const compRes = match.completeSettlement({
      transactionId: "tx_settle_999",
      ratings: { alice: 1530, bob: 1470 },
      rakeMinor: 100_000n,
    });
    assert.equal(compRes.ok, true);
    assert.equal(match.state, MatchState.COMPLETED);

    // Terminal state: Cannot transition anywhere from COMPLETED
    const afterComplete = match.transition(MatchState.LIVE);
    assert.equal(afterComplete.ok, false);
    assert.equal(afterComplete.reason, "INVALID_TRANSITION");

    // Re-completing settlement is strictly idempotent
    const compAgain = match.completeSettlement({ transactionId: "tx_duplicate" });
    assert.equal(compAgain.ok, true);
    assert.equal(compAgain.idempotent, true);
    assert.equal(match.settlementData.transactionId, "tx_settle_999"); // Kept original
  });

  it("handles confirmation decline and priority re-queuing of innocent opponent", async () => {
    let mockTime = 10_000;
    const orchestrator = new MatchOrchestrator({ now: () => mockTime });

    // Seed ratings
    orchestrator.pool.setGameRating("victim", "chess", { rating: 1500, rd: 50, gamesPlayed: 20 });
    orchestrator.pool.setGameRating("quitter", "chess", { rating: 1500, rd: 50, gamesPlayed: 20 });

    orchestrator.enqueuePlayer({ playerId: "victim", gameId: "chess", tier: "FREE" });
    orchestrator.enqueuePlayer({ playerId: "quitter", gameId: "chess", tier: "FREE" });

    const matches = orchestrator.runMatchmaking();
    assert.equal(matches.length, 1);
    const matchId = matches[0].matchId;

    // Victim accepts
    const accRes = await orchestrator.handleConfirmation(matchId, "victim", true);
    assert.equal(accRes.ok, true);
    assert.equal(accRes.allConfirmed, false);

    // Quitter declines
    const decRes = await orchestrator.handleConfirmation(matchId, "quitter", false);
    assert.equal(decRes.ok, true);
    assert.equal(decRes.state, MatchState.ABORTED);
    assert.equal(decRes.reason, AbortReason.CONFIRMATION_DECLINED);

    // Check innocent victim is granted priority re-queue and re-enqueued automatically
    assert.equal(orchestrator.priorityQueue.has("victim"), true);
    const ticket = orchestrator.pool.activeTicketsByPlayer.get("victim");
    assert.ok(ticket, "Victim should be re-enqueued in pool");
    assert.equal(ticket.playerId, "victim");
  });

  it("handles confirmation timeout and auto-aborts", () => {
    let mockTime = 5_000;
    const match = new MatchLifecycleInstance({
      matchId: "match_timeout_test",
      gameId: "chess",
      variantId: "standard",
      players: ["alice", "bob"],
      confirmationWindowMs: 10_000,
      now: () => mockTime,
    });

    match.startConfirmation();
    assert.equal(match.state, MatchState.CONFIRMING);

    // Alice accepts at +2s
    mockTime += 2000;
    const aRes = match.confirmPlayer("alice", true);
    assert.equal(aRes.ok, true);
    assert.equal(aRes.allConfirmed, false);

    // Advance clock past 10s deadline (+12s total)
    mockTime += 12000;

    // Bob tries to accept after deadline
    const bRes = match.confirmPlayer("bob", true);
    assert.equal(bRes.ok, false);
    assert.equal(bRes.reason, AbortReason.CONFIRMATION_TIMEOUT);
    assert.equal(match.state, MatchState.ABORTED);
  });

  it("handles device switching and evicts older socket cleanly", () => {
    let mockTime = 100_000;
    const sync = new MatchRealtimeSync({
      matchId: "match_resync_test",
      players: ["alice", "bob"],
      now: () => mockTime,
    });

    // Alice connects from Mobile (socket_1)
    const conn1 = sync.bindClient("alice", "socket_mobile_1", mockTime);
    assert.equal(conn1.ok, true);
    assert.equal(conn1.wasDeviceSwitch, false);
    assert.equal(sync.playerSessions.get("alice").connected, true);
    assert.equal(sync.playerSessions.get("alice").socketId, "socket_mobile_1");

    // Alice opens Desktop browser (socket_2)
    mockTime += 5000;
    const conn2 = sync.bindClient("alice", "socket_desktop_2", mockTime);
    assert.equal(conn2.ok, true);
    assert.equal(conn2.wasDeviceSwitch, true);
    assert.equal(conn2.evictedSocket, "socket_mobile_1");
    assert.equal(sync.playerSessions.get("alice").socketId, "socket_desktop_2");

    // Stale mobile socket finally fires close event: should be treated as already replaced
    const staleDisconnect = sync.disconnectClient("alice", "socket_mobile_1", mockTime + 1000);
    assert.equal(staleDisconnect.ok, true);
    assert.equal(staleDisconnect.note, "socket was already replaced by newer session");
    // Alice remains connected via desktop socket
    assert.equal(sync.playerSessions.get("alice").connected, true);
    assert.equal(sync.playerSessions.get("alice").socketId, "socket_desktop_2");
  });

  it("manages 30-second disconnect grace period and heartbeat timeout", () => {
    let mockTime = 200_000;
    const sync = new MatchRealtimeSync({
      matchId: "match_grace_test",
      players: ["alice", "bob"],
      now: () => mockTime,
    });

    sync.bindClient("alice", "sock_alice", mockTime);
    sync.bindClient("bob", "sock_bob", mockTime);

    // Alice abruptly disconnects
    const disc = sync.disconnectClient("alice", "sock_alice", mockTime);
    assert.equal(disc.ok, true);
    assert.equal(disc.gracePeriodMs, DISCONNECT_GRACE_PERIOD_MS);
    assert.equal(disc.graceExpiryAt, mockTime + 30_000);

    // Heartbeat sweep at +10s: Grace period is active, no abandonment alert
    mockTime += 10_000;
    sync.handlePing("bob", mockTime);
    let alerts = sync.sweepHeartbeats(mockTime);
    assert.equal(alerts.length, 0);

    // Snapshot at +10s shows Alice in grace period
    const snap = sync.generateSnapshot({}, {}, "LIVE");
    const alicePresence = snap.presence.find((p) => p.playerId === "alice");
    assert.equal(alicePresence.connected, false);
    assert.equal(alicePresence.inGracePeriod, true);
    assert.equal(alicePresence.graceRemainingMs, 20_000);

    // Heartbeat sweep at +35s (> 30s grace expired): alerts abandonment
    mockTime += 25_000;
    sync.handlePing("bob", mockTime);
    alerts = sync.sweepHeartbeats(mockTime);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].type, "GRACE_EXPIRED_ABANDONMENT");
    assert.equal(alerts[0].playerId, "alice");
  });

  it("authoritative STATE_SNAPSHOT delivers complete state and sequence alignment", () => {
    let mockTime = 300_000;
    const sync = new MatchRealtimeSync({
      matchId: "match_snapshot_test",
      players: ["alice", "bob"],
      now: () => mockTime,
    });

    sync.bindClient("alice", "sock_alice", mockTime);
    sync.bindClient("bob", "sock_bob", mockTime);

    // Server generates events
    const evt1 = sync.nextEvent("MOVE_ACCEPTED", { ply: 1, uci: "e2e4" }, mockTime);
    const evt2 = sync.nextEvent("MOVE_ACCEPTED", { ply: 2, uci: "e7e5" }, mockTime + 1000);
    const evt3 = sync.nextEvent("MOVE_ACCEPTED", { ply: 3, uci: "g1f3" }, mockTime + 2000);

    assert.equal(evt3.seq, 3);
    assert.equal(evt3.eventId, "evt_match_snapshot_test_3");

    // Client requests snapshot since seq 1 (missed events 2 and 3)
    const snap = sync.generateSnapshot({ fen: "mock_fen" }, { whiteMs: 290000, blackMs: 295000 }, "LIVE", 1);
    assert.equal(snap.t, RealtimeMessageType.STATE_SNAPSHOT);
    assert.equal(snap.seq, 3);
    assert.equal(snap.lastEventId, "evt_match_snapshot_test_3");
    assert.equal(snap.missedEvents.length, 2);
    assert.equal(snap.missedEvents[0].seq, 2);
    assert.equal(snap.missedEvents[1].seq, 3);
  });
});
