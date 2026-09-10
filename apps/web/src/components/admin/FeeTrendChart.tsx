/**
 * A real, small-multiple area chart over whatever days actually have a
 * platform:rake entry -- never an interpolated curve smoothed across
 * invented points. A platform with no fee activity yet renders the empty
 * state below, not a flat fabricated line at zero.
 */
"use client";

import { fromMinorUnits, formatUsd } from "@/lib/money";
import styles from "./FeeTrendChart.module.css";

// The backend returns a real SQL `date` value, which node-postgres/JSON
// serializes as a full UTC midnight timestamp -- this shows only the
// calendar date it actually names, never the misleading time-of-day.
const shortDate = (day: string) =>
  new Date(day).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function FeeTrendChart({ points }: { points: { day: string; minor: string }[] }) {
  if (points.length === 0) {
    return <div className={styles.empty}>No platform fees recorded in the last 14 days.</div>;
  }

  const values = points.map((p) => fromMinorUnits(p.minor));
  const max = Math.max(...values, 0.01);
  const W = 560;
  const H = 160;
  const padX = 4;
  const padY = 10;
  const step = points.length > 1 ? (W - padX * 2) / (points.length - 1) : 0;

  const coords = values.map((v, i) => ({
    x: padX + i * step,
    y: H - padY - (v / max) * (H - padY * 2),
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  // Non-null: `points.length === 0` already returned above, so both ends
  // of `coords` (mapped 1:1 from `points`) are guaranteed to exist here.
  const firstCoord = coords[0]!;
  const lastCoord = coords[coords.length - 1]!;
  const areaPath = `${linePath} L${lastCoord.x.toFixed(1)},${H} L${firstCoord.x.toFixed(1)},${H} Z`;

  const total = values.reduce((a, b) => a + b, 0);
  const last = values[values.length - 1]!;

  return (
    <div className={styles.wrap}>
      <div className={styles.headline}>
        <span className={`nz-num ${styles.total}`}>${total.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
        <span className={styles.sub}>collected over {points.length} active day{points.length === 1 ? "" : "s"} · last day ${last.toFixed(2)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img" aria-label="Platform fees collected per day, last 14 days">
        <defs>
          <linearGradient id="feeArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--nz-mat-emerald-2)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--nz-mat-emerald-2)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#feeArea)" stroke="none" />
        <path d={linePath} fill="none" stroke="var(--nz-mat-emerald-2)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((c, i) => (
          <circle key={points[i]!.day} cx={c.x} cy={c.y} r={2.5} fill="var(--nz-mat-emerald-2)" />
        ))}
      </svg>
      <div className={styles.axis}>
        <span>{shortDate(points[0]!.day)}</span>
        <span>{shortDate(points[points.length - 1]!.day)}</span>
      </div>
      <span className="nz-sr-only">
        {points.map((p) => `${p.day}: ${formatUsd(p.minor)} USDT`).join(", ")}
      </span>
    </div>
  );
}
