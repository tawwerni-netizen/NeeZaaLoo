"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { get, post, ApiError } from "@/lib/api";
import styles from "@/components/admin/AdminPageLayout.module.css";

type TournamentApiRow = {
  id: string;
  title: string;
  game_id: string;
  format: "SINGLE_ELIMINATION" | "SWISS";
  tier: "FREE" | "CASH";
  status: "CREATED" | "REGISTRATION" | "LIVE" | "FINALS" | "COMPLETED" | "SETTLED" | "CANCELLED";
  capacity: number;
  entry_fee_minor: string;
  asset: string | null;
  registered_count: number;
  created_at: string;
  starts_at: string | null;
};

type TournamentStats = {
  active_brackets: number;
  total_tournaments: number;
  total_prize_pool_minor: string;
  total_players: number;
};

export default function AdminTournamentsPage() {
  const [tournaments, setTournaments] = useState<TournamentApiRow[]>([]);
  const [stats, setStats] = useState<TournamentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newGame, setNewGame] = useState("chess");
  const [newFee, setNewFee] = useState("10.00");
  const [submitting, setSubmitting] = useState(false);

  const fetchTournaments = useCallback(async () => {
    try {
      const q = encodeURIComponent(search);
      const s = encodeURIComponent(statusFilter);
      const res = await get<{ ok: boolean; tournaments: TournamentApiRow[]; stats: TournamentStats }>(
        `/v1/admin/tournaments?q=${q}&status=${s}`
      );
      if (res.ok) {
        setTournaments(res.tournaments);
        setStats(res.stats);
      }
    } catch {
      // Keep existing data on error
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    void fetchTournaments();
  }, [fetchTournaments]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || submitting) return;
    setSubmitting(true);
    try {
      await post("/v1/admin/tournaments", {
        gameId: newGame.toLowerCase(),
        title: newTitle.trim(),
        entryFeeUsd: newFee,
        capacity: 16,
        format: "SINGLE_ELIMINATION",
        autoOpen: true,
      });
      setNewTitle("");
      setShowCreate(false);
      await fetchTournaments();
    } catch (err) {
      alert(err instanceof ApiError ? `Error: ${err.message}` : "Failed to create tournament");
    } finally {
      setSubmitting(false);
    }
  }

  const totalPrizeUsd = stats?.total_prize_pool_minor
    ? (Number(stats.total_prize_pool_minor) / 1_000_000).toFixed(2)
    : tournaments.reduce((acc, t) => acc + (Number(t.entry_fee_minor || "0") / 1_000_000) * t.capacity * 0.88, 0).toFixed(2);

  return (
    <AdminPageLayout
      title="Tournaments & Brackets Control"
      subtitle="Automated 16-player continuous brackets, Swiss rounds, and transparent 88% prize pool settlements."
      breadcrumb={["Home", "Admin", "Tournaments"]}
      stats={[
        { label: "Active Brackets", value: String(stats?.active_brackets ?? tournaments.filter(t => t.status === "REGISTRATION" || t.status === "LIVE").length), trend: "Live & Open" },
        { label: "Total Prize Pool", value: `$${totalPrizeUsd} USDT`, trend: "88% Winner Pool" },
        { label: "Total Participants", value: `${stats?.total_players ?? tournaments.reduce((acc, t) => acc + (t.registered_count || 0), 0)} Players` },
        { label: "Total Tournaments", value: String(stats?.total_tournaments ?? tournaments.length), trend: "Continuous Rotation" },
      ]}
      actions={
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            onClick={() => setShowCreate(!showCreate)}
          >
            {showCreate ? "Cancel" : "+ Create Tournament"}
          </button>
        </div>
      }
    >
      {showCreate && (
        <form onSubmit={handleCreate} style={{ background: "#161922", padding: "20px", borderRadius: "12px", border: "1px solid #252b37", marginBottom: "20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", alignItems: "end" }}>
          <div>
            <label style={{ fontSize: "12px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Tournament Title</label>
            <input
              type="text"
              required
              placeholder="e.g. Weekly Masters"
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
              <option value="chess">Chess</option>
              <option value="dominoes">Dominoes</option>
              <option value="backgammon">Backgammon</option>
              <option value="checkers">Checkers</option>
              <option value="speed-math">Speed Math</option>
              <option value="connect-four">Connect Four</option>
              <option value="xo">Tic-Tac-Toe (XO)</option>
              <option value="reversi">Reversi</option>
              <option value="seega">Seega</option>
              <option value="gomoku">Gomoku</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: "12px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Entry Fee (USDT)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={newFee}
              onChange={(e) => setNewFee(e.target.value)}
              style={{ width: "100%", background: "#0e1015", border: "1px solid #252b37", color: "#fff", padding: "8px", borderRadius: "6px" }}
            />
          </div>
          <button type="submit" disabled={submitting} className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} style={{ height: "38px" }}>
            {submitting ? "Publishing..." : "Publish Tournament"}
          </button>
        </form>
      )}

      <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Search by title, game, or tournament ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: "1", minWidth: "240px", background: "#161922", border: "1px solid #252b37", color: "#fff", padding: "10px 14px", borderRadius: "8px", fontSize: "14px" }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ background: "#161922", border: "1px solid #252b37", color: "#fff", padding: "10px 14px", borderRadius: "8px", fontSize: "14px" }}
        >
          <option value="">All Statuses</option>
          <option value="REGISTRATION">Registration Open</option>
          <option value="LIVE">Live / In Progress</option>
          <option value="FINALS">Finals</option>
          <option value="COMPLETED">Completed</option>
          <option value="SETTLED">Settled</option>
        </select>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>All Tournament Brackets ({tournaments.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Tournament ID &amp; Title</th>
                <th>Game</th>
                <th>Bracket Format</th>
                <th>Entry Fee</th>
                <th>Prize Pool (88%)</th>
                <th>Participants</th>
                <th>Status</th>
                <th>Schedule</th>
              </tr>
            </thead>
            <tbody>
              {loading && tournaments.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                    Loading tournament brackets...
                  </td>
                </tr>
              ) : tournaments.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                    No tournaments found matching your filters.
                  </td>
                </tr>
              ) : (
                tournaments.map((t) => {
                  const entryUsd = Number(t.entry_fee_minor || "0") / 1_000_000;
                  const prizeUsd = (entryUsd * t.capacity * 0.88).toFixed(2);
                  return (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.title}</strong>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>{t.id}</div>
                      </td>
                      <td style={{ textTransform: "capitalize" }}>{t.game_id}</td>
                      <td>
                        <span className={`${styles.badge} ${styles.badgeNeutral}`}>
                          {t.format.replace("_", " ")}
                        </span>
                      </td>
                      <td className="nz-num">
                        {entryUsd > 0 ? `${entryUsd.toFixed(2)} USDT` : "FREE"}
                      </td>
                      <td className="nz-num" style={{ color: "#10b981", fontWeight: 700 }}>
                        ${prizeUsd} USDT
                      </td>
                      <td className="nz-num">
                        {t.registered_count ?? 0} / {t.capacity}
                      </td>
                      <td>
                        <span
                          className={`${styles.badge} ${
                            t.status === "LIVE" || t.status === "FINALS"
                              ? styles.badgeSuccess
                              : t.status === "REGISTRATION"
                              ? styles.badgeWarning
                              : styles.badgeNeutral
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="nz-num" style={{ fontSize: "12px", color: "#94a3b8" }}>
                        {t.starts_at ? new Date(t.starts_at).toLocaleDateString() : "Automated (On Full)"}
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
