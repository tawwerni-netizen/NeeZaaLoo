"use client";

/**
 * The live game screen -- a thin route wrapper. Everything genuinely
 * game-agnostic lives in DuelShell (packages/web's Game Factory shell);
 * this file's only job is the Next.js route param and RequireAuth. See
 * DuelShell's own header, and lib/games/types.ts's header for why no
 * game-specific code belongs here or in DuelShell either.
 */
import { use } from "react";
import { Header } from "@/components/Header";
import { RequireAuth } from "@/components/RequireAuth";
import { DuelShell } from "@/components/game/DuelShell";
import "@/lib/games"; // registers every known game by side effect -- see that module's own header

export default function GamePage({ params }: { params: Promise<{ duelId: string }> }) {
  const { duelId } = use(params);
  const isGuest = duelId.startsWith("guest");

  if (isGuest) {
    return (
      <>
        <Header />
        <DuelShell duelId={duelId} />
      </>
    );
  }

  return (
    <RequireAuth>
      <Header />
      <DuelShell duelId={duelId} />
    </RequireAuth>
  );
}
