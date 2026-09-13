"use client";

import React, { useState } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import styles from "@/components/admin/AdminPageLayout.module.css";

type GameConfig = {
  id: string;
  name: string;
  turnModel: string;
  aiSupported: boolean;
  cashEnabled: boolean;
  minStake: string;
  maxStake: string;
  activeDuels: number;
  status: "ONLINE" | "MAINTENANCE";
};

const INITIAL_GAMES: GameConfig[] = [
  { id: "chess", name: "Speed Chess", turnModel: "ALTERNATING", aiSupported: true, cashEnabled: true, minStake: "1.00", maxStake: "500.00", activeDuels: 42, status: "ONLINE" },
  { id: "checkers", name: "Classic Checkers", turnModel: "ALTERNATING", aiSupported: true, cashEnabled: true, minStake: "1.00", maxStake: "300.00", activeDuels: 28, status: "ONLINE" },
  { id: "connect-four", name: "Connect Four", turnModel: "ALTERNATING", aiSupported: true, cashEnabled: false, minStake: "FREE", maxStake: "FREE", activeDuels: 19, status: "ONLINE" },
  { id: "xo", name: "Tic-Tac-Toe (XO)", turnModel: "ALTERNATING", aiSupported: true, cashEnabled: false, minStake: "FREE", maxStake: "FREE", activeDuels: 14, status: "ONLINE" },
  { id: "speed-math", name: "Speed Math", turnModel: "SIMULTANEOUS", aiSupported: true, cashEnabled: true, minStake: "1.00", maxStake: "200.00", activeDuels: 35, status: "ONLINE" },
  { id: "dominoes", name: "Dominoes", turnModel: "ALTERNATING", aiSupported: true, cashEnabled: true, minStake: "2.00", maxStake: "400.00", activeDuels: 51, status: "ONLINE" },
  { id: "backgammon", name: "Backgammon (Tawla)", turnModel: "ALTERNATING", aiSupported: true, cashEnabled: true, minStake: "2.00", maxStake: "500.00", activeDuels: 39, status: "ONLINE" },
  { id: "seega", name: "Seega (Tactical)", turnModel: "ALTERNATING", aiSupported: true, cashEnabled: true, minStake: "1.00", maxStake: "150.00", activeDuels: 12, status: "ONLINE" },
  { id: "reversi", name: "Reversi (Othello)", turnModel: "ALTERNATING", aiSupported: true, cashEnabled: true, minStake: "1.00", maxStake: "250.00", activeDuels: 22, status: "ONLINE" },
  { id: "gomoku", name: "Gomoku (Five in Row)", turnModel: "ALTERNATING", aiSupported: true, cashEnabled: true, minStake: "1.00", maxStake: "250.00", activeDuels: 18, status: "ONLINE" },
];

export default function AdminGamesPage() {
  const [games, setGames] = useState<GameConfig[]>(INITIAL_GAMES);

  function toggleGameStatus(id: string) {
    setGames((prev) =>
      prev.map((g) => (g.id === id ? { ...g, status: g.status === "ONLINE" ? "MAINTENANCE" : "ONLINE" } : g))
    );
  }

  function toggleCash(id: string) {
    setGames((prev) =>
      prev.map((g) => (g.id === id ? { ...g, cashEnabled: !g.cashEnabled } : g))
    );
  }

  return (
    <AdminPageLayout
      title="Game Catalog & Rules Engine"
      subtitle="Configure table limits, stake models, AI matchmaking, and game maintenance."
      breadcrumb={["Home", "Admin", "Games"]}
      stats={[
        { label: "Active Games", value: "10 / 10", trend: "100% Operational" },
        { label: "Cash-Eligible Games", value: "8", trend: "2 Free Solved Games" },
        { label: "Total Live Duels", value: "280", trend: "Real-time" },
        { label: "AI Engine Status", value: "HEALTHY", trend: "Latency < 45ms" },
      ]}
    >
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Official 10 Game Plugins</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Game Name</th>
                <th>Turn Model</th>
                <th>AI Opponents</th>
                <th>USDT Staking</th>
                <th>Min / Max Stake</th>
                <th>Active Duels</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.id}>
                  <td>
                    <strong>{g.name}</strong>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>{g.id}</div>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeNeutral}`}>{g.turnModel}</span>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${g.aiSupported ? styles.badgeSuccess : styles.badgeNeutral}`}>
                      {g.aiSupported ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${g.cashEnabled ? styles.badgeSuccess : styles.badgeWarning}`}>
                      {g.cashEnabled ? "USDT Enabled" : "Free Only"}
                    </span>
                  </td>
                  <td className="nz-num">
                    {g.cashEnabled ? `$${g.minStake} - $${g.maxStake}` : "Free"}
                  </td>
                  <td className="nz-num">{g.activeDuels}</td>
                  <td>
                    <span className={`${styles.badge} ${g.status === "ONLINE" ? styles.badgeSuccess : styles.badgeDanger}`}>
                      {g.status}
                    </span>
                  </td>
                  <td style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => toggleCash(g.id)}
                    >
                      {g.cashEnabled ? "Disable Cash" : "Enable Cash"}
                    </button>
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${g.status === "ONLINE" ? styles.actionBtn : styles.actionBtnPrimary}`}
                      onClick={() => toggleGameStatus(g.id)}
                    >
                      {g.status === "ONLINE" ? "Pause" : "Resume"}
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
