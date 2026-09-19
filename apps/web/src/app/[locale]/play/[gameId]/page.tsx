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
import { use, useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { post, setTokens } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useAuthPopup } from "@/lib/auth-popup-context";
import { ChessTimePerMoveSelect } from "@/components/play/ChessTimePerMoveSelect";
import { useI18n } from "@/lib/i18n/context";
import styles from "./playGame.module.css";

// Last-resort fallback for a game with no real photography yet (e.g. a
// brand-new game shipped before its JPG assets exist) -- a small inline
// placeholder beats a broken-image icon on the pre-match screen.
const IMG_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%230D111A'/%3E%3Ccircle cx='32' cy='32' r='18' fill='none' stroke='%23FFD700' stroke-opacity='0.45' stroke-width='2'/%3E%3Ccircle cx='32' cy='32' r='4' fill='%23FFD700' fill-opacity='0.7'/%3E%3C/svg%3E";

type Step =
  | { name: "mode" }
  | { name: "difficulty" }
  | { name: "time_control"; difficulty: Difficulty | null }
  | { name: "friend_stake" }
  | { name: "random_stake" }
  | { name: "friend"; stake: StakeChoice }
  | { name: "matchmaking"; stake: StakeChoice };

function InnerPlayGamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params);
  const { t, locale, dir } = useI18n();
  const { player } = useAuth();
  const { openPopup } = useAuthPopup();
  const isRtl = dir === "rtl";
  const router = useRouter();
  const searchParams = useSearchParams();
  const plugin = getGame(gameId);

  const [step, setStep] = useState<Step>(() => {
    const tier = searchParams.get("tier");
    const stake = searchParams.get("stake");
    if (tier === "CASH" && stake && !isNaN(Number(stake))) {
      return {
        name: "matchmaking",
        stake: { tier: "CASH", stakeMinor: String(Number(stake) * 1_000_000), asset: "USDT" },
      };
    }
    return { name: "mode" };
  });
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

  async function startVsComputer(chosenDifficulty: Difficulty | null, chosenProfile: string = "STANDARD") {
    setCreating(true);
    try {
      if (!player) {
        if (chosenDifficulty === "EASY") {
          try {
            const guestRes = await post<{ accessToken: string; refreshToken: string }>("/v1/auth/guest", {});
            setTokens(guestRes.accessToken, guestRes.refreshToken, true);
          } catch {
            // Non-fatal, attempt proceed
          }
        } else {
          setCreating(false);
          openPopup();
          return;
        }
      }
      const r = await post<{ duelId: string }>("/v1/matchmaking/vs-computer", {
        gameId,
        difficulty: chosenDifficulty ?? "MEDIUM",
        timeProfile: chosenProfile,
        ...(gameId === "dominoes" ? { variant: dominoesVariant } : {}),
      });
      router.push(`/${locale}/game/${r.duelId}`);
    } catch {
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
                  const img = e.target as HTMLImageElement;
                  if (!img.dataset.fallbackStage) {
                    img.dataset.fallbackStage = "plain";
                    img.src = `/images/games/${plugin.id}.jpg`;
                  } else {
                    img.onerror = null;
                    img.src = IMG_PLACEHOLDER;
                  }
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
                  : (isRtl ? "قيمة التحدي" : "Match Stake")}
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
            <div className={styles.heroBanner}>
              <img 
                src={`/images/games/${plugin.id}-hero.jpg`} 
                className={styles.heroBackground} 
                alt=""
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  if (!img.dataset.fallbackStage) {
                    img.dataset.fallbackStage = "plain";
                    img.src = `/images/games/${plugin.id}.jpg`;
                  } else {
                    img.onerror = null;
                    img.src = IMG_PLACEHOLDER;
                  }
                }}
              />
              <div className={styles.heroOverlay} />
              <div className={styles.heroContent}>
                <h1 className={styles.heroTitle}>{gameName}</h1>
                <p className={styles.heroSubtitle}>
                  {isRtl 
                    ? "العب، نافس، واربح جوائز حقيقية. أثبت مهارتك الآن!" 
                    : "Play, compete, and win real prizes. Prove your skills now!"}
                </p>
              </div>
            </div>
            
            <ModeSelect plugin={plugin} gameId={gameId} onSelect={handleMode} />
            <div style={{ marginTop: "48px" }}>
              <LiveDuelLobby filterGameId={gameId} />
            </div>
          </>
        )}

        {step.name === "difficulty" && (
          <DifficultySelect
            plugin={plugin}
            gameName={gameName}
            onSelect={(d) => {
              if (d !== "EASY" && !player) {
                openPopup();
                return;
              }
              setDifficulty(d);
              if (gameId === "chess" && d === "EASY") {
                // Easy mode: Open/unlimited time, instant guest start!
                void startVsComputer("EASY", "UNLIMITED");
              } else if (gameId === "chess" && d === "EXPERT") {
                // Expert mode: Mandatory official strict rules (1m per move anti-cheat)
                void startVsComputer("EXPERT", "PER_MOVE_60S");
              } else {
                setStep({ name: "time_control", difficulty: d });
              }
            }}
          />
        )}

        {step.name === "time_control" && (
          gameId === "chess" ? (
            <ChessTimePerMoveSelect
              onSelect={(profile) => void startVsComputer(step.difficulty, profile)}
              loading={creating}
            />
          ) : (
            <TimeControlSelect
              plugin={plugin}
              onSelect={(profile) => void startVsComputer(step.difficulty, profile)}
            />
          )
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


export default function PlayGamePage(props: { params: Promise<{ gameId: string }> }) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <InnerPlayGamePage {...props} />
    </Suspense>
  );
}

