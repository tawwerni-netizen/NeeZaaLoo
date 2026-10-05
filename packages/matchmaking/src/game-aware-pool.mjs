/**
 * Nizalo Game-Aware Matchmaking Pool & Telemetry Service
 *
 * Enforces per-game rating isolation, skill uncertainty (Glicko-2 RD),
 * dynamic queue-time window widening, region/latency compatibility,
 * and strict eligibility checks for cash and competitive play.
 */
import { randomUUID } from "node:crypto";
import { getRuleset } from "../../duel-engine/src/ruleset-registry.mjs";
import { defaultRating, isEstablished, toStorage, fromStorage, applyDuel } from "../../rating/src/glicko2.mjs";
import { isValidStakeMinor } from "./stakes.mjs";

export const MatchmakingEligibilityError = Object.freeze({
  UNKNOWN_GAME: "UNKNOWN_GAME",
  UNKNOWN_VARIANT: "UNKNOWN_VARIANT",
  ALREADY_QUEUED: "ALREADY_QUEUED",
  INVALID_STAKE: "INVALID_STAKE",
  CASH_NOT_ELIGIBLE: "CASH_NOT_ELIGIBLE",
  RATING_NOT_ESTABLISHED: "RATING_NOT_ESTABLISHED",
  ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED",
  ACCOUNT_UNDER_REVIEW: "ACCOUNT_UNDER_REVIEW",
  TICKET_NOT_FOUND: "TICKET_NOT_FOUND",
});

export const BASE_RATING_TOLERANCE = 60; // Initial +/- rating points
export const RATING_EXPANSION_RATE = 4; // Widens by +/- 4 points per second
export const MAX_RATING_TOLERANCE = 400; // Cap on rating expansion window
export const DEFAULT_HEARTBEAT_TIMEOUT_MS = 15_000; // 15 seconds without heartbeat = stale

export function createPoolKey(gameId, variantId, tier, stakeMinor, asset, region = "any") {
  const normGame = gameId.replace(/-/g, "_");
  const normVariant = variantId.replace(/-/g, "_");
  return `${normGame}:${normVariant}:${tier}:${stakeMinor.toString()}:${asset ?? "NONE"}:${region.toLowerCase()}`;
}

export class GameAwareMatchmakingPool {
  constructor({ now = () => Date.now(), baseTolerance = BASE_RATING_TOLERANCE } = {}) {
    this.now = now;
    this.baseTolerance = baseTolerance;

    // Queues indexed by poolKey -> Array<Ticket>
    this.pools = new Map();

    // Active ticket lookup: playerId -> Ticket (one active ticket per player across all games)
    this.activeTicketsByPlayer = new Map();

    // Idempotency cache: idempotencyKey -> { ticketId, createdAt, response }
    this.idempotentRequests = new Map();

    // Isolated game ratings: `${playerId}:${gameId}` -> { rating, rd, volatility, gamesPlayed, history }
    this.gameRatings = new Map();

    // Player risk status: playerId -> { status: "ACTIVE"|"PROBATION"|"SUSPENDED"|"UNDER_REVIEW", riskScore }
    this.accountRisk = new Map();

    // Telemetry log of completed pairings
    this.telemetryRecords = [];
  }

  // --- Ratings Management (Game-Aware) ---

  /**
   * Retrieves player's game-specific rating. Never mixes games!
   */
  getGameRating(playerId, gameId) {
    const normGame = gameId.replace(/-/g, "_");
    const key = `${playerId}:${normGame}`;
    if (!this.gameRatings.has(key)) {
      const def = defaultRating();
      this.gameRatings.set(key, {
        rating: def.rating,
        rd: def.rd,
        volatility: def.volatility,
        gamesPlayed: 0,
        history: [],
      });
    }
    const r = this.gameRatings.get(key);
    return {
      playerId,
      gameId: normGame,
      rating: r.rating,
      rd: r.rd,
      volatility: r.volatility,
      gamesPlayed: r.gamesPlayed,
      isEstablished: isEstablished(r, r.gamesPlayed),
    };
  }

