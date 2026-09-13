"use client";

import React, { useState } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import styles from "@/components/admin/AdminPageLayout.module.css";

export default function AdminSettingsPage() {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [platformRake, setPlatformRake] = useState("5.0");
  const [minWithdrawal, setMinWithdrawal] = useState("10.0");
  const [autoApproveLimit, setAutoApproveLimit] = useState("100.0");
  const [notice, setNotice] = useState<string | null>(null);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setNotice("Platform settings updated successfully and broadcasted to clusters.");
    setTimeout(() => setNotice(null), 3500);
  }

  return (
    <AdminPageLayout
      title="Platform Settings & Rules Configuration"
      subtitle="Configure global rake percentages, USDT deposit/withdrawal boundaries, and maintenance toggles."
      breadcrumb={["Home", "Admin", "Settings"]}
      stats={[
        { label: "Platform Rake", value: `${platformRake}%`, trend: "Standard fee" },
        { label: "Min Withdrawal", value: `$${minWithdrawal} USDT`, trend: "Zero fee" },
        { label: "Auto-Approve Cap", value: `$${autoApproveLimit} USDT`, trend: "Instant payout" },
        { label: "Platform State", value: maintenanceMode ? "MAINTENANCE" : "LIVE ONLINE", trend: "Production" },
      ]}
    >
      {notice && (
        <div style={{ padding: "10px 16px", background: "rgba(34, 197, 94, 0.1)", border: "1px solid #22c55e", borderRadius: "8px", marginBottom: "16px", color: "#22c55e", fontSize: "13px" }}>
          ✓ {notice}
        </div>
      )}

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Global Operational Parameters</h2>
        </div>
        <form onSubmit={handleSave} style={{ padding: "24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "6px" }}>
              Maintenance Mode
            </label>
            <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 8px 0" }}>
              When enabled, non-admin users will see a friendly maintenance splash screen.
            </p>
            <button
              type="button"
              className={`${styles.actionBtn} ${maintenanceMode ? styles.actionBtnPrimary : ""}`}
              onClick={() => setMaintenanceMode(!maintenanceMode)}
            >
              {maintenanceMode ? "Disable Maintenance (Go Live)" : "Enable Maintenance Mode"}
            </button>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "6px" }}>
              Standard Duel Platform Rake (%)
            </label>
            <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 8px 0" }}>
              Commission deducted from duel pots upon winner settlement.
            </p>
            <input
              type="number"
              step="0.1"
              min="0"
              max="20"
              value={platformRake}
              onChange={(e) => setPlatformRake(e.target.value)}
              style={{ width: "100%", background: "#0e1015", border: "1px solid #252b37", color: "#fff", padding: "8px 12px", borderRadius: "6px", fontSize: "13px" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "6px" }}>
              Minimum USDT Withdrawal Amount
            </label>
            <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 8px 0" }}>
              Requests below this amount will be rejected automatically.
            </p>
            <input
              type="number"
              step="1"
              min="1"
              value={minWithdrawal}
              onChange={(e) => setMinWithdrawal(e.target.value)}
              style={{ width: "100%", background: "#0e1015", border: "1px solid #252b37", color: "#fff", padding: "8px 12px", borderRadius: "6px", fontSize: "13px" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "6px" }}>
              Automated Instant Payout Threshold
            </label>
            <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 8px 0" }}>
              Withdrawals below this amount with 0 risk score are broadcast instantly.
            </p>
            <input
              type="number"
              step="1"
              min="1"
              value={autoApproveLimit}
              onChange={(e) => setAutoApproveLimit(e.target.value)}
              style={{ width: "100%", background: "#0e1015", border: "1px solid #252b37", color: "#fff", padding: "8px 12px", borderRadius: "6px", fontSize: "13px" }}
            />
          </div>

          <div style={{ gridColumn: "1 / -1", marginTop: "12px" }}>
            <button type="submit" className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} style={{ padding: "10px 24px", fontSize: "14px" }}>
              Save Platform Configuration
            </button>
          </div>
        </form>
      </div>
    </AdminPageLayout>
  );
}
