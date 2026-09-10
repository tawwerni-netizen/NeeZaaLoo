"use client";

/**
 * The Nizalo Admin Dashboard.
 *
 * Every number, chip, and list row on this page comes from ONE real read --
 * GET /v1/admin/dashboard/summary (packages/api/src/server.mjs) -- which
 * itself only ever aggregates tables and views this platform already
 * treats as authoritative elsewhere (ledger_solvency, reconciliation_run,
 * admin_audit, the withdrawal/deposit queues). Where a real source does
 * not exist yet for something this dashboard would like to show (a live
 * WebSocket connection count, a generic worker heartbeat), the field is
 * `null` and this page renders that honestly as "no data", never as an
 * invented figure.
 *
 * Authorization is enforced entirely server-side (the `admin.analytics.read`
 * capability); this page's only job on a 403 is to say so, the same
 * pattern admin/payments/page.tsx already established.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { get, ApiError } from "@/lib/api";
import { formatUsd, formatCompactNumber } from "@/lib/money";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { AdminIcon, type IconName } from "@/components/admin/AdminIcon";
import { StateChip, reconciliationRunToChip, railHealthToChip, reconciliationStatusToChip, type ChipState } from "@/components/admin/StateChip";
import { FeeTrendChart } from "@/components/admin/FeeTrendChart";
import styles from "./dashboard.module.css";

type Summary = {
  generatedAt: string;
  kpis: {
    platformFees: { minor: string; asset: string };
    activeMatches: number;
    livePlayers: number;
    pendingWithdrawals: number;
    pendingDeposits: number;
    riskAlerts: number;
    reconciliationStatus: string;
  };
  finance: {
    solvency: { asset: string; custodyHeldMinor: string; userLiabilitiesMinor: string }[];
    pendingDeposits: number;
    pendingWithdrawals: number;
    failedDeposits: number;
    failedWithdrawals: number;
    reconciliationRuns: { kind: string; status: string; startedAt: string; completedAt: string | null; recordsChecked: number; mismatchesFound: number; casesOpened: number }[];
    rail: { asset: string; network: string; status: string; health: { status: string; checks: { name: string; status: string; detail?: string | null }[] } | null } | null;
  };
  operations: {
    activeGames: number;
    liveMatches: number;
    livePlayers: number;
    openTournaments: number;
    matchesLast24h: number;
  };
  security: {
    openFairPlayCases: number;
    openReconciliationCases: number;
    openCriticalReconciliationCases: number;
    chainReaderHealth: { name: string; status: string; detail?: string | null } | null;
  };
  recentActivity: { adminId: string | null; action: string; decision: string; subjectType: string | null; subjectId: string | null; at: string }[];
  feeTrend: { day: string; minor: string }[];
  matchVolumeByGame: { gameId: string; displayName: string; matches7d: number }[];
  withdrawalQueue: { id: string; playerId: string; asset: string; amountMinor: string; status: string; requestedAt: string }[];
  recentTransactions: { kind: "DEPOSIT" | "WITHDRAWAL"; id: string; playerId: string; asset: string; amountMinor: string | null; status: string; at: string }[];
};

const PANEL_KEYS = ["feeTrend", "matchVolume", "withdrawalQueue", "recentTransactions", "riskReconciliation", "systemHealth", "recentActivity"] as const;
type PanelKey = (typeof PANEL_KEYS)[number];
const PANEL_LABELS: Record<PanelKey, string> = {
  feeTrend: "Platform fees (14d)",
  matchVolume: "Match volume by game",
  withdrawalQueue: "Withdrawal queue",
  recentTransactions: "Recent transactions",
  riskReconciliation: "Risk & reconciliation",
  systemHealth: "System health",
  recentActivity: "Recent admin activity",
};
const VISIBILITY_KEY = "nz_admin_dashboard_panels_v1";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default function AdminDashboardPage() {
  return (
    <RequireAuth>
      <AdminDashboardContent />
    </RequireAuth>
  );
}

function AdminDashboardContent() {
  const { player } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [visible, setVisible] = useState<Record<PanelKey, boolean>>(() => {
    const fallback = Object.fromEntries(PANEL_KEYS.map((k) => [k, true])) as Record<PanelKey, boolean>;
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(VISIBILITY_KEY);
      return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
    } catch {
      return fallback;
    }
  });

  const togglePanel = (key: PanelKey) => {
    setVisible((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { window.localStorage.setItem(VISIBILITY_KEY, JSON.stringify(next)); } catch { /* private mode, etc. */ }
      return next;
    });
  };

  const reload = useCallback(async () => {
    try {
      const data = await get<Summary>("/v1/admin/dashboard/summary");
      setSummary(data);
      setForbidden(false);
      setLoadError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) { setForbidden(true); return; }
      setLoadError(e instanceof ApiError ? e.code ?? "REQUEST_FAILED" : "NETWORK_ERROR");
    }
  }, []);

  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 30_000);
    return () => clearInterval(t);
  }, [reload]);

  const maxVolume = useMemo(
    () => Math.max(1, ...(summary?.matchVolumeByGame.map((g) => g.matches7d) ?? [1])),
    [summary]
  );

  return (
    <div className={styles.shell} dir="ltr">
      <AdminSidebar adminHandle={player?.handle ?? "admin"} open={sidebarOpen} />
      {sidebarOpen && <div className={styles.scrim} onClick={() => setSidebarOpen(false)} />}

      <div className={styles.main}>
        <AdminTopbar
          breadcrumb={["Home", "Dashboard"]}
          alertCount={summary?.kpis.riskAlerts ?? 0}
          adminHandle={player?.handle ?? "admin"}
          onMenuClick={() => setSidebarOpen((v) => !v)}
        />

        <div className={styles.scroll}>
          {forbidden && (
            <p className={styles.notice}>
              Your admin role does not include dashboard visibility (capability <code>analytics.read</code>).
              Ask a SUPER_ADMIN to grant an appropriate role.
            </p>
          )}
          {loadError && !forbidden && (
            <p className={styles.notice}>Could not load the dashboard ({loadError}).</p>
          )}

          {summary && (
            <>
              <div className={styles.pageHead}>
                <div>
                  <h1 className={styles.title}>Dashboard</h1>
                  <p className={styles.subtitle}>Updated {timeAgo(summary.generatedAt)} · refreshes automatically</p>
                </div>
                <div className={styles.customizeWrap}>
                  <button type="button" className={styles.customizeButton} onClick={() => setCustomizeOpen((v) => !v)}>
                    <AdminIcon name="customize" size={15} />
                    Customize
                  </button>
                  {customizeOpen && (
                    <div className={styles.customizePanel}>
                      <span className={styles.customizeTitle}>Visible panels</span>
                      {PANEL_KEYS.map((key) => (
                        <label key={key} className={styles.customizeRow}>
                          <input type="checkbox" checked={visible[key]} onChange={() => togglePanel(key)} />
                          {PANEL_LABELS[key]}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <KpiRow summary={summary} />

              <div className={styles.grid}>
                {visible.feeTrend && (
                  <Panel title="Platform fees" span={2}>
                    <FeeTrendChart points={summary.feeTrend} />
                  </Panel>
                )}
                {visible.matchVolume && (
                  <Panel title="Match volume by game" subtitle="last 7 days">
                    <MatchVolumePanel games={summary.matchVolumeByGame} max={maxVolume} />
                  </Panel>
                )}

                {visible.withdrawalQueue && (
                  <Panel title="Withdrawal queue" subtitle={`${summary.kpis.pendingWithdrawals} pending`}>
                    <WithdrawalQueuePanel rows={summary.withdrawalQueue} />
                  </Panel>
                )}
                {visible.recentTransactions && (
                  <Panel title="Recent transactions">
                    <RecentTransactionsPanel rows={summary.recentTransactions} />
                  </Panel>
                )}

                {visible.riskReconciliation && (
                  <Panel title="Risk & reconciliation">
                    <RiskReconciliationPanel summary={summary} />
                  </Panel>
                )}
                {visible.systemHealth && (
                  <Panel title="System health">
                    <SystemHealthPanel summary={summary} />
                  </Panel>
                )}

                {visible.recentActivity && (
                  <Panel title="Recent admin activity" span={2}>
                    <RecentActivityPanel rows={summary.recentActivity} />
                  </Panel>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function KpiRow({ summary }: { summary: Summary }) {
  const cards: { label: string; icon: IconName; value: string; chip?: ChipState }[] = [
    { label: "Platform fees", icon: "finance", value: `$${formatUsd(summary.kpis.platformFees.minor)}` },
    { label: "Active matches", icon: "matches", value: formatCompactNumber(summary.kpis.activeMatches) },
    { label: "Live players", icon: "arena", value: formatCompactNumber(summary.kpis.livePlayers) },
    { label: "Pending withdrawals", icon: "withdrawals", value: formatCompactNumber(summary.kpis.pendingWithdrawals) },
    { label: "Pending deposits", icon: "deposits", value: formatCompactNumber(summary.kpis.pendingDeposits) },
    { label: "Risk alerts", icon: "risk", value: formatCompactNumber(summary.kpis.riskAlerts) },
  ];
  return (
    <section className={styles.kpiRow}>
      {cards.map((c) => (
        <div key={c.label} className={styles.kpiCard}>
          <div className={styles.kpiIcon}><AdminIcon name={c.icon} size={16} /></div>
          <span className={styles.kpiLabel}>{c.label}</span>
          <span className={`nz-num ${styles.kpiValue}`}>{c.value}</span>
        </div>
      ))}
      <div className={styles.kpiCard}>
        <div className={styles.kpiIcon}><AdminIcon name="systemHealth" size={16} /></div>
        <span className={styles.kpiLabel}>Reconciliation</span>
        <StateChip state={reconciliationStatusToChip(summary.kpis.reconciliationStatus)} />
      </div>
    </section>
  );
}

function Panel({ title, subtitle, span, children }: { title: string; subtitle?: string; span?: 1 | 2; children: React.ReactNode }) {
  return (
    <section className={styles.panel} style={span === 2 ? { gridColumn: "span 2" } : undefined}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>{title}</h2>
        {subtitle && <span className={styles.panelSubtitle}>{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

function MatchVolumePanel({ games, max }: { games: Summary["matchVolumeByGame"]; max: number }) {
  if (games.length === 0) return <p className={styles.empty}>No launched games in the catalogue yet.</p>;
  return (
    <div className={styles.barList}>
      {games.map((g) => (
        <div key={g.gameId} className={styles.barRow}>
          <span className={styles.barLabel}>{g.displayName}</span>
          <div className={styles.barTrack}>
            <div className={styles.barFill} style={{ width: `${Math.max(4, (g.matches7d / max) * 100)}%` }} />
          </div>
          <span className={`nz-num ${styles.barValue}`}>{g.matches7d}</span>
        </div>
      ))}
    </div>
  );
}

function WithdrawalQueuePanel({ rows }: { rows: Summary["withdrawalQueue"] }) {
  if (rows.length === 0) return <p className={styles.empty}>The withdrawal queue is empty.</p>;
  return (
    <ul className={styles.list}>
      {rows.map((r) => (
        <li key={r.id} className={styles.listRow}>
          <div className={styles.listMain}>
            <span className={styles.listTitle}>{r.playerId}</span>
            <span className={styles.listMeta}>{r.status.replaceAll("_", " ").toLowerCase()} · {timeAgo(r.requestedAt)}</span>
          </div>
          <span className={`nz-num ${styles.listValue}`}>${formatUsd(r.amountMinor)} {r.asset}</span>
        </li>
      ))}
    </ul>
  );
}

function RecentTransactionsPanel({ rows }: { rows: Summary["recentTransactions"] }) {
  if (rows.length === 0) return <p className={styles.empty}>No deposits or withdrawals recorded yet.</p>;
  return (
    <ul className={styles.list}>
      {rows.map((r) => (
        <li key={`${r.kind}-${r.id}`} className={styles.listRow}>
          <div className={styles.listMain}>
            <span className={styles.listTitle}>
              <span className={r.kind === "DEPOSIT" ? styles.tagDeposit : styles.tagWithdrawal}>{r.kind}</span>
              {r.playerId}
            </span>
            <span className={styles.listMeta}>{r.status.replaceAll("_", " ").toLowerCase()} · {timeAgo(r.at)}</span>
          </div>
          <span className={`nz-num ${styles.listValue}`}>
            {r.amountMinor ? `$${formatUsd(r.amountMinor)} ${r.asset}` : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RiskReconciliationPanel({ summary }: { summary: Summary }) {
  return (
    <div className={styles.stack}>
      <div className={styles.metricRow}>
        <span>Open fair-play cases</span>
        <span className={`nz-num ${styles.metricValue}`}>{summary.security.openFairPlayCases}</span>
      </div>
      <div className={styles.metricRow}>
        <span>Open reconciliation cases</span>
        <span className={`nz-num ${styles.metricValue}`}>{summary.security.openReconciliationCases}</span>
      </div>
      <div className={styles.metricRow}>
        <span>...of which CRITICAL</span>
        <span className={`nz-num ${styles.metricValue}`}>{summary.security.openCriticalReconciliationCases}</span>
      </div>
      <div className={styles.divider} />
      {summary.finance.reconciliationRuns.length === 0 ? (
        <p className={styles.empty}>No reconciliation job has run in this environment yet.</p>
      ) : (
        summary.finance.reconciliationRuns.map((run) => (
          <div key={run.kind} className={styles.checkRow}>
            <span className={styles.checkName}>{run.kind.replaceAll("_", " ").toLowerCase()}</span>
            <StateChip state={reconciliationRunToChip(run.status)} label={run.status.toLowerCase()} />
          </div>
        ))
      )}
    </div>
  );
}

function SystemHealthPanel({ summary }: { summary: Summary }) {
  const rail = summary.finance.rail;
  const chain = summary.security.chainReaderHealth;
  return (
    <div className={styles.stack}>
      <div className={styles.checkRow}>
        <span className={styles.checkName}>{rail ? `${rail.asset} / ${rail.network} rail` : "Payment rail"}</span>
        <StateChip state={railHealthToChip(rail?.health?.status)} />
      </div>
      <div className={styles.checkRow}>
        <span className={styles.checkName}>Blockchain reader</span>
        <StateChip state={railHealthToChip(chain?.status)} />
      </div>
      {chain?.detail && <p className={styles.detail}>{chain.detail}</p>}
      <div className={styles.divider} />
      {summary.finance.solvency.length === 0 ? (
        <p className={styles.empty}>No ledger activity recorded yet.</p>
      ) : (
        summary.finance.solvency.map((s) => (
          <div key={s.asset} className={styles.metricRow}>
            <span>{s.asset} custody vs. liabilities</span>
            <span className={`nz-num ${styles.metricValue}`}>
              ${formatUsd(s.custodyHeldMinor, { compact: true })} / ${formatUsd(s.userLiabilitiesMinor, { compact: true })}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function RecentActivityPanel({ rows }: { rows: Summary["recentActivity"] }) {
  if (rows.length === 0) return <p className={styles.empty}>No admin actions recorded yet.</p>;
  return (
    <ul className={styles.list}>
      {rows.map((r, i) => (
        <li key={i} className={styles.listRow}>
          <div className={styles.listMain}>
            <span className={styles.listTitle}>{r.action}</span>
            <span className={styles.listMeta}>
              {r.adminId ?? "system"}{r.subjectId ? ` · ${r.subjectType}:${r.subjectId}` : ""} · {timeAgo(r.at)}
            </span>
          </div>
          <span className={styles.decisionTag} data-decision={r.decision}>{r.decision.replaceAll("_", " ").toLowerCase()}</span>
        </li>
      ))}
    </ul>
  );
}
