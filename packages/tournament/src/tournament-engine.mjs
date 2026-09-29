/**
 * Nizalo Authoritative Tournament Engine.
 *
 * Single Source of Truth for:
 * - Tournament Type: SINGLE_ELIMINATION (strictly validated; uncertified formats rejected)
 * - Game and Variant
 * - Capacity & Player count
 * - Entry fee & currency (USDT)
 * - Prize Configuration: 12% platform fee, 88% net winner share
 * - Registration & Check-in lifecycle
 * - Seeding & Bracket generation with deterministic Byes
 * - Round progression & Walkovers / Disqualifications
 * - Authoritative Server-side Prize Settlement
 */

import { randomUUID } from "node:crypto";
import {
  FeeConfig,
  defaultFeeConfig,
  PrizePoolConfig,
  defaultPrizePoolConfig,
  rejectClientFinancialInputs,
} from "../../settlement/src/financial-config.mjs";
import { buildFirstRound, buildNextRound, nextPow2 } from "./pairing.mjs";

export const TournamentType = {
  SINGLE_ELIMINATION: "SINGLE_ELIMINATION",
};

export const TournamentStatus = {
  DRAFT: "DRAFT",
  REGISTRATION: "REGISTRATION",
  CHECK_IN: "CHECK_IN",
  STARTING: "STARTING",
  IN_PROGRESS: "IN_PROGRESS",
  FINALS: "FINALS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
};

export const EntryStatus = {
  REGISTERED: "REGISTERED",
  CHECKED_IN: "CHECKED_IN",
  ACTIVE: "ACTIVE",
  ELIMINATED: "ELIMINATED",
  WINNER: "WINNER",
  DISQUALIFIED: "DISQUALIFIED",
};

/**
 * TournamentEntry model.
 */
export class TournamentEntry {
  constructor({
    entryId = `ent_${randomUUID()}`,
    tournamentId,
    userId,
    entryFeeMinor = 0n,
    registeredAt = new Date().toISOString(),
    checkedIn = false,
    checkedInAt = null,
    seed = null,
    status = EntryStatus.REGISTERED,
  }) {
    if (!tournamentId) throw new Error("tournamentId required for TournamentEntry");
    if (!userId) throw new Error("userId required for TournamentEntry");
    this.entryId = entryId;
    this.tournamentId = tournamentId;
    this.userId = userId;
    this.entryFeeMinor = BigInt(entryFeeMinor);
    this.registeredAt = registeredAt;
    this.checkedIn = checkedIn;
    this.checkedInAt = checkedInAt;
    this.seed = seed;
    this.status = status;
  }
}

/**
 * TournamentPrize model.
 */
export class TournamentPrize {
  constructor({
    tournamentId,
    rank,
    userId,
    amountMinor,
    percentageBps,
    currency = "USDT",
    settlementTxId = null,
    status = "PENDING",
  }) {
    this.tournamentId = tournamentId;
    this.rank = Number(rank);
    this.userId = userId;
    this.amountMinor = BigInt(amountMinor);
    this.percentageBps = BigInt(percentageBps);
    this.currency = currency;
    this.settlementTxId = settlementTxId;
    this.status = status;
    Object.freeze(this);
  }
}

/**
 * TournamentEngine.
 */
