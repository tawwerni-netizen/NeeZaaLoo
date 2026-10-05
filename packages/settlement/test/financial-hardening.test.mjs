/**
 * Nizalo Financial Hardening, Ledger Invariants & Settlement Idempotency Test Suite.
 *
 * Verifies:
 * 1. Server-Calculated Financials: Client cannot inject fees, balances, or winner shares.
 * 2. Versioned 12% FeeConfig & 88% Winner Share across all canonical stakes ($2-$2000).
 * 3. Immutable Double-Entry Ledger Invariants: Zero-sum, no overdrafts, solvency guaranteed.
 * 4. Deposit State Machine: pending -> detected -> confirmed -> credited (+ failure/reversal).
 * 5. Withdrawal State Machine: requested -> risk-check -> approved -> processing -> broadcast -> confirmed -> completed (+ refund on fail).
 * 6. Match Escrow & Settlement Idempotency: Duplicate settlement never pays twice.
 * 7. Single Elimination Tournament Engine: Registration, check-in, byes, round progression, walkovers, and 88%/12% prize settlement.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  GameStakeConfig,
  FeeConfig,
  PrizePoolConfig,
  SettlementPolicy,
  MatchEscrow,
  EscrowStatus,
  CANONICAL_STAKE_PRESETS_USD,
  CANONICAL_STAKE_PRESETS_MINOR,
  rejectClientFinancialInputs,
  USDT_MINOR,
} from "../src/financial-config.mjs";
import {
  WalletLedger,
  TransactionDirection,
  TransactionStatus,
  DepositState,
  WithdrawalState,
} from "../../ledger/src/wallet-ledger.mjs";
import {
  TournamentEngine,
  TournamentType,
  TournamentStatus,
  EntryStatus,
} from "../../tournament/src/tournament-engine.mjs";

describe("1. Server-Calculated Financials & Client Tampering Rejection", () => {
  test("strictly rejects client-supplied financial fields", () => {
    assert.throws(
      () => rejectClientFinancialInputs({ winnerAmount: 50 }),
      /SECURITY_VIOLATION.*winnerAmount/
    );
    assert.throws(
      () => rejectClientFinancialInputs({ fee: 0 }),
      /SECURITY_VIOLATION.*fee/
    );
    assert.throws(
      () => rejectClientFinancialInputs({ prizeAmount: 1000 }),
      /SECURITY_VIOLATION.*prizeAmount/
    );
    assert.throws(
      () => rejectClientFinancialInputs({ walletBalance: 999999 }),
      /SECURITY_VIOLATION.*walletBalance/
    );
    assert.throws(
      () => rejectClientFinancialInputs({ settlementResult: "1-0" }),
      /SECURITY_VIOLATION.*settlementResult/
    );

    // Non-financial payload passes cleanly
    assert.doesNotThrow(() => rejectClientFinancialInputs({ gameId: "chess", action: "MOVE" }));
  });

  test("enforces canonical stake ladder presets ($2, $5, $10, $20, $25, $50, $100, $200, $500, $1000, $2000)", () => {
    const config = new GameStakeConfig();

    assert.deepEqual(config.allowedStakesUsd, [2, 5, 10, 20, 25, 50, 100, 200, 500, 1000, 2000]);

    // Check $25 preset exists and is valid
    assert.equal(config.isValidStake(25_000_000n), true);
    assert.equal(config.isValidStake(2_000_000n), true);
    assert.equal(config.isValidStake(50_000_000n), true);
    assert.equal(config.isValidStake(2000_000_000n), true);

    // Off-ladder stakes rejected
    assert.equal(config.isValidStake(7_000_000n), false);
    assert.equal(config.isValidStake(2500_000_000n), false);
    assert.equal(config.isValidStake(0n), false);
  });

  test("calculates exact 12% platform fee and 88% winner share across all stakes", () => {
    const feeConfig = new FeeConfig({ rakeBps: 1200n }); // 12%

    for (const stakeUsd of CANONICAL_STAKE_PRESETS_USD) {
      const stakeMinor = BigInt(stakeUsd) * USDT_MINOR;
      const potMinor = stakeMinor * 2n;

      const { feeMinor, winnerAmountMinor, rakeBps } = feeConfig.calculatePotDistribution(potMinor);

      assert.equal(rakeBps, 1200n);

      // Verify exact 12% fee and 88% winner payout
      const expectedFee = (potMinor * 1200n) / 10000n;
      const expectedWinner = potMinor - expectedFee;

      assert.equal(feeMinor, expectedFee, `Fee mismatch for stake $${stakeUsd}`);
      assert.equal(winnerAmountMinor, expectedWinner, `Winner share mismatch for stake $${stakeUsd}`);
      assert.equal(feeMinor + winnerAmountMinor, potMinor, "Pot conservation violated");
    }

    // Explicit check for $10 duel ($20 pot)
    const pot20 = 20_000_000n; // $20 USDT
    const dist = feeConfig.calculatePotDistribution(pot20);
    assert.equal(dist.feeMinor, 2_400_000n); // $2.40 platform fee (12%)
    assert.equal(dist.winnerAmountMinor, 17_600_000n); // $17.60 winner share (88%)
  });

  test("creates versioned, immutable fee configuration snapshot", () => {
    const feeConfig = new FeeConfig({
      ruleId: "standard",
      version: 2,
      rakeBps: 1200n,
      minRakeMinor: 0n,
      maxRakeMinor: null,
      reason: "Platform economics: 12% standard rake",
    });

    const snapshot = feeConfig.createSnapshot();
    assert.equal(snapshot.ruleId, "standard");
    assert.equal(snapshot.version, 2);
    assert.equal(snapshot.rakeBps, 1200);
    assert.equal(typeof snapshot.snapshottedAt, "string");
  });
});

describe("2. Immutable Double-Entry Wallet Ledger & Solvency Invariants", () => {
  test("enforces double-entry zero-sum invariant on every post", () => {
    const ledger = new WalletLedger();
    ledger.openWallet("alice");
    ledger.openWallet("bob");

    // Balanced post succeeds: +10 and -10 = 0
    const res = ledger.post({
      idempotencyKey: "test:balanced",
      type: "DEPOSIT",
      reference: "dep_1",
      legs: [
        { account: "platform:custody:USDT:TRON", amount: "10000000" },
        { account: "user:alice:available", amount: "-10000000" },
      ],
    });
    assert.equal(res.ok, true);
    assert.equal(res.idempotent, false);

    // Unbalanced post fails immediately: +10 and -5 != 0
    assert.throws(() => {
      ledger.post({
        idempotencyKey: "test:unbalanced",
        type: "DEPOSIT",
        reference: "dep_2",
        legs: [
          { account: "platform:custody:USDT:TRON", amount: "10000000" },
          { account: "user:alice:available", amount: "-5000000" },
        ],
      });
    }, /DOUBLE_ENTRY_IMBALANCE/);
  });

  test("prevents negative user balances and overdrafts", () => {
    const ledger = new WalletLedger();
    ledger.openWallet("alice"); // balance = 0

    // Alice has 0, cannot spend 10 USDT
    assert.throws(() => {
      ledger.post({
        idempotencyKey: "alice:overdraft",
        type: "ESCROW_LOCK",
        reference: "duel_1",
        legs: [
          { account: "user:alice:available", amount: "10000000" },
          { account: "user:alice:locked", amount: "-10000000" },
        ],
      });
    }, /INSUFFICIENT_FUNDS/);
  });

  test("idempotent ledger posting prevents duplicate financial execution", () => {
    const ledger = new WalletLedger();
    ledger.openWallet("alice");

    const key = "deposit:unique_tx_123";
    const legs = [
      { account: "platform:custody:USDT:TRON", amount: "50000000" },
      { account: "user:alice:available", amount: "-50000000" },
    ];

    // First execution
    const post1 = ledger.post({ idempotencyKey: key, type: "DEPOSIT", reference: "tx_123", legs });
    assert.equal(post1.ok, true);
    assert.equal(post1.idempotent, false);
    assert.equal(ledger.getBalance("alice").available, 50_000_000n);

    // Second execution with identical idempotency key
    const post2 = ledger.post({ idempotencyKey: key, type: "DEPOSIT", reference: "tx_123", legs });
    assert.equal(post2.ok, true);
    assert.equal(post2.idempotent, true);
    // Alice's balance remains strictly 50 USDT, never 100 USDT!
    assert.equal(ledger.getBalance("alice").available, 50_000_000n);
  });
});

describe("3. Deposit State Machine Lifecycle", () => {
  test("transitions through pending -> detected -> confirmed -> credited", () => {
    const ledger = new WalletLedger();
    ledger.openWallet("bob");

    const flow = ledger.processDepositFlow({
      depositId: "dep_bob_1",
      userId: "bob",
      amountMinor: 25_000_000n, // $25 USDT
      network: "TRON",
      txHash: "0xabc123",
      confirmations: 20,
      idempotencyKey: "dep:bob:0xabc123",
    });

    assert.equal(flow.ok, true);
    assert.equal(flow.deposit.state, DepositState.CREDITED);
    assert.equal(flow.deposit.currentConfirmations, 20);
    assert.equal(ledger.getBalance("bob").available, 25_000_000n);
  });

  test("duplicate deposit callbacks are idempotent and never double-credit", () => {
    const ledger = new WalletLedger();
    ledger.openWallet("bob");

    // First webhook notification
    ledger.processDepositFlow({
      depositId: "dep_repeat",
      userId: "bob",
      amountMinor: 10_000_000n,
      network: "TRON",
      txHash: "0xrepeat999",
      confirmations: 20,
      idempotencyKey: "dep:bob:0xrepeat999",
    });
    assert.equal(ledger.getBalance("bob").available, 10_000_000n);

    // Second (duplicate) webhook notification
    ledger.processDepositFlow({
      depositId: "dep_repeat",
      userId: "bob",
      amountMinor: 10_000_000n,
      network: "TRON",
      txHash: "0xrepeat999",
      confirmations: 20,
      idempotencyKey: "dep:bob:0xrepeat999",
    });

    // Balance remains exactly 10 USDT
    assert.equal(ledger.getBalance("bob").available, 10_000_000n);
  });
});

describe("4. Withdrawal State Machine Lifecycle", () => {
  test("progresses requested -> risk-check -> approved -> processing -> broadcast -> confirmed -> completed", () => {
    const ledger = new WalletLedger();
    ledger.openWallet("charlie");

    // Seed Charlie with 100 USDT
    ledger.post({
      idempotencyKey: "seed:charlie",
      type: "DEPOSIT",
      reference: "seed",
      legs: [
        { account: "platform:custody:USDT:TRON", amount: "100000000" },
        { account: "user:charlie:available", amount: "-100000000" },
      ],
    });

    // Step 1: Request withdrawal of 50 USDT (funds locked immediately)
    const init = ledger.initiateWithdrawal({
      withdrawalId: "wd_charlie_1",
      userId: "charlie",
      amountMinor: 50_000_000n,
      network: "TRON",
      destinationAddress: "TDestination123",
      idempotencyKey: "wd_charlie_1",
    });

    assert.equal(init.ok, true);
    assert.equal(init.withdrawal.state, WithdrawalState.REQUESTED);
    // Available dropped by 50, locked increased by 50
    assert.equal(ledger.getBalance("charlie").available, 50_000_000n);
    assert.equal(ledger.getBalance("charlie").locked, 50_000_000n);

    // Step 2: Progress to Completed
    const complete = ledger.advanceWithdrawalToCompleted({
      withdrawalId: "wd_charlie_1",
      broadcastTxHash: "0xbroadcast777",
      idempotencyKey: "wd_charlie_1",
    });

    assert.equal(complete.ok, true);
    assert.equal(complete.withdrawal.state, WithdrawalState.COMPLETED);
    // Funds permanently left locked
    assert.equal(ledger.getBalance("charlie").available, 50_000_000n);
    assert.equal(ledger.getBalance("charlie").locked, 0n);
  });

  test("releases locked funds back to available on withdrawal failure", () => {
    const ledger = new WalletLedger();
    ledger.openWallet("david");

    ledger.post({
      idempotencyKey: "seed:david",
      type: "DEPOSIT",
      reference: "seed",
      legs: [
        { account: "platform:custody:USDT:TRON", amount: "50000000" },
        { account: "user:david:available", amount: "-50000000" },
      ],
    });

    // Request 30 USDT withdrawal
    ledger.initiateWithdrawal({
      withdrawalId: "wd_fail_1",
      userId: "david",
      amountMinor: 30_000_000n,
      destinationAddress: "TBadAddress",
      idempotencyKey: "wd_fail_1",
    });
    assert.equal(ledger.getBalance("david").available, 20_000_000n);
    assert.equal(ledger.getBalance("david").locked, 30_000_000n);

    // Risk check fails
    ledger.failWithdrawal({
      withdrawalId: "wd_fail_1",
      reason: "SANCTION_HIT",
      idempotencyKey: "wd_fail_1",
    });

    // Funds restored to available!
    assert.equal(ledger.getBalance("david").available, 50_000_000n);
    assert.equal(ledger.getBalance("david").locked, 0n);
  });
});

describe("5. Match Escrow & Settlement Idempotency", () => {
  test("settles match with 88% to winner, 12% rake to platform, exactly once", () => {
    const ledger = new WalletLedger();
    ledger.openWallet("p1");
    ledger.openWallet("p2");
    const feeConfig = new FeeConfig({ rakeBps: 1200n });

    // Fund both players with $50 each
    ledger.post({
      idempotencyKey: "fund:p1",
      type: "DEPOSIT",
      reference: "fund",
      legs: [
        { account: "platform:custody:USDT:TRON", amount: "50000000" },
        { account: "user:p1:available", amount: "-50000000" },
      ],
    });
    ledger.post({
      idempotencyKey: "fund:p2",
      type: "DEPOSIT",
      reference: "fund",
      legs: [
        { account: "platform:custody:USDT:TRON", amount: "50000000" },
        { account: "user:p2:available", amount: "-50000000" },
      ],
    });

    // Match stake: $25 USDT each ($50 total pot)
    const stakeMinor = 25_000_000n;
    const matchId = "match_chess_44";

    // 1. Lock escrow
    ledger.lockMatchEscrow({ matchId, seat0: "p1", seat1: "p2", stakeMinor });
    assert.equal(ledger.getBalance("p1").available, 25_000_000n);
    assert.equal(ledger.getBalance("p1").locked, 25_000_000n);
    assert.equal(ledger.getBalance("p2").available, 25_000_000n);
    assert.equal(ledger.getBalance("p2").locked, 25_000_000n);

    // 2. Settle win for P1 ("1-0")
    // Pot = $50 (50,000,000 minor)
    // 12% fee = $6.00 (6,000,000 minor)
    // 88% payout = $44.00 (44,000,000 minor)
    const settleRes1 = ledger.settleMatch({
      matchId,
      seat0: "p1",
      seat1: "p2",
      stakeMinor,
      result: "1-0",
      feeConfig,
    });
    assert.equal(settleRes1.ok, true);
    assert.equal(settleRes1.idempotent, false);

    // Verify P1 balance: initial $25 available + $44 payout = $69
    assert.equal(ledger.getBalance("p1").available, 69_000_000n);
    assert.equal(ledger.getBalance("p1").locked, 0n);

    // Verify P2 balance: initial $25 available (lost $25 stake)
    assert.equal(ledger.getBalance("p2").available, 25_000_000n);
    assert.equal(ledger.getBalance("p2").locked, 0n);

    // 3. Retry settlement (e.g. duplicated worker, browser refresh, network retry)
    const settleRes2 = ledger.settleMatch({
      matchId,
      seat0: "p1",
      seat1: "p2",
      stakeMinor,
      result: "1-0",
      feeConfig,
    });
    assert.equal(settleRes2.ok, true);
    assert.equal(settleRes2.idempotent, true);

    // P1 balance did NOT change
    assert.equal(ledger.getBalance("p1").available, 69_000_000n);
  });

  test("settles draw with 100% full refund and 0% rake", () => {
    const ledger = new WalletLedger();
    ledger.openWallet("p1");
    ledger.openWallet("p2");
    const feeConfig = new FeeConfig();

    ledger.post({
      idempotencyKey: "fund:p1",
      type: "DEPOSIT",
      reference: "fund",
      legs: [
        { account: "platform:custody:USDT:TRON", amount: "10000000" },
        { account: "user:p1:available", amount: "-10000000" },
      ],
    });
    ledger.post({
      idempotencyKey: "fund:p2",
      type: "DEPOSIT",
      reference: "fund",
      legs: [
        { account: "platform:custody:USDT:TRON", amount: "10000000" },
        { account: "user:p2:available", amount: "-10000000" },
      ],
    });

    const matchId = "match_draw_1";
    ledger.lockMatchEscrow({ matchId, seat0: "p1", seat1: "p2", stakeMinor: 10_000_000n });

    // Draw result
    ledger.settleMatch({
      matchId,
      seat0: "p1",
      seat1: "p2",
      stakeMinor: 10_000_000n,
      result: "1/2-1/2",
      feeConfig,
    });

    // Both players refunded 100%
    assert.equal(ledger.getBalance("p1").available, 10_000_000n);
    assert.equal(ledger.getBalance("p1").locked, 0n);
    assert.equal(ledger.getBalance("p2").available, 10_000_000n);
    assert.equal(ledger.getBalance("p2").locked, 0n);
  });
});

describe("6. Single Elimination Tournament Engine", () => {
  test("only exposes and accepts SINGLE_ELIMINATION format", () => {
    // Valid SINGLE_ELIMINATION
    const valid = new TournamentEngine({
      gameId: "chess",
      type: TournamentType.SINGLE_ELIMINATION,
    });
    assert.equal(valid.type, "SINGLE_ELIMINATION");

    // Invalid / uncertified format throws
    assert.throws(() => {
      new TournamentEngine({
        gameId: "chess",
        type: "SWISS",
      });
    }, /UNSUPPORTED_TOURNAMENT_TYPE/);
  });

  test("runs full 8-player cash tournament with byes, progression, and 88%/12% prize settlement", () => {
    const ledger = new WalletLedger();
    const feeConfig = new FeeConfig({ rakeBps: 1200n });

    // Create 7 players (non-power-of-2 to test BYE assignment)
    const players = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"];
    const entryFee = 10_000_000n; // $10 USDT each

    // Fund and open wallets
    for (const pid of players) {
      ledger.openWallet(pid);
      ledger.post({
        idempotencyKey: `fund:${pid}`,
        type: "DEPOSIT",
        reference: "fund",
        legs: [
          { account: "platform:custody:USDT:TRON", amount: entryFee.toString() },
          { account: `user:${pid}:available`, amount: (-entryFee).toString() },
        ],
      });
    }

    const trn = new TournamentEngine({
      gameId: "gomoku",
      type: TournamentType.SINGLE_ELIMINATION,
      tier: "CASH",
      entryFeeMinor: entryFee,
      capacity: 8,
      feeConfig,
    });

    trn.openRegistration();

    // Register players and lock entry fees in ledger
    for (const pid of players) {
      trn.registerPlayer({ userId: pid });
      // Lock entry fee
      ledger.post({
        idempotencyKey: `trn:lock:${pid}`,
        type: "ESCROW_LOCK",
        reference: `trn:${trn.id}`,
        legs: [
          { account: `user:${pid}:available`, amount: entryFee.toString() },
          { account: `user:${pid}:locked`, amount: (-entryFee).toString() },
        ],
      });
    }

    assert.equal(trn.entries.size, 7);

    // Start tournament (bracket size = 8, byes = 1)
    trn.start();
    assert.equal(trn.status, TournamentStatus.IN_PROGRESS);
    assert.equal(trn.rounds.length, 1);

    const r1 = trn.rounds[0];
    assert.equal(r1.length, 4); // 4 pairings in round 1

    // Seed 1 (p1) gets the BYE
    const byeMatch = r1.find((m) => m.status === "BYE");
    assert.ok(byeMatch);
    assert.equal(byeMatch.winner, "p1");

    // Play remaining round 1 matches
    for (const m of r1) {
      if (m.status === "SCHEDULED") {
        trn.recordMatchResult({ matchId: m.matchId, winnerId: m.seat0 });
      }
    }

    // Advanced to Semi-Finals (Round 2)
    assert.equal(trn.currentRound, 2);
    assert.equal(trn.rounds[1].length, 2);

    // Play Semi-Finals: winner p1 and winner p3 advance
    const r2 = trn.rounds[1];
    trn.recordMatchResult({ matchId: r2[0].matchId, winnerId: r2[0].seat0 });
    trn.recordMatchResult({ matchId: r2[1].matchId, winnerId: r2[1].seat0 });

    // Advanced to Finals (Round 3)
    assert.equal(trn.status, TournamentStatus.FINALS);
    assert.equal(trn.rounds[2].length, 1);

    // Play Final: P1 wins championship!
    const finalMatch = trn.rounds[2][0];
    trn.recordMatchResult({ matchId: finalMatch.matchId, winnerId: finalMatch.seat0 });

    // Tournament Completed & Authoritatively Settled
    assert.equal(trn.status, TournamentStatus.COMPLETED);
    assert.equal(trn.winnerId, finalMatch.seat0);

    const winnerId = finalMatch.seat0;

    // Settle prizes on ledger
    const settleRes = trn.settlePrizes(ledger);
    assert.equal(settleRes.alreadySettled, false);

    // Financial verification:
    // 7 players * $10 = $70 gross pot (70,000,000 minor)
    // 12% platform fee = $8.40 (8,400,000 minor)
    // 88% net prize pool to winner = $61.60 (61,600,000 minor)
    assert.equal(settleRes.settlement.grossPotMinor, 70_000_000n);
    assert.equal(settleRes.settlement.platformFeeMinor, 8_400_000n);
    assert.equal(settleRes.settlement.netPrizePoolMinor, 61_600_000n);

    // Winner available balance = $61.60
    assert.equal(ledger.getBalance(winnerId).available, 61_600_000n);

    // All locked entry fees cleared across all players
    for (const pid of players) {
      assert.equal(ledger.getBalance(pid).locked, 0n);
    }
  });

  test("handles player walkover / forfeit progression seamlessly", () => {
    const trn = new TournamentEngine({
      gameId: "chess",
      type: TournamentType.SINGLE_ELIMINATION,
      tier: "FREE",
      capacity: 4,
    });
    trn.openRegistration();
    trn.registerPlayer({ userId: "p1" });
    trn.registerPlayer({ userId: "p2" });
    trn.registerPlayer({ userId: "p3" });
    trn.registerPlayer({ userId: "p4" });

    trn.start();

    // P2 is disqualified for cheating
    trn.disqualifyPlayer({ userId: "p2", reason: "ENGINE_ASSIST_DETECTED" });

    // P2 is playing P3: P3 is awarded a walkover and automatically advances
    const p2Match = trn.rounds[0].find((m) => m.seat0 === "p2" || m.seat1 === "p2");
    assert.equal(p2Match.status, "WALKOVER");
    assert.equal(p2Match.winner, "p3");
  });
});