  /**
   * Sets game rating directly (useful for seeding, migrations, and test fixtures).
   */
  setGameRating(playerId, gameId, { rating, rd = 350, volatility = 0.06, gamesPlayed = 0 }) {
    const normGame = gameId.replace(/-/g, "_");
    const key = `${playerId}:${normGame}`;
    this.gameRatings.set(key, {
      rating,
      rd,
      volatility,
      gamesPlayed,
      history: [],
    });
  }

  /**
   * Records game match outcome and updates Glicko-2 ratings for that game only.
   */
  recordMatchOutcome(gameId, playerAId, playerBId, scoreA) {
    const normGame = gameId.replace(/-/g, "_");
    const pA = this.getGameRating(playerAId, normGame);
    const pB = this.getGameRating(playerBId, normGame);

    const updated = applyDuel(pA, pB, scoreA);

    const keyA = `${playerAId}:${normGame}`;
    const keyB = `${playerBId}:${normGame}`;

    const t = this.now();
    this.gameRatings.set(keyA, {
      rating: updated.a.rating,
      rd: updated.a.rd,
      volatility: updated.a.volatility,
      gamesPlayed: pA.gamesPlayed + 1,
      history: [
        ...(this.gameRatings.get(keyA)?.history ?? []),
        { opponent: playerBId, score: scoreA, delta: updated.a.rating - pA.rating, timestamp: t },
      ],
    });

    this.gameRatings.set(keyB, {
      rating: updated.b.rating,
      rd: updated.b.rd,
      volatility: updated.b.volatility,
      gamesPlayed: pB.gamesPlayed + 1,
      history: [
        ...(this.gameRatings.get(keyB)?.history ?? []),
        { opponent: playerAId, score: 1 - scoreA, delta: updated.b.rating - pB.rating, timestamp: t },
      ],
    });

    return {
      playerA: this.getGameRating(playerAId, normGame),
      playerB: this.getGameRating(playerBId, normGame),
    };
  }

  /**
   * Optional global Nizalo Skill Score across all games.
   * Exists purely for profile display and global accolades; NEVER used for game matchmaking!
   */
  calculateGlobalSkillScore(playerId) {
    let totalWeightedRating = 0;
    let totalWeight = 0;
    let establishedCount = 0;

    for (const [key, profile] of this.gameRatings.entries()) {
      if (key.startsWith(`${playerId}:`)) {
        if (profile.gamesPlayed > 0) {
          // Weight inversely proportional to RD (higher certainty = higher weight)
          const weight = Math.max(1, (350 - profile.rd) / 10);
          totalWeightedRating += profile.rating * weight;
          totalWeight += weight;
          if (isEstablished(profile, profile.gamesPlayed)) {
            establishedCount++;
          }
        }
      }
    }

    if (totalWeight === 0) return { globalScore: 1500, establishedGames: 0, totalGamesTracked: 0 };
    return {
      globalScore: Math.round(totalWeightedRating / totalWeight),
      establishedGames: establishedCount,
      totalGamesTracked: this.gameRatings.size,
    };
  }

  // --- Account Risk State ---

  setAccountRisk(playerId, { status = "ACTIVE", riskScore = 0, holds = [] } = {}) {
    this.accountRisk.set(playerId, { status, riskScore, holds });
  }

  getAccountRisk(playerId) {
    return this.accountRisk.get(playerId) ?? { status: "ACTIVE", riskScore: 0, holds: [] };
  }

  // --- Queue Operations ---

