"use client";

/**
 * A generic N...2...1...GO countdown -- extracted from MatchmakingFlow so
 * any future "about to start" moment (a tournament round, a rematch
 * confirmation) gets the identical beat rather than a second
 * implementation. Owns only the count-then-call-back timing and its own
 * reveal animation; it has no opinion about what happens after.
 *
 * The count itself is real information, never motion-only: reduced-motion
 * users see the identical numbers on the identical one-second cadence,
 * just without the scale/opacity flourish (per docs/brand/
 * BRAND_GUIDELINES.md §6).
 */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/lib/i18n/context";
import { transition, ease, useReducedMotion } from "@/lib/motion";
import styles from "./Countdown.module.css";

export function Countdown({
  from = 3, stepMs = 800, goHoldMs = 500, onComplete,
}: {
  from?: number;
  stepMs?: number;
  goHoldMs?: number;
  onComplete: () => void;
}) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const [count, setCount] = useState(from);

  useEffect(() => {
    if (count > 0) {
      const timer = setTimeout(() => setCount((c) => c - 1), stepMs);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(onComplete, goHoldMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, stepMs, goHoldMs]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`count-${count}`}
        initial={reduceMotion ? {} : { opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={reduceMotion ? {} : { opacity: 0, scale: 1.15 }}
        transition={reduceMotion ? { duration: 0 } : { duration: transition.reward.duration, ease: ease.snap }}
        className={styles.countdown}
        aria-live="assertive"
      >
        {count === 0 ? t("matchmaking.go") : count}
      </motion.div>
    </AnimatePresence>
  );
}
