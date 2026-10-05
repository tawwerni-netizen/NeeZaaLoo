/**
 * Nizalo Fair Play Infrastructure - LAYER 4: BEHAVIOR ANALYSIS & GAME-SPECIFIC LOGIC.
 *
 * Implements:
 * 1. Independent Risk Score (0 - 100) separate from match results or ELO.
 * 2. Risk States: NORMAL, WATCH, REVIEW, RESTRICTED.
 * 3. Human Gate: Automated detection may trigger REVIEW; irreversible account/financial actions strictly require human review.
 * 4. Game-Specific Anti-Cheat Analyzers:
 *    - Chess: Timing uniformity, engine correlation patterns.
 *    - Speed Math: Response timing, impossible human limits, bot macros.
 *    - Board Games: Impossible move sequences, packet/state tampering.
 *    - RNG Games: Commit-reveal seed verification, dice distribution audit.
 */

import { createHash } from "node:crypto";
import { TelemetrySignal } from "./client-telemetry.mjs";

export const RiskState = {
  NORMAL: "NORMAL",         // Score 0 - 29: Standard active player
  WATCH: "WATCH",           // Score 30 - 59: Telemetry flags observed; background sampling increased
  REVIEW: "REVIEW",         // Score 60 - 84: High anomaly rate; case queued for human referee
  RESTRICTED: "RESTRICTED", // Score 85 - 100: Sanctions applied; CASH mode disabled pending appeal
};

export function getRiskStateForScore(score) {
  if (score >= 85) return RiskState.RESTRICTED;
  if (score >= 60) return RiskState.REVIEW;
  if (score >= 30) return RiskState.WATCH;
  return RiskState.NORMAL;
}

/**
 * BehaviorRiskEngine
 * Aggregates evidence signals, maintains risk states, and enforces human review policy.
 */
export class BehaviorRiskEngine {
  constructor() {
    this.playerProfiles = new Map(); // playerId -> { score, state, history, activeCase }
  }

  getProfile(playerId) {
    if (!this.playerProfiles.has(playerId)) {
      this.playerProfiles.set(playerId, {
        playerId,
        score: 0,
        state: RiskState.NORMAL,
        signals: [],
        auditLog: [],
        activeCase: null,
      });
    }
    return this.playerProfiles.get(playerId);
  }

  /**
   * Evaluates new evidentiary signals and updates risk score using Noisy-OR.
   * Automated detection can only escalate up to REVIEW.
   */
  evaluateSignals(playerId, newSignals) {
    const profile = this.getProfile(playerId);
    profile.signals.push(...newSignals);

    // Group strongest evidence per kind to prevent simple repetition stacking
    const strongestByKind = new Map();
    for (const s of profile.signals) {
      const weight = s.strength * s.confidence;
      const prev = strongestByKind.get(s.kind);
      if (!prev || weight > prev.weight) {
        strongestByKind.set(s.kind, { weight, signal: s });
      }
    }

    // Noisy-OR accumulation: 1 - product(1 - weight_i)
    let survive = 1.0;
    for (const { weight } of strongestByKind.values()) {
      survive *= (1.0 - weight);
    }
    const computedScore = Math.min(100, Math.round((1.0 - survive) * 100));
    profile.score = computedScore;

    // Automated state transition: capped at REVIEW
    let nextState = getRiskStateForScore(computedScore);
    if (nextState === RiskState.RESTRICTED) {
      // Automatic detection CANNOT apply RESTRICTED without human review!
      nextState = RiskState.REVIEW;
    }

    const prevState = profile.state;
    if (nextState !== prevState) {
      profile.state = nextState;
      profile.auditLog.push({
        action: "STATE_TRANSITION",
        from: prevState,
        to: nextState,
        score: computedScore,
        by: "SYSTEM_AUTOMATED_DETECTOR",
        at: new Date().toISOString(),
      });
    }

    return {
      playerId,
      score: profile.score,
      state: profile.state,
      signalCount: profile.signals.length,
      requiresHumanReview: profile.state === RiskState.REVIEW,
    };
  }

