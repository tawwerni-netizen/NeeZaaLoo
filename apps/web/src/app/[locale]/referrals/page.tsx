"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Header } from "@/components/Header";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { get, ApiError } from "@/lib/api";
import { formatUsd } from "@/lib/money";
import { useI18n } from "@/lib/i18n/context";
import styles from "./referrals.module.css";

type ReferralStats = {
  totalReferred: number;
  confirmedRewardMinor: string;
  pendingRewardMinor: string;
  reviewRewardMinor: string;
};

type ReferralHistoryItem = {
  attributionId: string;
  referredHandle: string;
  attributedAt: string;
  rewardState: string;
  rewardAmountMinor: string;
  depositAmountMinor: string | null;
  settledAt: string | null;
};

type ReferralDashboard = {
  code: string;
  shareUrl: string;
  stats: ReferralStats;
  history: ReferralHistoryItem[];
};

const VIP_TIERS = [
  { level: 1, nameKey: "tier_1_name", descKey: "tier_1_desc", min: 1, max: 5, icon: "🥉", color: "#cd7f32" },
  { level: 2, nameKey: "tier_2_name", descKey: "tier_2_desc", min: 6, max: 20, icon: "🥈", color: "#94a3b8" },
  { level: 3, nameKey: "tier_3_name", descKey: "tier_3_desc", min: 21, max: 50, icon: "🥇", color: "#f59e0b" },
  { level: 4, nameKey: "tier_4_name", descKey: "tier_4_desc", min: 51, max: 100, icon: "💎", color: "#38bdf8" },
  { level: 5, nameKey: "tier_5_name", descKey: "tier_5_desc", min: 101, max: 9999, icon: "👑", color: "#eab308" },
];

const SIMULATOR_PRESETS = [5, 10, 25, 50, 100, 250, 500];

export default function ReferralsPage() {
  return (
    <RequireAuth>
      <Header />
      <ReferralContent />
    </RequireAuth>
  );
}

