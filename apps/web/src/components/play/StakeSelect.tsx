"use client";

/**
 * Free or Competitive -- the same choice for both PLAY WITH FRIEND and
 * RANDOM OPPONENT (never offered to VS_COMPUTER at all: see this repo's own
 * PlayGamePage routing, which never mounts this component on that path --
 * a computer opponent must never be presented as a real-money opponent).
 *
 * Reads plugin.cashEnabled to decide whether Competitive is even offered;
 * no game sets this true today (a deliberate, separate business decision --
 * see packages/payments' own header on why the platform is not yet
 * licensed for real-money play), so every game currently renders "Free
 * only". The preset ladder itself is real and complete: the moment a game
 * flips cashEnabled, this is the actual picker, not a stub waiting to be
 * built.
 *
 * The stake presets are the ONE canonical list (packages/matchmaking/src/
 * stakes.mjs's own JS values, mirrored here as the same ten dollar
 * amounts) -- "the UI must never allow an invalid value" is a button list,
 * not a free-text field, and "the backend must revalidate everything" is
 * matchmaking.mjs/challenge.mjs both calling isValidStakeMinor() before
 * any of this ever reaches a ticket or a challenge row.
 */
import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/Button";
import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth-context";
import { CoinPicker, useCoinBalances, richestCoin, type StakeAsset } from "./CoinPicker";
import type { GamePlugin } from "@/lib/games";
import styles from "./StakeSelect.module.css";

export const STAKE_PRESETS_USD = [2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000] as const;
const USDT_MINOR = 1_000_000n;

export type StakeChoice = { tier: "FREE" } | { tier: "CASH"; stakeMinor: string; asset: StakeAsset };