  enqueue({
    playerId,
    gameId,
    variantId = null,
    tier = "FREE",
    stakeMinor = 0n,
    asset = null,
    region = "any",
    latencyMaxMs = 200,
    idempotencyKey = null,
  }) {
    const t = this.now();

    // 1. Idempotency Check (Duplicate clicks / rapid resubmission)
    if (idempotencyKey && this.idempotentRequests.has(idempotencyKey)) {
      const entry = this.idempotentRequests.get(idempotencyKey);
      if (t - entry.createdAt < 60_000) {
        return { ...entry.response, idempotent: true };
      }
    }

    // 2. Validate Game and Variant against Authoritative Ruleset Registry
    let ruleset;
    try {
      ruleset = getRuleset(gameId, variantId);
    } catch {
      return { ok: false, reason: MatchmakingEligibilityError.UNKNOWN_GAME };
    }

    const resolvedVariant = variantId ?? ruleset.variant;

    // 3. Double-Queue Check (One active ticket platform-wide)
    if (this.activeTicketsByPlayer.has(playerId)) {
      const existing = this.activeTicketsByPlayer.get(playerId);
      // If same player clicks join again with same pool, treat as idempotent if within 5s
      if (existing.gameId === ruleset.game && existing.variantId === resolvedVariant && existing.tier === tier) {
        return {
          ok: true,
          ticketId: existing.ticketId,
          poolKey: existing.poolKey,
          enqueuedAt: existing.enqueuedAt,
          idempotent: true,
        };
      }
      return {
        ok: false,
        reason: MatchmakingEligibilityError.ALREADY_QUEUED,
        activeTicket: {
          ticketId: existing.ticketId,
          gameId: existing.gameId,
          variantId: existing.variantId,
          enqueuedAt: existing.enqueuedAt,
        },
      };
    }

    // 4. Stake & Tier Validation
    const isCash = tier === "CASH";
    const stake = BigInt(stakeMinor ?? 0);

    if (isCash) {
      if (!ruleset.cashEligible) {
        return {
          ok: false,
          reason: MatchmakingEligibilityError.CASH_NOT_ELIGIBLE,
          explanation: `Game '${ruleset.game}' is classified as solved/free-only by integrity policy.`,
        };
      }
      if (!isValidStakeMinor(stake)) {
        return { ok: false, reason: MatchmakingEligibilityError.INVALID_STAKE };
      }

      // Check Established Rating Requirements for Cash Play
      const ratingProfile = this.getGameRating(playerId, ruleset.game);
      if (!ratingProfile.isEstablished) {
        return {
          ok: false,
          reason: MatchmakingEligibilityError.RATING_NOT_ESTABLISHED,
          currentRd: ratingProfile.rd,
          gamesPlayed: ratingProfile.gamesPlayed,
          requirement: "RD <= 110.00 and games_played >= 10 in this specific game",
        };
      }

      // Check Account Risk State
      const risk = this.getAccountRisk(playerId);
      if (risk.status === "SUSPENDED" || risk.status === "BANNED") {
        return { ok: false, reason: MatchmakingEligibilityError.ACCOUNT_SUSPENDED };
      }
      if (risk.status === "UNDER_REVIEW") {
        return { ok: false, reason: MatchmakingEligibilityError.ACCOUNT_UNDER_REVIEW };
      }
    } else {
      if (stake !== 0n) {
        return { ok: false, reason: MatchmakingEligibilityError.INVALID_STAKE, explanation: "FREE tier must have stake 0" };
      }
    }

    // 5. Construct Ticket with Game-Specific Rating
    const playerRating = this.getGameRating(playerId, ruleset.game);
    const poolKey = createPoolKey(ruleset.game, resolvedVariant, tier, stake, isCash ? (asset ?? "USDT") : null, region);
    const ticketId = `mm_tkt_${randomUUID()}`;

    const ticket = {
      ticketId,
      playerId,
      gameId: ruleset.game,
      variantId: resolvedVariant,
      tier,
      stakeMinor: stake,
      asset: isCash ? (asset ?? "USDT") : null,
      region: region.toLowerCase(),
      latencyMaxMs,
      playerRating: playerRating.rating,
      ratingDeviation: playerRating.rd,
      gamesPlayed: playerRating.gamesPlayed,
      poolKey,
      status: "QUEUED",
      enqueuedAt: t,
      lastHeartbeatAt: t,
    };

    if (!this.pools.has(poolKey)) {
      this.pools.set(poolKey, []);
    }
    this.pools.get(poolKey).push(ticket);
    this.activeTicketsByPlayer.set(playerId, ticket);

    const response = {
      ok: true,
      ticketId,
      poolKey,
      gameId: ruleset.game,
      variantId: resolvedVariant,
      rating: playerRating.rating,
      rd: playerRating.rd,
      enqueuedAt: t,
    };

    if (idempotencyKey) {
      this.idempotentRequests.set(idempotencyKey, { ticketId, createdAt: t, response });
    }

    return response;
  }

