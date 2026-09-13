"use client";

import React, { useState } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import styles from "@/components/admin/AdminPageLayout.module.css";

type ServiceHealth = {
  service: string;
  category: string;
  latencyMs: number;
  uptime: string;
  status: "HEALTHY" | "DEGRADED" | "DOWN";
};

const SERVICES: ServiceHealth[] = [
  { service: "PostgreSQL Primary Pool", category: "Database", latencyMs: 4, uptime: "99.99%", status: "HEALTHY" },
  { service: "Redis Cache & Pub/Sub", category: "Memory Cache", latencyMs: 1, uptime: "100%", status: "HEALTHY" },
  { service: "Duel Engine Matchmaker", category: "Core Engine", latencyMs: 12, uptime: "99.98%", status: "HEALTHY" },
  { service: "Fair Play & Anti-Cheat Engine", category: "Security", latencyMs: 18, uptime: "99.99%", status: "HEALTHY" },
  { service: "TRON (TRC20) Node Watcher", category: "Blockchain Ingestion", latencyMs: 45, uptime: "99.95%", status: "HEALTHY" },
  { service: "Ethereum (ERC20) RPC", category: "Blockchain Ingestion", latencyMs: 62, uptime: "99.91%", status: "HEALTHY" },
  { service: "Websocket Gateway Cluster", category: "Real-time", latencyMs: 8, uptime: "99.99%", status: "HEALTHY" },
];

export default function AdminHealthPage() {
  const [services] = useState<ServiceHealth[]>(SERVICES);

  return (
    <AdminPageLayout
      title="System Health & Infrastructure Telemetry"
      subtitle="Live status of database connection pools, game engines, blockchain ingestion nodes, and websockets."
      breadcrumb={["Home", "Admin", "System Health"]}
      stats={[
        { label: "Overall Status", value: "ALL SYSTEMS GO", trend: "0 Incidents" },
        { label: "Average API Latency", value: "18ms", trend: "Optimal" },
        { label: "DB Connection Pool", value: "14 / 80 Conns", trend: "18% capacity" },
        { label: "Memory Usage", value: "3.2 GB / 16 GB", trend: "Stable" },
      ]}
    >
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Microservices & Infrastructure Nodes ({services.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Service Name</th>
                <th>Subsystem</th>
                <th>Latency</th>
                <th>30-Day Uptime</th>
                <th>Health Status</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.service}>
                  <td><strong>{s.service}</strong></td>
                  <td><span className={`${styles.badge} ${styles.badgeNeutral}`}>{s.category}</span></td>
                  <td className="nz-num">{s.latencyMs}ms</td>
                  <td className="nz-num" style={{ color: "#22c55e", fontWeight: 700 }}>{s.uptime}</td>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeSuccess}`}>{s.status}</span>
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
