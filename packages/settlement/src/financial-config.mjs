/**
 * Configurable, Versioned, Auditable and Server-Controlled Financial Configuration.
 *
 * CRITICAL FINANCIAL RULES:
 * 1. The client must NEVER send:
 *    - winner amount
 *    - fee
 *    - prize amount
 *    - wallet balance
 *    - settlement result
 *    The server calculates ALL financial values authoritative.
 * 2. Platform economics:
 *    - 12% standard platform fee (1200 bps)
 *    - 88% winner share
 *    - Stake ladder presets: $2, $5, $10, $20, $25, $50, $100, $200, $500, $1000, $2000
 *    - USDT (6 minor decimal places: 1 USDT = 1,000,000 minor units)
 * 3. Store exact fee configuration snapshot used for every match/tournament.
 * 4. All internal arithmetic strictly uses BigInt minor units. No floats anywhere.
 */

export const USDT_MINOR = 1_000_000n;

// Canonical stake ladder presets (USD/USDT)
export const CANONICAL_STAKE_PRESETS_USD = Object.freeze([
  2, 5, 10, 20, 25, 50, 100, 200, 500, 1000, 2000,
]);

export const CANONICAL_STAKE_PRESETS_MINOR = Object.freeze(
  CANONICAL_STAKE_PRESETS_USD.map((usd) => BigInt(usd) * USDT_MINOR)
);

export const MIN_STAKE_MINOR = CANONICAL_STAKE_PRESETS_MINOR[0]; // $2
export const MAX_STAKE_MINOR = CANONICAL_STAKE_PRESETS_MINOR[CANONICAL_STAKE_PRESETS_MINOR.length - 1]; // $2000

export const DEFAULT_RAKE_BPS = 1200n; // 12%
export const WINNER_SHARE_BPS = 8800n; // 88%
export const BPS_DENOMINATOR = 10000n;

/**
 * Validates that client payload does not contain unauthorized client-provided financial fields.
 * If any client-manipulated financial fields are detected, throws an Error.
 */
export function rejectClientFinancialInputs(payload) {
  if (!payload || typeof payload !== "object") return;
  const forbiddenKeys = [
    "winnerAmount", "winner_amount", "winnerAmountMinor",
    "fee", "rake", "feeMinor", "rakeMinor", "feeBps",
    "prizeAmount", "prize_amount", "prizePool", "netPrize",
    "walletBalance", "balance", "newBalance",
    "settlementResult", "settleResult", "payout",
  ];
  for (const key of forbiddenKeys) {
    if (key in payload && payload[key] !== undefined && payload[key] !== null) {
      throw new Error(`SECURITY_VIOLATION: Client is forbidden from providing financial calculation '${key}'. All financial values are strictly server-computed.`);
    }
  }
}

/**
 * GameStakeConfig
 * Canonical, auditable configuration for game stakes.
 */
export class GameStakeConfig {
  constructor({
    currency = "USDT",
    allowedStakesUsd = CANONICAL_STAKE_PRESETS_USD,
    minStakeUsd = 2,
    maxStakeUsd = 2000,
    version = 1,
  } = {}) {
    this.currency = currency;
    this.allowedStakesUsd = Object.freeze([...allowedStakesUsd].sort((a, b) => a - b));
    this.allowedStakesMinor = Object.freeze(this.allowedStakesUsd.map((usd) => BigInt(usd) * USDT_MINOR));
    this.minStakeMinor = BigInt(minStakeUsd) * USDT_MINOR;
    this.maxStakeMinor = BigInt(maxStakeUsd) * USDT_MINOR;
    this.version = version;
    Object.freeze(this);
  }

  isValidStake(stakeMinor) {
    let s;
    try {
      s = BigInt(stakeMinor);
    } catch {
      return false;
    }
    return this.allowedStakesMinor.some((preset) => preset === s);
  }

  toMinor(usd) {
    return BigInt(Math.round(Number(usd))) * USDT_MINOR;
  }

  toUsd(minor) {
    return Number(BigInt(minor)) / Number(USDT_MINOR);
  }

