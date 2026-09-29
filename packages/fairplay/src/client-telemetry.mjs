/**
 * Nizalo Fair Play Infrastructure - LAYER 3: CLIENT TELEMETRY.
 *
 * Collects only necessary, defensible, and privacy-respecting telemetry:
 * 1. Action Timing: Think times, response delays, timing distributions.
 * 2. Input Patterns: Cadence variance, robotic quantization.
 * 3. Connection Behavior: Ping/latency, jitter, transport stability.
 * 4. Reconnect Behavior: Reconnection patterns, rage-quit stalls vs transient drops.
 * 5. Impossible Action Timing: Physiological minimum reaction limits (<100ms - 150ms).
 * 6. Client Integrity: Nonce ordering, handshake build hashes, timestamp skew.
 *
 * PRINCIPLE:
 * Never automatically accuse or sanction a player on one weak signal alone.
 * Telemetry produces raw, explainable evidence signals with measured confidence.
 */

// Physiological minimum reaction limits
export const HUMAN_LIMITS = {
  COMPLEX_BOARD_MIN_MS: 150, // Minimum plausible time to evaluate and execute a chess/board move
  REFLEX_MIN_MS: 100,        // Absolute minimum reflex reaction time
  CADENCE_VARIANCE_MIN_MS: 15, // Standard deviation below 15ms indicates scripted automation
};

export class TelemetrySignal {
  constructor({
    kind,
    strength = 0.5,
    confidence = 0.5,
    observed = {},
    baseline = {},
    explanation,
  }) {
    this.kind = kind;
    this.strength = Math.min(1, Math.max(0, strength));
    this.confidence = Math.min(1, Math.max(0, confidence));
    this.observed = Object.freeze({ ...observed });
    this.baseline = Object.freeze({ ...baseline });
    this.explanation = explanation;
    this.timestamp = Date.now();
    Object.freeze(this);
  }
}

export class ClientTelemetryCollector {
  constructor({ matchId, playerId, seat, gameId = "chess" }) {
    this.matchId = matchId;
    this.playerId = playerId;
    this.seat = seat;
    this.gameId = gameId;

    this.moveTimingsMs = [];
    this.pingSamplesMs = [];
    this.disconnects = [];
    this.reconnects = [];
    this.clientHandshake = null;
    this.clockSkewsMs = [];
    this.impossibleTimingCount = 0;
  }

  recordHandshake({ clientVersion, clientBuildHash, clientTime }) {
    const serverTime = Date.now();
    const skew = Math.abs(serverTime - clientTime);
    this.clientHandshake = {
      clientVersion,
      clientBuildHash,
      clientTime,
      serverTime,
      skewMs: skew,
    };
    this.clockSkewsMs.push(skew);
  }

  recordMoveTiming(moveTimeMs) {
    const t = Math.max(0, Math.round(Number(moveTimeMs)));
    this.moveTimingsMs.push(t);

    const minAllowed = this.gameId === "speed-math"
      ? HUMAN_LIMITS.REFLEX_MIN_MS
      : HUMAN_LIMITS.COMPLEX_BOARD_MIN_MS;

    if (t < minAllowed) {
      this.impossibleTimingCount++;
    }
  }

  recordPing(rttMs) {
    this.pingSamplesMs.push(Math.max(0, Number(rttMs)));
  }

  recordDisconnect() {
    this.disconnects.push({ at: Date.now() });
  }

  recordReconnect() {
    const now = Date.now();
    const lastDis = this.disconnects[this.disconnects.length - 1];
    const durationMs = lastDis ? now - lastDis.at : 0;
    this.reconnects.push({ at: now, durationMs });
  }

