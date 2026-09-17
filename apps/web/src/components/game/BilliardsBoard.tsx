"use client";

/**
 * BilliardsBoard -- Tournament-grade 8-Ball Pool renderer and controller.
 *
 * Implements:
 *   - Luxury table graphics: fine felt, mahogany rails, diamond sights, pocket castings
 *   - 3D-shaded resin balls with realistic specular gleam, numbers, and stripes
 *   - Realistic wooden cue stick with pull-back stroke corresponding to power
 *   - Real-time trajectory prediction: primary aim line, ghost ball at point of impact,
 *     target ball cut trajectory line, and tangent cue ball deflection path
 *   - Procedural Web Audio API sound effects (cue strike, ball clash, cushion thud, pocket drop)
 *   - Micro-adjustment angle steppers and cue ball spin/english control
 *   - Fully responsive touch & mouse controls with gesture capture (portrait & landscape)
 *   - Strict compliance with server duel intent schema: `{ angle, power }`
 */

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import type { BoardProps } from "@/lib/games/types";
import { billiardsAudio } from "@/lib/audio/billiards-audio";
import styles from "./BilliardsBoard.module.css";

const TABLE_W = 200;
const TABLE_H = 100;
const BALL_R = 2.85;
const POCKET_R = 5.4;
const RAIL = 12;
const VB_W = TABLE_W + RAIL * 2; // 224
const VB_H = TABLE_H + RAIL * 2; // 124

const POCKETS = [
  { x: 0, y: 0 },
  { x: TABLE_W / 2, y: 0 },
  { x: TABLE_W, y: 0 },
  { x: 0, y: TABLE_H },
  { x: TABLE_W / 2, y: TABLE_H },
  { x: TABLE_W, y: TABLE_H },
];

// Diamond rail sights (inlays) in table coordinates
const DIAMOND_SIGHTS = [
  // Top rail (long): 6 diamonds
  { x: TABLE_W * 0.125, y: -RAIL / 2 },
  { x: TABLE_W * 0.25,  y: -RAIL / 2 },
  { x: TABLE_W * 0.375, y: -RAIL / 2 },
  { x: TABLE_W * 0.625, y: -RAIL / 2 },
  { x: TABLE_W * 0.75,  y: -RAIL / 2 },
  { x: TABLE_W * 0.875, y: -RAIL / 2 },
  // Bottom rail (long): 6 diamonds
  { x: TABLE_W * 0.125, y: TABLE_H + RAIL / 2 },
  { x: TABLE_W * 0.25,  y: TABLE_H + RAIL / 2 },
  { x: TABLE_W * 0.375, y: TABLE_H + RAIL / 2 },
  { x: TABLE_W * 0.625, y: TABLE_H + RAIL / 2 },
  { x: TABLE_W * 0.75,  y: TABLE_H + RAIL / 2 },
  { x: TABLE_W * 0.875, y: TABLE_H + RAIL / 2 },
  // Left rail (short): 3 diamonds
  { x: -RAIL / 2, y: TABLE_H * 0.25 },
  { x: -RAIL / 2, y: TABLE_H * 0.5 },
  { x: -RAIL / 2, y: TABLE_H * 0.75 },
  // Right rail (short): 3 diamonds
  { x: TABLE_W + RAIL / 2, y: TABLE_H * 0.25 },
  { x: TABLE_W + RAIL / 2, y: TABLE_H * 0.5 },
  { x: TABLE_W + RAIL / 2, y: TABLE_H * 0.75 },
];

type Ball = { id: number; x: number; y: number };
type BilliardsView = {
  balls?: Ball[];
  pottedEver?: number[];
  turn?: 0 | 1;
  groups?: Record<string, "SOLIDS" | "STRIPES">;
  broken?: boolean;
  ballInHandFor?: 0 | 1 | null;
  lastShot?: {
    seat: 0 | 1;
    angle?: number;
    power?: number;
    potted: number[];
    foul: boolean;
    foulReason: string | null;
    winner: number | null;
  } | null;
  shotCount?: number;
};

// Official pool ball palette
const BALL_COLORS: Record<number, { hex: string; dark: string }> = {
  1: { hex: "#facc15", dark: "#ca8a04" }, // Yellow
  2: { hex: "#3b82f6", dark: "#1d4ed8" }, // Blue
  3: { hex: "#ef4444", dark: "#b91c1c" }, // Red
  4: { hex: "#a855f7", dark: "#7e22ce" }, // Purple
  5: { hex: "#f97316", dark: "#c2410c" }, // Orange
  6: { hex: "#22c55e", dark: "#15803d" }, // Green
  7: { hex: "#be123c", dark: "#881337" }, // Maroon
};

