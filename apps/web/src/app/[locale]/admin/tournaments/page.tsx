"use client";

import React, { useState } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import styles from "@/components/admin/AdminPageLayout.module.css";

type TournamentRow = {
  id: string;
  title: string;
  game: string;
  format: "SINGLE_ELIMINATION" | "SWISS";
  entryFee: string;
  prizePool: string;
  participants: string;
  status: "REGISTRATION" | "LIVE" | "COMPLETED" | "SETTLED";
  startsAt: string;
};

const INITIAL_TOURNAMENTS: TournamentRow[] = [
  { id: "tour_ch_001", title: "Global Speed Chess Masters", game: "Chess", format: "SINGLE_ELIMINATION", entryFee: "10.00 USDT", prizePool: "250.00 USDT", participants: "28 / 32", status: "REGISTRATION", startsAt: "Today, 18:00 UTC" },
  { id: "tour_dm_002", title: "Weekly Dominoes Championship", game: "Dominoes", format: "SINGLE_ELIMINATION", entryFee: "5.00 USDT", prizePool: "150.00 USDT", participants: "16 / 16", status: "LIVE", startsAt: "Live Now (Round 2)" },
  { id: "tour_bg_003", title: "Backgammon Grand Prix", game: "Backgammon", format: "SWISS", entryFee: "20.00 USDT", prizePool: "600.00 USDT", participants: "32 / 32", status: "COMPLETED", startsAt: "Yesterday" },
  { id: "tour_sm_004", title: "Speed Math Blitz Sprint", game: "Speed Math", format: "SINGLE_ELIMINATION", entryFee: "FREE", prizePool: "50.00 USDT", participants: "64 / 64", status: "SETTLED", startsAt: "2 days ago" },
];

export default function AdminTournamentsPage() {
  const [tournaments, setTournaments] = useState<TournamentRow[]>(INITIAL_TOURNAMENTS);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newGame, setNewGame] = useState("Chess");
  const [newFee, setNewFee] = useState("10.00");

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const newT: TournamentRow = {
      id: `tour_${Date.now()}`,
      title: newTitle.trim(),
      game: newGame,
      format: "SINGLE_ELIMINATION",
      entryFee: `${newFee} USDT`,
      prizePool: `${parseFloat(newFee || "0") * 16 * 0.9} USDT`,
      participants: "0 / 16",
      status: "REGISTRATION",
      startsAt: "Tomorrow, 20:00 UTC",
    };
    setTournaments([newT, ...tournaments]);
    setNewTitle("");
    setShowCreate(false);
  }

  return (
    <AdminPageLayout
      title="Tournaments & Brackets Control"
      subtitle="Create brackets, monitor Swiss & Single Elimination rounds, and verify prize payouts."
      breadcrumb={["Home", "Admin", "Tournaments"]}
      stats={[
        { label: "Active Brackets", value: "3", trend: "1 in Finals" },
        { label: "Total Prize Pool", value: "$1,050.00", trend: "USDT Locked" },
        { label: "Registrations Today", value: "142 Players" },
        { label: "Completion Rate", value: "99.4%" },
      ]}
      actions={
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate ? "Cancel" : "+ Create Tournament"}
        </button>
      }
    >
      {showCreate && (
        <form onSubmit={handleCreate} style={{ background: "#161922", padding: "20px", borderRadius: "12px", border: "1px solid #252b37", marginBottom: "20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", alignItems: "end" }}>
          <div>
            <label style={{ fontSize: "12px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Tournament Title</label>
            <input
              type="text"
              required
              placeholder="e.g. Blitz Chess Cup"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              style={{ width: "100%", background: "#0e1015", border: "1px solid #252b37", color: "#fff", padding: "8px", borderRadius: "6px" }}
            />
          </div>
          <div>
            <label style={{ fontSize: "12px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Select Game</label>
            <select
              value={newGame}
              onChange={(e) => setNewGame(e.target.value)}
              style={{ width: "100%", background: "#0e1015", border: "1px solid #252b37", color: "#fff", padding: "8px", borderRadius: "6px" }}
            >
              <option>Chess</option>
              <option>Dominoes</option>
              <option>Backgammon</option>
              <option>Checkers</option>
              <option>Speed Math</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: "12px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Entry Fee (USDT)</label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={newFee}
              onChange={(e) => setNewFee(e.target.value)}
              style={{ width: "100%", background: "#0e1015", border: "1px solid #252b37", color: "#fff", padding: "8px", borderRadius: "6px" }}
            />
          </div>
          <button type="submit" className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} style={{ height: "38px" }}>
            Publish Tournament
          </button>
        </form>
      )}

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>All Tournament Brackets ({tournaments.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Tournament ID & Title</th>
                <th>Game</th>
                <th>Bracket Format</th>
                <th>Entry Fee</th>
                <th>Prize Pool</th>
                <th>Participants</th>
                <th>Status</th>
                <th>Schedule</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.title}</strong>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>{t.id}</div>
                  </td>
                  <td>{t.game}</td>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeNeutral}`}>{t.format}</span>
                  </td>
                  <td className="nz-num">{t.entryFee}</td>
                  <td className="nz-num" style={{ color: "#f59e0b", fontWeight: 700 }}>${t.prizePool}</td>
                  <td className="nz-num">{t.participants}</td>
                  <td>
                    <span
                      className={`${styles.badge} ${
                        t.status === "LIVE"
                          ? styles.badgeSuccess
                          : t.status === "REGISTRATION"
                          ? styles.badgeWarning
                          : styles.badgeNeutral
                      }`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="nz-num">{t.startsAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminPageLayout>
  );
}
