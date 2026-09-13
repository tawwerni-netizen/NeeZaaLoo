"use client";

import React, { useState } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import styles from "@/components/admin/AdminPageLayout.module.css";

type RiskAlert = {
  id: string;
  type: string;
  target: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  details: string;
  status: "OPEN" | "INVESTIGATING" | "RESOLVED";
  detectedAt: string;
};

const INITIAL_ALERTS: RiskAlert[] = [
  { id: "RSK-901", type: "Multiple Account IP Match", target: "SuspiciousBot9 & AltBot2", severity: "HIGH", details: "Same residential IP and hardware fingerprint detected in cash duel", status: "OPEN", detectedAt: "10 mins ago" },
  { id: "RSK-902", type: "Abnormal Win Streak", target: "DominoKingAlex", severity: "LOW", details: "14 consecutive wins in Dominoes; timing patterns within normal human variance", status: "RESOLVED", detectedAt: "2 hours ago" },
  { id: "RSK-903", type: "Ledger Solvency Sanity Check", target: "USDT Custody Vault", severity: "LOW", details: "Audited ledger 100% balanced; reserve ratio 108%", status: "RESOLVED", detectedAt: "Daily Run" },
];

export default function AdminRiskPage() {
  const [alerts, setAlerts] = useState<RiskAlert[]>(INITIAL_ALERTS);

  function resolveAlert(id: string) {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "RESOLVED" } : a))
    );
  }

  return (
    <AdminPageLayout
      title="Trust & Safety: Risk Radar"
      subtitle="Automated fraud detection, multi-account graph tracking, and financial reconciliation sanity checks."
      breadcrumb={["Home", "Admin", "Risk"]}
      stats={[
        { label: "Active Risk Alerts", value: "1 Open", trend: "1 High Severity" },
        { label: "Reconciliation Status", value: "CLEAN", trend: "Double-entry verified" },
        { label: "IP Collision Rate", value: "0.04%", trend: "Within normal limits" },
        { label: "Accounts Under Review", value: "2", trend: "Funds held safely" },
      ]}
    >
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Real-Time Security & Risk Alerts ({alerts.length})</h2>
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
                <th>Time</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
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
                  <td>{a.details}</td>
                  <td>
                    <span
                      className={`${styles.badge} ${
                        a.status === "RESOLVED" ? styles.badgeSuccess : styles.badgeWarning
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="nz-num">{a.detectedAt}</td>
                  <td>
                    {a.status !== "RESOLVED" ? (
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                        onClick={() => resolveAlert(a.id)}
                      >
                        Mark Resolved
                      </button>
                    ) : (
                      <span style={{ color: "#64748b", fontSize: "12px" }}>Closed</span>
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
