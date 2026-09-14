"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { get } from "@/lib/api";
import styles from "@/components/admin/AdminPageLayout.module.css";

type MatchItem = {
  id: string;
  game_id: string;
  seat_0: string;
  seat_1: string;
  seat_0_handle: string;
  seat_1_handle: string;
  stake_minor: string;
  asset: string | null;
  status: string;
  result: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  is_vs_computer: boolean;
  fairplay_hold: boolean;
};

type MatchStats = {
  matches_today: number;
  live_duels: number;
  volume_24h_minor: string;
  disputed_count: number;
};

const GAMES = [
  { id: "ALL", name: "All Games" },
  { id: "chess", name: "Chess" },
  { id: "checkers", name: "Checkers" },
  { id: "connect-four", name: "Connect Four" },
  { id: "xo", name: "XO" },
  { id: "speed-math", name: "Speed Math" },
  { id: "dominoes", name: "Dominoes" },
  { id: "backgammon", name: "Backgammon" },
  { id: "seega", name: "Seega" },
  { id: "reversi", name: "Reversi" },
  { id: "gomoku", name: "Gomoku" },
];

export default function AdminMatchesPage() {
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [stats, setStats] = useState<MatchStats>({
    matches_today: 0,
    live_duels: 0,
    volume_24h_minor: "0",
    disputed_count: 0,
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [gameFilter, setGameFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);

  const loadMatches = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (gameFilter !== "ALL") params.set("gameId", gameFilter);

      const res = await get<{ matches: MatchItem[]; stats: MatchStats }>(
        `/v1/admin/matches?${params.toString()}`
      );
      if (res.matches) setMatches(res.matches);
      if (res.stats) setStats(res.stats);
    } catch (e) {
      console.error("Failed to load matches:", e);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, gameFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadMatches();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadMatches]);

  const volumeFormatted = (Number(stats.volume_24h_minor || 0) / 1e6).toFixed(2);

  return (
    <AdminPageLayout
      title="Matches & Duel Inspector"
      subtitle="Real-time inspection of live duel rooms, move logs, stakes, and settlement verification."
      breadcrumb={["Home", "Admin", "Matches"]}
      stats={[
        { label: "Matches Today", value: `${stats.matches_today}`, trend: "Created today" },
        { label: "Active Live Duels", value: `${stats.live_duels}`, trend: "Real-time" },
        { label: "24h Volume Staked", value: `$${volumeFormatted}`, trend: "USDT" },
        { label: "Disputed Duels", value: `${stats.disputed_count}`, trend: "Under review" },
      ]}
      actions={
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {["ALL", "LIVE", "COMPLETED", "READY", "VOIDED"].map((f) => (
            <button
              key={f}
              type="button"
              className={`${styles.actionBtn} ${statusFilter === f ? styles.actionBtnPrimary : ""}`}
              onClick={() => setStatusFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      }
    >
      <div className={styles.toolbar}>
        <div className={styles.searchBox} style={{ flex: 1 }}>
          <input
            type="search"
            placeholder="Search by duel ID, game ID, player 1 or player 2 handle..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          value={gameFilter}
          onChange={(e) => setGameFilter(e.target.value)}
          style={{
            padding: "8px 12px",
            background: "var(--nz-surface-1)",
            border: "1px solid rgba(242, 237, 227, 0.12)",
            borderRadius: "8px",
            color: "var(--nz-mat-ivory)",
            fontSize: "13px",
          }}
        >
          {GAMES.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>
            Match Activity Ledger ({matches.length}) {loading ? "— Loading..." : ""}
          </h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Duel ID</th>
                <th>Game</th>
                <th>Seat 1</th>
                <th>Seat 2</th>
                <th>Stake</th>
                <th>Status</th>
                <th>Result</th>
                <th>Type</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {matches.length === 0 ? (
                <tr>
                  <td colSpan={9} className={styles.emptyState}>
                    {loading ? "Loading matches..." : "No matches found"}
                  </td>
                </tr>
              ) : (
                matches.map((m) => {
                  const stake = m.stake_minor ? (Number(m.stake_minor) / 1e6).toFixed(2) : "0.00";
                  const isLive = m.status === "LIVE";
                  const isCompleted = m.status === "COMPLETED" || m.status === "SETTLED";
                  const isDisputed = m.status === "VOIDED" || m.fairplay_hold;

                  return (
                    <tr key={m.id}>
                      <td>
                        <code style={{ color: "#38bdf8" }}>{m.id.slice(0, 14)}...</code>
                      </td>
                      <td><strong>{m.game_id}</strong></td>
                      <td>{m.seat_0_handle}</td>
                      <td>{m.seat_1_handle}</td>
                      <td className="nz-num">
                        {Number(m.stake_minor) > 0 ? `$${stake}` : "Free"}
                      </td>
                      <td>
                        <span
                          className={`${styles.badge} ${
                            isLive
                              ? styles.badgeSuccess
                              : isDisputed
                              ? styles.badgeDanger
                              : isCompleted
                              ? styles.badgeNeutral
                              : styles.badgeWarning
                          }`}
                        >
                          {m.status}
                        </span>
                      </td>
                      <td>{m.result || "—"}</td>
                      <td>
                        <span className={`${styles.badge} ${styles.badgeNeutral}`}>
                          {m.is_vs_computer ? "AI Bot" : "PvP Human"}
                        </span>
                      </td>
                      <td className="nz-num">
                        {new Date(m.created_at).toLocaleDateString()} {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