export class TournamentEngine {
  constructor({
    id = `trn_${randomUUID()}`,
    type = TournamentType.SINGLE_ELIMINATION,
    gameId,
    variant = "standard",
    capacity = 8,
    minPlayers = 2,
    tier = "FREE",
    entryFeeMinor = 0n,
    currency = "USDT",
    feeConfig = defaultFeeConfig,
    prizePoolConfig = defaultPrizePoolConfig,
    walletLedger = null,
    title = null,
  }) {
    if (!gameId) throw new Error("gameId is required for TournamentEngine");

    // Only expose fully implemented tournament types
    if (type !== TournamentType.SINGLE_ELIMINATION) {
      throw new Error(`UNSUPPORTED_TOURNAMENT_TYPE: '${type}' is not certified. Only SINGLE_ELIMINATION is active.`);
    }

    this.id = id;
    this.type = type;
    this.gameId = gameId;
    this.variant = variant;
    this.capacity = Number(capacity);
    this.minPlayers = Number(minPlayers);
    this.tier = tier;
    this.entryFeeMinor = BigInt(entryFeeMinor);
    this.currency = currency;
    this.feeConfig = feeConfig instanceof FeeConfig ? feeConfig : new FeeConfig(feeConfig);
    this.prizePoolConfig = prizePoolConfig;
    this.walletLedger = walletLedger;
    this.title = title ?? `${gameId.toUpperCase()} Championship (${this.capacity} Players)`;

    this.status = TournamentStatus.DRAFT;
    this.entries = new Map(); // userId -> TournamentEntry
    this.rounds = [];         // Array of rounds: [ [{ matchId, round, slot, seat0, seat1, winner, status }] ]
    this.currentRound = 0;
    this.prizes = [];
    this.winnerId = null;
    this.settlementResult = null;
    this.history = [];
  }

  openRegistration() {
    if (this.status !== TournamentStatus.DRAFT) {
      throw new Error(`Cannot open registration from status: ${this.status}`);
    }
    this.status = TournamentStatus.REGISTRATION;
    this._log("REGISTRATION_OPENED");
    return this;
  }

  registerPlayer({ userId, entryFeeMinor = null, clientPayload = {} }) {
    // Financial Security: Strictly reject any client-dictated financial fields
    rejectClientFinancialInputs(clientPayload);

    if (this.status !== TournamentStatus.REGISTRATION) {
      throw new Error(`Registration is not open (status: ${this.status})`);
    }
    if (this.entries.has(userId)) {
      throw new Error(`Player ${userId} is already registered`);
    }
    if (this.entries.size >= this.capacity) {
      throw new Error(`Tournament capacity (${this.capacity}) reached`);
    }

    // Verify entry fee matches server configuration
    if (this.tier === "CASH") {
      const fee = entryFeeMinor != null ? BigInt(entryFeeMinor) : this.entryFeeMinor;
      if (fee !== this.entryFeeMinor) {
        throw new Error(`FEE_MISMATCH: Provided fee ${fee} does not match tournament entry fee ${this.entryFeeMinor}`);
      }
    }

    const entry = new TournamentEntry({
      tournamentId: this.id,
      userId,
      entryFeeMinor: this.tier === "CASH" ? this.entryFeeMinor : 0n,
      seed: this.entries.size + 1,
    });

    this.entries.set(userId, entry);
    this._log("PLAYER_REGISTERED", { userId, totalEntries: this.entries.size });
    return entry;
  }

  openCheckIn() {
    if (this.status !== TournamentStatus.REGISTRATION) {
      throw new Error(`Cannot open check-in from status: ${this.status}`);
    }
    this.status = TournamentStatus.CHECK_IN;
    this._log("CHECK_IN_OPENED");
    return this;
  }

  checkInPlayer({ userId }) {
    if (this.status !== TournamentStatus.CHECK_IN && this.status !== TournamentStatus.REGISTRATION) {
      throw new Error(`Check-in is closed (status: ${this.status})`);
    }
    const entry = this.entries.get(userId);
    if (!entry) throw new Error(`Player ${userId} is not registered`);
    entry.checkedIn = true;
    entry.checkedInAt = new Date().toISOString();
    entry.status = EntryStatus.CHECKED_IN;
    return entry;
  }

