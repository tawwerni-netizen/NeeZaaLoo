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

const SPEED_MATH_I18N: Record<
  string,
  {
    tied: string;
    p1Leading: (diff: number) => string;
    p2Leading: (diff: number) => string;
    player1: string;
    player2: string;
    answered: string;
    liveBadge: string;
    correct: string;
    acc: string;
    notice: string;
    submitBtn: string;
  }
> = {
  ar: {
    tied: "تعادل حماسي 🔥",
    p1Leading: (diff) => `اللاعب 1 متقدم (+${diff}) ⚡`,
    p2Leading: (diff) => `اللاعب 2 متقدم (+${diff}) ⚡`,
    player1: "اللاعب 1",
    player2: "اللاعب 2",
    answered: "سؤال",
    liveBadge: "بث مباشر • سباق الحساب السريع",
    correct: "صحيحة",
    acc: "دقة",
    notice: "🔒 الأسئلة مشفرة أثناء البث المباشر لمنع أي تسريب وضمان النزاهة التامة",
    submitBtn: "إرسال ↵",
  },
  en: {
    tied: "Tied Match 🔥",
    p1Leading: (diff) => `Player 1 leading (+${diff}) ⚡`,
    p2Leading: (diff) => `Player 2 leading (+${diff}) ⚡`,
    player1: "Player 1",
    player2: "Player 2",
    answered: "answered",
    liveBadge: "LIVE STREAM • Speed Math",
    correct: "correct",
    acc: "acc",
    notice: "🔒 Questions hidden during live stream to maintain competitive integrity",
    submitBtn: "Submit ↵",
  },
  es: {
    tied: "Empate emocionante 🔥",
    p1Leading: (diff) => `Jugador 1 lidera (+${diff}) ⚡`,
    p2Leading: (diff) => `Jugador 2 lidera (+${diff}) ⚡`,
    player1: "Jugador 1",
    player2: "Jugador 2",
    answered: "respondidas",
    liveBadge: "EN VIVO • Carrera de Cálculo Rápido",
    correct: "correctas",
    acc: "precisión",
    notice: "🔒 Preguntas ocultas durante la transmisión en vivo para garantizar la integridad",
    submitBtn: "Enviar ↵",
  },
  fr: {
    tied: "Égalité palpitante 🔥",
    p1Leading: (diff) => `Joueur 1 en tête (+${diff}) ⚡`,
    p2Leading: (diff) => `Joueur 2 en tête (+${diff}) ⚡`,
    player1: "Joueur 1",
    player2: "Joueur 2",
    answered: "répondues",
    liveBadge: "EN DIRECT • Course de Calcul Rapide",
    correct: "correctes",
    acc: "précision",
    notice: "🔒 Questions masquées pendant le direct pour garantir l'intégrité compétitive",
    submitBtn: "Valider ↵",
  },
  hi: {
    tied: "रोमांचक मुकाबला टाई 🔥",
    p1Leading: (diff) => `खिलाड़ी 1 आगे (+${diff}) ⚡`,
    p2Leading: (diff) => `खिलाड़ी 2 आगे (+${diff}) ⚡`,
    player1: "खिलाड़ी 1",
    player2: "खिलाड़ी 2",
    answered: "उत्तर दिए",
    liveBadge: "लाइव स्ट्रीम • स्पीड मैथ रेस",
    correct: "सही",
    acc: "सटीकता",
    notice: "🔒 निष्पक्षता बनाए रखने के लिए लाइव स्ट्रीम के दौरान प्रश्न छुपाए गए हैं",
    submitBtn: "दर्ज करें ↵",
  },
  zh: {
    tied: "激烈战平 🔥",
    p1Leading: (diff) => `玩家 1 领先 (+${diff}) ⚡`,
    p2Leading: (diff) => `玩家 2 领先 (+${diff}) ⚡`,
    player1: "玩家 1",
    player2: "玩家 2",
    answered: "已答",
    liveBadge: "实时直播 • 极速心算对决",
    correct: "正确",
    acc: "准确率",
    notice: "🔒 直播期间题目加密隐藏，以保障绝对公平的竞技环境",
    submitBtn: "提交 ↵",
  },
};

function normalizeNumberInput(input: string): string {
  return input
    .replace(/[٠۰]/g, "0")
    .replace(/[١۱]/g, "1")
    .replace(/[٢۲]/g, "2")
    .replace(/[٣۳]/g, "3")
    .replace(/[٤۴]/g, "4")
    .replace(/[٥۵]/g, "5")
    .replace(/[٦۶]/g, "6")
    .replace(/[٧۷]/g, "7")
    .replace(/[٨۸]/g, "8")
    .replace(/[٩۹]/g, "9")
    .replace(/[^\d-]/g, "");
}

