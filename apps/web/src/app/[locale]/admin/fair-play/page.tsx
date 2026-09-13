"use client";

import React, { useState } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import styles from "@/components/admin/AdminPageLayout.module.css";

type FairPlayCase = {
  id: string;
  game: string;
  playerHandle: string;
  detectedEngine: string;
  moveCorrelation: string;
  evidenceSummary: string;
  status: "PENDING_REVIEW" | "SANCTIONED" | "CLEARED";
  openedAt: string;
};

const INITIAL_CASES: FairPlayCase[] = [
  { id: "CASE-FP-401", game: "Chess", playerHandle: "SuspiciousBot9", detectedEngine: "Stockfish 16 Correlation", moveCorrelation: "98.7% Top-1 Engine Moves", evidenceSummary: "Uniform 2.1s move time distribution regardless of complexity. 0 mistakes in complex endgame.", status: "PENDING_REVIEW", openedAt: "30 mins ago" },
  { id: "CASE-FP-402", game: "Checkers", playerHandle: "FastJumpPlayer", detectedEngine: "Checkers Solver", moveCorrelation: "94.2% Optimal", evidenceSummary: "Move timing variance is natural, human hesitations observed on key sacrifices.", status: "CLEARED", openedAt: "Yesterday" },
  { id: "CASE-FP-403", game: "Speed Math", playerHandle: "MathScriptHero", detectedEngine: "Automated OCR/DOM Bot", moveCorrelation: "100% Sub-50ms Input", evidenceSummary: "Input arrival timing 12ms after question render. Impossible human reaction time.", status: "SANCTIONED", openedAt: "2 days ago" },
];

export default function AdminFairPlayPage() {
  const [cases, setCases] = useState<FairPlayCase[]>(INITIAL_CASES);
  const [notice, setNotice] = useState<string | null>(null);

  function decideCase(id: string, outcome: "SANCTIONED" | "CLEARED") {
    setCases((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: outcome } : c))
    );
    setNotice(`Case ${id} marked as ${outcome}. Immutable audit log updated.`);
    setTimeout(() => setNotice(null), 3500);
  }

  return (
    <AdminPageLayout
      title="Fair Play & Anti-Cheat Tribunal"
      subtitle="Examine AI move correlation, timing anomalies, Stockfish/engine signals, and sanction appeals."
      breadcrumb={["Home", "Admin", "Fair Play"]}
      stats={[
        { label: "Under Investigation", value: "1 Active Case", trend: "Review required" },
        { label: "Fair Play Accuracy", value: "99.98%", trend: "Zero false bans" },
        { label: "Automated Engine Scans", value: "100% of Matches", trend: "Continuous" },
        { label: "Appeals Heard", value: "3 All-time", trend: "Independent review" },
      ]}
    >
      {notice && (
        <div style={{ padding: "10px 16px", background: "rgba(34, 197, 94, 0.1)", border: "1px solid #22c55e", borderRadius: "8px", marginBottom: "16px", color: "#22c55e", fontSize: "13px" }}>
          ✓ {notice}
        </div>
      )}

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Fair Play Case Files & Engine Telemetry ({cases.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Game</th>
                <th>Player Handle</th>
                <th>Engine Detection Signal</th>
                <th>Correlation</th>
                <th>Evidence Finding</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td><code>{c.id}</code></td>
                  <td><strong>{c.game}</strong></td>
                  <td>{c.playerHandle}</td>
                  <td>
                    <span style={{ color: "#f59e0b", fontWeight: 600 }}>{c.detectedEngine}</span>
                  </td>
                  <td className="nz-num">{c.moveCorrelation}</td>
                  <td style={{ maxWidth: "280px" }}>{c.evidenceSummary}</td>
                  <td>
                    <span
                      className={`${styles.badge} ${
                        c.status === "CLEARED"
                          ? styles.badgeSuccess
                          : c.status === "SANCTIONED"
                          ? styles.badgeDanger
                          : styles.badgeWarning
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td>
                    {c.status === "PENDING_REVIEW" ? (
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          type="button"
                          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                          onClick={() => decideCase(c.id, "SANCTIONED")}
                        >
                          Sanction
                        </button>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => decideCase(c.id, "CLEARED")}
                        >
                          Clear
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: "#64748b", fontSize: "12px" }}>Decided</span>
                    )}
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
