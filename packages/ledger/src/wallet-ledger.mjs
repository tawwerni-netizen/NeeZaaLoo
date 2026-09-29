/**
 * Nizalo Immutable Wallet Ledger & Financial State Machines.
 *
 * Enforces:
 * 1. Double-entry bookkeeping where sum(legs) == 0.
 * 2. Immutable audit trail of every balance change with:
 *    - transaction ID
 *    - type
 *    - reference
 *    - amount
 *    - currency
 *    - direction (CREDIT / DEBIT)
 *    - previous balance snapshot
 *    - resulting balance
 *    - createdAt
 *    - status
 *    - actor/system
 *    - idempotencyKey
 * 3. Deposit State Machine:
 *    pending -> detected -> confirmed -> credited (or failed, reversed)
 * 4. Withdrawal State Machine:
 *    requested -> risk-check -> approved -> processing -> broadcast -> confirmed -> completed (or failed, reversed)
 * 5. Strict Invariants:
 *    - No negative balances (available >= 0, locked >= 0).
 *    - Total platform solvency preserved.
 *    - Idempotency on all financial transactions and webhook callbacks.
 */

import { randomUUID } from "node:crypto";

export const DepositState = {
  PENDING: "PENDING",
  DETECTED: "DETECTED",
  CONFIRMED: "CONFIRMED",
  CREDITED: "CREDITED",
  FAILED: "FAILED",
  REVERSED: "REVERSED",
};

export const WithdrawalState = {
  REQUESTED: "REQUESTED",
  RISK_CHECK: "RISK_CHECK",
  APPROVED: "APPROVED",
  PROCESSING: "PROCESSING",
  BROADCAST: "BROADCAST",
  CONFIRMED: "CONFIRMED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  REVERSED: "REVERSED",
};

export const TransactionType = {
  DEPOSIT: "DEPOSIT",
  WITHDRAWAL: "WITHDRAWAL",
  ESCROW_LOCK: "ESCROW_LOCK",
  ESCROW_RELEASE: "ESCROW_RELEASE",
  SETTLEMENT_PAYOUT: "SETTLEMENT_PAYOUT",
  PLATFORM_FEE: "PLATFORM_FEE",
  REFUND: "REFUND",
  REVERSAL: "REVERSAL",
};

export const TransactionDirection = {
  CREDIT: "CREDIT", // Adds funds to user available balance
  DEBIT: "DEBIT",   // Deducts funds from user available balance
};

export const TransactionStatus = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  REVERSED: "REVERSED",
};

/**
 * Immutable Transaction Record.
 */
export class Transaction {
  constructor({
    transactionId = `tx_${randomUUID()}`,
    type,
    reference,
    amount,
    currency = "USDT",
    direction,
    previousBalance,
    resultingBalance,
    createdAt = new Date().toISOString(),
    status = TransactionStatus.CONFIRMED,
    actor = "SYSTEM",
    idempotencyKey,
    metadata = {},
  }) {
    if (!type) throw new Error("Transaction type is required");
    if (!reference) throw new Error("Transaction reference is required");
    if (typeof amount !== "bigint") throw new TypeError("Transaction amount must be a BigInt");
    if (amount <= 0n) throw new RangeError("Transaction amount must be positive");
    if (!direction || !TransactionDirection[direction]) {
      throw new Error(`Invalid transaction direction: ${direction}`);
    }
    if (typeof previousBalance !== "bigint") throw new TypeError("previousBalance must be a BigInt");
    if (typeof resultingBalance !== "bigint") throw new TypeError("resultingBalance must be a BigInt");
    if (!idempotencyKey) throw new Error("idempotencyKey is required for Transaction");

    this.transactionId = transactionId;
    this.type = type;
    this.reference = reference;
    this.amount = amount;
    this.currency = currency;
    this.direction = direction;
    this.previousBalance = previousBalance;
    this.resultingBalance = resultingBalance;
    this.createdAt = createdAt;
    this.status = status;
    this.actor = actor;
    this.idempotencyKey = idempotencyKey;
    this.metadata = Object.freeze({ ...metadata });
    Object.freeze(this);
  }

