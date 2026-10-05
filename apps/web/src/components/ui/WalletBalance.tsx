"use client";

import React from "react";
import styles from "./WalletBalance.module.css";

export interface WalletBalanceProps {
  availableUsdt: number;
  inPlayUsdt?: number;
  practiceCoins?: number;
  networkName?: string;
  onDeposit?: () => void;
  onWithdraw?: () => void;
  className?: string;
}

export function WalletBalance({
  availableUsdt,
  inPlayUsdt = 0,
  practiceCoins = 1000,
  networkName = "TRON / USDT",
  onDeposit,
  onWithdraw,
  className,
}: WalletBalanceProps) {
  return (
    <div
      className={[styles.container, className].filter(Boolean).join(" ")}
      role="region"
      aria-label="Player Wallet Balance"
    >
      <div className={styles.header}>
        <span className={styles.label}>Available Balance</span>
        <span className={styles.networkBadge}>{networkName}</span>
      </div>

      <div className={styles.mainBalance}>
        <span className={styles.currencySymbol}>$</span>
        <span className={styles.amount}>{availableUsdt.toFixed(2)}</span>
        <span className={styles.currencyCode}>USDT</span>
      </div>

      <div className={styles.subBalances}>
        <div className={styles.subItem}>
          <span className={styles.subLabel}>In-Play / Escrow</span>
          <span className={styles.subAmount}>${inPlayUsdt.toFixed(2)} USDT</span>
        </div>
        <div className={styles.subItem}>
          <span className={styles.subLabel}>Practice Coins</span>
          <span className={styles.subAmount}>{practiceCoins.toLocaleString()} NZC</span>
        </div>
      </div>

      <div className={styles.actions}>
        {onDeposit && (
          <button
            type="button"
            className={styles.depositBtn}
            onClick={onDeposit}
          >
            + Deposit
          </button>
        )}
        {onWithdraw && (
          <button
            type="button"
            className={styles.withdrawBtn}
            onClick={onWithdraw}
          >
            Withdraw
          </button>
        )}
      </div>
    </div>
  );
}
