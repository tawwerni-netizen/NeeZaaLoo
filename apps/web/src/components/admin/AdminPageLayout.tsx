"use client";

import React, { useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";
import { StepUpProvider } from "./StepUpProvider";
import styles from "./AdminPageLayout.module.css";

type AdminPageLayoutProps = {
  title: string;
  subtitle?: string;
  breadcrumb: string[];
  actions?: React.ReactNode;
  stats?: { label: string; value: string; trend?: string }[];
  children: React.ReactNode;
};

export function AdminPageLayout({
  title,
  subtitle,
  breadcrumb,
  actions,
  stats,
  children,
}: AdminPageLayoutProps) {
  const { player } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <RequireAuth>
      <StepUpProvider>
      <div className={styles.layout}>
        <AdminSidebar
          adminHandle={player?.handle ?? "admin"}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        {sidebarOpen && (
          <div
            className={styles.scrim}
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}
        <div className={styles.main}>
          <AdminTopbar
            breadcrumb={breadcrumb}
            adminHandle={player?.handle ?? "admin"}
            onMenuClick={() => setSidebarOpen((v) => !v)}
          />
          <div className={styles.content}>
            <header className={styles.head}>
              <div className={styles.titleGroup}>
                <h1 className={styles.title}>{title}</h1>
                {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
              </div>
              {actions && <div className={styles.actions}>{actions}</div>}
            </header>

            {stats && stats.length > 0 && (
              <div className={styles.statsGrid}>
                {stats.map((s) => (
                  <div key={s.label} className={styles.statCard}>
                    <span className={styles.statLabel}>{s.label}</span>
                    <span className={styles.statValue}>{s.value}</span>
                    {s.trend && <span className={styles.statTrend}>{s.trend}</span>}
                  </div>
                ))}
              </div>
            )}

            {children}
          </div>
        </div>
      </div>
      </StepUpProvider>
    </RequireAuth>
  );
}