  toJSON() {
    return {
      transactionId: this.transactionId,
      type: this.type,
      reference: this.reference,
      amount: this.amount.toString(),
      currency: this.currency,
      direction: this.direction,
      previousBalance: this.previousBalance.toString(),
      resultingBalance: this.resultingBalance.toString(),
      createdAt: this.createdAt,
      status: this.status,
      actor: this.actor,
      idempotencyKey: this.idempotencyKey,
      metadata: this.metadata,
    };
  }
}

/**
 * Deposit Record & State Machine.
 */
export class DepositRecord {
  constructor({
    depositId = `dep_${randomUUID()}`,
    userId,
    amountMinor,
    currency = "USDT",
    network = "TRON",
    txHash = null,
    requiredConfirmations = 20,
    actor = "SYSTEM",
  }) {
    if (!userId) throw new Error("userId required for DepositRecord");
    if (typeof amountMinor !== "bigint") throw new TypeError("amountMinor must be a BigInt");
    if (amountMinor <= 0n) throw new RangeError("Deposit amountMinor must be positive");

    this.depositId = depositId;
    this.userId = userId;
    this.amountMinor = amountMinor;
    this.currency = currency;
    this.network = network;
    this.txHash = txHash;
    this.requiredConfirmations = requiredConfirmations;
    this.currentConfirmations = 0;
    this.state = DepositState.PENDING;
    this.createdAt = new Date().toISOString();
    this.updatedAt = this.createdAt;
    this.creditedAt = null;
    this.ledgerTxId = null;
    this.failureReason = null;
    this.actor = actor;
    this.transitions = [{ from: null, to: DepositState.PENDING, at: this.createdAt }];
  }

  detect(txHash) {
    if (this.state !== DepositState.PENDING) {
      if ((this.state === DepositState.DETECTED || this.state === DepositState.CONFIRMED || this.state === DepositState.CREDITED) && this.txHash === txHash) {
        return this;
      }
      throw new Error(`Cannot transition from ${this.state} to DETECTED`);
    }
    this.txHash = txHash;
    this._transition(DepositState.DETECTED);
    return this;
  }

  confirm(confirmations) {
    if (this.state === DepositState.CREDITED) {
      return this;
    }
    if (this.state !== DepositState.DETECTED && this.state !== DepositState.CONFIRMED) {
      throw new Error(`Cannot transition from ${this.state} to CONFIRMED`);
    }
    this.currentConfirmations = confirmations;
    if (confirmations >= this.requiredConfirmations && this.state !== DepositState.CONFIRMED) {
      this._transition(DepositState.CONFIRMED);
    }
    return this;
  }

  credit(ledgerTxId) {
    if (this.state !== DepositState.CONFIRMED) {
      if (this.state === DepositState.CREDITED && this.ledgerTxId === ledgerTxId) {
        return this; // Idempotent
      }
      throw new Error(`Cannot credit deposit in state: ${this.state}. Must be CONFIRMED.`);
    }
    this.ledgerTxId = ledgerTxId;
    this.creditedAt = new Date().toISOString();
    this._transition(DepositState.CREDITED);
    return this;
  }

  fail(reason) {
    if (this.state === DepositState.CREDITED) {
      throw new Error("Cannot fail an already CREDITED deposit; use reverse()");
    }
    this.failureReason = reason;
    this._transition(DepositState.FAILED);
    return this;
  }

  reverse(reason) {
    if (this.state !== DepositState.CREDITED) {
      throw new Error(`Cannot reverse deposit in state: ${this.state}. Must be CREDITED.`);
    }
    this.failureReason = reason;
    this._transition(DepositState.REVERSED);
    return this;
  }

  _transition(nextState) {
    const prev = this.state;
    this.state = nextState;
    this.updatedAt = new Date().toISOString();
    this.transitions.push({ from: prev, to: nextState, at: this.updatedAt });
  }
}

/**
 * Withdrawal Record & State Machine.
 */
