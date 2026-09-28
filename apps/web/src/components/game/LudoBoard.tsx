"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { playDiceRollSound, playCheckerSlideSound } from "@/lib/game-audio";
import { useI18n } from "@/lib/i18n/context";
import styles from "./LudoBoard.module.css";

export type LudoBoardProps = {
  turn: number;
  phase: "ROLL" | "MOVE";
  currentRoll: number | null;
  rollCount: number;
  tokens: number[][];
  legalMoves: number[];
  mySeat: number | null;
  canMove: boolean;
  onMove: (intent: any) => void;
};

// 1-indexed Absolute Path mapping for standard Ludo
const ABSOLUTE_PATH = [
  [-1, -1], // 0 is unused, represents base
  [6, 13], [6, 12], [6, 11], [6, 10], [6, 9], // 1-5
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8], // 6-11
  [0, 7], // 12
  [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], // 13-18
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0], // 19-24
  [7, 0], // 25
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], // 26-31
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6], // 32-37
  [14, 7], // 38
  [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8], // 39-44
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14], // 45-50
  [7, 14], // 51
  [6, 14], // 52
];

const HOME_STRETCHES = [
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]], // Vis 0 (BL, UP)
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],     // Vis 1 (TL, RIGHT)
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],     // Vis 2 (TR, DOWN)
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]], // Vis 3 (BR, LEFT)
];

const BASE_COORDS = [
  [[1, 10], [4, 10], [1, 13], [4, 13]], // Vis 0
  [[1, 1], [4, 1], [1, 4], [4, 4]],     // Vis 1
  [[10, 1], [13, 1], [10, 4], [13, 4]], // Vis 2
  [[10, 10], [13, 10], [10, 13], [13, 13]], // Vis 3
];

const HOME_COORDS = [
  [[6, 8], [7, 8], [6, 7], [7, 7]], // Vis 0
  [[6, 6], [7, 6], [6, 7], [7, 7]], // Vis 1
  [[8, 6], [7, 6], [8, 7], [7, 7]], // Vis 2
  [[8, 8], [7, 8], [8, 7], [7, 7]], // Vis 3
];

const SAFE_SQUARES = [1, 9, 14, 22, 27, 35, 40, 48];

function DicePips({ value }: { value: number }) {
  const pipsMap: Record<number, Array<[number, number]>> = {
    1: [[50, 50]],
    2: [[26, 26], [74, 74]],
    3: [[26, 26], [50, 50], [74, 74]],
    4: [[26, 26], [74, 26], [26, 74], [74, 74]],
    5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
    6: [[26, 25], [26, 50], [26, 75], [74, 25], [74, 50], [74, 75]],
  };

  const coords = pipsMap[value] ?? pipsMap[6] ?? [];
  const isOne = value === 1;

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full p-2 pointer-events-none">
      <defs>
        <radialGradient id="pipGlowOne" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ff6b6b" />
          <stop offset="60%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#991b1b" />
        </radialGradient>
        <radialGradient id="pipGlowWhite" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#f1f5f9" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </radialGradient>
        <filter id="pipShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="1" floodColor="#000000" floodOpacity="0.75" />
        </filter>
      </defs>
      {coords.map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={isOne ? 14 : 9.5}
          fill={isOne ? "url(#pipGlowOne)" : "url(#pipGlowWhite)"}
          filter="url(#pipShadow)"
        />
      ))}
    </svg>
  );
}

