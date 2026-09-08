"use client";

/**
 * The generic duel room -- the ONE thing every game shares, per the Nizalo
 * Table System spec's "one club, ten tables": connection state, both
 * player strips, the clock, draw agreement, resign, the result ceremony,
 * reconnect, spectator handling, and the chat slot. This file NEVER
 * imports a specific game's module and NEVER switches on `gameId`; it
 * resolves a GamePlugin once (via lib/games) and hands that plugin's own
 * Board component an opaque `view`, exactly as packages/realtime/src/
 * gateway.mjs hands a game's own plugin.project() output to the wire
 * without reading inside it.
 *
 * A new game requires NONE of this file to change -- see lib/games/
 * types.ts's own header for the whole point of that boundary.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { useDuelSocket } from "@/lib/use-duel-socket";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { useProgressionSnapshot } from "@/lib/use-progression-snapshot";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { PlayerStrip } from "@/components/game/PlayerStrip";
import { ResultCeremony } from "@/components/game/ResultCeremony";
import { getGame } from "@/lib/games";
import { get, post } from "@/lib/api";
import styles from "./DuelShell.module.css";

const BOT_IDS = new Set(["ai-easy", "ai-medium", "ai-hard", "ai-expert"]);
const BOT_DIFFICULTY: Record<string, string> = {
  "ai-easy": "EASY", "ai-medium": "MEDIUM", "ai-hard": "HARD", "ai-expert": "EXPERT",
};

export function DuelShell({ duelId }: { duelId: string }) {
  const { player } = useAuth();
  const { t, locale } = useI18n();
  const router = useRouter();
  const {
    connected, reconnecting, latest, seat, drawOfferBy,
    sendIntent, resign, offerDraw, acceptDraw, declineDraw,
  } = useDuelSocket(duelId);

  const [gameId, setGameId] = useState<string | null>(null);
  const [players, setPlayers] = useState<string[] | null>(null);
  const [resignConfirmOpen, setResignConfirmOpen] = useState(false);
  const [rematchBusy, setRematchBusy] = useState(false);
  const [opponentNickname, setOpponentNickname] = useState<string>("");

  useEffect(() => {
    if (latest?.t !== "STATE") return;
    const msg = latest as { players?: unknown; gameId?: unknown };
    if (Array.isArray(msg.players)) setPlayers(msg.players as string[]);
    if (typeof msg.gameId === "string") setGameId(msg.gameId);
  }, [latest]);

  const view = latest && typeof latest === "object" && "view" in latest ? (latest as { view: unknown }).view : null;
  const clock = latest && typeof latest === "object" && "clock" in latest
    ? (latest as { clock: { remaining?: number[]; toMove?: number } }).clock
    : null;
  const completed = latest?.t === "COMPLETED";
  const result = completed ? String((latest as { result?: unknown }).result) : null;
  const reason = completed ? String((latest as { reason?: unknown }).reason) : null;

  const isSpectator = seat === null;
  const mySeat = typeof seat === "number" ? (seat as 0 | 1) : null;
  const opponentSeat = mySeat === 0 ? 1 : mySeat === 1 ? 0 : null;

  const myOutcome: "win" | "loss" | "draw" | null = useMemo(() => {
    if (!completed || result === null) return null;
    if (result === "1/2-1/2") return "draw";
    if (mySeat === null) return null;
    const iWon = (result === "1-0" && mySeat === 0) || (result === "0-1" && mySeat === 1);
    return iWon ? "win" : "loss";
  }, [completed, result, mySeat]);

  const vsComputer = players?.some((p) => BOT_IDS.has(p)) ?? false;
  const botId = players?.find((p) => BOT_IDS.has(p)) ?? null;

  useEffect(() => {
    if (!players || opponentSeat === null) return;
    const opponentId = players[opponentSeat];
    if (!opponentId) return;
    if (BOT_IDS.has(opponentId)) {
      setOpponentNickname(t(`game.difficulty.${BOT_DIFFICULTY[opponentId] ?? "MEDIUM"}`));
      return;
    }
    let cancelled = false;
    void get<{ nickname: string }>(`/v1/players/by-id/${encodeURIComponent(opponentId)}/preview`)
      .then((r) => { if (!cancelled) setOpponentNickname(r.nickname); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, opponentSeat]);

  const canMove = !isSpectator && !completed && connected
    && mySeat !== null && clock?.toMove === mySeat;

  const lastMove = useMemo(() => {
    if (latest?.t !== "EVENT" || (latest as { type?: string }).type !== "INTENT_ACCEPTED") return null;
    const payload = (latest as { payload?: { intent?: unknown } }).payload;
    return payload?.intent ?? null;
  }, [latest]);

  const delta = useProgressionSnapshot(player?.handle, gameId ?? undefined, completed);

  async function handleRematch() {
    if (!botId || !gameId) return;
    setRematchBusy(true);
    try {
      const difficulty = BOT_DIFFICULTY[botId] ?? "MEDIUM";
      const r = await post<{ duelId: string }>("/v1/matchmaking/vs-computer", { gameId, difficulty });
      router.push(`/${locale}/game/${r.duelId}`);
    } finally {
      setRematchBusy(false);
    }
  }

  const plugin = gameId ? getGame(gameId) : null;
  const connectionLabel = reconnecting ? t("game.reconnecting") : connected ? t("game.connected") : t("game.connecting");

  return (
    <main className="nz-container">
      <div className={styles.statusBar}>
        <span className={styles.statusGroup}>
          <span className={connected ? styles.live : styles.offline}>{connectionLabel}</span>
          {isSpectator && <span className={styles.spectatorBadge}>{t("game.spectating")}</span>}
        </span>
      </div>

      {plugin?.supportsDraw && !isSpectator && !completed && drawOfferBy !== null && (
        <div className={styles.drawBanner}>
          {drawOfferBy === mySeat ? (
            <span>{t("game.draw_offer_sent")}</span>
          ) : (
            <>
              <span>{t("game.draw_offer_received", { handle: opponentNickname })}</span>
              <Button variant="primary" onClick={acceptDraw}>{t("game.accept_draw")}</Button>
              <Button variant="ghost" onClick={declineDraw}>{t("game.decline_draw")}</Button>
            </>
          )}
        </div>
      )}

      {completed ? (
        <ResultCeremony
          isSpectator={isSpectator}
          outcome={myOutcome}
          result={result}
          reason={reason}
          vsComputer={vsComputer}
          duelId={duelId}
          delta={delta}
          onRematch={() => void handleRematch()}
          rematchBusy={rematchBusy}
        />
      ) : plugin && view ? (
        <>
          {players && opponentSeat !== null && (
            <PlayerStrip
              playerId={players[opponentSeat] ?? ""}
              active={clock?.toMove === opponentSeat}
              remainingMs={clock?.remaining?.[opponentSeat] ?? null}
              flagged={false}
            />
          )}

          <plugin.Board
            view={view}
            lastMove={lastMove}
            mySeat={mySeat}
            canMove={canMove}
            onMove={(intent) => sendIntent(intent)}
          />

          {players && mySeat !== null && (
            <PlayerStrip
              playerId={players[mySeat] ?? ""}
              active={clock?.toMove === mySeat}
              remainingMs={clock?.remaining?.[mySeat] ?? null}
              flagged={false}
            />
          )}

          {!isSpectator && (
            <div className={styles.actionsRow}>
              {plugin.supportsDraw && (
                <Button variant="ghost" onClick={offerDraw} disabled={drawOfferBy !== null}>{t("game.offer_draw")}</Button>
              )}
              <Button variant="secondary" onClick={() => setResignConfirmOpen(true)}>{t("game.resign")}</Button>
            </div>
          )}
        </>
      ) : (
        <p className={styles.playerLine}>{t("game.connecting")}</p>
      )}

      {resignConfirmOpen && (
        <div className={styles.confirmOverlay} role="dialog" aria-label={t("game.resign_confirm_title")}>
          <div className={styles.confirmCard}>
            <h2>{t("game.resign_confirm_title")}</h2>
            <p>{t("game.resign_confirm_body")}</p>
            <div className={styles.confirmActions}>
              <Button variant="secondary" onClick={() => { resign(); setResignConfirmOpen(false); }}>{t("game.confirm")}</Button>
              <Button variant="ghost" onClick={() => setResignConfirmOpen(false)}>{t("game.cancel")}</Button>
            </div>
          </div>
        </div>
      )}

      <p className={styles.playerLine}>
        {isSpectator ? t("game.watching_as", { handle: player?.handle ?? "" }) : t("game.playing_as", { handle: player?.handle ?? "" })}
      </p>

      <div className={styles.chatSlot}>
        {seat === undefined ? null : isSpectator
          ? <ChatWindow channel="SPECTATOR" duelId={duelId} />
          : <ChatWindow channel="MATCH" duelId={duelId} />}
      </div>
    </main>
  );
}
