"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth-context";
import { transition, useReducedMotion } from "@/lib/motion";
import type { ProgressionDelta } from "@/lib/use-progression-snapshot";
import { MatchShareCard } from "./MatchShareCard";
import styles from "./ResultCeremony.module.css";

type Props = {
  isSpectator: boolean;
  outcome: "win" | "loss" | "draw" | null;
  result: string | null;
  reason: string | null;
  vsComputer: boolean;
  duelId: string;
  gameId?: string;
  delta: ProgressionDelta | null;
  onRematch: () => void;
  rematchBusy: boolean;
};

export function ResultCeremony({
  isSpectator, outcome, result, reason, vsComputer, duelId, gameId = "game", delta, onRematch, rematchBusy,
}: Props) {
  const { t, locale } = useI18n();
  const { player } = useAuth();
  const reduceMotion = useReducedMotion();
  const [gemCount, setGemCount] = useState(0);

  const titleKey = outcome === "win" ? "game.result_win" : outcome === "draw" ? "game.result_draw" : "game.result_loss";
  const isGuest = player?.handle?.startsWith("Guest_");

  useEffect(() => {
    if (outcome === "win" && !isSpectator) {
      // Trigger epic confetti
      const duration = 3000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 5,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ['#22c55e', '#fbbf24', '#3b82f6']
        });
        confetti({
          particleCount: 5,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ['#22c55e', '#fbbf24', '#3b82f6']
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      frame();

      // Tick up simulated Gems if applicable
      // In a real scenario, delta would contain gem won amounts
      let current = 0;
      const target = 15; // Example +15 N-Gems won
      const interval = setInterval(() => {
        current += 1;
        setGemCount(current);
        if (current >= target) clearInterval(interval);
      }, 50);
      return () => clearInterval(interval);
    }
  }, [outcome, isSpectator]);

  return (
    <div className={[styles.card, outcome ? styles[`outcome-${outcome}`] : ""].join(" ")}>
      {/* Victory Laurel Wreath for WIN */}
      {!isSpectator && outcome === "win" && (
        <motion.div
          className={styles.insigniaWrap}
          initial={reduceMotion ? {} : { scale: 0.4, rotate: -15, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={transition.ceremonyLong}
        >
          <svg viewBox="0 0 100 100" className={styles.laurelSvg} aria-hidden="true">
            <defs>
              <linearGradient id="gold-leaf-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFF2B2" />
                <stop offset="40%" stopColor="#E5C158" />
                <stop offset="85%" stopColor="#A68326" />
                <stop offset="100%" stopColor="#6E5212" />
              </linearGradient>
            </defs>
            <path d="M 22 68 C 12 50, 16 30, 32 18 C 30 26, 32 34, 38 40 C 30 46, 26 56, 28 66 Z" fill="url(#gold-leaf-grad)" />
            <path d="M 78 68 C 88 50, 84 30, 68 18 C 70 26, 68 34, 62 40 C 70 46, 74 56, 72 66 Z" fill="url(#gold-leaf-grad)" />
            <polygon points="50,26 56,42 74,42 60,53 65,70 50,59 35,70 40,53 26,42 44,42" fill="url(#gold-leaf-grad)" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))" />
          </svg>
        </motion.div>
      )}

      <motion.h1
        className={styles.title}
        initial={reduceMotion ? {} : { opacity: 0, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={transition.surface}
        style={{
          textShadow: outcome === "win" ? "0 0 20px rgba(34,197,94,0.5)" : "none"
        }}
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

      {!isSpectator && (delta || outcome === "win") && (
        <motion.div
          className={styles.delta}
          initial={reduceMotion ? {} : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transition.ceremony}
        >
          {outcome === "win" && gemCount > 0 && (
             <span className={styles.gemDeltaItem}>
               +{gemCount} 💎
             </span>
          )}
          {delta && delta.expGained > 0 && (
            <span className={styles.deltaItem}>+{delta.expGained} EXP</span>
          )}
          {delta && delta.ratingBefore !== null && delta.ratingAfter !== null && delta.ratingAfter !== delta.ratingBefore && (
            <span className={`nz-num ${styles.deltaItem} ${delta.ratingAfter >= delta.ratingBefore ? styles.ratingUp : styles.ratingDown}`}>
              {t(delta.ratingAfter >= delta.ratingBefore ? "game.rating_change_up" : "game.rating_change_down", {
                amount: Math.round(delta.ratingAfter - delta.ratingBefore),
              })}
            </span>
          )}
          {delta && delta.levelAfter > delta.levelBefore && (
            <span className={`${styles.deltaItem} ${styles.levelUpBadge}`}>{t("game.level_up", { level: delta.levelAfter })}</span>
          )}
        </motion.div>
      )}

      {/* Guest Conversion CTA */}
      {!isSpectator && isGuest && outcome === "win" && (
        <motion.div 
          className={styles.guestConversionCard}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
        >
          <div className={styles.guestConversionIcon}>🎁</div>
          <h3 className={styles.guestConversionTitle}>{locale === "ar" ? "لقد فزت بجواهر!" : "You won Gems!"}</h3>
          <p className={styles.guestConversionDesc}>
            {locale === "ar" 
              ? "لا تفقد تقدمك وجوائزك. احفظ حسابك الآن بضغطة واحدة لاستلامها." 
              : "Don't lose your progress and rewards. Save your account now with one click to claim them."}
          </p>
          <LocaleLink href="/login" style={{ width: "100%", textDecoration: "none" }}>
            <Button variant="primary" className={styles.guestConversionBtn}>
              {locale === "ar" ? "احفظ الحساب لاستلام الجوائز" : "Save Account to Claim"}
            </Button>
          </LocaleLink>
        </motion.div>
      )}

      {!isSpectator && (
        <>
          <div className={styles.actions}>
            {vsComputer ? (
              <>
                <Button variant="primary" onClick={onRematch} disabled={rematchBusy} className={styles.actionBtn}>{t("game.rematch")}</Button>
                <LocaleLink href="/play" style={{ width: "100%" }}>
                  <Button variant="secondary" className={styles.actionBtn}>{t("matchmaking.back_to_play")}</Button>
                </LocaleLink>
              </>
            ) : (
              <>
                <LocaleLink href="/play" style={{ width: "100%" }}>
                  <Button variant="primary" className={styles.actionBtn}>{t("game.new_opponent")}</Button>
                </LocaleLink>
                <LocaleLink href="/play" style={{ width: "100%" }}>
                  <Button variant="secondary" className={styles.actionBtn}>{t("matchmaking.back_to_play")}</Button>
                </LocaleLink>
              </>
            )}
            <LocaleLink href={`/support/new?category=MATCH_PROBLEM&referenceId=${encodeURIComponent(duelId)}`} style={{ width: "100%" }}>
              <Button variant="ghost" className={styles.actionBtn}>{t("support.game_report_cta")}</Button>
            </LocaleLink>
          </div>

          <MatchShareCard
            gameId={gameId}
            outcome={outcome}
            result={result}
            duelId={duelId}
            delta={delta}
            playerHandle={player?.handle}
          />
        </>
      )}
    </div>
  );
}