  start({ seededPlayerIds = null } = {}) {
    if (this.status !== TournamentStatus.REGISTRATION && this.status !== TournamentStatus.CHECK_IN) {
      throw new Error(`Cannot start tournament in status: ${this.status}`);
    }

    const activePlayers = seededPlayerIds ?? Array.from(this.entries.keys());
    if (activePlayers.length < this.minPlayers) {
      throw new Error(`Not enough players: ${activePlayers.length} < ${this.minPlayers}`);
    }

    // Build first round bracket using standard single-elimination seeding
    const firstRoundPairings = buildFirstRound(activePlayers);

    const round0Matches = firstRoundPairings.map((p) => {
      const matchId = `match_${this.id}_r1_s${p.slot}`;
      const isBye = p.seat1 === null;
      return {
        matchId,
        round: 1,
        slot: p.slot,
        seat0: p.seat0,
        seat1: p.seat1,
        winner: isBye ? p.seat0 : null,
        status: isBye ? "BYE" : "SCHEDULED",
        result: isBye ? "1-0" : null,
      };
    });

    this.rounds = [round0Matches];
    this.currentRound = 1;
    this.status = TournamentStatus.IN_PROGRESS;
    this._log("TOURNAMENT_STARTED", { roundCount: Math.log2(nextPow2(activePlayers.length)), totalPlayers: activePlayers.length });

    // Mark entries active
    for (const uid of activePlayers) {
      const entry = this.entries.get(uid);
      if (entry) entry.status = EntryStatus.ACTIVE;
    }

    // Check if round 1 was all byes or immediately ready for round 2
    this._checkRoundProgression();
    return this;
  }

  recordMatchResult({ matchId, winnerId, result = "1-0" }) {
    if (this.status !== TournamentStatus.IN_PROGRESS && this.status !== TournamentStatus.FINALS) {
      throw new Error(`Cannot record match in status: ${this.status}`);
    }

    const currentMatches = this.rounds[this.currentRound - 1];
    const match = currentMatches.find((m) => m.matchId === matchId);
    if (!match) throw new Error(`Match ${matchId} not found in round ${this.currentRound}`);
    if (match.status === "COMPLETED" || match.status === "BYE") {
      return { alreadyRecorded: true, match };
    }

    if (winnerId !== match.seat0 && winnerId !== match.seat1) {
      throw new Error(`Winner ${winnerId} is not a player in match ${matchId}`);
    }

    const loserId = winnerId === match.seat0 ? match.seat1 : match.seat0;
    match.winner = winnerId;
    match.result = result;
    match.status = "COMPLETED";

    if (loserId && this.entries.has(loserId)) {
      this.entries.get(loserId).status = EntryStatus.ELIMINATED;
    }

    this._log("MATCH_COMPLETED", { matchId, winnerId, loserId });
    this._checkRoundProgression();

    return { alreadyRecorded: false, match };
  }

  disqualifyPlayer({ userId, reason = "FAIR_PLAY_VIOLATION" }) {
    const entry = this.entries.get(userId);
    if (!entry) throw new Error(`Player ${userId} is not registered`);
    entry.status = EntryStatus.DISQUALIFIED;

    // Find any active match in current round
    if (this.status === TournamentStatus.IN_PROGRESS || this.status === TournamentStatus.FINALS) {
      const currentMatches = this.rounds[this.currentRound - 1] ?? [];
      const match = currentMatches.find((m) => (m.seat0 === userId || m.seat1 === userId) && m.status !== "COMPLETED" && m.status !== "BYE");
      if (match) {
        const opponent = match.seat0 === userId ? match.seat1 : match.seat0;
        match.winner = opponent;
        match.result = "1-0";
        match.status = "WALKOVER";
        this._log("WALKOVER_AWARDED", { matchId: match.matchId, disqualified: userId, awardedTo: opponent });
        this._checkRoundProgression();
      }
    }
    return { ok: true, userId, status: EntryStatus.DISQUALIFIED, reason };
  }

