"use client";

/**
 * The coin a cash game is staked in. Each stablecoin the platform holds can
 * be staked on its own: a DAI stake is matched only against DAI stakes and
 * the winner is paid in DAI. Nothing is converted, so the balance shown is
 * the balance in THAT coin, never a total across coins.
 */
import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import styles from "./CoinPicker.module.css";

export const STAKE_ASSETS = ["USDT", "USDC", "DAI"] as const;
export type StakeAsset = (typeof STAKE_ASSETS)[number];

export type CoinBalances = Record<StakeAsset, number>;

const EMPTY: CoinBalances = { USDT: 0, USDC: 0, DAI: 0 };

/** Available balance per coin, in whole units. `null` until loaded. */
export function useCoinBalances(playerId: string | undefined): CoinBalances | null {
  const [balances, setBalances] = useState<CoinBalances | null>(null);
  useEffect(() => {
    if (!playerId) { setBalances(EMPTY); return; }
    let live = true;
    get<{ accounts: { key: string; balance: string; asset: string }[] }>(`/v1/players/${playerId}/wallet`)
      .then((res) => {
        const next: CoinBalances = { ...EMPTY };
        for (const a of res?.accounts ?? []) {
          if (!a.key.endsWith(":available")) continue;
          if ((STAKE_ASSETS as readonly string[]).includes(a.asset)) {
            next[a.asset as StakeAsset] = Number(a.balance) / 1_000_000;
          }
        }
        if (live) setBalances(next);
      })
      .catch(() => { if (live) setBalances(EMPTY); });
    return () => { live = false; };
  }, [playerId]);
  return balances;
}

/** The coin to preselect: the one the player holds most of, USDT on a tie. */
export function richestCoin(balances: CoinBalances | null): StakeAsset {
  if (!balances) return "USDT";
  return STAKE_ASSETS.reduce((best, c) => (balances[c] > balances[best] ? c : best), "USDT" as StakeAsset);
}

export function CoinPicker({ value, onChange, balances, label }: {
  value: StakeAsset;
  onChange: (asset: StakeAsset) => void;
  balances: CoinBalances | null;
  label: string;
}) {
  return (
    <div className={styles.wrap} role="radiogroup" aria-label={label}>
      <span className={styles.label}>{label}</span>
      <div className={styles.row}>
        {STAKE_ASSETS.map((coin) => (
          <button
            key={coin}
            type="button"
            role="radio"
            aria-checked={value === coin}
            className={`${styles.coin} ${value === coin ? styles.coinSelected : ""}`}
            onClick={() => onChange(coin)}
          >
            <span className={styles.code}>{coin}</span>
            <span className={styles.balance}>{balances ? balances[coin].toFixed(2) : "…"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