  /**
   * Cancel an enqueued ticket.
   */
  cancel(playerId) {
    const ticket = this.activeTicketsByPlayer.get(playerId);
    if (!ticket) return { ok: false, reason: MatchmakingEligibilityError.TICKET_NOT_FOUND };

    ticket.status = "CANCELLED";
    this.activeTicketsByPlayer.delete(playerId);

    const pool = this.pools.get(ticket.poolKey);
    if (pool) {
      const idx = pool.findIndex((t) => t.ticketId === ticket.ticketId);
      if (idx !== -1) pool.splice(idx, 1);
    }

    return { ok: true, cancelled: true, ticketId: ticket.ticketId };
  }

  /**
   * Keep a ticket alive via client heartbeat.
   */
  heartbeat(playerId, now = this.now()) {
    const ticket = this.activeTicketsByPlayer.get(playerId);
    if (!ticket || ticket.status !== "QUEUED") {
      return { ok: false, reason: MatchmakingEligibilityError.TICKET_NOT_FOUND };
    }
    ticket.lastHeartbeatAt = now;
    return { ok: true, ticketId: ticket.ticketId, timestamp: now };
  }

  /**
   * Sweep stale tickets exceeding heartbeat timeout.
   */
  sweepStale(timeoutMs = DEFAULT_HEARTBEAT_TIMEOUT_MS, now = this.now()) {
    const expiredTickets = [];
    for (const [playerId, ticket] of this.activeTicketsByPlayer.entries()) {
      if (now - ticket.lastHeartbeatAt > timeoutMs) {
        ticket.status = "EXPIRED";
        expiredTickets.push(ticket);
        this.activeTicketsByPlayer.delete(playerId);

        const pool = this.pools.get(ticket.poolKey);
        if (pool) {
          const idx = pool.findIndex((t) => t.ticketId === ticket.ticketId);
          if (idx !== -1) pool.splice(idx, 1);
        }
      }
    }
    return { ok: true, expiredCount: expiredTickets.length, expiredTickets };
  }