export function LudoBoard({
  turn,
  phase,
  currentRoll,
  rollCount,
  tokens,
  legalMoves,
  mySeat,
  canMove,
  onMove,
}: LudoBoardProps) {
  const { locale } = useI18n();
  const isMyTurn = mySeat === turn && canMove;
  const [isRolling, setIsRolling] = useState(false);
  const [lastDisplayedRoll, setLastDisplayedRoll] = useState<number>(6);

  useEffect(() => {
    if (currentRoll !== null) {
      setLastDisplayedRoll(currentRoll);
    }
  }, [currentRoll]);

  useEffect(() => {
    if (currentRoll === 6 && isMyTurn) {
      try {
        confetti({
          particleCount: 25,
          spread: 60,
          origin: { y: 0.8 },
          colors: ['#FFD700', '#FF5A2B', '#22C55E', '#00FFFF']
        });
      } catch {}
    }
  }, [currentRoll, rollCount, isMyTurn]);
  
  const getVisualPlayer = (player: number, totalPlayers: number) => {
    if (totalPlayers === 2) {
      return player === 0 ? 0 : 2;
    }
    return player;
  };

  const getTokenCoords = (visualPlayer: number, relativePos: number, tokenIndex: number): [number, number] => {
    if (relativePos === 0) {
      return (BASE_COORDS[visualPlayer]?.[tokenIndex] as [number, number]) || [0, 0];
    }
    if (relativePos === 57) {
      return (HOME_COORDS[visualPlayer]?.[tokenIndex] as [number, number]) || [7, 7];
    }
    if (relativePos >= 52) {
      const stretchIdx = relativePos - 52;
      return (HOME_STRETCHES[visualPlayer]?.[stretchIdx] as [number, number]) || [7, 7];
    }
    const offset = visualPlayer * 13;
    const abs = ((relativePos - 1 + offset) % 52) + 1;
    return (ABSOLUTE_PATH[abs] as [number, number]) || [0, 0];
  };

  const handleRoll = () => {
    if (isMyTurn && phase === "ROLL" && !isRolling) {
      setIsRolling(true);
      try {
        playDiceRollSound();
      } catch {}
      onMove({ action: "ROLL" });
      setTimeout(() => {
        setIsRolling(false);
      }, 550);
    }
  };

  const handleMove = (tokenIndex: number) => {
    if (isMyTurn && phase === "MOVE" && legalMoves.includes(tokenIndex)) {
      try {
        playCheckerSlideSound();
      } catch {}
      onMove({ action: "MOVE", tokenIndex });
    }
  };

  const myPlayerIndex = mySeat !== null ? mySeat : 0;
  const numPlayers = tokens.length || 2;
  const opponents = Array.from({ length: numPlayers }).map((_, i) => i).filter(p => p !== myPlayerIndex);

  const getPlayerName = (p: number, vis: number) => {
    const colors = ["Fuchsia", "Cyan", "Amber", "Lime"];
    return `Player ${p + 1} (${colors[vis]})`;
  };

  return (
    <div className="w-full flex flex-col items-center gap-6 py-4 font-sans select-none overflow-hidden">
      {/* Top Bar / Opponent Info */}
      <div className="flex w-full max-w-[650px] justify-between items-start px-2 gap-4">
        <div className="flex flex-wrap gap-2 flex-1">
          {opponents.map(p => {
            const vis = getVisualPlayer(p, numPlayers);
            return (
              <div key={p} className={`${styles.playerInfo} ${turn === p ? styles.playerInfoActive : ""} ${styles[`color${vis}`]}`}>
                <div className={styles.playerDot}></div>
                <span className={styles.playerName}>{getPlayerName(p, vis)}</span>
              </div>
            );
          })}
        </div>
        <div className="text-gray-400 font-mono text-sm whitespace-nowrap mt-2">
          {phase === "ROLL" && turn !== mySeat && "Rolling..."}
          {phase === "MOVE" && turn !== mySeat && "Moving..."}
        </div>
      </div>

      {/* Cyberpunk Board Container */}
      <div className={styles.boardContainer}>
        <div className={styles.glowBackdrop}></div>
        
        <div className={styles.grid}>
          {/* Bases as big blocks */}
          <div className={`${styles.base} ${styles.color0}`} style={{ gridColumn: "1 / 7", gridRow: "10 / 16" }}></div>
          <div className={`${styles.base} ${styles.color1}`} style={{ gridColumn: "1 / 7", gridRow: "1 / 7" }}></div>
          <div className={`${styles.base} ${styles.color2}`} style={{ gridColumn: "10 / 16", gridRow: "1 / 7" }}></div>
          <div className={`${styles.base} ${styles.color3}`} style={{ gridColumn: "10 / 16", gridRow: "10 / 16" }}></div>

          {/* Render 15x15 Grid Cells */}
          {Array.from({ length: 225 }).map((_, i) => {
            const x = i % 15;
            const y = Math.floor(i / 15);
            
            // Skip bases entirely
            if ((x < 6 && y > 8) || (x < 6 && y < 6) || (x > 8 && y < 6) || (x > 8 && y > 8)) {
              return null;
            }

            const absIndex = ABSOLUTE_PATH.findIndex(p => p[0] === x && p[1] === y);
            const isPath = absIndex > 0;
            const isSafe = isPath && SAFE_SQUARES.includes(absIndex);
            
            const isCenter = x >= 6 && x <= 8 && y >= 6 && y <= 8;
            
            const isStretch0 = (HOME_STRETCHES[0] as number[][]).some(p => p[0] === x && p[1] === y);
            const isStretch1 = (HOME_STRETCHES[1] as number[][]).some(p => p[0] === x && p[1] === y);
            const isStretch2 = (HOME_STRETCHES[2] as number[][]).some(p => p[0] === x && p[1] === y);
            const isStretch3 = (HOME_STRETCHES[3] as number[][]).some(p => p[0] === x && p[1] === y);

            if (!isPath && !isStretch0 && !isStretch1 && !isStretch2 && !isStretch3 && !isCenter) {
              return null;
            }

            if (isCenter && (x !== 7 || y !== 7)) return null;
            if (isCenter && x === 7 && y === 7) {
               return (
                 <div key={i} className={styles.centerHome} style={{ gridColumn: "7 / 10", gridRow: "7 / 10" }}>
                    <div className={styles.centerStar}></div>
                 </div>
               );
            }

            let cellClass = styles.cell || "";
            let colorClass = "";
            let inner = null;

            if (isStretch0) { cellClass += ` ${styles.homeStretch}`; colorClass = styles.color0 as string; }
            else if (isStretch1) { cellClass += ` ${styles.homeStretch}`; colorClass = styles.color1 as string; }
            else if (isStretch2) { cellClass += ` ${styles.homeStretch}`; colorClass = styles.color2 as string; }
            else if (isStretch3) { cellClass += ` ${styles.homeStretch}`; colorClass = styles.color3 as string; }
            else if (isPath) {
              if (absIndex === 1) { cellClass += ` ${styles.pathStart}`; colorClass = styles.color0 as string; }
              else if (absIndex === 14) { cellClass += ` ${styles.pathStart}`; colorClass = styles.color1 as string; }
              else if (absIndex === 27) { cellClass += ` ${styles.pathStart}`; colorClass = styles.color2 as string; }
              else if (absIndex === 40) { cellClass += ` ${styles.pathStart}`; colorClass = styles.color3 as string; }
              
              if (isSafe) {
                inner = (
                  <div className={styles.safeSquare}>
                    <svg fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </div>
                );
              }
            }

            return (
              <div key={i} className={`${cellClass} ${colorClass}`.trim()} style={{ gridColumn: x + 1, gridRow: y + 1 }}>
                {inner}
              </div>
            );
          })}

          {/* Render Tokens */}
          {tokens.map((playerTokens, player) => {
            const visualPlayer = getVisualPlayer(player, numPlayers);
            return (playerTokens || []).map((pos, i) => {
              const [x, y] = getTokenCoords(visualPlayer, pos, i);
              const isTurn = player === turn;
              const isLegal = phase === "MOVE" && isTurn && mySeat === player && legalMoves.includes(i);
              
              return (
                <motion.div
                  key={`p${player}-t${i}`}
                  layout
                  initial={false}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  onClick={() => isLegal && handleMove(i)}
                  style={{ 
                    gridColumn: Math.floor(x) + 1, 
                    gridRow: Math.floor(y) + 1, 
                    zIndex: 20 + player,
                    padding: '12%',
                  }}
                  className={`relative ${isLegal ? "cursor-pointer" : ""}`}
                >
                  <div 
                    className={`${styles.token} ${styles[`color${visualPlayer}`]} ${isTurn ? styles.tokenMyTurn : ""} ${isLegal ? styles.tokenMovable : ""}`}
                    style={{ position: 'relative', top: 0, left: 0, width: '100%', height: '100%' }}
                  ></div>
                </motion.div>
              );
            });
          })}
        </div>
      </div>

      {/* Bottom Bar / My Controls */}
      <div className="flex w-full max-w-[650px] justify-between items-end px-2">
        <div className="mb-2">
          {(() => {
            const vis = getVisualPlayer(myPlayerIndex, numPlayers);
            return (
              <div className={`${styles.playerInfo} ${turn === myPlayerIndex ? styles.playerInfoActive : ""} ${styles[`color${vis}`]}`}>
                <div className={styles.playerDot}></div>
                <span className={styles.playerName}>
                  {mySeat !== null ? getPlayerName(myPlayerIndex, vis) + " (You)" : "Spectator"}
                </span>
              </div>
            );
          })()}
        </div>
        
        <div className="flex flex-col items-end gap-3">
          {/* 3D Dice & Action Hub */}
          <div className="flex items-center gap-3">
            {/* 3D Neon Die Button */}
            <div className={styles.diceZone}>
              <motion.button
                type="button"
                onClick={handleRoll}
                disabled={!isMyTurn || phase !== "ROLL"}
                className={`${styles.diceBtn} ${isMyTurn && phase === "ROLL" ? styles.diceBtnActive : ""} ${currentRoll === 6 ? styles.diceBtnSix : ""}`}
                animate={isRolling ? {
                  rotateX: [0, 360, 720],
                  rotateY: [0, -360, -720],
                  rotateZ: [0, 90, 0],
                  scale: [1, 1.25, 0.95, 1],
                } : isMyTurn && phase === "ROLL" ? {
                  scale: [1, 1.05, 1],
                  transition: { repeat: Infinity, duration: 1.4, ease: "easeInOut" }
                } : { scale: 1 }}
                transition={{ duration: 0.55, ease: "easeOut" }}
                title={isMyTurn && phase === "ROLL" ? (locale === "ar" ? "اضغط لرمي النرد" : "Click to roll dice") : undefined}
                aria-label="Roll Dice"
              >
                <div className={styles.diceFace}>
                  <DicePips value={currentRoll ?? lastDisplayedRoll} />
                </div>
                {isMyTurn && phase === "ROLL" && (
                  <span className={styles.dicePulseRing} />
                )}
              </motion.button>
            </div>

            {/* Dynamic Status / Action CTA */}
            {isMyTurn && phase === "ROLL" && (
              <button
                type="button"
                onClick={handleRoll}
                className={styles.rollActionBtn}
              >
                <span className={styles.rollActionIcon}>🎲</span>
                <span className={styles.rollActionText}>
                  {locale === "ar" ? "ارْمِ النرد" : "ROLL DICE"}
                </span>
              </button>
            )}

            {isMyTurn && phase === "MOVE" && (
              <div className={styles.movePromptPill}>
                {currentRoll === 6 && (
                  <span className={styles.sixBadge}>
                    🔥 {locale === "ar" ? "٦! رمية إضافية" : "6! Extra Roll"}
                  </span>
                )}
                <span className={styles.moveText}>
                  🎯 {locale === "ar" ? "اختر قاطعة للتحريك" : "Pick token to move"}
                </span>
              </div>
            )}

            {!isMyTurn && (
              <div className={styles.opponentTurnPill}>
                <span className={styles.opponentDot} />
                <span>
                  {phase === "ROLL" 
                    ? (locale === "ar" ? "الخصم يرمي النرد..." : "Opponent rolling...") 
                    : (locale === "ar" ? "الخصم يحرّك قاطعته..." : "Opponent moving...")}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
