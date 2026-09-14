"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { Button } from "@/components/Button";
import { get, post } from "@/lib/api";
import styles from "@/components/admin/AdminPageLayout.module.css";

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const loadPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const q = encodeURIComponent(search.trim());
      const data = await get<{ players: any[] }>(`/v1/admin/players${q ? `?q=${q}` : ""}`);
      if (data.players) setPlayers(data.players);
    } catch (e) {
      console.error("Failed to load players:", e);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPlayers();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadPlayers]);

  async function promoteUser(id: string) {
    if (!window.confirm("Are you sure you want to promote this user to Admin?")) return;
    try {
      await post(`/v1/admin/players/${id}/promote`);
      setActionNotice("User promoted to Admin successfully!");
      setTimeout(() => setActionNotice(null), 3000);
      loadPlayers();
    } catch (e) {
      alert("Failed to promote user");
    }
  }

  async function demoteUser(id: string) {
    if (!window.confirm("Are you sure you want to demote this user from Admin?")) return;
    try {
      await post(`/v1/admin/players/${id}/demote`);
      setActionNotice("User demoted successfully!");
      setTimeout(() => setActionNotice(null), 3000);
      loadPlayers();
    } catch (e) {
      alert("Failed to demote user");
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
                    {!(p.roles?.includes('ADMIN') || p.roles?.includes('SUPER_ADMIN')) ? (
                      <Button variant="ghost" onClick={() => promoteUser(p.id)}>
                        Promote to Admin
                      </Button>
                    ) : p.roles?.includes('ADMIN') && !p.roles?.includes('SUPER_ADMIN') ? (
                      <Button variant="ghost" onClick={() => demoteUser(p.id)}>
                        Demote Admin
                      </Button>
                    ) : (
                      <span style={{ fontSize: "11px", color: "var(--nz-text-3)" }}>Super Admin</span>
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
