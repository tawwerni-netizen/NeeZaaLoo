"use client";

import React, { useState } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import styles from "@/components/admin/AdminPageLayout.module.css";

type PlayerRow = {
  id: string;
  handle: string;
  rating: number;
  balanceUsdt: string;
  matchesPlayed: number;
  winRate: string;
  status: "ACTIVE" | "SUSPENDED" | "FLAGGED";
  joinedAt: string;
};

const INITIAL_PLAYERS: PlayerRow[] = [
  { id: "ply_01", handle: "Grandmaster77", rating: 1980, balanceUsdt: "420.50", matchesPlayed: 142, winRate: "68%", status: "ACTIVE", joinedAt: "2026-08-10" },
  { id: "ply_02", handle: "CheckersChamp", rating: 1720, balanceUsdt: "115.00", matchesPlayed: 98, winRate: "61%", status: "ACTIVE", joinedAt: "2026-08-14" },
  { id: "ply_03", handle: "SpeedDemonMath", rating: 1650, balanceUsdt: "85.20", matchesPlayed: 64, winRate: "59%", status: "ACTIVE", joinedAt: "2026-08-20" },
  { id: "ply_04", handle: "DominoKingAlex", rating: 1840, balanceUsdt: "350.00", matchesPlayed: 120, winRate: "64%", status: "ACTIVE", joinedAt: "2026-08-25" },
  { id: "ply_05", handle: "SuspiciousBot9", rating: 1420, balanceUsdt: "12.00", matchesPlayed: 18, winRate: "33%", status: "FLAGGED", joinedAt: "2026-09-02" },
  { id: "ply_06", handle: "TawlaMaster99", rating: 1790, balanceUsdt: "210.80", matchesPlayed: 88, winRate: "62%", status: "ACTIVE", joinedAt: "2026-09-05" },
];

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState<PlayerRow[]>(INITIAL_PLAYERS);
  const [search, setSearch] = useState("");
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const filtered = players.filter(
    (p) => p.handle.toLowerCase().includes(search.toLowerCase()) || p.id.includes(search)
  );

  function toggleStatus(id: string) {
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const newStatus = p.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
        setActionNotice(`Player ${p.handle} is now ${newStatus}.`);
        setTimeout(() => setActionNotice(null), 3000);
        return { ...p, status: newStatus };
      })
    );
  }

  return (
    <AdminPageLayout
      title="Players Management"
      subtitle="Inspect player identities, active balances, ratings, and account status."
      breadcrumb={["Home", "Admin", "Players"]}
      stats={[
        { label: "Total Registered", value: "24,850", trend: "+12% this week" },
        { label: "Active Today", value: "3,410", trend: "Normal volume" },
        { label: "High Rollers (>500 USDT)", value: "184" },
        { label: "Flagged Accounts", value: "9", trend: "Requires review" },
      ]}
      actions={
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="search"
            placeholder="Search handle or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: "#161922",
              border: "1px solid #252b37",
              color: "#fff",
              padding: "7px 12px",
              borderRadius: "6px",
              fontSize: "13px",
            }}
          />
        </div>
      }
    >
      {actionNotice && (
        <div style={{ padding: "10px 16px", background: "rgba(34, 197, 94, 0.1)", border: "1px solid #22c55e", borderRadius: "8px", marginBottom: "16px", color: "#22c55e", fontSize: "13px" }}>
          ✓ {actionNotice}
        </div>
      )}

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Registered Players Directory ({filtered.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Player Handle</th>
                <th>Global Rating</th>
                <th>Balance (USDT)</th>
                <th>Matches</th>
                <th>Win Rate</th>
                <th>Status</th>
                <th>Joined Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.handle}</strong>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>{p.id}</div>
                  </td>
                  <td className="nz-num">{p.rating}</td>
                  <td className="nz-num">${p.balanceUsdt}</td>
                  <td className="nz-num">{p.matchesPlayed}</td>
                  <td className="nz-num">{p.winRate}</td>
                  <td>
                    <span
                      className={`${styles.badge} ${
                        p.status === "ACTIVE"
                          ? styles.badgeSuccess
                          : p.status === "SUSPENDED"
                          ? styles.badgeDanger
                          : styles.badgeWarning
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="nz-num">{p.joinedAt}</td>
                  <td>
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${p.status === "ACTIVE" ? styles.actionBtn : styles.actionBtnPrimary}`}
                      onClick={() => toggleStatus(p.id)}
                    >
                      {p.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                    </button>
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
