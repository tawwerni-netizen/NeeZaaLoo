"use client";

import React, { useState, useEffect } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { Button } from "@/components/Button";
import styles from "@/components/admin/AdminPageLayout.module.css";

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    loadPlayers();
  }, [search]);

  async function loadPlayers() {
    try {
      const res = await fetch(`/v1/admin/players?q=${search}`);
      const data = await res.json();
      if (data.players) setPlayers(data.players);
    } catch (e) {
      console.error(e);
    }
  }

  async function promoteUser(id: string) {
    if (!window.confirm("Are you sure you want to promote this user to Admin?")) return;
    try {
      await fetch(`/v1/admin/players/${id}/promote`, { method: "POST" });
      setActionNotice("User promoted to Admin successfully!");
      setTimeout(() => setActionNotice(null), 3000);
      loadPlayers();
    } catch (e) {
      alert("Failed to promote user");
    }
  }

  return (
    <AdminPageLayout
      title="User Management"
      breadcrumb={["Admin", "Players"]}
    >
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <input
            type="search"
            placeholder="Search by handle..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {actionNotice && (
        <div style={{ padding: 16, background: 'var(--accent-green-muted)', color: 'var(--accent-green)', borderRadius: 8, marginBottom: 16 }}>
          {actionNotice}
        </div>
      )}

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Handle</th>
              <th>Joined At</th>
              <th>Roles</th>
              <th className={styles.alignRight}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {players.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.emptyState}>No players found</td>
              </tr>
            ) : (
              players.map((p) => (
                <tr key={p.id}>
                  <td className="nz-num">{p.id.split('_')[1] || p.id}</td>
                  <td className={styles.strongCell}>{p.handle}</td>
                  <td className="nz-num">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td>
                    {p.roles?.includes('ADMIN') || p.roles?.includes('SUPER_ADMIN') ? (
                      <span className={styles.statusBadge} data-status="ACTIVE">Admin</span>
                    ) : (
                      <span className={styles.statusBadge} data-status="PENDING">Player</span>
                    )}
                  </td>
                  <td className={styles.alignRight}>
                    {!(p.roles?.includes('ADMIN') || p.roles?.includes('SUPER_ADMIN')) && (
                      <Button variant="ghost" onClick={() => promoteUser(p.id)}>
                        Promote to Admin
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminPageLayout>
  );
}
