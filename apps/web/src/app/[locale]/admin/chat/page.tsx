"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import styles from "@/components/admin/AdminPageLayout.module.css";
import { get, post } from "@/lib/api";
import { adminErrorMessage } from "@/lib/admin-errors";

type LiveMessage = {
  id: string;
  channelId: string;
  senderId: string;
  nickname: string;
  avatarUrl: string | null;
  content: string | null;
  removed: boolean;
  deletedBy?: string | null;
  createdAt: string;
};

type ReportItem = {
  id: string;
  reporter_id: string;
  target_id: string | null;
  message_id: string | null;
  category: string;
  reason: string | null;
  status: "OPEN" | "REVIEWED" | "DISMISSED";
  created_at: string;
};

type ActiveMute = {
  id: string;
  target_id: string;
  target_handle?: string | null;
  moderator_id: string;
  moderator_name?: string | null;
  reason: string;
  scope: string;
  starts_at: string;
  ends_at: string | null;
};

type Tab = "MESSAGES" | "REPORTS" | "MUTES";

export default function AdminChatPage() {
  const [activeTab, setActiveTab] = useState<Tab>("MESSAGES");
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [mutes, setMutes] = useState<ActiveMute[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Modal states
  const [muteTarget, setMuteTarget] = useState<{ id: string; handle: string } | null>(null);
  const [muteDuration, setMuteDuration] = useState<number>(3600000);
  const [muteReason, setMuteReason] = useState("");

  const [banTarget, setBanTarget] = useState<{ id: string; handle: string } | null>(null);
  const [banReason, setBanReason] = useState("");

  // A CHAT_VIEW/CHAT_MUTE/etc denial (this platform grants those as a
  // deliberate custom-role capability -- see this route's own comment in
  // server.mjs -- never bundled into SUPER_ADMIN for free) must never
  // render as if chat were simply empty. That silently told a denied
  // admin "no messages" instead of "you cannot see this yet".
  const [permissionError, setPermissionError] = useState<string | null>(null);

  function flashNotice(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  }

  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      const res = await get<{ messages: LiveMessage[] }>("/v1/admin/chat/global/messages?limit=50");
      setMessages(res.messages || []);
      setPermissionError(null);
    } catch (e) {
      setPermissionError(adminErrorMessage(e, "Failed to load chat messages."));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      const res = await get<{ reports: ReportItem[] }>("/v1/admin/chat/reports?limit=50");
      setReports(res.reports || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMutes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await get<{ mutes: ActiveMute[] }>("/v1/admin/chat/mutes?limit=50");
      setMutes(res.mutes || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "MESSAGES") {
      loadMessages();
    } else if (activeTab === "REPORTS") {
      loadReports();
    } else if (activeTab === "MUTES") {
      loadMutes();
    }
  }, [activeTab, loadMessages, loadReports, loadMutes]);

  // Delete message
  async function handleDeleteMessage(messageId: string) {
    if (!confirm("Are you sure you want to permanently remove this message from chat?")) return;
    try {
      await post(`/v1/admin/chat/messages/${messageId}/delete`, {});
      flashNotice(`Message ${messageId} removed.`);
      loadMessages();
    } catch (e) {
      alert(adminErrorMessage(e, "تعذّر حذف الرسالة."));
    }
  }

  // Mute user
  async function handleMuteUser() {
    if (!muteTarget) return;
    const reason = muteReason.trim() || "Violation of chat rules";
    try {
      await post("/v1/admin/chat/mutes", {
        targetId: muteTarget.id,
        reason,
        scope: "ALL_CHAT",
        durationMs: muteDuration > 0 ? muteDuration : null,
      });
      flashNotice(`Player @${muteTarget.handle} muted successfully.`);
      setMuteTarget(null);
      setMuteReason("");
      if (activeTab === "MUTES") loadMutes();
      if (activeTab === "MESSAGES") loadMessages();
    } catch (e) {
      alert(adminErrorMessage(e, "تعذّر كتم اللاعب."));
    }
  }

  // Unmute user
  async function handleUnmuteUser(muteId: string, handle?: string | null) {
    try {
      await post(`/v1/admin/chat/mutes/${muteId}/revoke`, {});
      flashNotice(`Mute for ${handle ? `@${handle}` : muteId} revoked.`);
      loadMutes();
    } catch (e) {
      alert(adminErrorMessage(e, "تعذّر رفع الكتم."));
    }
  }

  // Ban player from site
  async function handleBanPlayer() {
    if (!banTarget) return;
    const reason = banReason.trim() || "Banned by administrator from chat moderation";
    try {
      await post(`/v1/admin/players/${banTarget.id}/ban`, { reason });
      flashNotice(`Player @${banTarget.handle} has been banned from the entire platform.`);
      setBanTarget(null);
      setBanReason("");
      if (activeTab === "MESSAGES") loadMessages();
    } catch (e) {
      alert(adminErrorMessage(e, "تعذّر حظر اللاعب — لا يمكن حظر مدير عام."));
    }
  }

  // Review report
  async function handleReviewReport(reportId: string, status: "REVIEWED" | "DISMISSED") {
    try {
      await post(`/v1/admin/chat/reports/${reportId}/review`, { status });
      flashNotice(`Report ${reportId} marked as ${status}.`);
      loadReports();
    } catch (e) {
      alert(adminErrorMessage(e, "تعذّرت مراجعة البلاغ."));
    }
  }

  return (
    <AdminPageLayout
      title="Live Chat Moderation"
      subtitle="Monitor community channels, delete offensive messages, mute abusive players, and ban toxic users."
      breadcrumb={["Home", "Admin", "Chat"]}
      stats={[
        { label: "Stream Messages", value: String(messages.length), trend: "Global Live Feed" },
        { label: "Active Mutes", value: String(mutes.length), trend: "Muted players" },
        { label: "Open Reports", value: String(reports.filter(r => r.status === "OPEN").length), trend: "Needs review" },
      ]}
    >
      {permissionError && (
        <div style={{
          padding: "12px 16px",
          background: "rgba(239, 68, 68, 0.15)",
          border: "1px solid #ef4444",
          borderRadius: "8px",
          marginBottom: "16px",
          color: "#f87171",
          fontSize: "14px",
          fontWeight: 600,
        }}>
          ⚠ {permissionError}
        </div>
      )}

      {notice && (
        <div style={{
          padding: "12px 16px",
          background: "rgba(34, 197, 94, 0.15)",
          border: "1px solid #22c55e",
          borderRadius: "8px",
          marginBottom: "16px",
          color: "#22c55e",
          fontSize: "14px",
          fontWeight: 600,
        }}>
          ✓ {notice}
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button
          type="button"
          onClick={() => setActiveTab("MESSAGES")}
          style={{
            padding: "10px 18px",
            borderRadius: "8px",
            border: "1px solid",
            borderColor: activeTab === "MESSAGES" ? "#ff6232" : "#252b37",
            background: activeTab === "MESSAGES" ? "#ff6232" : "#161922",
            color: "#fff",
            fontWeight: 600,
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          💬 Live Chat Messages ({messages.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("REPORTS")}
          style={{
            padding: "10px 18px",
            borderRadius: "8px",
            border: "1px solid",
            borderColor: activeTab === "REPORTS" ? "#ff6232" : "#252b37",
            background: activeTab === "REPORTS" ? "#ff6232" : "#161922",
            color: "#fff",
            fontWeight: 600,
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          ⚠️ Reports Queue ({reports.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("MUTES")}
          style={{
            padding: "10px 18px",
            borderRadius: "8px",
            border: "1px solid",
            borderColor: activeTab === "MUTES" ? "#ff6232" : "#252b37",
            background: activeTab === "MUTES" ? "#ff6232" : "#161922",
            color: "#fff",
            fontWeight: 600,
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          🔇 Active Mutes ({mutes.length})
        </button>
      </div>

      {/* TAB 1: Live Chat Messages */}
      {activeTab === "MESSAGES" && (
        <div className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <h2 className={styles.tableTitle}>Global Live Messages Feed ({messages.length})</h2>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={loadMessages}
            >
              🔄 Refresh
            </button>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Sender</th>
                  <th>Message Content</th>
                  <th>Status</th>
                  <th>Time</th>
                  <th style={{ textAlign: "right" }}>Moderator Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && messages.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>Loading messages...</td>
                  </tr>
                ) : messages.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>No messages in global chat yet.</td>
                  </tr>
                ) : (
                  messages.map((m) => (
                    <tr key={m.id}>
                      <td><code style={{ fontSize: "12px", color: "#94a3b8" }}>{m.id}</code></td>
                      <td>
                        <strong style={{ fontSize: "14px", color: "#fff" }}>@{m.nickname}</strong>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>{m.senderId}</div>
                      </td>
                      <td style={{ maxWidth: "360px", wordBreak: "break-word" }}>
                        {m.removed ? (
                          <span style={{ color: "#ef4444", fontStyle: "italic" }}>
                            [Message Removed by {m.deletedBy || "Moderator"}]
                          </span>
                        ) : (
                          m.content
                        )}
                      </td>
                      <td>
                        {m.removed ? (
                          <span className={`${styles.badge} ${styles.badgeDanger}`}>REMOVED</span>
                        ) : (
                          <span className={`${styles.badge} ${styles.badgeSuccess}`}>ACTIVE</span>
                        )}
                      </td>
                      <td className="nz-num" style={{ fontSize: "12px", color: "#94a3b8" }}>
                        {new Date(m.createdAt).toLocaleTimeString()}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                          {/* Delete Message */}
                          {!m.removed && (
                            <button
                              type="button"
                              className={styles.actionBtn}
                              style={{ background: "rgba(239, 68, 68, 0.2)", borderColor: "#ef4444", color: "#ef4444" }}
                              onClick={() => handleDeleteMessage(m.id)}
                              title="Delete this message"
                            >
                              🗑️ Delete
                            </button>
                          )}

                          {/* Mute User */}
                          <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={() => {
                              setMuteTarget({ id: m.senderId, handle: m.nickname });
                              setMuteReason("");
                            }}
                            title="Mute user from chat"
                          >
                            🔇 Mute
                          </button>

                          {/* Ban User */}
                          <button
                            type="button"
                            className={styles.actionBtn}
                            style={{ background: "rgba(239, 68, 68, 0.15)", borderColor: "#ef4444", color: "#ef4444" }}
                            onClick={() => {
                              setBanTarget({ id: m.senderId, handle: m.nickname });
                              setBanReason("");
                            }}
                            title="Ban user from site entirely"
                          >
                            🚫 Ban Site
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Reports Queue */}
      {activeTab === "REPORTS" && (
        <div className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <h2 className={styles.tableTitle}>Content Reports Queue ({reports.length})</h2>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={loadReports}
            >
              🔄 Refresh
            </button>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Report ID</th>
                  <th>Reporter</th>
                  <th>Category</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Reported At</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && reports.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>Loading reports...</td>
                  </tr>
                ) : reports.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>No reports in the queue.</td>
                  </tr>
                ) : (
                  reports.map((r) => (
                    <tr key={r.id}>
                      <td><code style={{ fontSize: "12px", color: "#94a3b8" }}>{r.id.slice(0, 12)}...</code></td>
                      <td>{r.reporter_id}</td>
                      <td>
                        <span className={`${styles.badge} ${styles.badgeWarning}`}>{r.category}</span>
                      </td>
                      <td style={{ maxWidth: "260px" }}>{r.reason || "No comment provided"}</td>
                      <td>
                        <span
                          className={`${styles.badge} ${
                            r.status === "OPEN"
                              ? styles.badgeDanger
                              : r.status === "REVIEWED"
                              ? styles.badgeSuccess
                              : styles.badgeNeutral
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="nz-num" style={{ fontSize: "12px", color: "#94a3b8" }}>
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                          {r.status === "OPEN" && (
                            <>
                              <button
                                type="button"
                                className={styles.actionBtn}
                                style={{ background: "#22c55e", borderColor: "#22c55e", color: "#fff" }}
                                onClick={() => handleReviewReport(r.id, "REVIEWED")}
                              >
                                ✓ Review
                              </button>
                              <button
                                type="button"
                                className={styles.actionBtn}
                                onClick={() => handleReviewReport(r.id, "DISMISSED")}
                              >
                                Dismiss
                              </button>
                            </>
                          )}
                          {r.target_id && (
                            <>
                              <button
                                type="button"
                                className={styles.actionBtn}
                                onClick={() => {
                                  setMuteTarget({ id: r.target_id!, handle: r.target_id! });
                                  setMuteReason(`Reported for ${r.category}`);
                                }}
                              >
                                🔇 Mute
                              </button>
                              <button
                                type="button"
                                className={styles.actionBtn}
                                style={{ background: "rgba(239, 68, 68, 0.2)", borderColor: "#ef4444", color: "#ef4444" }}
                                onClick={() => {
                                  setBanTarget({ id: r.target_id!, handle: r.target_id! });
                                  setBanReason(`Reported for ${r.category}`);
                                }}
                              >
                                🚫 Ban
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Active Mutes */}
      {activeTab === "MUTES" && (
        <div className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <h2 className={styles.tableTitle}>Active Chat Mutes ({mutes.length})</h2>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={loadMutes}
            >
              🔄 Refresh
            </button>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Target Player</th>
                  <th>Reason</th>
                  <th>Scope</th>
                  <th>Moderator</th>
                  <th>Muted At</th>
                  <th>Expires At</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && mutes.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>Loading mutes...</td>
                  </tr>
                ) : mutes.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>No active mutes recorded.</td>
                  </tr>
                ) : (
                  mutes.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <strong style={{ fontSize: "14px", color: "#fff" }}>
                          @{m.target_handle || m.target_id}
                        </strong>
                      </td>
                      <td>{m.reason}</td>
                      <td>
                        <span className={`${styles.badge} ${styles.badgeNeutral}`}>{m.scope}</span>
                      </td>
                      <td>{m.moderator_name || m.moderator_id}</td>
                      <td className="nz-num" style={{ fontSize: "12px", color: "#94a3b8" }}>
                        {new Date(m.starts_at).toLocaleString()}
                      </td>
                      <td className="nz-num" style={{ fontSize: "12px", color: "#94a3b8" }}>
                        {m.ends_at ? (
                          new Date(m.ends_at).toLocaleString()
                        ) : (
                          <span style={{ color: "#ef4444", fontWeight: 600 }}>Permanent</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className={styles.actionBtn}
                            style={{ background: "#22c55e", borderColor: "#22c55e", color: "#fff" }}
                            onClick={() => handleUnmuteUser(m.id, m.target_handle)}
                          >
                            🔊 Unmute
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
              🔇 Mute Player from Chat
            </h3>
            <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 16px 0", lineHeight: 1.5 }}>
              Mute <strong>@{muteTarget.handle}</strong> across all chat channels. The player will not be able to send any messages until the mute expires or is revoked.
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
                placeholder="e.g. Offensive language, spamming, harassment..."
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
                className={`${styles.actionBtn}`}
                style={{ background: "#f59e0b", borderColor: "#f59e0b", color: "#000", fontWeight: 700 }}
                onClick={handleMuteUser}
              >
                Confirm Mute
              </button>
            </div>
          </div>
        </div>
      )}

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
              Are you sure you want to ban <strong>@{banTarget.handle}</strong>? This will immediately revoke all their active sessions and prevent them from logging in or accessing the site.
            </p>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
                Reason for Ban:
              </label>
              <input
                type="text"
                placeholder="e.g. Terms violation, severe harassment, cheating..."
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
    </AdminPageLayout>
  );
}
