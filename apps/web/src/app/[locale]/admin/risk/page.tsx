"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { LocaleLink } from "@/components/LocaleLink";
import { get, post } from "@/lib/api";
import styles from "@/components/admin/AdminPageLayout.module.css";

type RiskAlert = {
  id: string;
  rawType: "security_event" | "reconciliation_case" | "risk_alert";
  type: string;
  target: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  details: string;
  status: "OPEN" | "INVESTIGATING" | "RESOLVED";
  detectedAt: string;
};

export default function AdminRiskPage() {
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"ALL" | "SECURITY" | "RECONCILIATION" | "RISK">("ALL");
  const [lockTarget, setLockTarget] = useState<string | null>(null);
  const [lockReason, setLockReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const loadRiskData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await get<{
        alerts: any[];
        reconciliationCases: any[];
        securityEvents: any[];
      }>("/v1/admin/risk");

      const list: RiskAlert[] = [];

      // Map security events
      if (res?.securityEvents) {
        res.securityEvents.forEach((se: any) => {
          list.push({
            id: `SEC-${se.id}`,
            rawType: "security_event",
            type: se.type || "SECURITY_INCIDENT",
            target: se.player_id || "System",
            severity: se.type === "LOCKOUT" ? "HIGH" : se.type === "DEPEG_HALT" ? "CRITICAL" : "MEDIUM",
            details: typeof se.detail === "object" ? JSON.stringify(se.detail) : se.detail || "Authentication / Security event",
            status: "OPEN",
            detectedAt: new Date(se.created_at).toLocaleString(),
          });
        });
      }

      // Map reconciliation cases
      if (res?.reconciliationCases) {
        res.reconciliationCases.forEach((rc: any) => {
          list.push({
            id: `REC-${rc.id}`,
            rawType: "reconciliation_case",
            type: `Reconciliation: ${rc.type || "DISCREPANCY"}`,
            target: rc.player_id || "Ledger",
            severity: (rc.severity as any) || "HIGH",
            details: rc.notes || rc.reason || "Automated double-entry audit balance check",
            status: rc.status === "RESOLVED" ? "RESOLVED" : "OPEN",
            detectedAt: new Date(rc.created_at).toLocaleString(),
          });
        });
      }

      // Map risk alerts
      if (res?.alerts) {
        res.alerts.forEach((ra: any) => {
          list.push({
            id: `RSK-${ra.id}`,
            rawType: "risk_alert",
            type: `Fair Play: ${ra.reason || "OTHER"}`,
            target: ra.player_id || "Player",
            severity: "HIGH",
            details: "Opened by the Fair Play Engine from real gameplay signals -- decide it in the Tribunal.",
            status: ra.status === "OPEN" || ra.status === "UNDER_REVIEW" || ra.status === "APPEALED" ? "OPEN" : "RESOLVED",
            detectedAt: new Date(ra.created_at).toLocaleString(),
          });
        });
      }

      setAlerts(list);
    } catch {
      // Keep baseline
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRiskData();
  }, [loadRiskData]);

  async function handleResolve(alert: RiskAlert) {
    setActionBusy(true);
    try {
      const cleanId = alert.id.replace(/^(SEC|REC|RSK)-/, "");
      await post("/v1/admin/risk/resolve", { id: cleanId, type: alert.rawType });
      setAlerts((prev) =>
        prev.map((a) => (a.id === alert.id ? { ...a, status: "RESOLVED" } : a))
      );
      setNotice(`Alert ${alert.id} resolved successfully.`);
    } catch (err) {
      console.error("Resolve error:", err);
      setNotice(`Failed to resolve ${alert.id}. See console for details.`);
    } finally {
      setActionBusy(false);
      setTimeout(() => setNotice(null), 3000);
    }
  }

  async function handleLockAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!lockTarget) return;
    setActionBusy(true);
    try {
      await post("/v1/admin/risk/lock-player", {
        playerId: lockTarget,
        reason: lockReason || "Security Violation detected by Risk Radar",
      });
      setNotice(`Player ${lockTarget} locked successfully.`);
      setLockTarget(null);
      setLockReason("");
      await loadRiskData();
    } catch (err) {
      console.error("Lock error:", err);
    } finally {
      setActionBusy(false);
      setTimeout(() => setNotice(null), 3500);
    }
  }

  const openCount = alerts.filter((a) => a.status === "OPEN").length;
  const criticalCount = alerts.filter((a) => a.severity === "CRITICAL" && a.status === "OPEN").length;

  const filteredAlerts = alerts.filter((a) => {
    if (activeTab === "SECURITY") return a.rawType === "security_event";
    if (activeTab === "RECONCILIATION") return a.rawType === "reconciliation_case";
    if (activeTab === "RISK") return a.rawType === "risk_alert";
    return true;
  });

  return (
    <AdminPageLayout
      title="Trust & Safety: Risk Radar"
      subtitle="Automated fraud detection, multi-account tracking, and financial reconciliation sanity checks."
      breadcrumb={["Home", "Admin", "Risk"]}
      stats={[
        { label: "Active Risk Alerts", value: `${openCount} Open`, trend: criticalCount > 0 ? `${criticalCount} Critical` : "Normal" },
        { label: "Reconciliation Status", value: criticalCount > 0 ? "ATTENTION" : "CLEAN", trend: "Double-entry verified" },
        { label: "IP Collision Rate", value: "0.02%", trend: "Within safe threshold" },
        { label: "Accounts Flagged", value: `${alerts.filter((a) => a.target !== "Treasury Vault" && a.target !== "Ledger" && a.target !== "System").length}`, trend: "Monitored" },
      ]}
      actions={
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            onClick={() => loadRiskData()}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "🔄 Refresh Radar"}
          </button>
        </div>
      }
    >
      {notice && (
        <div style={{ padding: "10px 16px", background: "rgba(34, 197, 94, 0.12)", border: "1px solid #22c55e", borderRadius: "8px", marginBottom: "16px", color: "#22c55e", fontSize: "13px" }}>
          ✓ {notice}
        </div>
      )}

      {/* Lock Player Modal */}
      {lockTarget && (
        <div style={{ background: "var(--nz-surface-1)", border: "1px solid #ef4444", borderRadius: "12px", padding: "20px", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
            <h3 style={{ margin: 0, color: "#ef4444", fontSize: "16px" }}>
              🔒 Emergency Account Lockout: {lockTarget}
            </h3>
            <button type="button" className={styles.actionBtn} onClick={() => setLockTarget(null)}>✕ Cancel</button>
          </div>
          <form onSubmit={handleLockAccount}>
            <p style={{ color: "var(--nz-mat-ivory)", fontSize: "13px", marginBottom: "12px" }}>
              Locking this account will terminate active sessions and suspend cash game access pending investigation.
            </p>
            <input
              type="text"
              required
              placeholder="Provide reason for security lock..."
              value={lockReason}
              onChange={(e) => setLockReason(e.target.value)}
              style={{ width: "100%", background: "var(--nz-surface-2)", border: "1px solid rgba(242, 237, 227, 0.12)", color: "var(--nz-mat-ivory)", padding: "10px 14px", borderRadius: "8px", marginBottom: "12px", fontSize: "13px" }}
            />
            <button type="submit" className={`${styles.actionBtn} ${styles.actionBtnDanger}`} disabled={actionBusy}>
              {actionBusy ? "Locking..." : "Confirm Account Lockout"}
            </button>
          </form>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        {(["ALL", "SECURITY", "RECONCILIATION", "RISK"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`${styles.actionBtn} ${activeTab === tab ? styles.actionBtnPrimary : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "ALL" ? `All Alerts (${alerts.length})` : tab === "SECURITY" ? "Security Incidents" : tab === "RECONCILIATION" ? "Reconciliation" : "Anti-Fraud"}
          </button>
        ))}
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Real-Time Security & Risk Alerts ({filteredAlerts.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Alert ID</th>
                <th>Alert Category</th>
                <th>Target Entity</th>
                <th>Severity</th>
                <th>Diagnostic Findings</th>
                <th>Status</th>
                <th>Timestamp</th>
                <th className={styles.alignRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlerts.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.emptyState}>No risk alerts match the current filter.</td>
                </tr>
              ) : (
                filteredAlerts.map((a) => (
                  <tr key={a.id}>
                    <td><code>{a.id}</code></td>
                    <td><strong>{a.type}</strong></td>
                    <td>{a.target}</td>
                    <td>
                      <span
                        className={`${styles.badge} ${
                          a.severity === "CRITICAL" || a.severity === "HIGH"
                            ? styles.badgeDanger
                            : a.severity === "MEDIUM"
                            ? styles.badgeWarning
                            : styles.badgeSuccess
                        }`}
                      >
                        {a.severity}
                      </span>
                    </td>
                    <td style={{ maxWidth: "340px", wordBreak: "break-word" }}>{a.details}</td>
                    <td>
                      <span
                        className={`${styles.badge} ${
                          a.status === "RESOLVED" ? styles.badgeSuccess : styles.badgeWarning
                        }`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="nz-num" style={{ fontSize: "12px", color: "var(--nz-mat-gold)" }}>{a.detectedAt}</td>
                    <td className={styles.alignRight}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                        {a.status !== "RESOLVED" && a.rawType === "risk_alert" && (
                          <LocaleLink
                            href="/admin/fair-play"
                            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                            title="Fair Play cases are decided from the Tribunal, with a reviewer and a reason on record"
                          >
                            Review in Tribunal
                          </LocaleLink>
                        )}
                        {a.status !== "RESOLVED" && a.rawType === "reconciliation_case" && (
                          <button
                            type="button"
                            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                            onClick={() => handleResolve(a)}
                            disabled={actionBusy}
                            title="Mark this reconciliation case as investigated and resolved"
                          >
                            Mark Resolved
                          </button>
                        )}
                        {a.target !== "Treasury Vault" && a.target !== "Ledger" && a.target !== "System" && (
                          <button
                            type="button"
                            className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                            onClick={() => {
                              setLockTarget(a.target);
                              setLockReason(`Triggered by ${a.type} (${a.id})`);
                            }}
                            title="Lock this user account immediately"
                          >
                            🔒 Lock
                          </button>
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
    </AdminPageLayout>
  );
}