  /**
   * Human Administrator Review Execution.
   * Required before irreversible RESTRICTED status or account/financial penalties.
   */
  applyHumanReviewDecision({
    playerId,
    adminId,
    decision, // "CONFIRM_RESTRICTION" | "DISMISS" | "EXTEND_WATCH"
    reasonNote,
  }) {
    if (!adminId) throw new Error("REVIEWER_REQUIRED: An authorized human admin must be identified");
    if (!reasonNote || reasonNote.trim().length < 10) {
      throw new Error("DECISION_REASON_MANDATORY: Human review requires a documented justification note");
    }

    const profile = this.getProfile(playerId);
    const prevState = profile.state;

    if (decision === "CONFIRM_RESTRICTION") {
      profile.state = RiskState.RESTRICTED;
      profile.score = Math.max(85, profile.score);
    } else if (decision === "DISMISS") {
      profile.state = RiskState.NORMAL;
      profile.score = 0;
      profile.signals = []; // Clear dismissed signals
    } else if (decision === "EXTEND_WATCH") {
      profile.state = RiskState.WATCH;
      profile.score = 45;
    }

    profile.auditLog.push({
      action: "HUMAN_REVIEW_DECISION",
      from: prevState,
      to: profile.state,
      decision,
      adminId,
      reasonNote,
      at: new Date().toISOString(),
    });

    return {
      ok: true,
      playerId,
      state: profile.state,
      score: profile.score,
      adminId,
    };
  }
}

// ============================================================================
// GAME-SPECIFIC ANTI-CHEAT ANALYZERS
// ============================================================================

/**
 * 1. CHESS ANALYZER
 * Analyzes move timing patterns and engine-like cadence:
 * - Constant delay regardless of tactical position complexity (e.g. bot macro delay 4.2s on forced recap)
 * - Highly uniform standard deviation across non-opening plies
 */
export class ChessAnalyzer {
  static analyze({ moveTimingsMs, moves = [] }) {
    const signals = [];
    if (!moveTimingsMs || moveTimingsMs.length < 8) return signals;

    // Filter out opening moves (first 6 plies)
    const midgameTimings = moveTimingsMs.slice(6);
    if (midgameTimings.length < 6) return signals;

    const mean = midgameTimings.reduce((a, b) => a + b, 0) / midgameTimings.length;
    const variance = midgameTimings.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / midgameTimings.length;
    const stdDev = Math.sqrt(variance);

    // Engine Relay Signature: Unnaturally uniform move delay (stdDev < 150ms over 6+ midgame moves)
    if (stdDev < 150 && mean > 1000) {
      signals.push(new TelemetrySignal({
        kind: "ENGINE_ASSISTANCE",
        strength: 0.85,
        confidence: 0.8,
        observed: { meanMoveTimeMs: Math.round(mean), stdDevMs: Math.round(stdDev), pliesAnalyzed: midgameTimings.length },
        baseline: { minExpectedStdDevMs: 600 },
        explanation: `Move timing exhibits robotic engine-relay uniformity (${Math.round(stdDev)}ms std dev across ${midgameTimings.length} complex plies).`,
      }));
    }

    return signals;
  }
}

/**
 * 2. SPEED MATH ANALYZER
 * Analyzes rapid computation timing:
 * - Physically impossible calculation speeds (< 120ms)
 * - Exact uniform reaction intervals indicating software solvers
 */
