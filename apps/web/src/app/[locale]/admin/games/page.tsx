"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { get, post, ApiError } from "@/lib/api";
import styles from "@/components/admin/AdminPageLayout.module.css";

type GameApiRow = {
  id: string;
  display_name: string;
  is_live: boolean;
  cash_enabled: boolean;
  auto_tournaments_enabled: boolean;
  plugin_version: number;
  created_at: string;
  active_duels: number;
  active_tournaments: number;
};

type GameStats = {
  totalGames: number;
  onlineGames: number;
  cashGames: number;
  autoTournamentGames: number;
  totalLiveDuels: number;
  totalActiveTournaments: number;
};

const GAME_ICONS: Record<string, string> = {
  chess: "♟️",
  dominoes: "🁉",
  backgammon: "🎲",
  checkers: "🔴",
  "speed-math": "⚡",
  "connect-four": "🟡",
  xo: "❌",
  seega: "⚔️",
  reversi: "⚫",
  gomoku: "⚪",
};

function ToggleSwitch({
  checked,
  onChange,
  disabled,
  labelOn = "ON",
  labelOff = "OFF",
  color = "#22c55e",
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  labelOn?: string;
  labelOff?: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 10px",
        borderRadius: "20px",
        border: `1px solid ${checked ? color : "#374151"}`,
        background: checked ? `${color}1a` : "#1f2937",
        color: checked ? color : "#9ca3af",
        fontSize: "12px",
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.15s ease",
        outline: "none",
      }}
    >
      <span
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: checked ? color : "#6b7280",
          boxShadow: checked ? `0 0 6px ${color}` : "none",
        }}
      />
      {checked ? labelOn : labelOff}
    </button>
  );
}

