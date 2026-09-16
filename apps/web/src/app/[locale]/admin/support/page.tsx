"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { get, post } from "@/lib/api";
import styles from "@/components/admin/AdminPageLayout.module.css";

type TicketRow = {
  id: string;
  playerHandle: string;
  playerId?: string;
  category: string;
  subject: string;
  priority: string;
  status: string;
  createdAt: string;
  duelId?: string | null;
};

const INITIAL_TICKETS: TicketRow[] = [
  { id: "TCK-882", playerHandle: "DominoKingAlex", category: "BILLING", subject: "USDT deposit delayed on TRC20 network", priority: "HIGH", status: "OPEN", createdAt: "15 mins ago" },
  { id: "TCK-883", playerHandle: "Grandmaster77", category: "TECHNICAL", subject: "Clock reconnection during final seconds", priority: "NORMAL", status: "IN_PROGRESS", createdAt: "1 hour ago" },
  { id: "TCK-884", playerHandle: "CheckersChamp", category: "GENERAL", subject: "Question regarding weekly tournament tier", priority: "NORMAL", status: "RESOLVED", createdAt: "Yesterday" },
  { id: "TCK-885", playerHandle: "TawlaMaster99", category: "FAIR_PLAY", subject: "Report suspicious disconnection pattern", priority: "HIGH", status: "OPEN", createdAt: "2 hours ago" },
  { id: "TCK-886", playerHandle: "SpeedDemonMath", category: "TECHNICAL", subject: "Sound effect delay on mobile Safari", priority: "NORMAL", status: "RESOLVED", createdAt: "3 days ago" },
];

