"use client";

/**
 * The Speed Math board -- structurally unlike every other board in this
 * launch: there is no grid, because there is no board. A SIMULTANEOUS
 * game has no "your turn" either -- `canMove` here just means "the duel
 * is live and you have a question to answer", and a submission never
 * waits for anything the opponent does.
 *
 * Server-authoritative, same discipline as every other board component:
 * the ONLY client state is the in-progress answer text and a transient
 * correct/incorrect flash -- and even that flash is DERIVED from numbers
 * the server already confirmed (the `you.correct`/`you.wrong` counters
 * project() returns), never asserted by the client itself. A submission
 * never moves anything locally; it only ever calls `onMove({answer})`,
 * sent as an ordinary INTENT, and the next question appears only once
 * the server's own view says so.
 *
 * RTL note: the equation itself is forced `dir="ltr"`, exactly like a
 * board's own geometry never mirrors -- "12 + 7" reads the same way in
 * every language this platform ships.
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/lib/i18n/context";
import { ease } from "@/lib/motion";
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
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const prevYou = useRef<You | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The flash is derived entirely from the server's own you.correct /
  // you.wrong counters advancing -- never from what the client itself
  // just sent, which the server might still refuse or which might not
  // even be this player's most recent answer once EVENT ordering is
  // accounted for.
  useEffect(() => {
    if (!you) return;
    const prev = prevYou.current;
    prevYou.current = you; // always advance, whether or not this tick flashes
    if (prev && you.answered > prev.answered) {
      setFeedback(you.correct > prev.correct ? "correct" : "incorrect");
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
      <div className={styles.scoreRow}>
        <div className={styles.scoreItem}>
          <span className={styles.scoreLabel}>{t("matchmaking.you")}</span>
          <span className={`nz-num ${styles.scoreValue}`}>{myScore ?? 0}</span>
        </div>
        <div className={styles.scoreDivider} aria-hidden="true" />
        <div className={styles.scoreItem}>
          <span className={styles.scoreLabel}>{t("matchmaking.opponent")}</span>
          <span className={`nz-num ${styles.scoreValue}`}>{opponentScore ?? 0}</span>
        </div>
      </div>

      <div className={[styles.card, feedback ? styles[feedback] : ""].join(" ")} dir="ltr">
        <AnimatePresence mode="wait">
          {current ? (
            <motion.div
              key={current.index}
              className={styles.equation}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.16, ease: ease.out }}
            >
              <span className={`nz-num ${styles.operand}`}>{current.a}</span>
              <span className={styles.operator}>{OP_GLYPH[current.op]}</span>
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
          />
          <button type="submit" className={styles.submitButton} disabled={!canMove || draft.trim() === ""}>
            {t("game.confirm")}
          </button>
        </form>
      </div>

      {you && (
        <p className={styles.progress}>{t("game.speed_math.answered")}: <span className="nz-num">{you.answered}</span></p>
      )}
    </div>
  );
}
