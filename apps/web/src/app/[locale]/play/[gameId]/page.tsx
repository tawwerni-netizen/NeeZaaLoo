"use client";

/**
 * The pre-match flow for any registered game: Mode -> (Difficulty ->)
 * Stake -> matchmaking/creation, entirely driven by the resolved
 * GamePlugin's own capabilities (supportsAI, difficulties, cashEnabled) --
 * never a gameId switch.
 *
 * VS_COMPUTER never sees a stake step at all -- FREE ONLY, full stop: a
 * computer opponent must never be presented as a real-money opponent, so
 * this file simply never routes that mode through StakeSelect the way
 * FRIEND and RANDOM_OPPONENT both do. TOURNAMENT never opens a step here
 * either; its card in ModeSelect links straight into the standalone
 * /tournaments surface.
 */
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MatchmakingFlow } from "@/components/matchmaking/MatchmakingFlow";
import { ModeSelect, type PlayMode } from "@/components/play/ModeSelect";
import { LiveDuelLobby } from "@/components/play/LiveDuelLobby";
import { DifficultySelect } from "@/components/play/DifficultySelect";
import { StakeSelect, type StakeChoice } from "@/components/play/StakeSelect";
import { FriendChallenge } from "@/components/play/FriendChallenge";
import { TimeControlSelect, type TimeProfile } from "@/components/play/TimeControlSelect";
import { getGame, type Difficulty } from "@/lib/games";
import { post } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useAuthPopup } from "@/lib/auth-popup-context";
import { useI18n } from "@/lib/i18n/context";
import styles from "./playGame.module.css";

type Step =
  | { name: "mode" }
  | { name: "difficulty" }
  | { name: "time_control"; difficulty: Difficulty | null }
  | { name: "friend_stake" }
  | { name: "random_stake" }
  | { name: "friend"; stake: StakeChoice }
  | { name: "matchmaking"; stake: StakeChoice };

