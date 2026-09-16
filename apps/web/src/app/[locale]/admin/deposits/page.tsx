"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { get } from "@/lib/api";
import styles from "@/components/admin/AdminPageLayout.module.css";

type DepositItem = {
  id: string;
  player_id: string;
  player_handle: string;
  asset: string;
  network: string;
  provider: string;
  provider_ref: string;
  address: string;
  status: string;
  observed_tx_hash: string | null;
  observed_amount_minor: string | null;
  confirmations: number | null;
  created_at: string;
  credited_at: string | null;
};

type DepositStats = {
  total_count: number;
  confirmed_count: number;
  pending_count: number;
  inflow_24h_minor: string;
};

export default function AdminDepositsPage() {
  const [deposits, setDeposits] = useState<DepositItem[]>([]);
  const [stats, setStats] = useState<DepositStats>({
    total_count: 0,
    confirmed_count: 0,
    pending_count: 0,
    inflow_24h_minor: "0",
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);

  const loadDeposits = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);

      const res = await get<{ deposits: DepositItem[]; stats: DepositStats }>(
        `/v1/admin/deposits?${params.toString()}`
      );
      if (res.deposits) setDeposits(res.deposits);
      if (res.stats) setStats(res.stats);
    } catch (e) {
      console.error("Failed to load deposits:", e);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadDeposits();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadDeposits]);

  const inflowFormatted = (Number(stats.inflow_24h_minor || 0) / 1e6).toFixed(2);

  return (
    <AdminPageLayout
      title="Deposits & Blockchain Ingestion"
      subtitle="Monitor incoming USDT deposits across TRC20, ERC20, and BEP20 with automated confirmation depth."
      breadcrumb={["Home", "Admin", "Deposits"]}
      stats={[
        { label: "24h Inflow", value: `$${inflowFormatted}`, trend: "USDT" },
        { label: "Confirmed Deposits", value: `${stats.confirmed_count}`, trend: "100% On-chain" },
        { label: "Pending Blocks", value: `${stats.pending_count}`, trend: "Awaiting depth" },
        { label: "Total Recorded", value: `${stats.total_count}`, trend: "All time" },
      ]}
      actions={
        <div style={{ display: "flex", gap: "8px" }}>
          {["ALL", "CREDITED", "CONFIRMING", "DETECTED", "EXPIRED"].map((st) => (
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
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <input
            type="search"
            placeholder="Search by player handle, txHash, address, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>
            USDT Deposit Ingestion Ledger ({deposits.length}) {loading ? "— Loading..." : ""}
          </h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Internal ID</th>
                <th>Blockchain TxHash</th>
                <th>Player</th>
                <th>Network</th>
                <th>Amount</th>
                <th>Confirmations</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {deposits.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.emptyState}>
                    {loading ? "Loading deposits..." : "No deposits found"}
                  </td>
                </tr>
              ) : (
                deposits.map((d) => {
                  const amount = d.observed_amount_minor
                    ? (Number(d.observed_amount_minor) / 1e6).toFixed(2)
                    : "0.00";
                  const isConfirmed = d.status === "CREDITED" || d.status === "VERIFIED";
                  const isPending = d.status === "INITIATED" || d.status === "CONFIRMING" || d.status === "DETECTED";

                  return (
                    <tr key={d.id}>
                      <td><code>{d.id.slice(0, 12)}...</code></td>
                      <td>
                        {d.observed_tx_hash ? (
                          <code style={{ color: "#38bdf8" }}>
                            {d.observed_tx_hash.slice(0, 8)}...{d.observed_tx_hash.slice(-6)}
                          </code>
                        ) : (
                          <span style={{ color: "var(--nz-text-3)" }}>Awaiting Tx</span>
                        )}
                      </td>
                      <td><strong>{d.player_handle}</strong></td>
                      <td>
                        <span className={`${styles.badge} ${styles.badgeNeutral}`}>{d.network || "TRC20"}</span>
                      </td>
                      <td className="nz-num" style={{ color: "#22c55e", fontWeight: 700 }}>
                        +${amount} {d.asset || "USDT"}
                      </td>
                      <td className="nz-num">{d.confirmations ?? 0}</td>
                      <td>
                        <span
                          className={`${styles.badge} ${
                            isConfirmed
                              ? styles.badgeSuccess
                              : isPending
                              ? styles.badgeWarning
                              : styles.badgeDanger
                          }`}
                        >
                          {d.status}
                        </span>
                      </td>
                      <td className="nz-num">
                        {new Date(d.created_at).toLocaleDateString()} {new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
