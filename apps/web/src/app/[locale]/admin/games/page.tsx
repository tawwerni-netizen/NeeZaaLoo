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
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  function toggleGameStatus(id: string) {
    setGames((prev) =>
      prev.map((g) => {
        if (g.id === id) {
          const newStatus = g.status === "ONLINE" ? "MAINTENANCE" : "ONLINE";
          setNotice(`${g.name} status updated to ${newStatus}`);
          setTimeout(() => setNotice(null), 3000);
          return { ...g, status: newStatus };
        }
        return g;
      })
    );
  }

  function toggleCash(id: string) {
    setGames((prev) =>
      prev.map((g) => {
        if (g.id === id) {
          const newCash = !g.cashEnabled;
          setNotice(`${g.name} cash staking ${newCash ? "enabled" : "disabled"}`);
          setTimeout(() => setNotice(null), 3000);
          return { ...g, cashEnabled: newCash };
        }
        return g;
      })
    );
  }

  const filtered = games.filter(
    (g) =>
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      g.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminPageLayout
      title="Game Catalog & Rules Engine"
      subtitle="Configure table limits, stake models, AI matchmaking, and game maintenance."
      breadcrumb={["Home", "Admin", "Games"]}
      stats={[
        { label: "Active Games", value: `${games.filter(g => g.status === "ONLINE").length} / ${games.length}`, trend: "Operational" },
        { label: "Cash-Eligible Games", value: `${games.filter(g => g.cashEnabled).length}`, trend: "Real Prizes" },
        { label: "Total Live Duels", value: "280", trend: "Real-time" },
        { label: "AI Engine Status", value: "HEALTHY", trend: "Latency < 45ms" },
      ]}
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
            placeholder="Search games by name or ID (chess, xo, etc.)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Official 10 Game Plugins ({filtered.length})</h2>
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
              {filtered.map((g) => (
                <tr key={g.id}>
                  <td>
                    <strong>{g.name}</strong>
                    <div style={{ fontSize: "11px", color: "var(--nz-text-3)" }}>{g.id}</div>
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
                    <span
                      className={`${styles.badge} ${g.status === "ONLINE" ? styles.badgeSuccess : styles.badgeDanger}`}
                    >
                      {g.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => toggleGameStatus(g.id)}
                      >
                        {g.status === "ONLINE" ? "Pause" : "Activate"}
                      </button>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => toggleCash(g.id)}
                      >
                        {g.cashEnabled ? "Disable USDT" : "Enable USDT"}
                      </button>
                    </div>
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