  createSnapshot() {
    return {
      currency: this.currency,
      allowedStakesUsd: [...this.allowedStakesUsd],
      minStakeMinor: this.minStakeMinor.toString(),
      maxStakeMinor: this.maxStakeMinor.toString(),
      version: this.version,
      timestamp: new Date().toISOString(),
    };
  }
}

export const defaultGameStakeConfig = new GameStakeConfig();

/**
 * FeeConfig
 * Versioned, auditable platform fee configuration.
 * Default: 12% platform rake (1200 bps), leaving 88% (8800 bps) to the winner.
 */
export class FeeConfig {
  constructor({
    ruleId = "standard",
    version = 2,
    rakeBps = DEFAULT_RAKE_BPS,
    minRakeMinor = 0n,
    maxRakeMinor = null,
    reason = "Platform economics: 12% standard rake (88% winner share)",
    effectiveFrom = new Date("2026-09-17T00:00:00Z"),
    createdBy = "founder",
    approvedBy = "finance-admin",
  } = {}) {
    this.ruleId = ruleId;
    this.version = Number(version);
    this.rakeBps = BigInt(rakeBps);
    this.minRakeMinor = BigInt(minRakeMinor ?? 0n);
    this.maxRakeMinor = maxRakeMinor != null ? BigInt(maxRakeMinor) : null;
    this.reason = reason;
    this.effectiveFrom = effectiveFrom instanceof Date ? effectiveFrom : new Date(effectiveFrom);
    this.createdBy = createdBy;
    this.approvedBy = approvedBy;

    // Validate bounds: 0 or between 1000 bps (10%) and 2500 bps (25%)
    const valid = this.rakeBps === 0n || (this.rakeBps >= 1000n && this.rakeBps <= 2500n);
    if (!valid) {
      throw new RangeError(`FeeConfig rakeBps out of legal bounds [1000, 2500]: ${this.rakeBps}`);
    }
    Object.freeze(this);
  }

  /**
   * Server calculates the platform fee and winner share from the gross pot.
   * Rounding is FLOOR for the fee, so fractions of a minor unit stay with the winner.
   *
   * @param {bigint} potMinor Gross total staked across all players
   * @returns {{ feeMinor: bigint, winnerAmountMinor: bigint, rakeBps: bigint, residueMicroMinor: bigint, version: number }}
   */
  calculatePotDistribution(potMinor) {
    if (typeof potMinor !== "bigint") throw new TypeError("potMinor must be a BigInt");
    if (potMinor < 0n) throw new RangeError("potMinor cannot be negative");

    if (potMinor === 0n) {
      return {
        feeMinor: 0n,
        winnerAmountMinor: 0n,
        rakeBps: this.rakeBps,
        residueMicroMinor: 0n,
        version: this.version,
      };
    }

    const numerator = potMinor * this.rakeBps;
    let fee = numerator / BPS_DENOMINATOR; // floor
    const residue = numerator - fee * BPS_DENOMINATOR;

    if (fee < this.minRakeMinor) fee = this.minRakeMinor;
    if (this.maxRakeMinor !== null && fee > this.maxRakeMinor) fee = this.maxRakeMinor;
    if (fee > potMinor) fee = potMinor;

    const winnerAmount = potMinor - fee;

    return {
      feeMinor: fee,
      winnerAmountMinor: winnerAmount,
      rakeBps: this.rakeBps,
      residueMicroMinor: residue,
      version: this.version,
    };
  }

  createSnapshot() {
    return {
      ruleId: this.ruleId,
      version: this.version,
      rakeBps: Number(this.rakeBps),
      minRakeMinor: this.minRakeMinor.toString(),
      maxRakeMinor: this.maxRakeMinor !== null ? this.maxRakeMinor.toString() : null,
      reason: this.reason,
      snapshottedAt: new Date().toISOString(),
    };
  }
}

export const defaultFeeConfig = new FeeConfig();

/**
 * PrizePoolConfig
 * Calculates and manages prize pools for tournaments or multi-player matches.
 * The client NEVER specifies prize pool amounts; the server derives everything.
 */
