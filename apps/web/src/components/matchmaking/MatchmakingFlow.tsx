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
import { useI18n } from "@/lib/i18n/context";
import { transition } from "@/lib/motion";
import { Countdown } from "@/components/game/Countdown";
import type { StakeChoice } from "@/components/play/StakeSelect";
import styles from "./MatchmakingFlow.module.css";

type Ticket = { id: string; game_id: string; status: string; duel_id: string | null; enqueued_at: string } | null;
type Duel = { id: string; game_id: string; seat_0: string; seat_1: string };
type OpponentInfo = { id: string; handle: string };

const GAME_NAME_KEY: Record<string, string> = { chess: "chess", "speed-math": "speed_math" };

export function MatchmakingFlow({ gameId, stake }: { gameId: string; stake?: StakeChoice }) {
  const { player } = useAuth();
  const { t, locale } = useI18n();
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const [phase, setPhase] = useState<"queuing" | "waiting" | "matched" | "countdown" | "error">("queuing");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [opponent, setOpponent] = useState<OpponentInfo | null>(null);
  const [duelId, setDuelId] = useState<string | null>(null);

  const cancelledRef = useRef(false);

  // Enqueue once on mount.
  useEffect(() => {
    cancelledRef.current = false;
    (async () => {
      try {
        await post("/v1/matchmaking/tickets", {
          gameId,
          ...(stake?.tier === "CASH" ? { tier: "CASH", stakeMinor: stake.stakeMinor } : {}),
        });
        if (!cancelledRef.current) setPhase("waiting");
      } catch (e) {
        if (e instanceof ApiError && e.code === "ALREADY_QUEUED") {
          setPhase("waiting");
        } else {
          setError(t("matchmaking.join_error"));
          setPhase("error");
        }
      }
    })();
    return () => { cancelledRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  // Poll for a match while waiting.
  useEffect(() => {
    if (phase !== "waiting") return;
    const started = Date.now();
    const timer = setInterval(async () => {
      setElapsedSec(Math.floor((Date.now() - started) / 1000));
      try {
        const { ticket } = await get<{ ticket: Ticket }>("/v1/matchmaking/status");
        if (cancelledRef.current) return;
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
            <p className={styles.status}>{findingMessage}</p>
            <p className={`nz-num ${styles.timer}`}>{formatElapsed(elapsedSec)}</p>
            <button className={styles.cancelLink} onClick={() => void cancel()}>{t("matchmaking.cancel")}</button>
          </motion.div>
        )}

        {phase === "matched" && opponent && (
          <motion.div key="matched" {...fade(reduceMotion)} className={styles.vsWrap}>
            <div className={styles.vsSide}>
              <span className={styles.vsLabel}>{t("matchmaking.you")}</span>
              <span className={styles.vsHandle}>{player?.handle}</span>
            </div>
            <span className={styles.vsMark}>{t("matchmaking.vs")}</span>
            <div className={styles.vsSide}>
              <span className={styles.vsLabel}>{t("matchmaking.opponent")}</span>
              <span className={styles.vsHandle}>{opponent.handle}</span>
            </div>
          </motion.div>
        )}

        {phase === "countdown" && duelId && (
          <Countdown key="countdown" onComplete={() => router.push(`/${locale}/game/${duelId}`)} />
        )}

        {phase === "error" && (
          <motion.div key="error" {...fade(reduceMotion)} className={styles.center}>
            <p className={styles.status} role="alert">{error}</p>
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