export class WithdrawalRecord {
  constructor({
    withdrawalId = `wd_${randomUUID()}`,
    userId,
    amountMinor,
    currency = "USDT",
    network = "TRON",
    destinationAddress,
    actor = "SYSTEM",
  }) {
    if (!userId) throw new Error("userId required for WithdrawalRecord");
    if (typeof amountMinor !== "bigint") throw new TypeError("amountMinor must be a BigInt");
    if (amountMinor <= 0n) throw new RangeError("amountMinor must be positive");
    if (!destinationAddress) throw new Error("destinationAddress required");

    this.withdrawalId = withdrawalId;
    this.userId = userId;
    this.amountMinor = amountMinor;
    this.currency = currency;
    this.network = network;
    this.destinationAddress = destinationAddress;
    this.state = WithdrawalState.REQUESTED;
    this.createdAt = new Date().toISOString();
    this.updatedAt = this.createdAt;
    this.lockTxId = null;
    this.completeTxId = null;
    this.broadcastTxHash = null;
    this.failureReason = null;
    this.actor = actor;
    this.transitions = [{ from: null, to: WithdrawalState.REQUESTED, at: this.createdAt }];
  }

  setLockTxId(txId) {
    this.lockTxId = txId;
    return this;
  }

  passRiskCheck() {
    if (this.state !== WithdrawalState.REQUESTED) {
      throw new Error(`Cannot transition from ${this.state} to RISK_CHECK`);
    }
    this._transition(WithdrawalState.RISK_CHECK);
    return this;
  }

  approve() {
    if (this.state !== WithdrawalState.RISK_CHECK) {
      throw new Error(`Cannot approve withdrawal in state ${this.state}. Must pass RISK_CHECK.`);
    }
    this._transition(WithdrawalState.APPROVED);
    return this;
  }

  process() {
    if (this.state !== WithdrawalState.APPROVED) {
      throw new Error(`Cannot process withdrawal in state ${this.state}. Must be APPROVED.`);
    }
    this._transition(WithdrawalState.PROCESSING);
    return this;
  }

  broadcast(txHash) {
    if (this.state !== WithdrawalState.PROCESSING) {
      throw new Error(`Cannot broadcast withdrawal in state ${this.state}. Must be PROCESSING.`);
    }
    this.broadcastTxHash = txHash;
    this._transition(WithdrawalState.BROADCAST);
    return this;
  }

  confirm() {
    if (this.state !== WithdrawalState.BROADCAST) {
      throw new Error(`Cannot confirm withdrawal in state ${this.state}. Must be BROADCAST.`);
    }
    this._transition(WithdrawalState.CONFIRMED);
    return this;
  }

  complete(completeTxId) {
    if (this.state !== WithdrawalState.CONFIRMED && this.state !== WithdrawalState.BROADCAST) {
      if (this.state === WithdrawalState.COMPLETED && this.completeTxId === completeTxId) {
        return this; // Idempotent
      }
      throw new Error(`Cannot complete withdrawal in state ${this.state}. Must be CONFIRMED or BROADCAST.`);
    }
    this.completeTxId = completeTxId;
    this._transition(WithdrawalState.COMPLETED);
    return this;
  }

  fail(reason) {
    if (this.state === WithdrawalState.COMPLETED) {
      throw new Error("Cannot fail an already COMPLETED withdrawal; use reverse()");
    }
    this.failureReason = reason;
    this._transition(WithdrawalState.FAILED);
    return this;
  }

  reverse(reason) {
    if (this.state !== WithdrawalState.COMPLETED && this.state !== WithdrawalState.CONFIRMED) {
      throw new Error(`Cannot reverse withdrawal in state: ${this.state}. Must be COMPLETED or CONFIRMED.`);
    }
    this.failureReason = reason;
    this._transition(WithdrawalState.REVERSED);
    return this;
  }

  _transition(nextState) {
    const prev = this.state;
    this.state = nextState;
    this.updatedAt = new Date().toISOString();
    this.transitions.push({ from: prev, to: nextState, at: this.updatedAt });
  }
}

/**
 * WalletLedger
 * Full double-entry immutable ledger engine with solvency invariants.
 */
export class WalletLedger {
  constructor({ asset = "USDT" } = {}) {
    this.asset = asset;
    // Map of accountId -> BigInt balance (natural units: user available is credit-normal)
    this.accounts = new Map();
    // Map of idempotencyKey -> Transaction
    this.idempotencyRegistry = new Map();
    // Array of immutable Transaction objects
    this.transactionLog = [];
    // Deposit state machine records
    this.deposits = new Map();
    // Withdrawal state machine records
    this.withdrawals = new Map();
  }

