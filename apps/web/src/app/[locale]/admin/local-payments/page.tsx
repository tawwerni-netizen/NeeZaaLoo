"use client";

/**
 * Vodafone Cash / InstaPay operator console (db/migrations/0062). Until the
 * Android "Payment Receiver" app exists, this page IS the app: the operator
 * sets the rate, edits receiving numbers, and -- watching their own phone --
 * manually logs each transfer they see land, crediting the matching deposit
 * intent. Completing a local withdrawal (sending the EGP by hand) also
 * happens here. Every action below calls the *_solo policy actions -- the
 * single-operator path -- since four-eyes has no second admin to pair with
 * on a one-person deployment; the plain (non-solo) actions remain reachable
 * for a deployment that does add a second admin later.
 */
import React, { useState, useEffect, useCallback } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { Button } from "@/components/Button";
import { get, post, del } from "@/lib/api";
import { adminErrorMessage } from "@/lib/admin-errors";
import styles from "@/components/admin/AdminPageLayout.module.css";

type LocalNumber = { id: string; network: string; phoneNumber: string; label: string | null; enabled: boolean };
type LocalRate = { egpPerUsd: number; usdRateX1e8: string; effectiveAt: string } | null;
type LocalDepositIntent = {
  id: string; playerId: string; network: string; receivingNumberId: string;
  senderName: string; senderPhone: string; amountEgpMinor: string; status: string;
  creditedAmountUsdtMinor: string | null; createdAt: string; expiresAt: string;
};
type LocalDevice = { id: string; label: string; enabled: boolean; createdBy: string; createdAt: string; lastSeenAt: string | null };
type UnmatchedTransfer = { id: string; network: string; receivedNumberId: string; rawSenderName: string | null; rawSenderPhone: string | null; amountEgpMinor: string; rawMessage: string; observedAt: string };
type LocalWithdrawal = {
  id: string; playerId: string; network: string; destination: string;
  amountMinor: string; feeMinor: string; status: string; requestedAt: string;
};

function egp(minor: string): string { return (Number(minor) / 100).toFixed(2); }
function usdt(minor: string | null): string { return minor ? (Number(minor) / 1_000_000).toFixed(2) : "0.00"; }

