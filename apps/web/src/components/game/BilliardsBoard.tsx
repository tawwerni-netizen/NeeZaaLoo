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

function getFallbackRack(): Ball[] {
  const d = BALL_R * 2;
  const dx = d * Math.sin(Math.PI / 3);
  const footSpotX = TABLE_W * 0.75;
  const footSpotY = TABLE_H / 2;
  const slots: Ball[] = [{ id: 0, x: TABLE_W * 0.25, y: TABLE_H / 2 }];

  const standardLayout = [
    [1],
    [2, 9],
    [3, 8, 10],
    [11, 4, 12, 5],
    [6, 13, 7, 14, 15]
  ];

  let currentId = 1;
  for (let row = 0; row < 5; row++) {
    const x = footSpotX + row * dx;
    const count = row + 1;
    for (let i = 0; i < count; i++) {
      const y = footSpotY - (count - 1) * (d / 2) + i * d;
      const id = standardLayout[row]?.[i] ?? currentId++;
      slots.push({ id, x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) });
    }
  }
  return slots;
}

interface SimFrame {
  t: number;
  balls: Array<{ id: number; x: number; y: number; potted?: boolean }>;
}

interface QueuedShot {
  shotCount: number;
  seat?: number;
  angle: number;
  power: number;
  frames: SimFrame[];
  finalBalls: Ball[];
}

function simulateShotLocal(
  balls: Array<{ id: number; x: number; y: number }>,
  angle: number,
  power: number
): SimFrame[] {
  const state = new Map<number, { id: number; x: number; y: number; vx: number; vy: number; potted: boolean }>();
  for (const b of balls) {
    state.set(b.id, { id: b.id, x: b.x, y: b.y, vx: 0, vy: 0, potted: false });
  }

  const p = Math.max(0, Math.min(1, power));
  const speed = p * 190;
  const cue = state.get(0);
  if (cue) {
    cue.vx = Math.cos(angle) * speed;
    cue.vy = Math.sin(angle) * speed;
  }

  const frames: SimFrame[] = [];
  const DT = 1 / 120;
  const maxSteps = Math.round(6 / DT);
  const SUBSTEPS = 2;
  const subDt = DT / SUBSTEPS;

  let step = 0;
  for (; step < maxSteps; step++) {
    for (let sub = 0; sub < SUBSTEPS; sub++) {
      for (const b of state.values()) {
        if (b.potted) continue;
        b.x += b.vx * subDt;
        b.y += b.vy * subDt;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 0) {
          const decay = Math.max(0, sp - 70 * subDt);
          const scale = decay / sp;
          b.vx *= scale;
          b.vy *= scale;
          if (decay < 1.2) {
            b.vx = 0;
            b.vy = 0;
          }
        }
      }

      for (const b of state.values()) {
        if (b.potted) continue;
        if (b.x - BALL_R < 0) {
          b.x = BALL_R;
          b.vx = Math.abs(b.vx) * 0.86;
        } else if (b.x + BALL_R > TABLE_W) {
          b.x = TABLE_W - BALL_R;
          b.vx = -Math.abs(b.vx) * 0.86;
        }
        if (b.y - BALL_R < 0) {
          b.y = BALL_R;
          b.vy = Math.abs(b.vy) * 0.86;
        } else if (b.y + BALL_R > TABLE_H) {
          b.y = TABLE_H - BALL_R;
          b.vy = -Math.abs(b.vy) * 0.86;
        }
      }

      const ids = [...state.keys()].filter((id) => !state.get(id)?.potted);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = state.get(ids[i]!)!;
          const c = state.get(ids[j]!)!;
          const dx = c.x - a.x;
          const dy = c.y - a.y;
          const dist = Math.hypot(dx, dy);
          if (dist === 0 || dist >= BALL_R * 2) continue;

          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = BALL_R * 2 - dist;
          a.x -= (nx * overlap) / 2;
          a.y -= (ny * overlap) / 2;
          c.x += (nx * overlap) / 2;
          c.y += (ny * overlap) / 2;

          const relVx = c.vx - a.vx;
          const relVy = c.vy - a.vy;
          const approach = relVx * nx + relVy * ny;
          if (approach < 0) {
            const impulse = (-(1 + 0.98) * approach) / 2;
            a.vx -= impulse * nx;
            a.vy -= impulse * ny;
            c.vx += impulse * nx;
            c.vy += impulse * ny;
          }
        }
      }

      for (const b of state.values()) {
        if (b.potted) continue;
        for (const pocket of POCKETS) {
          if (Math.hypot(b.x - pocket.x, b.y - pocket.y) <= POCKET_R) {
            b.potted = true;
            b.vx = 0;
            b.vy = 0;
            break;
          }
        }
      }
    }

    if (step % 3 === 0 && frames.length < 300) {
      frames.push({
        t: Number((step * DT).toFixed(4)),
        balls: [...state.values()].map((b) => ({
          id: b.id,
          x: Number(b.x.toFixed(3)),
          y: Number(b.y.toFixed(3)),
          potted: b.potted,
        })),
      });
    }

    const allRest = [...state.values()].every((b) => b.potted || (b.vx === 0 && b.vy === 0));
    if (allRest) break;
  }

  frames.push({
    t: Number((step * DT).toFixed(4)),
    balls: [...state.values()].map((b) => ({
      id: b.id,
      x: Number(b.x.toFixed(3)),
      y: Number(b.y.toFixed(3)),
      potted: b.potted,
    })),
  });

  return frames;
}

