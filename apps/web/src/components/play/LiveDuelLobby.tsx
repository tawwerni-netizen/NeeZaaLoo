"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/Button";
import { get, post } from "@/lib/api";
import styles from "./LiveDuelLobby.module.css";

export interface OpenDuel {
  id: string;
  gameId: string;
  gameName: string;
  challenger: {
    handle: string;
    avatarLetter: string;
    elo: number;
    badge: string;
  };
  tier: "FREE" | "CASH";
  stakeUSDT: number;
  timeControl: string;
  createdSecondsAgo: number;
  isUserCreated?: boolean;
}

const INITIAL_OPEN_DUELS: OpenDuel[] = [];

const AVAILABLE_GAMES = [
  { id: "chess", labelEn: "Chess", labelAr: "شطرنج" },
  { id: "backgammon", labelEn: "Backgammon", labelAr: "طاولة زهر" },
  { id: "dominoes", labelEn: "Dominoes", labelAr: "دومينو" },
  { id: "connect-four", labelEn: "Connect Four", labelAr: "أربعة على التوالي" },
  { id: "xo", labelEn: "Tic-Tac-Toe (XO)", labelAr: "إكس أو" },
  { id: "checkers", labelEn: "Checkers", labelAr: "داما" },
  { id: "reversi", labelEn: "Reversi (Othello)", labelAr: "ريفيرسي" },
  { id: "gomoku", labelEn: "Gomoku", labelAr: "غوموكو" },
  { id: "seega", labelEn: "Seega", labelAr: "سيجة" },
  { id: "speed-math", labelEn: "Speed Math", labelAr: "الحساب السريع" },
];