  getSummaryMetrics() {
    const timings = this.moveTimingsMs;
    const n = timings.length;

    let mean = 0;
    let variance = 0;
    let min = n > 0 ? timings[0] : 0;
    let max = n > 0 ? timings[0] : 0;

    if (n > 0) {
      const sum = timings.reduce((a, b) => a + b, 0);
      mean = sum / n;
      min = Math.min(...timings);
      max = Math.max(...timings);

      if (n > 1) {
        variance = timings.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (n - 1);
      }
    }

    const stdDev = Math.sqrt(variance);

    // Ping metrics
    let meanPing = 0;
    let pingJitter = 0;
    if (this.pingSamplesMs.length > 0) {
      meanPing = this.pingSamplesMs.reduce((a, b) => a + b, 0) / this.pingSamplesMs.length;
      if (this.pingSamplesMs.length > 1) {
        let diffSum = 0;
        for (let i = 1; i < this.pingSamplesMs.length; i++) {
          diffSum += Math.abs(this.pingSamplesMs[i] - this.pingSamplesMs[i - 1]);
        }
        pingJitter = diffSum / (this.pingSamplesMs.length - 1);
      }
    }

    return {
      moveCount: n,
      meanMoveTimeMs: Math.round(mean),
      stdDevMoveTimeMs: Math.round(stdDev),
      minMoveTimeMs: min,
      maxMoveTimeMs: max,
      impossibleTimingCount: this.impossibleTimingCount,
      meanPingMs: Math.round(meanPing),
      pingJitterMs: Math.round(pingJitter),
      disconnectCount: this.disconnects.length,
      reconnectCount: this.reconnects.length,
    };
  }

  /**
   * Generates analytical signals.
   * Multi-factored, strictly evidentiary.
   */
  generateSignals() {
    const metrics = this.getSummaryMetrics();
    const signals = [];

    // 1. Physically Impossible Timing Signal
    if (metrics.impossibleTimingCount > 0) {
      const ratio = metrics.impossibleTimingCount / Math.max(1, metrics.moveCount);
      signals.push(new TelemetrySignal({
        kind: "IMPOSSIBLE_INPUT",
        strength: Math.min(1, 0.5 + ratio * 0.5),
        confidence: Math.min(1, 0.4 + metrics.impossibleTimingCount * 0.2),
        observed: {
          impossibleCount: metrics.impossibleTimingCount,
          totalMoves: metrics.moveCount,
          minObservedMs: metrics.minMoveTimeMs,
        },
        baseline: {
          physiologicalMinMs: this.gameId === "speed-math"
            ? HUMAN_LIMITS.REFLEX_MIN_MS
            : HUMAN_LIMITS.COMPLEX_BOARD_MIN_MS,
        },
        explanation: `Player executed ${metrics.impossibleTimingCount} moves faster than human physiological limits (${metrics.minMoveTimeMs}ms observed).`,
      }));
    }

    // 2. Robotic Cadence (Abnormally low variance across many moves)
    if (metrics.moveCount >= 8 && metrics.stdDevMoveTimeMs < HUMAN_LIMITS.CADENCE_VARIANCE_MIN_MS) {
      signals.push(new TelemetrySignal({
        kind: "AUTOMATION",
        strength: 0.8,
        confidence: Math.min(0.9, 0.5 + (metrics.moveCount / 20) * 0.4),
        observed: {
          stdDevMs: metrics.stdDevMoveTimeMs,
          meanMs: metrics.meanMoveTimeMs,
          moveCount: metrics.moveCount,
        },
        baseline: {
          minExpectedStdDevMs: HUMAN_LIMITS.CADENCE_VARIANCE_MIN_MS,
        },
        explanation: `Move timing variance is abnormally low (${metrics.stdDevMoveTimeMs}ms std dev across ${metrics.moveCount} moves), characteristic of scripted automation.`,
      }));
    }

    // 3. Stalling Disconnect Pattern
    if (metrics.disconnectCount >= 3 && metrics.reconnectCount >= 3) {
      signals.push(new TelemetrySignal({
        kind: "CONNECTION_INSTABILITY",
        strength: 0.4,
        confidence: 0.5,
        observed: {
          disconnects: metrics.disconnectCount,
          reconnects: metrics.reconnectCount,
        },
        baseline: {
          normalDisconnects: 0,
        },
        explanation: `Player cycled ${metrics.disconnectCount} disconnects and reconnects during match.`,
      }));
    }

    return signals;
  }
}
