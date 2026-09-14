"use client";

/**
 * The generic duel room -- the ONE thing every game shares, per the Nizalo
 * Table System spec's "one club, ten tables": connection state, both
 * player strips, the clock, draw agreement, resign, the result ceremony,
 * reconnect, spectator handling, and the chat slot.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { useDuelSocket } from "@/lib/use-duel-socket";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { useProgressionSnapshot } from "@/lib/use-progression-snapshot";
import { ChatDrawer } from "@/components/chat/ChatDrawer";
import { PlayerStrip } from "@/components/game/PlayerStrip";
import { ResultCeremony } from "@/components/game/ResultCeremony";
import { TableEnvironmentProvider } from "@/components/game/TableEnvironment";
import { GameVisualSettings } from "@/components/game/GameVisualSettings";
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
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<unknown>(null);
  const [clock, setClock] = useState<{ model?: string; remaining?: number[]; toMove?: number; remainingMs?: number } | null>(null);
  const [connectedSeats, setConnectedSeats] = useState<[boolean, boolean] | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!latest || typeof latest !== "object") return;
    const msg = latest as Record<string, unknown>;
    if (msg.t === "STATE") {
      if (Array.isArray(msg.players)) setPlayers(msg.players as string[]);
      if (typeof msg.gameId === "string") setGameId(msg.gameId);
    }
    if ("view" in msg && msg.view !== undefined && msg.view !== null) {
      setView(msg.view);
    }
    if ("clock" in msg && msg.clock !== undefined && msg.clock !== null) {
      setClock(msg.clock as { model?: string; remaining?: number[]; toMove?: number; remainingMs?: number });
    }
    if ("connectedSeats" in msg && Array.isArray(msg.connectedSeats)) {
      setConnectedSeats(msg.connectedSeats as [boolean, boolean]);
    }
  }, [latest]);

  const isSharedClock = clock?.model === "SHARED";
  const stateStatus = latest?.t === "STATE" ? (latest as { status?: unknown }).status : null;
  const stateOutcome = latest?.t === "STATE"
    ? (latest as { outcome?: { result?: unknown; reason?: unknown } | null }).outcome
    : null;
  const completed = latest?.t === "COMPLETED" || stateStatus === "COMPLETED";
  const result = latest?.t === "COMPLETED"
    ? String((latest as { result?: unknown }).result)
    : stateStatus === "COMPLETED" && stateOutcome
    ? String(stateOutcome.result)
    : null;
  const reason = latest?.t === "COMPLETED"
    ? String((latest as { reason?: unknown }).reason)
    : stateStatus === "COMPLETED" && stateOutcome
    ? String(stateOutcome.reason)
    : null;

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
  const opponentConnected = vsComputer
    ? true
    : opponentSeat !== null && connectedSeats
    ? Boolean(connectedSeats[opponentSeat])
    : true;

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
  }, [players, opponentSeat]);

  const canMove = !isSpectator && !completed && connected && mySeat !== null
    && (isSharedClock ? true : clock?.toMove === mySeat);

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
    <TableEnvironmentProvider>
      <main className="nz-container">
        <div className={styles.statusBar}>
          <span className={styles.statusGroup}>
            <span className={connected ? styles.live : styles.offline}>{connectionLabel}</span>
            {isSpectator && <span className={styles.spectatorBadge}>{t("game.spectating")}</span>}
            {!vsComputer && opponentSeat !== null && connectedSeats && !opponentConnected && !completed && (
              <span className={styles.waitingBadge} title="في انتظار دخول الطرف الثاني للمبارزة">
                <span className={styles.waitingDot} />
                {locale === "ar" ? "في انتظار الخصم..." : "Waiting for opponent..."}
              </span>
            )}
          </span>
          <div className={styles.statusActions}>
            {seat !== undefined && (
              <button
                type="button"
                className={[styles.chatBtn, chatOpen ? styles.chatBtnActive : ""].join(" ")}
                onClick={() => setChatOpen((prev) => !prev)}
                aria-label={locale === "ar" ? "الدردشة" : "Chat"}
                title={locale === "ar" ? "شات المباراة" : "Match Chat"}
              >
                <span className={styles.chatIcon}>💬</span>
                <span className={styles.chatLabel}>{locale === "ar" ? "الشات" : "Chat"}</span>
                {chatUnread > 0 && (
                  <span className={styles.chatBadge}>{chatUnread > 9 ? "9+" : chatUnread}</span>
                )}
              </button>
            )}
            <GameVisualSettings />
          </div>
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
            gameId={gameId ?? "game"}
            delta={delta}
            onRematch={() => void handleRematch()}
            rematchBusy={rematchBusy}
          />
        ) : plugin && view ? (
          <div className={styles.duelArena}>
            {players && opponentSeat !== null && (
              <PlayerStrip
                playerId={players[opponentSeat] ?? ""}
                active={isSharedClock ? true : clock?.toMove === opponentSeat}
                remainingMs={isSharedClock ? clock?.remainingMs ?? null : clock?.remaining?.[opponentSeat] ?? null}
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
                active={isSharedClock ? true : clock?.toMove === mySeat}
                remainingMs={isSharedClock ? clock?.remainingMs ?? null : clock?.remaining?.[mySeat] ?? null}
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
          </div>
        ) : (
          <p className={styles.playerLine}>{t("game.connecting")}</p>
        )}

        {resignConfirmOpen && mounted && typeof document !== "undefined" && createPortal(
          <div
            className={styles.confirmOverlay}
            role="dialog"
            aria-modal="true"
            aria-label={t("game.resign_confirm_title")}
            onClick={(e) => {
              if (e.target === e.currentTarget) setResignConfirmOpen(false);
            }}
          >
            <div className={styles.confirmCard} onClick={(e) => e.stopPropagation()}>
              <div className={styles.confirmIcon}>🏳️</div>
              <h2 className={styles.confirmTitle}>{t("game.resign_confirm_title")}</h2>
              <p className={styles.confirmBody}>{t("game.resign_confirm_body")}</p>
              <div className={styles.confirmActions}>
                <button
                  type="button"
                  className={styles.confirmBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    resign();
                    setResignConfirmOpen(false);
                  }}
                >
                  {t("game.confirm")}
                </button>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setResignConfirmOpen(false);
                  }}
                >
                  {t("game.cancel")}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        <p className={styles.playerLine}>
          {isSpectator ? t("game.watching_as", { handle: player?.handle ?? "" }) : t("game.playing_as", { handle: player?.handle ?? "" })}
        </p>

        {seat !== undefined && (
          <ChatDrawer
            channelKind={isSpectator ? "SPECTATOR" : "MATCH"}
            duelId={duelId}
            isOpen={chatOpen}
            onOpenChange={setChatOpen}
            onUnreadChange={setChatUnread}
          />
        )}
      </main>
    </TableEnvironmentProvider>
  );
}