export default function PlayGamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params);
  const { t, locale, dir } = useI18n();
  const { player } = useAuth();
  const { openPopup } = useAuthPopup();
  const isRtl = dir === "rtl";
  const router = useRouter();
  const plugin = getGame(gameId);

  const [step, setStep] = useState<Step>({ name: "mode" });
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [dominoesVariant, setDominoesVariant] = useState<"TRADITIONAL" | "AMERICAN">("TRADITIONAL");
  const [creating, setCreating] = useState(false);

  if (!plugin) {
    return (
      <>
        <Header />
        <main className="nz-container"><p>{t("common.unknown_game")}</p></main>
        <Footer />
      </>
    );
  }

  const gameName = t(`common.game_names.${plugin.nameKey}`) || plugin.id;

  function handleBack() {
    switch (step.name) {
      case "difficulty":
        setStep({ name: "mode" });
        break;
      case "time_control":
        if (plugin?.difficulties && plugin.difficulties.length > 0) {
          setStep({ name: "difficulty" });
        } else {
          setStep({ name: "mode" });
        }
        break;
      case "friend_stake":
      case "random_stake":
        setStep({ name: "mode" });
        break;
      case "friend":
        setStep({ name: "friend_stake" });
        break;
      case "matchmaking":
        setStep({ name: "random_stake" });
        break;
      case "mode":
      default:
        router.push(`/${locale}/play`);
        break;
    }
  }

  function handleMode(mode: PlayMode) {
    if (mode === "VS_COMPUTER") {
      if (plugin!.difficulties.length > 0) {
        setStep({ name: "difficulty" });
      } else {
        setStep({ name: "time_control", difficulty: null });
      }
    } else if (mode === "FRIEND") {
      if (!player) {
        openPopup();
        return;
      }
      setStep({ name: "friend_stake" });
    } else {
      if (!player) {
        openPopup();
        return;
      }
      setStep({ name: "random_stake" });
    }
  }

  async function startVsComputer(chosenDifficulty: Difficulty | null, chosenProfile: TimeProfile = "STANDARD") {
    if (!player) {
      openPopup();
      return;
    }
    setCreating(true);
    try {
      const r = await post<{ duelId: string }>("/v1/matchmaking/vs-computer", {
        gameId,
        difficulty: chosenDifficulty ?? "MEDIUM",
        timeProfile: chosenProfile,
        ...(gameId === "dominoes" ? { variant: dominoesVariant } : {}),
      });
      router.push(`/${locale}/game/${r.duelId}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Header />
      <main className="nz-container">
        {/* Navigation & Back Header */}
        <div className={styles.navBar}>
          <div className={styles.leftGroup}>
            <button
              type="button"
              className={styles.backButton}
              onClick={handleBack}
              aria-label={isRtl ? "رجوع خطوة للخلف" : "Back one step"}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transform: isRtl ? "scaleX(-1)" : "none" }}
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span>
                {step.name === "mode"
                  ? (isRtl ? "كتالوج الألعاب" : "All Games")
                  : (isRtl ? "رجوع خطوة للخلف" : "Back")}
              </span>
            </button>

            <div className={styles.gameBadge}>
              <img
                src={`/images/games/${plugin.id}-badge.jpg`}
                alt={gameName}
                className={styles.gameThumb}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `/images/games/${plugin.id}.jpg`;
                }}
              />
              <span className={styles.gameTitle}>{gameName}</span>
            </div>
          </div>

          {/* Stepper Trail */}
          <div className={styles.stepper}>
            <button
              type="button"
              className={`${styles.stepItem} ${step.name === "mode" ? styles.stepItemActive : styles.stepItemClickable}`}
              onClick={() => setStep({ name: "mode" })}
            >
              1. {isRtl ? "الوضع" : "Mode"}
            </button>

            <span className={styles.stepSep}>›</span>

            <span
              className={`${styles.stepItem} ${
                step.name === "difficulty" || step.name === "friend_stake" || step.name === "random_stake"
                  ? styles.stepItemActive
                  : step.name === "time_control" || step.name === "friend" || step.name === "matchmaking"
                  ? styles.stepItemCompleted
                  : ""
              }`}
            >
              2. {step.name === "difficulty" || step.name === "time_control"
                  ? (isRtl ? "الصعوبة" : "Difficulty")
                  : (isRtl ? "الرهان" : "Stake")}
            </span>

            <span className={styles.stepSep}>›</span>

            <span
              className={`${styles.stepItem} ${
                step.name === "time_control" || step.name === "friend" || step.name === "matchmaking"
                  ? styles.stepItemActive
                  : ""
              }`}
            >
              3. {step.name === "time_control"
                  ? (isRtl ? "التحكم الزمني" : "Time Control")
                  : (isRtl ? "المبارزة" : "Duel Match")}
            </span>
          </div>
        </div>

        {/* Dominoes Variant Selector Banner */}
        {gameId === "dominoes" && (
          <div className={styles.variantBanner}>
            <div className={styles.variantInfo}>
              <span className={styles.variantIcon}>🀄</span>
              <div>
                <div className={styles.variantHeading}>
                  {isRtl ? "نمط لعب الدومينو المعتمد" : "Dominoes Game Variant"}
                </div>
                <div className={styles.variantDesc}>
                  {dominoesVariant === "TRADITIONAL"
                    ? (isRtl ? "العادي (التقليدي): إنهاء القطع أو أقل نقاط عند القفلة." : "Traditional (Draw/Block): Out-domino or lowest pips on block.")
                    : (isRtl ? "الأمريكي (All-Fives): تسجيل النقاط لمضاعفات الـ 5 على الأطراف المفتوحة." : "American (All-Fives): Score multiples of 5 on open ends.")}
                </div>
              </div>
            </div>
            <div className={styles.variantTabs}>
              <button
                type="button"
                className={dominoesVariant === "TRADITIONAL" ? styles.variantTabActive : styles.variantTab}
                onClick={() => setDominoesVariant("TRADITIONAL")}
              >
                {isRtl ? "الدومينو العادي" : "Traditional"}
              </button>
              <button
                type="button"
                className={dominoesVariant === "AMERICAN" ? styles.variantTabActive : styles.variantTab}
                onClick={() => setDominoesVariant("AMERICAN")}
              >
                {isRtl ? "الدومينو الأمريكي" : "American (All-Fives)"}
              </button>
            </div>
          </div>
        )}

        {step.name === "mode" && (
          <>
            <ModeSelect plugin={plugin} gameId={gameId} onSelect={handleMode} />
            <div style={{ marginTop: "48px" }}>
              <LiveDuelLobby filterGameId={gameId} />
            </div>
          </>
        )}

        {step.name === "difficulty" && (
          <DifficultySelect
            plugin={plugin}
            onSelect={(d) => {
              setDifficulty(d);
              setStep({ name: "time_control", difficulty: d });
            }}
          />
        )}

        {step.name === "time_control" && (
          <TimeControlSelect
            plugin={plugin}
            onSelect={(profile) => void startVsComputer(step.difficulty, profile)}
          />
        )}

        {step.name === "friend_stake" && (
          <StakeSelect plugin={plugin} onContinue={(stake) => setStep({ name: "friend", stake })} />
        )}

        {step.name === "random_stake" && (
          <StakeSelect plugin={plugin} onContinue={(stake) => setStep({ name: "matchmaking", stake })} />
        )}

        {step.name === "friend" && (
          <FriendChallenge gameId={gameId} stake={step.stake} />
        )}

        {step.name === "matchmaking" && <MatchmakingFlow gameId={gameId} stake={step.stake} />}

        {creating && (
          <div className={styles.creatingOverlay}>
            <div className={styles.spinner} />
            <p aria-live="polite">{t("game.connecting") || "Creating match..."}</p>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