  _checkRoundProgression() {
    const currentMatches = this.rounds[this.currentRound - 1];
    const allDecided = currentMatches.every((m) => m.winner !== null);
    if (!allDecided) return; // Wait for remaining matches

    // If this was a 1-match round (Final), tournament is won!
    if (currentMatches.length === 1) {
      this.winnerId = currentMatches[0].winner;
      if (this.entries.has(this.winnerId)) {
        this.entries.get(this.winnerId).status = EntryStatus.WINNER;
      }
      this.status = TournamentStatus.COMPLETED;
      this._log("TOURNAMENT_COMPLETED", { winnerId: this.winnerId });
      this.settlePrizes(this.walletLedger);
      return;
    }

    // Otherwise, generate next round
    const winners = currentMatches.map((m) => ({ slot: m.slot, winner: m.winner }));
    const nextPairings = buildNextRound(winners);
    const nextRoundNumber = this.currentRound + 1;

    const nextMatches = nextPairings.map((p) => {
      const matchId = `match_${this.id}_r${nextRoundNumber}_s${p.slot}`;
      const isBye = p.seat1 === null;
      return {
        matchId,
        round: nextRoundNumber,
        slot: p.slot,
        seat0: p.seat0,
        seat1: p.seat1,
        winner: isBye ? p.seat0 : null,
        status: isBye ? "BYE" : "SCHEDULED",
        result: isBye ? "1-0" : null,
      };
    });

    this.rounds.push(nextMatches);
    this.currentRound = nextRoundNumber;
    if (nextMatches.length === 1) {
      this.status = TournamentStatus.FINALS;
    }
    this._log("ADVANCED_ROUND", { round: nextRoundNumber, matchesCount: nextMatches.length });

    // Check if next round also has byes and needs further progression
    this._checkRoundProgression();
  }

