"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ChessAmbientPlayer.module.css";

interface AmbientEngine {
  start: () => void;
  stop: () => void;
  setVolume: (val: number) => void;
  setTrack: (trackIndex: number) => void;
}

function createProceduralAmbientEngine(): AmbientEngine {
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let isPlaying = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let currentTrack = 0;

  // Chord progressions for chess concentration (C Major / A Minor calm ambient)
  const TRACKS = [
    // Track 0: Lo-Fi Ambient (Warm relaxing triads)
    [
      [261.63, 329.63, 392.0], // C
      [220.0, 261.63, 329.63], // Am
      [174.61, 220.0, 261.63], // F
      [196.0, 246.94, 293.66], // G
    ],
    // Track 1: Deep Ethereal Drone (Atmospheric space)
    [
      [130.81, 196.0, 261.63], // C low
      [110.0, 164.81, 220.0],  // A low
      [146.83, 220.0, 293.66], // D low
      [98.0, 146.83, 196.0],   // G low
    ],
    // Track 2: Classical Zen (Meditative chords)
    [
      [329.63, 392.0, 493.88], // Em
      [261.63, 329.63, 392.0], // C
      [293.66, 369.99, 440.0], // D
      [246.94, 311.13, 369.99],// B
    ],
  ];

  let chordIndex = 0;

  function playChord() {
    if (!ctx || !masterGain || !isPlaying) return;
    const chords = TRACKS[currentTrack] ?? TRACKS[0] ?? [];
    if (chords.length === 0) return;
    const notes = chords[chordIndex % chords.length] ?? [];
    if (notes.length === 0) return;
    chordIndex++;

    const now = ctx.currentTime;
    const chordDuration = 5.0; // 5 seconds per smooth evolving chord

    notes.forEach((freq, idx) => {
      if (!ctx || !masterGain) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = currentTrack === 1 ? "sine" : "triangle";
      osc.frequency.setValueAtTime(freq, now);

      // Add gentle detuning for chorus/warmth
      osc.detune.setValueAtTime((idx - 1) * 4, now);

      // Smooth attack and release envelope
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.06, now + 1.8);
      gain.gain.exponentialRampToValueAtTime(0.001, now + chordDuration);

      // Subtle low-pass filtering for soft acoustic feel
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 650;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + chordDuration);
    });
  }

  return {
    start() {
      if (isPlaying) return;
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) return;

      if (!ctx) {
        ctx = new AudioCtxClass();
        masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0.4, ctx.currentTime);
        masterGain.connect(ctx.destination);
      }
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      isPlaying = true;
      playChord();
      timer = setInterval(playChord, 4800);
    },
    stop() {
      isPlaying = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (masterGain && ctx) {
        masterGain.gain.setValueAtTime(0, ctx.currentTime);
      }
    },
    setVolume(val: number) {
      if (masterGain && ctx) {
        masterGain.gain.setValueAtTime(Math.max(0, Math.min(1, val)), ctx.currentTime);
      }
    },
    setTrack(trackIndex: number) {
      currentTrack = trackIndex;
      chordIndex = 0;
    },
  };
}

export function ChessAmbientPlayer() {
  const engineRef = useRef<AmbientEngine | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.4);
  const [trackIndex, setTrackIndex] = useState(0);
  const [minimized, setMinimized] = useState(true);

  const TRACK_NAMES = [
    { ar: "استرخاء الشطرنج (Lo-Fi)", en: "Lo-Fi Chess Chill" },
    { ar: "تركيز عميق (Deep Ambient)", en: "Deep Focus Ambient" },
    { ar: "كلاسيكيات التركيز (Classical Zen)", en: "Classical Zen" },
  ];

  useEffect(() => {
    engineRef.current = createProceduralAmbientEngine();
    return () => {
      engineRef.current?.stop();
    };
  }, []);

  function togglePlay() {
    if (!engineRef.current) return;
    if (isPlaying) {
      engineRef.current.stop();
      setIsPlaying(false);
    } else {
      engineRef.current.start();
      engineRef.current.setVolume(volume);
      setIsPlaying(true);
    }
  }

  function handleVolume(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseFloat(e.target.value);
    setVolume(val);
    engineRef.current?.setVolume(val);
  }

  function handleTrack(idx: number) {
    setTrackIndex(idx);
    engineRef.current?.setTrack(idx);
  }

  return (
    <div className={styles.container}>
      {minimized ? (
        <button
          type="button"
          className={`${styles.miniBtn} ${isPlaying ? styles.miniBtnActive : ""}`}
          onClick={() => setMinimized(false)}
          title="موسيقى التركيز والشطرنج"
        >
          <span className={styles.icon}>{isPlaying ? "🎵" : "🔇"}</span>
          <span className={styles.miniLabel}>{isPlaying ? "موسيقى نشطة" : "موسيقى"}</span>
        </button>
      ) : (
        <div className={styles.card}>
          <div className={styles.header}>
            <div className={styles.titleRow}>
              <span className={styles.titleIcon}>🎧</span>
              <span className={styles.title}>موسيقى التركيز الهادئة</span>
            </div>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={() => setMinimized(true)}
              aria-label="تصغير"
            >
              ✕
            </button>
          </div>

          <div className={styles.body}>
            <div className={styles.trackList}>
              {TRACK_NAMES.map((t, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`${styles.trackBtn} ${trackIndex === idx ? styles.trackBtnActive : ""}`}
                  onClick={() => handleTrack(idx)}
                >
                  <span className={styles.trackIndicator}>{trackIndex === idx ? "▶" : "•"}</span>
                  <span>{t.ar}</span>
                </button>
              ))}
            </div>

            <div className={styles.controls}>
              <button
                type="button"
                className={`${styles.playBtn} ${isPlaying ? styles.playBtnActive : ""}`}
                onClick={togglePlay}
              >
                {isPlaying ? "⏸ إيقاف مؤقت" : "▶ تشغيل الموسيقى"}
              </button>

              <div className={styles.volumeRow}>
                <span className={styles.volIcon}>🔊</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={handleVolume}
                  className={styles.slider}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
