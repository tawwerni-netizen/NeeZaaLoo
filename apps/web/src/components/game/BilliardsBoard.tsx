"use client";

/**
 * BilliardsBoard -- renders packages/game-billiards/src/plugin.mjs's own
 * project() shape (`{balls:[{id,x,y}], groups, turn, broken, ballInHandFor,
 * lastShot, shotCount}`) and turns a drag gesture into the ONE intent this
 * game ever sends: `{ angle, power }`. Nothing here decides where a ball
 * ends up -- the drag only ever produces the two numbers the server's own
 * physics (billiards.mjs) resolves into a real shot; this component just
 * animates the table gliding from wherever it was to wherever the server
 * says it now is.
 */
import { useMemo, useRef, useState } from "react";
import type { BoardProps } from "@/lib/games/types";
import styles from "./BilliardsBoard.module.css";

const TABLE_W = 200;
const TABLE_H = 100;
const BALL_R = 2.85;
const POCKET_R = 5.4;
const RAIL = 8; // svg units of rail border around the playing field
const VB_W = TABLE_W + RAIL * 2;
const VB_H = TABLE_H + RAIL * 2;

const POCKETS = [
  { x: 0, y: 0 }, { x: TABLE_W / 2, y: 0 }, { x: TABLE_W, y: 0 },
  { x: 0, y: TABLE_H }, { x: TABLE_W / 2, y: TABLE_H }, { x: TABLE_W, y: TABLE_H },
];

type Ball = { id: number; x: number; y: number };
type BilliardsView = {
  balls?: Ball[];
  pottedEver?: number[];
  turn?: 0 | 1;
  groups?: Record<string, "SOLIDS" | "STRIPES">;
  broken?: boolean;
  ballInHandFor?: 0 | 1 | null;
  lastShot?: { seat: 0 | 1; potted: number[]; foul: boolean; foulReason: string | null; winner: number | null } | null;
  shotCount?: number;
};

// Standard-ish pool ball colours. Solids (1-7) are a solid fill; stripes
// (9-15) reuse the same hue as their solid counterpart (n-8) with a white
// body and a coloured band, matching a real set's own numbering scheme.
const BALL_HUE: Record<number, string> = {
  1: "#e8b923", 2: "#1f5fd6", 3: "#d62828", 4: "#5b2a86", 5: "#e8790a",
  6: "#1f8c3b", 7: "#8c1f2a",
};

function ballFill(id: number): { body: string; band?: string } {
  if (id === 0) return { body: "#f4f4f2" };
  if (id === 8) return { body: "#111318" };
  if (id <= 7) return { body: BALL_HUE[id] ?? "#888" };
  const band = BALL_HUE[id - 8];
  return band ? { body: "#f4f4f2", band } : { body: "#f4f4f2" };
}

