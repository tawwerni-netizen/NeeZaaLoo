"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { get, post } from "@/lib/api";
import { adminErrorMessage } from "@/lib/admin-errors";
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

interface AmlSummary {
  asset: string;
  totalDepositedMinor: number;
  totalPlayedMinor: number;
  totalWonMinor: number;
  availableMinor: number;
  lockedMinor: number;
  unplayedDepositMinor: number;
  withdrawableMinor: number;
  playthroughCompleted: boolean;
}

interface PlayerDepositRecord {
  id: string;
  asset: string;
  network: string;
  address: string;
  status: string;
  amount_minor: string;
  observed_tx_hash: string | null;
  created_at: string;
  credited_at: string | null;
}

interface PlayerWithdrawalRecord {
  id: string;
  asset: string;
  network: string;
  destination: string;
  amount_minor: string;
  status: string;
  requested_at: string;
}

interface PlayerDuelRecord {
  id: string;
  game_id: string;
  tier: string;
  stake_minor: string;
  status: string;
  result: any;
  seat_0: string;
  seat_1: string;
  settled_at: string | null;
  created_at: string;
  handle_0: string | null;
  handle_1: string | null;
}

interface PlayerAmlDetail {
  player: PlayerRecord;
  amlSummary: AmlSummary;
  deposits: PlayerDepositRecord[];
  withdrawals: PlayerWithdrawalRecord[];
  duels: PlayerDuelRecord[];
}

