/**
 * Nizalo Complete Match Orchestrator
 *
 * Coordinates the full end-to-end player lifecycle:
 * Enqueue -> Matchmaking Pool -> Confirmation -> Stake Reservation ->
 * Realtime Synchronization -> Authoritative Play -> Finalization ->
 * Per-Game Rating Update -> Settlement -> Replay Commit.
 */

import { randomUUID } from "node:crypto";
import { GameAwareMatchmakingPool } from "./game-aware-pool.mjs";
import { MatchLifecycleInstance, MatchState, AbortReason } from "./lifecycle.mjs";
import { MatchRealtimeSync } from "../../realtime/src/resync-protocol.mjs";
import { projectClock, runIntent, resign, offerDraw, acceptDraw, declineDraw, claimTimeout, replayHash } from "../../duel-engine/src/duel.mjs";
import { createClock, readClock } from "../../duel-engine/src/clock.mjs";
import { resolveTimeControl } from "../../duel-engine/src/time-profiles.mjs";
import { getRuleset } from "../../duel-engine/src/ruleset-registry.mjs";
import { DEFAULT_SPAWNERS } from "./spawn.mjs";

export class MatchOrchestrator {
  constructor({
    settlement = null,
    now = () => Date.now(),
    spawners = DEFAULT_SPAWNERS,
  } = {}) {
    this.settlement = settlement;
    this.now = now;
    this.spawners = spawners;

    // Game-Aware Matchmaking Pool
    this.pool = new GameAwareMatchmakingPool({ now });

    // Active lifecycle instances: matchId -> MatchLifecycleInstance
    this.matches = new Map();

    // Active realtime sync managers: matchId -> MatchRealtimeSync
    this.syncManagers = new Map();

    // Active game engine states: matchId -> DuelState
    this.gameStates = new Map();

    // Priority re-queue set for players dropped by declining opponents
    this.priorityQueue = new Set();
  }

  // --- 1. Enqueue ---

  enqueuePlayer(params) {
    return this.pool.enqueue({ ...params, now: this.now() });
  }

  cancelQueue(playerId) {
    return this.pool.cancel(playerId);
  }

  heartbeatQueue(playerId) {
    return this.pool.heartbeat(playerId, this.now());
  }

  // --- 2. Matchmaking Run ---

  runMatchmaking() {
    const pairings = this.pool.pairAllActivePools(this.now());
    const initiatedMatches = [];

    for (const pair of pairings) {
      const match = this.createMatchInstance(pair);
      initiatedMatches.push(match);
    }

    return initiatedMatches;
  }

  createMatchInstance(pair) {
    const matchId = pair.matchId ?? `match_${randomUUID()}`;
    const players = [pair.seat0, pair.seat1];

    const ruleset = getRuleset(pair.gameId, pair.variantId);
    let timeControl;
    try {
      timeControl = resolveTimeControl(pair.gameId, pair.timeProfile || "STANDARD");
    } catch {
      timeControl = resolveTimeControl(pair.gameId, "STANDARD");
    }

    // 1. Create Lifecycle Instance
    const lifecycle = new MatchLifecycleInstance({
      matchId,
      gameId: pair.gameId,
      variantId: pair.variantId,
      players,
      tier: pair.tier,
      stakeMinor: pair.stakeMinor,
      asset: pair.asset,
      timeControl,
      confirmationWindowMs: 10_000,
      now: this.now,
    });
    this.matches.set(matchId, lifecycle);

    // 2. Initiate Spawner for Game Plugin
    const spawnFn = this.spawners[pair.gameId] ?? (() => ({ initialState: {}, seed: null }));
    const { initialState, seed } = spawnFn(pair);

    // 3. Create Realtime Sync Manager
    const syncManager = new MatchRealtimeSync({
      matchId,
      players,
      plugin: null,
      initialState,
      now: this.now,
    });
    this.syncManagers.set(matchId, syncManager);

    // Start Confirmation Phase!
    lifecycle.startConfirmation();

    return {
      matchId,
      gameId: pair.gameId,
      variantId: pair.variantId,
      players,
      tier: pair.tier,
      stakeMinor: pair.stakeMinor,
      state: lifecycle.state,
      confirmationDeadlineMs: lifecycle.confirmationDeadline,
    };
  }

