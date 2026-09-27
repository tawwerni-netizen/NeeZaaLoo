"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useI18n } from "@/lib/i18n/context";
import { get, post } from "@/lib/api";
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
  const { t } = useI18n();
  const [data, setData] = useState<SeasonProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchProgress();
  }, []);

  const fetchProgress = async () => {
    try {
      const res = await get("/v1/me/season-progress");
      setData(res as SeasonProgress);
    } catch (err: any) {
      setError(err.message || "Failed to load season");
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
    } catch (err: any) {
      alert(err.message || "Failed to claim reward");
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
    } catch (err: any) {
      alert(err.message || "Failed to purchase premium");
    } finally {
      setActionLoading(false);
    }
  };

  const renderReward = (reward: Reward | null, level: number, track: "free" | "premium") => {
    if (!reward) return <div className={styles.rewardCard}>-</div>;
    
    let icon = "🎁";
    if (reward.type === "CURRENCY") {
      icon = reward.asset === "USDT" ? "💵" : "🪙";
    }

    return (
      <div className={`${styles.rewardCard} ${track === "premium" ? styles.rewardPremium : ""} ${!reward.canClaim && !reward.claimed ? styles.rewardLocked : ""}`}>
        <div className={styles.rewardIcon}>{icon}</div>
        <div className={styles.rewardName}>{reward.amountMinor} {reward.asset}</div>
        {reward.claimed ? (
          <div className={styles.claimedBadge}>Claimed ✓</div>
        ) : reward.canClaim ? (
          <button 
            className={styles.claimBtn} 
            onClick={() => claimReward(level, track)}
            disabled={actionLoading}
          >
            Claim
          </button>
        ) : (
          <div className={styles.claimedBadge}>Locked</div>
        )}
      </div>
    );
  };

  return (
    <RequireAuth>
      <div className={styles.wrap}>
        <Header />
        
        <main className={styles.container}>
          <div className={styles.hero}>
            <div className={styles.seasonBadge}>
              {data?.season?.name || "Current Season"}
            </div>
            <h1 className={styles.title}>Battle Pass</h1>
            <p className={styles.subtitle}>
              Play matches, earn EXP, and unlock exclusive rewards. 
              Upgrade to Premium for even more loot!
            </p>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "4rem" }}>Loading...</div>
          ) : error ? (
            <div style={{ textAlign: "center", color: "red" }}>{error}</div>
          ) : !data?.active || !data.tiers ? (
            <div style={{ textAlign: "center", padding: "4rem" }}>No active season right now. Check back later!</div>
          ) : (
            <>
              <div className={styles.statusCard}>
                <div className={styles.progressSection}>
                  <div className={styles.progressHeader}>
                    <span>Your Progress</span>
                    <span>{data.seasonalExp} EXP</span>
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
                      <div className={styles.premiumBadge}>✨ PREMIUM ACTIVE ✨</div>
                      <div>Enjoy your exclusive rewards!</div>
                    </>
                  ) : (
                    <>
                      <div style={{ marginBottom: "1rem" }}>Unlock Premium Rewards</div>
                      <button className={styles.buyBtn} onClick={buyPremium} disabled={actionLoading}>
                        Buy Premium (5 USDT)
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className={styles.trackHeader}>
                <div>Level</div>
                <div>Free Track</div>
                <div>Premium Track 🌟</div>
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
            </>
          )}
        </main>
      </div>
      <Footer />
    </RequireAuth>
  );
}
