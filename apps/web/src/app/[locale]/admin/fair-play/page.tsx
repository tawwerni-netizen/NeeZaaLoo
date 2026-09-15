"use client";

/**
 * Fair Play & Anti-Cheat Tribunal.
 *
 * Previously rendered three hardcoded mock cases and "Sanction"/"Clear"
 * buttons that only ever flipped local React state -- no backend call at
 * all, despite a real fairplay_case table, a real read endpoint, and a real
 * fairplay.decide policy action already existing. This page now reads real
 * cases from GET /v1/admin/fair-play and the one real decision endpoint,
 * POST /v1/admin/fair-play/cases/:id/decide, does the rest:
 *
 *   - CLEAR    -> case closed, no action on the player or their wallet.
 *   - SANCTION -> the account is permanently banned AND every non-zero
 *     balance across all five wallet states is moved to platform:confiscated
 *     in one atomic transaction. This is irreversible. There is no partial
 *     version of it.
 *
 * Both require a fresh step-up token (password re-entry) -- the backend
 * refuses the request without one regardless of what this UI does.
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { Button } from "@/components/Button";
import { get, post, ApiError } from "@/lib/api";
import styles from "@/components/admin/AdminPageLayout.module.css";

type FairPlayCase = {
  id: string;
  player_id: string;
  player_handle: string | null;
  category: string;
  status: "OPEN" | "UNDER_REVIEW" | "DECIDED" | "APPEALED" | "APPEAL_DECIDED" | "CLOSED_NO_ACTION";
  risk_score: number;
  auto_actioned: boolean;
  opened_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decision: string | null;
  decision_note: string | null;
  funds_held: boolean;
  closed_at: string | null;
};

type EngineFlag = {
  id: number;
  duel_id: string;
  player_id: string;
  flag_code: string;
  strength: string;
  confidence: string;
  explanation: string;
  created_at: string;
};

const OPEN_STATUSES = new Set(["OPEN", "UNDER_REVIEW"]);

export default function AdminFairPlayPage() {
  const [cases, setCases] = useState<FairPlayCase[]>([]);
  const [flags, setFlags] = useState<EngineFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<{ caseId: string; kind: "SANCTION" | "CLEAR" } | null>(null);

  const reload = useCallback(async () => {
    setLoadError(null);
    try {
      const r = await get<{ ok: boolean; cases: FairPlayCase[]; flags: EngineFlag[] }>("/v1/admin/fair-play");
      setCases(r.cases);
      setFlags(r.flags);
    } catch (e) {
      setLoadError(e instanceof ApiError ? (e.code ?? "REQUEST_FAILED") : "NETWORK_ERROR");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  function showNotice(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 5000);
  }

  const openCases = cases.filter((c) => OPEN_STATUSES.has(c.status));

  return (
    <AdminPageLayout
      title="Fair Play & Anti-Cheat Tribunal"
      subtitle="Review real fair-play cases. A decision here is permanent and, for Sanction, moves real funds."
      breadcrumb={["Home", "Admin", "Fair Play"]}
      stats={[
        { label: "Open Cases", value: String(openCases.length), trend: "Awaiting decision" },
        { label: "Decided (Sanctioned)", value: String(cases.filter((c) => c.decision === "ACCOUNT_CLOSURE").length), trend: "Account closures" },
        { label: "Cleared", value: String(cases.filter((c) => c.status === "CLOSED_NO_ACTION").length), trend: "No action taken" },
        { label: "Engine Flags", value: String(flags.length), trend: "Raw signals, not verdicts" },
      ]}
    >
      {notice && (
        <div style={{ padding: "10px 16px", background: "rgba(34, 197, 94, 0.1)", border: "1px solid #22c55e", borderRadius: "8px", marginBottom: "16px", color: "#22c55e", fontSize: "13px" }}>
          ✓ {notice}
        </div>
      )}
      {loadError && (
        <div style={{ padding: "10px 16px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid #ef4444", borderRadius: "8px", marginBottom: "16px", color: "#ef4444", fontSize: "13px" }}>
          Failed to load fair-play data ({loadError}).
        </div>
      )}

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Fair Play Cases ({cases.length})</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Player</th>
                <th>Category</th>
                <th>Risk Score</th>
                <th>Opened</th>
                <th>Status</th>
                <th>Decision</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: "28px", color: "#64748b" }}>Loading…</td></tr>
              ) : cases.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: "28px", color: "#64748b" }}>No fair-play cases on record.</td></tr>
              ) : (
                cases.map((c) => (
                  <tr key={c.id}>
                    <td><code>{c.id}</code></td>
                    <td>{c.player_handle ?? c.player_id}</td>
                    <td><span style={{ color: "#f59e0b", fontWeight: 600 }}>{c.category}</span></td>
                    <td className="nz-num">{c.risk_score}</td>
                    <td className="nz-num">{new Date(c.opened_at).toLocaleString()}</td>
                    <td>
                      <span className={`${styles.badge} ${
                        c.status === "CLOSED_NO_ACTION" ? styles.badgeSuccess
                          : c.status === "DECIDED" ? styles.badgeDanger
                          : styles.badgeWarning
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td style={{ fontSize: "12px", color: "#94a3b8" }}>
                      {c.decision && c.decision !== "NONE" ? (
                        <>
                          <strong style={{ color: "#f87171" }}>{c.decision}</strong>
                          {c.funds_held && <div>Funds seized</div>}
                        </>
                      ) : c.decision === "NONE" ? "Cleared" : "—"}
                    </td>
                    <td>
                      {OPEN_STATUSES.has(c.status) ? (
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            type="button"
                            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                            onClick={() => setActiveAction({ caseId: c.id, kind: "SANCTION" })}
                          >
                            Sanction
                          </button>
                          <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={() => setActiveAction({ caseId: c.id, kind: "CLEAR" })}
                          >
                            Clear
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: "#64748b", fontSize: "12px" }}>Decided</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {flags.length > 0 && (
        <div className={styles.tableCard} style={{ marginTop: "20px" }}>
          <div className={styles.tableHeader}>
            <h2 className={styles.tableTitle}>Recent Engine Flags ({flags.length})</h2>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr><th>Duel</th><th>Player</th><th>Detector</th><th>Strength</th><th>Confidence</th><th>When</th></tr>
              </thead>
              <tbody>
                {flags.map((f) => (
                  <tr key={f.id} title={f.explanation}>
                    <td><code>{f.duel_id}</code></td>
                    <td>{f.player_id}</td>
                    <td>{f.flag_code}</td>
                    <td className="nz-num">{f.strength}</td>
                    <td className="nz-num">{f.confidence}</td>
                    <td className="nz-num">{new Date(f.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeAction && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#12141a", border: "1px solid #2a2d36", borderRadius: "12px", padding: "24px", width: "min(480px, 92vw)" }}>
            <DecideForm
              caseId={activeAction.caseId}
              kind={activeAction.kind}
              onCancel={() => setActiveAction(null)}
              onDone={(msg) => {
                setActiveAction(null);
                showNotice(msg);
                void reload();
              }}
            />
          </div>
        </div>
      )}
    </AdminPageLayout>
  );
}

function DecideForm({
  caseId, kind, onCancel, onDone,
}: {
  caseId: string;
  kind: "SANCTION" | "CLEAR";
  onCancel: () => void;
  onDone: (msg: string) => void;
}) {
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const step = await post<{ stepUpToken: string }>("/v1/auth/step-up", {
        action: "admin.fairplay.decide", password, totpCode: totpCode || undefined,
      });
      const res = await post<{ ok: boolean; playerId?: string; seized?: Array<{ state: string; amountMinor: string }> }>(
        `/v1/admin/fair-play/cases/${caseId}/decide`,
        { decision: kind === "SANCTION" ? "ACCOUNT_CLOSURE" : "NONE", note },
        { stepUpToken: step.stepUpToken }
      );
      if (kind === "SANCTION") {
        const total = (res.seized ?? []).reduce((sum, s) => sum + BigInt(s.amountMinor), 0n);
        onDone(`Account closed and ${(Number(total) / 1_000_000).toFixed(2)} USDT seized to the platform.`);
      } else {
        onDone(`Case ${caseId} cleared — no action taken.`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? (err.code ?? "REQUEST_FAILED") : "NETWORK_ERROR");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3 style={{ margin: "0 0 8px", color: kind === "SANCTION" ? "#f87171" : "#f2f4f7" }}>
        {kind === "SANCTION" ? "Sanction: close account & seize funds" : "Clear case — no action"}
      </h3>
      {kind === "SANCTION" && (
        <p style={{ fontSize: "13px", color: "#f59e0b", lineHeight: 1.5, margin: "0 0 16px" }}>
          This permanently bans the account and transfers its <strong>entire</strong> wallet balance
          (available, locked, pending, withdrawable, and restricted) to the platform. This cannot be undone
          from this panel. Confirm you have reviewed the evidence before proceeding.
        </p>
      )}
      {error && <p style={{ color: "#ef4444", fontSize: "13px", marginBottom: "12px" }}>{error}</p>}
      <div style={{ marginBottom: "12px" }}>
        <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>
          Reason (required, becomes part of the permanent audit trail)
        </label>
        <input
          required minLength={3} value={note} onChange={(e) => setNote(e.target.value)}
          style={{ width: "100%", padding: "8px 10px", background: "#0e1015", border: "1px solid #2a2d36", borderRadius: "6px", color: "#f2f4f7" }}
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
        <div>
          <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>Your password</label>
          <input
            type="password" autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: "8px 10px", background: "#0e1015", border: "1px solid #2a2d36", borderRadius: "6px", color: "#f2f4f7" }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>Authenticator code (if enrolled)</label>
          <input
            autoComplete="one-time-code" value={totpCode} onChange={(e) => setTotpCode(e.target.value)}
            style={{ width: "100%", padding: "8px 10px", background: "#0e1015", border: "1px solid #2a2d36", borderRadius: "6px", color: "#f2f4f7" }}
          />
        </div>
      </div>
      <div style={{ display: "flex", gap: "10px" }}>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : kind === "SANCTION" ? "Confirm sanction" : "Confirm clear"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
