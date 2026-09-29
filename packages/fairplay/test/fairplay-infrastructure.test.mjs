/**
 * Nizalo Fair Play Infrastructure - Security & Adversarial Test Suite.
 *
 * Exhaustively verifies all 6 Fair Play Layers:
 * LAYER 1: Server Authority (State, Moves, Clock, RNG, Result)
 * LAYER 2: Event Integrity (Strict Ordering, Hash-Chained Immutability, Tamper Detection)
 * LAYER 3: Client Telemetry (Action Timing, Physiological Limits, Reconnects, Non-Accusatory)
 * LAYER 4: Behavior Analysis (Risk States, Noisy-OR, Human Gate, Game-Specific Anti-Cheat)
 * LAYER 5: Replay & Adjudication (Exact Timestamps, Deterministic Re-Simulation, Viewer, Timelines)
 * LAYER 6: Dispute System (5 Categories, Evidence, Mandatory Reasons, 2-Admin Independence)
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  AuthoritativeRng,
  AuthoritativeClock,
  AuthoritativeMatchServer,
} from "../src/server-authority.mjs";
import {
  MatchEvent,
  EventChainLog,
  verifyEventChain,
  GENESIS_HASH,
} from "../src/event-integrity.mjs";
import {
  ClientTelemetryCollector,
  HUMAN_LIMITS,
} from "../src/client-telemetry.mjs";
import {
  BehaviorRiskEngine,
  RiskState,
  ChessAnalyzer,
  SpeedMathAnalyzer,
  BoardGameAnalyzer,
  RngAuditAnalyzer,
} from "../src/behavior-analysis.mjs";
import {
  MatchReplay,
  MoveTimeline,
  EventTimeline,
  GameStateInspector,
} from "../src/replay.mjs";
import {
  DisputeService,
  DisputeCategory,
  DisputeStatus,
  DisputeDecision,
} from "../src/dispute-system.mjs";

// Mock game rules validator for XO (Tic-Tac-Toe)
const mockXoRules = {
  validateMove(state, seat, action) {
    const { r, c } = action;
    if (r < 0 || r > 2 || c < 0 || c > 2) {
      return { valid: false, reason: "OUT_OF_BOUNDS" };
    }
    if (state.board[r][c] !== null) {
      return { valid: false, reason: "CELL_OCCUPIED" };
    }
    return { valid: true };
  },
  applyMove(state, seat, action) {
    const next = structuredClone(state);
    next.board[action.r][action.c] = seat === 0 ? "X" : "O";
    next.plyCount = (next.plyCount || 0) + 1;
    return next;
  },
  checkTerminal(state) {
    const b = state.board;
    const lines = [
      // Rows
      [b[0][0], b[0][1], b[0][2]],
      [b[1][0], b[1][1], b[1][2]],
      [b[2][0], b[2][1], b[2][2]],
      // Columns
      [b[0][0], b[1][0], b[2][0]],
      [b[0][1], b[1][1], b[2][1]],
      [b[0][2], b[1][2], b[2][2]],
      // Diagonals
      [b[0][0], b[1][1], b[2][2]],
      [b[0][2], b[1][1], b[2][0]],
    ];

    for (const line of lines) {
      if (line[0] && line[0] === line[1] && line[1] === line[2]) {
        const winnerSeat = line[0] === "X" ? 0 : 1;
        return { isOver: true, winnerSeat, result: winnerSeat === 0 ? "1-0" : "0-1", reason: "THREE_IN_A_ROW" };
      }
    }

    const full = b.every((row) => row.every((cell) => cell !== null));
    if (full) {
      return { isOver: true, winnerSeat: null, result: "1/2-1/2", reason: "BOARD_FULL" };
    }

    return { isOver: false, winnerSeat: null, result: null, reason: null };
  },
};

const initialXoState = {
  board: [
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ],
  plyCount: 0,
};

describe("LAYER 1: Server Authority", () => {
  test("authoritative server rejects forged result and illegal moves without mutating state", () => {
    const server = new AuthoritativeMatchServer({
      matchId: "m_auth_1",
      gameId: "xo",
      players: ["p1", "p2"],
      rulesValidator: mockXoRules,
      initialState: initialXoState,
    });
    server.start();

    // 1. Client attempts to forge an illegal move (out of bounds)
    const res1 = server.processIntent({
      seat: 0,
      action: { r: 5, c: 5 },
      clientClaimedResult: "1-0", // forged assertion
    });
    assert.equal(res1.ok, false);
    assert.equal(res1.reason, "OUT_OF_BOUNDS");
    // Board state remains pristine
    assert.deepEqual(server.state.board, initialXoState.board);

    // 2. Client attempts to act out of turn (seat 1 before seat 0 moves)
    const res2 = server.processIntent({ seat: 1, action: { r: 1, c: 1 } });
    assert.equal(res2.ok, false);
    assert.equal(res2.reason, "NOT_YOUR_TURN");

    // 3. Legal move succeeds
    const res3 = server.processIntent({ seat: 0, action: { r: 1, c: 1 } });
    assert.equal(res3.ok, true);
    assert.equal(server.state.board[1][1], "X");

    // 4. Client attempts to play on already occupied cell
    const res4 = server.processIntent({ seat: 1, action: { r: 1, c: 1 } });
    assert.equal(res4.ok, false);
    assert.equal(res4.reason, "CELL_OCCUPIED");
  });

  test("authoritative clock prevents client timestamp tampering", () => {
    let mockTime = 1000000;
    const clock = new AuthoritativeClock({
      initialTimeMs: 10_000, // 10 seconds
      incrementMs: 1_000,
      now: () => mockTime,
    });

    clock.start(0);

    // Simulate 3 seconds elapsed server-side
    mockTime += 3000;
    const snap1 = clock.getSnapshot();
    assert.equal(snap1.remainingMs[0], 7000);

    // Turn switches: player 0 gets 1s increment = 8000ms left
    const sw = clock.switchTurn(1);
    assert.equal(sw.flagged, false);
    assert.equal(clock.remainingMs[0], 8000);

    // Player 1 runs out of time (8s elapsed on 10s clock + 3s more)
    mockTime += 11000;
    const flag = clock.checkFlag();
    assert.equal(flag.flagged, true);
    assert.equal(flag.seat, 1);
  });

  test("authoritative RNG with cryptographic commit-reveal prevents client seed/dice manipulation", () => {
    const rng = new AuthoritativeRng({ clientSeed: "user_provided_entropy" });
    const commitment = rng.getCommitment();
    assert.ok(commitment.commitHash);

    // Roll 10 dice
    const rolls = [];
    for (let i = 0; i < 10; i++) {
      rolls.push(rng.rollDie("backgammon_turn"));
    }

    assert.equal(rolls.length, 10);
    assert.ok(rolls.every((r) => r >= 1 && r <= 6));

    // Reveal seed at end of game
    const revealed = rng.reveal();
    assert.equal(revealed.totalRolls, 10);

    // Verify audit
    const auditRes = AuthoritativeRng.verifyAudit({
      serverSeed: revealed.serverSeed,
      commitHash: revealed.commitHash,
      clientSeed: revealed.clientSeed,
      rolls: revealed.history,
    });
    assert.equal(auditRes.valid, true);

    // Tampered seed fails audit
    const tamperedRes = AuthoritativeRng.verifyAudit({
      serverSeed: "tampered_seed_1234567890abcdef1234567890abcdef",
      commitHash: revealed.commitHash,
      clientSeed: revealed.clientSeed,
      rolls: revealed.history,
    });
    assert.equal(tamperedRes.valid, false);
    assert.equal(tamperedRes.reason, "COMMITMENT_HASH_MISMATCH");
  });
});

describe("LAYER 2: Event Integrity", () => {
  test("creates strictly ordered, cryptographically linked immutable event log", () => {
    const log = new EventChainLog({ matchId: "m_chain_1" });

    log.append({ type: "MATCH_INIT", payload: { tier: "CASH" } });
    log.append({ type: "CLOCK_START", payload: { seat: 0 } });
    log.append({ type: "INTENT_ACCEPTED", payload: { ply: 1, move: "e4" } });
    log.append({ type: "INTENT_ACCEPTED", payload: { ply: 2, move: "e5" } });
    log.append({ type: "RESULT_FINALIZED", payload: { result: "1-0" } });

    assert.equal(log.length, 5);

    // Verify chain is valid
    const verifyRes = log.verify();
    assert.equal(verifyRes.valid, true);
    assert.equal(verifyRes.eventCount, 5);
    assert.equal(verifyRes.errors.length, 0);
  });

  test("detects tampered event content, sequence gaps, and broken hash links", () => {
    const log = new EventChainLog({ matchId: "m_tamper_1" });
    log.append({ type: "MATCH_INIT", payload: { stake: 10 } });
    log.append({ type: "INTENT_ACCEPTED", payload: { move: "d4" } });
    log.append({ type: "RESULT_FINALIZED", payload: { result: "1-0" } });

    const rawEvents = log.toArray().map((e) => e.toJSON());

    // 1. Adversary alters payload of event 2 (changes move to illegal "d5")
    const tamperedPayload = structuredClone(rawEvents);
    tamperedPayload[1].payload.move = "d5";

    const res1 = verifyEventChain(tamperedPayload);
    assert.equal(res1.valid, false);
    assert.ok(res1.errors.some((e) => e.includes("TAMPERED_EVENT")));

    // 2. Adversary drops an event in the middle (sequence gap)
    const droppedEvent = [rawEvents[0], rawEvents[2]];
    const res2 = verifyEventChain(droppedEvent);
    assert.equal(res2.valid, false);
    assert.ok(res2.errors.some((e) => e.includes("SEQUENCE_GAP")));
  });
});

describe("LAYER 3: Client Telemetry", () => {
  test("identifies impossible human timing without making ungrounded accusations", () => {
    const collector = new ClientTelemetryCollector({
      matchId: "m_telem_1",
      playerId: "p1",
      seat: 0,
      gameId: "chess",
    });

    // 5 normal moves (1.5s - 3s)
    collector.recordMoveTiming(2100);
    collector.recordMoveTiming(1800);
    collector.recordMoveTiming(2500);
    collector.recordMoveTiming(3200);
    collector.recordMoveTiming(1900);

    // 1 impossible move (40ms - humanly impossible for chess calculation)
    collector.recordMoveTiming(40);

    const metrics = collector.getSummaryMetrics();
    assert.equal(metrics.impossibleTimingCount, 1);
    assert.equal(metrics.minMoveTimeMs, 40);

    const signals = collector.generateSignals();
    assert.equal(signals.length, 1);
    assert.equal(signals[0].kind, "IMPOSSIBLE_INPUT");
    assert.ok(signals[0].confidence > 0);
  });

  test("detects robotic cadence uniformity across multiple moves", () => {
    const collector = new ClientTelemetryCollector({
      matchId: "m_telem_2",
      playerId: "bot_player",
      seat: 0,
      gameId: "gomoku",
    });

    // 10 moves executed at exactly ~1000ms with near-zero jitter (1ms-2ms)
    for (let i = 0; i < 10; i++) {
      collector.recordMoveTiming(1000 + (i % 2 === 0 ? 2 : -2));
    }

    const metrics = collector.getSummaryMetrics();
    assert.ok(metrics.stdDevMoveTimeMs < HUMAN_LIMITS.CADENCE_VARIANCE_MIN_MS);

    const signals = collector.generateSignals();
    const autoSignal = signals.find((s) => s.kind === "AUTOMATION");
    assert.ok(autoSignal);
    assert.equal(autoSignal.strength, 0.8);
  });
});

describe("LAYER 4: Behavior Analysis & Game-Specific Anti-Cheat", () => {
  test("Noisy-OR aggregates signals and caps automated detection at REVIEW", () => {
    const engine = new BehaviorRiskEngine();

    // High suspicion signals
    const s1 = { kind: "ENGINE_ASSISTANCE", strength: 0.9, confidence: 0.8 };
    const s2 = { kind: "AUTOMATION", strength: 0.85, confidence: 0.8 };

    const evalRes = engine.evaluateSignals("suspect_1", [s1, s2]);

    assert.ok(evalRes.score >= 60);
    assert.equal(evalRes.state, RiskState.REVIEW);
    assert.equal(evalRes.requiresHumanReview, true);
  });

  test("enforces human review gate before RESTRICTED state can be applied", () => {
    const engine = new BehaviorRiskEngine();
    engine.evaluateSignals("suspect_2", [
      { kind: "ENGINE_ASSISTANCE", strength: 0.95, confidence: 0.95 },
      { kind: "IMPOSSIBLE_INPUT", strength: 0.95, confidence: 0.95 },
    ]);

    // Profile is at REVIEW, not automatically RESTRICTED
    assert.equal(engine.getProfile("suspect_2").state, RiskState.REVIEW);

    // Human admin review without note fails
    assert.throws(
      () => engine.applyHumanReviewDecision({
        playerId: "suspect_2",
        adminId: "admin_sarah",
        decision: "CONFIRM_RESTRICTION",
        reasonNote: "", // empty note
      }),
      /DECISION_REASON_MANDATORY/
    );

    // Human admin review without adminId fails
    assert.throws(
      () => engine.applyHumanReviewDecision({
        playerId: "suspect_2",
        adminId: null,
        decision: "CONFIRM_RESTRICTION",
        reasonNote: "Sufficient evidence of engine use verified by referee",
      }),
      /REVIEWER_REQUIRED/
    );

    // Valid human review succeeds
    const decisionRes = engine.applyHumanReviewDecision({
      playerId: "suspect_2",
      adminId: "admin_sarah",
      decision: "CONFIRM_RESTRICTION",
      reasonNote: "Human arbiter confirmed engine correlation on 15 consecutive moves",
    });

    assert.equal(decisionRes.ok, true);
    assert.equal(decisionRes.state, RiskState.RESTRICTED);
  });

  test("Chess Analyzer catches engine-relay timing signatures", () => {
    // 10 midgame moves with unnaturally identical delay (e.g. 4500ms ± 50ms)
    const timings = [
      1200, 1500, 1100, 1400, 1300, 1200, // opening
      4500, 4520, 4490, 4510, 4505, 4515, 4495, 4500, // midgame
    ];

    const signals = ChessAnalyzer.analyze({ moveTimingsMs: timings });
    assert.equal(signals.length, 1);
    assert.equal(signals[0].kind, "ENGINE_ASSISTANCE");
  });

  test("Speed Math Analyzer catches impossible human calculation speeds", () => {
    const timings = [80, 75, 90, 110, 85]; // all < 120ms
    const signals = SpeedMathAnalyzer.analyze({ responseTimesMs: timings });

    const impossible = signals.find((s) => s.kind === "IMPOSSIBLE_INPUT");
    assert.ok(impossible);
    assert.equal(impossible.strength, 0.95);
  });

  test("Board Game Analyzer catches out-of-order nonces and out-of-turn attempts", () => {
    const actions = [
      { nonce: 1, expectedNonce: 1, seat: 0, activeSeat: 0 },
      { nonce: 4, expectedNonce: 2, seat: 1, activeSeat: 1 }, // gap in nonce
      { nonce: 3, expectedNonce: 3, seat: 0, activeSeat: 1, outOfTurn: true }, // out of turn
    ];

    const signals = BoardGameAnalyzer.analyzeSequence({ actions });
    assert.equal(signals.length, 2);
    assert.equal(signals[0].kind, "PROTOCOL_VIOLATION");
    assert.equal(signals[1].kind, "PROTOCOL_VIOLATION");
  });

  test("RNG Audit Analyzer audits commit-reveal seed and dice uniformity", () => {
    const seed = "super_secret_seed_42";
    const commitHash = createHash("sha256").update(seed).digest("hex");
    const verified = RngAuditAnalyzer.verifyCommitReveal({
      serverSeed: seed,
      commitHash,
    });
    assert.equal(verified.valid, true);

    // Uniform dice check on 60 rolls
    const uniformRolls = Array(10).fill([1, 2, 3, 4, 5, 6]).flat();
    const auditRes = RngAuditAnalyzer.auditDiceDistribution(uniformRolls);
    assert.equal(auditRes.audited, true);
    assert.equal(auditRes.isUniform, true);
  });
});

describe("LAYER 5: Replay & Adjudication", () => {
  test("MatchReplay reproduces exact moves, timestamps, and verifies determinism", () => {
    const moves = [
      { ply: 1, seat: 0, action: { r: 0, c: 0 }, timestamp: 1000, timeTakenMs: 1000, stateAfter: { board: [["X", null, null], [null, null, null], [null, null, null]], plyCount: 1 } },
      { ply: 2, seat: 1, action: { r: 1, c: 0 }, timestamp: 2500, timeTakenMs: 1500, stateAfter: { board: [["X", null, null], ["O", null, null], [null, null, null]], plyCount: 2 } },
      { ply: 3, seat: 0, action: { r: 0, c: 1 }, timestamp: 3500, timeTakenMs: 1000, stateAfter: { board: [["X", "X", null], ["O", null, null], [null, null, null]], plyCount: 3 } },
      { ply: 4, seat: 1, action: { r: 1, c: 1 }, timestamp: 5000, timeTakenMs: 1500, stateAfter: { board: [["X", "X", null], ["O", "O", null], [null, null, null]], plyCount: 4 } },
      { ply: 5, seat: 0, action: { r: 0, c: 2 }, timestamp: 6000, timeTakenMs: 1000, stateAfter: { board: [["X", "X", "X"], ["O", "O", null], [null, null, null]], plyCount: 5 } },
    ];

    const replay = new MatchReplay({
      matchId: "m_replay_1",
      gameId: "xo",
      players: ["p1", "p2"],
      initialState: initialXoState,
      finalState: moves[4].stateAfter,
      outcome: { winnerId: "p1", result: "1-0", reason: "THREE_IN_A_ROW" },
      moves,
    });

    // Verify deterministic reproduction
    const detRes = replay.verifyDeterminism(mockXoRules);
    assert.equal(detRes.deterministic, true);
    assert.equal(detRes.totalPlies, 5);

    // Interactive Replay Viewer
    const viewer = replay.createViewer();
    assert.equal(viewer.getCurrentPly(), 0);
    assert.deepEqual(viewer.getCurrentState().board, initialXoState.board);

    // Step forward
    viewer.stepForward();
    assert.equal(viewer.getCurrentPly(), 1);
    assert.equal(viewer.getCurrentState().board[0][0], "X");

    // Seek to final ply
    viewer.seekToPly(5);
    assert.equal(viewer.getCurrentPly(), 5);
    assert.equal(viewer.isFinished(), true);
    assert.deepEqual(viewer.getCurrentState().board[0], ["X", "X", "X"]);
  });
});

describe("LAYER 6: Dispute System", () => {
  test("handles dispute filing across all 5 categories with mandatory reasons and 2-admin appeal independence", () => {
    const service = new DisputeService();

    // 1. File dispute across each category
    const categories = [
      DisputeCategory.ILLEGAL_MOVE,
      DisputeCategory.DISCONNECT,
      DisputeCategory.WRONG_RESULT,
      DisputeCategory.SUSPICIOUS_BEHAVIOR,
      DisputeCategory.SETTLEMENT_ISSUE,
    ];

    for (const cat of categories) {
      const res = service.fileDispute({
        matchId: `m_disp_${cat}`,
        reporterId: "player_alice",
        category: cat,
        evidence: { description: `Filing dispute for ${cat}` },
      });
      assert.equal(res.ok, true);
      assert.equal(res.status, DisputeStatus.OPEN);
    }

    // 2. Assign reviewer
    const d1 = service.fileDispute({
      matchId: "m_disp_investigate",
      reporterId: "player_bob",
      category: DisputeCategory.WRONG_RESULT,
      evidence: { replayPly: 14, claim: "Flag fell while move was in flight" },
    });

    service.assignReviewer({ disputeId: d1.disputeId, adminId: "admin_carl" });
    assert.equal(service.getDispute(d1.disputeId).status, DisputeStatus.UNDER_REVIEW);

    // 3. Resolve dispute (requires reason note >= 10 chars)
    assert.throws(
      () => service.resolveDispute({
        disputeId: d1.disputeId,
        adminId: "admin_carl",
        decision: DisputeDecision.UPHELD_REFUND,
        decisionReason: "too short", // < 10 chars
      }),
      /DECISION_REASON_MANDATORY/
    );

    const resolveRes = service.resolveDispute({
      disputeId: d1.disputeId,
      adminId: "admin_carl",
      decision: DisputeDecision.UPHELD_REFUND,
      decisionReason: "Server clock logs show packet received before flag expiration.",
    });
    assert.equal(resolveRes.ok, true);
    assert.equal(resolveRes.status, DisputeStatus.RESOLVED);

    // 4. Opponent appeals decision
    const appealRes = service.appealDispute({
      disputeId: d1.disputeId,
      appellantId: "player_alice",
      appealNote: "Network latency exceeds permitted grace window.",
    });
    assert.equal(appealRes.ok, true);
    assert.equal(service.getDispute(d1.disputeId).status, DisputeStatus.APPEALED);

    // 5. Strict 2-Admin Independence rule: Admin Carl CANNOT review his own appeal!
    assert.throws(
      () => service.resolveAppeal({
        disputeId: d1.disputeId,
        appealAdminId: "admin_carl", // Same admin
        upheld: false,
        appealDecisionReason: "Re-evaluated and maintaining original conclusion.",
      }),
      /REVIEWER_NOT_INDEPENDENT/
    );

    // Independent admin reviews appeal
    const appealDecided = service.resolveAppeal({
      disputeId: d1.disputeId,
      appealAdminId: "admin_diana", // Independent admin
      upheld: false,
      appealDecisionReason: "Independent arbiter reviewed raw server timestamp and confirmed move was within grace.",
    });
    assert.equal(appealDecided.ok, true);
    assert.equal(appealDecided.status, DisputeStatus.CLOSED);
    assert.equal(service.getDispute(d1.disputeId).auditTrail.length, 5);
  });
});
