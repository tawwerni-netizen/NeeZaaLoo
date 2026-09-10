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
import { useState } from "react";
import { Button } from "@/components/Button";
import { useI18n } from "@/lib/i18n/context";
import type { GamePlugin } from "@/lib/games";
import styles from "./StakeSelect.module.css";

export const STAKE_PRESETS_USD = [2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000] as const;
const USDT_MINOR = 1_000_000n;

export type StakeChoice = { tier: "FREE" } | { tier: "CASH"; stakeMinor: string };

export function StakeSelect({ plugin, onContinue }: {
  plugin: GamePlugin;
  onContinue: (choice: StakeChoice) => void;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<"FREE" | "CASH" | null>(plugin.cashEnabled ? null : "FREE");
  const [stakeUsd, setStakeUsd] = useState<number | null>(null);

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
      )}

      <Button
        variant="primary"
        disabled={selected === null || (selected === "CASH" && stakeUsd === null)}
        onClick={() => {
          if (selected === "FREE") onContinue({ tier: "FREE" });
          else if (selected === "CASH" && stakeUsd !== null) {
            onContinue({ tier: "CASH", stakeMinor: (BigInt(stakeUsd) * USDT_MINOR).toString() });
          }
        }}
      >
        {t("play.continue")}
      </Button>
    </div>
  );
}