export default function AdminGamesPage() {
  const [games, setGames] = useState<GameApiRow[]>([]);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [cashFilter, setCashFilter] = useState<string>("ALL");
  const [tournamentFilter, setTournamentFilter] = useState<string>("ALL");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchGames = useCallback(async () => {
    try {
      const res = await get<{ ok: boolean; games: GameApiRow[]; stats: GameStats }>("/v1/admin/games");
      if (res.ok) {
        setGames(res.games);
        setStats(res.stats);
      }
    } catch (err) {
      // Keep existing data on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchGames();
  }, [fetchGames]);

  function showNotice(text: string, type: "success" | "error" = "success") {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  }

  async function handleToggleStatus(game: GameApiRow) {
    if (pendingId) return;
    setPendingId(game.id + "-status");
    const nextVal = !game.is_live;
    // Optimistic update
    setGames((prev) => prev.map((g) => (g.id === game.id ? { ...g, is_live: nextVal } : g)));
    try {
      const res = await post<{ ok: boolean; game: GameApiRow }>(`/v1/admin/games/${game.id}/toggle-status`);
      if (res.ok) {
        showNotice(`${game.display_name} is now ${res.game.is_live ? "ONLINE" : "in MAINTENANCE"}`);
        await fetchGames();
      }
    } catch (err) {
      // Revert optimistic update
      setGames((prev) => prev.map((g) => (g.id === game.id ? { ...g, is_live: !nextVal } : g)));
      showNotice(err instanceof ApiError ? err.message : "Failed to update game status", "error");
    } finally {
      setPendingId(null);
    }
  }

  async function handleToggleCash(game: GameApiRow) {
    if (pendingId) return;
    setPendingId(game.id + "-cash");
    const nextVal = !game.cash_enabled;
    // Optimistic update
    setGames((prev) => prev.map((g) => (g.id === game.id ? { ...g, cash_enabled: nextVal } : g)));
    try {
      const res = await post<{ ok: boolean; game: GameApiRow }>(`/v1/admin/games/${game.id}/toggle-cash`);
      if (res.ok) {
        showNotice(`${game.display_name} USDT Staking is now ${res.game.cash_enabled ? "ENABLED" : "DISABLED"}`);
        await fetchGames();
      }
    } catch (err) {
      // Revert optimistic update
      setGames((prev) => prev.map((g) => (g.id === game.id ? { ...g, cash_enabled: !nextVal } : g)));
      showNotice(err instanceof ApiError ? err.message : "Failed to update cash staking", "error");
    } finally {
      setPendingId(null);
    }
  }

  async function handleToggleTournaments(game: GameApiRow) {
    if (pendingId) return;
    setPendingId(game.id + "-tournaments");
    const nextVal = !game.auto_tournaments_enabled;
    // Optimistic update
    setGames((prev) => prev.map((g) => (g.id === game.id ? { ...g, auto_tournaments_enabled: nextVal } : g)));
    try {
      const res = await post<{ ok: boolean; game: GameApiRow }>(`/v1/admin/games/${game.id}/toggle-tournaments`);
      if (res.ok) {
        showNotice(`${game.display_name} Automatic Tournaments are now ${res.game.auto_tournaments_enabled ? "ACTIVE (8 Tiers: $10-$2000)" : "PAUSED"}`);
        await fetchGames();
      }
    } catch (err) {
      // Revert optimistic update
      setGames((prev) => prev.map((g) => (g.id === game.id ? { ...g, auto_tournaments_enabled: !nextVal } : g)));
      showNotice(err instanceof ApiError ? err.message : "Failed to update auto tournaments", "error");
    } finally {
      setPendingId(null);
    }
  }

  const filtered = games.filter((g) => {
    const matchesSearch =
      g.display_name.toLowerCase().includes(search.toLowerCase()) ||
      g.id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "ONLINE" && g.is_live) ||
      (statusFilter === "MAINTENANCE" && !g.is_live);
    const matchesCash =
      cashFilter === "ALL" ||
      (cashFilter === "ENABLED" && g.cash_enabled) ||
      (cashFilter === "DISABLED" && !g.cash_enabled);
    const matchesTournaments =
      tournamentFilter === "ALL" ||
      (tournamentFilter === "ENABLED" && g.auto_tournaments_enabled) ||
      (tournamentFilter === "DISABLED" && !g.auto_tournaments_enabled);
    return matchesSearch && matchesStatus && matchesCash && matchesTournaments;
  });

  return (
    <AdminPageLayout
      title="Game Catalog & Controls Engine"
      subtitle="Manage live games, USDT cash staking, and automatic 8-tier tournament generation."
      breadcrumb={["Home", "Admin", "Games"]}
      stats={[
        {
          label: "Active Games",
          value: `${stats?.onlineGames ?? games.filter((g) => g.is_live).length} / ${stats?.totalGames ?? games.length}`,
          trend: "Operational",
        },
        {
          label: "Cash-Eligible Games",
          value: `${stats?.cashGames ?? games.filter((g) => g.cash_enabled).length}`,
          trend: "USDT Staking",
        },
        {
          label: "Auto Tournaments",
          value: `${stats?.autoTournamentGames ?? games.filter((g) => g.auto_tournaments_enabled).length} Games`,
          trend: "8 Tiers ($10 - $2000)",
        },
        {
          label: "Active Tournaments",
          value: `${stats?.totalActiveTournaments ?? games.reduce((sum, g) => sum + (g.active_tournaments || 0), 0)}`,
          trend: "Live Brackets",
        },
      ]}
    >
      {notice && (
        <div
          style={{
            padding: "12px 18px",
            background: notice.type === "success" ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
            border: `1px solid ${notice.type === "success" ? "#22c55e" : "#ef4444"}`,
            borderRadius: "8px",
            marginBottom: "20px",
            color: notice.type === "success" ? "#22c55e" : "#ef4444",
            fontSize: "14px",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {notice.type === "success" ? "✓" : "⚠️"} {notice.text}
        </div>
      )}

      {/* Toolbar & Filters */}
      <div className={styles.toolbar} style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", justifyContent: "space-between" }}>
        <div className={styles.searchBox} style={{ minWidth: "280px" }}>
          <input
            type="search"
            placeholder="Search games (chess, checkers, speed-math)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: "8px 12px", background: "#1f2937", color: "#f3f4f6", border: "1px solid #374151", borderRadius: "8px", fontSize: "13px" }}
          >
            <option value="ALL">Status: All</option>
            <option value="ONLINE">Status: Online</option>
            <option value="MAINTENANCE">Status: Maintenance</option>
          </select>

          <select
            value={cashFilter}
            onChange={(e) => setCashFilter(e.target.value)}
            style={{ padding: "8px 12px", background: "#1f2937", color: "#f3f4f6", border: "1px solid #374151", borderRadius: "8px", fontSize: "13px" }}
          >
            <option value="ALL">USDT Staking: All</option>
            <option value="ENABLED">USDT Enabled</option>
            <option value="DISABLED">Free Only</option>
          </select>

          <select
            value={tournamentFilter}
            onChange={(e) => setTournamentFilter(e.target.value)}
            style={{ padding: "8px 12px", background: "#1f2937", color: "#f3f4f6", border: "1px solid #374151", borderRadius: "8px", fontSize: "13px" }}
          >
            <option value="ALL">Auto Tournaments: All</option>
            <option value="ENABLED">Tournaments Active</option>
            <option value="DISABLED">Tournaments Paused</option>
          </select>

          <button
            type="button"
            onClick={() => void fetchGames()}
            disabled={loading}
            style={{
              padding: "8px 14px",
              background: "#374151",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
            }}
          >
            {loading ? "Refreshing..." : "🔄 Refresh"}
          </button>
        </div>
      </div>

      {/* Table Card */}
      <div className={styles.tableCard} style={{ marginTop: "16px" }}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>
            Official Game Catalog ({filtered.length} of {games.length})
          </h2>
          <span style={{ fontSize: "12px", color: "var(--nz-text-3)" }}>
            Changes take effect immediately across matchmaking and tournament engines.
          </span>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Game</th>
                <th>Game Status</th>
                <th>USDT Staking</th>
                <th>Auto Tournaments</th>
                <th>Open Tournaments</th>
                <th>Live Duels</th>
                <th>Version</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "var(--nz-text-3)" }}>
                    {loading ? "Loading game catalog..." : "No games match your filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((g) => {
                  const icon = GAME_ICONS[g.id] || "🎮";
                  const isStatusPending = pendingId === `${g.id}-status`;
                  const isCashPending = pendingId === `${g.id}-cash`;
                  const isTournPending = pendingId === `${g.id}-tournaments`;

                  return (
                    <tr key={g.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ fontSize: "20px" }}>{icon}</span>
                          <div>
                            <strong style={{ fontSize: "14px", color: "#fff" }}>{g.display_name}</strong>
                            <div style={{ fontSize: "11px", color: "var(--nz-text-3)", fontFamily: "monospace" }}>
                              {g.id}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Online / Maintenance Switch */}
                      <td>
                        <ToggleSwitch
                          checked={g.is_live}
                          disabled={isStatusPending}
                          onChange={() => void handleToggleStatus(g)}
                          labelOn="ONLINE"
                          labelOff="PAUSED"
                          color="#22c55e"
                        />
                      </td>

                      {/* USDT Staking Switch */}
                      <td>
                        <ToggleSwitch
                          checked={g.cash_enabled}
                          disabled={isCashPending}
                          onChange={() => void handleToggleCash(g)}
                          labelOn="USDT ON"
                          labelOff="FREE ONLY"
                          color="#38bdf8"
                        />
                      </td>

                      {/* Auto Tournaments Switch */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <ToggleSwitch
                            checked={g.auto_tournaments_enabled}
                            disabled={isTournPending}
                            onChange={() => void handleToggleTournaments(g)}
                            labelOn="ACTIVE"
                            labelOff="PAUSED"
                            color="#a855f7"
                          />
                          {g.auto_tournaments_enabled && (
                            <span style={{ fontSize: "10px", color: "#a855f7", fontWeight: 500 }}>
                              8 Tiers: $10 - $2000
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Active Tournaments Count */}
                      <td className="nz-num">
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 8px",
                            borderRadius: "6px",
                            background: g.active_tournaments > 0 ? "rgba(168, 85, 247, 0.15)" : "#1f2937",
                            color: g.active_tournaments > 0 ? "#c084fc" : "var(--nz-text-3)",
                            fontWeight: 600,
                            fontSize: "13px",
                          }}
                        >
                          {g.active_tournaments} open
                        </span>
                      </td>

                      {/* Active Duels */}
                      <td className="nz-num">
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 8px",
                            borderRadius: "6px",
                            background: g.active_duels > 0 ? "rgba(34, 197, 94, 0.15)" : "#1f2937",
                            color: g.active_duels > 0 ? "#4ade80" : "var(--nz-text-3)",
                            fontWeight: 600,
                            fontSize: "13px",
                          }}
                        >
                          {g.active_duels} live
                        </span>
                      </td>

                      {/* Plugin Version */}
                      <td>
                        <span className={`${styles.badge} ${styles.badgeNeutral}`} style={{ fontSize: "11px" }}>
                          v{g.plugin_version}
                        </span>
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