function ReferralContent() {
  const { locale, dir, t } = useI18n();
  const isRtl = dir === "rtl";
  const { player } = useAuth();
  const [data, setData] = useState<ReferralDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calcFriends, setCalcFriends] = useState(25);
  const [searchQuery, setSearchQuery] = useState("");

  const loadData = useCallback(async () => {
    if (!player) return;
    try {
      const res = await get<ReferralDashboard>("/v1/me/referral");
      setData(res);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? (e.code ?? "REQUEST_FAILED") : "NETWORK_ERROR");
    } finally {
      setLoading(false);
    }
  }, [player]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://nizalo.com";
  const fullInviteUrl = data?.code ? `${origin}/r/${data.code}` : "";

  const handleCopy = async () => {
    if (!fullInviteUrl) return;
    try {
      await navigator.clipboard.writeText(fullInviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = fullInviteUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // Social Share URLs
  const localizedShareText = t("referralPage.share_text", { url: fullInviteUrl });
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(localizedShareText)}`;
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(fullInviteUrl)}&text=${encodeURIComponent(localizedShareText)}`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(localizedShareText)}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fullInviteUrl)}`;

  // VIP Tier Calculations
  const totalReferred = data?.stats.totalReferred ?? 0;
  const currentTier = useMemo(() => {
    if (totalReferred < 1) return null;
    return VIP_TIERS.slice().reverse().find((tier) => totalReferred >= tier.min) ?? null;
  }, [totalReferred]);

  const nextTier = useMemo(() => {
    if (!currentTier) return VIP_TIERS[0]!;
    const currentIndex = VIP_TIERS.findIndex((t) => t.level === currentTier.level);
    if (currentIndex >= 0 && currentIndex < VIP_TIERS.length - 1) {
      return VIP_TIERS[currentIndex + 1]!;
    }
    return null;
  }, [currentTier]);

  const tierProgressPercent = useMemo(() => {
    if (!nextTier) return 100;
    const prevMin = currentTier ? currentTier.min : 0;
    const target = nextTier.min;
    const currentClamped = Math.max(0, totalReferred - prevMin);
    const range = target - prevMin;
    return Math.min(100, Math.round((currentClamped / range) * 100));
  }, [currentTier, nextTier, totalReferred]);

  // Wealth Simulator Calculations
  const simInstantReward = (calcFriends * 1.0).toFixed(2);
  const simNetworkVol = (calcFriends * 25.0).toLocaleString();
  const simTier = useMemo(() => {
    const found = VIP_TIERS.slice().reverse().find((tier) => calcFriends >= tier.min);
    return found ?? VIP_TIERS[0]!;
  }, [calcFriends]);

  // Filtered Referral History
  const filteredHistory = useMemo(() => {
    if (!data?.history) return [];
    if (!searchQuery.trim()) return data.history;
    const q = searchQuery.toLowerCase().trim();
    return data.history.filter((h) => h.referredHandle.toLowerCase().includes(q));
  }, [data?.history, searchQuery]);

  const getStatusBadge = (state: string) => {
    switch (state) {
      case "SETTLED":
        return <span className={`${styles.statusBadge} ${styles.statusSettled}`}>{t("referralPage.status_settled")}</span>;
      case "FLAGGED_REVIEW":
        return <span className={`${styles.statusBadge} ${styles.statusReview}`}>{t("referralPage.status_review")}</span>;
      case "REJECTED_FRAUD":
        return <span className={`${styles.statusBadge} ${styles.statusRejected}`}>{t("referralPage.status_rejected")}</span>;
      case "ELIGIBLE":
      case "SETTLING":
      case "PENDING":
      default:
        return <span className={`${styles.statusBadge} ${styles.statusPending}`}>{t("referralPage.status_pending")}</span>;
    }
  };

  if (loading) {
    return (
      <main className={styles.page} dir={isRtl ? "rtl" : "ltr"}>
        <div className={styles.emptyState}>
          <div className={styles.spinner} />
          <p>{t("referralPage.loading")}</p>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className={styles.page} dir={isRtl ? "rtl" : "ltr"}>
        <div className={styles.emptyState}>
          <div className={styles.errorIcon}>⚠️</div>
          <p>
            {error === "CONTROL_DISABLED"
              ? t("referralPage.error_paused")
              : t("referralPage.error_failed")}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page} dir={isRtl ? "rtl" : "ltr"}>
      {/* Top Live Ticker / Social Proof */}
      <div className={styles.tickerBar}>
        <span className={styles.tickerBadge}>LIVE</span>
        <div className={styles.tickerTrack}>
          <span className={styles.tickerText}>
            {t("referralPage.ticker_item_1", { user: "omar_k" })} &nbsp;•&nbsp;{" "}
            {t("referralPage.ticker_item_2", { user: "samir99" })} &nbsp;•&nbsp;{" "}
            {t("referralPage.ticker_item_3", { user: "alex_pro" })} &nbsp;•&nbsp;{" "}
            {t("referralPage.ticker_item_4")}
          </span>
        </div>
      </div>

      {/* Hero / Wealth Banner */}
      <section className={styles.heroCard}>
        <div className={styles.heroGlow} />
        <div className={styles.heroTop}>
          <div className={styles.programPill}>
            <span className={styles.pillDot} />
            <span>{t("referralPage.badge")}</span>
          </div>
          {currentTier && (
            <div className={styles.activeTierPill} style={{ borderColor: currentTier.color }}>
              <span>{currentTier.icon}</span>
              <span>{t(`referralPage.${currentTier.nameKey}`)}</span>
            </div>
          )}
        </div>

        <h1 className={styles.heroTitle}>
          {t("referralPage.hero_title")}{" "}
          <span className={styles.heroGold}>{t("referralPage.hero_highlight")}</span>
        </h1>
        <p className={styles.heroDesc}>{t("referralPage.hero_desc")}</p>

        {/* Link Box */}
        <div className={styles.linkContainer}>
          <span className={styles.linkLabel}>{t("referralPage.your_link_label")}</span>
          <div className={styles.codeBox}>
            <span className={styles.codeBadge}>/r/{data.code}</span>
            <div className={styles.linkActions}>
              <button
                type="button"
                className={`${styles.copyBtn} ${copied ? styles.copyBtnSuccess : ""}`}
                onClick={handleCopy}
              >
                <span>{copied ? "✓" : "📋"}</span>
                <span>{copied ? t("referralPage.copied_toast") : t("referralPage.copy_btn")}</span>
              </button>
              <button
                type="button"
                className={styles.qrBtn}
                onClick={() => setShowQrModal(true)}
                title={t("referralPage.qr_btn")}
              >
                <span>📱</span>
                <span>{t("referralPage.qr_btn")}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 1-Click Viral Broadcast Strip */}
        <div className={styles.socialShareSection}>
          <span className={styles.socialShareTitle}>{t("referralPage.social_share_heading")}</span>
          <div className={styles.socialGrid}>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.socialBtn} ${styles.socialWhatsapp}`}
            >
              <span className={styles.socialIcon}>💬</span>
              <span>{t("referralPage.share_whatsapp")}</span>
            </a>
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.socialBtn} ${styles.socialTelegram}`}
            >
              <span className={styles.socialIcon}>✈️</span>
              <span>{t("referralPage.share_telegram")}</span>
            </a>
            <a
              href={twitterUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.socialBtn} ${styles.socialX}`}
            >
              <span className={styles.socialIcon}>𝕏</span>
              <span>{t("referralPage.share_x")}</span>
            </a>
            <a
              href={facebookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.socialBtn} ${styles.socialFacebook}`}
            >
              <span className={styles.socialIcon}>🌐</span>
              <span>{t("referralPage.share_facebook")}</span>
            </a>
          </div>
        </div>
      </section>

      {/* Metrics Cards */}
      <section className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIconBox}>👥</div>
          <span className={styles.statLabel}>{t("referralPage.stat_referred")}</span>
          <span className={styles.statValue}>{data.stats.totalReferred}</span>
        </div>

        <div className={`${styles.statCard} ${styles.statCardConfirmed}`}>
          <div className={styles.statIconBox}>💰</div>
          <span className={styles.statLabel}>{t("referralPage.stat_confirmed")}</span>
          <span className={`${styles.statValue} ${styles.statGreen}`}>
            ${formatUsd(data.stats.confirmedRewardMinor)}
          </span>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIconBox}>⏳</div>
          <span className={styles.statLabel}>{t("referralPage.stat_pending")}</span>
          <span className={`${styles.statValue} ${styles.statAmber}`}>
            ${formatUsd(data.stats.pendingRewardMinor)}
          </span>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIconBox}>🛡️</div>
          <span className={styles.statLabel}>{t("referralPage.stat_review")}</span>
          <span className={`${styles.statValue} ${styles.statBlue}`}>
            ${formatUsd(data.stats.reviewRewardMinor)}
          </span>
        </div>
      </section>

      {/* Interactive Wealth Simulator */}
      <section className={styles.simulatorCard}>
        <div className={styles.simHeader}>
          <div className={styles.simTitleGroup}>
            <span className={styles.simBadge}>⚡ ROI CALCULATOR</span>
            <h2 className={styles.simTitle}>{t("referralPage.calculator_title")}</h2>
            <p className={styles.simSubtitle}>{t("referralPage.calculator_subtitle")}</p>
          </div>
        </div>

        <div className={styles.simControls}>
          <div className={styles.simSliderRow}>
            <div className={styles.simSliderInfo}>
              <span className={styles.simSliderLabel}>{t("referralPage.calc_friends_label")}</span>
              <span className={styles.simSliderValue}>{calcFriends}</span>
            </div>
            <input
              type="range"
              min="1"
              max="500"
              value={calcFriends}
              onChange={(e) => setCalcFriends(Number(e.target.value))}
              className={styles.simSlider}
            />
          </div>

          <div className={styles.simPresets}>
            {SIMULATOR_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`${styles.presetBtn} ${calcFriends === preset ? styles.presetActive : ""}`}
                onClick={() => setCalcFriends(preset)}
              >
                +{preset}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.simResultsGrid}>
          <div className={styles.simResultBox}>
            <span className={styles.simResultLabel}>{t("referralPage.calc_instant_reward")}</span>
            <span className={styles.simResultCash}>+${simInstantReward}</span>
            <span className={styles.simResultSub}>100% withdrawable USDT</span>
          </div>

          <div className={styles.simResultBox}>
            <span className={styles.simResultLabel}>{t("referralPage.calc_tournament_vol")}</span>
            <span className={styles.simResultVol}>${simNetworkVol}</span>
            <span className={styles.simResultSub}>Network match activity</span>
          </div>

          <div className={styles.simResultBox}>
            <span className={styles.simResultLabel}>{t("referralPage.calc_tier_unlocked")}</span>
            <span className={styles.simResultTier} style={{ color: simTier.color }}>
              {simTier.icon} {t(`referralPage.${simTier.nameKey}`)}
            </span>
            <span className={styles.simResultSub}>{t(`referralPage.${simTier.descKey}`)}</span>
          </div>
        </div>
      </section>

      {/* VIP Affiliate Milestone Ladder */}
      <section className={styles.vipSection}>
        <div className={styles.vipHeader}>
          <div>
            <h2 className={styles.vipTitle}>{t("referralPage.vip_title")}</h2>
            <p className={styles.vipSubtitle}>{t("referralPage.vip_subtitle")}</p>
          </div>
          {nextTier ? (
            <div className={styles.vipProgressBox}>
              <div className={styles.vipProgressLabel}>
                <span>
                  {t("referralPage.vip_next_tier_progress", {
                    current: totalReferred,
                    target: nextTier.min,
                  })}
                </span>
                <span className={styles.vipPercentText}>{tierProgressPercent}%</span>
              </div>
              <div className={styles.vipProgressBar}>
                <div
                  className={styles.vipProgressFill}
                  style={{ width: `${tierProgressPercent}%` }}
                />
              </div>
            </div>
          ) : (
            <div className={styles.vipMaxBadge}>{t("referralPage.vip_max_tier")}</div>
          )}
        </div>

        <div className={styles.tiersGrid}>
          {VIP_TIERS.map((tier) => {
            const isUnlocked = totalReferred >= tier.min;
            const isCurrent = currentTier?.level === tier.level;
            return (
              <div
                key={tier.level}
                className={`${styles.tierCard} ${isUnlocked ? styles.tierUnlocked : styles.tierLocked} ${isCurrent ? styles.tierCurrentCard : ""}`}
                style={{ "--tier-color": tier.color } as React.CSSProperties}
              >
                <div className={styles.tierHeader}>
                  <span className={styles.tierIcon}>{tier.icon}</span>
                  {isCurrent && <span className={styles.currentBadge}>{t("referralPage.vip_current_tier")}</span>}
                </div>
                <h3 className={styles.tierName}>{t(`referralPage.${tier.nameKey}`)}</h3>
                <p className={styles.tierDesc}>{t(`referralPage.${tier.descKey}`)}</p>
                <div className={styles.tierThreshold}>
                  {tier.level === 5 ? "100+ friends" : `${tier.min}–${tier.max} friends`}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3-Step Blueprint */}
      <section className={styles.blueprintSection}>
        <h2 className={styles.blueprintHeading}>{t("referralPage.how_it_works_title")}</h2>
        <div className={styles.blueprintGrid}>
          <div className={styles.blueprintStep}>
            <div className={styles.blueprintIconBox}>1</div>
            <h3 className={styles.blueprintStepTitle}>{t("referralPage.step_1_title")}</h3>
            <p className={styles.blueprintStepDesc}>{t("referralPage.step_1_desc")}</p>
          </div>
          <div className={styles.blueprintStep}>
            <div className={styles.blueprintIconBox}>2</div>
            <h3 className={styles.blueprintStepTitle}>{t("referralPage.step_2_title")}</h3>
            <p className={styles.blueprintStepDesc}>{t("referralPage.step_2_desc")}</p>
          </div>
          <div className={styles.blueprintStep}>
            <div className={styles.blueprintIconBox}>3</div>
            <h3 className={styles.blueprintStepTitle}>{t("referralPage.step_3_title")}</h3>
            <p className={styles.blueprintStepDesc}>{t("referralPage.step_3_desc")}</p>
          </div>
        </div>
      </section>

      {/* History Table */}
      <section className={styles.historySection}>
        <div className={styles.historyHeader}>
          <h2 className={styles.historyTitle}>{t("referralPage.history_title")}</h2>
          {data.history.length > 0 && (
            <input
              type="text"
              placeholder={t("referralPage.search_placeholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
          )}
        </div>

        {filteredHistory.length === 0 ? (
          <div className={styles.emptyHistory}>{t("referralPage.history_empty")}</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.historyTable}>
              <thead>
                <tr>
                  <th>{t("referralPage.table_friend")}</th>
                  <th>{t("referralPage.table_joined")}</th>
                  <th>{t("referralPage.table_deposit")}</th>
                  <th>{t("referralPage.table_status")}</th>
                  <th>{t("referralPage.table_reward")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((h) => (
                  <tr key={h.attributionId}>
                    <td className={styles.handleCell}>
                      <span className={styles.avatarCircle}>
                        {h.referredHandle.charAt(0).toUpperCase()}
                      </span>
                      <span>@{h.referredHandle}</span>
                    </td>
                    <td>{new Date(h.attributedAt).toLocaleDateString()}</td>
                    <td>{h.depositAmountMinor ? `$${formatUsd(h.depositAmountMinor)}` : "—"}</td>
                    <td>{getStatusBadge(h.rewardState)}</td>
                    <td className={styles.rewardCell}>+${formatUsd(h.rewardAmountMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* QR Code Modal */}
      {showQrModal && (
        <div className={styles.modalOverlay} onClick={() => setShowQrModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>{t("referralPage.qr_modal_title")}</h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setShowQrModal(false)}
              >
                ✕
              </button>
            </div>
            <p className={styles.modalDesc}>{t("referralPage.qr_modal_desc")}</p>

            <div className={styles.qrImageFrame}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(fullInviteUrl)}&size=240x240&margin=10`}
                alt="Nizalo Referral QR"
                className={styles.qrImg}
                width={220}
                height={220}
              />
            </div>

            <div className={styles.modalUrlBox}>
              <span className={styles.modalUrlText}>{fullInviteUrl}</span>
            </div>

            <button
              type="button"
              className={`${styles.copyBtn} ${styles.modalActionBtn}`}
              onClick={handleCopy}
            >
              <span>{copied ? "✓" : "📋"}</span>
              <span>{copied ? t("referralPage.copied_toast") : t("referralPage.copy_btn")}</span>
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
