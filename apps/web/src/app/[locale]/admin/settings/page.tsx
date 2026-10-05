"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { get, post, ApiError } from "@/lib/api";
import styles from "@/components/admin/AdminPageLayout.module.css";

interface SettingsResponse {
  ok: boolean;
  platformRake: string;
  rakeBps: number;
  maintenanceMode: boolean;
  minWithdrawal: string;
  minDeposit: string;
  autoApproveLimit: string;
}

export default function AdminSettingsPage() {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [platformRake, setPlatformRake] = useState("12.0");
  const [minWithdrawal, setMinWithdrawal] = useState("10.0");
  const [minDeposit, setMinDeposit] = useState("5.0");
  const [autoApproveLimit, setAutoApproveLimit] = useState("100.0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await get<SettingsResponse>("/v1/admin/settings");
      if (res.ok) {
        setPlatformRake(res.platformRake || "12.0");
        setMaintenanceMode(Boolean(res.maintenanceMode));
        if (res.minWithdrawal) setMinWithdrawal(res.minWithdrawal);
        if (res.minDeposit) setMinDeposit(res.minDeposit);
        if (res.autoApproveLimit) setAutoApproveLimit(res.autoApproveLimit);
      }
    } catch (e: any) {
      console.error("Failed to load settings:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      await post("/v1/admin/settings", {
        platformRake,
        maintenanceMode,
        minWithdrawal,
        minDeposit,
        autoApproveLimit,
      });
      setNotice({
        type: "success",
        message: `تم حفظ الإعدادات بنجاح! نسبة الربح للمنصة: ${platformRake}% (${Math.round(parseFloat(platformRake) * 100)} bps). الحد الأدنى للسحب: $${minWithdrawal}، الإيداع: $${minDeposit}.`,
      });
      await fetchSettings();
    } catch (err) {
      setNotice({
        type: "error",
        message: err instanceof ApiError ? err.message : "فشل حفظ الإعدادات",
      });
    } finally {
      setSaving(false);
      setTimeout(() => setNotice(null), 5000);
    }
  }

  return (
    <AdminPageLayout
      title="Platform Settings & Rules Configuration"
      subtitle="Configure global rake percentages, deposit/withdrawal boundaries across all currencies, and maintenance toggles."
      breadcrumb={["Home", "Admin", "Settings"]}
      stats={[
        { label: "Platform Rake", value: `${platformRake}%`, trend: `${100 - parseFloat(platformRake || "0")}% to Winner Pool` },
        { label: "Min Deposit", value: `$${minDeposit} USD`, trend: "All currencies" },
        { label: "Min Withdrawal", value: `$${minWithdrawal} USD`, trend: "All currencies" },
        { label: "Platform State", value: maintenanceMode ? "MAINTENANCE" : "LIVE ONLINE", trend: "Production" },
      ]}
    >
      {notice && (
        <div
          style={{
            padding: "12px 18px",
            background: notice.type === "success" ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
            border: `1px solid ${notice.type === "success" ? "#22c55e" : "#ef4444"}`,
            borderRadius: "8px",
            marginBottom: "16px",
            color: notice.type === "success" ? "#22c55e" : "#ef4444",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          {notice.type === "success" ? "✓" : "⚠️"} {notice.message}
        </div>
      )}

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Global Operational Parameters</h2>
          {loading && <span style={{ fontSize: "12px", color: "#94a3b8" }}>جاري مزامنة الإعدادات...</span>}
        </div>
        <form onSubmit={handleSave} style={{ padding: "24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "6px" }}>
              Maintenance Mode (وضع الصيانة العام)
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
              Standard Duel Platform Rake (%) — نسبة ربح المنصة
            </label>
            <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 8px 0" }}>
              النسبة الحالية المطبقة رسمياً: <strong>{platformRake}%</strong> (يذهب الباقي {100 - parseFloat(platformRake || "0")}% للفائز).
            </p>
            <input
              type="number"
              step="0.1"
              min="0"
              max="50"
              value={platformRake}
              onChange={(e) => setPlatformRake(e.target.value)}
              style={{ width: "100%", background: "#0e1015", border: "1px solid #252b37", color: "#fff", padding: "8px 12px", borderRadius: "6px", fontSize: "13px" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "6px" }}>
              Minimum Deposit Amount ($) — الحد الأدنى للإيداع
            </label>
            <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 8px 0" }}>
              يطبق كحد أدنى للإيداع المقبول عبر جميع العملات والشبكات ($5 افتراضياً).
            </p>
            <input
              type="number"
              step="1"
              min="1"
              value={minDeposit}
              onChange={(e) => setMinDeposit(e.target.value)}
              style={{ width: "100%", background: "#0e1015", border: "1px solid #252b37", color: "#fff", padding: "8px 12px", borderRadius: "6px", fontSize: "13px" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "6px" }}>
              Minimum Withdrawal Amount ($) — الحد الأدنى للسحب
            </label>
            <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 8px 0" }}>
              طلبات السحب الأقل من هذا المبلغ ترفض تلقائياً عبر جميع العملات والشبكات ($10 افتراضياً).
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
              Automated Instant Payout Threshold ($)
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
            <button
              type="submit"
              disabled={saving}
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              style={{ padding: "10px 24px", fontSize: "14px" }}
            >
              {saving ? "جاري الحفظ والمزامنة..." : "Save Platform Configuration"}
            </button>
          </div>
        </form>
      </div>
    </AdminPageLayout>
  );
}
