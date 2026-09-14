"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { get, post } from "@/lib/api";
import styles from "./NotificationCenter.module.css";

const GAME_NAME_KEY: Record<string, string> = {
  chess: "chess",
  "speed-math": "speed_math",
  dominoes: "dominoes",
  backgammon: "backgammon",
  reversi: "reversi",
  checkers: "checkers",
  connect_four: "connect_four",
  battleship: "battleship",
  tic_tac_toe: "tic_tac_toe",
  mancala: "mancala",
};

type IncomingChallenge = {
  id: string;
  game_id: string;
  created_at: string;
  expires_at: string;
  tier: "FREE" | "CASH";
  stake_minor: string;
  asset: string | null;
  challenger_id: string;
  challenger_handle: string;
};

type OutgoingChallenge = {
  id: string;
  game_id: string;
  created_at: string;
  expires_at: string;
  tier: "FREE" | "CASH";
  stake_minor: string;
  asset: string | null;
  opponent_id: string;
  opponent_handle: string;
  status?: string;
  duel_id?: string | null;
};

export function NotificationCenter() {
  const { player } = useAuth();
  const { locale, t } = useI18n();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [incoming, setIncoming] = useState<IncomingChallenge[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingChallenge[]>([]);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!player) return;
    try {
      const r = await get<{ incoming: IncomingChallenge[]; outgoing: OutgoingChallenge[] }>("/v1/challenges");
      setIncoming(r.incoming || []);
      setOutgoing(r.outgoing || []);
    } catch {
      // transient network poll failure
    }
  }, [player]);

  useEffect(() => {
    if (!player) return;
    void refresh();
    const interval = setInterval(() => void refresh(), 2500);
    return () => clearInterval(interval);
  }, [player, refresh]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleAccept(challengeId: string) {
    setBusyActionId(challengeId);
    try {
      const r = await post<{ duelId: string }>(`/v1/challenges/${challengeId}/accept`);
      setOpen(false);
      router.push(`/${locale}/game/${r.duelId}`);
    } catch {
      await refresh();
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleDecline(challengeId: string) {
    setBusyActionId(challengeId);
    try {
      await post(`/v1/challenges/${challengeId}/decline`);
      await refresh();
    } catch {
      // ignore
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleCancel(challengeId: string) {
    setBusyActionId(challengeId);
    try {
      await post(`/v1/challenges/${challengeId}/cancel`);
      await refresh();
    } catch {
      // ignore
    } finally {
      setBusyActionId(null);
    }
  }

  // Count active notifications
  const acceptedOutgoing = outgoing.filter((c) => c.status === "ACCEPTED" && c.duel_id);
  const pendingOutgoing = outgoing.filter((c) => c.status === "PENDING" || !c.status);
  const activeCount = incoming.length + acceptedOutgoing.length;

  if (!player) return null;

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.bellBtn} ${open ? styles.bellBtnActive : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-label={t("notifications.title")}
        aria-expanded={open}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {activeCount > 0 && (
          <span className={styles.badge}>{activeCount > 9 ? "9+" : activeCount}</span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.panel}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
          >
            <div className={styles.panelHead}>
              <h3 className={styles.panelTitle}>{t("notifications.title")}</h3>
              {(incoming.length > 0 || outgoing.length > 0) && (
                <button type="button" className={styles.clearBtn} onClick={() => setOpen(false)}>
                  ✕
                </button>
              )}
            </div>

            <div className={styles.panelBody}>
              {/* Accepted Match Challenges (Ready to Enter) */}
              {acceptedOutgoing.map((c) => {
                const gameName = t(`common.game_names.${GAME_NAME_KEY[c.game_id] ?? c.game_id}`);
                return (
                  <div key={`acc-${c.id}`} className={`${styles.challengeCard} ${styles.challengeCardAccepted}`}>
                    <div className={styles.challengeHeader}>
                      <span className={styles.challengeUser}>🎉 {c.opponent_handle}</span>
                      <span style={{ fontSize: "11px", color: "#22c55e", fontWeight: 700 }}>
                        {t("notifications.challenge_accepted", { handle: c.opponent_handle })}
                      </span>
                    </div>
                    <div className={styles.challengeMeta}>
                      {t("notifications.challenge_accepted", { handle: c.opponent_handle, game: gameName })}
                    </div>
                    <button
                      type="button"
                      className={styles.btnJoin}
                      onClick={() => {
                        setOpen(false);
                        router.push(`/${locale}/game/${c.duel_id}`);
                      }}
                    >
                      🚀 {t("notifications.join_match")}
                    </button>
                  </div>
                );
              })}

              {/* Incoming Challenges */}
              {incoming.length > 0 && (
                <div>
                  <div className={styles.sectionHeading}>{t("notifications.active_challenges")}</div>
                  {incoming.map((c) => {
                    const gameName = t(`common.game_names.${GAME_NAME_KEY[c.game_id] ?? c.game_id}`);
                    const remainingSec = Math.max(0, Math.floor((new Date(c.expires_at).getTime() - Date.now()) / 1000));
                    return (
                      <div key={c.id} className={`${styles.challengeCard} ${styles.challengeCardIncoming}`}>
                        <div className={styles.challengeHeader}>
                          <span className={styles.challengeUser}>⚔️ {c.challenger_handle}</span>
                          <span className={styles.timerPill}>
                            {t("notifications.expires_in", { sec: remainingSec })}
                          </span>
                        </div>
                        <div className={styles.challengeMeta}>
                          {t("notifications.incoming_challenge", { handle: c.challenger_handle, game: gameName })}
                          {c.tier === "CASH" && (
                            <span style={{ display: "block", color: "#22c55e", fontWeight: 700, marginTop: "2px" }}>
                              💰 {Number(BigInt(c.stake_minor) / 1_000_000n)} USDT
                            </span>
                          )}
                        </div>
                        <div className={styles.challengeActions}>
                          <button
                            type="button"
                            className={styles.btnAccept}
                            disabled={busyActionId === c.id}
                            onClick={() => void handleAccept(c.id)}
                          >
                            {t("notifications.accept")}
                          </button>
                          <button
                            type="button"
                            className={styles.btnDecline}
                            disabled={busyActionId === c.id}
                            onClick={() => void handleDecline(c.id)}
                          >
                            {t("notifications.decline")}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Outgoing Challenges Waiting for Opponent */}
              {pendingOutgoing.length > 0 && (
                <div>
                  <div className={styles.sectionHeading}>{t("notifications.timeline")}</div>
                  {pendingOutgoing.map((c) => {
                    const gameName = t(`common.game_names.${GAME_NAME_KEY[c.game_id] ?? c.game_id}`);
                    return (
                      <div key={c.id} className={styles.challengeCard}>
                        <div className={styles.challengeHeader}>
                          <span className={styles.challengeUser}>⏳ @{c.opponent_handle}</span>
                          <button
                            type="button"
                            className={styles.clearBtn}
                            disabled={busyActionId === c.id}
                            onClick={() => void handleCancel(c.id)}
                          >
                            {t("notifications.cancel")}
                          </button>
                        </div>
                        <div className={styles.challengeMeta}>
                          {t("notifications.outgoing_waiting", { handle: c.opponent_handle, game: gameName })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Empty state */}
              {incoming.length === 0 && outgoing.length === 0 && (
                <div className={styles.emptyBox}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  <p>{t("notifications.empty")}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
