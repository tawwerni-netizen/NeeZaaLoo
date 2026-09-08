"use client";

/**
 * Reads plugin.cashEnabled -- never a gameId check -- to decide whether
 * there is anything to choose at all. No game registered today sets this
 * true (see chess.tsx's own cashEnabled:false comment), so the only real
 * path this renders is "Free only"; a future cash-eligible game would need
 * this step to grow a real stake-amount picker wired to the ledger, which
 * is deliberately NOT built here ahead of a game that needs it.
 */
import { Button } from "@/components/Button";
import { useI18n } from "@/lib/i18n/context";
import type { GamePlugin } from "@/lib/games";
import styles from "./StakeSelect.module.css";

export function StakeSelect({ plugin, onContinue }: {
  plugin: GamePlugin;
  onContinue: () => void;
}) {
  const { t } = useI18n();

  return (
    <div>
      <h1 className={styles.heading}>{t("play.stake.heading")}</h1>
      {!plugin.cashEnabled && (
        <div className={styles.card}>
          <span className={styles.freeLabel}>{t("play.stake.free_only")}</span>
          <p className={styles.note}>{t("play.stake.free_only_note")}</p>
        </div>
      )}
      <Button variant="primary" onClick={onContinue}>{t("play.continue")}</Button>
    </div>
  );
}