export function StakeSelect({ plugin, onContinue }: {
  plugin: GamePlugin;
  onContinue: (choice: StakeChoice) => void;
}) {
  const { t, locale, dir } = useI18n();
  const isRtl = dir === "rtl";
  const { player } = useAuth();
  const [selected, setSelected] = useState<"FREE" | "CASH" | null>(plugin.cashEnabled ? null : "FREE");
  const [stakeUsd, setStakeUsd] = useState<number | null>(null);
  const balances = useCoinBalances(player?.id);
  const [asset, setAsset] = useState<StakeAsset>("USDT");
  const [assetTouched, setAssetTouched] = useState(false);
  // Preselect the coin the player actually holds, until they pick one.
  useEffect(() => {
    if (!assetTouched && balances) setAsset(richestCoin(balances));
  }, [balances, assetTouched]);
  const userBalanceUSDT = balances ? balances[asset] : null;

  const hasInsufficientBalance = selected === "CASH" && stakeUsd !== null && (userBalanceUSDT !== null && userBalanceUSDT < stakeUsd);

  if (!plugin.cashEnabled) {
    return (
      <div>
        <h1 className={styles.heading}>{t("play.stake.heading")}</h1>
        <div className={styles.card}>
          <span className={styles.freeLabel}>{t("play.stake.free_only")}</span>
          <p className={styles.note}>{t("play.stake.free_only_note")}</p>
        </div>
        <Button variant="primary" onClick={() => onContinue({ tier: "FREE" })}>{t("play.continue")}</Button>
      </div>
    );
  }

  return (
    <div>
      <h1 className={styles.heading}>{t("play.stake.heading")}</h1>

      <div className={styles.tierGrid}>
        <button
          type="button"
          className={`${styles.tierCard} ${selected === "FREE" ? styles.tierCardSelected : ""}`}
          onClick={() => { setSelected("FREE"); setStakeUsd(null); }}
        >
          <span className={styles.tierTitle}>{t("play.stake.free_title")}</span>
          <span className={styles.tierDescription}>{t("play.stake.free_description")}</span>
        </button>
        <button
          type="button"
          className={`${styles.tierCard} ${selected === "CASH" ? styles.tierCardSelected : ""}`}
          onClick={() => setSelected("CASH")}
        >
          <span className={styles.tierTitle}>{t("play.stake.competitive_title")}</span>
          <span className={styles.tierDescription}>{t("play.stake.competitive_description")}</span>
        </button>
      </div>

      {selected === "CASH" && (
        <>
          <CoinPicker
            value={asset}
            onChange={(c) => { setAsset(c); setAssetTouched(true); }}
            balances={balances}
            label={isRtl ? "عملة النزال الرسمية المعتمدة:" : "Approved Official Match Currency:"}
          />
          <div className={styles.presetGrid}>
            {STAKE_PRESETS_USD.map((usd) => (
              <button
                key={usd}
                type="button"
                className={`${styles.presetButton} ${stakeUsd === usd ? styles.presetButtonSelected : ""}`}
                onClick={() => setStakeUsd(usd)}
              >
                ${usd}
              </button>
            ))}
          </div>

          {userBalanceUSDT !== null && (
            <div className={styles.balanceStatusRow}>
              <span className={styles.balanceLabel}>
                {isRtl ? "رصيدك المتاح حالياً:" : "Current Available Balance:"}
              </span>
              <span className={userBalanceUSDT >= (stakeUsd ?? 0) ? styles.balanceValueOk : styles.balanceValueLow}>
                ${userBalanceUSDT.toFixed(2)} {asset}
              </span>
            </div>
          )}

          {hasInsufficientBalance && (
            <div className={styles.insufficientBanner}>
              <div className={styles.insufficientBannerHeader}>
                <span className={styles.warningIcon}>⚠️</span>
                <strong>
                  {isRtl ? "رصيد المحفظة غير كافٍ لدخول هذا النزال" : "Insufficient Wallet Balance"}
                </strong>
              </div>
              <p className={styles.insufficientBannerDesc}>
                {isRtl
                  ? `النزال يتطلب رصيد $${stakeUsd} ${asset} بينما رصيدك الحالي $${userBalanceUSDT?.toFixed(2) || "0.00"} ${asset}. يرجى شحن محفظتك للمتابعة أو اختيار اللعب المجاني.`
                  : `This match requires $${stakeUsd} ${asset} but your balance is $${userBalanceUSDT?.toFixed(2) || "0.00"} ${asset}. Please deposit to your wallet or switch to Free play.`}
              </p>
              <div className={styles.insufficientActions}>
                <Link href={`/${locale}/wallet`} className={styles.depositCtaBtn}>
                  {isRtl ? "💳 إيداع فوري في المحفظة" : "💳 Instant Deposit"}
                </Link>
                <button
                  type="button"
                  className={styles.switchFreeBtn}
                  onClick={() => {
                    setSelected("FREE");
                    setStakeUsd(null);
                  }}
                >
                  {isRtl ? "التبديل إلى اللعب المجاني" : "Switch to Free"}
                </button>
              </div>
            </div>
          )}

          {stakeUsd !== null && (
            <div className={styles.economicsCard}>
              <div className={styles.economicsRow}>
                <span>{t("play.stake.entry_fee")}</span>
                <strong style={{ color: "#fff", direction: "ltr" }}>${stakeUsd.toFixed(2)} {asset}</strong>
              </div>
              <div className={styles.economicsRow}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>{t("play.stake.platform_fee")}</span>
                  <span className={styles.economicsBadge}>{t("play.stake.fixed_badge")}</span>
                </span>
                <span style={{ direction: "ltr" }}>-${(stakeUsd * 0.10).toFixed(2)} {asset}</span>
              </div>
              <div className={styles.economicsRow}>
                <span>{t("play.stake.net_prize_contrib")}</span>
                <span style={{ direction: "ltr" }}>${(stakeUsd * 0.90).toFixed(2)} {asset}</span>
              </div>
              <div className={styles.economicsTotal}>
                <span>{t("play.stake.winner_payout")}</span>
                <span style={{ direction: "ltr" }}>${(stakeUsd * 2 * 0.90).toFixed(2)} {asset}</span>
              </div>
            </div>
          )}
        </>
      )}

      <Button
        variant="primary"
        disabled={selected === null || (selected === "CASH" && (stakeUsd === null || hasInsufficientBalance))}
        onClick={() => {
          if (selected === "FREE") onContinue({ tier: "FREE" });
          else if (selected === "CASH" && stakeUsd !== null && !hasInsufficientBalance) {
            onContinue({ tier: "CASH", stakeMinor: (BigInt(stakeUsd) * USDT_MINOR).toString(), asset });
          }
        }}
      >
        {selected === "CASH" && hasInsufficientBalance
          ? (isRtl ? "الرصيد غير كافٍ" : "Insufficient Balance")
          : t("play.continue")}
      </Button>
    </div>
  );
}
