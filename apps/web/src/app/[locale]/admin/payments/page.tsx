"use client";

/**
 * The Nizalo Admin Payment & Stablecoin Control Center.
 *
 * Every mutation here goes through the SAME pipeline every other admin
 * action already uses (see packages/api/src/server.mjs): identify, check
 * `rail.manage`/`control.toggle`, demand a fresh step-up token, write, audit.
 * This page invents no authorisation of its own -- a role that lacks the
 * capability gets a 403 from the backend no matter what this UI renders, and
 * a role that lacks a step-up gets a 401. What this page adds is only
 * visibility (rail state, its real health, its audit trail) and a form that
 * collects the reason + step-up a write already requires.
 *
 * Turning a rail off here only ever calls setStatus()/updateLimits()
 * (packages/payments/src/valuation.mjs) -- neither touches a deposit,
 * withdrawal, duel, or ledger row. History is a read of the append-only
 * rail_configuration_change table; nothing here can rewrite it.
 *
 * Health is rendered exactly as GET /v1/admin/payments/rails returns it --
 * this page never invents an OK it did not receive.
 */
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Header } from "@/components/Header";
import { Button } from "@/components/Button";
import { get, post, ApiError } from "@/lib/api";
import styles from "./payments.module.css";

type HealthCheck = { name: string; status: string; detail?: string | null };
type Health = { status: string; checks: HealthCheck[]; checkedAt: string | null };

type Rail = {
  id: string;
  asset: string;
  network: string;
  status: string;
  enabled: boolean;
  deposits_enabled: boolean;
  withdrawals_enabled: boolean;
  min_deposit_minor: string;
  max_deposit_minor: string | null;
  min_withdrawal_minor: string;
  max_withdrawal_minor: string | null;
  confirmation_depth: number;
  jurisdictions_allowed: string[];
  pause_withdrawals_on_depeg: boolean;
  network_display_name: string;
  risk_status: string | null;
  risk_rate_x1e8: string | null;
  health: Health;
};

type Control = { key: string; enabled: boolean; changed_by: string | null; reason: string | null; changed_at: string | null };

type HistoryEntry = {
  field: string; old_value: string | null; new_value: string | null;
  actor_type: string; actor_id: string | null; reason: string | null; at: string;
};

const GLOBAL_CONTROLS: { key: string; label: string; pauseLabel: string; resumeLabel: string }[] = [
  { key: "DEPOSITS", label: "Deposits", pauseLabel: "Pause all deposits", resumeLabel: "Resume deposits" },
  { key: "WITHDRAWALS", label: "Withdrawals", pauseLabel: "Pause all withdrawals", resumeLabel: "Resume withdrawals" },
  { key: "CASH_MATCHES", label: "Real-money play", pauseLabel: "Pause all real-money play", resumeLabel: "Resume real-money play" },
];

const FUTURE_RAILS = [
  { asset: "USDC", network: "Ethereum / TRON" },
  { asset: "TUSD", network: "Ethereum / TRON" },
];

