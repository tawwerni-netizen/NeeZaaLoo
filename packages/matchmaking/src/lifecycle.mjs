/**
 * Nizalo Authoritative 12-State Match Lifecycle Machine
 *
 * States:
 *   QUEUED -> MATCHING -> MATCH_FOUND -> CONFIRMING -> READY -> STARTING -> LIVE ->
 *   FINISHING -> FINALIZING -> SETTLING -> COMPLETED (and ABORTED)
 *
 * Strictly enforces idempotent transitions, concurrency guards,
 * confirmation countdowns, timeout handling, and settlement safety.
 */

export const MatchState = Object.freeze({
  QUEUED: "QUEUED",
  MATCHING: "MATCHING",
  MATCH_FOUND: "MATCH_FOUND",
  CONFIRMING: "CONFIRMING",
  READY: "READY",
  STARTING: "STARTING",
  LIVE: "LIVE",
  FINISHING: "FINISHING",
  FINALIZING: "FINALIZING",
  SETTLING: "SETTLING",
  COMPLETED: "COMPLETED",
  ABORTED: "ABORTED",
});

export const AbortReason = Object.freeze({
  CANCELLED_BY_PLAYER: "CANCELLED_BY_PLAYER",
  QUEUE_TIMEOUT: "QUEUE_TIMEOUT",
  CONFIRMATION_TIMEOUT: "CONFIRMATION_TIMEOUT",
  CONFIRMATION_DECLINED: "CONFIRMATION_DECLINED",
  INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
  CONNECTION_TIMEOUT: "CONNECTION_TIMEOUT",
  FIRST_MOVE_AFK: "FIRST_MOVE_AFK",
  MUTUAL_ABORT: "MUTUAL_ABORT",
  ADMIN_FORCE_ABORT: "ADMIN_FORCE_ABORT",
});

const VALID_TRANSITIONS = {
  [MatchState.QUEUED]: [MatchState.MATCHING, MatchState.ABORTED],
  [MatchState.MATCHING]: [MatchState.MATCH_FOUND, MatchState.QUEUED, MatchState.ABORTED],
  [MatchState.MATCH_FOUND]: [MatchState.CONFIRMING, MatchState.ABORTED],
  [MatchState.CONFIRMING]: [MatchState.READY, MatchState.ABORTED],
  [MatchState.READY]: [MatchState.STARTING, MatchState.ABORTED],
  [MatchState.STARTING]: [MatchState.LIVE, MatchState.ABORTED],
  [MatchState.LIVE]: [MatchState.FINISHING, MatchState.ABORTED],
  [MatchState.FINISHING]: [MatchState.FINALIZING],
  [MatchState.FINALIZING]: [MatchState.SETTLING],
  [MatchState.SETTLING]: [MatchState.COMPLETED],
  [MatchState.COMPLETED]: [],
  [MatchState.ABORTED]: [],
};

export class MatchLifecycleInstance {
  constructor({
    matchId,
    gameId,
    variantId,
    players, // ["player1", "player2"]
    tier = "FREE",
    stakeMinor = 0n,
    asset = null,
    timeControl = {},
    confirmationWindowMs = 10_000,
    now = () => Date.now(),
  }) {
    this.matchId = matchId;
    this.gameId = gameId;
    this.variantId = variantId;
    this.players = [...players];
    this.tier = tier;
    this.stakeMinor = BigInt(stakeMinor ?? 0);
    this.asset = asset;
    this.timeControl = { ...timeControl };
    this.confirmationWindowMs = confirmationWindowMs;
    this.now = now;

    this.state = MatchState.MATCH_FOUND;
    this.stateHistory = [{ state: MatchState.MATCH_FOUND, timestamp: this.now() }];

    this.confirmations = new Map(players.map((p) => [p, false]));
    this.confirmationDeadline = null;

    this.connectionStatus = new Map(players.map((p) => [p, "DISCONNECTED"]));
    this.activeSockets = new Map(); // playerId -> socketId

    this.settlementData = null;
    this.abortReason = null;
    this.outcome = null;
    this.replayMetadata = null;
  }

  /**
   * Safe, idempotent state transition.
   */
  transition(toState, payload = {}) {
    const t = this.now();

    // Idempotent: already in this state
    if (this.state === toState) {
      return { ok: true, state: this.state, idempotent: true };
    }

    // Check valid graph transition
    const allowed = VALID_TRANSITIONS[this.state] || [];
    if (!allowed.includes(toState)) {
      return {
        ok: false,
        reason: "INVALID_TRANSITION",
        current: this.state,
        target: toState,
      };
    }

    this.state = toState;
    this.stateHistory.push({ state: toState, timestamp: t, ...payload });

    if (toState === MatchState.ABORTED && payload.reason) {
      this.abortReason = payload.reason;
    }

    return { ok: true, state: toState, timestamp: t };
  }

