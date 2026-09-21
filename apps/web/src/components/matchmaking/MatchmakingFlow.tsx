"use client";

/**
 * PLAY -> SELECT GAME -> MATCHMAKING -> FINDING OPPONENT -> OPPONENT FOUND
 * -> VS -> 3 -> 2 -> 1 -> GO.
 *
 * UX objective: give real, honest feedback while the player waits, and make
 * the reveal feel like the start of something, not a loading spinner.
 * Psychological objective: anticipation and focus -- never fake urgency.
 * Per docs/brand/BRAND_GUIDELINES.md and the platform's own ethics rules,
 * every number shown here (elapsed wait time, opponent handle) is real; no
 * fabricated "players online" or fake activity is ever shown.
 *
 * Motion: each phase transition is a single cross-fade (200ms, ease-out --
 * the "reveal" token), never a spinner-then-jump-cut. The countdown itself
 * uses the snap easing (reward-adjacent: it is building toward the start of
 * competition, the one place outside an actual win/achievement where a
 * playful overshoot is earned). Reduced motion: countdown numbers still
 * change on the same 1-second cadence, just without the scale/opacity
 * animation -- the information (the count) is never motion-only.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { get, post, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useAuthPopup } from "@/lib/auth-popup-context";
import { useI18n } from "@/lib/i18n/context";
import { transition } from "@/lib/motion";
import { Countdown } from "@/components/game/Countdown";
import { LocaleLink } from "@/components/LocaleLink";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/profile/Avatar";
import type { StakeChoice } from "@/components/play/StakeSelect";
import styles from "./MatchmakingFlow.module.css";

type Ticket = { id: string; game_id: string; status: string; duel_id: string | null; enqueued_at: string } | null;
type Duel = { id: string; game_id: string; seat_0: string; seat_1: string };
type OpponentInfo = { id: string; handle: string };

const GAME_NAME_KEY: Record<string, string> = { chess: "chess", "speed-math": "speed_math" };

export function MatchmakingFlow({ gameId, stake }: { gameId: string; stake?: StakeChoice }) {
  const { player } = useAuth();
  const { openPopup } = useAuthPopup();
  const { t, locale } = useI18n();
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const [phase, setPhase] = useState<"queuing" | "waiting" | "matched" | "countdown" | "error">("queuing");
  const [error, setError] = useState<string | null>(null);
  const [insufficientFunds, setInsufficientFunds] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [opponent, setOpponent] = useState<OpponentInfo | null>(null);
  const [duelId, setDuelId] = useState<string | null>(null);

  const cancelledRef = useRef(false);
  const ticketIdRef = useRef<string | null>(null);

  // Enqueue once on mount.
  useEffect(() => {
    cancelledRef.current = false;
    ticketIdRef.current = null;
    if (!player) {
      setError(locale === "ar" ? "يرجى تسجيل الدخول للبدء في التوفيق والمبارزة" : "Please log in to enter matchmaking");
      setPhase("error");
      openPopup();
      return;
    }
    (async () => {
      try {
        const activeRes = await get<{ active: boolean; duel?: { id: string; gameId: string } }>("/v1/me/active-duel").catch(() => null);
        if (activeRes?.active && activeRes.duel && activeRes.duel.gameId === gameId) {
          router.replace(`/${locale}/game/${activeRes.duel.id}`);
          return;
        }

        const res = await post<{ ticketId?: string }>("/v1/matchmaking/tickets", {
          gameId,
          ...(stake?.tier === "CASH" ? { tier: "CASH", stakeMinor: stake.stakeMinor, asset: stake.asset } : {}),
        });
        if (res?.ticketId) {
          ticketIdRef.current = String(res.ticketId);
        }
        if (!cancelledRef.current) setPhase("waiting");
      } catch (e) {
        if (e instanceof ApiError && e.code === "ALREADY_QUEUED") {
          setPhase("waiting");
        } else if (e instanceof ApiError && e.code === "INSUFFICIENT_FUNDS") {
          setError(t("matchmaking.error_insufficient_funds"));
          setInsufficientFunds(true);
          setPhase("error");
        } else {
          setError(t("matchmaking.join_error"));
          setPhase("error");
        }
      }
    })();
    return () => { cancelledRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, player]);

  // Poll for a match while waiting.
  useEffect(() => {
    if (phase !== "waiting") return;
    const started = Date.now();
    const timer = setInterval(async () => {
      setElapsedSec(Math.floor((Date.now() - started) / 1000));
      try {
        const url = ticketIdRef.current
          ? `/v1/matchmaking/status?ticketId=${encodeURIComponent(ticketIdRef.current)}`
          : "/v1/matchmaking/status";
        const { ticket } = await get<{ ticket: Ticket }>(url);
        if (cancelledRef.current) return;
        if (ticket && !ticketIdRef.current && ticket.id) {
          ticketIdRef.current = String(ticket.id);
        }
        if (ticket?.status === "MATCHED" && ticket.duel_id) {
          clearInterval(timer);
          setDuelId(ticket.duel_id);
          const duel = await get<Duel>(`/v1/duels/${ticket.duel_id}`);
          const opponentId = duel.seat_0 === player?.id ? duel.seat_1 : duel.seat_0;
          const info = await get<OpponentInfo>(`/v1/players/${opponentId}`);
          if (!cancelledRef.current) {
            setOpponent(info);
            setPhase("matched");
          }
        }
      } catch {
        // A transient poll failure is not fatal -- try again next tick.
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, player?.id]);

  // "Matched" reveal, then countdown.
  useEffect(() => {
    if (phase !== "matched") return;
    const timer = setTimeout(() => setPhase("countdown"), 1400);
    return () => clearTimeout(timer);
  }, [phase]);

  async function cancel() {
    cancelledRef.current = true;
    await post("/v1/matchmaking/cancel").catch(() => {});
    router.push(`/${locale}/play`);
  }

  const gameName = t(`common.game_names.${GAME_NAME_KEY[gameId] ?? gameId}`);
  const findingMessage = t(`matchmaking.finding_${Math.min(Math.floor(elapsedSec / 4) + 1, 3)}`);

  return (
    <div className={styles.stage}>
      <AnimatePresence mode="wait">
        {phase === "queuing" && (
          <motion.div key="queuing" {...fade(reduceMotion)} className={styles.center}>
            <p className={styles.status}>{t("matchmaking.joining_queue", { game: gameName })}</p>
          </motion.div>
        )}

        {phase === "waiting" && (
          <motion.div key="waiting" {...fade(reduceMotion)} className={styles.center}>
            <div className={styles.radarContainer}>
              <div className={styles.radarPulse}></div>
              <div className={styles.radarPulseDelay}></div>
              <div className={styles.radarCore}></div>
            </div>
            <p className={styles.radarStatus}>{findingMessage}</p>
            <p className={`nz-num ${styles.timer}`}>{formatElapsed(elapsedSec)}</p>
            <button className={styles.cancelLink} onClick={() => void cancel()}>{t("matchmaking.cancel")}</button>
          </motion.div>
        )}

        {phase === "matched" && opponent && (
          <motion.div key="matched" {...fade(reduceMotion)} className={styles.vsDramaticWrap}>
            <motion.div 
              className={styles.vsPlayerSide}
              initial={{ x: -100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ type: "spring", damping: 12 }}
            >
              <Avatar nickname={player?.handle || "You"} avatarUrl={null} size={100} />
              <span className={styles.vsHandleDramatic}>{player?.handle}</span>
            </motion.div>
            
            <motion.div 
              className={styles.vsLightningCenter}
              initial={{ scale: 0, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
            >
              <span className={styles.vsMarkDramatic}>VS</span>
            </motion.div>

            <motion.div 
              className={styles.vsPlayerSide}
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ type: "spring", damping: 12 }}
            >
              <Avatar nickname={opponent.handle} avatarUrl={null} size={100} />
              <span className={styles.vsHandleDramatic}>{opponent.handle}</span>
            </motion.div>
          </motion.div>
        )}

        {phase === "countdown" && duelId && (
          <Countdown key="countdown" onComplete={() => router.push(`/${locale}/game/${duelId}`)} />
        )}

        {phase === "error" && (
          <motion.div key="error" {...fade(reduceMotion)} className={styles.center}>
            <p className={styles.status} role="alert">{error}</p>
            {!player ? (
              <div style={{ marginTop: "16px", display: "flex", gap: "10px", justifyContent: "center" }}>
                <Button variant="primary" onClick={openPopup}>
                  {t("nav.log_in")}
                </Button>
                <button
                  type="button"
                  onClick={() => router.push(`/${locale}/play`)}
                  style={{
                    padding: "8px 16px",
                    background: "transparent",
                    color: "var(--nz-text-2)",
                    border: "1px solid var(--nz-border)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  {t("matchmaking.back_to_play")}
                </button>
              </div>
            ) : insufficientFunds ? (
              <div style={{ marginTop: "16px", display: "flex", gap: "10px", justifyContent: "center" }}>
                <LocaleLink href="/wallet">
                  <button
                    type="button"
                    style={{
                      padding: "8px 20px",
                      background: "#22c55e",
                      color: "#fff",
                      border: "none",
                      borderRadius: "8px",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    💳 {t("matchmaking.deposit_usdt")}
                  </button>
                </LocaleLink>
                <button
                  type="button"
                  onClick={() => router.push(`/${locale}/play`)}
                  style={{
                    padding: "8px 16px",
                    background: "transparent",
                    color: "var(--nz-text-2)",
                    border: "1px solid var(--nz-border)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  {t("matchmaking.back_to_play")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={styles.cancelLink}
                onClick={() => router.push(`/${locale}/play`)}
                style={{ marginTop: "12px" }}
              >
                {t("matchmaking.cancel")}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function fade(reduceMotion: boolean | null) {
  return {
    initial: reduceMotion ? {} : { opacity: 0 },
    animate: { opacity: 1 },
    exit: reduceMotion ? {} : { opacity: 0 },
    transition: transition.reveal,
  };
}

function formatElapsed(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
