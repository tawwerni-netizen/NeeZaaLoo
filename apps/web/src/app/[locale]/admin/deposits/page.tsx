"use client";

import React, { useState } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import styles from "@/components/admin/AdminPageLayout.module.css";

type DepositRow = {
  id: string;
  txHash: string;
  playerHandle: string;
  network: "TRC20" | "ERC20" | "BEP20";
  amountUsdt: string;
  confirmations: string;
  status: "CONFIRMED" | "PENDING" | "FAILED";
  receivedAt: string;
};

const INITIAL_DEPOSITS: DepositRow[] = [
  { id: "dep_9012", txHash: "0x8f3c...b91a", playerHandle: "Grandmaster77", network: "TRC20", amountUsdt: "250.00", confirmations: "20 / 20", status: "CONFIRMED", receivedAt: "5 mins ago" },
  { id: "dep_9013", txHash: "0x12a9...c44d", playerHandle: "DominoKingAlex", network: "TRC20", amountUsdt: "100.00", confirmations: "20 / 20", status: "CONFIRMED", receivedAt: "18 mins ago" },
  { id: "dep_9014", txHash: "0xaa44...88ee", playerHandle: "NewChallenger01", network: "BEP20", amountUsdt: "50.00", confirmations: "12 / 15", status: "PENDING", receivedAt: "Just now" },
  { id: "dep_9015", txHash: "0x9812...77ff", playerHandle: "TawlaMaster99", network: "TRC20", amountUsdt: "500.00", confirmations: "20 / 20", status: "CONFIRMED", receivedAt: "1 hour ago" },
];

export default function AdminDepositsPage() {
  const [deposits, setDeposits] = useState<DepositRow[]>(INITIAL_DEPOSITS);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  function confirmDeposit(id: string) {
    setDeposits((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: "CONFIRMED", confirmations: "20 / 20" } : d))
    );
    setActionNotice(`Deposit ${id} credited to player ledger balance.`);
    setTimeout(() => setActionNotice(null), 3500);
  }

  return (
    <AdminPageLayout
      title="USDT Deposits & Blockchain Ingestion"
      subtitle="Monitor incoming USDT deposits across TRC20, ERC20, and BEP20 with automated confirmation depth."
      breadcrumb={["Home", "Admin", "Deposits"]}
      stats={[
        { label: "24h Inflow", value: "$14,850.00", trend: "USDT" },
        { label: "Confirmed Deposits", value: "84", trend: "100% On-chain" },
        { label: "Pending Blocks", value: "1", trend: "Awaiting depth" },
        { label: "Treasury Balance", value: "$48,920.50", trend: "Cold + Hot" },
      ]}
    >
      {actionNotice && (
        <div style={{ padding: "10px 16px", background: "rgba(34, 197, 94, 0.1)", border: "1px solid #22c55e", borderRadius: "8px", marginBottom: "16px", color: "#22c55e", fontSize: "13px" }}>
          ✓ {actionNotice}
        </div>
      )}

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>USDT Deposit Ingestion Ledger ({deposits.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Internal ID</th>
                <th>Blockchain TxHash</th>
                <th>Player</th>
                <th>Network</th>
                <th>Amount (USDT)</th>
                <th>Confirmations</th>
                <th>Status</th>
                <th>Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {deposits.map((d) => (
                <tr key={d.id}>
                  <td><code>{d.id}</code></td>
                  <td>
                    <code style={{ color: "#38bdf8" }}>{d.txHash}</code>
                  </td>
                  <td><strong>{d.playerHandle}</strong></td>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeNeutral}`}>{d.network}</span>
                  </td>
                  <td className="nz-num" style={{ color: "#22c55e", fontWeight: 700 }}>+${d.amountUsdt}</td>
                  <td className="nz-num">{d.confirmations}</td>
                  <td>
                    <span
                      className={`${styles.badge} ${
                        d.status === "CONFIRMED"
                          ? styles.badgeSuccess
                          : d.status === "PENDING"
                          ? styles.badgeWarning
                          : styles.badgeDanger
                      }`}
                    >
                      {d.status}
                    </span>
                  </td>
                  <td className="nz-num">{d.receivedAt}</td>
                  <td>
                    {d.status === "PENDING" ? (
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                        onClick={() => confirmDeposit(d.id)}
                      >
                        Approve & Credit
                      </button>
                    ) : (
                      <span style={{ color: "#64748b", fontSize: "12px" }}>Settled</span>
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