  _getAccount(key) {
    return this.accounts.get(key) ?? 0n;
  }

  _setAccount(key, balance) {
    this.accounts.set(key, balance);
  }

  openWallet(userId) {
    const availKey = `user:${userId}:available`;
    const lockKey = `user:${userId}:locked`;
    if (!this.accounts.has(availKey)) this.accounts.set(availKey, 0n);
    if (!this.accounts.has(lockKey)) this.accounts.set(lockKey, 0n);
    return { ok: true, userId };
  }

  getBalance(userId) {
    this.openWallet(userId);
    const available = this._getAccount(`user:${userId}:available`);
    const locked = this._getAccount(`user:${userId}:locked`);
    return {
      userId,
      available,
      locked,
      total: available + locked,
      currency: this.asset,
    };
  }

  /**
   * Posts an atomic, balanced set of double-entry ledger legs.
   * Legs format: [{ account: string, amount: string|bigint }]
   * Invariant: sum(amounts) === 0n
   */
  post({
    idempotencyKey,
    type,
    reference,
    legs,
    actor = "SYSTEM",
    metadata = {},
  }) {
    if (!idempotencyKey) throw new Error("idempotencyKey required for ledger post");
    if (this.idempotencyRegistry.has(idempotencyKey)) {
      return {
        ok: true,
        idempotent: true,
        transaction: this.idempotencyRegistry.get(idempotencyKey),
      };
    }

    if (!Array.isArray(legs) || legs.length < 2) {
      throw new Error("At least two legs required for double-entry post");
    }

    // 1. Verify double-entry zero-sum invariant
    let sum = 0n;
    const normalizedLegs = legs.map((leg) => {
      const amt = BigInt(leg.amount);
      sum += amt;
      return { account: leg.account, amount: amt };
    });

    if (sum !== 0n) {
      throw new Error(`DOUBLE_ENTRY_IMBALANCE: sum of legs must be 0, got ${sum}`);
    }

    // 2. Dry run balance updates to enforce solvency and non-negative constraints
    // For user:id:available, natural balance increases when amount is negative (credit-normal)
    // and decreases when amount is positive (debit).
    const staged = new Map(this.accounts);
    for (const leg of normalizedLegs) {
      const current = staged.get(leg.account) ?? 0n;
      // In Credit-Normal convention:
      // leg.amount < 0n means CREDIT (increases owed to user)
      // leg.amount > 0n means DEBIT (decreases owed to user)
      const next = current - leg.amount;
      if (leg.account.startsWith("user:") && leg.account.endsWith(":available")) {
        if (next < 0n) {
          throw new Error(`INSUFFICIENT_FUNDS: account ${leg.account} cannot overdraft (balance: ${current}, requested deduction: ${leg.amount})`);
        }
      }
      if (leg.account.startsWith("user:") && leg.account.endsWith(":locked")) {
        if (next < 0n) {
          throw new Error(`ESCROW_UNDERFLOW: locked account ${leg.account} cannot be negative (balance: ${current})`);
        }
      }
      staged.set(leg.account, next);
    }

    // 3. Commit staged balances
    this.accounts = staged;

    // 4. Record transaction in immutable ledger
    const txId = `tx_${randomUUID()}`;
    const primaryUserLeg = normalizedLegs.find((l) => l.account.startsWith("user:"));
    const userId = primaryUserLeg ? primaryUserLeg.account.split(":")[1] : "SYSTEM";
    const userAvail = this.getBalance(userId).available;
    const rawAmt = primaryUserLeg ? (primaryUserLeg.amount < 0n ? -primaryUserLeg.amount : primaryUserLeg.amount) : 0n;
    const direction = primaryUserLeg && primaryUserLeg.amount < 0n ? TransactionDirection.CREDIT : TransactionDirection.DEBIT;

    const tx = new Transaction({
      transactionId: txId,
      type,
      reference,
      amount: rawAmt > 0n ? rawAmt : 1n,
      currency: this.asset,
      direction,
      previousBalance: direction === TransactionDirection.CREDIT ? userAvail - rawAmt : userAvail + rawAmt,
      resultingBalance: userAvail,
      status: TransactionStatus.CONFIRMED,
      actor,
      idempotencyKey,
      metadata: { ...metadata, legs: normalizedLegs.map((l) => ({ account: l.account, amount: l.amount.toString() })) },
    });

    this.idempotencyRegistry.set(idempotencyKey, tx);
    this.transactionLog.push(tx);

    return {
      ok: true,
      idempotent: false,
      transaction: tx,
    };
  }

