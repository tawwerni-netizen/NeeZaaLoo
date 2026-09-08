"use client";

/**
 * The result screen -- ONE component for every game, per the Nizalo Table
 * System spec's own rule: "the same four beats in every game." Nothing
 * here is chess-specific. `reason` keys resolve through the CLOSED,
 * CROSS-GAME vocabulary at game.reason.* (see i18n locales' own comment
 * on that set) -- RESIGNATION/TIMEOUT/DRAW_AGREED are shared by every
 * game, and a game's own rules-derived reasons (CHECKMATE, STALEMATE...)
 * are added to that SAME shared object, never a per-game duplicate.
 *
 * The loss screen deliberately gets no less care than the win screen:
 * same layout, same button weight, same EXP/rating disclosure. Per the
 * brand guidelines, a loss is information, not a wound.
 */
import { motion } from "framer-motion";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import { transition, useReducedMotion } from "@/lib/motion";
import type { ProgressionDelta } from "@/lib/use-progression-snapshot";
import styles from "./ResultCeremony.module.css";

type Props = {
  isSpectator: boolean;
  outcome: "win" | "loss" | "draw" | null;
  result: string | null;
  reason: string | null;
  vsComputer: boolean;
  duelId: string;
  delta: ProgressionDelta | null;
  onRematch: () => void;
  rematchBusy: boolean;
};

export function ResultCeremony({
  isSpectator, outcome, result, reason, vsComputer, duelId, delta, onRematch, rematchBusy,
}: Props) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();

  const titleKey = outcome === "win" ? "game.result_win" : outcome === "draw" ? "game.result_draw" : "game.result_loss";

  return (
    <div className={styles.card}>
      <motion.h1
        className={styles.title}
        initial={reduceMotion ? {} : { opacity: 0, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={transition.surface}
      >
        {isSpectator ? `${result} · ${reason ? t(`game.reason.${reason}`) : ""}` : t(titleKey)}
      </motion.h1>
      {!isSpectator && reason && <p className={styles.reason}>{t(`game.reason.${reason}`)}</p>}

      {!isSpectator && delta && delta.newAchievements.length > 0 && (
        <motion.div
          className={`${styles.achievements} nz-earned-foil`}
          initial={reduceMotion ? {} : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={transition.ceremonyLong}
        >
          {delta.newAchievements.map((code) => (
            <div key={code} className={styles.achievement}>
              <span className={`${styles.achievementTitle} nz-earned`}>{t(`game.achievement.${code}.title`)}</span>
              <span className={styles.achievementDescription}>{t(`game.achievement.${code}.description`)}</span>
            </div>
          ))}
        </motion.div>
      )}

      {!isSpectator && delta && (
        <motion.div
          className={styles.delta}
          initial={reduceMotion ? {} : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transition.ceremony}
        >
          {delta.expGained > 0 && (
            <span className={styles.deltaItem}>{t("game.exp_gained", { amount: delta.expGained })}</span>
          )}
          {delta.ratingBefore !== null && delta.ratingAfter !== null && delta.ratingAfter !== delta.ratingBefore && (
            <span className={`nz-num ${styles.deltaItem}`}>
              {t(delta.ratingAfter >= delta.ratingBefore ? "game.rating_change_up" : "game.rating_change_down", {
                amount: Math.round(delta.ratingAfter - delta.ratingBefore),
              })}
            </span>
          )}
          {delta.levelAfter > delta.levelBefore && (
            <span className={styles.deltaItem}>{t("game.level_up", { level: delta.levelAfter })}</span>
          )}
        </motion.div>
      )}

      {!isSpectator && (
        <div className={styles.actions}>
          {vsComputer ? (
            <Button variant="primary" onClick={onRematch} disabled={rematchBusy}>{t("game.rematch")}</Button>
          ) : (
            <LocaleLink href="/play"><Button variant="primary">{t("game.new_opponent")}</Button></LocaleLink>
          )}
          <LocaleLink href={`/support/new?category=MATCH_PROBLEM&referenceId=${encodeURIComponent(duelId)}`}>
            <Button variant="ghost">{t("support.game_report_cta")}</Button>
          </LocaleLink>
        </div>
      )}
    </div>
  );
}
