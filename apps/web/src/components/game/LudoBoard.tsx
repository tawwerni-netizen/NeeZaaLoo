"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import {
  playDiceRollSound,
  playCheckerSlideSound,
  playCheckerHitSound,
  playLudoMatchFoundSound,
} from "@/lib/game-audio";
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

// 1-indexed Absolute Path mapping for standard clockwise Ludo (15x15 coordinates)
// x is horizontal (0 to 14, left to right)
// y is vertical (0 to 14, top to bottom)
const ABSOLUTE_PATH: Array<[number, number]> = [
  [-1, -1], // 0 is base
  [6, 13], [6, 12], [6, 11], [6, 10], [6, 9], // 1-5 (Bottom arm, left col, moving up)
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8], // 6-11 (Left arm, bottom row, moving left)
  [0, 7], // 12 (Left arm, end)
  [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], // 13-18 (Left arm, top row, moving right)
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0], // 19-24 (Top arm, left col, moving up)
  [7, 0], // 25 (Top arm, end)
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], // 26-31 (Top arm, right col, moving down)
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6], // 32-37 (Right arm, top row, moving right)
  [14, 7], // 38 (Right arm, end)
  [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8], // 39-44 (Right arm, bottom row, moving left)
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14], // 45-50 (Bottom arm, right col, moving down)
  [7, 14], // 51 (Bottom arm, end)
  [6, 14], // 52 (Bottom arm, turn into 1)
];

// Home stretches for each visual player:
// Vis 0: Red (Bottom-Left) -> Col 7, rows 13 up to 9
// Vis 1: Blue (Top-Left) -> Row 7, cols 1 to 5
// Vis 2: Green (Top-Right) -> Col 7, rows 1 to 5
// Vis 3: Yellow (Bottom-Right) -> Row 7, cols 13 down to 9
const HOME_STRETCHES: Array<Array<[number, number]>> = [
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]], // Vis 0 (Red)
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],     // Vis 1 (Blue)
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],     // Vis 2 (Green)
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]], // Vis 3 (Yellow)
];

// Safe squares on the board (Star squares)
const SAFE_SQUARES_ABS = [1, 9, 14, 22, 27, 35, 40, 48];

type PawnColor = "red" | "blue" | "green" | "yellow";

const COLOR_MAP: Record<number, PawnColor> = {
  0: "red",
  1: "blue",
  2: "green",
  3: "yellow",
};

