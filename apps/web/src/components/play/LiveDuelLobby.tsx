"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth-context";
import { useAuthPopup } from "@/lib/auth-popup-context";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { get, post } from "@/lib/api";
import { useVisibilityAwareInterval } from "@/lib/use-interval";
import { CoinPicker, useCoinBalances, richestCoin, type StakeAsset } from "./CoinPicker";
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
  asset: string;
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

export const QUICK_STAKES = [
  { stake: 2, prize: 3.80, tagAr: "بداية سريعة 🚀", tagEn: "Fast Start 🚀" },
  { stake: 5, prize: 9.50, tagAr: "نزال الأبطال 🔥 الأكثر طلباً", tagEn: "Popular 🔥 Most Wanted", popular: true },
  { stake: 10, prize: 19.00, tagAr: "تحدي المحترفين ⚡", tagEn: "Pro Duel ⚡" },
  { stake: 25, prize: 47.50, tagAr: "نزال النخبة 💎", tagEn: "Elite 💎" },
  { stake: 50, prize: 95.00, tagAr: "كبار المتحدين 👑", tagEn: "High-Roller 👑" },
];

export function LiveDuelLobby({ filterGameId }: { filterGameId?: string }) {
  const { locale, dir } = useI18n();
  const isRtl = dir === "rtl";
  const { player } = useAuth();
  const { openPopup } = useAuthPopup();
  const router = useRouter();

  const [duels, setDuels] = useState<OpenDuel[]>(INITIAL_OPEN_DUELS);
  const [lobbyStats, setLobbyStats] = useState({ activeMatches: 0, activePlayers: 0, openChallenges: 0, paidTodayUsd: 0 });

  const loadOpenChallenges = async () => {
    try {
      const res = await get<{ challenges: any[] }>("/v1/challenges/open");
      if (res && Array.isArray(res.challenges)) {
        const mapped: OpenDuel[] = res.challenges.map((c: any) => {
          const gameObj = AVAILABLE_GAMES.find((g) => g.id === c.gameId);
          const gameName = isRtl ? (gameObj?.labelAr || c.gameId) : (gameObj?.labelEn || c.gameId);
          return {
            id: c.id,
            gameId: c.gameId,
            gameName,
            challenger: {
              handle: c.creator?.handle || "Player",
              avatarLetter: (c.creator?.handle?.[0] || "P").toUpperCase(),
              elo: c.creator?.elo || 1600,
              badge: c.creator?.badge || "Player",
            },
            tier: c.tier || "FREE",
            stakeUSDT: Number(c.stakeUSDT || 0),
            asset: String(c.asset || "USDT"),
            timeControl: c.timeControl || "Blitz",
            createdSecondsAgo: Math.max(0, Math.floor((Date.now() - new Date(c.createdAt).getTime()) / 1000)),
            isUserCreated: c.creator?.id === player?.id || c.creator?.handle === player?.handle,
          };
        });
        setDuels(mapped);
      }
    } catch (err) {
      console.error("Error loading open challenges:", err);
    }

    try {
      const statsRes = await get<{
        activeMatches: number; activePlayers: number; openChallenges: number;
        paidTodayByAsset?: Record<string, string>;
      }>("/v1/lobby/stats");
      if (statsRes) {
        // Every coin the platform pays out is a $1-pegged stablecoin, so
        // summing them is a real total, not an approximation -- but it is
        // ALWAYS the real figure, including a real zero on a day nothing
        // has been withdrawn yet (e.g. cash play not yet enabled).
        const paidTodayUsd = Object.values(statsRes.paidTodayByAsset ?? {})
          .reduce((sum, minor) => sum + Number(minor || "0") / 1_000_000, 0);
        setLobbyStats({
          activeMatches: statsRes.activeMatches || 0,
          activePlayers: statsRes.activePlayers || 0,
          openChallenges: statsRes.openChallenges || 0,
          paidTodayUsd,
        });
      }
    } catch {}
  };

  useEffect(() => {
    void loadOpenChallenges();
  }, [isRtl, player?.id]);

  useVisibilityAwareInterval(loadOpenChallenges, 7000);

  // Challenger status listener: if someone accepts our challenge, redirect to the duel!
  const checkMyStatus = async () => {
    if (!player) return;
    try {
      const res = await get<{ active: boolean; status?: string; duelId?: string }>("/v1/challenges/open/my-status");
      if (res && res.active && res.status === "ACCEPTED" && res.duelId) {
        router.push(`/${locale}/game/${res.duelId}`);
      }
    } catch {}
  };

  useVisibilityAwareInterval(checkMyStatus, player ? 5000 : false);

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
  const balances = useCoinBalances(player?.id);
  const [newAsset, setNewAsset] = useState<StakeAsset>("USDT");
  const [assetTouched, setAssetTouched] = useState(false);
  useEffect(() => {
    if (!assetTouched && balances) setNewAsset(richestCoin(balances));
  }, [balances, assetTouched]);
  // Balance in the coin being staked -- coins are never pooled or converted.
  const userBalanceUSDT = balances ? balances[newAsset] : null;
  const [balanceWarningModal, setBalanceWarningModal] = useState<{ open: boolean; requiredStake: number } | null>(null);

  const [copiedDuelId, setCopiedDuelId] = useState<string | null>(null);
  const [targetChallengeId, setTargetChallengeId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const cId = sp.get("challenge") || sp.get("duel");
      if (cId) {
        setTargetChallengeId(cId);
      }
    }
  }, []);

  useEffect(() => {
    if (targetChallengeId && duels.length > 0) {
      const el = document.getElementById(`duel-${targetChallengeId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [targetChallengeId, duels]);

  const copyChallengeLink = (duelId: string) => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/${locale}/play?challenge=${duelId}`;
    void navigator.clipboard.writeText(url);
    setCopiedDuelId(duelId);
    setTimeout(() => setCopiedDuelId(null), 2500);
  };

  const shareOnWhatsApp = (duel: OpenDuel, prize: string) => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/${locale}/play?challenge=${duel.id}`;
    const text = isRtl
      ? `⚔️ أتحدّاك في نزال ${duel.gameName} على منصة نيزالو بجائزة ${prize} USDT! 🔥 ادخل واقبل التحدي الآن:\n${url}`
      : `⚔️ I challenge you to a ${duel.gameName} duel on Nizalo with a ${prize} USDT prize! 🔥 Accept now:\n${url}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };

  const shareOnTelegram = (duel: OpenDuel, prize: string) => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/${locale}/play?challenge=${duel.id}`;
    const text = isRtl
      ? `⚔️ أتحدّاك في نزال ${duel.gameName} على منصة نيزالو بجائزة ${prize} USDT! 🔥 ادخل واقبل التحدي الآن:\n${url}`
      : `⚔️ I challenge you to a ${duel.gameName} duel on Nizalo with a ${prize} USDT prize! 🔥 Accept now:\n${url}`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, "_blank");
  };

  const handleQuickStakeClick = (stakeAmt: number) => {
    if (!player) {
      openPopup();
      return;
    }
    setNewTier("CASH");
    setNewStake(stakeAmt);
    if (selectedGameFilter !== "all") {
      setNewGameId(selectedGameFilter);
    }
    setIsModalOpen(true);
  };


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

  async function handleCancelDuel(duelId: string) {
    try {
      await post(`/v1/challenges/open/${duelId}/cancel`, {});
    } catch {}
    setDuels((prev) => prev.filter((d) => d.id !== duelId));
  }

  async function handlePlayVsAi(duel: OpenDuel) {
    if (!player) {
      openPopup();
      return;
    }
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
    if (!player) {
      openPopup();
      return;
    }
    setAcceptingId(duel.id);
    try {
      const r = await post<{ duelId: string }>(`/v1/challenges/open/${duel.id}/accept`, {});
      if (r && r.duelId) {
        router.push(`/${locale}/game/${r.duelId}`);
        return;
      }
    } catch (err: any) {
      console.error("Failed to accept open challenge:", err);
      await loadOpenChallenges();
    } finally {
      setAcceptingId(null);
    }
  }

  async function handleCreateChallenge(e: React.FormEvent) {
    e.preventDefault();
    if (!player) {
      setIsModalOpen(false);
      openPopup();
      return;
    }
    if (newTier === "CASH") {
      const currentBal = userBalanceUSDT ?? 0;
      if (currentBal < newStake) {
        setIsPublishing(false);
        setIsModalOpen(false);
        setBalanceWarningModal({ open: true, requiredStake: newStake });
        return;
      }
    }

    setIsPublishing(true);
    try {
      await post<{ challengeId: string }>("/v1/challenges/open", {
        gameId: newGameId,
        tier: newTier,
        // Platform minor units are 6 decimals for every coin.
        stakeMinor: newTier === "CASH" ? String(Math.round(newStake * 1_000_000)) : "0",
        ...(newTier === "CASH" ? { asset: newAsset } : {}),
        timeControl: newTimeControl,
      });

      setIsModalOpen(false);
      await loadOpenChallenges();
    } catch (err) {
      console.error("Failed to publish open challenge:", err);
    } finally {
      setIsPublishing(false);
    }
  }

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
            {isRtl ? "ميدان التحديات والمبارزات المباشرة" : "Live Member-to-Member Arena"}
          </h2>
          <p className={styles.lobbySubtitle}>
            {isRtl
              ? "نافس أبطالاً حقيقيين في ألعاب مهارية خالصة 100% بدون أي عنصر حظ — العب واكسب بذكائك جوائز USDT كاش تُحوّل لمحفظتك فوراً."
              : "Direct member-to-member skill duels in real-time. Play and win with pure skill and withdraw instant cash prizes with zero hold times."}
          </p>
        </div>

        <div className={styles.lobbyActions}>
          <Button
            variant="primary"
            className={styles.createChallengeBtn}
            onClick={() => {
              if (!player) {
                openPopup();
                return;
              }
              setIsModalOpen(true);
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {isRtl ? "إنشاء تحدٍّ مفتوح واربح" : "Create Open Duel"}
          </Button>

          <button
            type="button"
            className={styles.directChallengeFriendBtn}
            onClick={() => {
              if (!player) {
                openPopup();
                return;
              }
              setNewTier("CASH");
              setNewStake(5);
              setIsModalOpen(true);
            }}
          >
            <span>📲</span>
            <span>{isRtl ? "تحدَّ صديقك برابط مباشر" : "1-Click Friend Challenge"}</span>
          </button>
        </div>
      </div>

      {/* Instant Quick-Stake Match Selector (1-Click Cash Action & High Reward Display) */}
      <div className={styles.quickStakeSection}>
        <div className={styles.quickStakeHeader}>
          <div className={styles.quickStakeTitle}>
            <span>⚡</span>
            <span>
              {isRtl ? "باقات التحدي السريع (العب واكسب الجائزة فوراً):" : "Instant Challenge Tiers (Play & win prize immediately):"}
            </span>
          </div>
          <span className={styles.quickStakeSub}>
            {isRtl ? "سحب الأرباح فوري خلال 60 ثانية ⚡" : "Instant 60s Cash Withdrawal ⚡"}
          </span>
        </div>

        <div className={styles.quickStakeGrid}>
          {QUICK_STAKES.map((qs) => (
            <button
              key={qs.stake}
              type="button"
              className={`${styles.quickStakeCard} ${qs.popular ? styles.quickStakeCardPopular : ""}`}
              onClick={() => handleQuickStakeClick(qs.stake)}
              title={isRtl ? `بدء نزال بقيمة ${qs.stake} USDT` : `Start a ${qs.stake} USDT duel`}
            >
              {qs.popular && (
                <span className={styles.popularBadge}>
                  {isRtl ? "🔥 الأكثر طلباً" : "🔥 Most Popular"}
                </span>
              )}
              <div className={styles.quickStakeTop}>
                <span className={styles.stakeAmountVal}>${qs.stake}</span>
                <span className={styles.stakeAmountCurrency}>USDT</span>
              </div>
              <div className={styles.quickStakePrizeBox}>
                <span className={styles.prizePrefix}>{isRtl ? "تكسب:" : "Win:"}</span>
                <span className={styles.prizeNumber}>${qs.prize.toFixed(2)}</span>
                <span className={styles.prizeCurrency}>USDT</span>
              </div>
              <span className={styles.quickStakeTag}>
                {isRtl ? qs.tagAr : qs.tagEn}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 10 Games Interactive Showcase Strip */}
      <div className={styles.arenaShowcase}>
        <div className={styles.arenaShowcaseHeader}>
          <span className={styles.arenaShowcaseTitle}>
            <span>🎮</span>
            {isRtl ? "أرينا الألعاب التنافسية الـ 10 (اختر لعبتك المفضلة للمبارزة)" : "10 Competitive Arena Games"}
          </span>
          <span className={styles.arenaShowcaseSub}>
            {isRtl ? "جوائز كاش تصل إلى 500$ 💰" : "Cash Prizes up to $500 💰"}
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

      {/* Redesigned 4 Luxury Glassmorphic Metric Cards (Zero RTL/LTR Misalignment) */}
      <div className={styles.metricCardsGrid}>
        {/* Card 1: Open Duels Waiting */}
        <div className={`${styles.metricCard} ${styles.metricCardEmerald}`}>
          <div className={styles.metricCardHeader}>
            <div className={styles.metricIconWrap}>⚔️</div>
            <span className={styles.metricBadgeLive}>
              <span className={styles.statPulseDot} />
              {isRtl ? "نشط الآن" : "Live"}
            </span>
          </div>
          <div className={styles.metricCardBody}>
            <div className={styles.metricNumber}>
              {lobbyStats.openChallenges || duels.length}
            </div>
            <div className={styles.metricTitle}>
              {isRtl ? "تحديات مفتوحة للنزال" : "Open Duels Waiting"}
            </div>
            <div className={styles.metricSub}>
              {isRtl ? "جاهزة للقبول والمبارزة فوراً" : "Ready for instant matchmaking"}
            </div>
          </div>
        </div>

        {/* Card 2: Active Challengers Online */}
        <div className={`${styles.metricCard} ${styles.metricCardGold}`}>
          <div className={styles.metricCardHeader}>
            <div className={styles.metricIconWrap}>👥</div>
            <span className={styles.metricBadgeOnline}>
              ⚡ {isRtl ? "متصل" : "Online"}
            </span>
          </div>
          <div className={styles.metricCardBody}>
            <div className={styles.metricNumber}>
              {lobbyStats.activePlayers}{lobbyStats.activePlayers > 0 ? "+" : ""}
            </div>
            <div className={styles.metricTitle}>
              {isRtl ? "أبطال ولاعبون متصلون الآن" : "Active Challengers Online"}
            </div>
            <div className={styles.metricSub}>
              {isRtl ? "يتنافسون في الأرينا والميدان" : "Competing in the live arena"}
            </div>
          </div>
        </div>

        {/* Card 3: Daily Winnings Distributed */}
        <div className={`${styles.metricCard} ${styles.metricCardRuby}`}>
          <div className={styles.metricCardHeader}>
            <div className={styles.metricIconWrap}>💰</div>
            <span className={styles.metricBadgePayout}>
              🏆 {isRtl ? "كاش مسحوب" : "Paid Out"}
            </span>
          </div>
          <div className={styles.metricCardBody}>
            <div className={styles.metricNumber}>
              ${lobbyStats.paidTodayUsd.toLocaleString(isRtl ? "ar" : "en", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{lobbyStats.paidTodayUsd > 0 ? "+" : ""}
            </div>
            <div className={styles.metricTitle}>
              {isRtl ? "جوائز كاش وُزعت اليوم" : "Total Cash Won Today"}
            </div>
            <div className={styles.metricSub}>
              {isRtl ? "سحب فوري مباشر للمحفظة" : "Instant automated withdrawals"}
            </div>
          </div>
        </div>

        {/* Card 4: 100% Skill & Ultra-Low Ping */}
        <div className={`${styles.metricCard} ${styles.metricCardCyan}`}>
          <div className={styles.metricCardHeader}>
            <div className={styles.metricIconWrap}>🛡️</div>
            <span className={styles.metricBadgeFair}>
              🔒 {isRtl ? "مضاد للغش" : "Anti-Cheat"}
            </span>
          </div>
          <div className={styles.metricCardBody}>
            <div className={styles.metricNumber}>
              <bdi dir="ltr">&lt; 20ms | 100%</bdi>
            </div>
            <div className={styles.metricTitle}>
              {isRtl ? "مهارة بدون أي حظ وسرعة فائقة" : "100% Skill & Ultra-Low Ping"}
            </div>
            <div className={styles.metricSub}>
              {isRtl ? "تحكيم خادم حتمي ومضمون" : "Deterministic server verification"}
            </div>
          </div>
        </div>
      </div>

      {/* 3 Pillars of Winning & Platform Trust */}
      <div className={styles.trustPillarsRow}>
        <div className={styles.trustPillar}>
          <span className={styles.pillarIcon}>💎</span>
          <div className={styles.pillarTextWrap}>
            <strong className={styles.pillarTitle}>
              {isRtl ? "العب واكسب بمهارتك" : "Play & Win With Pure Skill"}
            </strong>
            <span className={styles.pillarDesc}>
              {isRtl ? "الفائز يحصل على مجموع جوائز التحدي بنسبة 100% مع عمولة منصة رمزية 5% فقط." : "Winner takes the full challenge prize pool directly with an ultra-low 5% platform fee."}
            </span>
          </div>
        </div>

        <div className={styles.trustPillar}>
          <span className={styles.pillarIcon}>⚡</span>
          <div className={styles.pillarTextWrap}>
            <strong className={styles.pillarTitle}>
              {isRtl ? "سحب كاش فوري خلال 60 ثانية" : "Instant 60s Cash Payouts"}
            </strong>
            <span className={styles.pillarDesc}>
              {isRtl ? "أرباحك تصل مباشرة إلى محفظتك بالـ USDT عبر شبكتي TRC20 و BEP20 بدون أي شروط تعجيزية." : "Winnings credit directly to your wallet in USDT via TRC20/BEP20 with zero hold times."}
            </span>
          </div>
        </div>

        <div className={styles.trustPillar}>
          <span className={styles.pillarIcon}>🔒</span>
          <div className={styles.pillarTextWrap}>
            <strong className={styles.pillarTitle}>
              {isRtl ? "تحكيم عادل ومضاد للغش 100%" : "100% Provably Fair & Anti-Cheat"}
            </strong>
            <span className={styles.pillarDesc}>
              {isRtl ? "لا مجال للحظ أو الصدفة — سيرفرات نيزالو المشفرة تضمن عدالة كل حركة وتوقيت." : "Pure deterministic skill. Authoritative server verification guarantees absolute integrity."}
            </span>
          </div>
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
            {isRtl ? "بجوائز نقدية" : "Cash Stakes"}
          </button>
        </div>
      </div>

      {/* Targeted Direct Duel Deep-Link Banner */}
      {targetChallengeId && (
        <div className={styles.targetedDuelBanner}>
          <div className={styles.targetedDuelBannerIcon}>🎯</div>
          <div className={styles.targetedDuelBannerText}>
            <strong>{isRtl ? "تم توجيهك إلى نزال مخصص بدعوة مباشرة!" : "You've arrived via a direct challenge link!"}</strong>
            <span>{isRtl ? "تم تمييز النزال المطلوب أدناه بإطار ذهبي متوهج. اضغط على 'قبول التحدي' لتبدأ المعركة فوراً!" : "The requested challenge is highlighted below. Click Accept Challenge to start immediately!"}</span>
          </div>
          <button
            type="button"
            className={styles.targetedDuelBannerClose}
            onClick={() => setTargetChallengeId(null)}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      )}

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
              {isRtl ? "الميدان بانتظار بطله الأول — نافس واربح الآن!" : "The Arena Awaits Its First Champion — Win Cash Now!"}
            </h3>
            <p className={styles.emptySubtitle}>
              {isRtl
                ? "لا توجد مبارزة مفتوحة في هذا الفلتر حالياً. أطلق أول تحدٍّ بمبلغ 5$ أو 10$ واكسب الجائزة الكبرى فور فوزك — سيصلك منافسك خلال ثوانٍ!"
                : "No duels open in this filter right now. Launch the first match for $5 or $10 and win the grand prize — opponents will join in seconds!"}
            </p>
            <Button
              variant="primary"
              className={styles.emptyCtaBtn}
              onClick={() => {
                if (!player) {
                  openPopup();
                  return;
                }
                if (selectedGameFilter !== "all") {
                  setNewGameId(selectedGameFilter);
                }
                setNewTier("CASH");
                setNewStake(5);
                setIsModalOpen(true);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {isRtl ? "⚔️ أطلق أول تحدٍّ نقدي واكسب 9.50$ USDT" : "⚔️ Launch $5 Cash Duel & Win $9.50 USDT"}
            </Button>
          </div>
        ) : (
          filteredDuels.map((duel) => {
            const isHighElo = duel.challenger.elo >= 1600;
            const remainingSeconds = Math.max(0, 300 - duel.createdSecondsAgo);
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;
            const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
            // 2x stake, minus the platform's default 10% rake (economy_rule's own
            // seeded default -- see db/migrations/0004 and 0035). Not the exact
            // rake for every game/tier, but never an overpromise the way 1.9x was.
            const expectedPrize = (duel.stakeUSDT * 1.8).toFixed(2);
            const isTargeted = targetChallengeId === duel.id;

            return (
              <div
                key={duel.id}
                id={`duel-${duel.id}`}
                className={`${styles.duelCard} ${
                  duel.tier === "CASH" ? styles.duelCardCash : ""
                } ${duel.isUserCreated ? styles.duelCardUser : ""} ${
                  isTargeted ? styles.duelCardTargeted : ""
                }`}
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
                    <span className={styles.specLabel}>{isRtl ? "قيمة التحدي" : "Match Stake"}</span>
                    <span
                      className={`${styles.specVal} ${
                        duel.tier === "CASH" ? styles.stakeValCash : styles.stakeValFree
                      }`}
                    >
                      {duel.tier === "CASH" ? `${duel.stakeUSDT} ${duel.asset}` : isRtl ? "مجاني" : "Free"}
                    </span>
                  </div>
                  {duel.tier === "CASH" && (
                    <div className={`${styles.specItem} ${styles.specItemPrize}`}>
                      <span className={styles.specLabel}>{isRtl ? "جائزة الفائز 🏆" : "Winner Prize 🏆"}</span>
                      <span className={styles.prizeValCash}>
                        {expectedPrize} {duel.asset}
                      </span>
                    </div>
                  )}
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

                      {/* Viral Social Share Row */}
                      <div className={styles.userShareRow}>
                        <button
                          type="button"
                          className={styles.shareWhatsAppBtn}
                          onClick={() => shareOnWhatsApp(duel, expectedPrize)}
                          title={isRtl ? "مشاركة النزال فوراً عبر واتساب" : "Share via WhatsApp"}
                        >
                          <span>💬</span>
                          <span>{isRtl ? "واتساب" : "WhatsApp"}</span>
                        </button>
                        <button
                          type="button"
                          className={styles.shareTelegramBtn}
                          onClick={() => shareOnTelegram(duel, expectedPrize)}
                          title={isRtl ? "مشاركة النزال عبر تيليجرام" : "Share via Telegram"}
                        >
                          <span>✈️</span>
                          <span>{isRtl ? "تيليجرام" : "Telegram"}</span>
                        </button>
                        <button
                          type="button"
                          className={styles.copyLinkBtn}
                          onClick={() => copyChallengeLink(duel.id)}
                          title={isRtl ? "نسخ رابط النزال" : "Copy match link"}
                        >
                          <span>{copiedDuelId === duel.id ? "✓" : "📋"}</span>
                          <span>{copiedDuelId === duel.id ? (isRtl ? "تم النسخ!" : "Copied!") : (isRtl ? "نسخ الرابط" : "Copy Link")}</span>
                        </button>
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
                      ) : duel.tier === "CASH" ? (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                          {isRtl ? `قبول التحدي (اكسب ${expectedPrize} ${duel.asset}) ⚔️` : `Accept & Win ${expectedPrize} ${duel.asset} ⚔️`}
                        </>
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
                    {isRtl ? "بجوائز نقدية حقيقية" : "Competitive Cash Stake"}
                  </button>
                </div>
              </div>

              {newTier === "CASH" && (
                <div className={styles.formGroup}>
                  <CoinPicker
                    value={newAsset}
                    onChange={(c) => { setNewAsset(c); setAssetTouched(true); }}
                    balances={balances}
                    label={isRtl ? "عملة النزال الرسمية المعتمدة:" : "Approved Official Match Currency:"}
                  />
                  <label className={styles.formLabel}>{isRtl ? `قيمة التحدي (${newAsset})` : `Stake Amount (${newAsset})`}</label>
                  
                  <div className={styles.currentBalanceDisplay}>
                    <span>{isRtl ? "رصيدك المتاح حالياً:" : "Current Available Balance:"}</span>
                    <strong className={(userBalanceUSDT ?? 0) >= newStake ? styles.sufficientBalance : styles.insufficientBalance}>
                      {(userBalanceUSDT ?? 0).toFixed(2)} {newAsset}
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
                        {amt} {newAsset}
                      </button>
                    ))}
                  </div>

                  {(userBalanceUSDT ?? 0) < newStake && (
                    <div className={styles.balanceWarningBanner}>
                      <span>
                        ⚠️ {isRtl
                          ? `رصيدك الحالي (${(userBalanceUSDT ?? 0).toFixed(2)} ${newAsset}) غير كافٍ لهذا النزال (${newStake}.00 ${newAsset}). يرجى شحن الرصيد أولاً أو اختيار اللعب المجاني.`
                          : `Your current balance (${(userBalanceUSDT ?? 0).toFixed(2)} ${newAsset}) is insufficient for this stake (${newStake}.00 ${newAsset}). Please deposit first or choose free practice.`}
                      </span>
                      <LocaleLink href="/wallet" className={styles.inlineDepositBtn}>
                        💳 {isRtl ? "شحن المحفظة الآن" : `Deposit ${newAsset}`}
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
                ? `أنت تحاول دخول نزال بمبلغ تحدٍّ قدره ${balanceWarningModal.requiredStake}.00 ${newAsset}، بينما رصيدك المتاح حالياً هو ${(userBalanceUSDT ?? 0).toFixed(2)} ${newAsset}. لا يمكن دخول النزالات النقدية بدون رصيد مسبق.`
                : `You are attempting to enter a duel with a ${balanceWarningModal.requiredStake}.00 ${newAsset} stake, but your available balance is ${(userBalanceUSDT ?? 0).toFixed(2)} ${newAsset}. Cash duels require sufficient pre-funded balance.`}
            </p>
            <div className={styles.warningModalActions}>
              <LocaleLink href="/wallet" className={styles.depositCtaBtn}>
                <span>💰</span>
                <span>{isRtl ? "شحن المحفظة فوراً (إيداع " + newAsset + ")" : `Deposit ${newAsset} Now`}</span>
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