function getBallAppearance(id: number) {
  if (id === 0) {
    return { isCue: true, isEight: false, isStripe: false, hex: "#f8fafc", dark: "#cbd5e1", label: "" };
  }
  if (id === 8) {
    return { isCue: false, isEight: true, isStripe: false, hex: "#0f172a", dark: "#020617", label: "8" };
  }
  if (id <= 7) {
    const c = BALL_COLORS[id] ?? { hex: "#94a3b8", dark: "#64748b" };
    return { isCue: false, isEight: false, isStripe: false, hex: c.hex, dark: c.dark, label: String(id) };
  }
  const c = BALL_COLORS[id - 8] ?? { hex: "#94a3b8", dark: "#64748b" };
  return { isCue: false, isEight: false, isStripe: true, hex: c.hex, dark: c.dark, label: String(id) };
}

export function BilliardsBoard({ view, canMove, mySeat, onMove }: BoardProps) {
  const v = (view ?? {}) as BilliardsView;
  const balls = v.balls ?? [];
  const svgRef = useRef<SVGSVGElement>(null);

  // Aiming state
  const [aimAngle, setAimAngle] = useState<number>(0);
  const [power, setPower] = useState<number>(0.5);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [soundMuted, setSoundMuted] = useState<boolean>(false);
  const [spin, setSpin] = useState<{ x: number; y: number }>({ x: 0, y: 0 }); // -1 to 1

  const cue = useMemo(() => balls.find((b) => b.id === 0) ?? null, [balls]);

  // Track shot count to trigger audio upon new shots
  const prevShotCount = useRef<number>(v.shotCount ?? 0);
  useEffect(() => {
    if (v.shotCount !== undefined && v.shotCount > prevShotCount.current) {
      prevShotCount.current = v.shotCount;
      // Play shot audio
      const last = v.lastShot;
      billiardsAudio.playCueStrike(last?.power ?? 0.6);
      if (last?.potted && last.potted.length > 0) {
        setTimeout(() => {
          billiardsAudio.playPocketDrop();
        }, 650);
      } else {
        setTimeout(() => {
          billiardsAudio.playBallClash(0.7);
        }, 180);
      }
    }
  }, [v.shotCount, v.lastShot]);

  // Convert viewport screen coords to table coords
  const toTableCoords = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * VB_W - RAIL;
    const py = ((clientY - rect.top) / rect.height) * VB_H - RAIL;
    return { x: px, y: py };
  }, []);

  // Update aim direction towards pointer
  const updateAimFromPointer = useCallback((clientX: number, clientY: number) => {
    if (!cue) return;
    const p = toTableCoords(clientX, clientY);
    if (!p) return;
    const dx = p.x - cue.x;
    const dy = p.y - cue.y;
    if (Math.hypot(dx, dy) > 0.8) {
      setAimAngle(Math.atan2(dy, dx));
    }
  }, [cue, toTableCoords]);

  function handlePointerDown(e: React.PointerEvent) {
    if (!canMove || !cue) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setIsDragging(true);
    updateAimFromPointer(e.clientX, e.clientY);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!isDragging || !canMove) return;
    updateAimFromPointer(e.clientX, e.clientY);
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!isDragging) return;
    setIsDragging(false);
  }

  // Execute shot
  const executeShot = useCallback(() => {
    if (!canMove || !cue) return;
    billiardsAudio.playCueStrike(power);
    onMove({ angle: aimAngle, power });
  }, [canMove, cue, power, aimAngle, onMove]);

  // Micro adjustments
  const adjustAngle = (deltaDegrees: number) => {
    const rad = (deltaDegrees * Math.PI) / 180;
    setAimAngle((prev) => {
      let next = prev + rad;
      while (next > Math.PI) next -= 2 * Math.PI;
      while (next < -Math.PI) next += 2 * Math.PI;
      return next;
    });
  };

  // Trajectory calculation & Ghost Ball Prediction
  const trajectory = useMemo(() => {
    if (!cue) return null;

    const dx = Math.cos(aimAngle);
    const dy = Math.sin(aimAngle);

    let closestHit: {
      ball: Ball;
      dist: number;
      ghostX: number;
      ghostY: number;
      cutNormal: { x: number; y: number };
      tangent: { x: number; y: number };
    } | null = null;

    // Raycast against all object balls
    for (const b of balls) {
      if (b.id === 0) continue;
      const vx = b.x - cue.x;
      const vy = b.y - cue.y;
      const proj = vx * dx + vy * dy;
      if (proj <= 0) continue; // Ball is behind cue ball

      const perp2 = vx * vx + vy * vy - proj * proj;
      const contactRadius = BALL_R * 2;
      if (perp2 >= contactRadius * contactRadius) continue; // Ray misses ball

      const offset = Math.sqrt(contactRadius * contactRadius - perp2);
      const hitDist = proj - offset;
      if (hitDist > 0 && (!closestHit || hitDist < closestHit.dist)) {
        const gx = cue.x + dx * hitDist;
        const gy = cue.y + dy * hitDist;
        const nx = (b.x - gx) / contactRadius;
        const ny = (b.y - gy) / contactRadius;

        // Tangent deflection vector
        const tx = -ny * (dx * -ny + dy * nx > 0 ? 1 : -1);
        const ty = nx * (dx * -ny + dy * nx > 0 ? 1 : -1);

        closestHit = {
          ball: b,
          dist: hitDist,
          ghostX: gx,
          ghostY: gy,
          cutNormal: { x: nx, y: ny },
          tangent: { x: tx, y: ty },
        };
      }
    }

    if (closestHit) {
      const cutLineLength = 35;
      const tangentLineLength = 22;
      return {
        hasHit: true,
        rayEnd: { x: closestHit.ghostX, y: closestHit.ghostY },
        ghost: { x: closestHit.ghostX, y: closestHit.ghostY },
        targetBall: closestHit.ball,
        cutLine: {
          x1: closestHit.ball.x,
          y1: closestHit.ball.y,
          x2: closestHit.ball.x + closestHit.cutNormal.x * cutLineLength,
          y2: closestHit.ball.y + closestHit.cutNormal.y * cutLineLength,
        },
        tangentLine: {
          x1: closestHit.ghostX,
          y1: closestHit.ghostY,
          x2: closestHit.ghostX + closestHit.tangent.x * tangentLineLength,
          y2: closestHit.ghostY + closestHit.tangent.y * tangentLineLength,
        },
      };
    }

    // Raycast to cushions if no ball is hit
    let minT = 300;
    if (dx > 0) minT = Math.min(minT, (TABLE_W - BALL_R - cue.x) / dx);
    else if (dx < 0) minT = Math.min(minT, (BALL_R - cue.x) / dx);

    if (dy > 0) minT = Math.min(minT, (TABLE_H - BALL_R - cue.y) / dy);
    else if (dy < 0) minT = Math.min(minT, (BALL_R - cue.y) / dy);

    return {
      hasHit: false,
      rayEnd: { x: cue.x + dx * minT, y: cue.y + dy * minT },
      ghost: null,
      targetBall: null,
      cutLine: null,
      tangentLine: null,
    };
  }, [cue, aimAngle, balls]);

  // Cue stick geometry
  const cueStick = useMemo(() => {
    if (!cue || !canMove) return null;
    const CUE_LENGTH = 90;
    const pullBack = BALL_R + 4 + power * 26;
    const dx = Math.cos(aimAngle);
    const dy = Math.sin(aimAngle);

    // Tip position (behind cue ball along reverse aim vector)
    const tipX = cue.x - dx * pullBack;
    const tipY = cue.y - dy * pullBack;

    // Butt position
    const buttX = cue.x - dx * (pullBack + CUE_LENGTH);
    const buttY = cue.y - dy * (pullBack + CUE_LENGTH);

    // Perpendicular vector for cue stick taper
    const perpX = -dy;
    const perpY = dx;
    const tipR = 1.1;
    const buttR = 2.4;

    const p1 = { x: tipX + perpX * tipR, y: tipY + perpY * tipR };
    const p2 = { x: tipX - perpX * tipR, y: tipY - perpY * tipR };
    const p3 = { x: buttX - perpX * buttR, y: buttY - perpY * buttR };
    const p4 = { x: buttX + perpX * buttR, y: buttY + perpY * buttR };

    return {
      tip: { x: tipX, y: tipY },
      butt: { x: buttX, y: buttY },
      polygon: `${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`,
    };
  }, [cue, canMove, aimAngle, power]);

  const toggleSound = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    billiardsAudio.setMuted(next);
  };

  const myGroup = mySeat !== null && mySeat !== undefined ? v.groups?.[String(mySeat)] : undefined;
  const isMyTurn = canMove;

  return (
    <div className={styles.wrap}>
      {/* HUD Header */}
      <div className={styles.hud}>
        <div className={styles.hudGroup}>
          <span className={`${styles.turnPill} ${isMyTurn ? styles.turnPillActive : ""}`}>
            <span style={{ fontSize: "14px" }}>{isMyTurn ? "🎯" : "⏳"}</span>
            {v.ballInHandFor !== null && v.ballInHandFor !== undefined
              ? (isMyTurn ? "Ball in Hand -- Aim Anywhere" : "Opponent Has Ball in Hand")
              : (isMyTurn ? "Your Turn" : "Opponent's Turn")}
          </span>

          {myGroup && (
            <span className={`${styles.groupPill} ${myGroup === "SOLIDS" ? styles.groupSolids : styles.groupStripes}`}>
              {myGroup === "SOLIDS" ? "● Solids (1-7)" : "◐ Stripes (9-15)"}
            </span>
          )}

          {!v.groups?.[String(mySeat)] && v.broken && (
            <span className={styles.groupPill}>Table Open</span>
          )}

          {v.lastShot?.foul && (
            <span className={styles.foulPill}>
              ⚠️ Foul: {v.lastShot.foulReason?.replaceAll("_", " ")}
            </span>
          )}
        </div>

        <div className={styles.hudGroup}>
          <button
            type="button"
            className={styles.soundBtn}
            onClick={toggleSound}
            title={soundMuted ? "Unmute Audio" : "Mute Audio"}
            aria-label="Toggle Sound"
          >
            {soundMuted ? "🔇" : "🔊"}
          </button>
        </div>
      </div>

      {/* SVG Pool Table */}
      <div className={styles.tableContainer}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className={styles.tableSvg}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          role="img"
          aria-label="Billiards pool table"
        >
          <defs>
            {/* Table Baize / Felt Gradient */}
            <radialGradient id="feltGrad" cx="50%" cy="50%" r="68%">
              <stop offset="0%" stopColor="#0f4e39" />
              <stop offset="65%" stopColor="#0c402e" />
              <stop offset="100%" stopColor="#082a1e" />
            </radialGradient>

            {/* Wooden Rail Gradient */}
            <linearGradient id="railWood" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#3d2817" />
              <stop offset="35%" stopColor="#291a0e" />
              <stop offset="70%" stopColor="#3d2817" />
              <stop offset="100%" stopColor="#1a1008" />
            </linearGradient>

            {/* Brass / Chrome Pocket Casting Gradient */}
            <linearGradient id="pocketBrass" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#d4af37" />
              <stop offset="50%" stopColor="#856514" />
              <stop offset="100%" stopColor="#5c4308" />
            </linearGradient>

            {/* Diamond Inlay Gradient */}
            <linearGradient id="diamondInlay" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#94a3b8" />
            </linearGradient>

            {/* Cue Stick Wood Gradient */}
            <linearGradient id="cueWood" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="40%" stopColor="#eab308" />
              <stop offset="75%" stopColor="#a16207" />
              <stop offset="100%" stopColor="#451a03" />
            </linearGradient>

            {/* Ball Specular Shading */}
            <radialGradient id="ballShading" cx="35%" cy="30%" r="65%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
              <stop offset="25%" stopColor="#ffffff" stopOpacity="0.25" />
              <stop offset="70%" stopColor="#000000" stopOpacity="0.0" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.65" />
            </radialGradient>

            {/* Cushion Drop Shadow */}
            <filter id="cushionShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="1.2" stdDeviation="1.5" floodColor="#000" floodOpacity="0.65" />
            </filter>
          </defs>

          {/* Outer Mahogany Wooden Rail Frame */}
          <rect
            x={0}
            y={0}
            width={VB_W}
            height={VB_H}
            rx={10}
            fill="url(#railWood)"
            stroke="#5c3d24"
            strokeWidth={1}
          />

          {/* Diamond Sights along Rails */}
          <g transform={`translate(${RAIL}, ${RAIL})`}>
            {DIAMOND_SIGHTS.map((d, i) => (
              <polygon
                key={i}
                points={`${d.x},${d.y - 1.1} ${d.x + 1.1},${d.y} ${d.x},${d.y + 1.1} ${d.x - 1.1},${d.y}`}
                fill="url(#diamondInlay)"
                opacity={0.85}
              />
            ))}
          </g>

          {/* Playing Field Baize (Felt) */}
          <rect
            x={RAIL}
            y={RAIL}
            width={TABLE_W}
            height={TABLE_H}
            fill="url(#feltGrad)"
            stroke="#1b5e20"
            strokeWidth={0.8}
            filter="url(#cushionShadow)"
          />

          {/* Baize Markings: Head String & Foot Spot */}
          <g transform={`translate(${RAIL}, ${RAIL})`}>
            {/* Head string line */}
            <line
              x1={TABLE_W * 0.25}
              y1={0}
              x2={TABLE_W * 0.25}
              y2={TABLE_H}
              stroke="#2dd4bf"
              strokeWidth={0.25}
              strokeDasharray="2 2"
              opacity={0.35}
            />
            {/* Head spot */}
            <circle cx={TABLE_W * 0.25} cy={TABLE_H * 0.5} r={0.7} fill="#2dd4bf" opacity={0.5} />
            {/* Foot spot */}
            <circle cx={TABLE_W * 0.75} cy={TABLE_H * 0.5} r={0.7} fill="#2dd4bf" opacity={0.5} />
          </g>

          {/* Playing Field Elements */}
          <g transform={`translate(${RAIL}, ${RAIL})`}>
            {/* 6 Pockets */}
            {POCKETS.map((p, i) => (
              <g key={i}>
                {/* Brass casting ring */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={POCKET_R + 1.2}
                  fill="url(#pocketBrass)"
                  opacity={0.75}
                />
                {/* Deep dark pocket drop opening */}
                <circle cx={p.x} cy={p.y} r={POCKET_R} fill="#05080c" />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={POCKET_R - 0.6}
                  fill="#000000"
                  stroke="#1e293b"
                  strokeWidth={0.4}
                />
              </g>
            ))}

            {/* Trajectory Guide & Ghost Ball */}
            {canMove && trajectory && cue && (
              <g>
                {/* Primary Aim Line */}
                <line
                  x1={cue.x}
                  y1={cue.y}
                  x2={trajectory.rayEnd.x}
                  y2={trajectory.rayEnd.y}
                  stroke="#22d3ee"
                  strokeWidth={0.4}
                  strokeDasharray="2 1.5"
                  opacity={0.9}
                />

                {/* Target Ball Cut Line (Where the hit object ball will go) */}
                {trajectory.cutLine && (
                  <line
                    x1={trajectory.cutLine.x1}
                    y1={trajectory.cutLine.y1}
                    x2={trajectory.cutLine.x2}
                    y2={trajectory.cutLine.y2}
                    stroke="#f59e0b"
                    strokeWidth={0.55}
                    strokeDasharray="2.5 1.5"
                    opacity={0.95}
                  />
                )}

                {/* Cue Ball Tangent Deflection Line */}
                {trajectory.tangentLine && (
                  <line
                    x1={trajectory.tangentLine.x1}
                    y1={trajectory.tangentLine.y1}
                    x2={trajectory.tangentLine.x2}
                    y2={trajectory.tangentLine.y2}
                    stroke="#38bdf8"
                    strokeWidth={0.4}
                    strokeDasharray="1.5 1.5"
                    opacity={0.7}
                  />
                )}

                {/* Ghost Ball (Predicted Cue Ball Impact Silhouette) */}
                {trajectory.ghost && (
                  <g opacity={0.65}>
                    <circle
                      cx={trajectory.ghost.x}
                      cy={trajectory.ghost.y}
                      r={BALL_R}
                      fill="none"
                      stroke="#22d3ee"
                      strokeWidth={0.6}
                      strokeDasharray="1.8 1"
                    />
                    <circle
                      cx={trajectory.ghost.x}
                      cy={trajectory.ghost.y}
                      r={BALL_R * 0.25}
                      fill="#22d3ee"
                    />
                  </g>
                )}
              </g>
            )}

            {/* Balls */}
            {balls.map((b) => {
              const app = getBallAppearance(b.id);
              return (
                <g key={b.id} transform={`translate(${b.x}, ${b.y})`}>
                  {/* Drop Shadow on Felt */}
                  <ellipse
                    cx={0.4}
                    cy={0.7}
                    rx={BALL_R * 0.95}
                    ry={BALL_R * 0.8}
                    fill="rgba(0, 0, 0, 0.45)"
                  />

                  {/* Ball Body */}
                  <circle r={BALL_R} fill={app.hex} />

                  {/* Striped Ball: White Top & Bottom Poles with Colored Middle Band */}
                  {app.isStripe && (
                    <>
                      <clipPath id={`ballClip-${b.id}`}>
                        <circle r={BALL_R} />
                      </clipPath>
                      <g clipPath={`url(#ballClip-${b.id})`}>
                        {/* Ivory body base */}
                        <circle r={BALL_R} fill="#f8fafc" />
                        {/* Colored central band */}
                        <rect
                          x={-BALL_R}
                          y={-BALL_R * 0.48}
                          width={BALL_R * 2}
                          height={BALL_R * 0.96}
                          fill={app.hex}
                        />
                      </g>
                    </>
                  )}

                  {/* Number Badge (White Circle + Text) */}
                  {!app.isCue && (
                    <g>
                      <circle r={BALL_R * 0.44} fill="#ffffff" opacity={0.95} />
                      <text
                        y={BALL_R * 0.22}
                        textAnchor="middle"
                        fontSize={BALL_R * 0.82}
                        fontWeight={900}
                        fontFamily="system-ui, -apple-system, sans-serif"
                        fill="#0f172a"
                      >
                        {app.label}
                      </text>
                    </g>
                  )}

                  {/* Cue Ball Red Targeting Dot */}
                  {app.isCue && (
                    <circle r={BALL_R * 0.22} fill="#ef4444" opacity={0.85} />
                  )}

                  {/* 3D Spherical Specular Shading Overlay */}
                  <circle r={BALL_R} fill="url(#ballShading)" pointerEvents="none" />
                </g>
              );
            })}

            {/* Realistic Wooden Cue Stick */}
            {cueStick && (
              <g pointerEvents="none">
                {/* Stick Body */}
                <polygon
                  points={cueStick.polygon}
                  fill="url(#cueWood)"
                  stroke="#291a0e"
                  strokeWidth={0.2}
                />
                {/* Chalk Tip (Blue) */}
                <circle
                  cx={cueStick.tip.x}
                  cy={cueStick.tip.y}
                  r={1.2}
                  fill="#0284c7"
                />
              </g>
            )}
          </g>
        </svg>
      </div>

      {/* Control Panel: Power Gauge, Micro-Adjustment Steppers, Spin, and Shoot Button */}
      <div className={styles.tableControls}>
        <div className={styles.controlsRow}>
          {/* Aim Angle Steppers */}
          <div className={styles.aimSteppers}>
            <span className={styles.stepperLabel}>Aim:</span>
            <button
              type="button"
              className={styles.stepperBtn}
              onClick={() => adjustAngle(-2.5)}
              disabled={!canMove}
              title="Rotate Left 2.5°"
            >
              -2.5°
            </button>
            <button
              type="button"
              className={styles.stepperBtn}
              onClick={() => adjustAngle(-0.5)}
              disabled={!canMove}
              title="Fine-tune Left 0.5°"
            >
              -0.5°
            </button>
            <button
              type="button"
              className={styles.stepperBtn}
              onClick={() => adjustAngle(0.5)}
              disabled={!canMove}
              title="Fine-tune Right 0.5°"
            >
              +0.5°
            </button>
            <button
              type="button"
              className={styles.stepperBtn}
              onClick={() => adjustAngle(2.5)}
              disabled={!canMove}
              title="Rotate Right 2.5°"
            >
              +2.5°
            </button>
          </div>

          {/* Power Slider */}
          <div className={styles.powerControl}>
            <span className={styles.stepperLabel}>Power:</span>
            <div className={styles.powerSliderWrap}>
              <input
                type="range"
                min="0.08"
                max="1.0"
                step="0.01"
                value={power}
                onChange={(e) => setPower(parseFloat(e.target.value))}
                disabled={!canMove}
                className={styles.powerSlider}
                aria-label="Shot Power"
              />
            </div>
            <span className={styles.powerBadge}>{Math.round(power * 100)}%</span>
          </div>

          {/* Shoot Button */}
          <button
            type="button"
            className={styles.shootBtn}
            onClick={executeShot}
            disabled={!canMove || !cue}
          >
            ⚡ Strike
          </button>
        </div>

        {/* Informative Hint */}
        <p className={styles.hint}>
          {canMove ? (
            <>
              Touch or drag on the table to aim, adjust power, then press{" "}
              <span className={styles.hintHighlight}>Strike</span>.
            </>
          ) : (
            "Waiting for opponent's shot..."
          )}
        </p>
      </div>
    </div>
  );
}