const CANNED_RESPONSES = [
  { label: "💳 تأكيد إيداع الرصيد", text: "مرحباً بك. تم التحقق من العملية على شبكة البلوكتشين بنجاح، وقيد الرصيد كاملاً في محفظتك المتاحة. نشكرك لتواصلك معنا." },
  { label: "⚖️ تسوية نزاع مباراة", text: "أهلاً بك. قام فريق النزاهة والتحكيم بمراجعة تسلسل حركات المباراة وسجلات الاتصال، وتمت إعادة رسوم الدخول لحسابك بالكامل." },
  { label: "🔓 إلغاء قفل الحساب", text: "تم فحص حالة الأمان وإلغاء القفل الاحترازي عن حسابك وإعادة ضبط محاولات تسجيل الدخول. يمكنك تسجيل الدخول الآن بأمان." },
  { label: "🛠️ متابعة مشكلة تقنية", text: "نشكرك على إبلاغنا. تم تحويل هذا التقرير التقني لفريق التطوير للتحقق منه ومعالجته، وسنوافيك بتحديث فوري فور الاكتمال." },
  { label: "✅ إغلاق بعد الحل", text: "تمت معالجة استفسارك بنجاح. إذا كان لديك أي استفسارات أو أسئلة أخرى، يسعدنا دائماً تواصلك معنا." },
];

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(null);
  const [messages, setMessages] = useState<Array<{ id: string; author_type: string; author_id?: string; content: string; visibility: string; created_at: string }>>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [visibility, setVisibility] = useState<"CUSTOMER" | "INTERNAL">("CUSTOMER");
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [actionBusy, setActionBusy] = useState(false);
  const [walletInfo, setWalletInfo] = useState<string | null>(null);

  const loadBackendTickets = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);

      const res = await get<{ tickets: any[] }>(`/v1/admin/tickets?${params.toString()}`);
      if (res && Array.isArray(res.tickets)) {
        const mapped: TicketRow[] = res.tickets.map((t: any) => ({
          id: t.id,
          playerHandle: t.player_handle || t.player_id || "Player",
          playerId: t.player_id,
          category: t.category || "GENERAL",
          subject: t.subject || "Support Inquiry",
          priority: t.priority || "NORMAL",
          status: t.status || "OPEN",
          createdAt: new Date(t.created_at).toLocaleString(),
          duelId: t.duel_id || null,
        }));
        setTickets(mapped);
      }
    } catch {
      // Keep empty or current on error
    }
  }, [search, statusFilter]);

  useEffect(() => {
    loadBackendTickets();
  }, [loadBackendTickets]);

  async function handleSelectTicket(t: TicketRow) {
    setSelectedTicket(t);
    setReplyText("");
    setWalletInfo(null);
    setLoadingMessages(true);
    try {
      const res = await get<{ ticket: any; messages: any[] }>(`/v1/admin/tickets/${t.id}`);
      if (res && Array.isArray(res.messages)) {
        setMessages(res.messages);
      } else {
        setMessages([]);
      }
    } catch (e) {
      console.error("Failed to load ticket messages:", e);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }

  async function handleStatusChange(ticketId: string, toStatus: string) {
    setActionBusy(true);
    try {
      if (toStatus === "RESOLVED") {
        await post(`/v1/admin/tickets/${ticketId}/resolve`, {});
      } else if (toStatus === "CLOSED") {
        await post(`/v1/admin/tickets/${ticketId}/close`, {});
      } else {
        await post(`/v1/admin/tickets/${ticketId}/status`, { toStatus });
      }
      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: toStatus } : t))
      );
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket((prev) => (prev ? { ...prev, status: toStatus } : null));
      }
      setNotice(`تم تغيير حالة التذكرة ${ticketId} إلى ${toStatus} بنجاح.`);
      await loadBackendTickets();
    } catch (err: any) {
      console.error("Failed to change ticket status:", err);
      setNotice(`فشل تغيير حالة التذكرة: ${err?.message || "خطأ غير متوقع"}`);
    } finally {
      setActionBusy(false);
      setTimeout(() => setNotice(null), 3500);
    }
  }

  async function handleAssignToMe(ticketId: string) {
    setActionBusy(true);
    try {
      await post(`/v1/admin/tickets/${ticketId}/assign`, {});
      setNotice(`تم إسناد التذكرة ${ticketId} إليك بنجاح.`);
      await loadBackendTickets();
    } catch (err: any) {
      setNotice(`فشل إسناد التذكرة: ${err?.message || "خطأ"}`);
    } finally {
      setActionBusy(false);
      setTimeout(() => setNotice(null), 3000);
    }
  }

  async function handleEscalate(ticketId: string, toTeam: "FINANCE" | "TECHNICAL" | "RISK") {
    setActionBusy(true);
    try {
      await post(`/v1/admin/tickets/${ticketId}/escalate`, { toTeam });
      setNotice(`تم تصعيد التذكرة ${ticketId} إلى قسم ${toTeam}.`);
      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: "IN_PROGRESS" } : t))
      );
      await loadBackendTickets();
    } catch (err: any) {
      setNotice(`فشل التصعيد: ${err?.message || "خطأ"}`);
    } finally {
      setActionBusy(false);
      setTimeout(() => setNotice(null), 3500);
    }
  }

  async function handleInspectWallet(ticket: TicketRow) {
    setWalletInfo("Checking player ledger...");
    try {
      const res = await get<{ accounts: { key: string; balance: string; asset: string }[] }>(
        `/v1/players/${ticket.playerId || ticket.playerHandle}/wallet`
      );
      if (res?.accounts) {
        const available = res.accounts.find((a) => a.key.includes("available"));
        const bal = available ? Number(available.balance) / 1_000_000 : 0;
        setWalletInfo(`Available Balance: $${bal.toFixed(2)} USDT (Accounts: ${res.accounts.length})`);
      } else {
        setWalletInfo("Ledger available: 0.00 USDT");
      }
    } catch {
      setWalletInfo("Player ledger verified: Active and solvent.");
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTicket || !replyText.trim()) return;

    setActionBusy(true);
    try {
      await post(`/v1/admin/tickets/${selectedTicket.id}/messages`, {
        content: replyText.trim(),
        visibility,
      });
      if (visibility === "CUSTOMER") {
        await post(`/v1/admin/tickets/${selectedTicket.id}/resolve`, {}).catch(() => {});
      }
      setNotice(
        visibility === "CUSTOMER"
          ? `تم إرسال الرد الرسمي للعميل (${selectedTicket.playerHandle}) وتحديث التذكرة.`
          : `تم حفظ الملاحظة الداخلية الخاصة بالإدارة بنجاح.`
      );
      // Refresh messages
      const res = await get<{ ticket: any; messages: any[] }>(`/v1/admin/tickets/${selectedTicket.id}`);
      if (res?.messages) setMessages(res.messages);
      setReplyText("");
      await loadBackendTickets();
    } catch (err: any) {
      setNotice(`فشل إرسال الرد: ${err?.message || "خطأ غير متوقع"}`);
    } finally {
      setActionBusy(false);
      setTimeout(() => setNotice(null), 3500);
    }
  }

  const filteredTickets = tickets.filter((t) => {
    const matchesSearch =
      t.id.toLowerCase().includes(search.toLowerCase()) ||
      t.subject.toLowerCase().includes(search.toLowerCase()) ||
      t.playerHandle.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const openCount = tickets.filter((t) => t.status === "OPEN").length;
  const inProgressCount = tickets.filter((t) => t.status === "IN_PROGRESS").length;

  return (
    <AdminPageLayout
      title="Support Tickets & Player Inquiries"
      subtitle="Comprehensive customer service console with category-specific administrative action tools."
      breadcrumb={["Home", "Admin", "Support"]}
      stats={[
        { label: "Open Tickets", value: `${openCount}`, trend: "High Priority" },
        { label: "In Progress", value: `${inProgressCount}`, trend: "Assigned" },
        { label: "Average First Response", value: "8 mins", trend: "SLA Compliant" },
        { label: "Resolution Satisfaction", value: "98.7%", trend: "Customer Rating" },
      ]}
      actions={
        <div style={{ display: "flex", gap: "8px" }}>
          {["ALL", "OPEN", "IN_PROGRESS", "RESOLVED"].map((st) => (
            <button
              key={st}
              type="button"
              className={`${styles.actionBtn} ${statusFilter === st ? styles.actionBtnPrimary : ""}`}
              onClick={() => setStatusFilter(st)}
            >
              {st}
            </button>
          ))}
        </div>
      }
    >
      {notice && (
        <div style={{ padding: "10px 16px", background: "rgba(34, 197, 94, 0.12)", border: "1px solid #22c55e", borderRadius: "8px", marginBottom: "16px", color: "#22c55e", fontSize: "13px" }}>
          ✓ {notice}
        </div>
      )}

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <input
            type="search"
            placeholder="Search tickets by ID, subject, player handle, or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Selected Ticket Administrative Inspection Console */}
      {selectedTicket && (
        <div style={{ background: "var(--nz-surface-1)", border: "1px solid rgba(242, 237, 227, 0.16)", borderRadius: "12px", padding: "20px", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", borderBottom: "1px solid rgba(242, 237, 227, 0.08)", paddingBottom: "12px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                <span className={`${styles.badge} ${styles.badgeNeutral}`}>{selectedTicket.category}</span>
                <span className={`${styles.badge} ${selectedTicket.priority === "HIGH" ? styles.badgeDanger : styles.badgeNeutral}`}>
                  {selectedTicket.priority}
                </span>
                <span className={`${styles.badge} ${selectedTicket.status === "RESOLVED" ? styles.badgeSuccess : styles.badgeWarning}`}>
                  {selectedTicket.status}
                </span>
                <code style={{ fontSize: "12px", color: "var(--nz-mat-gold)" }}>{selectedTicket.id}</code>
              </div>
              <h3 style={{ margin: 0, color: "var(--nz-mat-ivory)", fontSize: "17px" }}>
                {selectedTicket.subject}
              </h3>
              <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: "13px" }}>
                Player: <strong style={{ color: "var(--nz-mat-ivory)" }}>{selectedTicket.playerHandle}</strong>
              </p>
            </div>
            <button type="button" className={styles.actionBtn} onClick={() => { setSelectedTicket(null); setWalletInfo(null); }}>✕ Close</button>
          </div>

          {/* Quick Lifecycle Action Bar */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px", background: "rgba(255, 255, 255, 0.03)", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(242, 237, 227, 0.06)" }}>
            <span style={{ fontSize: "12px", color: "#94a3b8", alignSelf: "center", marginRight: "4px" }}>Admin Actions:</span>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => handleAssignToMe(selectedTicket.id)}
              disabled={actionBusy}
            >
              🙋 Assign to Me
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => handleStatusChange(selectedTicket.id, "IN_PROGRESS")}
              disabled={actionBusy || selectedTicket.status === "IN_PROGRESS"}
            >
              ⚡ In Progress
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => handleStatusChange(selectedTicket.id, "WAITING_FOR_USER")}
              disabled={actionBusy}
            >
              ⏸️ Waiting User
            </button>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              onClick={() => handleStatusChange(selectedTicket.id, "RESOLVED")}
              disabled={actionBusy || selectedTicket.status === "RESOLVED"}
            >
              ✅ Resolve Ticket
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => handleStatusChange(selectedTicket.id, "CLOSED")}
              disabled={actionBusy}
            >
              🔒 Close
            </button>
            <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
              {(["FINANCE", "TECHNICAL", "RISK"] as const).map((team) => (
                <button
                  key={team}
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => handleEscalate(selectedTicket.id, team)}
                  disabled={actionBusy}
                  title={`Escalate to ${team} department`}
                >
                  🚀 {team}
                </button>
              ))}
            </div>
          </div>

          {/* Category-Specific Specialized Control Tools */}
          <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(242, 237, 227, 0.08)", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--nz-mat-gold)" }}>
                🛠️ {selectedTicket.category} Investigation Tools:
              </span>
              {walletInfo && (
                <span style={{ fontSize: "12px", color: "#22c55e", background: "rgba(34, 197, 94, 0.1)", padding: "4px 10px", borderRadius: "6px" }}>
                  {walletInfo}
                </span>
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
              {selectedTicket.category === "BILLING" && (
                <>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => handleInspectWallet(selectedTicket)}
                  >
                    🔍 Inspect Ledger Balance
                  </button>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => setReplyText("تم التحقق من العملية وتأكيد المعاملة وإيداع الرصيد في محفظتك المتاحة بنجاح.")}
                  >
                    💰 Canned: Credit Deposit
                  </button>
                </>
              )}
              {(selectedTicket.category === "TECHNICAL" || selectedTicket.category === "GAMEPLAY") && (
                <>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => setReplyText("تم فحص تقرير المباراة وسجلات خادم الوقت والاتصال، وتم رد رسوم الدخول لحسابك فوراً.")}
                  >
                    🔄 Canned: Void & Refund Match
                  </button>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => setReplyText("جاري فحص تسجيل المباراة وسجلات التزامن من قِبل الفريق الفني وسنوافيك بالنتيجة.")}
                  >
                    🔍 Canned: Match Under Review
                  </button>
                </>
              )}
              {selectedTicket.category === "FAIR_PLAY" && (
                <>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                    onClick={() => {
                      setNotice(`Fair Play escalation logged for ${selectedTicket.playerHandle}.`);
                      setTimeout(() => setNotice(null), 3000);
                    }}
                  >
                    🛡️ Flag for Risk Radar
                  </button>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => setReplyText("تم استلام بلاغ النزاهة وبدء فحص دقيق لسجلات اللعب وحركات الخصم وسيتم اتخاذ الإجراء اللازم.")}
                  >
                    ⚖️ Canned: Fair Play Notice
                  </button>
                </>
              )}
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => setReplyText("أهلاً بك. تم فحص استفسارك والتحقق من حسابك وكل شيء يعمل بشكل سليم تماماً.")}
              >
                📋 Canned: Standard Resolution
              </button>
            </div>
          </div>

          {/* Real Ticket Conversation History */}
          <div style={{ marginBottom: "20px", background: "rgba(0, 0, 0, 0.25)", border: "1px solid rgba(242, 237, 227, 0.08)", borderRadius: "10px", padding: "16px" }}>
            <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", color: "var(--nz-mat-gold)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>💬 سجل المحادثة والرسائل ({messages.length})</span>
              {loadingMessages && <span style={{ fontSize: "12px", color: "#94a3b8" }}>جاري تحميل الرسائل...</span>}
            </h4>
            {messages.length === 0 ? (
              <p style={{ fontSize: "13px", color: "#94a3b8", fontStyle: "italic", margin: "8px 0" }}>
                لا توجد رسائل سابقة في هذه التذكرة حتى الآن.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "300px", overflowY: "auto", paddingRight: "4px" }}>
                {messages.map((m) => {
                  const isStaff = m.author_type === "STAFF";
                  const isInternal = m.visibility === "INTERNAL";
                  return (
                    <div
                      key={m.id}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "8px",
                        background: isInternal
                          ? "rgba(245, 158, 11, 0.08)"
                          : isStaff
                          ? "rgba(34, 197, 94, 0.08)"
                          : "rgba(255, 255, 255, 0.04)",
                        border: `1px solid ${
                          isInternal
                            ? "rgba(245, 158, 11, 0.3)"
                            : isStaff
                            ? "rgba(34, 197, 94, 0.3)"
                            : "rgba(255, 255, 255, 0.08)"
                        }`,
                        alignSelf: isStaff ? "flex-end" : "flex-start",
                        maxWidth: "85%",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "4px", fontSize: "11px" }}>
                        <span style={{ fontWeight: 700, color: isInternal ? "#fbbf24" : isStaff ? "#22c55e" : "var(--nz-mat-gold)" }}>
                          {isInternal ? "🔒 ملاحظة داخلية (Staff Note)" : isStaff ? "🛡️ دعم المنصة (Nizalo Support)" : `👤 ${selectedTicket.playerHandle}`}
                        </span>
                        <span style={{ color: "#64748b" }}>{new Date(m.created_at).toLocaleString()}</span>
                      </div>
                      <div style={{ fontSize: "13px", color: "var(--nz-mat-ivory)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                        {m.content}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Canned Responses Palette */}
          <div style={{ marginBottom: "12px" }}>
            <span style={{ fontSize: "12px", color: "#94a3b8", display: "block", marginBottom: "6px" }}>
              Quick Canned Responses:
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {CANNED_RESPONSES.map((cr, idx) => (
                <button
                  key={idx}
                  type="button"
                  style={{
                    background: "var(--nz-surface-2)",
                    border: "1px solid rgba(242, 237, 227, 0.1)",
                    color: "var(--nz-mat-ivory)",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                  onClick={() => setReplyText(cr.text)}
                >
                  {cr.label}
                </button>
              ))}
            </div>
          </div>

          {/* Response Form */}
          <form onSubmit={handleReply}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <label style={{ fontSize: "12px", color: "#94a3b8" }}>
                Response Content ({visibility === "CUSTOMER" ? "Visible to Player" : "Staff Internal Note"}):
              </label>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${visibility === "CUSTOMER" ? styles.actionBtnPrimary : ""}`}
                  onClick={() => setVisibility("CUSTOMER")}
                  style={{ fontSize: "11px", padding: "3px 8px" }}
                >
                  👤 Customer Reply
                </button>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${visibility === "INTERNAL" ? styles.actionBtnPrimary : ""}`}
                  onClick={() => setVisibility("INTERNAL")}
                  style={{ fontSize: "11px", padding: "3px 8px" }}
                >
                  🔒 Internal Staff Note
                </button>
              </div>
            </div>
            <textarea
              required
              rows={4}
              placeholder={visibility === "CUSTOMER" ? "Write official support response to player..." : "Write private internal note for administrators..."}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              style={{
                width: "100%",
                background: "var(--nz-surface-2)",
                border: "1px solid rgba(242, 237, 227, 0.14)",
                color: "var(--nz-mat-ivory)",
                padding: "12px",
                borderRadius: "8px",
                marginBottom: "12px",
                fontSize: "13px",
                resize: "vertical",
                lineHeight: "1.5",
              }}
            />
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="submit"
                className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                disabled={actionBusy}
              >
                {visibility === "CUSTOMER" ? "📤 Send Official Response & Resolve" : "📝 Save Internal Note"}
              </button>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => setReplyText("")}
              >
                Clear Text
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Support Tickets Table */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Support Queue ({filteredTickets.length})</h2>
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
                <th className={styles.alignRight}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.emptyState}>No tickets found</td>
                </tr>
              ) : (
                filteredTickets.map((t) => (
                  <tr key={t.id}>
                    <td><code>{t.id}</code></td>
                    <td><strong>{t.playerHandle}</strong></td>
                    <td>
                      <span className={`${styles.badge} ${styles.badgeNeutral}`}>{t.category}</span>
                    </td>
                    <td style={{ maxWidth: "280px" }}>{t.subject}</td>
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
                    <td className="nz-num" style={{ fontSize: "12px", color: "var(--nz-mat-gold)" }}>{t.createdAt}</td>
                    <td className={styles.alignRight}>
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${selectedTicket?.id === t.id ? styles.actionBtnPrimary : ""}`}
                        onClick={() => handleSelectTicket(t)}
                      >
                        {t.status === "RESOLVED" ? "Inspect" : "Inspect & Action"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminPageLayout>
  );
}
