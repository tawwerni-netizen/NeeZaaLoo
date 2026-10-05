"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useI18n } from "@/lib/i18n/context";
import { get, post } from "@/lib/api";
import { fromMinorUnits } from "@/lib/money";
import styles from "./battle-pass.module.css";

type Reward = {
  type: string;
  asset: string;
  amountMinor: string;
  claimed: boolean;
  canClaim: boolean;
};

type Tier = {
  level: number;
  requiredExp: number;
  isUnlocked: boolean;
  free: Reward | null;
  premium: Reward | null;
};

type SeasonProgress = {
  active: boolean;
  season?: {
    id: string;
    name: string;
    startsAt: string;
    endsAt: string;
  };
  seasonalExp?: number;
  isPremium?: boolean;
  tiers?: Tier[];
};

export default function BattlePassPage() {
  const { locale } = useI18n();
  const isAr = locale === "ar";
  const [data, setData] = useState<SeasonProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    fetchProgress();
  }, []);

  const fetchProgress = async () => {
    try {
      const res = await get("/v1/me/season-progress");
      setData(res as SeasonProgress);
    } catch (err: any) {
      setError(err.message || (isAr ? "تعذر تحميل بيانات الموسم" : "Failed to load season"));
    } finally {
      setLoading(false);
    }
  };

  const claimReward = async (level: number, track: "free" | "premium") => {
    if (!data?.season?.id || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await post("/v1/me/season/claim", {
        seasonId: data.season.id,
        level,
        track
      });
      setData(res as SeasonProgress);
      showToast(
        isAr ? `✓ تم استلام مكافأة المستوى ${level} بنجاح!` : `✓ Successfully claimed Level ${level} reward!`,
        "success"
      );
    } catch (err: any) {
      showToast(err.message || (isAr ? "فشل استلام المكافأة" : "Failed to claim reward"), "error");
    } finally {
      setActionLoading(false);
    }
  };

  const buyPremium = async () => {
    if (!data?.season?.id || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await post("/v1/me/season/premium", {
        seasonId: data.season.id
      });
      setData(res as SeasonProgress);
      showToast(
        isAr ? "🎉 تم تفعيل باقة بريميوم بنجاح! مبروك!" : "🎉 Premium Battle Pass activated successfully!",
        "success"
      );
    } catch (err: any) {
      showToast(err.message || (isAr ? "فشل تفعيل بريميوم" : "Failed to purchase premium"), "error");
    } finally {
      setActionLoading(false);
    }
  };

  const daysLeft = data?.season?.endsAt
    ? Math.max(0, Math.ceil((new Date(data.season.endsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const renderReward = (reward: Reward | null, level: number, track: "free" | "premium") => {
    if (!reward) return <div className={styles.rewardCard}>-</div>;
    
    let icon = "🎁";
    if (reward.type === "CURRENCY" || reward.type === "ASSET") {
      icon = reward.asset === "USDT" ? "💵" : "🪙";
    }

    const displayAmount = reward.asset === "USDT" && reward.amountMinor
      ? fromMinorUnits(reward.amountMinor).toFixed(2)
      : reward.amountMinor;

    return (
      <div className={`${styles.rewardCard} ${track === "premium" ? styles.rewardPremium : ""} ${!reward.canClaim && !reward.claimed ? styles.rewardLocked : ""}`}>
        <div className={styles.rewardIcon}>{icon}</div>
        <div className={styles.rewardName}>{displayAmount} {reward.asset}</div>
        {reward.claimed ? (
          <div className={styles.claimedBadge}>{isAr ? "تم الاستلام ✓" : "Claimed ✓"}</div>
        ) : reward.canClaim ? (
          <button 
            className={styles.claimBtn} 
            onClick={() => claimReward(level, track)}
            disabled={actionLoading}
          >
            {isAr ? "استلام" : "Claim"}
          </button>
        ) : (
          <div className={styles.claimedBadge}>{isAr ? "مقفل 🔒" : "Locked"}</div>
        )}
      </div>
    );
  };

  return (
    <RequireAuth>
      <div className={styles.wrap} dir={isAr ? "rtl" : "ltr"}>
        <Header />
        
        <main className={styles.container}>
          <div className={styles.hero}>
            <div className={styles.seasonMetaRow}>
              <div className={styles.seasonBadge}>
                {data?.season?.name || (isAr ? "الموسم الأول: بزوغ النيون" : "Season 1: Launch")}
              </div>
              {daysLeft !== null && (
                <div className={styles.seasonTimePill}>
                  <span>⏳</span>
                  <span>{isAr ? `ينتهي الموسم خلال ${daysLeft} يوم` : `Season ends in ${daysLeft} days`}</span>
                </div>
              )}
            </div>

            <h1 className={styles.title}>{isAr ? "بطاقة المعركة (Battle Pass)" : "Battle Pass"}</h1>
            <p className={styles.subtitle}>
              {isAr
                ? "خض النزالات التنافسية، اجمع نقاط الخبرة، وافتح مكافآت USDT الحقيقية. قم بالترقية إلى بريميوم للحصول على غنائم مضاعفة!"
                : "Play matches, earn EXP, and unlock real USDT rewards. Upgrade to Premium for 8x prize value!"}
            </p>

            <div className={styles.prizeSummaryStrip}>
              <span>🏆 {isAr ? "إجمالي مكافآت الموسم:" : "Total Season Cash Rewards:"}</span>
              <span className={styles.prizeVal}>4.00$ USDT {isAr ? "مجاناً" : "Free"}</span>
              <span>+</span>
              <span className={styles.prizeVal}>32.00$ USDT {isAr ? "للمشتركين المميزين" : "Premium"}</span>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "4rem" }}>{isAr ? "جاري التحميل..." : "Loading..."}</div>
          ) : error ? (
            <div style={{ textAlign: "center", color: "#ff6b6b", padding: "2rem" }}>{error}</div>
          ) : !data?.active || !data.tiers ? (
            <div style={{ textAlign: "center", padding: "4rem" }}>
              {isAr ? "لا يوجد موسم نشط حالياً. ترقبوا انطلاق الموسم القادم قريباً!" : "No active season right now. Check back later!"}
            </div>
          ) : (
            <>
              <div className={styles.statusCard}>
                <div className={styles.progressSection}>
                  <div className={styles.progressHeader}>
                    <span>{isAr ? "تقدمك الحالي" : "Your Progress"}</span>
                    <span>{data.seasonalExp || 0} EXP</span>
                  </div>
                  <div className={styles.progressBar}>
                    {/* Visual bar calculation based on max tier */}
                    <div 
                      className={styles.progressFill} 
                      style={{ width: `${Math.min(100, ((data.seasonalExp || 0) / (data.tiers[data.tiers.length - 1]?.requiredExp || 1)) * 100)}%` }} 
                    />
                  </div>
                </div>
                <div className={styles.premiumSection}>
                  {data.isPremium ? (
                    <>
                      <div className={styles.premiumBadge}>
                        {isAr ? "✨ باقة بريميوم مفعلة ✨" : "✨ PREMIUM ACTIVE ✨"}
                      </div>
                      <div>{isAr ? "استمتع بمكافآتك الحصرية وغنائمك المميزة!" : "Enjoy your exclusive rewards!"}</div>
                    </>
                  ) : (
                    <>
                      <div style={{ marginBottom: "1rem", fontWeight: "bold" }}>
                        {isAr ? "افتح مكافآت بريميوم الحصرية" : "Unlock Premium Rewards"}
                      </div>
                      <button className={styles.buyBtn} onClick={buyPremium} disabled={actionLoading}>
                        {isAr ? "تفعيل بريميوم (5.00$ USDT)" : "Buy Premium ($5.00 USDT)"}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className={styles.trackHeader}>
                <div>{isAr ? "المستوى" : "Level"}</div>
                <div>{isAr ? "المسار المجاني" : "Free Track"}</div>
                <div>{isAr ? "المسار المميز 🌟" : "Premium Track 🌟"}</div>
              </div>

              <div className={styles.tierList}>
                {data.tiers.map((tier) => (
                  <div key={tier.level} className={`${styles.tierRow} ${tier.isUnlocked ? styles.tierRowUnlocked : ""}`}>
                    <div className={styles.levelIndicator}>
                      <span className={styles.levelNum}>{tier.level}</span>
                      <span className={styles.levelExp}>{tier.requiredExp} EXP</span>
                    </div>
                    {renderReward(tier.free, tier.level, "free")}
                    {renderReward(tier.premium, tier.level, "premium")}
                  </div>
                ))}
              </div>

              {/* Action Banner to go play and earn EXP */}
              <div style={{ textAlign: "center", marginTop: "3rem" }}>
                <Link
                  href={`/${locale}/games`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "14px 32px",
                    background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                    color: "#fff",
                    borderRadius: "14px",
                    fontWeight: 800,
                    fontSize: "15px",
                    textDecoration: "none",
                    boxShadow: "0 6px 20px rgba(59, 130, 246, 0.4)",
                    transition: "transform 180ms ease",
                  }}
                >
                  <span>⚔️</span>
                  <span>{isAr ? "خوض النزالات الآن لجمع نقاط الخبرة EXP" : "Play Duels to Earn Seasonal EXP"}</span>
                </Link>
              </div>
            </>
          )}
        </main>

        {/* Floating Toast Notification */}
        {toast && (
          <div className={`${styles.toastBanner} ${toast.type === "success" ? styles.toastSuccess : styles.toastError}`}>
            <span>{toast.type === "success" ? "✓" : "⚠️"}</span>
            <span>{toast.message}</span>
          </div>
        )}
      </div>
      <Footer />
    </RequireAuth>
  );
}
