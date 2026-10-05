"use client";

import { Header } from "@/components/Header";
import { DuelShell } from "@/components/game/DuelShell";
import "@/lib/games";

export function GameClient({ duelId }: { duelId: string }) {
  return (
    <>
      <Header />
      <DuelShell duelId={duelId} />
    </>
  );
}