  // --- 3. Confirmation Flow ---

  async handleConfirmation(matchId, playerId, accept = true, plugin = null) {
    const lifecycle = this.matches.get(matchId);
    if (!lifecycle) return { ok: false, reason: "MATCH_NOT_FOUND" };

    const confRes = lifecycle.confirmPlayer(playerId, accept);
    if (!confRes.ok) return confRes;

    // If a player declined or timed out, handle priority re-queue for the innocent player!
    if (lifecycle.state === MatchState.ABORTED) {
      const innocentPlayer = lifecycle.players.find((p) => p !== playerId);
      if (innocentPlayer) {
        this.priorityQueue.add(innocentPlayer);
        // Automatically re-queue the innocent player
        this.pool.enqueue({
          playerId: innocentPlayer,
          gameId: lifecycle.gameId,
          variantId: lifecycle.variantId,
          tier: lifecycle.tier,
          stakeMinor: lifecycle.stakeMinor,
          asset: lifecycle.asset,
        });
      }
      return { ok: true, state: MatchState.ABORTED, reason: confRes.reason };
    }

    // Both players confirmed -> advance to READY and reserve stakes!
    if (confRes.allConfirmed && lifecycle.state === MatchState.READY) {
      return this.prepareMatchStart(matchId, plugin);
    }

    return confRes;
  }

  // --- 4. Readiness & Stake Reservation ---

  async prepareMatchStart(matchId, plugin) {
    const lifecycle = this.matches.get(matchId);
    if (!lifecycle) return { ok: false, reason: "MATCH_NOT_FOUND" };

    // If Cash tier, reserve stakes via ledger
    if (lifecycle.tier === "CASH" && this.settlement) {
      const reserveRes = await this.settlement.reserve(matchId);
      if (!reserveRes.ok) {
        lifecycle.transition(MatchState.ABORTED, { reason: AbortReason.INSUFFICIENT_FUNDS });
        return { ok: false, reason: AbortReason.INSUFFICIENT_FUNDS };
      }
    }

    // Advance to STARTING
    lifecycle.transition(MatchState.STARTING);

    // Initialize Game Engine State
    if (plugin) {
      this.initializeGameState(matchId, plugin);
    }

    return { ok: true, state: MatchState.STARTING };
  }

  initializeGameState(matchId, plugin) {
    const lifecycle = this.matches.get(matchId);
    const challenge = plugin.createChallenge("seed-match", {});

    const clock = lifecycle.timeControl?.durationMs
      ? { model: "SHARED", remaining: lifecycle.timeControl.durationMs, startedAt: null }
      : createClock(lifecycle.timeControl);

    const duel = {
      duelId: matchId,
      gameId: lifecycle.gameId,
      variantId: lifecycle.variantId,
      players: lifecycle.players,
      status: "LIVE",
      state: challenge.state,
      clock,
      events: [],
      seq: { lastNonce: [null, null], lastIntent: [null, null] },
      drawOfferBy: null,
      startedAt: this.now(),
      completedAt: null,
      outcome: null,
    };

    this.gameStates.set(matchId, duel);
    lifecycle.transition(MatchState.LIVE);
    return duel;
  }

  // --- 5. Realtime Synchronization & Resilience ---

  connectPlayer(matchId, playerId, socketId) {
    const sync = this.syncManagers.get(matchId);
    const lifecycle = this.matches.get(matchId);
    if (!sync || !lifecycle) return { ok: false, reason: "MATCH_NOT_FOUND" };

    lifecycle.bindSession(playerId, socketId);
    return sync.bindClient(playerId, socketId, this.now());
  }

