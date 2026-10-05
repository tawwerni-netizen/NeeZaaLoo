"use client";

import React, { useMemo } from "react";
import styles from "./StakeSelector.module.css";

export interface StakeOption {
  tier: "FREE" | "CASH";
  amountMinor: number; // in micro-units or minor (1_000_000 = $1)
  displayLabel: string;
}

export const DEFAULT_STAKE_OPTIONS: StakeOption[] = [
  { tier: "FREE", amountMinor: 0, displayLabel: "Free Practice" },
  { tier: "CASH", amountMinor: 1_000_000, displayLabel: "$1.00" },
  { tier: "CASH", amountMinor: 5_000_000, displayLabel: "$5.00" },
  { tier: "CASH", amountMinor: 10_000_000, displayLabel: "$10.00" },
  { tier: "CASH", amountMinor: 25_000_000, displayLabel: "$25.00" },
  { tier: "CASH", amountMinor: 50_000_000, displayLabel: "$50.00" },
];

export interface StakeSelectorProps {
  options?: StakeOption[];
  selectedStake: StakeOption;
  onSelectStake: (option: StakeOption) => void;
  userBalanceUsdt?: number;
  onOpenDeposit?: () => void;
  className?: string;
}

export function StakeSelector({
  options = DEFAULT_STAKE_OPTIONS,
  selectedStake,
  onSelectStake,
  userBalanceUsdt = 0,
  onOpenDeposit,
  className,
}: StakeSelectorProps) {
  const isCash = selectedStake.tier === "CASH";
  const stakeUsdt = selectedStake.amountMinor / 1_000_000;

  const { totalPot, platformFee, netPrize } = useMemo(() => {
    if (!isCash || stakeUsdt <= 0) {
      return { totalPot: 0, platformFee: 0, netPrize: 0 };
    }
    const pot = stakeUsdt * 2;
    const fee = pot * 0.12; // 12% rake
    const prize = pot - fee;
    return { totalPot: pot, platformFee: fee, netPrize: prize };
  }, [isCash, stakeUsdt]);

  const hasInsufficientBalance = isCash && userBalanceUsdt < stakeUsdt;

  return (
    <div className={[styles.container, className].filter(Boolean).join(" ")}>
      <div className={styles.header}>
        <h3 className={styles.title}>Select Match Stake</h3>
        <div className={styles.balanceBadge} title="Available Balance">
          <span>Wallet:</span>
          <strong>${userBalanceUsdt.toFixed(2)} USDT</strong>
        </div>
      </div>

      <div className={styles.grid}>
        {options.map((opt) => {
          const isSelected =
            opt.tier === selectedStake.tier &&
            opt.amountMinor === selectedStake.amountMinor;

          return (
            <button
              key={`${opt.tier}-${opt.amountMinor}`}
              type="button"
              className={[
                styles.stakeBtn,
                isSelected ? styles.stakeBtnActive : "",
              ].join(" ")}
              onClick={() => onSelectStake(opt)}
            >
              <span className={styles.stakeAmount}>{opt.displayLabel}</span>
              <span className={styles.stakeLabel}>
                {opt.tier === "FREE" ? "No Risk" : "USDT"}
              </span>
            </button>
          );
        })}
      </div>

      {isCash && (
        <div className={styles.breakdownBox}>
          <div className={styles.breakdownRow}>
            <span>Entry Stake (x2 Players):</span>
            <span className={styles.breakdownValue}>${totalPot.toFixed(2)} USDT</span>
          </div>
          <div className={styles.breakdownRow}>
            <span>Platform Fee (12% Rake):</span>
            <span className={styles.breakdownValue}>-${platformFee.toFixed(2)} USDT</span>
          </div>
          <div className={[styles.breakdownRow, styles.prizeRow].join(" ")}>
            <span>Winner Takes:</span>
            <span className={styles.prizeValue}>${netPrize.toFixed(2)} USDT</span>
          </div>
        </div>
      )}

      {hasInsufficientBalance && (
        <div className={styles.insufficientAlert} role="alert">
          <span>Insufficient balance for this stake.</span>
          {onOpenDeposit && (
            <button
              type="button"
              className={styles.depositLink}
              onClick={onOpenDeposit}
            >
              Deposit Funds
            </button>
          )}
        </div>
      )}
    </div>
  );
}
