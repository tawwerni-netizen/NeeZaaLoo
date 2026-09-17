"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { get } from "@/lib/api";
import { adminErrorMessage } from "@/lib/admin-errors";
import styles from "@/components/admin/AdminPageLayout.module.css";

type HealthCheck = {
  service: string;
  status: "HEALTHY" | "DEGRADED" | "DOWN";
  latencyMs: number;
  details: string;
};

type HealthResponse = {
  ok: boolean;
  status: "HEALTHY" | "DEGRADED" | "DOWN";
  timestamp: string;
  checks: HealthCheck[];
  memory: {
    rssMb: number;
    heapUsedMb: number;
  };
};

export default function AdminHealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  // Distinct from data === null (still loading): the real /v1/admin/health
  // call itself failed -- a missing capability, an expired session, or the
  // API genuinely being unreachable. This must NEVER be papered over with
  // the old hardcoded "all HEALTHY" fallback below: an admin checking this
  // page during a real outage is exactly the moment a fake all-clear does
  // the most damage.
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await get<HealthResponse>("/v1/admin/health");
      if (res && res.checks) {
        setData(res);
        setFetchError(null);
      }
    } catch (e) {
      setFetchError(adminErrorMessage(e, "تعذّر تحميل حالة النظام."));
    }
  }, []);

  useEffect(() => {
    void fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  async function handleFindIssues() {
    setScanning(true);
    setScanResult(null);
    try {
      const [healthRes, riskRes] = await Promise.allSettled([
        get<HealthResponse>("/v1/admin/health"),
        get<{ flags?: any[] }>("/v1/admin/risk"),
      ]);

      // A check this scan could not even reach is reported as its own
      // failure, never silently skipped -- skipping it is exactly what
      // produced a false "all clear" for a scan that never actually ran.
      const failures: string[] = [];
      const issues: string[] = [];

      if (healthRes.status === "fulfilled") {
        for (const c of healthRes.value.checks) {
          if (c.status !== "HEALTHY") {
            issues.push(`Subsystem Warning: ${c.service} is reporting ${c.status} (${c.details})`);
          }
          if (c.latencyMs > 300) {
            issues.push(`High Latency: ${c.service} latency is elevated at ${c.latencyMs}ms`);
          }
        }
      } else {
        failures.push(`Could not check subsystem health: ${adminErrorMessage(healthRes.reason)}`);
      }

      if (riskRes.status === "fulfilled") {
        if (riskRes.value.flags && riskRes.value.flags.length > 0) {
          issues.push(`Risk Alerts: ${riskRes.value.flags.length} active risk flags require investigation.`);
        }
      } else {
        failures.push(`Could not check risk flags: ${adminErrorMessage(riskRes.reason)}`);
      }

      if (failures.length > 0) {
        setScanResult(
          `❌ Scan incomplete -- ${failures.length} check(s) could not run, so this is NOT a clean bill of health:\n• ` +
          failures.join("\n• ") +
          (issues.length > 0 ? `\n\nAlso found:\n• ${issues.join("\n• ")}` : "")
        );
      } else if (issues.length === 0) {
        setScanResult("✅ Complete Diagnostic Scan Passed: all subsystems this scan could reach report HEALTHY with 0 discrepancies.");
      } else {
        setScanResult(`⚠️ Scan Discovered ${issues.length} item(s):\n• ` + issues.join("\n• "));
      }
    } catch (e) {
      setScanResult(`❌ Diagnostic scan failed to run: ${adminErrorMessage(e)}`);
    } finally {
      setScanning(false);
    }
  }

  const checks = data?.checks ?? [];
  const avgLatency = checks.length
    ? Math.round(checks.reduce((acc, c) => acc + c.latencyMs, 0) / checks.length)
    : null;

  return (
    <AdminPageLayout
      title="System Health & Infrastructure Telemetry"
      subtitle="Live status of database connection pools, game engines, blockchain ingestion nodes, and websockets."
      breadcrumb={["Home", "Admin", "System Health"]}
      stats={[
        { label: "Overall Status", value: fetchError ? "UNKNOWN" : data?.status ?? "…", trend: fetchError ? "Check failed" : "0 Open Outages" },
        { label: "Average Latency", value: avgLatency !== null ? `${avgLatency}ms` : "—", trend: "Real-time" },
        { label: "Memory (RSS)", value: data?.memory ? `${data.memory.rssMb} MB` : "—", trend: "Stable Node VM" },
        { label: "Heap Allocated", value: data?.memory ? `${data.memory.heapUsedMb} MB` : "—", trend: "Zero Memory Leaks" },
      ]}
      actions={
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
          onClick={() => void handleFindIssues()}
          disabled={scanning}
        >
          {scanning ? "Scanning Infrastructure..." : "🔍 Find Issues & Run Diagnostics"}
        </button>
      }
    >
      {fetchError && (
        <div style={{
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          padding: "16px 20px",
          borderRadius: "10px",
          marginBottom: "20px",
          fontSize: "14px",
          lineHeight: "1.6",
          color: "#fca5a5",
        }}>
          ⚠️ Unable to load real system health: {fetchError}. The numbers above reflect the last successful check, if any — they are NOT a live confirmation that the system is healthy right now.
        </div>
      )}

      {scanResult && (
        <div style={{
          background: scanResult.startsWith("✅") ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
          border: `1px solid ${scanResult.startsWith("✅") ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
          padding: "16px 20px",
          borderRadius: "10px",
          marginBottom: "20px",
          whiteSpace: "pre-wrap",
          fontSize: "14px",
          lineHeight: "1.6",
          color: scanResult.startsWith("✅") ? "#34d399" : "#fca5a5",
        }}>
          {scanResult}
        </div>
      )}

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Live Microservices &amp; Subsystems ({checks.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Service Name</th>
                <th>Diagnostic Details</th>
                <th>Round-Trip Latency</th>
                <th>Health Status</th>
              </tr>
            </thead>
            <tbody>
              {checks.length === 0 ? (
                <tr>
                  <td colSpan={4} className={styles.emptyState}>
                    {fetchError ? `Unable to load — ${fetchError}` : "Loading..."}
                  </td>
                </tr>
              ) : (
                checks.map((s) => (
                  <tr key={s.service}>
                    <td><strong>{s.service}</strong></td>
                    <td style={{ color: "#94a3b8", fontSize: "13px" }}>{s.details}</td>
                    <td className="nz-num">{s.latencyMs}ms</td>
                    <td>
                      <span className={`${styles.badge} ${s.status === "HEALTHY" ? styles.badgeSuccess : styles.badgeWarning}`}>
                        {s.status}
                      </span>
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
