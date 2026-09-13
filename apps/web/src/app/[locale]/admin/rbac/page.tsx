"use client";

import React, { useState } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import styles from "@/components/admin/AdminPageLayout.module.css";

type StaffUser = {
  handle: string;
  role: "SUPER_ADMIN" | "FINANCE_OFFICER" | "FAIR_PLAY_OFFICER" | "SUPPORT_AGENT";
  twoFactorEnabled: boolean;
  lastLogin: string;
  status: "ACTIVE" | "REVOKED";
};

const INITIAL_STAFF: StaffUser[] = [
  { handle: "root", role: "SUPER_ADMIN", twoFactorEnabled: true, lastLogin: "Just now", status: "ACTIVE" },
  { handle: "finance_lead", role: "FINANCE_OFFICER", twoFactorEnabled: true, lastLogin: "2 hours ago", status: "ACTIVE" },
  { handle: "judge_alex", role: "FAIR_PLAY_OFFICER", twoFactorEnabled: true, lastLogin: "Yesterday", status: "ACTIVE" },
  { handle: "support_sarah", role: "SUPPORT_AGENT", twoFactorEnabled: true, lastLogin: "Today, 10:00 UTC", status: "ACTIVE" },
];

export default function AdminRbacPage() {
  const [staff] = useState<StaffUser[]>(INITIAL_STAFF);

  return (
    <AdminPageLayout
      title="RBAC & Administrative Access Control"
      subtitle="Manage team capabilities, multi-signature permissions, 2FA enforcement, and session logs."
      breadcrumb={["Home", "Admin", "RBAC"]}
      stats={[
        { label: "Active Staff", value: "4 Officers", trend: "100% 2FA Enforced" },
        { label: "Super Admins", value: "1 Account", trend: "Full root" },
        { label: "Role Separation", value: "Strict", trend: "Least-privilege policy" },
        { label: "Failed Staff Logins", value: "0", trend: "Clean audit" },
      ]}
    >
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Staff Directory & Capability Assignments ({staff.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Officer Handle</th>
                <th>Assigned Role</th>
                <th>2FA Security</th>
                <th>Last Active Session</th>
                <th>Access Status</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.handle}>
                  <td><strong>{s.handle}</strong></td>
                  <td>
                    <span
                      className={`${styles.badge} ${
                        s.role === "SUPER_ADMIN"
                          ? styles.badgeDanger
                          : s.role === "FINANCE_OFFICER"
                          ? styles.badgeWarning
                          : styles.badgeNeutral
                      }`}
                    >
                      {s.role}
                    </span>
                  </td>
                  <td>
                    <span style={{ color: "#22c55e", fontWeight: 600 }}>✓ TOTP Active</span>
                  </td>
                  <td className="nz-num">{s.lastLogin}</td>
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
