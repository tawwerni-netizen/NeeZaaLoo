"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { get, post } from "@/lib/api";
import { useVisibilityAwareInterval } from "@/lib/use-interval";
import {
  isPushNotificationSupported,
  checkPushSubscriptionActive,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from "@/lib/push-notifications";
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
  ludo: "ludo",
  gomoku: "gomoku",
  seega: "seega",
  xo: "xo",
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

type SystemNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: any;
  read_at: string | null;
  created_at: string;
};

export function NotificationCenter() {
  const { player } = useAuth();
  const { locale, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const isAr = locale === "ar";

  const [open, setOpen] = useState(false);
  const [incoming, setIncoming] = useState<IncomingChallenge[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingChallenge[]>([]);
  const [systemNotes, setSystemNotes] = useState<SystemNotification[]>([]);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  // Web Push State
  const [pushSupported, setPushSupported] = useState(false);
  const [pushActive, setPushActive] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on route navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Check push support and current status
  useEffect(() => {
    if (typeof window !== "undefined") {
      const supported = isPushNotificationSupported();
      setPushSupported(supported);
      if (supported && player) {
        checkPushSubscriptionActive().then(setPushActive).catch(() => {});
      }
    }
  }, [player]);

  const refresh = useCallback(async () => {
    if (!player) return;
    try {
      const [rChallenges, rNotes] = await Promise.allSettled([
        get<{ incoming: IncomingChallenge[]; outgoing: OutgoingChallenge[] }>("/v1/challenges"),
        get<{ notifications: SystemNotification[] }>("/v1/me/notifications?limit=8"),
      ]);

      if (rChallenges.status === "fulfilled") {
        setIncoming(rChallenges.value.incoming || []);
        setOutgoing(rChallenges.value.outgoing || []);
      }
      if (rNotes.status === "fulfilled") {
        setSystemNotes(rNotes.value.notifications || []);
      }
    } catch {
      // transient network poll failure
    }
  }, [player]);

  useEffect(() => {
    if (!player) return;
    void refresh();
  }, [player, refresh]);

  useVisibilityAwareInterval(refresh, player ? 10000 : false);

  // Click / Touch outside to close
  useEffect(() => {
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleOutside);
      document.addEventListener("touchstart", handleOutside, { passive: true });
    }
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [open]);

  async function handleTogglePush() {
    if (!pushSupported || pushBusy) return;
    setPushBusy(true);
    try {
      if (pushActive) {
        await unsubscribeFromPushNotifications();
        setPushActive(false);
      } else {
        const res = await subscribeToPushNotifications();
        if (res.ok) {
          setPushActive(true);
        }
      }
    } finally {
      setPushBusy(false);
    }
  }

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

  async function handleSystemNoteClick(note: SystemNotification) {
    try {
      if (!note.read_at) {
        await post(`/v1/me/notifications/${note.id}/read`).catch(() => {});
        setSystemNotes((prev) =>
          prev.map((n) => (n.id === note.id ? { ...n, read_at: new Date().toISOString() } : n))
        );
      }
      if (note.data?.url) {
        setOpen(false);
        router.push(note.data.url.startsWith("/") ? `/${locale}${note.data.url}` : note.data.url);
      } else if (note.data?.tournamentId) {
        setOpen(false);
        router.push(`/${locale}/tournaments/${note.data.tournamentId}`);
      } else if (note.data?.duelId) {
        setOpen(false);
        router.push(`/${locale}/game/${note.data.duelId}`);
      }
    } catch {
      // ignore
    }
  }

  // Count active notifications
  const acceptedOutgoing = outgoing.filter((c) => c.status === "ACCEPTED" && c.duel_id);
  const pendingOutgoing = outgoing.filter((c) => c.status === "PENDING" || !c.status);
  const unreadNotesCount = systemNotes.filter((n) => !n.read_at).length;
  const activeCount = incoming.length + acceptedOutgoing.length + unreadNotesCount;

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
          <>
            <div
              className={styles.backdrop}
              onClick={() => setOpen(false)}
              onTouchStart={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              className={styles.panel}
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.15 }}
            >
              <div className={styles.panelHead}>
                <h3 className={styles.panelTitle}>{t("notifications.title")}</h3>
                <button
                  type="button"
                  className={styles.clearBtn}
                  onClick={() => setOpen(false)}
                  aria-label={isAr ? "إغلاق" : "Close"}
                >
                  ✕
                </button>
              </div>

              {/* Web Push 1-Tap Toggle Banner */}
              {pushSupported && (
                <div className={styles.pushBanner}>
                  <span className={styles.pushBannerText}>
                    {pushActive ? "🔔 " : "📲 "}
                    {pushActive
                      ? (isAr ? "إشعارات الهاتف مفعلة" : "Push alerts enabled")
                      : (isAr ? "تفعيل إشعارات الهاتف المباشرة" : "Enable lock-screen alerts")}
                  </span>
                  <button
                    type="button"
                    className={`${styles.pushActionBtn} ${pushActive ? styles.pushActionBtnActive : ""}`}
                    onClick={handleTogglePush}
                    disabled={pushBusy}
                  >
                    {pushBusy
                      ? "..."
                      : pushActive
                      ? (isAr ? "تعطيل" : "Mute")
                      : (isAr ? "تفعيل" : "Enable")}
                  </button>
                </div>
              )}

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
                            <span className={styles.challengeUser}>⚔️ @{c.challenger_handle}</span>
                            <span className={styles.expiryBadge}>
                              {t("notifications.expires_in", { sec: remainingSec })}
                            </span>
                          </div>
                          <div className={styles.challengeMeta}>
                            {t("notifications.incoming_challenge", { handle: c.challenger_handle, game: gameName })}
                            {c.tier === "CASH" && (
                              <span style={{ marginInlineStart: "6px", color: "#f59e0b", fontWeight: 700 }}>
                                • {Number(c.stake_minor) / 1_000_000} {c.asset || "USDT"}
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

                {/* System Notifications (Tournaments, Matches, Account) */}
                {systemNotes.length > 0 && (
                  <div>
                    <div className={styles.sectionHeading}>
                      {isAr ? "إشعارات المنصة والبطولات" : "System & Arena Alerts"}
                    </div>
                    {systemNotes.map((note) => (
                      <div
                        key={note.id}
                        className={`${styles.systemCard} ${!note.read_at ? styles.systemCardUnread : ""}`}
                        onClick={() => handleSystemNoteClick(note)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className={styles.systemTitle}>
                          <span>{note.title}</span>
                          {!note.read_at && (
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                          )}
                        </div>
                        <div className={styles.systemBody}>{note.body}</div>
                        <div className={styles.systemTime}>
                          {new Date(note.created_at).toLocaleTimeString(isAr ? "ar-EG" : "en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    ))}
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
                {incoming.length === 0 && outgoing.length === 0 && systemNotes.length === 0 && (
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
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
