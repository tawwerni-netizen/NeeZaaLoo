"use client";

import React, { useState } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import styles from "@/components/admin/AdminPageLayout.module.css";

type ChatMessage = {
  id: string;
  sender: string;
  channel: string;
  content: string;
  flagReason?: string;
  status: "NORMAL" | "FLAGGED" | "MUTED";
  timestamp: string;
};

const INITIAL_MESSAGES: ChatMessage[] = [
  { id: "msg_101", sender: "ToxicPlayer9", channel: "Global English", content: "You got lucky, rematch me right now trash!", flagReason: "Toxic language detected", status: "FLAGGED", timestamp: "3 mins ago" },
  { id: "msg_102", sender: "Grandmaster77", channel: "Chess Lounge", content: "Great endgame in round 3, well played!", status: "NORMAL", timestamp: "8 mins ago" },
  { id: "msg_103", sender: "SpamBot01", channel: "Global Arabic", content: "Free crypto coins here visit bit.ly/fake", flagReason: "Malicious link / phishing", status: "FLAGGED", timestamp: "14 mins ago" },
];

export default function AdminChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [notice, setNotice] = useState<string | null>(null);

  function muteUser(sender: string, msgId: string) {
    setMessages((prev) =>
      prev.map((m) => (m.sender === sender ? { ...m, status: "MUTED" } : m))
    );
    setNotice(`Player ${sender} muted across all chat channels for 24 hours.`);
    setTimeout(() => setNotice(null), 3500);
  }

  function dismissFlag(msgId: string) {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, status: "NORMAL" } : m))
    );
  }

  return (
    <AdminPageLayout
      title="Live Chat Moderation"
      subtitle="Monitor community channels, automated toxicity filters, spam protection, and user mutes."
      breadcrumb={["Home", "Admin", "Chat"]}
      stats={[
        { label: "Active Channels", value: "8 Channels", trend: "Multilingual" },
        { label: "Messages / Min", value: "142", trend: "Active discussion" },
        { label: "Auto-Filtered Links", value: "38 Today", trend: "Phishing blocked" },
        { label: "Muted Players", value: "4", trend: "Temporary mutes" },
      ]}
    >
      {notice && (
        <div style={{ padding: "10px 16px", background: "rgba(34, 197, 94, 0.1)", border: "1px solid #22c55e", borderRadius: "8px", marginBottom: "16px", color: "#22c55e", fontSize: "13px" }}>
          ✓ {notice}
        </div>
      )}

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Flagged & Live Chat Stream ({messages.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Message ID</th>
                <th>Sender</th>
                <th>Channel</th>
                <th>Message Content</th>
                <th>AI Filter Flag</th>
                <th>Status</th>
                <th>Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.id}>
                  <td><code>{m.id}</code></td>
                  <td><strong>{m.sender}</strong></td>
                  <td><span className={`${styles.badge} ${styles.badgeNeutral}`}>{m.channel}</span></td>
                  <td style={{ maxWidth: "300px" }}>{m.content}</td>
                  <td>
                    {m.flagReason ? (
                      <span style={{ color: "#ef4444", fontWeight: 600 }}>⚠️ {m.flagReason}</span>
                    ) : (
                      <span style={{ color: "#22c55e" }}>Clean</span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`${styles.badge} ${
                        m.status === "MUTED"
                          ? styles.badgeDanger
                          : m.status === "FLAGGED"
                          ? styles.badgeWarning
                          : styles.badgeSuccess
                      }`}
                    >
                      {m.status}
                    </span>
                  </td>
                  <td className="nz-num">{m.timestamp}</td>
                  <td style={{ display: "flex", gap: "6px" }}>
                    {m.status === "FLAGGED" && (
                      <>
                        <button
                          type="button"
                          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                          onClick={() => muteUser(m.sender, m.id)}
                        >
                          Mute Player
                        </button>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => dismissFlag(m.id)}
                        >
                          Dismiss
                        </button>
                      </>
                    )}
                    {m.status === "MUTED" && (
                      <span style={{ color: "#ef4444", fontSize: "12px" }}>Muted</span>
                    )}
                    {m.status === "NORMAL" && (
                      <span style={{ color: "#64748b", fontSize: "12px" }}>Approved</span>
                    )}
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
