"use client";

import React, { useState } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import styles from "@/components/admin/AdminPageLayout.module.css";

type TicketRow = {
  id: string;
  playerHandle: string;
  category: "TECHNICAL" | "BILLING" | "FAIR_PLAY" | "GENERAL";
  subject: string;
  priority: "URGENT" | "HIGH" | "NORMAL";
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED";
  createdAt: string;
};

const INITIAL_TICKETS: TicketRow[] = [
  { id: "TCK-882", playerHandle: "DominoKingAlex", category: "BILLING", subject: "USDT deposit delayed on TRC20 network", priority: "HIGH", status: "OPEN", createdAt: "15 mins ago" },
  { id: "TCK-883", playerHandle: "Grandmaster77", category: "TECHNICAL", subject: "Clock reconnection during final seconds", priority: "NORMAL", status: "IN_PROGRESS", createdAt: "1 hour ago" },
  { id: "TCK-884", playerHandle: "CheckersChamp", category: "GENERAL", subject: "Question regarding weekly tournament tier", priority: "NORMAL", status: "RESOLVED", createdAt: "Yesterday" },
];

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<TicketRow[]>(INITIAL_TICKETS);
  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(null);
  const [replyText, setReplyText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTicket || !replyText.trim()) return;
    setTickets((prev) =>
      prev.map((t) => (t.id === selectedTicket.id ? { ...t, status: "RESOLVED" } : t))
    );
    setNotice(`Reply sent to ${selectedTicket.playerHandle}. Ticket ${selectedTicket.id} marked as RESOLVED.`);
    setReplyText("");
    setSelectedTicket(null);
    setTimeout(() => setNotice(null), 3500);
  }

  return (
    <AdminPageLayout
      title="Support Tickets & Player Inquiries"
      subtitle="Handle customer service escalations, billing inquiries, and technical reports."
      breadcrumb={["Home", "Admin", "Support"]}
      stats={[
        { label: "Open Tickets", value: "1", trend: "High Priority" },
        { label: "In Progress", value: "1", trend: "Assigned" },
        { label: "Average First Response", value: "12 mins", trend: "Top 5% SLA" },
        { label: "Resolution Satisfaction", value: "98.4%", trend: "Player rating" },
      ]}
    >
      {notice && (
        <div style={{ padding: "10px 16px", background: "rgba(34, 197, 94, 0.1)", border: "1px solid #22c55e", borderRadius: "8px", marginBottom: "16px", color: "#22c55e", fontSize: "13px" }}>
          ✓ {notice}
        </div>
      )}

      {selectedTicket && (
        <div style={{ background: "#161922", border: "1px solid #363e4e", borderRadius: "12px", padding: "20px", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
            <h3 style={{ margin: 0, color: "#fff", fontSize: "16px" }}>
              Reply to {selectedTicket.id}: {selectedTicket.subject} ({selectedTicket.playerHandle})
            </h3>
            <button type="button" className={styles.actionBtn} onClick={() => setSelectedTicket(null)}>✕ Close</button>
          </div>
          <form onSubmit={handleReply}>
            <textarea
              required
              rows={4}
              placeholder="Write support response to the player..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              style={{ width: "100%", background: "#0e1015", border: "1px solid #252b37", color: "#fff", padding: "12px", borderRadius: "8px", marginBottom: "12px", fontSize: "13px", resize: "vertical" }}
            />
            <button type="submit" className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}>
              Send Official Response & Resolve Ticket
            </button>
          </form>
        </div>
      )}

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Support Queue ({tickets.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Ticket ID</th>
                <th>Player</th>
                <th>Category</th>
                <th>Subject</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td><code>{t.id}</code></td>
                  <td><strong>{t.playerHandle}</strong></td>
                  <td><span className={`${styles.badge} ${styles.badgeNeutral}`}>{t.category}</span></td>
                  <td>{t.subject}</td>
                  <td>
                    <span
                      className={`${styles.badge} ${
                        t.priority === "URGENT" || t.priority === "HIGH"
                          ? styles.badgeDanger
                          : styles.badgeNeutral
                      }`}
                    >
                      {t.priority}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`${styles.badge} ${
                        t.status === "RESOLVED"
                          ? styles.badgeSuccess
                          : t.status === "IN_PROGRESS"
                          ? styles.badgeWarning
                          : styles.badgeDanger
                      }`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="nz-num">{t.createdAt}</td>
                  <td>
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${t.status !== "RESOLVED" ? styles.actionBtnPrimary : ""}`}
                      onClick={() => setSelectedTicket(t)}
                    >
                      {t.status === "RESOLVED" ? "View History" : "Reply & Settle"}
                    </button>
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