export class PrizePoolConfig {
  constructor({
    feeConfig = defaultFeeConfig,
    distributionType = "WINNER_TAKE_ALL", // "WINNER_TAKE_ALL" | "TOP_2" | "TOP_3"
    customTiers = null, // e.g. [{ rank: 1, shareBps: 7000 }, { rank: 2, shareBps: 3000 }]
  } = {}) {
    this.feeConfig = feeConfig;
    this.distributionType = distributionType;
    this.customTiers = customTiers ? Object.freeze([...customTiers]) : null;
    Object.freeze(this);
  }

  /**
   * Calculates total gross pot, platform fee, and net prize pool per rank.
   */
  calculatePrizes({ entryFeeMinor, playerCount }) {
    const feeMinor = BigInt(entryFeeMinor);
    const count = BigInt(playerCount);
    if (feeMinor < 0n) throw new RangeError("entryFeeMinor cannot be negative");
    if (count <= 0n) throw new RangeError("playerCount must be at least 1");

    const grossPotMinor = feeMinor * count;
    const { feeMinor: platformFeeMinor, winnerAmountMinor: netPrizePoolMinor } =
      this.feeConfig.calculatePotDistribution(grossPotMinor);

    let prizes = [];
    if (this.distributionType === "WINNER_TAKE_ALL" || count === 1n || !this.customTiers) {
      prizes = [
        {
          rank: 1,
          shareBps: 10000n,
          prizeMinor: netPrizePoolMinor,
        },
      ];
    } else {
      let allocated = 0n;
      prizes = this.customTiers.map((tier, idx) => {
        const shareBps = BigInt(tier.shareBps);
        const isLast = idx === this.customTiers.length - 1;
        let tierPrize = (netPrizePoolMinor * shareBps) / BPS_DENOMINATOR;
        if (isLast) {
          tierPrize = netPrizePoolMinor - allocated; // ensure zero residue lost
        } else {
          allocated += tierPrize;
        }
        return {
          rank: tier.rank,
          shareBps,
          prizeMinor: tierPrize,
        };
      });
    }

    return {
      grossPotMinor,
      platformFeeMinor,
      netPrizePoolMinor,
      feeConfigSnapshot: this.feeConfig.createSnapshot(),
      prizes,
    };
  }
}

export const defaultPrizePoolConfig = new PrizePoolConfig();

/**
 * SettlementPolicy
 * Pure, deterministic rules for settling matches and duels.
 */
export class SettlementPolicy {
  constructor({ feeConfig = defaultFeeConfig } = {}) {
    this.feeConfig = feeConfig;
    Object.freeze(this);
  }

  /**
   * Evaluates settlement for a 2-player match.
   *
   * @param {object} params
   * @param {string} params.seat0 Player 0 ID
   * @param {string} params.seat1 Player 1 ID
   * @param {bigint|string|number} params.stakeMinor Stake per player
   * @param {"1-0"|"0-1"|"1/2-1/2"|"ABORT"|"DISQUALIFIED"} params.result
   * @param {string|null} [params.winnerId]
   * @returns {object} Settlement instruction with legs and audit details
   */
  evaluateDuelSettlement({ seat0, seat1, stakeMinor, result, winnerId = null }) {
    const s = BigInt(stakeMinor);
    const pot = s * 2n;

    const locked = (p) => `user:${p}:locked`;
    const available = (p) => `user:${p}:available`;

    // CASE 1: Draw or Abort -> 100% full refund to both players, 0% platform fee
    if (result === "1/2-1/2" || result === "ABORT") {
      return {
        type: result === "1/2-1/2" ? "DRAW_REFUND" : "ABORT_REFUND",
        potMinor: pot,
        feeMinor: 0n,
        payoutMinor: 0n,
        feeSnapshot: this.feeConfig.createSnapshot(),
        legs: [
          { account: locked(seat0), amount: s.toString(), direction: "RELEASE" },
          { account: available(seat0), amount: (-s).toString(), direction: "CREDIT" },
          { account: locked(seat1), amount: s.toString(), direction: "RELEASE" },
          { account: available(seat1), amount: (-s).toString(), direction: "CREDIT" },
        ],
        refunds: [
          { userId: seat0, amountMinor: s },
          { userId: seat1, amountMinor: s },
        ],
        winnerId: null,
      };
    }

    // CASE 2: Decisive win ("1-0" or "0-1")
    let winner = winnerId;
    let loser = null;
    if (!winner) {
      if (result === "1-0") {
        winner = seat0;
        loser = seat1;
      } else if (result === "0-1") {
        winner = seat1;
        loser = seat0;
      } else {
        throw new Error(`Unsupported match result: ${result}`);
      }
    } else {
      loser = winner === seat0 ? seat1 : seat0;
    }

    const { feeMinor, winnerAmountMinor } = this.feeConfig.calculatePotDistribution(pot);

    const legs = [
      // Release locked stakes from both players
      { account: locked(loser), amount: s.toString(), direction: "RELEASE" },
      { account: locked(winner), amount: s.toString(), direction: "RELEASE" },
      // Pay the winner the net pot (pot minus platform fee)
      { account: available(winner), amount: (-winnerAmountMinor).toString(), direction: "CREDIT" },
    ];

    if (feeMinor > 0n) {
      legs.push({ account: "platform:rake", amount: (-feeMinor).toString(), direction: "CREDIT" });
    }

    return {
      type: "DECISIVE_WIN",
      potMinor: pot,
      feeMinor,
      payoutMinor: winnerAmountMinor,
      winnerId: winner,
      loserId: loser,
      feeSnapshot: this.feeConfig.createSnapshot(),
      legs,
    };
  }
}