export function SpeedMathBoard({ scores, you, current, mySeat, canMove, onMove }: Props) {
  const { t, locale } = useI18n();
  const mathDict = (SPEED_MATH_I18N[locale] ?? SPEED_MATH_I18N["en"])!;
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
    if (!canMove || draft.trim() === "" || draft.trim() === "-") return;
    const answer = Number(draft);
    if (!Number.isFinite(answer)) return;
    onMove({ answer: Math.trunc(answer) });
    setDraft("");
  }

  function handleKeypadDigit(digit: string) {
    if (!canMove) return;
    setDraft((prev) => {
      if (prev === "0") return digit;
      if (prev.length >= 7) return prev;
      return prev + digit;
    });
    inputRef.current?.focus();
  }

  function handleKeypadBackspace() {
    if (!canMove) return;
    setDraft((prev) => prev.slice(0, -1));
    inputRef.current?.focus();
  }

  function handleKeypadToggleSign() {
    if (!canMove) return;
    setDraft((prev) => {
      if (prev.startsWith("-")) return prev.slice(1);
      if (prev.length > 0) return "-" + prev;
      return "-";
    });
    inputRef.current?.focus();
  }

  // Dedicated Spectator View: Real-Time Race HUD & Telemetry
  if (mySeat === null) {
    const p0Correct = scores.correct[0] ?? 0;
    const p1Correct = scores.correct[1] ?? 0;
    const p0Answered = scores.answered[0] ?? 0;
    const p1Answered = scores.answered[1] ?? 0;
    const total = scores.total || 60;
    const p0Pct = Math.min(100, Math.round((p0Answered / total) * 100));
    const p1Pct = Math.min(100, Math.round((p1Answered / total) * 100));
    const p0Acc = p0Answered > 0 ? Math.round((p0Correct / p0Answered) * 100) : 0;
    const p1Acc = p1Answered > 0 ? Math.round((p1Correct / p1Answered) * 100) : 0;

    let leadStatus = mathDict.tied;
    if (p0Correct > p1Correct) {
      const diff = p0Correct - p1Correct;
      leadStatus = mathDict.p1Leading(diff);
    } else if (p1Correct > p0Correct) {
      const diff = p1Correct - p0Correct;
      leadStatus = mathDict.p2Leading(diff);
    }

    return (
      <div className={styles.wrap}>
        {/* Spectator Telemetry HUD */}
        <div className={styles.telemetryHud}>
          <div className={[styles.scorePod, styles.podPlayer0].join(" ")}>
            <span className={styles.podLabel}>{mathDict.player1}</span>
            <span className={`nz-num ${styles.podValue}`}>{p0Correct}</span>
            <span className={styles.podSubText}>
              {p0Answered} / {total} {mathDict.answered}
            </span>
          </div>

          <div className={styles.vsDivider}>VS</div>

          <div className={[styles.scorePod, styles.podPlayer1].join(" ")}>
            <span className={styles.podLabel}>{mathDict.player2}</span>
            <span className={`nz-num ${styles.podValue}`}>{p1Correct}</span>
            <span className={styles.podSubText}>
              {p1Answered} / {total} {mathDict.answered}
            </span>
          </div>
        </div>

        {/* Live Race Telemetry Card */}
        <div className={[styles.cardContainer, perspective3D ? styles.perspective : ""].join(" ")}>
          <div className={styles.spectatorCard}>
            <div className={styles.spectatorHeader}>
              <span className={styles.spectatorLiveBadge}>
                <span className={styles.spectatorPulseDot} />
                {mathDict.liveBadge}
              </span>
              <span className={styles.leadStatusBadge}>{leadStatus}</span>
            </div>

            {/* Race Tracks */}
            <div className={styles.raceTracks}>
              {/* Player 1 Track */}
              <div className={styles.raceRow}>
                <div className={styles.raceMeta}>
                  <span className={styles.raceName}>{mathDict.player1}</span>
                  <span className={styles.raceStat}>
                    <strong className="nz-num">{p0Correct}</strong> {mathDict.correct} • <strong className="nz-num">{p0Acc}%</strong> {mathDict.acc}
                  </span>
                </div>
                <div className={styles.trackBar}>
                  <div
                    className={styles.trackFill0}
                    style={{ width: `${Math.max(4, p0Pct)}%` }}
                  />
                </div>
              </div>

              {/* Player 2 Track */}
              <div className={styles.raceRow}>
                <div className={styles.raceMeta}>
                  <span className={styles.raceName}>{mathDict.player2}</span>
                  <span className={styles.raceStat}>
                    <strong className="nz-num">{p1Correct}</strong> {mathDict.correct} • <strong className="nz-num">{p1Acc}%</strong> {mathDict.acc}
                  </span>
                </div>
                <div className={styles.trackBar}>
                  <div
                    className={styles.trackFill1}
                    style={{ width: `${Math.max(4, p1Pct)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className={styles.spectatorNotice}>
              <span>{mathDict.notice}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const myScore = mySeat !== null ? scores.correct[mySeat] : 0;
  const opponentSeat = mySeat === 0 ? 1 : mySeat === 1 ? 0 : null;
  const opponentScore = opponentSeat !== null ? scores.correct[opponentSeat] : 0;
  const totalQuestions = scores.total || 60;
  const myPct = Math.min(100, Math.round(((myScore ?? 0) / totalQuestions) * 100));
  const oppPct = Math.min(100, Math.round(((opponentScore ?? 0) / totalQuestions) * 100));

  return (
    <div className={styles.wrap}>
      {/* Telemetry Race HUD */}
      <div className={styles.telemetryHud}>
        <div className={[styles.scorePod, styles.podYou].join(" ")}>
          <span className={styles.podLabel}>{t("matchmaking.you")}</span>
          <span className={`nz-num ${styles.podValue}`}>{myScore ?? 0}</span>
          {streak > 1 && (
            <span className={[styles.streakFlame, streak >= 4 ? styles.flameExtreme : ""].join(" ")}>
              🔥 {streak}x {streak >= 4 ? "ULTRA!" : "STREAK"}
            </span>
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
        <div className={[
          styles.hologramCard, 
          feedback ? styles[feedback] : "",
          streak >= 4 ? styles.fireComboExtreme : (streak >= 2 ? styles.fireComboMid : "")
        ].join(" ")} dir="ltr">
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
            className={styles.answerForm}
            onSubmit={(e) => { e.preventDefault(); submit(); }}
          >
            <div className={styles.answerRow}>
              <input
                ref={inputRef}
                className={`nz-num ${styles.answerInput}`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={draft}
                disabled={!canMove}
                onChange={(e) => {
                  const clean = normalizeNumberInput(e.target.value);
                  if (clean === "-" || /^-?\d*$/.test(clean)) {
                    setDraft(clean);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
                aria-label={t("game.speed_math.answer_label")}
                placeholder="?"
              />
            </div>

            {/* Prominent Glowing Submit Button */}
            <button
              type="submit"
              className={styles.bigSubmitBtn}
              disabled={!canMove || draft.trim() === "" || draft.trim() === "-"}
            >
              ⚡ {mathDict.submitBtn}
            </button>
          </form>

          {/* Virtual On-Screen Numpad */}
          <div className={styles.keypadSection}>
            <div className={styles.keypadGrid}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  className={styles.keypadBtn}
                  onClick={() => handleKeypadDigit(digit)}
                  disabled={!canMove}
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                className={[styles.keypadBtn, styles.keypadBtnAction].join(" ")}
                onClick={handleKeypadToggleSign}
                disabled={!canMove}
                title="Negative / Positive"
              >
                ±
              </button>
              <button
                type="button"
                className={styles.keypadBtn}
                onClick={() => handleKeypadDigit("0")}
                disabled={!canMove}
              >
                0
              </button>
              <button
                type="button"
                className={[styles.keypadBtn, styles.keypadBtnAction].join(" ")}
                onClick={handleKeypadBackspace}
                disabled={!canMove || draft.length === 0}
                title="Backspace"
              >
                ⌫
              </button>
            </div>
          </div>

          {/* In-Match Live Race Telemetry */}
          <div className={styles.inGameRaceTrack}>
            <div className={styles.inGameTrackRow}>
              <span className={styles.inGameTrackLabel}>{t("matchmaking.you")}</span>
              <div className={styles.inGameTrackBar}>
                <div
                  className={styles.inGameTrackFill0}
                  style={{ width: `${Math.max(4, myPct)}%` }}
                />
              </div>
              <span className={`nz-num ${styles.inGameTrackScore}`}>{myScore ?? 0}</span>
            </div>
            <div className={styles.inGameTrackRow}>
              <span className={styles.inGameTrackLabel}>{t("matchmaking.opponent")}</span>
              <div className={styles.inGameTrackBar}>
                <div
                  className={styles.inGameTrackFill1}
                  style={{ width: `${Math.max(4, oppPct)}%` }}
                />
              </div>
              <span className={`nz-num ${styles.inGameTrackScore}`}>{opponentScore ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {you && (
        <div className={styles.progressFooter}>
          <span>{t("game.speed_math.answered")}: <strong className="nz-num">{you.answered}</strong></span>
          <span className={styles.accuracyTag}>
            {you.answered > 0 ? `${Math.round((you.correct / you.answered) * 100)}% ${mathDict.acc}` : `0% ${mathDict.acc}`}
          </span>
        </div>
      )}
    </div>
  );
}