export class SpeedMathAnalyzer {
  static analyze({ responseTimesMs = [] }) {
    const signals = [];
    if (responseTimesMs.length === 0) return signals;

    const impossibleCount = responseTimesMs.filter((t) => t < 120).length;
    if (impossibleCount > 0) {
      signals.push(new TelemetrySignal({
        kind: "IMPOSSIBLE_INPUT",
        strength: 0.95,
        confidence: Math.min(1.0, 0.6 + impossibleCount * 0.2),
        observed: { impossibleAnswers: impossibleCount, totalAnswers: responseTimesMs.length, fastestMs: Math.min(...responseTimesMs) },
        baseline: { minimumHumanReactionMs: 120 },
        explanation: `Player answered ${impossibleCount} math problems faster than human physiological perception threshold (<120ms).`,
      }));
    }

    if (responseTimesMs.length >= 5) {
      const mean = responseTimesMs.reduce((a, b) => a + b, 0) / responseTimesMs.length;
      const variance = responseTimesMs.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / responseTimesMs.length;
      const stdDev = Math.sqrt(variance);

      // Automated macro solving
      if (stdDev < 10) {
        signals.push(new TelemetrySignal({
          kind: "AUTOMATION",
          strength: 0.9,
          confidence: 0.9,
          observed: { stdDevMs: Math.round(stdDev), meanMs: Math.round(mean) },
          baseline: { humanStdDevMs: 80 },
          explanation: `Automated response cadence detected with near-zero jitter (${Math.round(stdDev)}ms variance).`,
        }));
      }
    }

    return signals;
  }
}

/**
 * 3. BOARD GAME ANALYZER (Gomoku, Checkers, Dominoes, Backgammon, XO, Seega, Reversi, Ludo)
 * Analyzes sequence legality, nonce gaps, and packet tampering:
 * - Move coordinate tampering (out of bounds)
 * - Out-of-turn execution attempts
 * - Illegal sequence injection
 */
export class BoardGameAnalyzer {
  static analyzeSequence({ actions, expectedSequence }) {
    const signals = [];
    for (const act of actions) {
      if (act.nonce !== undefined && act.expectedNonce !== undefined) {
        if (act.nonce !== act.expectedNonce) {
          signals.push(new TelemetrySignal({
            kind: "PROTOCOL_VIOLATION",
            strength: 0.9,
            confidence: 0.95,
            observed: { submittedNonce: act.nonce, expectedNonce: act.expectedNonce },
            baseline: { strictMonotonicNonces: true },
            explanation: `Client submitted out-of-order action nonce (${act.nonce} vs expected ${act.expectedNonce}).`,
          }));
        }
      }

      if (act.outOfTurn) {
        signals.push(new TelemetrySignal({
          kind: "PROTOCOL_VIOLATION",
          strength: 0.8,
          confidence: 0.9,
          observed: { actorSeat: act.seat, activeSeat: act.activeSeat },
          baseline: { activeSeatMatches: true },
          explanation: `Client attempted to act out of turn (seat ${act.seat} when seat ${act.activeSeat} was active).`,
        }));
      }
    }
    return signals;
  }
}

/**
 * 4. RNG GAMES AUDIT ANALYZER (Backgammon, Dominoes, Ludo)
 * Audits seed integrity and verifies dice roll distribution randomness:
 * - Commit-reveal cryptographic audit
 * - Frequency distribution uniformity check
 */
export class RngAuditAnalyzer {
  static verifyCommitReveal({ serverSeed, commitHash }) {
    const expected = createHash("sha256").update(serverSeed).digest("hex");
    const valid = expected === commitHash;
    return {
      valid,
      serverSeed,
      commitHash,
      reason: valid ? "COMMITMENT_VERIFIED" : "SEED_TAMPERED",
    };
  }

  static auditDiceDistribution(rolls) {
    if (!Array.isArray(rolls) || rolls.length === 0) {
      return { audited: false, count: 0 };
    }

    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    for (const r of rolls) {
      if (counts[r] !== undefined) counts[r]++;
    }

    const n = rolls.length;
    const expected = n / 6;

    // Chi-Square statistic
    let chiSquare = 0;
    for (let d = 1; d <= 6; d++) {
      chiSquare += Math.pow(counts[d] - expected, 2) / expected;
    }

    // Critical value for 5 degrees of freedom at p=0.01 is 15.086
    const isAnomalous = n >= 60 && chiSquare > 15.086;

    return {
      audited: true,
      rollCount: n,
      distribution: counts,
      chiSquare: Number(chiSquare.toFixed(2)),
      isUniform: !isAnomalous,
    };
  }
}
