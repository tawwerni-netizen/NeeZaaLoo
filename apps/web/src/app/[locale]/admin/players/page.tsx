"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { get, post } from "@/lib/api";
import styles from "@/components/admin/AdminPageLayout.module.css";

interface PlayerRecord {
  id: string;
  handle: string;
  created_at: string;
  locale: string;
  roles?: string[];
  disabled_at?: string | null;
  disabled_reason?: string | null;
  disabled_by?: string | null;
}

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState<PlayerRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Modals state
  const [banTarget, setBanTarget] = useState<PlayerRecord | null>(null);
  const [banReason, setBanReason] = useState("");
  const [muteTarget, setMuteTarget] = useState<PlayerRecord | null>(null);
  const [muteReason, setMuteReason] = useState("");
  const [muteDuration, setMuteDuration] = useState<number>(86400000); // 24h default

  const loadPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const q = encodeURIComponent(search.trim());
      const data = await get<{ players: PlayerRecord[] }>(`/v1/admin/players${q ? `?q=${q}` : ""}`);
      if (data.players) setPlayers(data.players);
    } catch (e) {
      console.error("Failed to load players:", e);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPlayers();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadPlayers]);

  function showNotice(msg: string) {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  }

  async function promoteUser(id: string) {
    if (!window.confirm("Are you sure you want to promote this user to Admin?")) return;
    try {
      await post(`/v1/admin/players/${id}/promote`);
      showNotice("User promoted to Admin with chat moderation capabilities!");
      loadPlayers();
    } catch (e) {
      alert("Failed to promote user");
    }
  }

  async function demoteUser(id: string) {
    if (!window.confirm("Are you sure you want to demote this user from Admin?")) return;
    try {
      await post(`/v1/admin/players/${id}/demote`);
      showNotice("User demoted successfully!");
      loadPlayers();
    } catch (e) {
      alert("Failed to demote user");
    }
  }

  async function handleBanPlayer() {
    if (!banTarget) return;
    try {
      await post(`/v1/admin/players/${banTarget.id}/ban`, {
        reason: banReason.trim() || "Banned by administrator",
      });
      showNotice(`Player @${banTarget.handle} has been banned from the platform.`);
      setBanTarget(null);
      setBanReason("");
      loadPlayers();
    } catch (e: any) {
      alert(e?.message || "Failed to ban player");
    }
  }

  async function handleUnbanPlayer(p: PlayerRecord) {
    if (!window.confirm(`Unban @${p.handle} and restore account access?`)) return;
    try {
      await post(`/v1/admin/players/${p.id}/unban`);
      showNotice(`Player @${p.handle} unbanned successfully.`);
      loadPlayers();
    } catch (e: any) {
      alert(e?.message || "Failed to unban player");
    }
  }

  async function handleMutePlayer() {
    if (!muteTarget) return;
    try {
      await post("/v1/admin/chat/mutes", {
        targetId: muteTarget.id,
        reason: muteReason.trim() || "Muted by administrator",
        scope: "ALL_CHAT",
        durationMs: muteDuration > 0 ? muteDuration : null,
      });
      showNotice(`Player @${muteTarget.handle} muted in chat.`);
      setMuteTarget(null);
      setMuteReason("");
      loadPlayers();
    } catch (e: any) {
      alert(e?.message || "Failed to mute player");
    }
  }

  return (
    <AdminPageLayout
      title="User Management & Moderation"
      subtitle="Search, inspect, promote, mute from chat, or ban players platform-wide."
      breadcrumb={["Admin", "Players"]}
      stats={[
        { label: "Total Registered", value: String(players.length), trend: "Active Community" },
        { label: "Admins", value: String(players.filter(p => p.roles?.includes("ADMIN") || p.roles?.includes("SUPER_ADMIN")).length), trend: "Staff Members" },
        { label: "Banned Users", value: String(players.filter(p => !!p.disabled_at).length), trend: "Restricted" },
      ]}
    >
      <div style={{ marginBottom: "20px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <input
          type="search"
          placeholder="Search by nickname or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: "1",
            minWidth: "240px",
            padding: "10px 16px",
            background: "#161922",
            border: "1px solid #252b37",
            borderRadius: "8px",
            color: "#fff",
            fontSize: "14px",
          }}
        />
      </div>

      {actionNotice && (
        <div style={{ padding: "12px 16px", background: "rgba(34, 197, 94, 0.15)", color: "#22c55e", border: "1px solid #22c55e", borderRadius: "8px", marginBottom: "16px", fontSize: "14px", fontWeight: 600 }}>
          ✓ {actionNotice}
        </div>
      )}

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Players List ({players.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Handle</th>
                <th>Status</th>
                <th>Roles</th>
                <th>Joined</th>
                <th style={{ textAlign: "right" }}>Moderation Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && players.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>Loading players...</td>
                </tr>
              ) : players.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>No players found matching &quot;{search}&quot;</td>
                </tr>
              ) : (
                players.map((p) => {
                  const isSuperAdmin = p.roles?.includes("SUPER_ADMIN");
                  const isAdmin = p.roles?.includes("ADMIN") || isSuperAdmin;
                  const isBanned = Boolean(p.disabled_at);

                  return (
                    <tr key={p.id}>
                      <td><code style={{ fontSize: "12px", color: "#94a3b8" }}>{p.id.split("_")[1] || p.id}</code></td>
                      <td>
                        <strong style={{ fontSize: "14px", color: "#fff" }}>{p.handle}</strong>
                        {p.disabled_reason && (
                          <div style={{ fontSize: "11px", color: "#ef4444", marginTop: "2px" }}>
                            Reason: {p.disabled_reason}
                          </div>
                        )}
                      </td>
                      <td>
                        {isBanned ? (
                          <span className={`${styles.badge} ${styles.badgeDanger}`}>BANNED 🚫</span>
                        ) : (
                          <span className={`${styles.badge} ${styles.badgeSuccess}`}>ACTIVE</span>
                        )}
                      </td>
                      <td>
                        {isSuperAdmin ? (
                          <span className={`${styles.badge} ${styles.badgeWarning}`}>Super Admin</span>
                        ) : isAdmin ? (
                          <span className={`${styles.badge} ${styles.badgePrimary || styles.badgeSuccess}`}>Admin</span>
                        ) : (
                          <span className={`${styles.badge} ${styles.badgeNeutral}`}>Player</span>
                        )}
                      </td>
                      <td className="nz-num" style={{ fontSize: "12px", color: "#94a3b8" }}>
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                          {/* Chat Mute */}
                          <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={() => { setMuteTarget(p); setMuteReason(""); }}
                            title="Mute user from Chat"
                          >
                            🔇 Mute Chat
                          </button>

                          {/* Site-wide Ban / Unban */}
                          {isBanned ? (
                            <button
                              type="button"
                              className={`${styles.actionBtn}`}
                              style={{ background: "#22c55e", borderColor: "#22c55e", color: "#fff" }}
                              onClick={() => handleUnbanPlayer(p)}
                              title="Unban player"
                            >
                              ✓ Unban
                            </button>
                          ) : !isSuperAdmin ? (
                            <button
                              type="button"
                              className={`${styles.actionBtn}`}
                              style={{ background: "rgba(239, 68, 68, 0.2)", borderColor: "#ef4444", color: "#ef4444" }}
                              onClick={() => { setBanTarget(p); setBanReason(""); }}
                              title="Ban player from platform"
                            >
                              🚫 Ban Site
                            </button>
                          ) : null}

                          {/* Promote / Demote */}
                          {!isAdmin ? (
                            <button
                              type="button"
                              className={styles.actionBtn}
                              onClick={() => promoteUser(p.id)}
                            >
                              Promote Admin
                            </button>
                          ) : !isSuperAdmin ? (
                            <button
                              type="button"
                              className={styles.actionBtn}
                              onClick={() => demoteUser(p.id)}
                            >
                              Demote
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ban Modal */}
      {banTarget && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 10000, padding: "16px",
        }}>
          <div style={{
            background: "#161922", border: "1px solid #ef4444", borderRadius: "12px",
            maxWidth: "460px", width: "100%", padding: "24px", color: "#fff",
          }}>
            <h3 style={{ margin: "0 0 8px 0", color: "#ef4444", fontSize: "18px" }}>
              🚫 Ban Player from Platform
            </h3>
            <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 16px 0", lineHeight: 1.5 }}>
              Are you sure you want to ban <strong>@{banTarget.handle}</strong>? This will immediately revoke their active sessions and block them from logging in or using the site.
            </p>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
                Reason for Ban:
              </label>
              <input
                type="text"
                placeholder="e.g. Terms violation, abusive behavior, cheating..."
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                style={{
                  width: "100%", padding: "10px 12px", background: "#0e1015",
                  border: "1px solid #252b37", borderRadius: "6px", color: "#fff", fontSize: "13px",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => setBanTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.actionBtn}`}
                style={{ background: "#ef4444", borderColor: "#ef4444", color: "#fff" }}
                onClick={handleBanPlayer}
              >
                Confirm Ban
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mute Modal */}
      {muteTarget && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 10000, padding: "16px",
        }}>
          <div style={{
            background: "#161922", border: "1px solid #252b37", borderRadius: "12px",
            maxWidth: "460px", width: "100%", padding: "24px", color: "#fff",
          }}>
            <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", color: "#f59e0b" }}>
              🔇 Mute Player in Chat
            </h3>
            <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 16px 0", lineHeight: 1.5 }}>
              Mute <strong>@{muteTarget.handle}</strong> across all chat channels.
            </p>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
                Mute Duration:
              </label>
              <select
                value={muteDuration}
                onChange={(e) => setMuteDuration(Number(e.target.value))}
                style={{
                  width: "100%", padding: "10px 12px", background: "#0e1015",
                  border: "1px solid #252b37", borderRadius: "6px", color: "#fff", fontSize: "13px",
                }}
              >
                <option value={3600000}>1 Hour</option>
                <option value={86400000}>24 Hours (1 Day)</option>
                <option value={604800000}>7 Days</option>
                <option value={0}>Permanent</option>
              </select>
            </div>
            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
                Reason:
              </label>
              <input
                type="text"
                placeholder="e.g. Toxic chat, spam, advertisements..."
                value={muteReason}
                onChange={(e) => setMuteReason(e.target.value)}
                style={{
                  width: "100%", padding: "10px 12px", background: "#0e1015",
                  border: "1px solid #252b37", borderRadius: "6px", color: "#fff", fontSize: "13px",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => setMuteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                onClick={handleMutePlayer}
              >
                Apply Mute
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminPageLayout>
  );
}

