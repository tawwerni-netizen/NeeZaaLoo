"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/lib/i18n/context";
import { ease, useReducedMotion } from "@/lib/motion";
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
  }, [count, stepMs, goHoldMs, onComplete]);

  return (
    <div className={styles.container}>
      <AnimatePresence mode="wait">
        <motion.div
          key={`count-${count}`}
          initial={reduceMotion ? {} : { opacity: 0, scale: 0.5, rotateX: 30 }}
          animate={{ opacity: 1, scale: 1, rotateX: 0 }}
          exit={reduceMotion ? {} : { opacity: 0, scale: 1.4, filter: "blur(4px)" }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: ease.snap }}
          className={[styles.countdown, count === 0 ? styles.goText : ""].join(" ")}
          aria-live="assertive"
        >
          {/* Energy Ring Behind Number */}
          {!reduceMotion && <span className={styles.energyRing} aria-hidden="true" />}
          <span className={styles.numberText}>{count === 0 ? t("matchmaking.go") : count}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
