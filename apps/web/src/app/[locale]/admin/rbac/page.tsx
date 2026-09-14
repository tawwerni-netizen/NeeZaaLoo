"use client";

import React, { useState, useEffect } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { get } from "@/lib/api";
import styles from "@/components/admin/AdminPageLayout.module.css";

type AdminUser = {
  id: string;
  email: string;
  display_name: string;
  mfa_enrolled: boolean;
  disabled_at: string | null;
  created_at: string;
  roles?: string[];
};

export default function AdminRbacPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get<{ admins: AdminUser[] }>("/v1/admin/rbac")
      .then((res) => {
        if (res?.admins) setAdmins(res.admins);
      })
      .catch((err) => console.error("Failed to load RBAC staff:", err))
      .finally(() => setLoading(false));
  }, []);

  const superAdminCount = admins.filter((a) => a.roles?.includes("SUPER_ADMIN")).length;
  const activeCount = admins.filter((a) => !a.disabled_at).length;
  const mfaEnrolledCount = admins.filter((a) => a.mfa_enrolled).length;

  return (
    <AdminPageLayout
      title="RBAC & Administrative Access Control"
      subtitle="Manage team capabilities, multi-signature permissions, 2FA enforcement, and session logs."
      breadcrumb={["Home", "Admin", "RBAC"]}
      stats={[
        { label: "Active Staff", value: `${activeCount} Officers`, trend: `${mfaEnrolledCount}/${admins.length || 1} 2FA Enforced` },
        { label: "Super Admins", value: `${superAdminCount} Account(s)`, trend: "Full root access" },
        { label: "Role Separation", value: "Strict", trend: "Least-privilege policy" },
        { label: "Status", value: loading ? "Loading..." : "Live", trend: "Synchronized with DB" },
      ]}
    >
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Staff Directory & Capability Assignments ({admins.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Officer Handle</th>
                <th>Email</th>
                <th>Assigned Role</th>
                <th>2FA Security</th>
                <th>Created At</th>
                <th>Access Status</th>
              </tr>
            </thead>
            <tbody>
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "24px", color: "var(--nz-text-3)" }}>
                    {loading ? "Loading staff directory..." : "No admin users found."}
                  </td>
                </tr>
              ) : (
                admins.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.display_name || s.id}</strong></td>
                    <td style={{ fontSize: "13px", color: "var(--nz-text-2)" }}>{s.email}</td>
                    <td>
                      <span
                        className={`${styles.badge} ${
                          s.roles?.includes("SUPER_ADMIN")
                            ? styles.badgeDanger
                            : styles.badgeInfo
                        }`}
                      >
                        {s.roles?.join(", ") || "ADMIN"}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${s.mfa_enrolled ? styles.badgeSuccess : styles.badgeWarning}`}>
                        {s.mfa_enrolled ? "2FA Active" : "2FA Pending"}
                      </span>
                    </td>
                    <td style={{ fontSize: "13px" }}>{new Date(s.created_at).toLocaleDateString()}</td>
                    <td>
                      <span className={`${styles.badge} ${!s.disabled_at ? styles.badgeSuccess : styles.badgeDanger}`}>
                        {!s.disabled_at ? "ACTIVE" : "DISABLED"}
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