  disconnectPlayer(matchId, playerId, socketId) {
    const sync = this.syncManagers.get(matchId);
    const lifecycle = this.matches.get(matchId);
    if (!sync || !lifecycle) return { ok: false, reason: "MATCH_NOT_FOUND" };

    lifecycle.unbindSession(playerId, socketId);
    return sync.disconnectClient(playerId, socketId, this.now());
  }

  getAuthoritativeSnapshot(matchId, sinceSeq = null) {
    const sync = this.syncManagers.get(matchId);
    const lifecycle = this.matches.get(matchId);
    const duel = this.gameStates.get(matchId);
    if (!sync || !lifecycle) return { ok: false, reason: "MATCH_NOT_FOUND" };

    const gameState = duel?.state ?? null;
    const clockData = duel ? projectClock(duel, this.now()) : null;

    return sync.generateSnapshot(gameState, clockData, lifecycle.state, sinceSeq);
  }

  // --- 6. Live Moves & Authoritative Adjudication ---

  submitMove(matchId, plugin, { playerId, intent, nonce, baseVersion }) {
    const lifecycle = this.matches.get(matchId);
    const duel = this.gameStates.get(matchId);
    const sync = this.syncManagers.get(matchId);

    if (!lifecycle || !duel || !sync) return { ok: false, reason: "MATCH_NOT_FOUND" };
    if (lifecycle.state !== MatchState.LIVE) {
      return { ok: false, reason: "NOT_LIVE", state: lifecycle.state };
    }

    const t = this.now();
    const res = runIntent(duel, plugin, { playerId, intent, nonce, baseVersion }, t);
    if (!res.ok) return res;

    // Emit authoritative sequence event
    const event = sync.nextEvent("MOVE_ACCEPTED", { playerId, intent, ...res }, t);

    // If game terminated, trigger finalization pipeline
    if (duel.status === "COMPLETED" || duel.outcome) {
      this.handleMatchFinished(matchId, plugin, duel.outcome);
    }

    return {
      ok: true,
      seq: event.seq,
      eventId: event.eventId,
      state: duel.state,
      clock: projectClock(duel, t),
    };
  }

  // --- 7. Finalization & Settlement ---

  async handleMatchFinished(matchId, plugin, outcome) {
    const lifecycle = this.matches.get(matchId);
    const duel = this.gameStates.get(matchId);
    if (!lifecycle) return;

    // Idempotent short-circuit if match has already been finalized and settled
    if (lifecycle.state === MatchState.COMPLETED) {
      return {
        matchId,
        state: lifecycle.state,
        outcome: lifecycle.outcome,
        ratingUpdates: lifecycle.settlementData?.ratings,
        settlementTxId: lifecycle.settlementData?.transactionId,
        idempotent: true,
      };
    }

    // 1. Finalizing
    const replay = plugin?.serializeReplay ? plugin.serializeReplay(duel.state) : {};
    const hash = replayHash(replay);
    lifecycle.finalizeMatch({ result: outcome.result, reason: outcome.reason, replayHash: hash });

    // 2. Settling
    lifecycle.startSettling();

    // 3. Per-Game Rating Update
    const scoreA = outcome.result === "1-0" ? 1 : outcome.result === "0-1" ? 0 : 0.5;
    const ratingUpdates = this.pool.recordMatchOutcome(
      lifecycle.gameId,
      lifecycle.players[0],
      lifecycle.players[1],
      scoreA
    );

    // 4. Ledger Settlement (if Cash)
    let transactionId = null;
    let rakeMinor = 0n;
    if (lifecycle.tier === "CASH" && this.settlement) {
      const setRes = await this.settlement.settle(matchId);
      transactionId = setRes.transactionId;
      rakeMinor = setRes.rakeMinor ? BigInt(setRes.rakeMinor) : 0n;
    }

    // 5. Completed
    lifecycle.completeSettlement({
      transactionId,
      ratings: ratingUpdates,
      rakeMinor,
    });

    return {
      matchId,
      state: lifecycle.state,
      outcome,
      ratingUpdates,
      settlementTxId: transactionId,
    };
  }
}