  /**
   * Process a complete Deposit lifecycle through the state machine.
   */
  processDepositFlow({
    depositId = `dep_${randomUUID()}`,
    userId,
    amountMinor,
    currency = "USDT",
    network = "TRON",
    txHash,
    confirmations = 20,
    idempotencyKey,
  }) {
    if (!idempotencyKey) throw new Error("idempotencyKey is required");

    let record = this.deposits.get(depositId);
    if (!record) {
      record = new DepositRecord({
        depositId,
        userId,
        amountMinor: BigInt(amountMinor),
        currency,
        network,
      });
      this.deposits.set(depositId, record);
    }

    if (record.state === DepositState.CREDITED) {
      return { ok: true, deposit: record, idempotent: true };
    }

    // Step 1: Detect
    record.detect(txHash);

    // Step 2: Confirm
    record.confirm(confirmations);

    // Step 3: Credit via immutable double-entry ledger post
    if (record.state === DepositState.CONFIRMED) {
      const legs = [
        { account: `platform:custody:${currency}:${network}`, amount: record.amountMinor.toString() },
        { account: `user:${userId}:available`, amount: (-record.amountMinor).toString() },
      ];

      const postResult = this.post({
        idempotencyKey,
        type: TransactionType.DEPOSIT,
        reference: `deposit:${network}:${txHash}`,
        legs,
        actor: "DEPOSIT_PROCESSOR",
        metadata: { depositId, txHash, network },
      });

      record.credit(postResult.transaction.transactionId);
    }

    return { ok: true, deposit: record };
  }

  /**
   * Process a complete Withdrawal lifecycle through the state machine.
   */
  initiateWithdrawal({
    withdrawalId = `wd_${randomUUID()}`,
    userId,
    amountMinor,
    currency = "USDT",
    network = "TRON",
    destinationAddress,
    idempotencyKey,
  }) {
    if (!idempotencyKey) throw new Error("idempotencyKey required for withdrawal");
    const amt = BigInt(amountMinor);

    // Check user balance first
    const bal = this.getBalance(userId);
    if (bal.available < amt) {
      throw new Error(`INSUFFICIENT_FUNDS: balance ${bal.available} < withdrawal ${amt}`);
    }

    const record = new WithdrawalRecord({
      withdrawalId,
      userId,
      amountMinor: amt,
      currency,
      network,
      destinationAddress,
    });
    this.withdrawals.set(withdrawalId, record);

    // Step 1: Lock funds immediately (moves available -> locked)
    const lockLegs = [
      { account: `user:${userId}:available`, amount: amt.toString() },
      { account: `user:${userId}:locked`, amount: (-amt).toString() },
    ];

    const lockPost = this.post({
      idempotencyKey: `wd:lock:${idempotencyKey}`,
      type: TransactionType.ESCROW_LOCK,
      reference: `withdrawal:${withdrawalId}:lock`,
      legs: lockLegs,
      actor: "WITHDRAWAL_SERVICE",
      metadata: { withdrawalId, destinationAddress },
    });

    record.setLockTxId(lockPost.transaction.transactionId);
    return { ok: true, withdrawal: record };
  }

  advanceWithdrawalToCompleted({
    withdrawalId,
    broadcastTxHash,
    idempotencyKey,
  }) {
    const record = this.withdrawals.get(withdrawalId);
    if (!record) throw new Error(`Withdrawal not found: ${withdrawalId}`);

    // State machine progression:
    record.passRiskCheck();
    record.approve();
    record.process();
    record.broadcast(broadcastTxHash);
    record.confirm();

    // Release from locked to custody outflow
    const releaseLegs = [
      { account: `user:${record.userId}:locked`, amount: record.amountMinor.toString() },
      { account: `platform:custody:${record.currency}:${record.network}`, amount: (-record.amountMinor).toString() },
    ];

    const completePost = this.post({
      idempotencyKey: `wd:complete:${idempotencyKey}`,
      type: TransactionType.WITHDRAWAL,
      reference: `withdrawal:${withdrawalId}:complete`,
      legs: releaseLegs,
      actor: "PAYMENT_RAIL_BROADCAST",
      metadata: { withdrawalId, broadcastTxHash },
    });

    record.complete(completePost.transaction.transactionId);
    return { ok: true, withdrawal: record };
  }