export function LiveDuelLobby({ filterGameId }: { filterGameId?: string }) {
  const { locale, dir } = useI18n();
  const isRtl = dir === "rtl";
  const { player } = useAuth();
  const router = useRouter();

  const [duels, setDuels] = useState<OpenDuel[]>(INITIAL_OPEN_DUELS);
  const [lobbyStats, setLobbyStats] = useState({ activeMatches: 0, activePlayers: 0, openChallenges: 0 });
  
  useEffect(() => {
    // Fetch real live matches to spectate in the lobby
    get<{ duels: any[] }>("/v1/duels/live")
      .then((res: any) => {
        if (res && res.matches) {
          const mapped = res.matches.map((d: any) => {
            const gameObj = AVAILABLE_GAMES.find(g => g.id === d.gameId);
            const gameName = isRtl ? (gameObj?.labelAr || d.gameId) : (gameObj?.labelEn || d.gameId);
            return {
              id: d.duelId,
              gameId: d.gameId,
              gameName: gameName,
              challenger: {
                handle: d.players?.[0]?.handle || "Player 1",
                avatarLetter: (d.players?.[0]?.handle?.[0] || "P").toUpperCase(),
                elo: Math.floor((d.players?.[0]?.ratingX100 || 160000) / 100),
                badge: d.players?.[0]?.badge || "Player"
              },
              tier: "FREE" as const, // For now since we don't have tier in the live spectate output
              stakeUSDT: 0,
              timeControl: "Ongoing",
              createdSecondsAgo: Math.floor((Date.now() - new Date(d.startedAt).getTime()) / 1000),
              isUserCreated: false
            };
          });
          setDuels(mapped);
        }
      })
      .catch(console.error);

    // Fetch real lobby stats (Active Players, Open Challenges, etc)
    get<{ activeMatches: number; activePlayers: number; openChallenges: number }>("/v1/lobby/stats")
      .then((res: any) => {
        if (res) {
          setLobbyStats({
            activeMatches: res.activeMatches || 0,
            activePlayers: res.activePlayers || 0,
            openChallenges: res.openChallenges || 0
          });
        }
      })
      .catch(console.error);
  }, [isRtl]);

  const [selectedGameFilter, setSelectedGameFilter] = useState<string>(filterGameId || "all");
  const [stakeFilter, setStakeFilter] = useState<"all" | "free" | "cash">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  // Challenge creation form state
  const [newGameId, setNewGameId] = useState<string>(filterGameId || "chess");
  const [newTier, setNewTier] = useState<"FREE" | "CASH">("FREE");
  const [newStake, setNewStake] = useState<number>(5);
  const [newTimeControl, setNewTimeControl] = useState<string>("Blitz 3m");
  const [isPublishing, setIsPublishing] = useState(false);

  // Auto-increment elapsed times
  useEffect(() => {
    const timer = setInterval(() => {
      setDuels((prev) =>
        prev.map((d) => ({
          ...d,
          createdSecondsAgo: d.createdSecondsAgo + 1,
        }))
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Filtered list
  const filteredDuels = useMemo(() => {
    return duels.filter((d) => {
      const matchGame =
        selectedGameFilter === "all" || d.gameId === selectedGameFilter;
      const matchStake =
        stakeFilter === "all" ||
        (stakeFilter === "free" && d.tier === "FREE") ||
        (stakeFilter === "cash" && d.tier === "CASH");
      return matchGame && matchStake;
    });
  }, [duels, selectedGameFilter, stakeFilter]);

  async function handleAccept(duel: OpenDuel) {
    setAcceptingId(duel.id);
    try {
      try {
        const r = await post<{ duelId: string }>("/v1/matchmaking/tickets", {
          gameId: duel.gameId,
          ...(duel.tier === "CASH" ? { tier: "CASH", stakeMinor: (duel.stakeUSDT * 100).toString() } : {}),
        });
        if (r && r.duelId) {
          router.push(`/${locale}/game/${r.duelId}`);
          return;
        }
      } catch {
        // Fallback to simulated duel room
      }
      setTimeout(() => {
        router.push(`/${locale}/game/${duel.id}`);
      }, 400);
    } catch {
      setAcceptingId(null);
    }
  }

  function handleCreateChallenge(e: React.FormEvent) {
    e.preventDefault();
    setIsPublishing(true);

    const targetGame = AVAILABLE_GAMES.find((g) => g.id === newGameId);
    const gameLabel = isRtl
      ? targetGame?.labelAr || newGameId
      : targetGame?.labelEn || newGameId;

    const newDuel: OpenDuel = {
      id: `open_duel_${Date.now()}`,
      gameId: newGameId,
      gameName: gameLabel,
      challenger: {
        handle: player?.handle || (isRtl ? "أنت" : "You"),
        avatarLetter: (player?.handle?.[0] || "U").toUpperCase(),
        elo: 1600,
        badge: isRtl ? "تحدٍ مفتوح" : "Open Host",
      },
      tier: newTier,
      stakeUSDT: newTier === "CASH" ? newStake : 0,
      timeControl: newTimeControl,
      createdSecondsAgo: 0,
      isUserCreated: true,
    };

    setTimeout(() => {
      setDuels((prev) => [newDuel, ...prev]);
      setIsPublishing(false);
      setIsModalOpen(false);
    }, 450);
  }

  return (
    <section className={styles.lobbySection} dir={isRtl ? "rtl" : "ltr"}>
      {/* Top Banner & Radar Status */}
      <div className={styles.lobbyHeader}>
        <div className={styles.lobbyTitleGroup}>
          <div className={styles.radarPill}>
            <span className={styles.radarSweep} />
            <span className={styles.radarDot} />
            <span className={styles.radarText}>
              {isRtl ? "رادار المبارزات المباشرة نشط" : "Live Duel Radar Active"}
            </span>
          </div>
          <h2 className={styles.lobbyTitle}>
            {isRtl ? "ميدان التحديات المباشرة بين الأعضاء" : "Live Member-to-Member Arena"}
          </h2>
          <p className={styles.lobbySubtitle}>
            {isRtl
              ? "تحدَّ لاعبين متصلين الآن في مباريات مهارية تنافسية فورية. اختر رهاناً حقيقياً بالـ USDT أو تدرب مجاناً مع حماية كاملة بنظام مكافحة الغش."
              : "Direct member-to-member skill duels in real-time. Stake USDT or play free practice with server-authoritative anti-cheat enforcement."}
          </p>
        </div>

        <div className={styles.lobbyActions}>
          <Button
            variant="primary"
            className={styles.createChallengeBtn}
            onClick={() => setIsModalOpen(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {isRtl ? "إنشاء تحدٍّ مفتوح" : "Create Open Duel"}
          </Button>
        </div>
      </div>

      {/* Live Metrics Ticker */}
      <div className={styles.statsBar}>
        <div className={styles.statBox}>
          <span className={styles.statVal}>{lobbyStats.openChallenges}</span>
          <span className={styles.statLbl}>{isRtl ? "تحديات مفتوحة حالياً" : "Open Duels Waiting"}</span>
        </div>
        <div className={styles.statBox}>
          <span className={styles.statVal}>{lobbyStats.activePlayers}</span>
          <span className={styles.statLbl}>{isRtl ? "لاعبون نشطون الآن" : "Active Players Online"}</span>
        </div>
        <div className={styles.statBox}>
          <span className={styles.statVal}>&lt; 20ms</span>
          <span className={styles.statLbl}>{isRtl ? "زمن استجابة فائق السرعة" : "Ultra-Low Ping"}</span>
        </div>
        <div className={styles.statBox}>
          <span className={styles.statVal}>100%</span>
          <span className={styles.statLbl}>{isRtl ? "مهارة بدون أي حظ" : "Zero Chance Factor"}</span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className={styles.filterRow}>
        <div className={styles.gameFilters}>
          <button
            type="button"
            className={`${styles.filterChip} ${selectedGameFilter === "all" ? styles.filterChipActive : ""}`}
            onClick={() => setSelectedGameFilter("all")}
          >
            {isRtl ? "جميع الألعاب" : "All Games"}
          </button>
          {AVAILABLE_GAMES.slice(0, 6).map((g) => (
            <button
              key={g.id}
              type="button"
              className={`${styles.filterChip} ${selectedGameFilter === g.id ? styles.filterChipActive : ""}`}
              onClick={() => setSelectedGameFilter(g.id)}
            >
              {isRtl ? g.labelAr : g.labelEn}
            </button>
          ))}
        </div>

        <div className={styles.stakeFilters}>
          <button
            type="button"
            className={`${styles.stakeChip} ${stakeFilter === "all" ? styles.stakeChipActive : ""}`}
            onClick={() => setStakeFilter("all")}
          >
            {isRtl ? "الكل" : "All Stakes"}
          </button>
          <button
            type="button"
            className={`${styles.stakeChip} ${stakeFilter === "free" ? styles.stakeChipActive : ""}`}
            onClick={() => setStakeFilter("free")}
          >
            {isRtl ? "مجاني" : "Free"}
          </button>
          <button
            type="button"
            className={`${styles.stakeChip} ${stakeFilter === "cash" ? styles.stakeChipActive : ""}`}
            onClick={() => setStakeFilter("cash")}
          >
            {isRtl ? "بجوائز USDT" : "USDT Stakes"}
          </button>
        </div>
      </div>

      {/* Open Duels Grid */}
      <div className={styles.duelsGrid}>
        {filteredDuels.length === 0 ? (
          <div className={styles.emptyState}>
            <p>{isRtl ? "لا توجد تحديات مفتوحة تطابق الفلتر حالياً." : "No open duels matching your filter."}</p>
            <Button variant="secondary" onClick={() => setIsModalOpen(true)}>
              {isRtl ? "أنشئ أول تحدٍّ الآن" : "Create the First Duel"}
            </Button>
          </div>
        ) : (
          filteredDuels.map((duel) => (
            <div
              key={duel.id}
              className={`${styles.duelCard} ${duel.isUserCreated ? styles.duelCardUser : ""}`}
            >
              <div className={styles.duelCardTop}>
                <div className={styles.challengerInfo}>
                  <div className={styles.challengerAvatar}>
                    {duel.challenger.avatarLetter}
                  </div>
                  <div>
                    <div className={styles.challengerHandle}>
                      {duel.challenger.handle}
                      {duel.isUserCreated && (
                        <span className={styles.userBadge}>{isRtl ? "تحديك" : "Yours"}</span>
                      )}
                    </div>
                    <div className={styles.challengerElo}>
                      {isRtl ? `تصنيف: ${duel.challenger.elo}` : `Rating: ${duel.challenger.elo}`}
                    </div>
                  </div>
                </div>

                <div className={styles.duelGameBadge}>
                  <img
                    src={`/images/games/${duel.gameId}-badge.jpg`}
                    alt={duel.gameName}
                    className={styles.duelGameThumb}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `/images/games/${duel.gameId}.jpg`;
                    }}
                  />
                  <span className={styles.duelGameName}>{duel.gameName}</span>
                </div>
              </div>

              <div className={styles.duelSpecs}>
                <div className={styles.specItem}>
                  <span className={styles.specLabel}>{isRtl ? "الوضع الزمني" : "Time Control"}</span>
                  <span className={styles.specVal}>{duel.timeControl}</span>
                </div>
                <div className={styles.specItem}>
                  <span className={styles.specLabel}>{isRtl ? "الرهان" : "Stake"}</span>
                  <span
                    className={`${styles.specVal} ${
                      duel.tier === "CASH" ? styles.stakeValCash : styles.stakeValFree
                    }`}
                  >
                    {duel.tier === "CASH" ? `${duel.stakeUSDT} USDT` : isRtl ? "مجاني" : "Free"}
                  </span>
                </div>
                <div className={styles.specItem}>
                  <span className={styles.specLabel}>{isRtl ? "منذ" : "Waiting"}</span>
                  <span className={styles.specVal}>{duel.createdSecondsAgo}s</span>
                </div>
              </div>

              <div className={styles.duelCardActions}>
                <Button
                  variant={duel.tier === "CASH" ? "primary" : "secondary"}
                  className={styles.acceptBtn}
                  disabled={acceptingId === duel.id}
                  onClick={() => handleAccept(duel)}
                >
                  {acceptingId === duel.id ? (
                    isRtl ? "جارٍ الدخول..." : "Connecting..."
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      {duel.isUserCreated
                        ? isRtl ? "انتظار الخصم..." : "Awaiting Opponent..."
                        : isRtl ? "قبول التحدي الآن" : "Accept Challenge"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Open Challenge Modal */}
      {isModalOpen && (
        <div className={styles.modalBackdrop} onClick={() => setIsModalOpen(false)}>
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            dir={isRtl ? "rtl" : "ltr"}
          >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {isRtl ? "إنشاء تحدٍّ مفتوح لجميع الأعضاء" : "Broadcast Open Member Duel"}
              </h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setIsModalOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateChallenge} className={styles.challengeForm}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>{isRtl ? "اختر اللعبة" : "Select Game"}</label>
                <select
                  value={newGameId}
                  onChange={(e) => setNewGameId(e.target.value)}
                  className={styles.formSelect}
                >
                  {AVAILABLE_GAMES.map((g) => (
                    <option key={g.id} value={g.id}>
                      {isRtl ? g.labelAr : g.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>{isRtl ? "نمط المنافسة" : "Match Type"}</label>
                <div className={styles.radioGroup}>
                  <button
                    type="button"
                    className={`${styles.radioBtn} ${newTier === "FREE" ? styles.radioBtnActive : ""}`}
                    onClick={() => setNewTier("FREE")}
                  >
                    {isRtl ? "مجاني (تدريب واكتساب خبرة)" : "Free (Practice / ELO only)"}
                  </button>
                  <button
                    type="button"
                    className={`${styles.radioBtn} ${newTier === "CASH" ? styles.radioBtnActive : ""}`}
                    onClick={() => setNewTier("CASH")}
                  >
                    {isRtl ? "بجوائز USDT حقيقية" : "Competitive USDT Stake"}
                  </button>
                </div>
              </div>

              {newTier === "CASH" && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>{isRtl ? "قيمة التحدي (USDT)" : "Stake Amount (USDT)"}</label>
                  <select
                    value={newStake}
                    onChange={(e) => setNewStake(Number(e.target.value))}
                    className={styles.formSelect}
                  >
                    {[2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000].map((amt) => (
                      <option key={amt} value={amt}>
                        {amt} USDT
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>{isRtl ? "التحكم بالوقت" : "Time Control"}</label>
                <select
                  value={newTimeControl}
                  onChange={(e) => setNewTimeControl(e.target.value)}
                  className={styles.formSelect}
                >
                  <option value="Blitz 3m">{isRtl ? "خاطف (3 دقائق لكل لاعب)" : "Blitz (3 min per player)"}</option>
                  <option value="Rapid 5m">{isRtl ? "سريع (5 دقائق لكل لاعب)" : "Rapid (5 min per player)"}</option>
                  <option value="Classic 10m">{isRtl ? "كلاسيكي (10 دقائق لكل لاعب)" : "Classic (10 min per player)"}</option>
                </select>
              </div>

              <div className={styles.modalFooter}>
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                >
                  {isRtl ? "إلغاء" : "Cancel"}
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={isPublishing}
                >
                  {isPublishing
                    ? isRtl ? "جارٍ البث..." : "Broadcasting..."
                    : isRtl ? "بث التحدي في الرادار" : "Broadcast Challenge"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