export default function AdminLocalPaymentsPage() {
  const [numbers, setNumbers] = useState<LocalNumber[]>([]);
  const [rate, setRate] = useState<LocalRate>(null);
  const [deposits, setDeposits] = useState<LocalDepositIntent[]>([]);
  const [withdrawals, setWithdrawals] = useState<LocalWithdrawal[]>([]);
  const [devices, setDevices] = useState<LocalDevice[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedTransfer[]>([]);
  const [newDeviceLabel, setNewDeviceLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [newRate, setNewRate] = useState("");
  const [newNumberNetwork, setNewNumberNetwork] = useState<"VODAFONE_CASH" | "INSTAPAY">("VODAFONE_CASH");
  const [newNumberPhone, setNewNumberPhone] = useState("");
  const [newNumberLabel, setNewNumberLabel] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [n, d, w, devs, unm] = await Promise.all([
        get<{ numbers: LocalNumber[]; rate: LocalRate }>("/v1/admin/payments/local/numbers"),
        get<{ intents: LocalDepositIntent[] }>("/v1/admin/payments/local/deposits?status=PENDING"),
        get<{ withdrawals: LocalWithdrawal[] }>("/v1/admin/payments/local/withdrawals"),
        get<{ devices: LocalDevice[] }>("/v1/admin/payments/local/devices"),
        get<{ transfers: UnmatchedTransfer[] }>("/v1/admin/payments/local/transfers/unmatched"),
      ]);
      setNumbers(n.numbers ?? []);
      setRate(n.rate ?? null);
      setDeposits(d.intents ?? []);
      setWithdrawals(w.withdrawals ?? []);
      setDevices(devs.devices ?? []);
      setUnmatched(unm.transfers ?? []);
      setLoadError(null);
    } catch (e) {
      setLoadError(adminErrorMessage(e, "تعذّر تحميل بيانات فودافون كاش / إنستاباي."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  }

  async function handleSetRate() {
    const parsed = parseFloat(newRate);
    if (isNaN(parsed) || parsed <= 0) { setLoadError("Enter a valid EGP-per-USD rate."); return; }
    const reason = window.prompt("Reason for this rate change (required, kept on the audit record):", "market rate update");
    if (reason === null) return;
    try {
      await post("/v1/admin/payments/local/rate", { egpPerUsd: parsed, reason });
      setNewRate("");
      flash(`Rate updated: 1 USD = ${parsed} EGP`);
      void load();
    } catch (e) {
      setLoadError(adminErrorMessage(e, "تعذّر تحديث سعر الصرف."));
    }
  }

  async function handleAddNumber() {
    if (!newNumberPhone.trim()) { setLoadError("Enter a phone number."); return; }
    try {
      await post("/v1/admin/payments/local/numbers", {
        network: newNumberNetwork, phoneNumber: newNumberPhone.trim(), label: newNumberLabel.trim() || undefined,
      });
      setNewNumberPhone(""); setNewNumberLabel("");
      flash("Number added.");
      void load();
    } catch (e) {
      setLoadError(adminErrorMessage(e, "تعذّر إضافة الرقم."));
    }
  }

  async function handleToggleNumber(n: LocalNumber) {
    try {
      await post(`/v1/admin/payments/local/numbers/${n.id}/status`, { enabled: !n.enabled });
      flash(`${n.phoneNumber} ${n.enabled ? "disabled" : "enabled"}.`);
      void load();
    } catch (e) {
      setLoadError(adminErrorMessage(e, "تعذّر تغيير حالة الرقم."));
    }
  }

  async function handleDeleteNumber(n: LocalNumber) {
    try {
      await del(`/v1/admin/payments/local/numbers/${n.id}`);
      flash(`${n.phoneNumber} deleted.`);
      void load();
    } catch (e: any) {
      if (e?.code === 'IN_USE') setLoadError("Cannot delete this number because it has recorded transactions. Please just Disable it instead.");
      else setLoadError(adminErrorMessage(e, "تعذّر حذف الرقم."));
    }
  }

  async function handleCredit(intent: LocalDepositIntent) {
    const amountStr = window.prompt(
      `EGP amount seen on your phone for ${intent.senderName} (${intent.senderPhone})\nDeclared: ${egp(intent.amountEgpMinor)} EGP`,
      egp(intent.amountEgpMinor)
    );
    if (amountStr === null) return;
    const amountEgp = parseFloat(amountStr);
    if (isNaN(amountEgp) || amountEgp <= 0) { setLoadError("Invalid amount."); return; }
    const note = window.prompt("Optional note (e.g. the SMS text), for your own audit trail:", "") ?? "";
    try {
      await post(`/v1/admin/payments/local/deposits/${intent.id}/credit-solo`, {
        senderName: intent.senderName, senderPhone: intent.senderPhone,
        amountEgpMinor: Math.round(amountEgp * 100), note: note || undefined,
      });
      flash(`Credited ${intent.id}.`);
      void load();
    } catch (e) {
      setLoadError(adminErrorMessage(e, "تعذّر تأكيد الإيداع."));
    }
  }

  async function handleReject(intent: LocalDepositIntent) {
    const reason = window.prompt(`Reason for rejecting deposit ${intent.id}:`, "no matching transfer arrived");
    if (reason === null) return;
    try {
      await post(`/v1/admin/payments/local/deposits/${intent.id}/reject`, { reason });
      flash(`Rejected ${intent.id}.`);
      void load();
    } catch (e) {
      setLoadError(adminErrorMessage(e, "تعذّر رفض طلب الإيداع."));
    }
  }

  async function handleAddDevice() {
    if (!newDeviceLabel.trim()) { setLoadError("Enter a device label."); return; }
    try {
      const res = await post<{ ok: boolean, device: { id: string, label: string, apiKey: string } }>("/v1/admin/payments/local/devices", { label: newDeviceLabel.trim() });
      setNewDeviceLabel("");
      flash("Device added.");
      window.prompt("Device API Key (Copy this now, it won't be shown again):", res.device.apiKey);
      void load();
    } catch (e) {
      setLoadError(adminErrorMessage(e, "تعذّر إضافة الجهاز."));
    }
  }

  async function handleToggleDevice(d: LocalDevice) {
    try {
      await post(`/v1/admin/payments/local/devices/${d.id}/status`, { enabled: !d.enabled });
      flash(`Device ${d.label} ${d.enabled ? "disabled" : "enabled"}.`);
      void load();
    } catch (e) {
      setLoadError(adminErrorMessage(e, "تعذّر تغيير حالة الجهاز."));
    }
  }

  async function handleDeleteDevice(d: LocalDevice) {
    try {
      await del(`/v1/admin/payments/local/devices/${d.id}`);
      flash(`Device ${d.label} deleted.`);
      void load();
    } catch (e: any) {
      if (e?.code === 'IN_USE') setLoadError("Cannot delete this device because it has recorded transactions. Please just Disable it instead.");
      else setLoadError(adminErrorMessage(e, "تعذّر حذف الجهاز."));
    }
  }

  async function handleMatchTransfer(transfer: UnmatchedTransfer) {
    const intentId = window.prompt("Enter the Pending Intent ID to match with this transfer:", "");
    if (!intentId) return;
    try {
      await post(`/v1/admin/payments/local/deposits/${intentId.trim()}/match/${transfer.id}`, {});
      flash(`Matched intent ${intentId} with transfer ${transfer.id}.`);
      void load();
    } catch (e) {
      setLoadError(adminErrorMessage(e, "تعذّر تأكيد الإيداع."));
    }
  }

  async function handleCompleteWithdrawal(w: LocalWithdrawal) {
    const reference = window.prompt(
      `You are about to manually send ${usdt(w.amountMinor)} equivalent to ${w.destination} via ${w.network}.\nEnter a reference you can trace later (e.g. the Vodafone Cash/InstaPay transaction id):`,
      ""
    );
    if (reference === null) return;
    if (!reference.trim()) { setLoadError("A reference is required."); return; }
    try {
      await post(`/v1/admin/payments/local/withdrawals/${w.id}/complete-solo`, { reference: reference.trim() });
      flash(`Withdrawal ${w.id} marked complete.`);
      void load();
    } catch (e) {
      setLoadError(adminErrorMessage(e, "تعذّر إتمام عملية السحب."));
    }
  }

  return (
    <AdminPageLayout
      title="Vodafone Cash / InstaPay"
      subtitle="Local EGP rails: exchange rate, receiving numbers, deposit review, and manual withdrawal fulfilment."
      breadcrumb={["Home", "Admin", "Local Payments"]}
      stats={[
        { label: "EGP / USD Rate", value: rate ? `${rate.egpPerUsd}` : "Not set", trend: rate ? "1 USD" : "" },
        { label: "Pending Deposits", value: `${deposits.length}`, trend: "Awaiting review" },
        { label: "Pending Withdrawals", value: `${withdrawals.length}`, trend: "Awaiting payout" },
        { label: "Active Numbers", value: `${numbers.filter((n) => n.enabled).length}`, trend: `of ${numbers.length}` },
      ]}
    >
      {notice && (
        <div style={{ padding: "10px 16px", background: "rgba(34, 197, 94, 0.1)", border: "1px solid #22c55e", borderRadius: "8px", marginBottom: "16px", color: "#22c55e", fontSize: "13px" }}>
          ✓ {notice}
        </div>
      )}
      {loadError && (
        <div style={{ padding: "10px 16px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "8px", marginBottom: "16px", color: "#fca5a5", fontSize: "13px" }}>
          ⚠️ {loadError}
        </div>
      )}

      {/* Rate */}
      <div className={styles.tableCard} style={{ marginBottom: "16px" }}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Exchange Rate</h2>
        </div>
        <div style={{ padding: "12px 16px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "13px", color: "var(--nz-text-3)" }}>
            Current: {rate ? `1 USD = ${rate.egpPerUsd} EGP` : "not set -- deposits are unavailable until you set one"}
          </span>
          <div style={{ display: "flex", gap: "8px", marginLeft: "auto", alignItems: "center" }}>
            <span style={{ fontSize: "13px" }}>1 USD =</span>
            <input
              type="number" min="0" step="0.01" value={newRate} onChange={(e) => setNewRate(e.target.value)}
              placeholder="50" style={{ width: "90px", padding: "6px 10px", borderRadius: "6px", background: "var(--nz-bg-2, #0e121a)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
            />
            <span style={{ fontSize: "13px" }}>EGP</span>
            <Button variant="primary" onClick={() => void handleSetRate()}>Update Rate</Button>
          </div>
        </div>
      </div>

      {/* Numbers */}
      <div className={styles.tableCard} style={{ marginBottom: "16px" }}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Receiving Numbers ({numbers.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Number</th><th>Network</th><th>Label</th><th>Status</th><th className={styles.alignRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {numbers.map((n) => (
                <tr key={n.id}>
                  <td><strong>{n.phoneNumber}</strong></td>
                  <td><span className={`${styles.badge} ${styles.badgeNeutral}`}>{n.network}</span></td>
                  <td>{n.label ?? "--"}</td>
                  <td>
                    <span className={`${styles.badge} ${n.enabled ? styles.badgeSuccess : styles.badgeDanger}`}>
                      {n.enabled ? "ENABLED" : "DISABLED"}
                    </span>
                  </td>
                  <td className={styles.alignRight}>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                      <Button variant="ghost" onClick={() => void handleToggleNumber(n)}>
                        {n.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button variant="ghost" onClick={() => void handleDeleteNumber(n)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "12px 16px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <select
            value={newNumberNetwork} onChange={(e) => setNewNumberNetwork(e.target.value as "VODAFONE_CASH" | "INSTAPAY")}
            style={{ padding: "6px 10px", borderRadius: "6px", background: "var(--nz-bg-2, #0e121a)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
          >
            <option value="VODAFONE_CASH">Vodafone Cash</option>
            <option value="INSTAPAY">InstaPay</option>
          </select>
          <input
            value={newNumberPhone} onChange={(e) => setNewNumberPhone(e.target.value)} placeholder="01xxxxxxxxx"
            style={{ padding: "6px 10px", borderRadius: "6px", background: "var(--nz-bg-2, #0e121a)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
          />
          <input
            value={newNumberLabel} onChange={(e) => setNewNumberLabel(e.target.value)} placeholder="Label (optional)"
            style={{ padding: "6px 10px", borderRadius: "6px", background: "var(--nz-bg-2, #0e121a)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
          />
          <Button variant="secondary" onClick={() => void handleAddNumber()}>Add Number</Button>
        </div>
      </div>

      {/* Devices */}
      <div className={styles.tableCard} style={{ marginBottom: "16px" }}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Devices ({devices.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th><th>Label</th><th>Status</th><th>Last Seen</th><th className={styles.alignRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id}>
                  <td>{d.id}</td>
                  <td><strong>{d.label}</strong></td>
                  <td>
                    <span className={`${styles.badge} ${d.enabled ? styles.badgeSuccess : styles.badgeDanger}`}>
                      {d.enabled ? "ENABLED" : "DISABLED"}
                    </span>
                  </td>
                  <td>{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : "Never"}</td>
                  <td className={styles.alignRight}>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                      <Button variant="ghost" onClick={() => void handleToggleDevice(d)}>
                        {d.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button variant="ghost" onClick={() => void handleDeleteDevice(d)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "12px 16px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <input
            value={newDeviceLabel} onChange={(e) => setNewDeviceLabel(e.target.value)} placeholder="Device Label (e.g. Operator Phone)"
            style={{ padding: "6px 10px", borderRadius: "6px", background: "var(--nz-bg-2, #0e121a)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
          />
          <Button variant="secondary" onClick={() => void handleAddDevice()}>Add Device</Button>
        </div>
      </div>

      {/* Unmatched Transfers */}
      <div className={styles.tableCard} style={{ marginBottom: "16px" }}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Unmatched Transfers ({unmatched.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Transfer ID</th><th>Sender</th><th>Amount</th><th>Network</th><th>Observed</th><th className={styles.alignRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {unmatched.length === 0 ? (
                <tr><td colSpan={6} className={styles.emptyState}>{loading ? "Loading..." : "No unmatched transfers"}</td></tr>
              ) : (
                unmatched.map((u) => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.rawSenderName || "--"}<br /><span style={{ color: "var(--nz-text-3)", fontSize: "12px" }}>{u.rawSenderPhone || "--"}</span></td>
                    <td className="nz-num">{egp(u.amountEgpMinor)} EGP</td>
                    <td><span className={`${styles.badge} ${styles.badgeNeutral}`}>{u.network}</span></td>
                    <td className="nz-num">{new Date(u.observedAt).toLocaleString()}</td>
                    <td className={styles.alignRight}>
                      <Button variant="primary" onClick={() => void handleMatchTransfer(u)}>Match Intent</Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Deposits awaiting review */}
      <div className={styles.tableCard} style={{ marginBottom: "16px" }}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>
            Deposits Awaiting Your Confirmation ({deposits.length}) {loading ? "— Loading..." : ""}
          </h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Player</th><th>Sender</th><th>Declared</th><th>Network</th><th>Expires</th><th className={styles.alignRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {deposits.length === 0 ? (
                <tr><td colSpan={6} className={styles.emptyState}>{loading ? "Loading..." : "No deposits waiting for review"}</td></tr>
              ) : (
                deposits.map((d) => (
                  <tr key={d.id}>
                    <td><strong>{d.playerId}</strong></td>
                    <td>{d.senderName}<br /><span style={{ color: "var(--nz-text-3)", fontSize: "12px" }}>{d.senderPhone}</span></td>
                    <td className="nz-num">{egp(d.amountEgpMinor)} EGP</td>
                    <td><span className={`${styles.badge} ${styles.badgeNeutral}`}>{d.network}</span></td>
                    <td className="nz-num">{new Date(d.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                    <td className={styles.alignRight}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                        <Button variant="primary" onClick={() => void handleCredit(d)}>I Saw This Arrive</Button>
                        <Button variant="ghost" onClick={() => void handleReject(d)}>Reject</Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Withdrawals awaiting manual payout */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>
            Withdrawals Awaiting Manual Payout ({withdrawals.length}) {loading ? "— Loading..." : ""}
          </h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Player</th><th>Send To</th><th>Network</th><th>Amount</th><th>Requested</th><th className={styles.alignRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.length === 0 ? (
                <tr><td colSpan={6} className={styles.emptyState}>{loading ? "Loading..." : "No withdrawals waiting for payout"}</td></tr>
              ) : (
                withdrawals.map((w) => (
                  <tr key={w.id}>
                    <td><strong>{w.playerId}</strong></td>
                    <td>{w.destination}</td>
                    <td><span className={`${styles.badge} ${styles.badgeNeutral}`}>{w.network}</span></td>
                    <td className="nz-num" style={{ color: "#22c55e", fontWeight: 700 }}>${usdt(w.amountMinor)}</td>
                    <td className="nz-num">{new Date(w.requestedAt).toLocaleDateString()}</td>
                    <td className={styles.alignRight}>
                      <Button variant="primary" onClick={() => void handleCompleteWithdrawal(w)}>I Sent This</Button>
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
