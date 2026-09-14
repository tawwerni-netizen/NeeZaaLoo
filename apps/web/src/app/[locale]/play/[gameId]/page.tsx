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
import { RequireAuth } from "@/components/RequireAuth";
import { MatchmakingFlow } from "@/components/matchmaking/MatchmakingFlow";
import { ModeSelect, type PlayMode } from "@/components/play/ModeSelect";
import { LiveDuelLobby } from "@/components/play/LiveDuelLobby";
import { DifficultySelect } from "@/components/play/DifficultySelect";
import { StakeSelect, type StakeChoice } from "@/components/play/StakeSelect";
import { FriendChallenge } from "@/components/play/FriendChallenge";
import { TimeControlSelect, type TimeProfile } from "@/components/play/TimeControlSelect";
import { getGame, type Difficulty } from "@/lib/games";
import { post } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";

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
  const { t, locale } = useI18n();
  const router = useRouter();
  const plugin = getGame(gameId);
  const [step, setStep] = useState<Step>({ name: "mode" });
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [creating, setCreating] = useState(false);

  if (!plugin) {
    return (
      <RequireAuth>
        <Header />
        <main className="nz-container"><p>{t("common.unknown_game")}</p></main>
      </RequireAuth>
    );
  }

  function handleMode(mode: PlayMode) {
    if (mode === "VS_COMPUTER") {
      if (plugin!.difficulties.length > 0) {
        setStep({ name: "difficulty" });
      } else {
        setStep({ name: "time_control", difficulty: null });
      }
    } else if (mode === "FRIEND") {
      setStep({ name: "friend_stake" });
    } else {
      setStep({ name: "random_stake" });
    }
  }

  async function startVsComputer(chosenDifficulty: Difficulty | null, chosenProfile: TimeProfile = "STANDARD") {
    setCreating(true);
    try {
      // FREE ONLY -- no stake, no tier, ever, in this request. A computer
      // opponent is never presented as a real-money opponent.
      const r = await post<{ duelId: string }>("/v1/matchmaking/vs-computer", {
        gameId,
        difficulty: chosenDifficulty ?? "MEDIUM",
        timeProfile: chosenProfile,
      });
      router.push(`/${locale}/game/${r.duelId}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <RequireAuth>
      <Header />
      <main className="nz-container">
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

        {creating && <p aria-live="polite">{t("game.connecting")}</p>}
      </main>
    </RequireAuth>
  );
}
