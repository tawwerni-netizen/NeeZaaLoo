"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { get } from "@/lib/api";
import styles from "@/components/admin/AdminPageLayout.module.css";

type LiveDuel = {
  id: string;
  game_id: string;
  tier: string;
  stake_minor: string;
  asset: string | null;
  status: string;
  seat_0: string;
  seat_1: string;
  created_at: string;
  moves_count: number;
};

type ArenaStats = {
  live_matches: number;
  active_players: number;
  matches_24h: number;
  rake_24h: string;
};

export default function AdminArenaPage() {
  const [duels, setDuels] = useState<LiveDuel[]>([]);
  const [stats, setStats] = useState<ArenaStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchArena = useCallback(async () => {
    try {
      const res = await get<{ ok: boolean; duels: LiveDuel[]; stats: ArenaStats }>("/v1/admin/arena");
      if (res && res.duels) {
        setDuels(res.duels);
        setStats(res.stats);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchArena();
    const interval = setInterval(fetchArena, 10000);
    return () => clearInterval(interval);
  }, [fetchArena]);

  const rakeUsd = stats?.rake_24h ? (Number(stats.rake_24h) / 1e6).toFixed(2) : "0.00";

  return (
    <AdminPageLayout
      title="Live Arena & WebSocket Monitor"
      subtitle="Real-time telemetry for active duel rooms, spectator streams, and network latency."
      breadcrumb={["Home", "Admin", "Live Arena"]}
      stats={[
        { label: "Active Live Rooms", value: String(stats?.live_matches ?? duels.length), trend: "Real-time" },
        { label: "Active Contestants", value: String(stats?.active_players ?? duels.length * 2), trend: "In Duels" },
        { label: "Matches (24h)", value: String(stats?.matches_24h ?? 0), trend: "Completed" },
        { label: "24h Fee Revenue", value: `$${rakeUsd} USDT`, trend: "10% Platform Fee (default)" },
      ]}
    >
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Active Duel Rooms ({duels.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Room ID</th>
                <th>Game</th>
                <th>Seat 0</th>
                <th>Seat 1</th>
                <th>Tier & Stake</th>
                <th>Moves</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && duels.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                    Loading active duel rooms...
                  </td>
                </tr>
              ) : duels.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                    No live duel rooms currently running. Matchmaker queue is standing by.
                  </td>
                </tr>
              ) : (
                duels.map((r) => {
                  const stakeUsd = Number(r.stake_minor || "0") / 1e6;
                  return (
                    <tr key={r.id}>
                      <td><code style={{ color: "#38bdf8" }}>{r.id}</code></td>
                      <td style={{ textTransform: "capitalize" }}><strong>{r.game_id}</strong></td>
                      <td>{r.seat_0}</td>
                      <td>{r.seat_1}</td>
                      <td className="nz-num">
                        {stakeUsd > 0 ? `$${stakeUsd.toFixed(2)} USDT` : "FREE"}
                      </td>
                      <td className="nz-num">{r.moves_count ?? 0} moves</td>
                      <td>
                        <span className={`${styles.badge} ${styles.badgeSuccess}`}>{r.status}</span>
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
