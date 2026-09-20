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
  { stake: 2, prize: 3.52, tagAr: "بداية سريعة 🚀", tagEn: "Fast Start 🚀" },
  { stake: 5, prize: 8.80, tagAr: "نزال الأبطال 🔥 الأكثر طلباً", tagEn: "Popular 🔥 Most Wanted", popular: true },
  { stake: 10, prize: 17.60, tagAr: "تحدي المحترفين ⚡", tagEn: "Pro Duel ⚡" },
  { stake: 25, prize: 44.00, tagAr: "نزال النخبة 💎", tagEn: "Elite 💎" },
  { stake: 50, prize: 88.00, tagAr: "كبار المتحدين 👑", tagEn: "High-Roller 👑" },
];

// Last-resort fallback when a game has no real photography yet (e.g. a
// brand-new game shipped before its badge/hero JPGs exist) -- a small
// inline placeholder beats a broken-image icon in the open-duel list.
const BADGE_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%230D111A'/%3E%3Ccircle cx='32' cy='32' r='18' fill='none' stroke='%23FFD700' stroke-opacity='0.45' stroke-width='2'/%3E%3Ccircle cx='32' cy='32' r='4' fill='%23FFD700' fill-opacity='0.7'/%3E%3C/svg%3E";

const formatUsdt = (num: number) =>
  num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function LiveDuelLobby({ filterGameId }: { filterGameId?: string }) {
  const { locale, dir, t } = useI18n();
  const isRtl = dir === "rtl";
  const { player } = useAuth();
  const { openPopup } = useAuthPopup();
  const router = useRouter();

  const [duels, setDuels] = useState<OpenDuel[]>(INITIAL_OPEN_DUELS);

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
            createdSecondsAgo: (() => {
              const diffSec = Math.floor((Date.now() - new Date(c.createdAt).getTime()) / 1000);
              return isNaN(diffSec) ? 0 : Math.max(0, Math.min(diffSec, 180));
            })(),
            isUserCreated: c.creator?.id === player?.id || c.creator?.handle === player?.handle,
          };
        });
        setDuels(mapped);
      }
    } catch (err) {
      console.error("Error loading open challenges:", err);
    }
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

  // Auto-dismiss the insufficient balance popup after 3 seconds as requested
  useEffect(() => {
    if (!balanceWarningModal?.open) return;
    const timer = setTimeout(() => {
      setBalanceWarningModal(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [balanceWarningModal]);

  const [copiedDuelId, setCopiedDuelId] = useState<string | null>(null);
  const [targetChallengeId, setTargetChallengeId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const cId = sp.get("challenge") || sp.get("duel");
      if (cId) {
        setTargetChallengeId(cId);
      }
      const stakeParam = sp.get("stake");
      const tierParam = sp.get("tier");
      if (stakeParam) {
        const num = Number(stakeParam);
        if (!isNaN(num) && num > 0) {
          setNewStake(num);
          if (tierParam === "CASH" || tierParam === "FREE") {
            setNewTier(tierParam as "CASH" | "FREE");
          }
          if (player) {
            setIsModalOpen(true);
          }
        }
      }
    }
  }, [player]);

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
        const expiredUser = prev.find((d) => d.isUserCreated && d.createdSecondsAgo + 1 >= 300);
        if (expiredUser) {
          setExpiredNotice(
            isRtl
              ? "انتهت مهلة انتظار الخصم (5 دقائق) للمبارزة وتم إلغاؤها تلقائياً."
              : "The 5-minute waiting window for your challenge expired and was closed."
          );
        }
        // Retain all challenges and only drop expired user-created ones.
        // Server polling (loadOpenChallenges) keeps the official open set fresh.
        return prev
          .filter((d) => !d.isUserCreated || d.createdSecondsAgo + 1 < 300)
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
    if (duel.tier === "CASH") {
      const currentBal = userBalanceUSDT ?? 0;
      if (currentBal < duel.stakeUSDT) {
        setBalanceWarningModal({ open: true, requiredStake: duel.stakeUSDT });
        return;
      }
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
      const errMsg = err?.response?.data?.error?.message || err?.message || "Failed";
      if (errMsg.includes("balance") || errMsg.includes("funds")) {
         setBalanceWarningModal({ open: true, requiredStake: duel.stakeUSDT });
      } else {
         alert(isRtl ? `عذراً، لا يمكن قبول هذا التحدي: ${errMsg}` : `Cannot accept challenge: ${errMsg}`);
      }
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

      {/* Hero Zone: Challenge Radar & Instant Stakes Command Center (صدر الصفحة) */}
      <div className={styles.heroRadar}>
        <div className={styles.radarVisualContainer}>
          <div className={styles.radarGraphic}>
            <div className={styles.radarCircleOuter} />
            <div className={styles.radarCircleMiddle} />
            <div className={styles.radarCircleInner} />
            <div className={styles.radarCrosshairsH} />
            <div className={styles.radarCrosshairsV} />
            <div className={styles.radarBeam} />
            <div className={styles.radarCenterIcon}>⚔️</div>
            {/* Ambient Challenger Blips */}
            <span className={`${styles.radarBlip} ${styles.blip1}`} />
            <span className={`${styles.radarBlip} ${styles.blip2}`} />
            <span className={`${styles.radarBlip} ${styles.blip3}`} />
          </div>
        </div>

        <div className={styles.heroRadarContent}>
          <div className={styles.radarStatusPill}>
            <span className={styles.radarSweep} />
            <span className={styles.radarDot} />
            <span className={styles.radarStatusText}>
              {isRtl ? "رادار النزالات المباشرة نشط الآن" : "Live Duel Radar Active"}
            </span>
          </div>

          <h2 className={styles.heroRadarTitle}>
            {isRtl ? "⚔️ رادار التحديات والمبارزات المباشرة (1v1)" : "⚔️ Live Member Duel Radar (1v1)"}
          </h2>

          <p className={styles.heroRadarSubtitle}>
            {isRtl
              ? "نافس أبطالاً حقيقيين بمهارتك في ألعاب عادلة 100% بدون أي حظ — اكسب 88% من وعاء النزال واسحب أرباحك فوراً بالـ USDT."
              : "Compete against real champions with pure skill in 100% deterministic games — win 88% of the prize pool and withdraw instant USDT."}
          </p>

          {/* Quick Stakes Row */}
          <div className={styles.heroQuickStakesWrap}>
            <span className={styles.quickStakesLabel}>
              ⚡ {isRtl ? "اختر باقة التحدي وابدأ فوراً:" : "Choose instant stake & launch:"}
            </span>
            <div className={styles.quickStakesRow}>
              {QUICK_STAKES.map((qs) => (
                <button
                  key={qs.stake}
                  type="button"
                  className={`${styles.heroStakeChip} ${qs.popular ? styles.heroStakeChipPopular : ""}`}
                  onClick={() => handleQuickStakeClick(qs.stake)}
                  title={isRtl ? `تحدي بقيمة ${qs.stake}$ لربح ${qs.prize.toFixed(2)}$` : `Stake $${qs.stake} to win $${qs.prize.toFixed(2)}`}
                >
                  {qs.popular && (
                    <span className={styles.heroPopularBadge}>
                      {isRtl ? "الأكثر طلباً 🔥" : "Hot 🔥"}
                    </span>
                  )}
                  <span className={styles.heroStakeAmount}>${qs.stake}</span>
                  <span className={styles.heroPrizeAmount}>
                    {isRtl ? "تكسب" : "Win"} <strong>${qs.prize.toFixed(2)}</strong>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Hero Action Buttons */}
          <div className={styles.heroActionsRow}>
            <Button
              variant="primary"
              className={styles.heroCreateBtn}
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
              {isRtl ? "أطلق نزالك الآن واكسب الكاش" : "Create Open Duel & Win Cash"}
            </Button>

            <button
              type="button"
              className={styles.heroFriendBtn}
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
              <span>{isRtl ? "تحدَّ صديقاً برابط مباشر" : "Challenge Friend (Direct Link)"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Live Pulse Ticker Ribbon (100% Honest Guarantees - Zero Cold-Start Vanity Counters) */}
      <div className={styles.liveTickerRibbon}>
        <div className={styles.tickerItem}>
          <span className={styles.tickerDotOnline} />
          <span>{isRtl ? "سيرفرات النزال:" : "Arena Servers:"}</span>
          <strong className={styles.tickerHighlight}>
            {isRtl ? "متصلة وجاهزة 24/7" : "100% Online & Ready 24/7"}
          </strong>
        </div>
        <div className={styles.tickerDivider}>•</div>
        <div className={styles.tickerItem}>
          <span>⚡</span>
          <span>{isRtl ? "سحب فوري:" : "Instant Cashout:"}</span>
          <strong className={styles.tickerHighlightGold}>
            {isRtl ? "تحويل آلي خلال 60ث بالـ USDT" : "< 60s Automated USDT"}
          </strong>
        </div>
        <div className={styles.tickerDivider}>•</div>
        <div className={styles.tickerItem}>
          <span>💎</span>
          <span>{isRtl ? "أرباح الفائز:" : "Winner Payout:"}</span>
          <strong className={styles.tickerHighlightGold}>
            {isRtl ? "88% من وعاء التحدي (عمولة 12% فقط)" : "88% Net Pool (12% Fee)"}
          </strong>
        </div>
        <div className={styles.tickerDivider}>•</div>
        <div className={styles.tickerItem}>
          <span>🔒</span>
          <span>{isRtl ? "تحكيم عادل 100%:" : "Provably Fair:"}</span>
          <strong>{isRtl ? "مهارة بدون أي صدفة أو حظ" : "100% Deterministic Skill"}</strong>
        </div>
        <div className={styles.tickerDivider}>•</div>
        <div className={styles.tickerItem}>
          <span>🤖</span>
          <span>{isRtl ? "نزال فوري:" : "Instant Play:"}</span>
          <strong>{isRtl ? "تحدي الحاسوب متاح 24/7 دون انتظار" : "Play AI Anytime 24/7"}</strong>
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
            {isRtl ? `جميع الألعاب (${AVAILABLE_GAMES.length})` : `All Games (${AVAILABLE_GAMES.length})`}
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
          <div className={styles.emptyNoticeCard}>
            <div className={styles.emptyNoticeIcon}>🎯</div>
            <div className={styles.emptyNoticeText}>
              <h3 className={styles.emptyNoticeTitle}>
                {isRtl ? "الميدان بانتظار بطله! كن أول من يبدأ النزال" : "The Arena Awaits Its First Champion!"}
              </h3>
              <p className={styles.emptyNoticeSubtitle}>
                {isRtl
                  ? "لا يوجد نزال مفتوح بهذا الفلتر حالياً. أطلق أول تحدٍّ بمبلغ 5$ واكسب 8.80$ فوراً — سيصلك منافسك خلال ثوانٍ!"
                  : "No open challenges with this filter right now. Launch the first match for $5 and win $8.80 USDT — opponents will join in seconds!"}
              </p>
            </div>
            <Button
              variant="primary"
              className={styles.emptyNoticeCtaBtn}
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
              {isRtl ? "⚔️ أطلق أول تحدٍّ بقيمة 5$ (اربح 8.80$)" : "⚔️ Launch $5 Duel (Win $8.80)"}
            </Button>
          </div>
        ) : (
          filteredDuels.map((duel) => {
            const isHighElo = duel.challenger.elo >= 1600;
            const remainingSeconds = Math.max(0, 300 - duel.createdSecondsAgo);
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;
            const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
            // 2x stake, minus the platform's default 12% rake (88% winner payout).
            const expectedPrize = (duel.stakeUSDT * 1.76).toFixed(2);
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
                style={{
                  backgroundImage: `linear-gradient(to right, rgba(16, 20, 30, 0.95) 0%, rgba(16, 20, 30, 0.7) 100%), url(/images/games/${duel.gameId}-hero.jpg)`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                <div className={styles.duelCardTop}>
                  <div className={styles.challengerInfo}>
                    <div className={styles.challengerAvatarWrap}>
                      <div className={styles.challengerAvatar} style={{ borderColor: isHighElo ? "#fbbf24" : undefined }}>
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
                        <span>{isRtl ? `التقييم: ${duel.challenger.elo}` : `Rating: ${duel.challenger.elo}`}</span>
                        {isHighElo && <span>👑</span>}
                      </div>
                    </div>
                  </div>

                  <div className={styles.duelGameBadgeGlass}>
                    <img
                      src={`/images/games/${duel.gameId}-badge.jpg`}
                      alt={duel.gameName}
                      className={styles.duelGameThumbGlass}
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        if (!img.dataset.fallbackStage) {
                          img.dataset.fallbackStage = "plain";
                          img.src = `/images/games/${duel.gameId}.jpg`;
                        } else {
                          img.onerror = null;
                          img.src = BADGE_PLACEHOLDER;
                        }
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

      {/* 3 Pillars of Winning & Platform Trust */}
      <div className={styles.trustPillarsRow}>
        <div className={styles.trustPillar}>
          <span className={styles.pillarIcon}>💎</span>
          <div className={styles.pillarTextWrap}>
            <strong className={styles.pillarTitle}>
              {isRtl ? "العب واكسب بمهارتك" : "Play & Win With Pure Skill"}
            </strong>
            <span className={styles.pillarDesc}>
              {isRtl ? "الفائز يحصل على مجموع جوائز التحدي مع رسوم تنظيم منصة 12% فقط." : "Winner takes the challenge prize pool directly with a 12% platform fee."}
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
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  img.onerror = null;
                  img.src = BADGE_PLACEHOLDER;
                }}
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
                    {[2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000].map((amt) => {
                      const isVip = amt >= 1000;
                      return (
                        <button
                          key={amt}
                          type="button"
                          className={`${styles.stakePillBtn} ${newStake === amt ? styles.stakePillBtnActive : ""} ${isVip ? styles.stakePillBtnVip : ""}`}
                          onClick={() => setNewStake(amt)}
                        >
                          {isVip && <span className={styles.vipCrownIcon}>{amt === 2000 ? "💎" : "👑"}</span>}
                          {amt >= 1000 ? `${amt.toLocaleString()} ` : `${amt} `}{newAsset}
                        </button>
                      );
                    })}
                  </div>

                  {/* Chic, Tempting, Real-Number Prize & Profit Breakdown HUD */}
                  <div className={styles.prizeBreakdownBox}>
                    <div className={styles.prizeBreakdownHeader}>
                      <div className={styles.prizeBreakdownLabel}>
                        <span className={styles.prizeTrophyIcon}>🏆</span>
                        <span>{isRtl ? "الجائزة النقدية للفائز (88% من الوعاء):" : "Winner Cash Prize (88% Pool):"}</span>
                      </div>
                      <span className={styles.profitBadge}>
                        +{formatUsdt(newStake * 0.76)} {newAsset} {isRtl ? "ربح صافٍ (1.76x)" : "Net Profit (1.76x)"}
                      </span>
                    </div>

                    <div className={styles.prizeAmountHeroRow}>
                      <div className={styles.prizeAmountHero}>
                        <span className={styles.prizeAmountNum}>{formatUsdt(newStake * 1.76)}</span>
                        <span className={styles.prizeAmountCurrency}>{newAsset}</span>
                      </div>
                      <div className={styles.prizeMultiTag}>1.76x MULTIPLIER</div>
                    </div>

                    <div className={styles.prizeDetailsGrid}>
                      <div className={styles.prizeDetailItem}>
                        <span className={styles.prizeDetailLabel}>{isRtl ? "مساهمتك" : "Your Stake"}</span>
                        <span className={styles.prizeDetailValue}>{formatUsdt(newStake)} {newAsset}</span>
                      </div>
                      <div className={styles.prizeDetailItem}>
                        <span className={styles.prizeDetailLabel}>{isRtl ? "إجمالي الوعاء" : "Total Match Pot"}</span>
                        <span className={styles.prizeDetailValue}>{formatUsdt(newStake * 2)} {newAsset}</span>
                      </div>
                      <div className={styles.prizeDetailItem}>
                        <span className={styles.prizeDetailLabel}>{isRtl ? "عمولة المنصة" : "Platform Fee"}</span>
                        <span className={styles.prizeDetailValueFee}>12% ({formatUsdt(newStake * 0.24)} {newAsset})</span>
                      </div>
                    </div>

                    <div className={styles.prizeBreakdownFooter}>
                      <span>⚡</span>
                      <span>
                        {isRtl
                          ? "الأرباح تُحوّل آلياً وفورياً لمحفظتك فور الفوز ويمكن سحبها في أقل من 60 ثانية."
                          : "Winnings auto-credit directly to your wallet upon victory — cash out in under 60 seconds."}
                      </span>
                    </div>
                  </div>

                  {(userBalanceUSDT ?? 0) < newStake && (
                    <div className={styles.balanceWarningBanner}>
                      <span>
                        ⚠️ {isRtl
                          ? `رصيدك الحالي (${(userBalanceUSDT ?? 0).toFixed(2)} ${newAsset}) غير كافٍ لهذا النزال (${newStake.toLocaleString()}.00 ${newAsset}). يرجى شحن الرصيد أولاً أو اختيار اللعب المجاني.`
                          : `Your current balance (${(userBalanceUSDT ?? 0).toFixed(2)} ${newAsset}) is insufficient for this stake (${newStake.toLocaleString()}.00 ${newAsset}). Please deposit first or choose free practice.`}
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
            <button
              type="button"
              className={styles.modalCloseX}
              onClick={() => setBalanceWarningModal(null)}
              aria-label={isRtl ? "إغلاق" : "Close"}
            >
              ✕
            </button>
            <div className={styles.warningIconGlow}>💳</div>
            <h3 className={styles.warningModalTitle}>
              {t("lobby.insufficient_title")}
            </h3>
            <p className={styles.warningModalDesc}>
              {t("lobby.insufficient_desc", {
                stake: `${balanceWarningModal.requiredStake}.00 ${newAsset}`,
                balance: `${(userBalanceUSDT ?? 0).toFixed(2)} ${newAsset}`,
              })}
            </p>
            <div className={styles.warningModalActions}>
              <LocaleLink href="/wallet" className={styles.depositCtaBtn}>
                <span>💰</span>
                <span>{t("lobby.deposit_now")} ({newAsset})</span>
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
                {t("lobby.play_free_alt")}
              </button>
            </div>
            <div className={styles.modalCountdownWrap} title={t("lobby.auto_close_3s")}>
              <div className={styles.modalCountdownFill} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
