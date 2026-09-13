"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/Header";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { get, ApiError } from "@/lib/api";
import { formatUsd } from "@/lib/money";
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

export default function ReferralsPage() {
  return (
    <RequireAuth>
      <Header />
      <ReferralContent />
    </RequireAuth>
  );
}

function ReferralContent() {
  const { player } = useAuth();
  const [data, setData] = useState<ReferralDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleCopy = async () => {
    if (!data?.code) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "https://nizalo.com";
    const fullUrl = `${origin}/r/${data.code}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignore copy error
    }
  };

  const getStatusBadge = (state: string) => {
    switch (state) {
      case "SETTLED":
        return <span className={`${styles.statusBadge} ${styles.statusSettled}`}>CONFIRMED</span>;
      case "FLAGGED_REVIEW":
        return <span className={`${styles.statusBadge} ${styles.statusReview}`}>UNDER REVIEW</span>;
      case "REJECTED_FRAUD":
        return <span className={`${styles.statusBadge} ${styles.statusRejected}`}>REJECTED</span>;
      case "ELIGIBLE":
      case "SETTLING":
      case "PENDING":
      default:
        return <span className={`${styles.statusBadge} ${styles.statusPending}`}>PENDING DEPOSIT</span>;
    }
  };

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.emptyState}>Loading referral dashboard...</div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className={styles.page}>
        <div className={styles.emptyState}>
          {error === "CONTROL_DISABLED"
            ? "Referrals are temporarily paused for platform maintenance."
            : "Failed to load referral program details. Please try again later."}
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      {/* Hero / Invite Banner */}
      <section className={styles.heroCard}>
        <h1 className={styles.heroTitle}>
          Invite Friends. <span className={styles.heroGold}>Earn $1.00 Every Time.</span>
        </h1>
        <p className={styles.heroDesc}>
          Share your permanent link. When your friend registers and makes their first qualifying deposit of $5 or more, you receive a $1.00 USD reward deposited straight into your balance.
        </p>

        <div className={styles.codeBox}>
          <span className={styles.codeBadge}>/r/{data.code}</span>
          <button type="button" className={styles.copyBtn} onClick={handleCopy}>
            {copied ? "Copied Link!" : "Copy Invite Link"}
          </button>
          {copied && <span className={styles.copyToast}>✓ Link copied to clipboard</span>}
        </div>
      </section>

      {/* Metrics Cards */}
      <section className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Friends Referred</span>
          <span className={styles.statValue}>{data.stats.totalReferred}</span>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>Confirmed Rewards</span>
          <span className={`${styles.statValue} ${styles.statGreen}`}>
            ${formatUsd(data.stats.confirmedRewardMinor)}
          </span>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>Pending Rewards</span>
          <span className={`${styles.statValue} ${styles.statAmber}`}>
            ${formatUsd(data.stats.pendingRewardMinor)}
          </span>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>Under Review</span>
          <span className={`${styles.statValue} ${styles.statBlue}`}>
            ${formatUsd(data.stats.reviewRewardMinor)}
          </span>
        </div>
      </section>

      {/* History Table */}
      <section className={styles.historySection}>
        <h2 className={styles.sectionTitle}>Referral History</h2>

        {data.history.length === 0 ? (
          <div className={styles.emptyState}>
            No referrals yet. Share your invite link above to get started!
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Referred Player</th>
                  <th>Joined Date</th>
                  <th>Status</th>
                  <th>Deposit</th>
                  <th>Reward</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((item) => (
                  <tr key={item.attributionId}>
                    <td>@{item.referredHandle}</td>
                    <td>{new Date(item.attributedAt).toLocaleDateString()}</td>
                    <td>{getStatusBadge(item.rewardState)}</td>
                    <td>
                      {item.depositAmountMinor
                        ? `$${formatUsd(item.depositAmountMinor)}`
                        : "—"}
                    </td>
                    <td>
                      {item.rewardState === "SETTLED"
                        ? `+$${formatUsd(item.rewardAmountMinor)}`
                        : `$${formatUsd(item.rewardAmountMinor)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