  /**
   * Settle Prizes with strictly authoritative server calculation.
   * Platform Fee: 12%
   * Net Winner Share: 88%
   */
  settlePrizes(walletLedger = null) {
    const ledger = walletLedger ?? this.walletLedger;
    if (this.settlementResult) {
      if (ledger && !this.settlementResult.ledgerTx && this.winnerId && this.tier === "CASH") {
        const winnerPrize = this.prizes.find((p) => p.rank === 1)?.amountMinor ?? 0n;
        const legs = [
          { account: `user:${this.winnerId}:available`, amount: (-winnerPrize).toString() },
          { account: "platform:rake", amount: (-this.settlementResult.platformFeeMinor).toString() },
        ];
        for (const [userId, entry] of this.entries.entries()) {
          legs.push({ account: `user:${userId}:locked`, amount: entry.entryFeeMinor.toString() });
        }
        const ledgerTx = ledger.post({
          idempotencyKey: `tournament:${this.id}:prize`,
          type: "SETTLEMENT_PAYOUT",
          reference: `tournament:${this.id}`,
          legs,
          actor: "TOURNAMENT_ENGINE",
          metadata: {
            tournamentId: this.id,
            winnerId: this.winnerId,
            grossPotMinor: this.settlementResult.grossPotMinor.toString(),
            platformFeeMinor: this.settlementResult.platformFeeMinor.toString(),
            netPrizePoolMinor: this.settlementResult.netPrizePoolMinor.toString(),
            feeConfigSnapshot: this.settlementResult.feeConfigSnapshot,
          },
        });
        this.settlementResult.ledgerTx = ledgerTx;
        return { alreadySettled: false, settlement: this.settlementResult };
      }
      return { alreadySettled: true, settlement: this.settlementResult };
    }

    const entrantCount = this.entries.size;
    const grossPot = this.tier === "CASH" ? this.entryFeeMinor * BigInt(entrantCount) : 0n;

    if (grossPot === 0n || this.tier === "FREE") {
      this.prizes = [
        new TournamentPrize({
          tournamentId: this.id,
          rank: 1,
          userId: this.winnerId,
          amountMinor: 0n,
          percentageBps: 10000n,
          currency: this.currency,
          status: "SETTLED",
        }),
      ];
      this.settlementResult = {
        tier: "FREE",
        grossPotMinor: 0n,
        platformFeeMinor: 0n,
        netPrizePoolMinor: 0n,
        prizes: this.prizes,
      };
      return { alreadySettled: false, settlement: this.settlementResult };
    }

    // CASH TOURNAMENT SETTLEMENT: Server-calculated 12% Platform Fee, 88% Winner Share
    const calc = this.prizePoolConfig.calculatePrizes({
      entryFeeMinor: this.entryFeeMinor,
      playerCount: entrantCount,
    });

    const prizes = calc.prizes.map((p) => {
      const uid = p.rank === 1 ? this.winnerId : null;
      return new TournamentPrize({
        tournamentId: this.id,
        rank: p.rank,
        userId: uid,
        amountMinor: p.prizeMinor,
        percentageBps: p.shareBps,
        currency: this.currency,
        status: walletLedger ? "SETTLED" : "PENDING",
      });
    });

    this.prizes = prizes;

    // Post to WalletLedger if provided
    let ledgerTx = null;
    if (walletLedger && this.winnerId) {
      const winnerPrize = prizes.find((p) => p.rank === 1)?.amountMinor ?? 0n;
      const legs = [
        // Settle from platform escrow to winner
        { account: `user:${this.winnerId}:available`, amount: (-winnerPrize).toString() },
        { account: "platform:rake", amount: (-calc.platformFeeMinor).toString() },
      ];

      // Deduct entry fees from locked escrow
      for (const [userId, entry] of this.entries.entries()) {
        legs.push({ account: `user:${userId}:locked`, amount: entry.entryFeeMinor.toString() });
      }

      ledgerTx = walletLedger.post({
        idempotencyKey: `tournament:${this.id}:prize`,
        type: "SETTLEMENT_PAYOUT",
        reference: `tournament:${this.id}`,
        legs,
        actor: "TOURNAMENT_ENGINE",
        metadata: {
          tournamentId: this.id,
          winnerId: this.winnerId,
          grossPotMinor: calc.grossPotMinor.toString(),
          platformFeeMinor: calc.platformFeeMinor.toString(),
          netPrizePoolMinor: calc.netPrizePoolMinor.toString(),
          feeConfigSnapshot: calc.feeConfigSnapshot,
        },
      });
    }

    this.settlementResult = {
      tier: "CASH",
      grossPotMinor: calc.grossPotMinor,
      platformFeeMinor: calc.platformFeeMinor,
      netPrizePoolMinor: calc.netPrizePoolMinor,
      feeConfigSnapshot: calc.feeConfigSnapshot,
      prizes: this.prizes,
      ledgerTx,
    };

    this._log("PRIZES_SETTLED", {
      grossPot: calc.grossPotMinor.toString(),
      platformFee: calc.platformFeeMinor.toString(),
      winnerPrize: calc.netPrizePoolMinor.toString(),
    });

    return { alreadySettled: false, settlement: this.settlementResult };
  }

  cancel({ reason = "ADMIN_CANCELLED", walletLedger = null } = {}) {
    if (this.status === TournamentStatus.COMPLETED) {
      throw new Error("Cannot cancel an already COMPLETED tournament");
    }
    this.status = TournamentStatus.CANCELLED;

    // Refund 100% of entry fees, 0% platform fee
    if (walletLedger && this.tier === "CASH") {
      for (const [userId, entry] of this.entries.entries()) {
        if (entry.entryFeeMinor > 0n) {
          const legs = [
            { account: `user:${userId}:locked`, amount: entry.entryFeeMinor.toString() },
            { account: `user:${userId}:available`, amount: (-entry.entryFeeMinor).toString() },
          ];
          walletLedger.post({
            idempotencyKey: `tournament:${this.id}:refund:${userId}`,
            type: "REFUND",
            reference: `tournament:${this.id}`,
            legs,
            actor: "TOURNAMENT_CANCELLATION",
            metadata: { tournamentId: this.id, reason, userId },
          });
        }
      }
    }

    this._log("TOURNAMENT_CANCELLED", { reason });
    return { ok: true, status: TournamentStatus.CANCELLED, reason };
  }

  _log(action, payload = {}) {
    this.history.push({
      action,
      at: new Date().toISOString(),
      ...payload,
    });
  }
}
