"use client";

/**
 * Web Audio API Piece-Specific Chess Sound Synthesizer & Ambient Soundscape.
 * 
 * Generates unique acoustic signatures for each piece type:
 * - PAWN (p): Crisp, short high-frequency wooden tap (~900Hz).
 * - KNIGHT (n): Double rhythmic trotting clack (two-stage wooden impulse).
 * - BISHOP (b): Smooth diagonal acoustic slide sweep (filtered noise glide).
 * - ROOK (r): Deep, solid, heavy wooden thud (~160Hz bass impact).
 * - QUEEN (q): Majestic harmonic chime + wooden resonance (rich 523Hz + 1046Hz overtone).
 * - KING (k): Regal, deep resonant step with warm low pulse (~110Hz).
 * - CAPTURE: Powerful wood-snap impact.
 * - CHECK: Ominous harmonic alert tone.
 * - UNDO: Soft reverse blip.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtxClass) {
      audioCtx = new AudioCtxClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export type ChessPieceType = "p" | "n" | "b" | "r" | "q" | "k";

export function playPieceSound(pieceType: ChessPieceType | string | null | undefined, isCapture = false, isCheck = false) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.7, now);
  masterGain.connect(ctx.destination);

  if (isCheck) {
    // Check warning sound
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  if (isCapture) {
    // Capture snap
    const bufferSize = ctx.sampleRate * 0.08;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.015));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1200;
    noise.connect(filter);
    filter.connect(masterGain);
    noise.start(now);
  }

  const type = (pieceType || "p").toLowerCase();

  switch (type) {
    case "p": {
      // PAWN: Crisp light wooden tap
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(850, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.04);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.05);
      break;
    }

    case "n": {
      // KNIGHT: Double rhythmic trotting clack (two distinct micro-taps)
      [0, 0.06].forEach((delay, idx) => {
        const t = now + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(idx === 0 ? 600 : 750, t);
        osc.frequency.exponentialRampToValueAtTime(250, t + 0.035);
        gain.gain.setValueAtTime(0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(t);
        osc.stop(t + 0.04);
      });
      break;
    }

    case "b": {
      // BISHOP: Smooth diagonal acoustic sliding sweep
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(760, now + 0.09);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.1);
      break;
    }

    case "r": {
      // ROOK: Heavy, deep solid wooden thud (bass impact)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.09);
      gain.gain.setValueAtTime(0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.12);
      break;
    }

    case "q": {
      // QUEEN: Majestic harmonic chime & strike
      [523.25, 1046.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = i === 0 ? "triangle" : "sine";
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.98, now + 0.2);
        gain.gain.setValueAtTime(0.35 / (i + 1), now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.22);
      });
      break;
    }

    case "k": {
      // KING: Regal, deep dignified heavy resonance
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.14);
      gain.gain.setValueAtTime(0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.18);
      break;
    }

    default: {
      // Default wood click
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(500, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.05);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.05);
      break;
    }
  }
}

export function playUndoSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.exponentialRampToValueAtTime(300, now + 0.12);
  gain.gain.setValueAtTime(0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.12);
}

// -----------------------------------------------------------------------------
// CHESS BOARD THEMES
// -----------------------------------------------------------------------------
export type ChessBoardTheme = "emerald" | "walnut" | "obsidian" | "frost";

export interface BoardThemeColors {
  id: ChessBoardTheme;
  nameAr: string;
  nameEn: string;
  lightSq: string;
  darkSq: string;
  border: string;
  accent: string;
}

export const CHESS_THEMES: Record<ChessBoardTheme, BoardThemeColors> = {
  emerald: {
    id: "emerald",
    nameAr: "زمردي بطولات",
    nameEn: "Tournament Emerald",
    lightSq: "#ebecd0",
    darkSq: "#779556",
    border: "#52693a",
    accent: "#ffca28",
  },
  walnut: {
    id: "walnut",
    nameAr: "خشب ملكي فاخر",
    nameEn: "Royal Walnut",
    lightSq: "#eed8b3",
    darkSq: "#b88b4a",
    border: "#735123",
    accent: "#e5a93b",
  },
  obsidian: {
    id: "obsidian",
    nameAr: "أوبسيديان وذهب",
    nameEn: "Obsidian & Gold",
    lightSq: "#2e3440",
    darkSq: "#1a1f29",
    border: "#d4af37",
    accent: "#ffd700",
  },
  frost: {
    id: "frost",
    nameAr: "جليدي حديث",
    nameEn: "Modern Frost",
    lightSq: "#e2e8f0",
    darkSq: "#64748b",
    border: "#334155",
    accent: "#38bdf8",
  },
};
