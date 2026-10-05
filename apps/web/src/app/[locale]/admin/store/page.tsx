"use client";

import React, { useState, useEffect } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { get } from "@/lib/api";
import styles from "@/components/admin/AdminPageLayout.module.css";

type StoreItem = {
  id: string;
  name: string;
  category: "AVATAR_FRAME" | "BOARD_THEME" | "PIECE_SKIN" | "VICTORY_EMOTE";
  priceUsdt: string;
  salesCount: number;
  status: "ACTIVE" | "ARCHIVED";
};

type StoreData = {
  stats: {
    activeItems: number;
    totalRevenueUsdt: string;
    bestSeller: string;
    refundRate: string;
  };
  items: StoreItem[];
};

export default function AdminStorePage() {
  const [data, setData] = useState<StoreData>({
    stats: {
      activeItems: 0,
      totalRevenueUsdt: "0.00",
      bestSeller: "None yet",
      refundRate: "0.00%",
    },
    items: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await get<StoreData>("/v1/admin/store");
        if (mounted && res && res.stats) {
          setData(res);
        }
      } catch (err) {
        console.error("Failed to load real store data:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const stats = data.stats;
  const items = data.items;

  return (
    <AdminPageLayout
      title="Store & Virtual Goods Inventory"
      subtitle="Manage cosmetic assets, premium board themes, avatar frames, and collectible piece sets with real-time dynamic inventory."
      breadcrumb={["Home", "Admin", "Store"]}
      stats={[
        { label: "Active Catalog Items", value: `${stats.activeItems} Items`, trend: "Dynamic catalog" },
        { label: "Total Store Revenue", value: `$${stats.totalRevenueUsdt}`, trend: "USDT" },
        { label: "Best Seller", value: stats.bestSeller, trend: "Purchases" },
        { label: "Refund Rate", value: stats.refundRate, trend: "Instant cosmetic unlock" },
      ]}
    >
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Cosmetic Items Directory ({items.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Item ID</th>
                <th>Item Name</th>
                <th>Category</th>
                <th>Price (USDT)</th>
                <th>Total Purchases</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "var(--nz-text-3)" }}>
                    {loading ? "Loading store catalog..." : "No cosmetic items currently in directory."}
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id}>
                    <td><code>{it.id}</code></td>
                    <td><strong>{it.name}</strong></td>
                    <td><span className={`${styles.badge} ${styles.badgeNeutral}`}>{it.category}</span></td>
                    <td className="nz-num" style={{ fontWeight: 700 }}>${it.priceUsdt}</td>
                    <td className="nz-num">{it.salesCount}</td>
                    <td>
                      <span className={`${styles.badge} ${styles.badgeSuccess}`}>{it.status}</span>
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
