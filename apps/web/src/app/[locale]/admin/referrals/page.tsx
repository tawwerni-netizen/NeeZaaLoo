"use client";

import React, { useState, useEffect } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { get } from "@/lib/api";
import styles from "@/components/admin/AdminPageLayout.module.css";

type ReferralRow = {
  code: string;
  affiliateHandle: string;
  referredCount: number;
  totalVolumeUsdt: string;
  commissionEarnedUsdt: string;
  tier: "GOLD" | "SILVER" | "STANDARD";
  status: "ACTIVE" | "PAUSED";
};

type ReferralData = {
  stats: {
    activeAffiliates: number;
    referredPlayers: number;
    attributedVolumeUsdt: string;
    commissionPayoutsUsdt: string;
  };
  referrals: ReferralRow[];
};

export default function AdminReferralsPage() {
  const [data, setData] = useState<ReferralData>({
    stats: {
      activeAffiliates: 0,
      referredPlayers: 0,
      attributedVolumeUsdt: "0.00",
      commissionPayoutsUsdt: "0.00",
    },
    referrals: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await get<ReferralData>("/v1/admin/referrals");
        if (mounted && res && res.stats) {
          setData(res);
        }
      } catch (err) {
        console.error("Failed to load real referral stats:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const stats = data.stats;
  const referrals = data.referrals;

  return (
    <AdminPageLayout
      title="Referral Attribution & Affiliate Management"
      subtitle="Track partner performance, code attribution, and automated commission payouts with real-time dynamic data."
      breadcrumb={["Home", "Admin", "Referrals"]}
      stats={[
        { label: "Active Affiliates", value: `${stats.activeAffiliates} Partners`, trend: "Real-time" },
        { label: "Referred Players", value: stats.referredPlayers.toLocaleString(), trend: "Verified signups" },
        { label: "Attributed Volume", value: `$${stats.attributedVolumeUsdt}`, trend: "USDT Staked" },
        { label: "Commission Payouts", value: `$${stats.commissionPayoutsUsdt}`, trend: "Settled automatically" },
      ]}
    >
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Affiliate Partners ({referrals.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Referral Code</th>
                <th>Affiliate Handle</th>
                <th>Tier</th>
                <th>Referred Players</th>
                <th>Referred Staked Volume</th>
                <th>Commissions (USDT)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {referrals.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "var(--nz-text-3)" }}>
                    {loading ? "Loading dynamic affiliate data..." : "No active affiliate partners registered yet."}
                  </td>
                </tr>
              ) : (
                referrals.map((r) => (
                  <tr key={r.code}>
                    <td><code style={{ color: "#f59e0b", fontWeight: 700 }}>{r.code}</code></td>
                    <td><strong>{r.affiliateHandle}</strong></td>
                    <td>
                      <span className={`${styles.badge} ${r.tier === "GOLD" ? styles.badgeWarning : styles.badgeNeutral}`}>
                        {r.tier}
                      </span>
                    </td>
                    <td className="nz-num">{r.referredCount}</td>
                    <td className="nz-num">${r.totalVolumeUsdt}</td>
                    <td className="nz-num" style={{ color: "#22c55e", fontWeight: 700 }}>${r.commissionEarnedUsdt}</td>
                    <td>
                      <span className={`${styles.badge} ${styles.badgeSuccess}`}>{r.status}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminPageLayout>
  );
}
