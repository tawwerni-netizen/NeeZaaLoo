"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { Button } from "@/components/Button";
import { get, post } from "@/lib/api";
import styles from "@/components/admin/AdminPageLayout.module.css";

type WithdrawalItem = {
  id: string;
  player_id: string;
  player_handle: string;
  asset: string;
  network: string;
  destination: string;
  amount_minor: string;
  fee_minor: string;
  status: string;
  tx_hash: string | null;
  risk_score: number | null;
  failure_reason: string | null;
  requested_at: string;
  completed_at: string | null;
  confirmations: number | null;
  hold_reason: string | null;
};

type WithdrawalStats = {
  pending_count: number;
  pending_amount_minor: string;
  settled_24h_count: number;
  settled_24h_minor: string;
  rejected_count: number;
};

export default function AdminWithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);
  const [stats, setStats] = useState<WithdrawalStats>({
    pending_count: 0,
    pending_amount_minor: "0",
    settled_24h_count: 0,
    settled_24h_minor: "0",
    rejected_count: 0,
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadWithdrawals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);

      const res = await get<{ withdrawals: WithdrawalItem[]; stats: WithdrawalStats }>(
        `/v1/admin/withdrawals?${params.toString()}`
      );
      if (res.withdrawals) setWithdrawals(res.withdrawals);
      if (res.stats) setStats(res.stats);
    } catch (e) {
      console.error("Failed to load withdrawals:", e);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadWithdrawals();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadWithdrawals]);

  async function handleApprove(id: string) {
    if (!window.confirm(`Approve withdrawal ${id} for broadcast?`)) return;
    try {
      await post(`/v1/admin/withdrawals/${id}/approve`);
      setNotice(`Withdrawal ${id} approved successfully!`);
      setTimeout(() => setNotice(null), 3500);
      loadWithdrawals();
    } catch (e) {
      alert("Failed to approve withdrawal");
    }
  }

  async function handleReject(id: string) {
    if (!window.confirm(`Reject withdrawal ${id}?`)) return;
    try {
      await post(`/v1/admin/withdrawals/${id}/reject`);
      setNotice(`Withdrawal ${id} rejected.`);
      setTimeout(() => setNotice(null), 3500);
      loadWithdrawals();
    } catch (e) {
      alert("Failed to reject withdrawal");
    }
  }

  const pendingAmountFormatted = (Number(stats.pending_amount_minor || 0) / 1e6).toFixed(2);
  const settledAmountFormatted = (Number(stats.settled_24h_minor || 0) / 1e6).toFixed(2);

  return (
    <AdminPageLayout
      title="USDT Withdrawals & Treasury Payout Terminal"
      subtitle="Multi-signature approval, destination validation, and anti-fraud automated checks before broadcast."
      breadcrumb={["Home", "Admin", "Withdrawals"]}
      stats={[
        { label: "Pending Payouts", value: `${stats.pending_count} Requests`, trend: `$${pendingAmountFormatted} USDT` },
        { label: "24h Settled Outflow", value: `$${settledAmountFormatted}`, trend: "USDT" },
        { label: "Settled 24h Count", value: `${stats.settled_24h_count}`, trend: "Completed" },
        { label: "Rejected / Suspicious", value: `${stats.rejected_count}`, trend: "Flagged" },
      ]}
      actions={
        <div style={{ display: "flex", gap: "8px" }}>
          {["ALL", "REQUESTED", "PENDING_REVIEW", "APPROVED", "COMPLETED", "REJECTED"].map((st) => (
            <button
              key={st}
              type="button"
              className={`${styles.actionBtn} ${statusFilter === st ? styles.actionBtnPrimary : ""}`}
              onClick={() => setStatusFilter(st)}
            >
              {st}
            </button>
          ))}
        </div>
      }
    >
      {notice && (
        <div style={{ padding: "10px 16px", background: "rgba(34, 197, 94, 0.1)", border: "1px solid #22c55e", borderRadius: "8px", marginBottom: "16px", color: "#22c55e", fontSize: "13px" }}>
          ✓ {notice}
        </div>
      )}

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <input
            type="search"
            placeholder="Search by player handle, destination address, txHash, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>
            Withdrawal Payout Queue ({withdrawals.length}) {loading ? "— Loading..." : ""}
          </h2>
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
                <th>Status</th>
                <th>Time</th>
                <th className={styles.alignRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.emptyState}>
                    {loading ? "Loading withdrawals..." : "No withdrawals found"}
                  </td>
                </tr>
              ) : (
                withdrawals.map((w) => {
                  const amount = w.amount_minor ? (Number(w.amount_minor) / 1e6).toFixed(2) : "0.00";
                  const canAct = ["REQUESTED", "PENDING_REVIEW", "ON_HOLD"].includes(w.status);
                  const isCompleted = w.status === "COMPLETED" || w.status === "CONFIRMED";
                  const isApproved = w.status === "APPROVED" || w.status === "PROCESSING" || w.status === "BROADCASTED";
                  const isRejected = w.status === "REJECTED" || w.status === "FAILED" || w.status === "CANCELLED";

                  return (
                    <tr key={w.id}>
                      <td><code>{w.id.slice(0, 12)}...</code></td>
                      <td><strong>{w.player_handle}</strong></td>
                      <td>
                        <code style={{ color: "#e2e8f0" }}>
                          {w.destination ? `${w.destination.slice(0, 8)}...${w.destination.slice(-6)}` : "—"}
                        </code>
                      </td>
                      <td>
                        <span className={`${styles.badge} ${styles.badgeNeutral}`}>{w.network || "TRC20"}</span>
                      </td>
                      <td className="nz-num" style={{ fontWeight: 700 }}>
                        ${amount}
                      </td>
                      <td>
                        <span
                          className={`${styles.badge} ${
                            isCompleted
                              ? styles.badgeSuccess
                              : isApproved
                              ? styles.badgeWarning
                              : isRejected
                              ? styles.badgeDanger
                              : styles.badgeNeutral
                          }`}
                        >
                          {w.status}
                        </span>
                      </td>
                      <td className="nz-num">
                        {new Date(w.requested_at).toLocaleDateString()} {new Date(w.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className={styles.alignRight}>
                        {canAct ? (
                          <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                            <Button variant="primary" onClick={() => handleApprove(w.id)}>
                              Approve
                            </Button>
                            <Button variant="ghost" onClick={() => handleReject(w.id)}>
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span style={{ fontSize: "11px", color: "var(--nz-text-3)" }}>
                            {w.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminPageLayout>
  );
}
