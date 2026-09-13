"use client";

import React, { useState } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import styles from "@/components/admin/AdminPageLayout.module.css";

type MatchRow = {
  id: string;
  game: string;
  player1: string;
  player2: string;
  stakeUsdt: string;
  status: "LIVE" | "COMPLETED" | "DRAW" | "DISPUTED";
  duration: string;
  antiCheatScore: string;
  createdAt: string;
};

const INITIAL_MATCHES: MatchRow[] = [
  { id: "duel_ch_9912", game: "Chess", player1: "Grandmaster77", player2: "KnightRider", stakeUsdt: "25.00", status: "LIVE", duration: "03:42", antiCheatScore: "99.8% Clean", createdAt: "Just now" },
  { id: "duel_dm_4819", game: "Dominoes", player1: "DominoKingAlex", player2: "SultanOfTiles", stakeUsdt: "50.00", status: "COMPLETED", duration: "08:15", antiCheatScore: "100% Clean", createdAt: "12 mins ago" },
  { id: "duel_bg_1104", game: "Backgammon", player1: "TawlaMaster99", player2: "DiceRoller01", stakeUsdt: "100.00", status: "COMPLETED", duration: "14:20", antiCheatScore: "98.5% Clean", createdAt: "24 mins ago" },
  { id: "duel_sm_3021", game: "Speed Math", player1: "SpeedDemonMath", player2: "QuickBrain", stakeUsdt: "10.00", status: "COMPLETED", duration: "01:30", antiCheatScore: "100% Clean", createdAt: "35 mins ago" },
  { id: "duel_ck_8812", game: "Checkers", player1: "CheckersChamp", player2: "RedKing", stakeUsdt: "15.00", status: "DISPUTED", duration: "05:10", antiCheatScore: "Suspicious (88%)", createdAt: "45 mins ago" },
];

export default function AdminMatchesPage() {
  const [matches, setMatches] = useState<MatchRow[]>(INITIAL_MATCHES);
  const [filter, setFilter] = useState("ALL");

  const filtered = matches.filter((m) => filter === "ALL" || m.status === filter);

  return (
    <AdminPageLayout
      title="Matches & Duel Inspector"
      subtitle="Real-time inspection of live duel rooms, move logs, stakes, and settlement verification."
      breadcrumb={["Home", "Admin", "Matches"]}
      stats={[
        { label: "Matches Today", value: "1,248", trend: "+18% vs yesterday" },
        { label: "Active Live Duels", value: "48", trend: "Real-time" },
        { label: "24h Volume Staked", value: "$18,450", trend: "USDT" },
        { label: "Disputed Duels", value: "1", trend: "Review below" },
      ]}
      actions={
        <div style={{ display: "flex", gap: "8px" }}>
          {["ALL", "LIVE", "COMPLETED", "DISPUTED"].map((f) => (
            <button
              key={f}
              type="button"
              className={`${styles.actionBtn} ${filter === f ? styles.actionBtnPrimary : ""}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      }
    >
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Match Activity Ledger ({filtered.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Duel ID</th>
                <th>Game</th>
                <th>Seat 1 (White/Player 1)</th>
                <th>Seat 2 (Black/Player 2)</th>
                <th>Stake</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Fair Play Check</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td>
                    <code style={{ color: "#38bdf8" }}>{m.id}</code>
                  </td>
                  <td><strong>{m.game}</strong></td>
                  <td>{m.player1}</td>
                  <td>{m.player2}</td>
                  <td className="nz-num">${m.stakeUsdt}</td>
                  <td>
                    <span
                      className={`${styles.badge} ${
                        m.status === "LIVE"
                          ? styles.badgeSuccess
                          : m.status === "DISPUTED"
                          ? styles.badgeDanger
                          : styles.badgeNeutral
                      }`}
                    >
                      {m.status}
                    </span>
                  </td>
                  <td className="nz-num">{m.duration}</td>
                  <td>
                    <span style={{ color: m.antiCheatScore.includes("Suspicious") ? "#ef4444" : "#22c55e", fontWeight: 600 }}>
                      {m.antiCheatScore}
                    </span>
                  </td>
                  <td className="nz-num">{m.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminPageLayout>
  );
}