export function BilliardsBoard({ view, canMove, mySeat, onMove }: BoardProps) {
  const v = (view ?? {}) as BilliardsView;
  const balls = v.balls ?? [];
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);

  const cue = useMemo(() => balls.find((b) => b.id === 0) ?? null, [balls]);

  function toTableCoords(clientX: number, clientY: number): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * VB_W - RAIL;
    const py = ((clientY - rect.top) / rect.height) * VB_H - RAIL;
    return { x: px, y: py };
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (!canMove || !cue) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toTableCoords(e.clientX, e.clientY);
    if (p) setDrag(p);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!drag || !canMove) return;
    const p = toTableCoords(e.clientX, e.clientY);
    if (p) setDrag(p);
  }

  function handlePointerUp() {
    if (!drag || !cue || !canMove) { setDrag(null); return; }
    // Dragging AWAY from the cue ball is the aim: the shot direction is
    // FROM the drag point back toward the cue ball, the same "pull the
    // cue back, then strike forward" gesture as a real cue stick -- and
    // drag distance sets power, capped at a comfortable maximum reach so
    // a single huge drag cannot demand more than full power anyway
    // (applyIntent independently clamps/rejects anything outside (0,1]).
    const dx = cue.x - drag.x, dy = cue.y - drag.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1.5) { setDrag(null); return; } // too short to be a deliberate shot
    const angle = Math.atan2(dy, dx);
    const MAX_DRAG = 70;
    const power = Math.max(0.08, Math.min(1, dist / MAX_DRAG));
    setDrag(null);
    onMove({ angle, power });
  }

  const aimLine = drag && cue ? { x1: cue.x, y1: cue.y, x2: drag.x, y2: drag.y } : null;
  const power = aimLine ? Math.max(0.08, Math.min(1, Math.hypot(aimLine.x2 - aimLine.x1, aimLine.y2 - aimLine.y1) / 70)) : 0;

  const myGroup = mySeat !== null ? v.groups?.[String(mySeat)] : undefined;
  const isMyTurn = canMove;

  return (
    <div className={styles.wrap}>
      <div className={styles.hud}>
        <span className={`${styles.turnPill} ${isMyTurn ? styles.turnPillActive : ""}`}>
          {v.ballInHandFor !== null && v.ballInHandFor !== undefined
            ? (isMyTurn ? "Ball in hand -- aim anywhere" : "Opponent has ball in hand")
            : (isMyTurn ? "Your shot" : "Opponent's shot")}
        </span>
        {myGroup && (
          <span className={`${styles.groupPill} ${myGroup === "SOLIDS" ? styles.groupSolids : styles.groupStripes}`}>
            You: {myGroup === "SOLIDS" ? "Solids (1-7)" : "Stripes (9-15)"}
          </span>
        )}
        {!v.groups?.[String(mySeat)] && v.broken && <span className={styles.groupPill}>Table open</span>}
        {v.lastShot?.foul && (
          <span className={styles.foulPill}>Foul: {v.lastShot.foulReason?.replaceAll("_", " ")}</span>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className={styles.table}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        role="img"
        aria-label="Billiards table"
      >
        <defs>
          <radialGradient id="feltGlow" cx="50%" cy="50%" r="75%">
            <stop offset="0%" stopColor="#0e3a2f" />
            <stop offset="100%" stopColor="#082019" />
          </radialGradient>
          <linearGradient id="railGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1a2130" />
            <stop offset="100%" stopColor="#0a0e16" />
          </linearGradient>
        </defs>

        {/* Rail */}
        <rect x={0} y={0} width={VB_W} height={VB_H} rx={6} fill="url(#railGrad)" stroke="#2dd4bf" strokeOpacity={0.35} strokeWidth={0.6} />
        {/* Felt */}
        <rect x={RAIL} y={RAIL} width={TABLE_W} height={TABLE_H} fill="url(#feltGlow)" />
        <rect x={RAIL} y={RAIL} width={TABLE_W} height={TABLE_H} fill="none" stroke="#2dd4bf" strokeOpacity={0.5} strokeWidth={0.5} />

        <g transform={`translate(${RAIL}, ${RAIL})`}>
          {/* Pockets */}
          {POCKETS.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={POCKET_R} fill="#000" stroke="#f97316" strokeOpacity={0.55} strokeWidth={0.5} />
          ))}

          {/* Aim line */}
          {aimLine && (
            <>
              <line
                x1={cue!.x} y1={cue!.y}
                x2={cue!.x + (cue!.x - aimLine.x2) * 6} y2={cue!.y + (cue!.y - aimLine.y2) * 6}
                stroke="#22d3ee" strokeWidth={0.35} strokeDasharray="1.4 1.2" opacity={0.85}
              />
              <line x1={aimLine.x1} y1={aimLine.y1} x2={aimLine.x2} y2={aimLine.y2} stroke="#f97316" strokeWidth={0.5} opacity={0.9} />
              <circle cx={aimLine.x1} cy={aimLine.y1} r={1.4} fill="#f97316" />
            </>
          )}

          {/* Balls */}
          {balls.map((b) => {
            const fill = ballFill(b.id);
            return (
              <g key={b.id} className={styles.ball} style={{ transform: `translate(${b.x}px, ${b.y}px)` }}>
                <circle r={BALL_R} fill={fill.body} stroke="#000" strokeOpacity={0.25} strokeWidth={0.15} />
                {fill.band && (
                  <rect x={-BALL_R} y={-BALL_R * 0.42} width={BALL_R * 2} height={BALL_R * 0.84} fill={fill.band} />
                )}
                {b.id === 0 ? (
                  <circle r={BALL_R * 0.32} fill="#22d3ee" opacity={0.8} />
                ) : (
                  <circle r={BALL_R * 0.5} fill="#fff" opacity={0.92} />
                )}
                {b.id !== 0 && (
                  <text y={BALL_R * 0.22} textAnchor="middle" fontSize={BALL_R * 0.85} fontWeight={700} fill="#111">
                    {b.id}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {drag && (
        <div className={styles.powerMeter}>
          <div className={styles.powerFill} style={{ width: `${Math.round(power * 100)}%` }} />
          <span className={styles.powerLabel}>{Math.round(power * 100)}%</span>
        </div>
      )}

      <p className={styles.hint}>
        {canMove ? "Drag back from the cue ball, then release to strike." : "Waiting for your opponent's shot..."}
      </p>
    </div>
  );
}
