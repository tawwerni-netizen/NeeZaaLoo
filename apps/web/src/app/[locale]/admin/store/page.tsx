"use client";

import React, { useState } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import styles from "@/components/admin/AdminPageLayout.module.css";

type StoreItem = {
  id: string;
  name: string;
  category: "AVATAR_FRAME" | "BOARD_THEME" | "PIECE_SKIN" | "VICTORY_EMOTE";
  priceUsdt: string;
  salesCount: number;
  status: "ACTIVE" | "ARCHIVED";
};

const INITIAL_ITEMS: StoreItem[] = [
  { id: "itm_01", name: "Cyber Obsidian Chess Pieces", category: "PIECE_SKIN", priceUsdt: "15.00", salesCount: 312, status: "ACTIVE" },
  { id: "itm_02", name: "Grandmaster Gold Avatar Frame", category: "AVATAR_FRAME", priceUsdt: "25.00", salesCount: 184, status: "ACTIVE" },
  { id: "itm_03", name: "Emerald Felt Backgammon Board", category: "BOARD_THEME", priceUsdt: "20.00", salesCount: 145, status: "ACTIVE" },
  { id: "itm_04", name: "Royal Crown Victory Emote", category: "VICTORY_EMOTE", priceUsdt: "5.00", salesCount: 520, status: "ACTIVE" },
];

export default function AdminStorePage() {
  const [items] = useState<StoreItem[]>(INITIAL_ITEMS);

  return (
    <AdminPageLayout
      title="Store & Virtual Goods Inventory"
      subtitle="Manage cosmetic assets, premium board themes, avatar frames, and collectible piece sets."
      breadcrumb={["Home", "Admin", "Store"]}
      stats={[
        { label: "Active Catalog Items", value: "28 Items", trend: "Cosmetics only" },
        { label: "Total Store Revenue", value: "$18,420", trend: "USDT" },
        { label: "Best Seller", value: "Royal Crown Emote", trend: "520 purchases" },
        { label: "Refund Rate", value: "0.00%", trend: "Instant cosmetic unlock" },
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
              {items.map((it) => (
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminPageLayout>
  );
}
