"use client";

import React, { useState } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import styles from "@/components/admin/AdminPageLayout.module.css";

export default function AdminArenaPage() {
  const [rooms] = useState([
    { id: "room_ws_01", game: "Chess", players: "Grandmaster77 vs KnightRider", spectators: 28, moveLatency: "24ms", status: "HEALTHY" },
    { id: "room_ws_02", game: "Dominoes", players: "DominoKingAlex vs SultanOfTiles", spectators: 14, moveLatency: "31ms", status: "HEALTHY" },
    { id: "room_ws_03", game: "Backgammon", players: "TawlaMaster99 vs DiceRoller01", spectators: 42, moveLatency: "19ms", status: "HEALTHY" },
    { id: "room_ws_04", game: "Speed Math", players: "SpeedDemonMath vs QuickBrain", spectators: 9, moveLatency: "15ms", status: "HEALTHY" },
  ]);

  return (
    <AdminPageLayout
      title="Live Arena & WebSocket Monitor"
      subtitle="Real-time telemetry for active duel rooms, spectator streams, and network latency."
      breadcrumb={["Home", "Admin", "Live Arena"]}
      stats={[
        { label: "Active Live Rooms", value: "48", trend: "All green" },
        { label: "Connected Spectators", value: "384", trend: "+24% peak" },
        { label: "Median Move Latency", value: "22ms", trend: "< 50ms SLA" },
        { label: "WS Packet Loss", value: "0.001%", trend: "Optimal" },
      ]}
    >
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Real-Time Duel Room Streams ({rooms.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Room ID</th>
                <th>Game</th>
                <th>Active Contestants</th>
                <th>Spectators</th>
                <th>Move Latency</th>
                <th>Health Status</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id}>
                  <td><code style={{ color: "#38bdf8" }}>{r.id}</code></td>
                  <td><strong>{r.game}</strong></td>
                  <td>{r.players}</td>
                  <td className="nz-num">👁️ {r.spectators}</td>
                  <td className="nz-num">{r.moveLatency}</td>
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