export const defaultSettlementPolicy = new SettlementPolicy();

/**
 * MatchEscrow
 * Manages match escrow state machine and hold invariants.
 */
export const EscrowStatus = {
  PENDING: "PENDING",
  LOCKED: "LOCKED",
  SETTLED: "SETTLED",
  REFUNDED: "REFUNDED",
  VOIDED: "VOIDED",
};

export class MatchEscrow {
  constructor({
    matchId,
    players,
    stakeMinor,
    currency = "USDT",
    feeConfig = defaultFeeConfig,
  }) {
    if (!matchId) throw new Error("matchId required for MatchEscrow");
    if (!Array.isArray(players) || players.length < 2) throw new Error("At least 2 players required for MatchEscrow");
    this.matchId = matchId;
    this.players = Object.freeze([...players]);
    this.stakeMinor = BigInt(stakeMinor);
    this.currency = currency;
    this.feeConfig = feeConfig;
    this.status = EscrowStatus.PENDING;
    this.lockedAt = null;
    this.settledAt = null;
    this.settlementTxId = null;
    this.reservationTxId = null;
    this.feeSnapshot = null;
    this.history = [];
  }

  /**
   * Generates reservation legs to lock funds before match start.
   */
  lock(reservationTxId) {
    if (this.status !== EscrowStatus.PENDING) {
      throw new Error(`Cannot lock escrow in status: ${this.status}`);
    }
    this.status = EscrowStatus.LOCKED;
    this.reservationTxId = reservationTxId;
    this.lockedAt = new Date().toISOString();
    this.feeSnapshot = this.feeConfig.createSnapshot();
    this.history.push({
      status: this.status,
      txId: reservationTxId,
      timestamp: this.lockedAt,
    });
    return this;
  }

  /**
   * Generates release legs for settlement or refund.
   */
  settle({ result, winnerId = null, settlementTxId }) {
    if (this.status !== EscrowStatus.LOCKED) {
      if (this.status === EscrowStatus.SETTLED && this.settlementTxId === settlementTxId) {
        // Idempotent hit
        return { alreadySettled: true, txId: this.settlementTxId };
      }
      throw new Error(`Cannot settle escrow in status: ${this.status}`);
    }

    const policy = new SettlementPolicy({ feeConfig: this.feeConfig });
    const settlement = policy.evaluateDuelSettlement({
      seat0: this.players[0],
      seat1: this.players[1],
      stakeMinor: this.stakeMinor,
      result,
      winnerId,
    });

    this.status = (result === "1/2-1/2" || result === "ABORT") ? EscrowStatus.REFUNDED : EscrowStatus.SETTLED;
    this.settledAt = new Date().toISOString();
    this.settlementTxId = settlementTxId;
    this.history.push({
      status: this.status,
      txId: settlementTxId,
      timestamp: this.settledAt,
      result,
      winnerId,
    });

    return {
      alreadySettled: false,
      settlement,
      txId: settlementTxId,
    };
  }
}
