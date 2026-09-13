"use client";

import React, { useState } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import styles from "@/components/admin/AdminPageLayout.module.css";

type WithdrawalRow = {
  id: string;
  playerHandle: string;
  destinationAddress: string;
  network: "TRC20" | "ERC20" | "BEP20";
  amountUsdt: string;
  riskRating: "LOW_RISK" | "MEDIUM_RISK" | "HIGH_RISK";
  status: "PENDING" | "APPROVED" | "COMPLETED" | "REJECTED";
  requestedAt: string;
};

const INITIAL_WITHDRAWALS: WithdrawalRow[] = [
  { id: "wd_1041", playerHandle: "Grandmaster77", destinationAddress: "TW2r...99xTRC20", network: "TRC20", amountUsdt: "150.00", riskRating: "LOW_RISK", status: "PENDING", requestedAt: "10 mins ago" },
  { id: "wd_1042", playerHandle: "DominoKingAlex", destinationAddress: "0x77...bbERC20", network: "ERC20", amountUsdt: "200.00", riskRating: "LOW_RISK", status: "PENDING", requestedAt: "25 mins ago" },
  { id: "wd_1043", playerHandle: "CheckersChamp", destinationAddress: "TX88...33TRC20", network: "TRC20", amountUsdt: "80.00", riskRating: "LOW_RISK", status: "COMPLETED", requestedAt: "2 hours ago" },
  { id: "wd_1044", playerHandle: "SuspiciousBot9", destinationAddress: "0x99...44BEP20", network: "BEP20", amountUsdt: "350.00", riskRating: "HIGH_RISK", status: "REJECTED", requestedAt: "Yesterday" },
];

export default function AdminWithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>(INITIAL_WITHDRAWALS);
  const [notice, setNotice] = useState<string | null>(null);

  function processWithdrawal(id: string, newStatus: "APPROVED" | "REJECTED") {
    setWithdrawals((prev) =>
      prev.map((w) => (w.id === id ? { ...w, status: newStatus } : w))
    );
    setNotice(`Withdrawal ${id} marked as ${newStatus}. Signed by Admin.`);
    setTimeout(() => setNotice(null), 3500);
  }

  return (
    <AdminPageLayout
      title="USDT Withdrawals & Treasury Payout Terminal"
      subtitle="Multi-signature approval, destination validation, and anti-fraud automated checks before broadcast."
      breadcrumb={["Home", "Admin", "Withdrawals"]}
      stats={[
        { label: "Pending Payouts", value: "2 Requests", trend: "$350.00 USDT" },
        { label: "24h Settled Outflow", value: "$6,240.00", trend: "USDT" },
        { label: "Average Settlement Time", value: "4.2 mins", trend: "Fast SLA" },
        { label: "Rejected / Suspicious", value: "1", trend: "Flagged by Risk Radar" },
      ]}
    >
      {notice && (
        <div style={{ padding: "10px 16px", background: "rgba(34, 197, 94, 0.1)", border: "1px solid #22c55e", borderRadius: "8px", marginBottom: "16px", color: "#22c55e", fontSize: "13px" }}>
          ✓ {notice}
        </div>
      )}

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Withdrawal Payout Queue ({withdrawals.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Withdrawal ID</th>
                <th>Player</th>
                <th>Destination Address</th>
                <th>Network</th>
                <th>Amount (USDT)</th>
                <th>Risk Rating</th>
                <th>Status</th>
                <th>Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((w) => (
                <tr key={w.id}>
                  <td><code>{w.id}</code></td>
                  <td><strong>{w.playerHandle}</strong></td>
                  <td>
                    <code style={{ color: "#e2e8f0" }}>{w.destinationAddress}</code>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeNeutral}`}>{w.network}</span>
                  </td>
                  <td className="nz-num" style={{ fontWeight: 700 }}>${w.amountUsdt}</td>
                  <td>
                    <span
                      className={`${styles.badge} ${
                        w.riskRating === "LOW_RISK"
                          ? styles.badgeSuccess
                          : w.riskRating === "MEDIUM_RISK"
                          ? styles.badgeWarning
                          : styles.badgeDanger
                      }`}
                    >
                      {w.riskRating}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`${styles.badge} ${
                        w.status === "COMPLETED" || w.status === "APPROVED"
                          ? styles.badgeSuccess
                          : w.status === "PENDING"
                          ? styles.badgeWarning
                          : styles.badgeDanger
                      }`}
                    >
                      {w.status}
                    </span>
                  </td>
                  <td className="nz-num">{w.requestedAt}</td>
                  <td style={{ display: "flex", gap: "6px" }}>
                    {w.status === "PENDING" ? (
                      <>
                        <button
                          type="button"
                          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                          onClick={() => processWithdrawal(w.id, "APPROVED")}
                        >
                          Approve Payout
                        </button>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => processWithdrawal(w.id, "REJECTED")}
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <span style={{ color: "#64748b", fontSize: "12px" }}>Settled</span>
                    )}
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
