"use client";

/**
 * The pre-match flow for any registered game: Mode -> (Difficulty ->) Stake
 * -> matchmaking/creation, or Friend, entirely driven by the resolved
 * GamePlugin's own capabilities (supportsAI, difficulties, cashEnabled) --
 * never a gameId switch. TOURNAMENT never opens a step here; its card in
 * ModeSelect links straight into the standalone /tournaments surface.
 */
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { RequireAuth } from "@/components/RequireAuth";
import { MatchmakingFlow } from "@/components/matchmaking/MatchmakingFlow";
import { ModeSelect, type PlayMode } from "@/components/play/ModeSelect";
import { DifficultySelect } from "@/components/play/DifficultySelect";
import { StakeSelect } from "@/components/play/StakeSelect";
import { FriendChallenge } from "@/components/play/FriendChallenge";
import { getGame, type Difficulty } from "@/lib/games";
import { post } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";

type Step =
  | { name: "mode" }
  | { name: "difficulty" }
  | { name: "stake"; next: "vs_computer" | "competitive" }
  | { name: "friend" }
  | { name: "matchmaking" };

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
      setStep(plugin!.difficulties.length > 0 ? { name: "difficulty" } : { name: "stake", next: "vs_computer" });
    } else if (mode === "FRIEND") {
      setStep({ name: "friend" });
    } else {
      setStep({ name: "stake", next: "competitive" });
    }
  }

  async function startVsComputer() {
    if (!difficulty) return;
    setCreating(true);
    try {
      const r = await post<{ duelId: string }>("/v1/matchmaking/vs-computer", { gameId, difficulty });
      router.push(`/${locale}/game/${r.duelId}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <RequireAuth>
      <Header />
      <main className="nz-container">
        {step.name === "mode" && <ModeSelect plugin={plugin} gameId={gameId} onSelect={handleMode} />}

        {step.name === "difficulty" && (
          <DifficultySelect
            plugin={plugin}
            onSelect={(d) => { setDifficulty(d); setStep({ name: "stake", next: "vs_computer" }); }}
          />
        )}

        {step.name === "stake" && step.next === "vs_computer" && (
          <StakeSelect plugin={plugin} onContinue={() => void startVsComputer()} />
        )}

        {step.name === "stake" && step.next === "competitive" && (
          <StakeSelect plugin={plugin} onContinue={() => setStep({ name: "matchmaking" })} />
        )}

        {step.name === "friend" && (
          <FriendChallenge gameId={gameId} onDuelReady={(duelId) => router.push(`/${locale}/game/${duelId}`)} />
        )}

        {step.name === "matchmaking" && <MatchmakingFlow gameId={gameId} />}

        {creating && <p aria-live="polite">{t("game.connecting")}</p>}
      </main>
    </RequireAuth>
  );
}