function fromMinorUnits(minor: string | null): string {
  if (minor === null) return "";
  const neg = minor.startsWith("-");
  const digits = neg ? minor.slice(1) : minor;
  const padded = digits.padStart(7, "0");
  const whole = padded.slice(0, -6);
  const frac = padded.slice(-6);
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

function toMinorUnits(input: string): string {
  const trimmed = input.trim();
  const neg = trimmed.startsWith("-");
  const unsigned = neg ? trimmed.slice(1) : trimmed;
  const [whole = "0", frac = ""] = unsigned.split(".");
  const fracPadded = (frac + "000000").slice(0, 6);
  const combined = `${whole || "0"}${fracPadded}`;
  const value = BigInt(combined || "0");
  return (neg ? -value : value).toString();
}

function formatUsd(minor: string | null): string {
  if (minor === null) return "No limit";
  const n = Number(fromMinorUnits(minor));
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}

function formatRate(rateX1e8: string | null): string {
  if (rateX1e8 === null) return "no valuation yet";
  return `$${(Number(rateX1e8) / 1e8).toFixed(4)}`;
}

function formatJurisdictions(list: string[]): string {
  if (list.length === 1 && list[0] === "*") return "Everywhere";
  return list.join(", ") || "Nowhere (blocked)";
}

/** The single named UI state the brief requires: ACTIVE, DISABLED, PAUSED, DEGRADED, EMERGENCY HOLD. */
function summaryState(rail: Rail): { key: string; label: string } {
  if (rail.status === "EMERGENCY_HOLD") return { key: "emergency", label: "Emergency hold" };
  if (rail.status === "RETIRED" || !rail.enabled) return { key: "disabled", label: "Disabled" };
  if (rail.status === "ADMIN_PAUSED" || rail.status === "RISK_PAUSED") return { key: "paused", label: "Paused" };
  if (rail.health.status === "DEGRADED" || rail.health.status === "DOWN") return { key: "degraded", label: "Degraded" };
  return { key: "active", label: "Active" };
}

function healthBadge(health: Health): { key: string; label: string } {
  switch (health.status) {
    case "OK": return { key: "active", label: "Health: OK" };
    case "DEGRADED": return { key: "degraded", label: "Health: Degraded" };
    case "DOWN": return { key: "emergency", label: "Health: Down" };
    default: return { key: "unknown", label: "Health: Unknown" };
  }
}

function Badge({ state, label }: { state: string; label: string }) {
  return <span className={`${styles.badge} ${styles[`badge-${state}`]}`}>{label}</span>;
}

export default function AdminPaymentsPage() {
  return (
    <RequireAuth>
      <AdminPaymentsContent />
    </RequireAuth>
  );
}

function AdminPaymentsContent() {
  const [rails, setRails] = useState<Rail[] | null>(null);
  const [controls, setControls] = useState<Control[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [railsRes, controlsRes] = await Promise.all([
        get<{ rails: Rail[] }>("/v1/admin/payments/rails"),
        get<{ controls: Control[] }>("/v1/admin/payments/controls"),
      ]);
      setRails(railsRes.rails);
      setControls(controlsRes.controls);
      setForbidden(false);
      setLoadError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setForbidden(true);
        return;
      }
      setLoadError(e instanceof ApiError ? e.code ?? "REQUEST_FAILED" : "NETWORK_ERROR");
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <>
      <Header />
      <div className={styles.wrap}>
        <h1 className={styles.title}>Payment &amp; Stablecoin Control Center</h1>
        <p className={styles.subtitle}>
          Live configuration for every payment rail and platform-wide pause. Every change here is
          audited with actor, previous state, new state, reason, and timestamp, and requires a
          fresh step-up regardless of role.
        </p>

        {forbidden && (
          <p className={styles.errorNotice}>
            Your admin role does not include rail or control visibility (capability <code>rail.read</code> /
            <code>control.read</code>). Ask a SUPER_ADMIN to grant an appropriate role.
          </p>
        )}
        {loadError && !forbidden && (
          <p className={styles.errorNotice}>Could not load the Control Center ({loadError}).</p>
        )}

        {!forbidden && (
          <>
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Global controls</h2>
                <p className={styles.sectionNote}>Blocks NEW deposits/withdrawals/matches only -- in-flight operations follow their own state machine.</p>
              </div>
              {controls && (
                <GlobalControls controls={controls} onChanged={reload} />
              )}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Payment rails</h2>
                <p className={styles.sectionNote}>Health is read from a real chain ping, ledger solvency check, and open-incident count -- never fabricated.</p>
              </div>
              {rails && (
                <div className={styles.railList}>
                  {rails.map((rail) => (
                    <RailCard key={rail.id} rail={rail} onChanged={reload} />
                  ))}
                </div>
              )}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Future rails</h2>
                <p className={styles.sectionNote}>Not yet configured -- no row exists, so there is nothing to enable and nothing shown here is live.</p>
              </div>
              <div className={styles.controlGrid}>
                {FUTURE_RAILS.map((r) => (
                  <div key={r.asset} className={styles.controlCard}>
                    <div className={styles.controlLabel}>{r.asset}</div>
                    <div className={styles.controlMeta}>{r.network}</div>
                    <Badge state="disabled" label="Not configured" />
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Global controls                                                          */
/* ------------------------------------------------------------------------ */

function GlobalControls({ controls, onChanged }: { controls: Control[]; onChanged: () => Promise<void> }) {
  const globalEmergency = controls.find((c) => c.key === "GLOBAL_EMERGENCY");
  return (
    <div className={styles.controlGrid}>
      {GLOBAL_CONTROLS.map((def) => {
        const control = controls.find((c) => c.key === def.key);
        if (!control) return null;
        return <GlobalControlCard key={def.key} def={def} control={control} onChanged={onChanged} />;
      })}
      {globalEmergency && (
        <div className={styles.controlCard}>
          <div className={styles.controlLabel}>Global emergency hold</div>
          <Badge state={globalEmergency.enabled ? "emergency" : "active"} label={globalEmergency.enabled ? "ENGAGED" : "Not engaged"} />
          <p className={styles.controlMeta}>
            Reachable only through its own dedicated route, not this toggle -- a stronger action than
            any single pause, deliberately harder to trigger by accident.
          </p>
        </div>
      )}
    </div>
  );
}

function GlobalControlCard({
  def, control, onChanged,
}: {
  def: { key: string; label: string; pauseLabel: string; resumeLabel: string };
  control: Control;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className={styles.controlCard}>
      <div>
        <div className={styles.controlLabel}>{def.label}</div>
        <Badge state={control.enabled ? "active" : "paused"} label={control.enabled ? "Active" : "Paused"} />
      </div>
      {control.reason && (
        <div className={styles.controlMeta}>Last change: &ldquo;{control.reason}&rdquo;{control.changed_by ? ` — ${control.changed_by}` : ""}</div>
      )}
      {message && <p className={styles.message}>{message}</p>}
      {!editing && (
        <div className={styles.controlFoot}>
          <Button variant="secondary" onClick={() => { setMessage(null); setEditing(true); }}>
            {control.enabled ? def.pauseLabel : def.resumeLabel}
          </Button>
        </div>
      )}
      {editing && (
        <ReasonStepUpForm
          stepUpAction="admin.control.toggle"
          submitLabel={control.enabled ? "Confirm pause" : "Confirm resume"}
          onCancel={() => setEditing(false)}
          onSubmit={async (reason, stepUpToken) => {
            await post(`/v1/admin/controls/${def.key}`, { enabled: !control.enabled, reason }, { stepUpToken });
            setEditing(false);
            setMessage(control.enabled ? "Paused." : "Resumed.");
            await onChanged();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Rail card                                                                 */
/* ------------------------------------------------------------------------ */

function RailCard({ rail, onChanged }: { rail: Rail; onChanged: () => Promise<void> }) {
  const [mode, setMode] = useState<null | "status" | "limits" | "history">(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const summary = summaryState(rail);
  const health = healthBadge(rail.health);

  async function toggleHistory() {
    if (mode === "history") { setMode(null); return; }
    setMode("history");
    const r = await get<{ history: HistoryEntry[] }>(`/v1/admin/payments/rails/${rail.id}/history`);
    setHistory(r.history);
  }

  return (
    <div className={styles.railCard}>
      <div className={styles.railHead}>
        <div className={styles.railName}>
          <span className={styles.railAsset}>{rail.asset}</span>
          <span className={styles.railNetwork}>{rail.network_display_name}</span>
        </div>
        <div className={styles.badgeRow}>
          <Badge state={summary.key} label={summary.label.toUpperCase()} />
          <Badge state={health.key} label={health.label} />
        </div>
      </div>

      {message && <p className={styles.message} style={{ padding: "0 20px" }}>{message}</p>}

      <div className={styles.fieldGrid}>
        <Field label="Enabled" value={rail.enabled ? "Yes" : "No"} />
        <Field label="Deposits enabled" value={rail.deposits_enabled ? "Yes" : "No"} />
        <Field label="Withdrawals enabled" value={rail.withdrawals_enabled ? "Yes" : "No"} />
        <Field label="Operational status" value={rail.status.replaceAll("_", " ")} />
        <Field label="Health status" value={rail.health.status} />
        <Field label="Minimum deposit" value={formatUsd(rail.min_deposit_minor)} />
        <Field label="Maximum deposit" value={formatUsd(rail.max_deposit_minor)} />
        <Field label="Minimum withdrawal" value={formatUsd(rail.min_withdrawal_minor)} />
        <Field label="Maximum withdrawal" value={formatUsd(rail.max_withdrawal_minor)} />
        <Field label="Confirmation requirement" value={`${rail.confirmation_depth} confirmations`} />
        <Field label="Jurisdiction availability" value={formatJurisdictions(rail.jurisdictions_allowed)} prose />
        <Field
          label="Risk status"
          value={rail.risk_status ? `${rail.risk_status} (${formatRate(rail.risk_rate_x1e8)})` : "No valuation yet"}
          prose
        />
      </div>

      <div className={styles.railActions}>
        <Button variant="secondary" onClick={() => setMode(mode === "status" ? null : "status")}>Change status</Button>
        <Button variant="secondary" onClick={() => setMode(mode === "limits" ? null : "limits")}>Edit limits</Button>
        <Button variant="ghost" onClick={() => void toggleHistory()}>{mode === "history" ? "Hide history" : "View history"}</Button>
      </div>

      {mode === "status" && (
        <RailStatusForm
          rail={rail}
          onCancel={() => setMode(null)}
          onDone={async (label) => { setMode(null); setMessage(label); await onChanged(); }}
        />
      )}

      {mode === "limits" && (
        <RailLimitsForm
          rail={rail}
          onCancel={() => setMode(null)}
          onDone={async () => { setMode(null); setMessage("Limits updated."); await onChanged(); }}
        />
      )}

      {mode === "history" && (
        history === null ? null : history.length === 0 ? (
          <p className={styles.historyEmpty}>No changes recorded for this rail yet.</p>
        ) : (
          <ul className={styles.historyList}>
            {history.slice().reverse().map((h, i) => (
              <li key={i} className={styles.historyEntry}>
                <span className={styles.historyField}>
                  {h.field}: {h.old_value ?? "—"} → {h.new_value ?? "—"}
                </span>
                <span className={styles.historyMeta}>
                  {new Date(h.at).toLocaleString()} · {h.actor_type}{h.actor_id ? ` (${h.actor_id})` : ""}
                  {h.reason ? ` · "${h.reason}"` : ""}
                </span>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

function Field({ label, value, prose = false }: { label: string; value: string; prose?: boolean }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={prose ? styles.fieldValueProse : styles.fieldValue}>{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Rail status form                                                          */
/* ------------------------------------------------------------------------ */

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "ADMIN_PAUSED", label: "Paused" },
  { value: "EMERGENCY_HOLD", label: "Emergency hold (strongest restriction)" },
  { value: "RETIRED", label: "Retired (permanent)" },
];

function RailStatusForm({
  rail, onDone, onCancel,
}: { rail: Rail; onDone: (message: string) => Promise<void>; onCancel: () => void }) {
  const [status, setStatus] = useState(rail.status === "RISK_PAUSED" ? "ADMIN_PAUSED" : rail.status);

  return (
    <div className={styles.panel}>
      <h3 className={styles.panelTitle}>Change status — {rail.id}</h3>
      <div className={styles.formField}>
        <label htmlFor="railStatus">New status</label>
        <select id="railStatus" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <ReasonStepUpForm
        stepUpAction="admin.rail.manage"
        submitLabel="Confirm status change"
        onCancel={onCancel}
        onSubmit={async (reason, stepUpToken) => {
          await post(`/v1/admin/payments/rails/${rail.id}/status`, { status, reason }, { stepUpToken });
          await onDone(`Status set to ${status.replaceAll("_", " ")}.`);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Rail limits form                                                          */
/* ------------------------------------------------------------------------ */

function RailLimitsForm({
  rail, onDone, onCancel,
}: { rail: Rail; onDone: () => Promise<void>; onCancel: () => void }) {
  const [enabled, setEnabled] = useState(rail.enabled);
  const [depositsEnabled, setDepositsEnabled] = useState(rail.deposits_enabled);
  const [withdrawalsEnabled, setWithdrawalsEnabled] = useState(rail.withdrawals_enabled);
  const [minDeposit, setMinDeposit] = useState(fromMinorUnits(rail.min_deposit_minor));
  const [maxDeposit, setMaxDeposit] = useState(rail.max_deposit_minor === null ? "" : fromMinorUnits(rail.max_deposit_minor));
  const [minWithdrawal, setMinWithdrawal] = useState(fromMinorUnits(rail.min_withdrawal_minor));
  const [maxWithdrawal, setMaxWithdrawal] = useState(rail.max_withdrawal_minor === null ? "" : fromMinorUnits(rail.max_withdrawal_minor));
  const [confirmationDepth, setConfirmationDepth] = useState(String(rail.confirmation_depth));
  const [jurisdictions, setJurisdictions] = useState(rail.jurisdictions_allowed.join(", "));
  const [pauseOnDepeg, setPauseOnDepeg] = useState(rail.pause_withdrawals_on_depeg);

  return (
    <div className={styles.panel}>
      <h3 className={styles.panelTitle}>Edit limits — {rail.id}</h3>

      <div className={styles.checkGrid}>
        <label className={styles.checkField}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled
        </label>
        <label className={styles.checkField}>
          <input type="checkbox" checked={depositsEnabled} onChange={(e) => setDepositsEnabled(e.target.checked)} /> Deposits enabled
        </label>
        <label className={styles.checkField}>
          <input type="checkbox" checked={withdrawalsEnabled} onChange={(e) => setWithdrawalsEnabled(e.target.checked)} /> Withdrawals enabled
        </label>
        <label className={styles.checkField}>
          <input type="checkbox" checked={pauseOnDepeg} onChange={(e) => setPauseOnDepeg(e.target.checked)} /> Pause withdrawals on depeg
        </label>
      </div>

      <div className={styles.formGrid}>
        <div className={styles.formField}>
          <label htmlFor="minDeposit">Minimum deposit (USD)</label>
          <input id="minDeposit" type="number" step="0.000001" min="0" value={minDeposit} onChange={(e) => setMinDeposit(e.target.value)} />
        </div>
        <div className={styles.formField}>
          <label htmlFor="maxDeposit">Maximum deposit (USD, blank = no limit)</label>
          <input id="maxDeposit" type="number" step="0.000001" min="0" value={maxDeposit} onChange={(e) => setMaxDeposit(e.target.value)} />
        </div>
        <div className={styles.formField}>
          <label htmlFor="minWithdrawal">Minimum withdrawal (USD)</label>
          <input id="minWithdrawal" type="number" step="0.000001" min="0" value={minWithdrawal} onChange={(e) => setMinWithdrawal(e.target.value)} />
        </div>
        <div className={styles.formField}>
          <label htmlFor="maxWithdrawal">Maximum withdrawal (USD, blank = no limit)</label>
          <input id="maxWithdrawal" type="number" step="0.000001" min="0" value={maxWithdrawal} onChange={(e) => setMaxWithdrawal(e.target.value)} />
        </div>
        <div className={styles.formField}>
          <label htmlFor="confirmationDepth">Confirmation requirement</label>
          <input id="confirmationDepth" type="number" step="1" min="1" max="200" value={confirmationDepth} onChange={(e) => setConfirmationDepth(e.target.value)} />
        </div>
        <div className={styles.formField}>
          <label htmlFor="jurisdictions">Jurisdiction availability (comma-separated, * = everywhere)</label>
          <input id="jurisdictions" value={jurisdictions} onChange={(e) => setJurisdictions(e.target.value)} />
        </div>
      </div>

      <ReasonStepUpForm
        stepUpAction="admin.rail.manage"
        submitLabel="Confirm limit change"
        onCancel={onCancel}
        onSubmit={async (reason, stepUpToken) => {
          await post(`/v1/admin/payments/rails/${rail.id}/limits`, {
            enabled, depositsEnabled, withdrawalsEnabled,
            minDepositMinor: toMinorUnits(minDeposit || "0"),
            maxDepositMinor: maxDeposit.trim() === "" ? null : toMinorUnits(maxDeposit),
            minWithdrawalMinor: toMinorUnits(minWithdrawal || "0"),
            maxWithdrawalMinor: maxWithdrawal.trim() === "" ? null : toMinorUnits(maxWithdrawal),
            confirmationDepth: Number(confirmationDepth),
            jurisdictionsAllowed: jurisdictions.split(",").map((s) => s.trim()).filter(Boolean),
            pauseWithdrawalsOnDepeg: pauseOnDepeg,
            reason,
          }, { stepUpToken });
          await onDone();
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Shared reason + step-up form -- every mutation on this page ends here.   */
/* ------------------------------------------------------------------------ */

function ReasonStepUpForm({
  stepUpAction, submitLabel, onSubmit, onCancel, extra,
}: {
  stepUpAction: string;
  submitLabel: string;
  onSubmit: (reason: string, stepUpToken: string) => Promise<void>;
  onCancel: () => void;
  extra?: ReactNode;
}) {
  const [reason, setReason] = useState("");
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
        action: stepUpAction, password, totpCode: totpCode || undefined,
      });
      await onSubmit(reason, step.stepUpToken);
    } catch (e) {
      setError(e instanceof ApiError ? (e.code ?? "REQUEST_FAILED") : "NETWORK_ERROR");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.panel} onSubmit={handleSubmit} style={{ borderTop: "none", paddingTop: 0 }}>
      {extra}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.formField}>
        <label htmlFor={`reason-${stepUpAction}`}>Reason (required, becomes part of the permanent audit trail)</label>
        <input id={`reason-${stepUpAction}`} required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className={styles.formGrid}>
        <div className={styles.formField}>
          <label htmlFor={`password-${stepUpAction}`}>Your password (step-up confirmation)</label>
          <input id={`password-${stepUpAction}`} type="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className={styles.formField}>
          <label htmlFor={`totp-${stepUpAction}`}>Authenticator code (if enrolled)</label>
          <input id={`totp-${stepUpAction}`} autoComplete="one-time-code"
            value={totpCode} onChange={(e) => setTotpCode(e.target.value)} />
        </div>
      </div>
      <div className={styles.panelActions}>
        <Button type="submit" disabled={submitting}>{submitting ? "Submitting…" : submitLabel}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