  /**
   * Start confirmation phase with countdown.
   */
  startConfirmation() {
    const res = this.transition(MatchState.CONFIRMING);
    if (!res.ok) return res;

    this.confirmationDeadline = this.now() + this.confirmationWindowMs;
    return {
      ok: true,
      state: MatchState.CONFIRMING,
      deadlineMs: this.confirmationDeadline,
      remainingMs: this.confirmationWindowMs,
    };
  }

  /**
   * Record player's confirmation or decline.
   */
  confirmPlayer(playerId, accepted = true) {
    if (this.state !== MatchState.CONFIRMING) {
      if (this.state === MatchState.READY || this.state === MatchState.LIVE) {
        return { ok: true, state: this.state, idempotent: true };
      }
      return { ok: false, reason: "NOT_IN_CONFIRMING_STATE", current: this.state };
    }

    if (this.now() > this.confirmationDeadline) {
      this.transition(MatchState.ABORTED, { reason: AbortReason.CONFIRMATION_TIMEOUT });
      return { ok: false, reason: AbortReason.CONFIRMATION_TIMEOUT };
    }

    if (!accepted) {
      this.transition(MatchState.ABORTED, { reason: AbortReason.CONFIRMATION_DECLINED, declinedBy: playerId });
      return { ok: true, state: MatchState.ABORTED, reason: AbortReason.CONFIRMATION_DECLINED };
    }

    this.confirmations.set(playerId, true);

    // If all confirmed, advance to READY!
    const allConfirmed = this.players.every((p) => this.confirmations.get(p) === true);
    if (allConfirmed) {
      this.transition(MatchState.READY);
      return { ok: true, state: MatchState.READY, allConfirmed: true };
    }

    return { ok: true, state: MatchState.CONFIRMING, allConfirmed: false };
  }

  /**
   * Check confirmation timeout sweep.
   */
  sweepConfirmation() {
    if (this.state === MatchState.CONFIRMING && this.now() > this.confirmationDeadline) {
      this.transition(MatchState.ABORTED, { reason: AbortReason.CONFIRMATION_TIMEOUT });
      return { timedOut: true, state: MatchState.ABORTED };
    }
    return { timedOut: false, state: this.state };
  }

  /**
   * Handle socket connection/device switching.
   * Evicts previous socket cleanly if device switched or new tab opened.
   */
  bindSession(playerId, socketId) {
    if (!this.players.includes(playerId)) {
      return { ok: false, reason: "NOT_A_PARTICIPANT" };
    }

    const previousSocket = this.activeSockets.get(playerId);
    const wasDeviceSwitch = Boolean(previousSocket && previousSocket !== socketId);

    this.activeSockets.set(playerId, socketId);
    this.connectionStatus.set(playerId, "CONNECTED");

    return {
      ok: true,
      playerId,
      socketId,
      wasDeviceSwitch,
      evictedSocket: wasDeviceSwitch ? previousSocket : null,
      currentState: this.state,
    };
  }

  unbindSession(playerId, socketId) {
    if (this.activeSockets.get(playerId) === socketId) {
      this.activeSockets.delete(playerId);
      this.connectionStatus.set(playerId, "DISCONNECTED");
      return { ok: true, disconnected: true };
    }
    return { ok: true, disconnected: false, note: "socket already superseded" };
  }

  /**
   * Finalize outcome and replay hash.
   */
  finalizeMatch({ result, reason, replayHash }) {
    if (this.state === MatchState.LIVE) {
      this.transition(MatchState.FINISHING);
    }
    if (this.state === MatchState.FINISHING) {
      this.outcome = { result, reason };
      this.replayMetadata = { replayHash, finalizedAt: this.now() };
      return this.transition(MatchState.FINALIZING);
    }
    if (this.state === MatchState.FINALIZING || this.state === MatchState.SETTLING || this.state === MatchState.COMPLETED) {
      return { ok: true, state: this.state, idempotent: true };
    }
    return { ok: false, reason: "INVALID_STATE_FOR_FINALIZATION", current: this.state };
  }

  /**
   * Execute settlement with idempotent deduplication.
   */
  startSettling() {
    return this.transition(MatchState.SETTLING);
  }

  completeSettlement({ transactionId, ratings, rakeMinor }) {
    if (this.state === MatchState.COMPLETED) {
      return { ok: true, state: MatchState.COMPLETED, idempotent: true, settlementData: this.settlementData };
    }
    if (this.state !== MatchState.SETTLING) {
      return { ok: false, reason: "NOT_SETTLING", current: this.state };
    }

    this.settlementData = {
      transactionId,
      ratings,
      rakeMinor: rakeMinor?.toString() ?? "0",
      settledAt: this.now(),
    };

    return this.transition(MatchState.COMPLETED, { transactionId });
  }

  getSnapshot() {
    return {
      matchId: this.matchId,
      gameId: this.gameId,
      variantId: this.variantId,
      players: this.players,
      state: this.state,
      tier: this.tier,
      stakeMinor: this.stakeMinor.toString(),
      asset: this.asset,
      outcome: this.outcome,
      abortReason: this.abortReason,
      settlementData: this.settlementData,
      connectionStatus: Object.fromEntries(this.connectionStatus),
      stateHistory: this.stateHistory,
    };
  }
}
