/**
 * The five operational states every health surface in this dashboard
 * reports through: HEALTHY, WARNING, PAUSED, DEGRADED, CRITICAL. One
 * component, one color mapping, used everywhere a health/status value is
 * rendered -- so "what does amber mean here?" always has the same answer.
 *
 * Colors are drawn from the platform's own existing semantic tokens
 * (win/warn/accent/loss/draw), never a bespoke admin palette invented for
 * this one component -- see tokens.css's own header on why a surface never
 * declares a color that isn't already a token.
 */
import styles from "./StateChip.module.css";

export type ChipState = "HEALTHY" | "WARNING" | "PAUSED" | "DEGRADED" | "CRITICAL" | "UNKNOWN";

const LABELS: Record<ChipState, string> = {
  HEALTHY: "Healthy", WARNING: "Warning", PAUSED: "Paused",
  DEGRADED: "Degraded", CRITICAL: "Critical", UNKNOWN: "Unknown",
};

export function StateChip({ state, label }: { state: ChipState; label?: string }) {
  return (
    <span className={`${styles.chip} ${styles[state.toLowerCase()]}`}>
      <span className={styles.dot} />
      {label ?? LABELS[state]}
    </span>
  );
}

/** Maps the handful of raw backend status vocabularies this dashboard reads
 * (reconciliation run status, rail health status, chain-check status) onto
 * the five chip states -- one small, explicit table per source, rather than
 * scattering the same if/else across every panel that renders one. */
export function reconciliationRunToChip(status: string): ChipState {
  if (status === "FAILED") return "CRITICAL";
  if (status === "RUNNING") return "PAUSED";
  return "HEALTHY";
}

export function railHealthToChip(status: string | undefined | null): ChipState {
  switch (status) {
    case "OK": return "HEALTHY";
    case "DEGRADED": return "WARNING";
    case "DOWN": return "CRITICAL";
    default: return "UNKNOWN";
  }
}

export function reconciliationStatusToChip(status: string): ChipState {
  if (status === "CRITICAL" || status === "WARNING" || status === "HEALTHY") return status;
  return "UNKNOWN";
}
