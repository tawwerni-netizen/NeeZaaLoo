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
import { LiveMatchShareModal } from "@/components/game/LiveMatchShareModal";
import { getGame } from "@/lib/games";
import { get, post } from "@/lib/api";
import { playUndoSound } from "@/lib/chess-audio";
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
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [completedInfo, setCompletedInfo] = useState<{
    completed: boolean;
    result: string | null;
    reason: string | null;
  }>({ completed: false, result: null, reason: null });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!latest || typeof latest !== "object") return;
    const msg = latest as Record<string, unknown>;
    if (msg.t === "STATE") {
      if (Array.isArray(msg.players)) setPlayers(msg.players as string[]);
      if (typeof msg.gameId === "string") setGameId(msg.gameId);
      if (msg.status === "COMPLETED" || msg.status === "SETTLED") {
        const outcome = msg.outcome as { result?: unknown; reason?: unknown } | undefined;
        setCompletedInfo({
          completed: true,
          result: outcome?.result ? String(outcome.result) : null,
          reason: outcome?.reason ? String(outcome.reason) : null,
        });
      }
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
    if (msg.t === "COMPLETED") {
      setCompletedInfo({
        completed: true,
        result: msg.result ? String(msg.result) : null,
        reason: msg.reason ? String(msg.reason) : null,
      });
    }
    if (msg.t === "EVENT" && msg.type === "DUEL_COMPLETED") {
      const payload = msg.payload as { result?: unknown; reason?: unknown } | undefined;
      setCompletedInfo({
        completed: true,
        result: payload?.result ? String(payload.result) : null,
        reason: payload?.reason ? String(payload.reason) : null,
      });
    }
  }, [latest]);

  // Active status fallback polling: ensures resignation or winning move updates promptly even if WS frame is delayed
  useEffect(() => {
    if (completedInfo.completed) return;
    let timer: ReturnType<typeof setInterval>;
    let cancelled = false;

    const checkStatus = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const d = await get<{
          id?: string;
          game_id?: string;
          seat_0?: string;
          seat_1?: string;
          status?: string;
          result?: string | null;
          termination_reason?: string | null;
          is_vs_computer?: boolean;
        }>(
          `/v1/duels/${encodeURIComponent(duelId)}`
        );
        if (!cancelled && d) {
          if (d.game_id) setGameId((prev) => prev ?? d.game_id!);
          if (d.seat_0 && d.seat_1) setPlayers((prev) => prev ?? [d.seat_0!, d.seat_1!]);
          if (d.status === "COMPLETED" || d.status === "SETTLED") {
            setCompletedInfo({
              completed: true,
              result: d.result ?? null,
              reason: d.termination_reason ?? null,
            });
          }
        }
      } catch {
        // Non-fatal poll error
      }
    };

    // Immediate fetch on mount ensures initial duel metadata is populated without waiting for interval or WS handshake
    void checkStatus();
    timer = setInterval(() => void checkStatus(), 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [duelId, completedInfo.completed]);

  const isSharedClock = clock?.model === "SHARED";
  const completed = completedInfo.completed;
  const result = completedInfo.result;
  const reason = completedInfo.reason;

  // Persist handled duel in sessionStorage so player is never bounced back after match finishes
  useEffect(() => {
    if (completed) {
      try {
        const stored = sessionStorage.getItem("nizalo_handled_duels");
        const list = stored ? (JSON.parse(stored) as string[]) : [];
        if (!list.includes(duelId)) {
          list.push(duelId);
          sessionStorage.setItem("nizalo_handled_duels", JSON.stringify(list));
        }
      } catch {
        // Non-fatal
      }
    }
  }, [completed, duelId]);

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
  const botDifficulty = botId ? (BOT_DIFFICULTY[botId] ?? "MEDIUM") : null;
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
    && (isSharedClock ? true : (clock?.toMove ?? (view as { turn?: number } | null)?.turn) === mySeat);

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
            {isSpectator && (
              <span className={styles.spectatorBadge} title="مشاهدة فقط بدون تدخل في سير اللعب">
                👁️ {locale === "ar" ? "مشاهدة مباشرة (قراءة فقط)" : "Live Spectator (Read-Only)"}
              </span>
            )}
            {!vsComputer && opponentSeat !== null && connectedSeats && !opponentConnected && !completed && (
              <span className={styles.waitingBadge} title="في انتظار دخول الطرف الثاني للمبارزة">
                <span className={styles.waitingDot} />
                {locale === "ar" ? "في انتظار الخصم..." : "Waiting for opponent..."}
              </span>
            )}
          </span>
          <div className={styles.statusActions}>
            <button
              type="button"
              className={styles.shareLiveBtn}
              onClick={() => setShareModalOpen(true)}
              aria-label={locale === "ar" ? "مشاركة البث المباشر" : "Share Live Stream"}
              title={locale === "ar" ? "مشاركة البث المباشر بـ 6 لغات" : "Share live duel across 6 languages"}
            >
              <span className={styles.shareIcon}>📡</span>
              <span className={styles.shareLabel}>{locale === "ar" ? "مشاركة البث" : "Share Live"}</span>
            </button>

            {!isSpectator && seat !== undefined && (
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
        ) : plugin && (view || plugin.id === "billiards") ? (
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
              view={view ?? {}}
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
                {vsComputer && botDifficulty === "EASY" && gameId === "chess" && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      sendIntent("undo");
                      playUndoSound();
                    }}
                    disabled={!canMove}
                  >
                    ↩ {locale === "ar" ? "تراجع عن الحركة" : "Undo Move"}
                  </Button>
                )}
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

        {!isSpectator && seat !== undefined && (
          <ChatDrawer
            channelKind="MATCH"
            duelId={duelId}
            isOpen={chatOpen}
            onOpenChange={setChatOpen}
            onUnreadChange={setChatUnread}
          />
        )}

        <LiveMatchShareModal
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          duelId={duelId}
          gameId={gameId ?? "game"}
          gameName={plugin ? t(`common.game_names.${plugin.nameKey}`) : undefined}
          player1={players?.[0] ? (players[0] === player?.id ? (player?.handle || "You") : (players[0].startsWith("ai-") ? "Computer" : players[0])) : "Player 1"}
          player2={players?.[1] ? (players[1] === player?.id ? (player?.handle || "You") : (players[1].startsWith("ai-") ? "Computer" : players[1])) : "Player 2"}
        />
      </main>
    </TableEnvironmentProvider>
  );
}
