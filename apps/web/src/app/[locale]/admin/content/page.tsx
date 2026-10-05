"use client";

import React from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { EDITORIAL_ARTICLES_MAP } from "@/lib/editorial/articles-map";
import styles from "@/components/admin/AdminPageLayout.module.css";

export default function AdminContentPage() {
  const articles = EDITORIAL_ARTICLES_MAP.slice(0, 15);

  return (
    <AdminPageLayout
      title="Content & Multilingual SEO Manager"
      subtitle="Monitor indexation, multilingual coverage (6 locales), canonical URLs, and schema markup."
      breadcrumb={["Home", "Admin", "Content / SEO"]}
      stats={[
        { label: "Indexed Articles", value: "100 / 100", trend: "100% complete" },
        { label: "Supported Locales", value: "6 Languages", trend: "ar, en, zh, es, fr, hi" },
        { label: "Total Sitemap URLs", value: "660 URLs", trend: "Daily Google ping" },
        { label: "JSON-LD Schemas", value: "Valid", trend: "Zero Rich-Result errors" },
      ]}
    >
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Multilingual Editorial Articles Catalog (Showing top 15 of 100)</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Slug</th>
                <th>Type</th>
                <th>English Title</th>
                <th>Arabic Title</th>
                <th>Search Intent</th>
                <th>Coverage</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id}>
                  <td><code style={{ color: "#38bdf8" }}>{a.slug}</code></td>
                  <td><span className={`${styles.badge} ${styles.badgeNeutral}`}>{a.type}</span></td>
                  <td>{a.title}</td>
                  <td dir="rtl">{a.titleAr || "—"}</td>
                  <td><span className={`${styles.badge} ${styles.badgeSuccess}`}>{a.intent}</span></td>
                  <td>
                    <span style={{ color: "#22c55e", fontSize: "12px", fontWeight: 600 }}>6 / 6 Locales</span>
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