// 3D Glossy SVG Pawn matching reference image
export function LudoPawn({
  color,
  isMovable,
  isTurn,
  size = "100%",
}: {
  color: PawnColor;
  isMovable?: boolean;
  isTurn?: boolean;
  size?: string | number;
}) {
  const colorDefs = {
    red: {
      headStart: "#ff7b7b",
      headMid: "#e60000",
      headEnd: "#800000",
      bodyStart: "#ff5252",
      bodyMid: "#d50000",
      bodyEnd: "#660000",
      collar: "#b71c1c",
      stroke: "#4a0000",
    },
    blue: {
      headStart: "#7dd3fc",
      headMid: "#0284c7",
      headEnd: "#034d75",
      bodyStart: "#38bdf8",
      bodyMid: "#0284c7",
      bodyEnd: "#023b5a",
      collar: "#0270a8",
      stroke: "#013654",
    },
    green: {
      headStart: "#86efac",
      headMid: "#16a34a",
      headEnd: "#14532d",
      bodyStart: "#4ade80",
      bodyMid: "#16a34a",
      bodyEnd: "#0f3d20",
      collar: "#15803d",
      stroke: "#0b3319",
    },
    yellow: {
      headStart: "#fef08a",
      headMid: "#eab308",
      headEnd: "#a16207",
      bodyStart: "#fde047",
      bodyMid: "#eab308",
      bodyEnd: "#713f12",
      collar: "#ca8a04",
      stroke: "#452203",
    },
  }[color];

  const id = `pawn-${color}`;

  return (
    <svg
      viewBox="0 0 100 120"
      style={{ width: size, height: size, overflow: "visible" }}
      className={`transition-all duration-200 pointer-events-none select-none ${
        isMovable ? styles.pawnMovableSvg : ""
      }`}
    >
      <defs>
        <radialGradient id={`${id}-head`} cx="38%" cy="30%" r="65%">
          <stop offset="0%" stopColor={colorDefs.headStart} />
          <stop offset="40%" stopColor={colorDefs.headMid} />
          <stop offset="100%" stopColor={colorDefs.headEnd} />
        </radialGradient>
        <radialGradient id={`${id}-body`} cx="38%" cy="40%" r="65%">
          <stop offset="0%" stopColor={colorDefs.bodyStart} />
          <stop offset="50%" stopColor={colorDefs.bodyMid} />
          <stop offset="100%" stopColor={colorDefs.bodyEnd} />
        </radialGradient>
      </defs>

      {/* Ground Shadow */}
      <ellipse cx="50" cy="110" rx="28" ry="7" fill="rgba(0,0,0,0.28)" />

      {/* Bell / Pear Body */}
      <path
        d="M 22 98 C 22 84, 36 62, 43 52 L 57 52 C 64 62, 78 84, 78 98 C 78 106, 22 106, 22 98 Z"
        fill={`url(#${id}-body)`}
        stroke={colorDefs.stroke}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* Collar Ring */}
      <ellipse
        cx="50"
        cy="52"
        rx="14"
        ry="4"
        fill={colorDefs.collar}
        stroke={colorDefs.stroke}
        strokeWidth="2"
      />

      {/* Spherical Head */}
      <circle
        cx="50"
        cy="30"
        r="20"
        fill={`url(#${id}-head)`}
        stroke={colorDefs.stroke}
        strokeWidth="2.5"
      />

      {/* Specular Shine on Head */}
      <ellipse
        cx="43"
        cy="22"
        rx="6"
        ry="3.5"
        fill="#ffffff"
        opacity="0.88"
        transform="rotate(-30 43 22)"
      />
      <circle cx="41" cy="20" r="2.2" fill="#ffffff" opacity="0.95" />

      {/* Specular Curved Highlight on Body Left */}
      <path
        d="M 33 60 C 29 72, 29 84, 34 94"
        stroke="#ffffff"
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.65"
      />

      {/* Subtle Rim Highlight on Body Right */}
      <path
        d="M 68 62 C 72 74, 71 85, 66 94"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.25"
      />
    </svg>
  );
}

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
        <radialGradient id="pipRed" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ff5252" />
          <stop offset="60%" stopColor="#e60000" />
          <stop offset="100%" stopColor="#990000" />
        </radialGradient>
        <radialGradient id="pipDark" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#334155" />
          <stop offset="60%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </radialGradient>
      </defs>
      {coords.map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={isOne ? 14 : 9.5}
          fill={isOne ? "url(#pipRed)" : "url(#pipDark)"}
        />
      ))}
    </svg>
  );
}

