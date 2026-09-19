"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/lib/i18n/context";
import { ease } from "@/lib/motion";
import { useVisualSettings } from "./TableEnvironment";
import { playSpeedMathCorrectSound, playSpeedMathWrongSound, playComboStreakSound } from "@/lib/game-audio";
import styles from "./SpeedMathBoard.module.css";

type Question = { a: number; b: number; op: "+" | "-" | "*" | "/"; index: number };
type You = { correct: number; wrong: number; answered: number };
type Scores = { correct: [number, number]; answered: [number, number]; total: number };

type Props = {
  scores: Scores;
  you: You | null;
  current: Question | null;
  mySeat: 0 | 1 | null;
  canMove: boolean;
  onMove: (intent: { answer: number }) => void;
};

const OP_GLYPH: Record<Question["op"], string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };

export function SpeedMathBoard({ scores, you, current, mySeat, canMove, onMove }: Props) {
  const { t } = useI18n();
  const { perspective3D } = useVisualSettings();
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [streak, setStreak] = useState(0);
  const prevYou = useRef<You | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!you) return;
    const prev = prevYou.current;
    prevYou.current = you;
    if (prev && you.answered > prev.answered) {
      const isCorrect = you.correct > prev.correct;
      setFeedback(isCorrect ? "correct" : "incorrect");
      if (isCorrect) {
        if (streak >= 1) {
          playComboStreakSound(streak + 1);
        } else {
          playSpeedMathCorrectSound();
        }
        setStreak((s) => s + 1);
      } else {
        playSpeedMathWrongSound();
        setStreak(0);
      }
      const timer = setTimeout(() => setFeedback(null), 550);
      return () => clearTimeout(timer);
    }
  }, [you]);

  useEffect(() => {
    setDraft("");
    if (canMove) inputRef.current?.focus();
  }, [current?.index, canMove]);

  function submit() {
    if (!canMove || draft.trim() === "") return;
    const answer = Number(draft);
    if (!Number.isFinite(answer)) return;
    onMove({ answer: Math.trunc(answer) });
    setDraft("");
  }

  const myScore = mySeat !== null ? scores.correct[mySeat] : null;
  const opponentSeat = mySeat === 0 ? 1 : mySeat === 1 ? 0 : null;
  const opponentScore = opponentSeat !== null ? scores.correct[opponentSeat] : null;

  return (
    <div className={styles.wrap}>
      {/* Telemetry Race HUD */}
      <div className={styles.telemetryHud}>
        <div className={[styles.scorePod, styles.podYou].join(" ")}>
          <span className={styles.podLabel}>{t("matchmaking.you")}</span>
          <span className={`nz-num ${styles.podValue}`}>{myScore ?? 0}</span>
          {streak > 1 && (
            <span className={styles.streakFlame}>🔥 {streak}x</span>
          )}
        </div>

        <div className={styles.vsDivider}>VS</div>

        <div className={[styles.scorePod, styles.podOpponent].join(" ")}>
          <span className={styles.podLabel}>{t("matchmaking.opponent")}</span>
          <span className={`nz-num ${styles.podValue}`}>{opponentScore ?? 0}</span>
        </div>
      </div>

      {/* 3D Floating Question Hologram Card */}
      <div className={[styles.cardContainer, perspective3D ? styles.perspective : ""].join(" ")}>
        <div className={[styles.hologramCard, feedback ? styles[feedback] : ""].join(" ")} dir="ltr">
          <div className={styles.hologramScanline} aria-hidden="true" />

          <AnimatePresence mode="wait">
            {current ? (
              <motion.div
                key={current.index}
                className={styles.equation}
                initial={{ opacity: 0, rotateX: 45, y: 15 }}
                animate={{ opacity: 1, rotateX: 0, y: 0 }}
                exit={{ opacity: 0, rotateX: -45, y: -15 }}
                transition={{ duration: 0.18, ease: ease.out }}
              >
                <span className={`nz-num ${styles.operand}`}>{current.a}</span>
                <span className={styles.operatorBadge}>{OP_GLYPH[current.op]}</span>
                <span className={`nz-num ${styles.operand}`}>{current.b}</span>
              </motion.div>
            ) : (
              <div className={styles.equation}>
                <span className={styles.waiting}>{t("game.connecting")}</span>
              </div>
            )}
          </AnimatePresence>

          <form
            className={styles.answerRow}
            onSubmit={(e) => { e.preventDefault(); submit(); }}
          >
            <input
              ref={inputRef}
              className={`nz-num ${styles.answerInput}`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={draft}
              disabled={!canMove}
              onChange={(e) => setDraft(e.target.value.replace(/[^0-9-]/g, ""))}
              aria-label={t("game.speed_math.answer_label")}
              placeholder="?"
            />
            <button
              type="submit"
              className={styles.submitButton}
              disabled={!canMove || draft.trim() === ""}
            >
              ↵
            </button>
          </form>
        </div>
      </div>

      {you && (
        <div className={styles.progressFooter}>
          <span>{t("game.speed_math.answered")}: <strong className="nz-num">{you.answered}</strong></span>
          <span className={styles.accuracyTag}>
            {you.answered > 0 ? `${Math.round((you.correct / you.answered) * 100)}% Acc` : "0% Acc"}
          </span>
        </div>
      )}
    </div>
  );
}