  failWithdrawal({
    withdrawalId,
    reason,
    idempotencyKey,
  }) {
    const record = this.withdrawals.get(withdrawalId);
    if (!record) throw new Error(`Withdrawal not found: ${withdrawalId}`);

    // If locked funds exist, refund locked -> available
    if (record.lockTxId && record.state !== WithdrawalState.COMPLETED) {
      const refundLegs = [
        { account: `user:${record.userId}:locked`, amount: record.amountMinor.toString() },
        { account: `user:${record.userId}:available`, amount: (-record.amountMinor).toString() },
      ];

      this.post({
        idempotencyKey: `wd:refund:${idempotencyKey}`,
        type: TransactionType.REFUND,
        reference: `withdrawal:${withdrawalId}:refund`,
        legs: refundLegs,
        actor: "WITHDRAWAL_RISK_FAIL",
        metadata: { withdrawalId, reason },
      });
    }

    record.fail(reason);
    return { ok: true, withdrawal: record };
  }

  /**
   * Match Escrow Hold & Settlement directly on the ledger.
   */
  lockMatchEscrow({ matchId, seat0, seat1, stakeMinor, currency = "USDT" }) {
    const s = BigInt(stakeMinor);
    const key = `match:${matchId}:lock`;

    const legs = [
      { account: `user:${seat0}:available`, amount: s.toString() },
      { account: `user:${seat0}:locked`, amount: (-s).toString() },
      { account: `user:${seat1}:available`, amount: s.toString() },
      { account: `user:${seat1}:locked`, amount: (-s).toString() },
    ];

    return this.post({
      idempotencyKey: key,
      type: TransactionType.ESCROW_LOCK,
      reference: `match:${matchId}`,
      legs,
      actor: "MATCH_ESCROW",
      metadata: { matchId, seat0, seat1, stakeMinor: s.toString() },
    });
  }

  settleMatch({
    matchId,
    seat0,
    seat1,
    stakeMinor,
    result,
    feeConfig,
    winnerId = null,
  }) {
    const s = BigInt(stakeMinor);
    const key = `match:${matchId}:settle`;

    // 1. Draw or Abort -> 100% full refund
    if (result === "1/2-1/2" || result === "ABORT") {
      const legs = [
        { account: `user:${seat0}:locked`, amount: s.toString() },
        { account: `user:${seat0}:available`, amount: (-s).toString() },
        { account: `user:${seat1}:locked`, amount: s.toString() },
        { account: `user:${seat1}:available`, amount: (-s).toString() },
      ];

      return this.post({
        idempotencyKey: key,
        type: TransactionType.REFUND,
        reference: `match:${matchId}`,
        legs,
        actor: "SETTLEMENT_SERVICE",
        metadata: { matchId, result, drawRefund: true },
      });
    }

    // 2. Decisive win -> 88% winner, 12% rake
    const pot = s * 2n;
    const { feeMinor, winnerAmountMinor } = feeConfig.calculatePotDistribution(pot);
    const winner = winnerId ?? (result === "1-0" ? seat0 : seat1);
    const loser = winner === seat0 ? seat1 : seat0;

    const legs = [
      { account: `user:${loser}:locked`, amount: s.toString() },
      { account: `user:${winner}:locked`, amount: s.toString() },
      { account: `user:${winner}:available`, amount: (-winnerAmountMinor).toString() },
      { account: "platform:rake", amount: (-feeMinor).toString() },
    ];

    return this.post({
      idempotencyKey: key,
      type: TransactionType.SETTLEMENT_PAYOUT,
      reference: `match:${matchId}`,
      legs,
      actor: "SETTLEMENT_SERVICE",
      metadata: {
        matchId,
        winner,
        loser,
        potMinor: pot.toString(),
        feeMinor: feeMinor.toString(),
        winnerAmountMinor: winnerAmountMinor.toString(),
        feeConfigSnapshot: feeConfig.createSnapshot(),
      },
    });
  }
}
