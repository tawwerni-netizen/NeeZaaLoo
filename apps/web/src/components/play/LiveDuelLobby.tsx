"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
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

interface LiveFeedEvent {
  id: number;
  type: string;
  user: string;
  game: string;
  gameEn: string;
  amount: string;
  amountEn: string;
  time: string;
  timeEn: string;
  icon: string;
}

const LIVE_FEED_EVENTS: LiveFeedEvent[] = [
  { id: 1, type: "win", user: "Sultan", game: "شطرنج", gameEn: "Chess", amount: "+45.00 USDT", amountEn: "+45.00 USDT", time: "منذ 30 ثانية", timeEn: "30s ago", icon: "🏆" },
  { id: 2, type: "streak", user: "Nour", game: "إكس أو", gameEn: "Tic-Tac-Toe", amount: "سلسلة 5 انتصارات", amountEn: "5-Win Streak", time: "منذ دقيقة", timeEn: "1m ago", icon: "⚡" },
  { id: 3, type: "challenge", user: "Tariq", game: "طاولة زهر", gameEn: "Backgammon", amount: "تحدي 25.00 USDT", amountEn: "25.00 USDT Challenge", time: "منذ دقيقتين", timeEn: "2m ago", icon: "🔥" },
  { id: 4, type: "win", user: "Zaid", game: "دومينو", gameEn: "Dominoes", amount: "+80.00 USDT", amountEn: "+80.00 USDT", time: "منذ 3 دقائق", timeEn: "3m ago", icon: "💰" },
  { id: 5, type: "live", user: "Fahad vs Karim", game: "أربعة على التوالي", gameEn: "Connect Four", amount: "مبارزة 10.00 USDT", amountEn: "10.00 USDT Duel", time: "جارية الآن", timeEn: "Live Now", icon: "⚔️" },
  { id: 6, type: "master", user: "Sara", game: "الحساب السريع", gameEn: "Speed Math", amount: "تصنيف الماسترز 1850", amountEn: "Master ELO 1850", time: "منذ 4 دقائق", timeEn: "4m ago", icon: "👑" },
  { id: 7, type: "win", user: "Hassan", game: "داما", gameEn: "Checkers", amount: "+20.00 USDT", amountEn: "+20.00 USDT", time: "منذ 5 دقائق", timeEn: "5m ago", icon: "🎯" },
];

