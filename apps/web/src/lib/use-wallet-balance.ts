"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "./auth-context";
import { get } from "./api";
import { fromMinorUnits } from "./money";

export interface WalletBalanceSummary {
  totalUsd: number;
  availableUsd: number;
  lockedUsd: number;
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
}

export const BALANCE_REFRESH_EVENT = "nizalo:balance-refresh";

export function triggerBalanceRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(BALANCE_REFRESH_EVENT));
  }
}

type AccountRecord = { key: string; balance: string; asset: string };

export function useWalletBalance(): WalletBalanceSummary {
  const { player } = useAuth();
  const [totalUsd, setTotalUsd] = useState<number>(0);
  const [availableUsd, setAvailableUsd] = useState<number>(0);
  const [lockedUsd, setLockedUsd] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const isMountedRef = useRef(true);

  const fetchBalance = useCallback(async () => {
    if (!player?.id) {
      if (isMountedRef.current) {
        setTotalUsd(0);
        setAvailableUsd(0);
        setLockedUsd(0);
        setLoading(false);
      }
      return;
    }

    try {
      const res = await get<{ accounts?: AccountRecord[] }>(`/v1/players/${player.id}/wallet`);
      if (!isMountedRef.current) return;

      if (res?.accounts && Array.isArray(res.accounts)) {
        let availMinor = 0n;
        let lockMinor = 0n;
        // Play (matchmaking, challenges, tournaments) only ever stakes
        // USDT -- see CoinPicker.tsx and StakeSelect.tsx. "available to
        // play" must be scoped to USDT, or it overstates what a player
        // holding USDC/DAI can actually enter a match with.
        let availUsdtMinor = 0n;

        for (const a of res.accounts) {
          try {
            const bal = BigInt(a.balance || "0");
            if (a.key.endsWith(":available") || a.key.includes("available")) {
              availMinor += bal;
              if (a.asset === "USDT") availUsdtMinor += bal;
            } else if (a.key.endsWith(":locked") || a.key.includes("locked")) {
              lockMinor += bal;
            }
          } catch {
            // Ignore malformed bigints
          }
        }

        const avail = fromMinorUnits(availMinor.toString());
        const locked = fromMinorUnits(lockMinor.toString());

        setAvailableUsd(fromMinorUnits(availUsdtMinor.toString()));
        setLockedUsd(locked);
        // Total portfolio value across every coin the player holds --
        // USDC and DAI included, even though only USDT can be staked.
        setTotalUsd(avail + locked);
        setError(false);
      }
    } catch {
      if (isMountedRef.current) {
        setError(true);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [player?.id]);

  useEffect(() => {
    isMountedRef.current = true;
    void fetchBalance();

    // Auto-refresh every 15 seconds to catch incoming deposits or match settlements
    const interval = setInterval(() => {
      void fetchBalance();
    }, 15000);

    // Refresh when user returns to window tab
    const handleFocus = () => {
      void fetchBalance();
    };
    window.addEventListener("focus", handleFocus);

    // Refresh when other parts of the app emit balance-refresh
    const handleCustom = () => {
      void fetchBalance();
    };
    window.addEventListener(BALANCE_REFRESH_EVENT, handleCustom);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener(BALANCE_REFRESH_EVENT, handleCustom);
    };
  }, [fetchBalance]);

  return {
    totalUsd,
    availableUsd,
    lockedUsd,
    loading,
    error,
    refresh: fetchBalance,
  };
}
