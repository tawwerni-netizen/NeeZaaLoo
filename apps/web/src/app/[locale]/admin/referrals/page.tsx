"use client";

import React, { useState } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
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

const INITIAL_REFERRALS: ReferralRow[] = [
  { code: "CHESS_PRO", affiliateHandle: "Grandmaster77", referredCount: 142, totalVolumeUsdt: "28,450.00", commissionEarnedUsdt: "1,422.50", tier: "GOLD", status: "ACTIVE" },
  { code: "DOMINO_VIP", affiliateHandle: "DominoKingAlex", referredCount: 88, totalVolumeUsdt: "14,200.00", commissionEarnedUsdt: "710.00", tier: "SILVER", status: "ACTIVE" },
  { code: "TAWLA_STAR", affiliateHandle: "TawlaMaster99", referredCount: 54, totalVolumeUsdt: "8,900.00", commissionEarnedUsdt: "445.00", tier: "SILVER", status: "ACTIVE" },
  { code: "COMMUNITY_01", affiliateHandle: "EsportsHub", referredCount: 220, totalVolumeUsdt: "41,000.00", commissionEarnedUsdt: "2,050.00", tier: "GOLD", status: "ACTIVE" },
];

export default function AdminReferralsPage() {
  const [referrals] = useState<ReferralRow[]>(INITIAL_REFERRALS);

  return (
    <AdminPageLayout
      title="Referral Attribution & Affiliate Management"
      subtitle="Track partner performance, code attribution, and automated commission payouts."
      breadcrumb={["Home", "Admin", "Referrals"]}
      stats={[
        { label: "Active Affiliates", value: "48 Partners", trend: "Verified" },
        { label: "Referred Players", value: "3,120", trend: "18% of total base" },
        { label: "Attributed Volume", value: "$182,400", trend: "USDT" },
        { label: "Commission Payouts", value: "$9,120.00", trend: "Settled automatically" },
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
              {referrals.map((r) => (
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminPageLayout>
  );
}