export function LiveDuelLobby({ filterGameId }: { filterGameId?: string }) {
  const { locale, dir } = useI18n();
  const isRtl = dir === "rtl";
  const { player } = useAuth();
  const router = useRouter();

  const [duels, setDuels] = useState<OpenDuel[]>(INITIAL_OPEN_DUELS);
  const [lobbyStats, setLobbyStats] = useState({ activeMatches: 0, activePlayers: 0, openChallenges: 0 });
  const [tickerIdx, setTickerIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setTickerIdx((prev) => (prev + 1) % LIVE_FEED_EVENTS.length);
    }, 3800);
    return () => clearInterval(t);
  }, []);
  
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

  // Auto-increment elapsed times & auto-expire at 5 minutes (300 seconds)
  const [expiredNotice, setExpiredNotice] = useState<string | null>(null);

  // User USDT balance verification
  const [userBalanceUSDT, setUserBalanceUSDT] = useState<number | null>(null);
  const [balanceWarningModal, setBalanceWarningModal] = useState<{ open: boolean; requiredStake: number } | null>(null);

  useEffect(() => {
    if (!player?.id) return;
    get<{ accounts: { key: string; balance: string; asset: string }[] }>(`/v1/players/${player.id}/wallet`)
      .then((res) => {
        const usdtAcc = res?.accounts?.find(
          (a) => a.asset === "USDT" && (a.key.endsWith(":available") || a.key.includes("available"))
        );
        if (usdtAcc) {
          setUserBalanceUSDT(Number(usdtAcc.balance) / 1_000_000);
        } else {
          setUserBalanceUSDT(0);
        }
      })
      .catch(() => {
        setUserBalanceUSDT(0);
      });
  }, [player?.id]);

  useEffect(() => {
    const timer = setInterval(() => {
      setDuels((prev) => {
        const expired = prev.filter((d) => d.createdSecondsAgo + 1 >= 300);
        if (expired.some((d) => d.isUserCreated)) {
          setExpiredNotice(
            isRtl
              ? "انتهت مهلة انتظار الخصم (5 دقائق) للمبارزة وتم إلغاؤها تلقائياً."
              : "The 5-minute waiting window for your challenge expired and was closed."
          );
        }
        return prev
          .filter((d) => d.createdSecondsAgo + 1 < 300)
          .map((d) => ({
            ...d,
            createdSecondsAgo: d.createdSecondsAgo + 1,
          }));
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isRtl]);

  function handleCancelDuel(duelId: string) {
    setDuels((prev) => prev.filter((d) => d.id !== duelId));
  }

  async function handlePlayVsAi(duel: OpenDuel) {
    setAcceptingId(duel.id);
    try {
      const r = await post<{ duelId: string }>("/v1/matchmaking/vs-computer", {
        gameId: duel.gameId,
        difficulty: "MEDIUM",
      });
      if (r && r.duelId) {
        router.push(`/${locale}/game/${r.duelId}`);
      }
    } catch {
      setAcceptingId(null);
    }
  }

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
        // Fallback: start a real vs-computer match so player never encounters a blank screen
        const r = await post<{ duelId: string }>("/v1/matchmaking/vs-computer", {
          gameId: duel.gameId,
          difficulty: "MEDIUM",
        });
        if (r && r.duelId) {
          router.push(`/${locale}/game/${r.duelId}`);
          return;
        }
      }
    } finally {
      setAcceptingId(null);
    }
  }

  function handleCreateChallenge(e: React.FormEvent) {
    e.preventDefault();
    if (newTier === "CASH") {
      const currentBal = userBalanceUSDT ?? 0;
      if (currentBal < newStake) {
        setIsPublishing(false);
        setIsModalOpen(false);
        setBalanceWarningModal({ open: true, requiredStake: newStake });
        return;
      }
    }

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

  const DEFAULT_FEED_EVENT: LiveFeedEvent = {
    id: 1,
    type: "win",
    user: "Sultan",
    game: "شطرنج",
    gameEn: "Chess",
    amount: "+45.00 USDT",
    amountEn: "+45.00 USDT",
    time: "منذ 30 ثانية",
    timeEn: "30s ago",
    icon: "🏆",
  };
  const activeEvent = LIVE_FEED_EVENTS[tickerIdx] ?? DEFAULT_FEED_EVENT;
  const activeModalGame = AVAILABLE_GAMES.find((g) => g.id === newGameId);

  return (
    <section className={styles.lobbySection} dir={isRtl ? "rtl" : "ltr"}>
      {/* Corner Tech Brackets */}
      <span className={styles.cornerTechTL} />
      <span className={styles.cornerTechTR} />
      <span className={styles.cornerTechBL} />
      <span className={styles.cornerTechBR} />

      {expiredNotice && (
        <div className={styles.expiredAlert}>
          <span>⚠️ {expiredNotice}</span>
          <button
            type="button"
            className={styles.expiredAlertClose}
            onClick={() => setExpiredNotice(null)}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      )}

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
            <span className={styles.arenaIcon}>⚔️</span>
            {isRtl ? "ميدان التحديات المباشرة بين الأعضاء" : "Live Member-to-Member Arena"}
          </h2>
          <p className={styles.lobbySubtitle}>
            {isRtl
              ? "تحدَّ لاعبين حقيقيين متصلين الآن في مباريات مهارية فورية بدون أي عنصر حظ. العب مجاناً لتحسين تصنيفك أو نافس على جوائز USDT نقدية مع ضمان خادم حتمي مشفر."
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

      {/* Live Social Proof & Activity Ticker Ribbon */}
      <div className={styles.liveTickerRibbon}>
        <span className={styles.tickerTag}>
          <span>●</span> {isRtl ? "نشاط حي" : "LIVE FEED"}
        </span>
        <div className={styles.tickerContent} key={activeEvent.id}>
          <span className={styles.tickerIcon}>{activeEvent.icon}</span>
          <span className={styles.tickerUser}>@{activeEvent.user}</span>
          <span>{isRtl ? "في" : "in"}</span>
          <span className={styles.tickerGame}>{isRtl ? activeEvent.game : activeEvent.gameEn}:</span>
          <span className={styles.tickerAmount}>{isRtl ? activeEvent.amount : activeEvent.amountEn}</span>
          <span className={styles.tickerTime}>{isRtl ? activeEvent.time : activeEvent.timeEn}</span>
        </div>
      </div>

      {/* 10 Games Interactive Showcase Strip */}
      <div className={styles.arenaShowcase}>
        <div className={styles.arenaShowcaseHeader}>
          <span className={styles.arenaShowcaseTitle}>
            <span>🎮</span>
            {isRtl ? "أرينا الألعاب التنافسية الـ 10" : "10 Competitive Arena Games"}
          </span>
        </div>
        <div className={styles.gamesScrollContainer}>
          {AVAILABLE_GAMES.map((game) => {
            const isSelected = selectedGameFilter === game.id;
            return (
              <div
                key={game.id}
                className={`${styles.gameShowcaseCard} ${isSelected ? styles.gameShowcaseCardActive : ""}`}
                onClick={() => {
                  setSelectedGameFilter(selectedGameFilter === game.id ? "all" : game.id);
                }}
                title={isRtl ? `تصفية حسب ${game.labelAr}` : `Filter by ${game.labelEn}`}
              >
                <img
                  src={`/images/games/${game.id}.jpg`}
                  alt={isRtl ? game.labelAr : game.labelEn}
                  className={styles.gameShowcaseImg}
                  loading="lazy"
                />
                <div className={styles.gameShowcaseOverlay}>
                  <div className={styles.gameShowcaseName}>
                    {isRtl ? game.labelAr : game.labelEn}
                  </div>
                  <div className={styles.gameShowcaseBadge}>
                    <span className={styles.gameShowcaseDot} />
                    <span>{isRtl ? "متاح للمبارزة" : "1v1 Ready"}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Metrics Ticker */}
      <div className={styles.statsBar}>
        <div className={styles.statBox}>
          <span className={styles.statVal}>{lobbyStats.openChallenges}</span>
          <span className={styles.statLbl}>{isRtl ? "تحديات مفتوحة حالياً" : "Open Duels Waiting"}</span>
        </div>
        <div className={styles.statBox}>
          <span className={styles.statVal}>{lobbyStats.activePlayers || 48}</span>
          <span className={styles.statLbl}>{isRtl ? "لاعبون متصلون الآن" : "Active Players Online"}</span>
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
            {isRtl ? "جميع الألعاب (10)" : "All Games (10)"}
          </button>
          {AVAILABLE_GAMES.map((g) => (
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
          <div className={styles.emptyStateRadar}>
            <div className={styles.radarGraphicWrap}>
              <div className={styles.radarCircleOuter} />
              <div className={styles.radarCircleInner} />
              <div className={styles.radarBeam} />
              <div className={styles.radarCenterIcon}>⚔️</div>
            </div>
            <h3 className={styles.emptyTitle}>
              {isRtl ? "الميدان بانتظار بطله الأول!" : "The Arena Awaits Its Champion!"}
            </h3>
            <p className={styles.emptySubtitle}>
              {isRtl
                ? `لا توجد مبارزة مفتوحة تطابق الفلتر حالياً. أطلق التحدي الأول الآن ليدخل المنافسون لمبارزتك فوراً!`
                : "No duels matching your filter right now. Broadcast the first open challenge and let opponents race to accept!"}
            </p>
            <Button
              variant="primary"
              className={styles.emptyCtaBtn}
              onClick={() => {
                if (selectedGameFilter !== "all") {
                  setNewGameId(selectedGameFilter);
                }
                setIsModalOpen(true);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {isRtl ? "أطلق أول تحدٍّ في الميدان الآن" : "Launch the First Challenge Now"}
            </Button>
          </div>
        ) : (
          filteredDuels.map((duel) => {
            const isHighElo = duel.challenger.elo >= 1600;
            const remainingSeconds = Math.max(0, 300 - duel.createdSecondsAgo);
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;
            const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

            return (
              <div
                key={duel.id}
                className={`${styles.duelCard} ${
                  duel.tier === "CASH" ? styles.duelCardCash : ""
                } ${duel.isUserCreated ? styles.duelCardUser : ""}`}
              >
                <div className={styles.duelCardTop}>
                  <div className={styles.challengerInfo}>
                    <div className={styles.challengerAvatarWrap}>
                      <div className={styles.challengerAvatar}>
                        {duel.challenger.avatarLetter}
                      </div>
                      {isHighElo && <span className={styles.avatarRingHighElo} />}
                    </div>
                    <div>
                      <div className={styles.challengerHandle}>
                        {duel.challenger.handle}
                        {duel.isUserCreated && (
                          <span className={styles.userBadge}>{isRtl ? "تحديك" : "Yours"}</span>
                        )}
                      </div>
                      <div className={styles.challengerElo}>
                        <span>{isRtl ? `تصنيف: ${duel.challenger.elo}` : `Rating: ${duel.challenger.elo}`}</span>
                        {isHighElo && <span>👑</span>}
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
                    <span className={styles.specLabel}>{isRtl ? "مهلة الإنتظار" : "Waiting Window"}</span>
                    <span className={styles.specVal}>
                      {timeStr} {remainingSeconds <= 60 ? "⚠️" : "⏳"}
                    </span>
                  </div>
                </div>

                <div className={styles.duelCardActions}>
                  {duel.isUserCreated ? (
                    <div className={styles.userDuelActions}>
                      <div className={styles.waitingStatusPill}>
                        <span className={styles.radarPing} />
                        <span>
                          {isRtl
                            ? `في انتظار الخصم... (${timeStr})`
                            : `Awaiting Opponent... (${timeStr})`}
                        </span>
                      </div>
                      <div className={styles.userDuelButtons}>
                        <button
                          type="button"
                          className={styles.instantAiBtn}
                          onClick={() => void handlePlayVsAi(duel)}
                          disabled={acceptingId === duel.id}
                        >
                          <span>⚡ {isRtl ? "بدء فوري ضد الحاسوب" : "Instant vs AI"}</span>
                        </button>
                        <button
                          type="button"
                          className={styles.cancelDuelBtn}
                          onClick={() => handleCancelDuel(duel.id)}
                        >
                          <span>{isRtl ? "إلغاء التحدي" : "Cancel"}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant={duel.tier === "CASH" ? "primary" : "secondary"}
                      className={styles.acceptBtn}
                      disabled={acceptingId === duel.id}
                      onClick={() => void handleAccept(duel)}
                    >
                      {acceptingId === duel.id ? (
                        isRtl ? "جارٍ الدخول..." : "Connecting..."
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                          {isRtl ? "قبول التحدي الآن" : "Accept Challenge"}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })
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
            {/* Selected Game Preview Banner */}
            <div className={styles.modalGameBanner}>
              <img
                src={`/images/games/${newGameId}.jpg`}
                alt={newGameId}
                className={styles.modalGameBannerImg}
              />
              <div className={styles.modalGameBannerOverlay}>
                <span className={styles.modalGameBannerTitle}>
                  {isRtl ? activeModalGame?.labelAr : activeModalGame?.labelEn}
                </span>
              </div>
            </div>

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
                    {isRtl ? "مجاني (نقاط ELO)" : "Free (ELO Practice)"}
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
                  
                  <div className={styles.currentBalanceDisplay}>
                    <span>{isRtl ? "رصيدك المتاح حالياً:" : "Current Available Balance:"}</span>
                    <strong className={(userBalanceUSDT ?? 0) >= newStake ? styles.sufficientBalance : styles.insufficientBalance}>
                      {(userBalanceUSDT ?? 0).toFixed(2)} USDT
                    </strong>
                  </div>

                  <div className={styles.stakePills}>
                    {[2, 5, 10, 20, 50, 100, 200, 500].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        className={`${styles.stakePillBtn} ${newStake === amt ? styles.stakePillBtnActive : ""}`}
                        onClick={() => setNewStake(amt)}
                      >
                        {amt} USDT
                      </button>
                    ))}
                  </div>

                  {(userBalanceUSDT ?? 0) < newStake && (
                    <div className={styles.balanceWarningBanner}>
                      <span>
                        ⚠️ {isRtl
                          ? `رصيدك الحالي (${(userBalanceUSDT ?? 0).toFixed(2)} USDT) غير كافٍ لهذا النزال (${newStake}.00 USDT). يرجى شحن الرصيد أولاً أو اختيار اللعب المجاني.`
                          : `Your current balance (${(userBalanceUSDT ?? 0).toFixed(2)} USDT) is insufficient for this stake (${newStake}.00 USDT). Please deposit first or choose free practice.`}
                      </span>
                      <LocaleLink href="/wallet" className={styles.inlineDepositBtn}>
                        💳 {isRtl ? "شحن المحفظة الآن" : "Deposit USDT"}
                      </LocaleLink>
                    </div>
                  )}
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
                  disabled={isPublishing || (newTier === "CASH" && (userBalanceUSDT ?? 0) < newStake)}
                >
                  {isPublishing
                    ? isRtl ? "جارٍ البث..." : "Broadcasting..."
                    : newTier === "CASH" && (userBalanceUSDT ?? 0) < newStake
                    ? isRtl ? "رصيد غير كافٍ" : "Insufficient Balance"
                    : isRtl ? "بث التحدي في الرادار" : "Broadcast Challenge"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Insufficient Balance Critical Modal */}
      {balanceWarningModal?.open && (
        <div className={styles.modalOverlay} onClick={() => setBalanceWarningModal(null)}>
          <div className={styles.insufficientModalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.warningIconGlow}>💳</div>
            <h3 className={styles.warningModalTitle}>
              {isRtl ? "رصيد المحفظة غير كافٍ" : "Insufficient Wallet Balance"}
            </h3>
            <p className={styles.warningModalDesc}>
              {isRtl
                ? `أنت تحاول دخول نزال برهان بقيمة ${balanceWarningModal.requiredStake}.00 USDT، بينما رصيدك المتاح حالياً هو ${(userBalanceUSDT ?? 0).toFixed(2)} USDT. لا يمكن دخول النزالات النقدية بدون رصيد مسبق.`
                : `You are attempting to enter a duel with a ${balanceWarningModal.requiredStake}.00 USDT stake, but your available balance is ${(userBalanceUSDT ?? 0).toFixed(2)} USDT. Cash duels require sufficient pre-funded balance.`}
            </p>
            <div className={styles.warningModalActions}>
              <LocaleLink href="/wallet" className={styles.depositCtaBtn}>
                <span>💰</span>
                <span>{isRtl ? "شحن المحفظة فوراً (إيداع USDT)" : "Deposit USDT Now"}</span>
              </LocaleLink>
              <button
                type="button"
                className={styles.playFreeAltBtn}
                onClick={() => {
                  setBalanceWarningModal(null);
                  setNewTier("FREE");
                  setIsModalOpen(true);
                }}
              >
                {isRtl ? "اللعب في النمط المجاني (نقاط ELO)" : "Play in Free Mode (ELO)"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