const LUDO_I18N: Record<string, {
  knockout: string;
  mode1v1: string;
  mode4p: string;
  searching4p: string;
  matchFound4p: string;
  rollDice: string;
  clickToRoll: string;
  extraRoll: string;
  pickToken: string;
  opponentRolling: string;
  opponentMoving: string;
  you: string;
  spectator: string;
  playerPrefix: string;
  colors: [string, string, string, string];
}> = {
  ar: {
    knockout: "💥 أكل قاطعة وإعادتها للقاعدة!",
    mode1v1: "👤 1 ضد 1 (مبارزة سريعة)",
    mode4p: "👥 4 لاعبين (طابور أونلاين رباعي)",
    searching4p: "📡 جاري البحث عن 4 لاعبين أونلاين... (3/4)",
    matchFound4p: "🟢 اكتملت الغرفة الرباعية! انطلاق السباق الأسطوري!",
    rollDice: "ارْمِ النرد",
    clickToRoll: "اضغط لرمي النرد",
    extraRoll: "🔥 ٦! رمية إضافية",
    pickToken: "🎯 اختر قاطعة للتحريك",
    opponentRolling: "الخصم يرمي النرد...",
    opponentMoving: "الخصم يحرّك قاطعته...",
    you: "أنت",
    spectator: "متفرّج",
    playerPrefix: "اللاعب",
    colors: ["الأحمر", "الأزرق", "الأخضر", "الأصفر"],
  },
  en: {
    knockout: "💥 KNOCKOUT TO BASE!",
    mode1v1: "👤 1 vs 1 Blitz Duel",
    mode4p: "👥 4-Player Online Queue",
    searching4p: "📡 Searching for 4 online players... (3/4)",
    matchFound4p: "🟢 4-Player Match Found! Race Started!",
    rollDice: "ROLL DICE",
    clickToRoll: "Click to roll dice",
    extraRoll: "🔥 6! Extra Roll",
    pickToken: "🎯 Pick token to move",
    opponentRolling: "Opponent rolling...",
    opponentMoving: "Opponent moving...",
    you: "You",
    spectator: "Spectator",
    playerPrefix: "Player",
    colors: ["Red", "Blue", "Green", "Yellow"],
  },
  es: {
    knockout: "💥 ¡FICHA CAPTURADA A LA BASE!",
    mode1v1: "👤 1 vs 1 Duelo Rápido",
    mode4p: "👥 Cola online de 4 jugadores",
    searching4p: "📡 Buscando 4 jugadores online... (3/4)",
    matchFound4p: "🟢 ¡Partida de 4 jugadores encontrada! ¡Comienza la carrera!",
    rollDice: "TIRAR DADO",
    clickToRoll: "Haz clic para tirar el dado",
    extraRoll: "🔥 ¡6! Tirada extra",
    pickToken: "🎯 Elige ficha para mover",
    opponentRolling: "El rival lanza el dado...",
    opponentMoving: "El rival mueve ficha...",
    you: "Tú",
    spectator: "Espectador",
    playerPrefix: "Jugador",
    colors: ["Rojo", "Azul", "Verde", "Amarillo"],
  },
  fr: {
    knockout: "💥 PION RENVOYÉ À LA BASE !",
    mode1v1: "👤 Duel Éclair 1 c. 1",
    mode4p: "👥 File en ligne à 4 joueurs",
    searching4p: "📡 Recherche de 4 joueurs en ligne... (3/4)",
    matchFound4p: "🟢 Partie à 4 trouvée ! La course commence !",
    rollDice: "LANCER LE DÉ",
    clickToRoll: "Cliquez pour lancer le dé",
    extraRoll: "🔥 6 ! Lancer bonus",
    pickToken: "🎯 Choisissez un pion à déplacer",
    opponentRolling: "L'adversaire lance le dé...",
    opponentMoving: "L'adversaire déplace son pion...",
    you: "Vous",
    spectator: "Spectateur",
    playerPrefix: "Joueur",
    colors: ["Rouge", "Bleu", "Vert", "Jaune"],
  },
  hi: {
    knockout: "💥 गोटी कटकर बेस में वापस!",
    mode1v1: "👤 1 बनाम 1 त्वरित द्वंद्व",
    mode4p: "👥 4-खिलाड़ी ऑनलाइन कतार",
    searching4p: "📡 4 ऑनलाइन खिलाड़ियों की तलाश... (3/4)",
    matchFound4p: "🟢 4-खिलाड़ी मैच मिला! रेस शुरू!",
    rollDice: "पासा फेंकें",
    clickToRoll: "पासा फेंकने के लिए क्लिक करें",
    extraRoll: "🔥 6! अतिरिक्त चाल",
    pickToken: "🎯 चलने के लिए गोटी चुनें",
    opponentRolling: "विरोधी पासा फेंक रहा है...",
    opponentMoving: "विरोधी गोटी चल रहा है...",
    you: "आप",
    spectator: "दर्शक",
    playerPrefix: "खिलाड़ी",
    colors: ["लाल", "नीला", "हरा", "पीला"],
  },
  zh: {
    knockout: "💥 成功截击打回停机坪！",
    mode1v1: "👤 1对1 极速对决",
    mode4p: "👥 4人在线队列",
    searching4p: "📡 正在匹配4名在线玩家... (3/4)",
    matchFound4p: "🟢 4人房间已满！竞速开赛！",
    rollDice: "掷骰子",
    clickToRoll: "点击掷骰",
    extraRoll: "🔥 6点！再掷一次",
    pickToken: "🎯 请选择要移动的棋子",
    opponentRolling: "对手正在掷骰...",
    opponentMoving: "对手正在走子...",
    you: "你",
    spectator: "旁观者",
    playerPrefix: "玩家",
    colors: ["红", "蓝", "绿", "黄"],
  },
};

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
  const strings = (LUDO_I18N[locale] ?? LUDO_I18N["en"])!;
  const isMyTurn = mySeat === turn && canMove;
  const [isRolling, setIsRolling] = useState(false);
  const [lastDisplayedRoll, setLastDisplayedRoll] = useState<number>(6);
  const [knockoutEvent, setKnockoutEvent] = useState<string | null>(null);
  const prevTokensRef = useRef<number[][] | null>(null);

  useEffect(() => {
    if (prevTokensRef.current && tokens) {
      tokens.forEach((playerTokens, pIdx) => {
        const prevPlayerTokens = prevTokensRef.current?.[pIdx];
        if (prevPlayerTokens) {
          playerTokens.forEach((pos, tIdx) => {
            const prevPos = prevPlayerTokens[tIdx];
            if (prevPos !== undefined && prevPos > 0 && prevPos < 52 && pos === 0) {
              try { playCheckerHitSound(); } catch {}
              setKnockoutEvent(strings.knockout);
              setTimeout(() => setKnockoutEvent(null), 2000);
            }
          });
        }
      });
    }
    prevTokensRef.current = tokens ? tokens.map(arr => [...arr]) : null;
  }, [tokens, strings.knockout]);

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
          colors: ["#ffd700", "#e60000", "#2da816", "#0074e4"],
        });
      } catch {}
    }
  }, [currentRoll, rollCount, isMyTurn]);

  const [ludoMode, setLudoMode] = useState<"1v1" | "4p">("1v1");
  const [matchmakingStatus, setMatchmakingStatus] = useState<string | null>(null);

  const numPlayers = ludoMode === "4p" ? 4 : (tokens?.length || 2);

  // Map seat index to visual quadrant (0: Red/BL, 1: Blue/TL, 2: Green/TR, 3: Yellow/BR)
  const getVisualPlayer = (player: number, totalPlayers: number): number => {
    if (totalPlayers === 2) {
      return player === 0 ? 0 : 2;
    }
    return player;
  };

  // Map visual quadrant back to player seat index
  const getPlayerFromVisual = (vis: number, totalPlayers: number): number | null => {
    if (totalPlayers === 2) {
      if (vis === 0) return 0;
      if (vis === 2) return 1;
      return null;
    }
    return vis < totalPlayers ? vis : null;
  };

  const getTokenCoords = (visualPlayer: number, relativePos: number): [number, number] => {
    if (relativePos === 0) {
      return [-1, -1]; // Handled in base card
    }
    if (relativePos === 57) {
      return [7, 7]; // Center goal
    }
    if (relativePos >= 52) {
      const stretchIdx = relativePos - 52;
      const stretch = HOME_STRETCHES[visualPlayer] ?? HOME_STRETCHES[0];
      const target = stretch?.[stretchIdx];
      return target ?? [7, 7];
    }
    const offset = visualPlayer * 13;
    const abs = ((relativePos - 1 + offset) % 52) + 1;
    const pathPoint = ABSOLUTE_PATH[abs];
    return pathPoint ?? [0, 0];
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

  function handleModeChange(mode: "1v1" | "4p") {
    setLudoMode(mode);
    if (mode === "4p") {
      setMatchmakingStatus(strings.searching4p);
      setTimeout(() => {
        playLudoMatchFoundSound();
        setMatchmakingStatus(strings.matchFound4p);
        setTimeout(() => setMatchmakingStatus(null), 3000);
      }, 1200);
    } else {
      setMatchmakingStatus(null);
    }
  }

  const myPlayerIndex = mySeat !== null ? mySeat : 0;
  const opponents = Array.from({ length: numPlayers })
    .map((_, i) => i)
    .filter((p) => p !== myPlayerIndex);

  const getPlayerName = (p: number, vis: number) => {
    return `${strings.playerPrefix} ${p + 1} (${strings.colors[vis] ?? strings.colors[0]})`;
  };

  // Build active track tokens list
  type ActiveToken = {
    player: number;
    tokenIndex: number;
    pos: number;
    visualPlayer: number;
    color: PawnColor;
    x: number;
    y: number;
    isLegal: boolean;
    isTurn: boolean;
  };

  const activeTrackTokens: ActiveToken[] = [];
  const homeGoalTokens: Record<number, number[]> = { 0: [], 1: [], 2: [], 3: [] };

  (tokens || []).forEach((playerTokens, player) => {
    const visualPlayer = getVisualPlayer(player, numPlayers);
    const color = COLOR_MAP[visualPlayer] ?? "red";
    const isTurn = player === turn;

    playerTokens.forEach((pos, tokenIndex) => {
      if (pos >= 1 && pos <= 56) {
        const [x, y] = getTokenCoords(visualPlayer, pos);
        const isLegal = phase === "MOVE" && isTurn && mySeat === player && legalMoves.includes(tokenIndex);
        activeTrackTokens.push({
          player,
          tokenIndex,
          pos,
          visualPlayer,
          color,
          x,
          y,
          isLegal,
          isTurn,
        });
      } else if (pos === 57) {
        const goalList = homeGoalTokens[visualPlayer];
        if (goalList) {
          goalList.push(tokenIndex);
        }
      }
    });
  });

  // Render a base quadrant (6x6 cells)
  const renderBase = (vis: number, gridCol: string, gridRow: string, baseClass: string, color: PawnColor) => {
    const player = getPlayerFromVisual(vis, numPlayers);
    const playerTokens = player !== null ? tokens?.[player] : null;
    const isPlayerTurn = Boolean(player !== null && turn === player);

    return (
      <div className={`${styles.base} ${baseClass}`} style={{ gridColumn: gridCol, gridRow: gridRow }}>
        <div className={styles.baseCard}>
          {[0, 1, 2, 3].map((slotIdx) => {
            const hasPawn = Boolean(playerTokens && playerTokens[slotIdx] === 0);
            const isLegal = Boolean(
              hasPawn &&
              isPlayerTurn &&
              mySeat === player &&
              phase === "MOVE" &&
              legalMoves.includes(slotIdx)
            );

            return (
              <div
                key={slotIdx}
                className={`${styles.baseSlot} ${isLegal ? styles.baseSlotMovable : ""}`}
                onClick={() => isLegal && handleMove(slotIdx)}
                title={isLegal ? strings.pickToken : undefined}
              >
                {hasPawn ? (
                  <motion.div
                    className={styles.pawnWrapper}
                    animate={isLegal ? { y: [0, -3, 0] } : {}}
                    transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }}
                  >
                    <LudoPawn color={color} isMovable={isLegal} isTurn={isPlayerTurn} />
                  </motion.div>
                ) : (
                  <div className={styles.emptySlotIndicator} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col items-center gap-5 py-3 font-sans select-none overflow-hidden">
      {/* 1v1 vs 4P Matchmaking Switcher */}
      <div className={styles.ludoModeBar}>
        <button
          type="button"
          className={[styles.ludoModeTab, ludoMode === "1v1" ? styles.ludoModeTabActive : ""].join(" ")}
          onClick={() => handleModeChange("1v1")}
        >
          {strings.mode1v1}
        </button>
        <button
          type="button"
          className={[styles.ludoModeTab, ludoMode === "4p" ? styles.ludoModeTabActive : ""].join(" ")}
          onClick={() => handleModeChange("4p")}
        >
          {strings.mode4p}
        </button>
      </div>

      {matchmakingStatus && (
        <div className={styles.matchmakingRadarPill}>
          <span className={styles.radarDot} />
          <span>{matchmakingStatus}</span>
        </div>
      )}

      {/* Top Bar / Opponent Info */}
      <div className="flex w-full max-w-[580px] justify-between items-center px-2 gap-3">
        <div className="flex flex-wrap gap-2 flex-1">
          {opponents.map((p) => {
            const vis = getVisualPlayer(p, numPlayers);
            const colorName = COLOR_MAP[vis] ?? "red";
            const colorClass = styles[`color${colorName.charAt(0).toUpperCase() + colorName.slice(1)}`];

            return (
              <div
                key={p}
                className={`${styles.playerInfo} ${turn === p ? styles.playerInfoActive : ""} ${colorClass || ""}`}
              >
                <div className={styles.playerDot} />
                <span className={styles.playerName}>{getPlayerName(p, vis)}</span>
              </div>
            );
          })}
        </div>
        <div className="text-gray-500 font-mono text-sm whitespace-nowrap">
          {phase === "ROLL" && turn !== mySeat && strings.opponentRolling}
          {phase === "MOVE" && turn !== mySeat && strings.opponentMoving}
        </div>
      </div>

      {/* LUDO CLASSIC LUXURY BOARD CONTAINER */}
      <div className={styles.boardContainer}>
        {knockoutEvent && <div className={styles.knockoutBanner}>{knockoutEvent}</div>}

        <div className={styles.grid}>
          {/* Top-Left Base: Blue (Vis 1) */}
          {renderBase(1, "1 / 7", "1 / 7", styles.baseBlue ?? "", "blue")}

          {/* Top-Right Base: Green (Vis 2) */}
          {renderBase(2, "10 / 16", "1 / 7", styles.baseGreen ?? "", "green")}

          {/* Bottom-Left Base: Red (Vis 0) */}
          {renderBase(0, "1 / 7", "10 / 16", styles.baseRed ?? "", "red")}

          {/* Bottom-Right Base: Yellow (Vis 3) */}
          {renderBase(3, "10 / 16", "10 / 16", styles.baseYellow ?? "", "yellow")}

          {/* Center 3x3 Goal */}
          <div
            className={styles.centerHome}
            style={{ gridColumn: "7 / 10", gridRow: "7 / 10" }}
          >
            <svg viewBox="0 0 300 300" className={styles.centerGoalSvg}>
              {/* Top Triangle: Green */}
              <polygon points="0,0 300,0 150,150" fill="#2da816" />
              {/* Right Triangle: Yellow */}
              <polygon points="300,0 300,300 150,150" fill="#fbb004" />
              {/* Bottom Triangle: Red */}
              <polygon points="0,300 300,300 150,150" fill="#e60000" />
              {/* Left Triangle: Blue */}
              <polygon points="0,0 0,300 150,150" fill="#0074e4" />

              {/* Dividing Lines */}
              <line x1="0" y1="0" x2="300" y2="300" stroke="#1e293b" strokeWidth="2" />
              <line x1="300" y1="0" x2="0" y2="300" stroke="#1e293b" strokeWidth="2" />
              <rect x="0" y="0" width="300" height="300" fill="none" stroke="#1e293b" strokeWidth="2.5" />
            </svg>

            {/* Finished Home Tokens Layer */}
            <div className={styles.centerGoalTokensLayer}>
              {/* Green Tokens (Top) */}
              <div className={`${styles.centerTriangleTokens} ${styles.centerTopTokens}`}>
                {(homeGoalTokens[2] ?? []).map((tIdx) => (
                  <div key={tIdx} style={{ width: "32%", height: "90%" }}>
                    <LudoPawn color="green" size="100%" />
                  </div>
                ))}
              </div>
              {/* Yellow Tokens (Right) */}
              <div className={`${styles.centerTriangleTokens} ${styles.centerRightTokens}`}>
                {(homeGoalTokens[3] ?? []).map((tIdx) => (
                  <div key={tIdx} style={{ width: "90%", height: "32%" }}>
                    <LudoPawn color="yellow" size="100%" />
                  </div>
                ))}
              </div>
              {/* Red Tokens (Bottom) */}
              <div className={`${styles.centerTriangleTokens} ${styles.centerBottomTokens}`}>
                {(homeGoalTokens[0] ?? []).map((tIdx) => (
                  <div key={tIdx} style={{ width: "32%", height: "90%" }}>
                    <LudoPawn color="red" size="100%" />
                  </div>
                ))}
              </div>
              {/* Blue Tokens (Left) */}
              <div className={`${styles.centerTriangleTokens} ${styles.centerLeftTokens}`}>
                {(homeGoalTokens[1] ?? []).map((tIdx) => (
                  <div key={tIdx} style={{ width: "90%", height: "32%" }}>
                    <LudoPawn color="blue" size="100%" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Render 15x15 Track Cells */}
          {Array.from({ length: 225 }).map((_, i) => {
            const x = i % 15;
            const y = Math.floor(i / 15);

            // Skip corner bases and center goal
            if (
              (x < 6 && y < 6) ||
              (x > 8 && y < 6) ||
              (x < 6 && y > 8) ||
              (x > 8 && y > 8) ||
              (x >= 6 && x <= 8 && y >= 6 && y <= 8)
            ) {
              return null;
            }

            const absIndex = ABSOLUTE_PATH.findIndex((p) => p[0] === x && p[1] === y);
            const isPath = absIndex > 0;
            const isSafe = isPath && SAFE_SQUARES_ABS.includes(absIndex);

            // Check home stretch
            const isStretch0 = Boolean(HOME_STRETCHES[0]?.some((p) => p[0] === x && p[1] === y));
            const isStretch1 = Boolean(HOME_STRETCHES[1]?.some((p) => p[0] === x && p[1] === y));
            const isStretch2 = Boolean(HOME_STRETCHES[2]?.some((p) => p[0] === x && p[1] === y));
            const isStretch3 = Boolean(HOME_STRETCHES[3]?.some((p) => p[0] === x && p[1] === y));

            let cellClass = styles.cell;
            let innerIcon: React.ReactNode = null;

            // Direction Chevrons:
            if (x === 0 && y === 7) {
              // Blue right arrow
              innerIcon = (
                <svg viewBox="0 0 24 24" className="w-[60%] h-[60%] pointer-events-none">
                  <path d="M 8 5 L 16 12 L 8 19" fill="none" stroke="#0074e4" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              );
            } else if (x === 7 && y === 0) {
              // Green down arrow
              innerIcon = (
                <svg viewBox="0 0 24 24" className="w-[60%] h-[60%] pointer-events-none">
                  <path d="M 5 8 L 12 16 L 19 8" fill="none" stroke="#2da816" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              );
            } else if (x === 14 && y === 7) {
              // Yellow left arrow
              innerIcon = (
                <svg viewBox="0 0 24 24" className="w-[60%] h-[60%] pointer-events-none">
                  <path d="M 16 5 L 8 12 L 16 19" fill="none" stroke="#fbb004" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              );
            } else if (x === 7 && y === 14) {
              // Red up arrow
              innerIcon = (
                <svg viewBox="0 0 24 24" className="w-[60%] h-[60%] pointer-events-none">
                  <path d="M 5 16 L 12 8 L 19 16" fill="none" stroke="#e60000" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              );
            }

            // Colors & Starting / Safe Stars:
            if (isStretch0) {
              cellClass += ` ${styles.stretchRed}`;
            } else if (isStretch1) {
              cellClass += ` ${styles.stretchBlue}`;
            } else if (isStretch2) {
              cellClass += ` ${styles.stretchGreen}`;
            } else if (isStretch3) {
              cellClass += ` ${styles.stretchYellow}`;
            } else if (isPath) {
              if (absIndex === 1) {
                // Red Start
                cellClass += ` ${styles.startRed}`;
                innerIcon = (
                  <svg viewBox="0 0 24 24" className={styles.starIcon}>
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                );
              } else if (absIndex === 14) {
                // Blue Start
                cellClass += ` ${styles.startBlue}`;
                innerIcon = (
                  <svg viewBox="0 0 24 24" className={styles.starIcon}>
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                );
              } else if (absIndex === 27) {
                // Green Start
                cellClass += ` ${styles.startGreen}`;
                innerIcon = (
                  <svg viewBox="0 0 24 24" className={styles.starIcon}>
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                );
              } else if (absIndex === 40) {
                // Yellow Start
                cellClass += ` ${styles.startYellow}`;
                innerIcon = (
                  <svg viewBox="0 0 24 24" className={styles.starIcon}>
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                );
              } else if (isSafe) {
                // Gray Safe Square
                cellClass += ` ${styles.safeSquare}`;
                innerIcon = (
                  <svg viewBox="0 0 24 24" className={styles.starIcon}>
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                );
              }
            }

            // Check if user has a legal token on this cell for direct cell-tap fallback
            const legalTokensOnCell = activeTrackTokens.filter(
              (t) => t.x === x && t.y === y && t.player === mySeat && t.isLegal
            );
            const firstLegal = legalTokensOnCell[0];
            const hasCellLegalMove = Boolean(isMyTurn && phase === "MOVE" && firstLegal);

            return (
              <div
                key={i}
                className={`${cellClass} ${hasCellLegalMove ? styles.cellClickable : ""}`}
                style={{ gridColumn: x + 1, gridRow: y + 1 }}
                onClick={() => {
                  if (hasCellLegalMove && firstLegal) {
                    handleMove(firstLegal.tokenIndex);
                  }
                }}
              >
                {innerIcon}
              </div>
            );
          })}

          {/* Render Active Track Tokens with Multi-Token Clustering */}
          {activeTrackTokens.map((token) => {
            const sameCellTokens = activeTrackTokens.filter(
              (t) => t.x === token.x && t.y === token.y
            );
            const count = sameCellTokens.length;
            const idx = sameCellTokens.indexOf(token);

            let offsetTransform = "scale(0.92)";
            let zIndex = token.isLegal ? 35 : 20 + idx;

            if (count === 2) {
              offsetTransform =
                idx === 0
                  ? "translate(-22%, -18%) scale(0.76)"
                  : "translate(22%, 18%) scale(0.76)";
            } else if (count === 3) {
              offsetTransform =
                idx === 0
                  ? "translate(-22%, -22%) scale(0.68)"
                  : idx === 1
                  ? "translate(22%, -22%) scale(0.68)"
                  : "translate(0%, 20%) scale(0.68)";
            } else if (count >= 4) {
              offsetTransform =
                idx === 0
                  ? "translate(-22%, -22%) scale(0.64)"
                  : idx === 1
                  ? "translate(22%, -22%) scale(0.64)"
                  : idx === 2
                  ? "translate(-22%, 22%) scale(0.64)"
                  : "translate(22%, 22%) scale(0.64)";
            }

            return (
              <div
                key={`track-p${token.player}-t${token.tokenIndex}`}
                style={{
                  gridColumn: token.x + 1,
                  gridRow: token.y + 1,
                  zIndex,
                }}
                className="relative flex items-center justify-center pointer-events-none"
              >
                <div
                  style={{
                    transform: offsetTransform,
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: token.isLegal ? "auto" : "none",
                  }}
                  className={token.isLegal ? "cursor-pointer" : ""}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (token.isLegal) {
                      handleMove(token.tokenIndex);
                    }
                  }}
                  title={token.isLegal ? strings.pickToken : undefined}
                >
                  <LudoPawn
                    color={token.color}
                    isMovable={token.isLegal}
                    isTurn={token.isTurn}
                    size="88%"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Bar / My Controls */}
      <div className="flex w-full max-w-[580px] justify-between items-center px-2">
        <div>
          {(() => {
            const vis = getVisualPlayer(myPlayerIndex, numPlayers);
            const colorName = COLOR_MAP[vis] ?? "red";
            const colorClass = styles[`color${colorName.charAt(0).toUpperCase() + colorName.slice(1)}`];

            return (
              <div
                className={`${styles.playerInfo} ${turn === myPlayerIndex ? styles.playerInfoActive : ""} ${colorClass || ""}`}
              >
                <div className={styles.playerDot} />
                <span className={styles.playerName}>
                  {mySeat !== null ? `${getPlayerName(myPlayerIndex, vis)} (${strings.you})` : strings.spectator}
                </span>
              </div>
            );
          })()}
        </div>

        <div className="flex items-center gap-3">
          {/* 3D Dice Button */}
          <div className={styles.diceZone}>
            <motion.button
              type="button"
              onClick={handleRoll}
              disabled={!isMyTurn || phase !== "ROLL"}
              className={`${styles.diceBtn} ${isMyTurn && phase === "ROLL" ? styles.diceBtnActive : ""} ${currentRoll === 6 ? styles.diceBtnSix : ""}`}
              animate={
                isRolling
                  ? {
                      rotateX: [0, 360, 720],
                      rotateY: [0, -360, -720],
                      rotateZ: [0, 90, 0],
                      scale: [1, 1.2, 0.96, 1],
                    }
                  : isMyTurn && phase === "ROLL"
                  ? {
                      scale: [1, 1.05, 1],
                      transition: { repeat: Infinity, duration: 1.4, ease: "easeInOut" },
                    }
                  : { scale: 1 }
              }
              transition={{ duration: 0.55, ease: "easeOut" }}
              title={isMyTurn && phase === "ROLL" ? strings.clickToRoll : undefined}
              aria-label="Roll Dice"
            >
              <div className={styles.diceFace}>
                <DicePips value={currentRoll ?? lastDisplayedRoll} />
              </div>
              {isMyTurn && phase === "ROLL" && <span className={styles.dicePulseRing} />}
            </motion.button>
          </div>

          {/* Roll Action CTA */}
          {isMyTurn && phase === "ROLL" && (
            <button type="button" onClick={handleRoll} className={styles.rollActionBtn}>
              <span className={styles.rollActionIcon}>🎲</span>
              <span>{strings.rollDice}</span>
            </button>
          )}

          {/* Move Status CTA */}
          {isMyTurn && phase === "MOVE" && (
            <div className={styles.movePromptPill}>
              {currentRoll === 6 && <span className={styles.sixBadge}>{strings.extraRoll}</span>}
              <span className={styles.moveText}>{strings.pickToken}</span>
            </div>
          )}

          {/* Opponent Status CTA */}
          {!isMyTurn && (
            <div className={styles.opponentTurnPill}>
              <span className={styles.opponentDot} />
              <span>
                {phase === "ROLL" ? strings.opponentRolling : strings.opponentMoving}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