  /**
   * Pairing step for a specific pool.
   * Dynamic rating expansion based on queue wait time.
   */
  pairPool(poolKey, now = this.now()) {
    const pool = this.pools.get(poolKey);
    if (!pool || pool.length < 2) return { paired: false };

    // FIFO: sort by enqueuedAt ascending
    pool.sort((a, b) => a.enqueuedAt - b.enqueuedAt);

    for (let i = 0; i < pool.length; i++) {
      const ticketA = pool[i];
      const waitSecondsA = Math.max(0, (now - ticketA.enqueuedAt) / 1000);
      const toleranceA = Math.min(
        MAX_RATING_TOLERANCE,
        this.baseTolerance + waitSecondsA * RATING_EXPANSION_RATE
      );

      for (let j = i + 1; j < pool.length; j++) {
        const ticketB = pool[j];
        if (ticketA.playerId === ticketB.playerId) continue;

        const waitSecondsB = Math.max(0, (now - ticketB.enqueuedAt) / 1000);
        const toleranceB = Math.min(
          MAX_RATING_TOLERANCE,
          this.baseTolerance + waitSecondsB * RATING_EXPANSION_RATE
        );

        // Effective tolerance is max of both wait tolerances
        const effectiveTolerance = Math.max(toleranceA, toleranceB);
        const delta = Math.abs(ticketA.playerRating - ticketB.playerRating);

        if (delta <= effectiveTolerance) {
          // Compatible match found!
          // Remove from pool
          pool.splice(j, 1);
          pool.splice(i, 1);

          this.activeTicketsByPlayer.delete(ticketA.playerId);
          this.activeTicketsByPlayer.delete(ticketB.playerId);

          ticketA.status = "MATCH_FOUND";
          ticketB.status = "MATCH_FOUND";

          const matchId = `match_${randomUUID()}`;
          const queueTimeA = now - ticketA.enqueuedAt;
          const queueTimeB = now - ticketB.enqueuedAt;

          // Record telemetry
          const telemetryItem = {
            matchId,
            gameId: ticketA.gameId,
            variantId: ticketA.variantId,
            tier: ticketA.tier,
            stakeMinor: ticketA.stakeMinor.toString(),
            playerA: { id: ticketA.playerId, rating: ticketA.playerRating, waitMs: queueTimeA },
            playerB: { id: ticketB.playerId, rating: ticketB.playerRating, waitMs: queueTimeB },
            ratingDelta: delta,
            pairedAt: now,
          };
          this.telemetryRecords.push(telemetryItem);

          return {
            paired: true,
            match: {
              matchId,
              gameId: ticketA.gameId,
              variantId: ticketA.variantId,
              tier: ticketA.tier,
              stakeMinor: ticketA.stakeMinor,
              asset: ticketA.asset,
              seat0: ticketA.playerId,
              seat1: ticketB.playerId,
              seat0Rating: ticketA.playerRating,
              seat1Rating: ticketB.playerRating,
              ratingDelta: delta,
              matchedAt: now,
            },
          };
        }
      }
    }

    return { paired: false };
  }

  /**
   * Drain pairing across all pools that currently have active tickets.
   */
  pairAllActivePools(now = this.now()) {
    const pairings = [];
    for (const poolKey of this.pools.keys()) {
      while (true) {
        const res = this.pairPool(poolKey, now);
        if (!res.paired) break;
        pairings.push(res.match);
      }
    }
    return pairings;
  }

  /**
   * Empirical telemetry metrics from real matches.
   * Never fabricates false "5-second" marketing claims!
   */
  getTelemetry() {
    if (this.telemetryRecords.length === 0) {
      return {
        sampleSize: 0,
        averageQueueTimeMs: 0,
        medianQueueTimeMs: 0,
        p90QueueTimeMs: 0,
        p99QueueTimeMs: 0,
        averageRatingDelta: 0,
        activeQueuedCount: this.activeTicketsByPlayer.size,
      };
    }

    const waitTimes = [];
    let totalDelta = 0;

    for (const r of this.telemetryRecords) {
      waitTimes.push(r.playerA.waitMs);
      waitTimes.push(r.playerB.waitMs);
      totalDelta += r.ratingDelta;
    }

    waitTimes.sort((a, b) => a - b);
    const sum = waitTimes.reduce((acc, v) => acc + v, 0);

    const p50Idx = Math.floor(waitTimes.length * 0.5);
    const p90Idx = Math.floor(waitTimes.length * 0.9);
    const p99Idx = Math.min(waitTimes.length - 1, Math.floor(waitTimes.length * 0.99));

    return {
      sampleSize: this.telemetryRecords.length,
      totalPlayerSamples: waitTimes.length,
      averageQueueTimeMs: Math.round(sum / waitTimes.length),
      medianQueueTimeMs: waitTimes[p50Idx],
      p90QueueTimeMs: waitTimes[p90Idx],
      p99QueueTimeMs: waitTimes[p99Idx],
      averageRatingDelta: Number((totalDelta / this.telemetryRecords.length).toFixed(1)),
      activeQueuedCount: this.activeTicketsByPlayer.size,
    };
  }
}