function formatUsdt(amountMinor: number | string | null | undefined): string {
  const n = typeof amountMinor === "string" ? Number(amountMinor) : (amountMinor ?? 0);
  // Platform minor units are 6 decimal places (asset.minor_units), not 2 --
  // dividing by 100 here inflated every dollar figure on this page by
  // 10,000x (a real $250.00 balance rendered as "$2,500,000.00"), including
  // the confiscate-and-ban button's own displayed seizure amount.
  return (n / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  // Multi-tier Promotion Modal state
  const [promoteTarget, setPromoteTarget] = useState<PlayerRecord | null>(null);
  const [promoteRole, setPromoteRole] = useState<string>("SUPPORT");
  const [promoteReason, setPromoteReason] = useState<string>("");
  const [isPromoting, setIsPromoting] = useState(false);

  // Cheat Confiscation & Ban Modal state
  const [confiscateTarget, setConfiscateTarget] = useState<{ id: string; handle: string; availableMinor?: number | string | undefined } | null>(null);
  const [confiscateReason, setConfiscateReason] = useState<string>("Cheating / Fair Play Violation - balance confiscated");
  const [isConfiscating, setIsConfiscating] = useState(false);

  // Player Financial & AML inspection state
  const [inspectTarget, setInspectTarget] = useState<PlayerRecord | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectData, setInspectData] = useState<PlayerAmlDetail | null>(null);
  const [inspectTab, setInspectTab] = useState<"aml" | "deposits" | "withdrawals" | "duels">("aml");

  async function handleInspectPlayer(p: PlayerRecord) {
    setInspectTarget(p);
    setInspectLoading(true);
    setInspectData(null);
    setInspectTab("aml");
    try {
      const data = await get<PlayerAmlDetail>(`/v1/admin/players/${p.id}`);
      setInspectData(data);
    } catch (e: any) {
      alert(e?.message || "Failed to load player financial details");
    } finally {
      setInspectLoading(false);
    }
  }

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
    setTimeout(() => setActionNotice(null), 4500);
  }

  async function handlePromotePlayer() {
    if (!promoteTarget) return;
    setIsPromoting(true);
    try {
      await post(`/v1/admin/players/${promoteTarget.id}/promote`, {
        role: promoteRole,
        reason: promoteReason.trim() || `Promoted to ${promoteRole} via Admin Panel`,
      });
      showNotice(`✓ تم ترقية @${promoteTarget.handle} إلى (${promoteRole}) بنجاح!`);
      setPromoteTarget(null);
      setPromoteReason("");
      loadPlayers();
    } catch (e: any) {
      alert(e?.message || "فشلت عملية ترقية المستخدم");
    } finally {
      setIsPromoting(false);
    }
  }

  async function handleConfiscateAndBan() {
    if (!confiscateTarget) return;
    setIsConfiscating(true);
    try {
      const res = await post<{ ok: boolean; confiscatedUsdt?: string; confiscatedMinor?: string }>(
        `/v1/admin/players/${confiscateTarget.id}/confiscate-and-ban`,
        { reason: confiscateReason.trim() || "Cheating and fair play violation - balance confiscated" }
      );
      showNotice(`🚨 تم حظر الغشاش @${confiscateTarget.handle} ومصادرة ${res.confiscatedUsdt ?? "0.00"} USDT فوراً لخزينة المنصة!`);
      setConfiscateTarget(null);
      setConfiscateReason("Cheating / Fair Play Violation - balance confiscated");
      if (inspectTarget?.id === confiscateTarget.id) {
        setInspectTarget(null);
      }
      loadPlayers();
    } catch (e: any) {
      alert(e?.message || "فشلت عملية المصادرة والحظر");
    } finally {
      setIsConfiscating(false);
    }
  }

  async function demoteUser(id: string) {
    if (!window.confirm("Are you sure you want to demote this user from Admin?")) return;
    try {
      await post(`/v1/admin/players/${id}/demote`);
      showNotice("User demoted successfully!");
      loadPlayers();
    } catch (e) {
      alert(adminErrorMessage(e, "تعذّر سحب الصلاحية."));
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
                  const isStaff = Boolean(p.roles && p.roles.length > 0);
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
                        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                          {p.roles && p.roles.length > 0 ? (
                            p.roles.map((r) => {
                              if (r === "SUPER_ADMIN") {
                                return <span key={r} className={styles.badge} style={{ background: "rgba(168, 85, 247, 0.2)", color: "#c084fc", border: "1px solid #c084fc" }}>👑 Super Admin</span>;
                              }
                              if (r === "ADMIN") {
                                return <span key={r} className={styles.badge} style={{ background: "rgba(59, 130, 246, 0.2)", color: "#60a5fa", border: "1px solid #60a5fa" }}>⚙️ Admin</span>;
                              }
                              if (r === "FINANCE_ADMIN") {
                                return <span key={r} className={styles.badge} style={{ background: "rgba(16, 185, 129, 0.2)", color: "#34d399", border: "1px solid #34d399" }}>💼 Finance Admin</span>;
                              }
                              if (r === "ANTI_CHEAT_MODERATOR") {
                                return <span key={r} className={styles.badge} style={{ background: "rgba(245, 158, 11, 0.2)", color: "#fbbf24", border: "1px solid #fbbf24" }}>🛡️ Anti-Cheat</span>;
                              }
                              if (r === "SUPPORT") {
                                return <span key={r} className={styles.badge} style={{ background: "rgba(6, 182, 212, 0.2)", color: "#22d3ee", border: "1px solid #22d3ee" }}>🎧 Support Lead</span>;
                              }
                              return <span key={r} className={styles.badge}>{r}</span>;
                            })
                          ) : (
                            <span className={`${styles.badge} ${styles.badgeNeutral}`}>Player</span>
                          )}
                        </div>
                      </td>
                      <td className="nz-num" style={{ fontSize: "12px", color: "#94a3b8" }}>
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                          {/* Player Financial & AML Details */}
                          <button
                            type="button"
                            className={styles.actionBtn}
                            style={{ background: "rgba(59, 130, 246, 0.15)", borderColor: "#3b82f6", color: "#60a5fa" }}
                            onClick={() => handleInspectPlayer(p)}
                            title="تفاصيل اللاعب والبيانات المالية ومكافحة غسيل الأموال"
                          >
                            🔍 تفاصيل / AML
                          </button>

                          {/* Chat Mute */}
                          <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={() => { setMuteTarget(p); setMuteReason(""); }}
                            title="Mute user from Chat"
                          >
                            🔇 Mute Chat
                          </button>

                          {/* Cheat Ban & Confiscate */}
                          {!isBanned && !isSuperAdmin && (
                            <button
                              type="button"
                              className={styles.actionBtn}
                              style={{ background: "rgba(239, 68, 68, 0.18)", borderColor: "#ef4444", color: "#fca5a5" }}
                              onClick={() => {
                                setConfiscateTarget({ id: p.id, handle: p.handle });
                                setConfiscateReason("Cheating / Fair Play Violation - balance confiscated");
                              }}
                              title="حظر نهائي ومصادرة رصيد المحفظة بالكامل لصالح خزينة المنصة بسبب الغش"
                            >
                              🚨 مصادرة وحظر غش
                            </button>
                          )}

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
                              style={{ background: "rgba(100, 116, 139, 0.2)", borderColor: "#475569", color: "#cbd5e1" }}
                              onClick={() => { setBanTarget(p); setBanReason(""); }}
                              title="Ban player from platform"
                            >
                              🚫 Ban
                            </button>
                          ) : null}

                          {/* Promote / Demote */}
                          {!isStaff ? (
                            <button
                              type="button"
                              className={styles.actionBtn}
                              style={{ background: "rgba(168, 85, 247, 0.15)", borderColor: "#a855f7", color: "#c084fc" }}
                              onClick={() => {
                                setPromoteTarget(p);
                                setPromoteRole("SUPPORT");
                                setPromoteReason("");
                              }}
                              title="ترقية لدرجة إدارية محددة"
                            >
                              🎖️ ترقية إدارية
                            </button>
                          ) : !isSuperAdmin ? (
                            <>
                              <button
                                type="button"
                                className={styles.actionBtn}
                                style={{ background: "rgba(168, 85, 247, 0.15)", borderColor: "#a855f7", color: "#c084fc" }}
                                onClick={() => {
                                  setPromoteTarget(p);
                                  setPromoteRole(p.roles?.[0] || "ADMIN");
                                  setPromoteReason("");
                                }}
                                title="تعديل الرتبة الإدارية"
                              >
                                ✏️ تعديل الرتبة
                              </button>
                              <button
                                type="button"
                                className={styles.actionBtn}
                                onClick={() => demoteUser(p.id)}
                                title="إلغاء الصلاحيات الإدارية"
                              >
                                Demote
                              </button>
                            </>
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

      {/* Multi-Tier Role Promotion Modal */}
      {promoteTarget && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
          backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 10000, padding: "16px",
        }}>
          <div style={{
            background: "#161922", border: "1px solid #3b82f6", borderRadius: "14px",
            maxWidth: "520px", width: "100%", padding: "24px", color: "#fff",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
          }}>
            <h3 style={{ margin: "0 0 6px 0", color: "#60a5fa", fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>🎖️</span> تعيين الصلاحيات والترقية الإدارية (Staff Role)
            </h3>
            <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 16px 0" }}>
              تحديد الدرجة والمسؤولية الإدارية للاعب: <strong style={{ color: "#fff" }}>@{promoteTarget.handle}</strong>
            </p>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "13px", color: "#cbd5e1", marginBottom: "8px", fontWeight: 600 }}>
                اختر الدرجة الإدارية (Role):
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {[
                  {
                    role: "SUPPORT",
                    title: "🎧 خدمة العملاء والدعم الفني (Customer Support)",
                    desc: "إدارة والرد على تذاكر واستفسارات اللاعبين، حل النزاعات، والتعامل مع المحادثات المباشرة."
                  },
                  {
                    role: "FINANCE_ADMIN",
                    title: "💼 الإدارة المالية والحسابات (Finance & Accounts)",
                    desc: "مراجعة واعتماد طلبات السحب والإيداع، والتحقق من قيود مكافحة غسيل الأموال (AML)."
                  },
                  {
                    role: "ANTI_CHEAT_MODERATOR",
                    title: "🛡️ مكافحة الغش والرقابة (Fair Play & Anti-Cheat)",
                    desc: "مراقبة النزاهة وكشف الغشاشين، حظر الحسابات المتلاعبة، ومصادرة الأرصدة، وكتم الشات."
                  },
                  {
                    role: "ADMIN",
                    title: "⚙️ مدير تشغيلي عام (Operational Admin)",
                    desc: "إدارة شاملة لكتالوج الألعاب، البطولات، المستخدمين، وتذاكر الدعم وعمليات المنصة."
                  },
                  {
                    role: "SUPER_ADMIN",
                    title: "👑 مدير تنفيذي كامل الصلاحيات (Super Admin)",
                    desc: "صلاحيات سيادية كاملة على إعدادات المنصة الاقتصادية، توزيع الرتب الإدارية، وسياسات النظام."
                  },
                ].map((item) => {
                  const isSelected = promoteRole === item.role;
                  return (
                    <div
                      key={item.role}
                      onClick={() => setPromoteRole(item.role)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "8px",
                        border: isSelected ? "2px solid #3b82f6" : "1px solid #252b37",
                        background: isSelected ? "rgba(59, 130, 246, 0.12)" : "#0e1015",
                        cursor: "pointer",
                        transition: "all 120ms ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <strong style={{ fontSize: "13px", color: isSelected ? "#60a5fa" : "#e2e8f0" }}>
                          {item.title}
                        </strong>
                        <input
                          type="radio"
                          name="promoteRoleRadio"
                          checked={isSelected}
                          onChange={() => setPromoteRole(item.role)}
                          style={{ cursor: "pointer" }}
                        />
                      </div>
                      <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px", lineHeight: 1.4 }}>
                        {item.desc}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
                سبب الترقية / التكليف الإداري (اختياري):
              </label>
              <input
                type="text"
                placeholder="مثال: تكليف بمسؤولية الدعم الفني، ترقية من مجلس الإدارة..."
                value={promoteReason}
                onChange={(e) => setPromoteReason(e.target.value)}
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
                onClick={() => setPromoteTarget(null)}
                disabled={isPromoting}
              >
                إلغاء
              </button>
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                style={{ background: "#3b82f6", borderColor: "#3b82f6", color: "#fff", fontWeight: 700 }}
                onClick={handlePromotePlayer}
                disabled={isPromoting}
              >
                {isPromoting ? "جاري الحفظ..." : "تأكيد التعيين والترقية"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cheat Confiscation & Ban Modal */}
      {confiscateTarget && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 10001, padding: "16px",
        }}>
          <div style={{
            background: "#161922", border: "2px solid #ef4444", borderRadius: "14px",
            maxWidth: "500px", width: "100%", padding: "24px", color: "#fff",
            boxShadow: "0 25px 60px rgba(239, 68, 68, 0.25)",
          }}>
            <h3 style={{ margin: "0 0 8px 0", color: "#ef4444", fontSize: "19px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>🚨</span> مصادرة الرصيد والحظر الدائم بسبب الغش
            </h3>
            <p style={{ fontSize: "13px", color: "#cbd5e1", margin: "0 0 16px 0", lineHeight: 1.6 }}>
              أنت على وشك معاقبة اللاعب <strong style={{ color: "#fff" }}>@{confiscateTarget.handle}</strong> بسبب انتهاك قواعد النزاهة والغش في المنافسات.
            </p>

            <div style={{
              background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.4)",
              borderRadius: "10px", padding: "14px", marginBottom: "16px",
            }}>
              <div style={{ fontSize: "13px", color: "#fca5a5", fontWeight: 700, marginBottom: "6px" }}>
                ⚡ الإجراءات الفورية التي سيتم تنفيذها في دفتر الأستاذ:
              </div>
              <ul style={{ margin: 0, paddingRight: "18px", fontSize: "12px", color: "#fed7d7", lineHeight: 1.6, display: "flex", flexDirection: "column", gap: "4px" }}>
                <li>حساب الرصيد المالي المتاح في كافة حسابات اللاعب وتصفيره بالكامل.</li>
                <li>تحويل الرصيد عبر قيد محاسبي مزدوج فوري (Double-Entry) إلى حساب المنصة: <code style={{ color: "#fff", background: "#300", padding: "1px 4px", borderRadius: "3px" }}>platform:confiscated</code>.</li>
                <li>حظر اللاعب نهائياً من تسجيل الدخول والمنافسات (<code style={{ color: "#fff" }}>disabled_at = now()</code>).</li>
                <li>إلغاء كافة جلسات الدخول النشطة الخاصة به فوراً.</li>
              </ul>
            </div>

            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
                سبب الحظر والمصادرة (لتسجيله في سجل التدقيق المالي):
              </label>
              <input
                type="text"
                placeholder="مثال: استخدام برامج مساعدة / غش في نزال الشطرنج..."
                value={confiscateReason}
                onChange={(e) => setConfiscateReason(e.target.value)}
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
                onClick={() => setConfiscateTarget(null)}
                disabled={isConfiscating}
              >
                إلغاء وتراجع
              </button>
              <button
                type="button"
                className={styles.actionBtn}
                style={{ background: "#dc2626", borderColor: "#dc2626", color: "#fff", fontWeight: 800 }}
                onClick={handleConfiscateAndBan}
                disabled={isConfiscating}
              >
                {isConfiscating ? "جاري المصادرة والحظر..." : "تأكيد المصادرة والحظر النهائي"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Player Financial & AML Details Modal */}
      {inspectTarget && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
          backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 10000, padding: "16px",
        }}>
          <div style={{
            background: "#12141c", border: "1px solid #252b37", borderRadius: "14px",
            maxWidth: "920px", width: "100%", maxHeight: "90vh", display: "flex",
            flexDirection: "column", color: "#fff", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
            overflow: "hidden",
          }}>
            {/* Modal Header */}
            <div style={{
              padding: "18px 24px", borderBottom: "1px solid #252b37",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "#161924",
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>📊</span> تفاصيل اللاعب والبيانات المالية ومكافحة غسيل الأموال (AML)
                </h3>
                <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
                  اللاعب: <strong style={{ color: "#fff" }}>@{inspectTarget.handle}</strong> · المعرف: <code style={{ color: "#38bdf8" }}>{inspectTarget.id}</code> · تاريخ الانضمام: <span className="nz-num">{new Date(inspectTarget.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectTarget(null)}
                style={{
                  background: "transparent", border: "none", color: "#94a3b8",
                  fontSize: "20px", cursor: "pointer", padding: "4px 8px",
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
              {inspectLoading || !inspectData ? (
                <div style={{ textAlign: "center", padding: "50px 0", color: "#94a3b8" }}>
                  <div style={{ fontSize: "28px", marginBottom: "12px" }}>⏳</div>
                  <p>جاري تحميل البيانات المالية وسجلات التدقيق الخاصة باللاعب...</p>
                </div>
              ) : (
                <>
                  {/* AML Status Banner */}
                  {inspectData.amlSummary.unplayedDepositMinor > 0 ? (
                    <div style={{
                      padding: "16px", background: "rgba(245, 158, 11, 0.12)",
                      border: "1px solid rgba(245, 158, 11, 0.4)", borderRadius: "10px",
                      marginBottom: "20px", display: "flex", gap: "12px", alignItems: "flex-start",
                    }}>
                      <div style={{ fontSize: "24px" }}>⚠️</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: "#fbbf24", fontSize: "15px" }}>
                          قيود مكافحة غسيل الأموال نشطة (AML Playthrough Required)
                        </div>
                        <div style={{ fontSize: "13px", color: "#e2e8f0", marginTop: "4px", lineHeight: 1.6 }}>
                          هذا اللاعب قام بإيداع مبالغ ولم يكتمل استخدامها في اللعب بعد.
                          المبلغ المقيد المتبقي للعب: <strong style={{ color: "#f59e0b" }} className="nz-num">{formatUsdt(inspectData.amlSummary.unplayedDepositMinor)} USDT</strong>.
                          يُمنع سحب هذا المبلغ ويسمح له فقط بسحب ما قيمته <strong style={{ color: "#22c55e" }} className="nz-num">{formatUsdt(inspectData.amlSummary.withdrawableMinor)} USDT</strong>.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      padding: "16px", background: "rgba(34, 197, 94, 0.12)",
                      border: "1px solid rgba(34, 197, 94, 0.4)", borderRadius: "10px",
                      marginBottom: "20px", display: "flex", gap: "12px", alignItems: "flex-start",
                    }}>
                      <div style={{ fontSize: "24px" }}>✓</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: "#4ade80", fontSize: "15px" }}>
                          مستوفي لشروط مكافحة غسيل الأموال (AML Playthrough Completed)
                        </div>
                        <div style={{ fontSize: "13px", color: "#e2e8f0", marginTop: "4px", lineHeight: 1.6 }}>
                          اللاعب لعب بمبالغ تعادل أو تفوق كامل إيداعاته المعتمدة على المنصة.
                          يمكنه سحب كامل رصيده المتاح البالغ <strong style={{ color: "#4ade80" }} className="nz-num">{formatUsdt(inspectData.amlSummary.withdrawableMinor)} USDT</strong> دون أي حظر أو قيود.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 6 Financial Metric Cards */}
                  <div style={{
                    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    gap: "14px", marginBottom: "24px",
                  }}>
                    {/* Card 1: Total Deposited */}
                    <div style={{ background: "#181b24", border: "1px solid #252b37", borderRadius: "10px", padding: "14px 16px" }}>
                      <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
                        <span>📥 إجمالي الإيداعات</span>
                        <span style={{ fontSize: "10px", color: "#64748b" }}>TOTAL DEPOSITED</span>
                      </div>
                      <div style={{ fontSize: "22px", fontWeight: 800, color: "#38bdf8", marginTop: "6px" }} className="nz-num">
                        {formatUsdt(inspectData.amlSummary.totalDepositedMinor)} <span style={{ fontSize: "13px", fontWeight: 500 }}>USDT</span>
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                        مجموع الإيداعات الناجحة المعتمدة
                      </div>
                    </div>

                    {/* Card 2: Total Played (Turnover) */}
                    <div style={{ background: "#181b24", border: "1px solid #252b37", borderRadius: "10px", padding: "14px 16px" }}>
                      <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
                        <span>⚔️ إجمالي ما لُعب به</span>
                        <span style={{ fontSize: "10px", color: "#64748b" }}>TURNOVER / PLAYED VOLUME</span>
                      </div>
                      <div style={{ fontSize: "22px", fontWeight: 800, color: "#a855f7", marginTop: "6px" }} className="nz-num">
                        {formatUsdt(inspectData.amlSummary.totalPlayedMinor)} <span style={{ fontSize: "13px", fontWeight: 500 }}>USDT</span>
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                        رسوم دخول المبارزات والبطولات النقدية
                      </div>
                    </div>

                    {/* Card 3: Total Won */}
                    <div style={{ background: "#181b24", border: "1px solid #252b37", borderRadius: "10px", padding: "14px 16px" }}>
                      <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
                        <span>🏆 إجمالي الأرباح المكتسبة</span>
                        <span style={{ fontSize: "10px", color: "#64748b" }}>TOTAL WON</span>
                      </div>
                      <div style={{ fontSize: "22px", fontWeight: 800, color: "#10b981", marginTop: "6px" }} className="nz-num">
                        +{formatUsdt(inspectData.amlSummary.totalWonMinor)} <span style={{ fontSize: "13px", fontWeight: 500 }}>USDT</span>
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                        جوائز وأرباح النزالات الفائزة
                      </div>
                    </div>

                    {/* Card 4: Available Balance */}
                    <div style={{ background: "#181b24", border: "1px solid #252b37", borderRadius: "10px", padding: "14px 16px" }}>
                      <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
                        <span>💼 الرصيد المتاح بالمحفظة</span>
                        <span style={{ fontSize: "10px", color: "#64748b" }}>AVAILABLE BALANCE</span>
                      </div>
                      <div style={{ fontSize: "22px", fontWeight: 800, color: "#f8fafc", marginTop: "6px" }} className="nz-num">
                        {formatUsdt(inspectData.amlSummary.availableMinor)} <span style={{ fontSize: "13px", fontWeight: 500 }}>USDT</span>
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                        الرصيد الفعلي في محفظة اللاعب حالياً
                      </div>
                    </div>

                    {/* Card 5: Withdrawable Balance */}
                    <div style={{
                      background: "rgba(34, 197, 94, 0.08)",
                      border: "1px solid rgba(34, 197, 94, 0.4)",
                      borderRadius: "10px", padding: "14px 16px",
                    }}>
                      <div style={{ fontSize: "12px", color: "#4ade80", fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
                        <span>💸 من حقه يسحب الآن</span>
                        <span style={{ fontSize: "10px", color: "#22c55e" }}>WITHDRAWABLE</span>
                      </div>
                      <div style={{ fontSize: "24px", fontWeight: 900, color: "#22c55e", marginTop: "6px" }} className="nz-num">
                        {formatUsdt(inspectData.amlSummary.withdrawableMinor)} <span style={{ fontSize: "14px", fontWeight: 600 }}>USDT</span>
                      </div>
                      <div style={{ fontSize: "11px", color: "#86efac", marginTop: "4px" }}>
                        الحد الأقصى المسموح بسحبه نظامياً
                      </div>
                    </div>

                    {/* Card 6: AML Locked Unplayed Deposit */}
                    <div style={{
                      background: inspectData.amlSummary.unplayedDepositMinor > 0 ? "rgba(245, 158, 11, 0.08)" : "#181b24",
                      border: inspectData.amlSummary.unplayedDepositMinor > 0 ? "1px solid rgba(245, 158, 11, 0.4)" : "1px solid #252b37",
                      borderRadius: "10px", padding: "14px 16px",
                    }}>
                      <div style={{ fontSize: "12px", color: inspectData.amlSummary.unplayedDepositMinor > 0 ? "#fbbf24" : "#94a3b8", fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
                        <span>🔒 إيداع مقيد (لم يُلعب به)</span>
                        <span style={{ fontSize: "10px", color: "#64748b" }}>AML UNPLAYED</span>
                      </div>
                      <div style={{ fontSize: "24px", fontWeight: 900, color: inspectData.amlSummary.unplayedDepositMinor > 0 ? "#f59e0b" : "#64748b", marginTop: "6px" }} className="nz-num">
                        {formatUsdt(inspectData.amlSummary.unplayedDepositMinor)} <span style={{ fontSize: "14px", fontWeight: 600 }}>USDT</span>
                      </div>
                      <div style={{ fontSize: "11px", color: inspectData.amlSummary.unplayedDepositMinor > 0 ? "#fde68a" : "#64748b", marginTop: "4px" }}>
                        {inspectData.amlSummary.unplayedDepositMinor > 0 ? "ممنوع من السحب حتى يستخدمه في اللعب" : "لا توجد مبالغ إيداع مقيدة"}
                      </div>
                    </div>
                  </div>

                  {/* Tabs Row for Activity History */}
                  <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid #252b37", marginBottom: "16px" }}>
                    <button
                      type="button"
                      onClick={() => setInspectTab("aml")}
                      style={{
                        padding: "8px 14px", background: "none", border: "none",
                        borderBottom: inspectTab === "aml" ? "2px solid #3b82f6" : "2px solid transparent",
                        color: inspectTab === "aml" ? "#fff" : "#94a3b8",
                        fontWeight: inspectTab === "aml" ? 700 : 500, fontSize: "13px", cursor: "pointer",
                      }}
                    >
                      🛡️ قواعد واحتساب AML
                    </button>
                    <button
                      type="button"
                      onClick={() => setInspectTab("deposits")}
                      style={{
                        padding: "8px 14px", background: "none", border: "none",
                        borderBottom: inspectTab === "deposits" ? "2px solid #3b82f6" : "2px solid transparent",
                        color: inspectTab === "deposits" ? "#fff" : "#94a3b8",
                        fontWeight: inspectTab === "deposits" ? 700 : 500, fontSize: "13px", cursor: "pointer",
                      }}
                    >
                      📥 سجل الإيداعات ({inspectData.deposits.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setInspectTab("withdrawals")}
                      style={{
                        padding: "8px 14px", background: "none", border: "none",
                        borderBottom: inspectTab === "withdrawals" ? "2px solid #3b82f6" : "2px solid transparent",
                        color: inspectTab === "withdrawals" ? "#fff" : "#94a3b8",
                        fontWeight: inspectTab === "withdrawals" ? 700 : 500, fontSize: "13px", cursor: "pointer",
                      }}
                    >
                      📤 سجل السحوبات ({inspectData.withdrawals.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setInspectTab("duels")}
                      style={{
                        padding: "8px 14px", background: "none", border: "none",
                        borderBottom: inspectTab === "duels" ? "2px solid #3b82f6" : "2px solid transparent",
                        color: inspectTab === "duels" ? "#fff" : "#94a3b8",
                        fontWeight: inspectTab === "duels" ? 700 : 500, fontSize: "13px", cursor: "pointer",
                      }}
                    >
                      ⚔️ المبارزات النقدية ({inspectData.duels.length})
                    </button>
                  </div>

                  {/* Tab Content: AML Explanation */}
                  {inspectTab === "aml" && (
                    <div style={{ background: "#161922", border: "1px solid #252b37", borderRadius: "8px", padding: "16px", fontSize: "13px", lineHeight: 1.7, color: "#cbd5e1" }}>
                      <h4 style={{ margin: "0 0 8px 0", color: "#fff", fontSize: "14px" }}>معادلة حماية ومكافحة غسيل الأموال (AML Playthrough Formula)</h4>
                      <p style={{ margin: "0 0 10px 0" }}>
                        تمنع المنصة خروج أي أموال تم إيداعها دون استخدامها في اللعب والمبارزات. يتم احتساب المبالغ كالآتي:
                      </p>
                      <ul style={{ margin: 0, paddingRight: "20px", display: "flex", flexDirection: "column", gap: "6px" }}>
                        <li><strong>إيداع لم يُلعب به</strong> = أقصى قيمة بين <code>0</code> و <code>(إجمالي الإيداعات - إجمالي ما لُعب به)</code> = <span className="nz-num" style={{ color: "#f59e0b" }}>{formatUsdt(inspectData.amlSummary.unplayedDepositMinor)} USDT</span></li>
                        <li><strong>المبلغ المسموح بسحبه</strong> = أقصى قيمة بين <code>0</code> و <code>(الرصيد المتاح - الإيداع الذي لم يُلعب به)</code> = <span className="nz-num" style={{ color: "#22c55e" }}>{formatUsdt(inspectData.amlSummary.withdrawableMinor)} USDT</span></li>
                        <li><strong>الأرباح ورؤوس الأموال الملعوب بها</strong>: عند فوز اللاعب، تنتقل مبالغ النزال والأرباح فوراً إلى الرصيد القابل للسحب دون أي قيود.</li>
                      </ul>
                    </div>
                  )}

                  {/* Tab Content: Deposits */}
                  {inspectTab === "deposits" && (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "right" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #252b37", color: "#94a3b8" }}>
                            <th style={{ padding: "8px" }}>المعرف</th>
                            <th style={{ padding: "8px" }}>الشبكة / العملة</th>
                            <th style={{ padding: "8px" }}>المبلغ</th>
                            <th style={{ padding: "8px" }}>الحالة</th>
                            <th style={{ padding: "8px" }}>هاش المعاملة</th>
                            <th style={{ padding: "8px" }}>التاريخ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inspectData.deposits.length === 0 ? (
                            <tr><td colSpan={6} style={{ padding: "20px", textAlign: "center", color: "#64748b" }}>لا توجد عمليات إيداع مسجلة</td></tr>
                          ) : (
                            inspectData.deposits.map((d) => (
                              <tr key={d.id} style={{ borderBottom: "1px solid #1e2330" }}>
                                <td style={{ padding: "8px" }}><code>{d.id.slice(0, 10)}...</code></td>
                                <td style={{ padding: "8px" }}>{d.asset} ({d.network})</td>
                                <td style={{ padding: "8px", fontWeight: 700, color: "#38bdf8" }} className="nz-num">+{formatUsdt(d.amount_minor)} USDT</td>
                                <td style={{ padding: "8px" }}>
                                  <span style={{
                                    padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: 600,
                                    background: d.status === "CREDITED" ? "rgba(34, 197, 94, 0.2)" : "rgba(245, 158, 11, 0.2)",
                                    color: d.status === "CREDITED" ? "#4ade80" : "#fbbf24",
                                  }}>{d.status}</span>
                                </td>
                                <td style={{ padding: "8px" }}>
                                  {d.observed_tx_hash ? (
                                    <code style={{ fontSize: "11px", color: "#94a3b8" }}>{d.observed_tx_hash.slice(0, 10)}...</code>
                                  ) : "—"}
                                </td>
                                <td style={{ padding: "8px", color: "#94a3b8" }} className="nz-num">{new Date(d.created_at).toLocaleString()}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Tab Content: Withdrawals */}
                  {inspectTab === "withdrawals" && (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "right" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #252b37", color: "#94a3b8" }}>
                            <th style={{ padding: "8px" }}>المعرف</th>
                            <th style={{ padding: "8px" }}>الوجهة</th>
                            <th style={{ padding: "8px" }}>المبلغ</th>
                            <th style={{ padding: "8px" }}>الحالة</th>
                            <th style={{ padding: "8px" }}>تاريخ الطلب</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inspectData.withdrawals.length === 0 ? (
                            <tr><td colSpan={5} style={{ padding: "20px", textAlign: "center", color: "#64748b" }}>لا توجد عمليات سحب مسجلة</td></tr>
                          ) : (
                            inspectData.withdrawals.map((w) => (
                              <tr key={w.id} style={{ borderBottom: "1px solid #1e2330" }}>
                                <td style={{ padding: "8px" }}><code>{w.id.slice(0, 10)}...</code></td>
                                <td style={{ padding: "8px" }}>
                                  <code style={{ fontSize: "11px", color: "#94a3b8" }}>{w.destination.slice(0, 12)}...{w.destination.slice(-6)}</code>
                                </td>
                                <td style={{ padding: "8px", fontWeight: 700, color: "#f87171" }} className="nz-num">-{formatUsdt(w.amount_minor)} USDT</td>
                                <td style={{ padding: "8px" }}>
                                  <span style={{
                                    padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: 600,
                                    background: w.status === "CONFIRMED" ? "rgba(34, 197, 94, 0.2)" : "rgba(245, 158, 11, 0.2)",
                                    color: w.status === "CONFIRMED" ? "#4ade80" : "#fbbf24",
                                  }}>{w.status}</span>
                                </td>
                                <td style={{ padding: "8px", color: "#94a3b8" }} className="nz-num">{new Date(w.requested_at).toLocaleString()}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Tab Content: Duels */}
                  {inspectTab === "duels" && (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "right" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #252b37", color: "#94a3b8" }}>
                            <th style={{ padding: "8px" }}>اللعبة</th>
                            <th style={{ padding: "8px" }}>المنافس</th>
                            <th style={{ padding: "8px" }}>رسوم الدخول</th>
                            <th style={{ padding: "8px" }}>الحالة</th>
                            <th style={{ padding: "8px" }}>النتيجة</th>
                            <th style={{ padding: "8px" }}>التاريخ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inspectData.duels.length === 0 ? (
                            <tr><td colSpan={6} style={{ padding: "20px", textAlign: "center", color: "#64748b" }}>لا توجد مبارزات نقدية مسجلة</td></tr>
                          ) : (
                            inspectData.duels.map((duel) => {
                              const isSeat0 = duel.seat_0 === inspectTarget.id;
                              const opponentHandle = isSeat0 ? duel.handle_1 || duel.seat_1 : duel.handle_0 || duel.seat_0;
                              const winner = duel.result?.winner;
                              const won = winner ? (winner === (isSeat0 ? "0" : "1") || winner === inspectTarget.id) : false;
                              const isDraw = duel.result?.draw || winner === "DRAW";

                              return (
                                <tr key={duel.id} style={{ borderBottom: "1px solid #1e2330" }}>
                                  <td style={{ padding: "8px", fontWeight: 600 }}>{duel.game_id}</td>
                                  <td style={{ padding: "8px" }}>@{opponentHandle}</td>
                                  <td style={{ padding: "8px", fontWeight: 700, color: "#a855f7" }} className="nz-num">{formatUsdt(duel.stake_minor)} USDT</td>
                                  <td style={{ padding: "8px" }}>
                                    <span style={{
                                      padding: "2px 6px", borderRadius: "4px", fontSize: "11px",
                                      background: duel.status === "SETTLED" ? "rgba(34, 197, 94, 0.2)" : "rgba(59, 130, 246, 0.2)",
                                      color: duel.status === "SETTLED" ? "#4ade80" : "#60a5fa",
                                    }}>{duel.status}</span>
                                  </td>
                                  <td style={{ padding: "8px" }}>
                                    {duel.status === "SETTLED" ? (
                                      isDraw ? (
                                        <span style={{ color: "#94a3b8" }}>تعادل</span>
                                      ) : won ? (
                                        <span style={{ color: "#22c55e", fontWeight: 700 }}>🏆 فوز</span>
                                      ) : (
                                        <span style={{ color: "#ef4444" }}>خسارة</span>
                                      )
                                    ) : "جارية"}
                                  </td>
                                  <td style={{ padding: "8px", color: "#94a3b8" }} className="nz-num">{new Date(duel.created_at).toLocaleString()}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: "14px 24px", borderTop: "1px solid #252b37",
              display: "flex", justifyContent: "space-between", alignItems: "center", background: "#161924",
            }}>
              {!inspectTarget.disabled_at ? (
                <button
                  type="button"
                  className={styles.actionBtn}
                  style={{
                    background: "#dc2626", borderColor: "#ef4444", color: "#fff",
                    fontWeight: 700, display: "flex", alignItems: "center", gap: "6px",
                  }}
                  onClick={() => {
                    setConfiscateTarget({
                      id: inspectTarget.id,
                      handle: inspectTarget.handle,
                      availableMinor: inspectData?.amlSummary.availableMinor,
                    });
                    setConfiscateReason("Cheating / Fair Play Violation - balance confiscated");
                  }}
                >
                  <span>🚨</span> حظر الغشاش ومصادرة رصيده ({inspectData ? formatUsdt(inspectData.amlSummary.availableMinor) : "..."} USDT)
                </button>
              ) : (
                <div style={{ fontSize: "12px", color: "#ef4444", fontWeight: 600 }}>
                  🚫 هذا الحساب محظور حالياً
                </div>
              )}
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => setInspectTarget(null)}
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminPageLayout>
  );
}