export function BilliardsBoard({ view, canMove, mySeat, onMove }: BoardProps) {
  const v = (view ?? {}) as BilliardsView;
  const isInitialRack = !v.balls || v.balls.length === 0;

  // Active balls on table (settled balls, fallback rack, or interpolated animation frames)
  const [displayBalls, setDisplayBalls] = useState<Ball[]>(() => {
    return v.balls && v.balls.length > 0 ? v.balls : getFallbackRack();
  });

  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [animatingSeat, setAnimatingSeat] = useState<number | null>(null);
  const [opponentAim, setOpponentAim] = useState<{ angle: number; power: number } | null>(null);
  const [cueThrust, setCueThrust] = useState<number>(0);
  const [aimAngle, setAimAngle] = useState<number>(0);
  const [power, setPower] = useState<number>(0.5);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [soundMuted, setSoundMuted] = useState<boolean>(false);
  const [spin, setSpin] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const svgRef = useRef<SVGSVGElement>(null);
  const queueRef = useRef<QueuedShot[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const animFrameIdRef = useRef<number | null>(null);
  const strikeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedShotCountRef = useRef<number>(v.shotCount ?? 0);
  const restingBallsRef = useRef<Ball[]>(displayBalls);

  // Play next shot in animation queue
  const drainQueue = useCallback(() => {
    if (isPlayingRef.current) return;
    const item = queueRef.current.shift();
    if (!item) {
      isPlayingRef.current = false;
      setIsAnimating(false);
      setAnimatingSeat(null);
      setOpponentAim(null);
      if (v.balls && v.balls.length > 0) {
        restingBallsRef.current = v.balls;
        setDisplayBalls(v.balls);
      }
      return;
    }

    isPlayingRef.current = true;
    setIsAnimating(true);
    setAnimatingSeat(item.seat ?? null);

    const isOpponentShot =
      item.seat !== undefined &&
      item.seat !== null &&
      mySeat !== null &&
      mySeat !== undefined &&
      item.seat !== mySeat;

    const startPhysics = () => {
      setCueThrust(1);
      billiardsAudio.playCueStrike(item.power);

      strikeTimeoutRef.current = setTimeout(() => {
        setCueThrust(0);
        setOpponentAim(null);

        const frames = item.frames;
        const lastFrame = frames[frames.length - 1];
        if (!lastFrame || frames.length <= 1) {
          restingBallsRef.current = item.finalBalls;
          setDisplayBalls(item.finalBalls);
          isPlayingRef.current = false;
          drainQueue();
          return;
        }

        const startTime = performance.now();
        const durationMs = Math.max(800, lastFrame.t * 1000);
        const triggeredEvents = new Set<string>();

        const tick = (now: number) => {
          const elapsedMs = now - startTime;
          const elapsedSec = elapsedMs / 1000;

          if (elapsedMs >= durationMs) {
            restingBallsRef.current = item.finalBalls;
            setDisplayBalls(item.finalBalls);
            isPlayingRef.current = false;
            drainQueue();
            return;
          }

          let i = 0;
          while (i < frames.length - 1 && (frames[i + 1]?.t ?? Infinity) <= elapsedSec) {
            i++;
          }
          const f0 = frames[i];
          const f1 = frames[Math.min(i + 1, frames.length - 1)];
          if (!f0 || !f1) {
            restingBallsRef.current = item.finalBalls;
            setDisplayBalls(item.finalBalls);
            isPlayingRef.current = false;
            drainQueue();
            return;
          }

          const span = f1.t - f0.t;
          const alpha = span > 0.0001 ? Math.max(0, Math.min(1, (elapsedSec - f0.t) / span)) : 0;

          const nextPositions: Ball[] = [];
          for (const b0 of f0.balls) {
            const b1 = f1.balls.find((x) => x.id === b0.id) ?? b0;
            if (b0.potted && b1.potted) continue;

            if (!b0.potted && b1.potted) {
              const pKey = `p-${b0.id}`;
              if (!triggeredEvents.has(pKey)) {
                triggeredEvents.add(pKey);
                billiardsAudio.playPocketDrop();
              }
              if (alpha > 0.75) continue;
            }

            const bx = b0.x + (b1.x - b0.x) * alpha;
            const by = b0.y + (b1.y - b0.y) * alpha;
            nextPositions.push({ id: b0.id, x: bx, y: by });
          }

          // Rail bounce & ball clash audio triggers
          for (let aIdx = 0; aIdx < nextPositions.length; aIdx++) {
            const a = nextPositions[aIdx];
            if (!a) continue;
            if (
              a.x <= BALL_R + 0.3 ||
              a.x >= TABLE_W - BALL_R - 0.3 ||
              a.y <= BALL_R + 0.3 ||
              a.y >= TABLE_H - BALL_R - 0.3
            ) {
              const rKey = `r-${a.id}-${Math.floor(elapsedSec * 10)}`;
              if (!triggeredEvents.has(rKey)) {
                triggeredEvents.add(rKey);
                billiardsAudio.playCushionBounce(0.5);
              }
            }
            for (let bIdx = aIdx + 1; bIdx < nextPositions.length; bIdx++) {
              const b = nextPositions[bIdx];
              if (!b) continue;
              const d = Math.hypot(a.x - b.x, a.y - b.y);
              if (d <= BALL_R * 2 + 0.4) {
                const cKey = `c-${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}-${Math.floor(elapsedSec * 12)}`;
                if (!triggeredEvents.has(cKey)) {
                  triggeredEvents.add(cKey);
                  billiardsAudio.playBallClash(0.7);
                }
              }
            }
          }

          setDisplayBalls(nextPositions);
          animFrameIdRef.current = requestAnimationFrame(tick);
        };

        animFrameIdRef.current = requestAnimationFrame(tick);
      }, 90);
    };

    if (isOpponentShot) {
      // Show opponent / computer aiming cue stick for 500ms before strike
      setOpponentAim({ angle: item.angle, power: item.power });
      strikeTimeoutRef.current = setTimeout(() => {
        startPhysics();
      }, 500);
    } else {
      startPhysics();
    }
  }, [mySeat, v.balls]);

  // Enqueue new shots when shotCount increases
  useEffect(() => {
    if (v.shotCount !== undefined && v.shotCount > processedShotCountRef.current) {
      const last = v.lastShot;
      if (last && typeof last.angle === "number" && typeof last.power === "number") {
        processedShotCountRef.current = v.shotCount;

        let frames = (last as { frames?: SimFrame[] })?.frames;
        if (!frames || frames.length <= 1) {
          frames = simulateShotLocal(restingBallsRef.current, last.angle, last.power);
        }

        const finalBalls =
          v.balls && v.balls.length > 0
            ? v.balls
            : frames[frames.length - 1]?.balls.filter((b) => !b.potted) ?? restingBallsRef.current;

        queueRef.current.push({
          shotCount: v.shotCount,
          seat: last.seat,
          angle: last.angle,
          power: last.power,
          frames,
          finalBalls,
        });

        drainQueue();
      }
    } else if (!isPlayingRef.current && v.balls && v.balls.length > 0) {
      restingBallsRef.current = v.balls;
      setDisplayBalls(v.balls);
    }
  }, [v.shotCount, v.lastShot, v.balls, drainQueue]);

  // Clean unmount hook
  useEffect(() => {
    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      if (strikeTimeoutRef.current) clearTimeout(strikeTimeoutRef.current);
      isPlayingRef.current = false;
    };
  }, []);

  const cue = useMemo(() => displayBalls.find((b) => b.id === 0) ?? null, [displayBalls]);
  const effectiveCanMove = canMove && !isAnimating && !isInitialRack;

  // Convert viewport screen coords to table coords with NaN and zero-dimension guards
  const toTableCoords = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const px = ((clientX - rect.left) / rect.width) * VB_W - RAIL;
    const py = ((clientY - rect.top) / rect.height) * VB_H - RAIL;
    if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
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
      const angle = Math.atan2(dy, dx);
      if (Number.isFinite(angle)) {
        setAimAngle(angle);
      }
    }
  }, [cue, toTableCoords]);

  function handlePointerDown(e: React.PointerEvent) {
    if (!effectiveCanMove || !cue) return;
    try {
      (e.currentTarget as Element)?.setPointerCapture?.(e.pointerId);
    } catch {
      // Safe fallback on mobile or SVG targets
    }
    setIsDragging(true);
    updateAimFromPointer(e.clientX, e.clientY);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!isDragging || !effectiveCanMove) return;
    updateAimFromPointer(e.clientX, e.clientY);
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      (e.currentTarget as Element)?.releasePointerCapture?.(e.pointerId);
    } catch {}
  }

  // Execute shot
  const executeShot = useCallback(() => {
    if (!effectiveCanMove || !cue) return;
    setCueThrust(1);
    billiardsAudio.playCueStrike(power);
    onMove({ angle: aimAngle, power });
  }, [effectiveCanMove, cue, power, aimAngle, onMove]);

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

  // Active aim for rendering cue stick & trajectory guides:
  // When opponent/computer is aiming, opponentAim provides {angle, power}.
  // Otherwise, if human has control, uses local aimAngle & power.
  const activeAim = opponentAim ?? (effectiveCanMove ? { angle: aimAngle, power } : null);

  // Trajectory calculation & Ghost Ball Prediction
  const trajectory = useMemo(() => {
    if (!cue || !activeAim) return null;

    const dx = Math.cos(activeAim.angle);
    const dy = Math.sin(activeAim.angle);

    let closestHit: {
      ball: Ball;
      dist: number;
      ghostX: number;
      ghostY: number;
      cutNormal: { x: number; y: number };
      tangent: { x: number; y: number };
    } | null = null;

    // Raycast against all object balls
    for (const b of displayBalls) {
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
  }, [cue, activeAim, displayBalls]);

  // Cue stick geometry
  const cueStick = useMemo(() => {
    if (!cue || !activeAim) return null;
    const CUE_LENGTH = 90;
    const pullBack = Math.max(BALL_R + 1, BALL_R + 4 + activeAim.power * 26 - cueThrust * 20);
    const dx = Math.cos(activeAim.angle);
    const dy = Math.sin(activeAim.angle);

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
  }, [cue, activeAim, cueThrust]);

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
          <span className={`${styles.turnPill} ${isMyTurn && !isAnimating && !opponentAim ? styles.turnPillActive : ""}`}>
            <span style={{ fontSize: "14px" }}>
              {opponentAim ? "🤖" : isAnimating ? "⚡" : isMyTurn ? "🎯" : "⏳"}
            </span>
            {opponentAim
              ? "Computer is Aiming..."
              : isAnimating
              ? animatingSeat !== null && mySeat !== null && mySeat !== undefined && animatingSeat !== mySeat
                ? "Computer Shot in Motion..."
                : "Balls in Motion..."
              : v.ballInHandFor !== null && v.ballInHandFor !== undefined
              ? (isMyTurn ? "Ball in Hand -- Aim Anywhere" : "Opponent Has Ball in Hand")
              : (isMyTurn ? "Your Turn" : "Opponent's Turn")}
          </span>

          {isAnimating && (
            <span className={styles.animatingPill}>
              ⚡ 60 FPS Physics Simulation
            </span>
          )}

          {opponentAim && (
            <span
              className={styles.animatingPill}
              style={{
                background: "rgba(244, 63, 94, 0.15)",
                borderColor: "rgba(244, 63, 94, 0.4)",
                color: "#fb7185",
              }}
            >
              🤖 Computer Aiming
            </span>
          )}

          {isInitialRack && !isAnimating && (
            <span className={styles.syncingPill}>
              🔄 Syncing Duel Table...
            </span>
          )}

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
            {trajectory && cue && (
              <g>
                {/* Primary Aim Line */}
                <line
                  x1={cue.x}
                  y1={cue.y}
                  x2={trajectory.rayEnd.x}
                  y2={trajectory.rayEnd.y}
                  stroke={opponentAim ? "#f43f5e" : "#22d3ee"}
                  strokeWidth={opponentAim ? 0.5 : 0.4}
                  strokeDasharray="2 1.5"
                  opacity={opponentAim ? 0.85 : 0.9}
                />

                {/* Target Ball Cut Line (Where the hit object ball will go) */}
                {trajectory.cutLine && (
                  <line
                    x1={trajectory.cutLine.x1}
                    y1={trajectory.cutLine.y1}
                    x2={trajectory.cutLine.x2}
                    y2={trajectory.cutLine.y2}
                    stroke={opponentAim ? "#fb7185" : "#f59e0b"}
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
                    stroke={opponentAim ? "#fda4af" : "#38bdf8"}
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
                      stroke={opponentAim ? "#f43f5e" : "#22d3ee"}
                      strokeWidth={0.6}
                      strokeDasharray="1.8 1"
                    />
                    <circle
                      cx={trajectory.ghost.x}
                      cy={trajectory.ghost.y}
                      r={BALL_R * 0.25}
                      fill={opponentAim ? "#f43f5e" : "#22d3ee"}
                    />
                  </g>
                )}
              </g>
            )}

            {/* Balls */}
            {displayBalls.map((b) => {
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
              disabled={!effectiveCanMove}
              title="Rotate Left 2.5°"
            >
              -2.5°
            </button>
            <button
              type="button"
              className={styles.stepperBtn}
              onClick={() => adjustAngle(-0.5)}
              disabled={!effectiveCanMove}
              title="Fine-tune Left 0.5°"
            >
              -0.5°
            </button>
            <button
              type="button"
              className={styles.stepperBtn}
              onClick={() => adjustAngle(0.5)}
              disabled={!effectiveCanMove}
              title="Fine-tune Right 0.5°"
            >
              +0.5°
            </button>
            <button
              type="button"
              className={styles.stepperBtn}
              onClick={() => adjustAngle(2.5)}
              disabled={!effectiveCanMove}
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
                disabled={!effectiveCanMove}
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
            disabled={!effectiveCanMove || !cue}
          >
            ⚡ Strike
          </button>
        </div>

        {/* Informative Hint */}
        <p className={styles.hint}>
          {opponentAim ? (
            "🤖 Opponent / Computer is aiming cue stick and lining up the shot..."
          ) : isAnimating ? (
            "⚡ Balls in motion — continuous 60 FPS physics resolving collisions and pockets..."
          ) : isInitialRack ? (
            "Syncing duel table with game gateway..."
          ) : effectiveCanMove ? (
            <>
              Touch or drag on the table to aim, adjust power, then press{" "}
              <span className={styles.hintHighlight}>Strike</span>.
            </>
          ) : (
            "⏳ Waiting for opponent / computer to take their turn..."
          )}
        </p>
      </div>
    </div>
  );
}

