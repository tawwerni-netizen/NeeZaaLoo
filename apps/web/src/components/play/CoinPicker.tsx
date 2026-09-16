"use client";

/**
 * Unified Stake Currency Component: USDT (Tether USD · 1:1 USD).
 * Restricts all real-money duels and matchmaking across the entire platform
 * to USDT exclusively, eliminating coin fragmentation and maximizing liquidity.
 */
import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import styles from "./CoinPicker.module.css";

export const STAKE_ASSETS = ["USDT"] as const;
export type StakeAsset = (typeof STAKE_ASSETS)[number];

export type CoinBalances = Record<StakeAsset, number>;

const EMPTY: CoinBalances = { USDT: 0 };

/** Available balance for USDT in whole units. `null` until loaded. */
export function useCoinBalances(playerId: string | undefined): CoinBalances | null {
  const [balances, setBalances] = useState<CoinBalances | null>(null);
  useEffect(() => {
    if (!playerId) {
      setBalances(EMPTY);
      return;
    }
    let live = true;
    get<{ accounts: { key: string; balance: string; asset: string }[] }>(`/v1/players/${playerId}/wallet`)
      .then((res) => {
        const next: CoinBalances = { ...EMPTY };
        for (const a of res?.accounts ?? []) {
          if (!a.key.endsWith(":available")) continue;
          if (a.asset === "USDT") {
            next.USDT = Number(a.balance) / 1_000_000;
          }
        }
        if (live) setBalances(next);
      })
      .catch(() => {
        if (live) setBalances(EMPTY);
      });
    return () => {
      live = false;
    };
  }, [playerId]);
  return balances;
}

/** Unified asset helper: always returns USDT. */
export function richestCoin(_balances: CoinBalances | null): StakeAsset {
  return "USDT";
}

export function CoinPicker({
  value = "USDT",
  onChange,
  balances,
  label,
}: {
  value?: StakeAsset;
  onChange?: (asset: StakeAsset) => void;
  balances: CoinBalances | null;
  label?: string;
}) {
  return (
    <div className={styles.wrap} role="region" aria-label={label}>
      {label && <span className={styles.label}>{label}</span>}
      <div className={styles.unifiedCard}>
        <div className={styles.unifiedHeader}>
          <div className={styles.unifiedIdentity}>
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <circle cx="16" cy="16" r="16" fill="#26A17B" />
              <path
                d="M17.9 16.9v-1.3c2.4-.1 4.4-.8 4.4-1.8s-2-1.7-4.4-1.8V9.3h-3.8v2.7c-2.4.1-4.4.8-4.4 1.8s2 1.7 4.4 1.8v1.3c-3 .2-5.3 1-5.3 2.1s2.3 1.9 5.3 2.1v4.6h3.8v-4.6c3-.2 5.3-1 5.3-2.1s-2.3-1.9-5.3-2.1z"
                fill="#fff"
              />
            </svg>
            <div className={styles.nameGroup}>
              <span className={styles.code}>Tether (USDT)</span>
              <span className={styles.pegBadge}>1:1 USD</span>
            </div>
          </div>
          <div className={styles.balanceWrap}>
            <span className={styles.balanceLabel}>الرصيد المتاح:</span>
            <span className={`${styles.balanceVal} nz-num`}>
              {balances ? `${balances.USDT.toFixed(2)} USDT` : "…"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
