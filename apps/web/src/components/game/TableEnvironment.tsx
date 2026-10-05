"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { setSoundMaterial as setAudioMaterial, type SoundMaterial } from "@/lib/game-audio";
import { getGameThemeTokens, type GameThemeTokens } from "@/lib/games/theme-tokens";
import styles from "./TableEnvironment.module.css";

export type TableTheme = "classic-felt" | "obsidian-arena" | "royal-walnut" | "midnight-neon";
export type GraphicsQuality = "high" | "medium" | "low";
export type { SoundMaterial };

interface VisualSettingsContextType {
  tableTheme: TableTheme;
  setTableTheme: (theme: TableTheme) => void;
  quality: GraphicsQuality;
  setQuality: (quality: GraphicsQuality) => void;
  perspective3D: boolean;
  setPerspective3D: (enabled: boolean) => void;
  soundMaterial: SoundMaterial;
  setSoundMaterial: (mat: SoundMaterial) => void;
  gameTokens: GameThemeTokens | null;
}

const VisualSettingsContext = createContext<VisualSettingsContextType>({
  tableTheme: "classic-felt",
  setTableTheme: () => {},
  quality: "high",
  setQuality: () => {},
  perspective3D: true,
  setPerspective3D: () => {},
  soundMaterial: "wood",
  setSoundMaterial: () => {},
  gameTokens: null,
});

export const useVisualSettings = () => useContext(VisualSettingsContext);

export function TableEnvironmentProvider({
  gameId,
  children,
}: {
  gameId?: string | undefined;
  children: React.ReactNode;
}) {
  const gameTokens = useMemo(() => (gameId ? getGameThemeTokens(gameId) : null), [gameId]);
  const [tableTheme, setTableTheme] = useState<TableTheme>("classic-felt");
  const [quality, setQuality] = useState<GraphicsQuality>("high");
  const [perspective3D, setPerspective3D] = useState<boolean>(true);
  const [soundMaterial, setSoundMaterialState] = useState<SoundMaterial>(
    gameTokens ? gameTokens.soundMaterial : "wood"
  );

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("nizalo_table_theme") as TableTheme | null;
      const savedQuality = localStorage.getItem("nizalo_graphics_quality") as GraphicsQuality | null;
      const saved3D = localStorage.getItem("nizalo_perspective_3d");
      const savedMaterial = localStorage.getItem("nizalo_sound_material") as SoundMaterial | null;

      if (savedTheme && ["classic-felt", "obsidian-arena", "royal-walnut", "midnight-neon"].includes(savedTheme)) {
        setTableTheme(savedTheme);
      }
      if (savedQuality && ["high", "medium", "low"].includes(savedQuality)) {
        setQuality(savedQuality);
      }
      if (saved3D !== null) {
        setPerspective3D(saved3D === "true");
      }
      if (savedMaterial && ["wood", "ceramic", "glass", "metal"].includes(savedMaterial)) {
        setSoundMaterialState(savedMaterial);
        setAudioMaterial(savedMaterial);
      } else if (gameTokens) {
        setSoundMaterialState(gameTokens.soundMaterial);
        setAudioMaterial(gameTokens.soundMaterial);
      }
    } catch {
      // localStorage may fail in restricted environments
    }
  }, [gameTokens]);

  const handleSetTableTheme = (theme: TableTheme) => {
    setTableTheme(theme);
    try { localStorage.setItem("nizalo_table_theme", theme); } catch {}
  };

  const handleSetQuality = (q: GraphicsQuality) => {
    setQuality(q);
    try { localStorage.setItem("nizalo_graphics_quality", q); } catch {}
  };

  const handleSetPerspective3D = (enabled: boolean) => {
    setPerspective3D(enabled);
    try { localStorage.setItem("nizalo_perspective_3d", String(enabled)); } catch {}
  };

  const handleSetSoundMaterial = (mat: SoundMaterial) => {
    setSoundMaterialState(mat);
    setAudioMaterial(mat);
    try { localStorage.setItem("nizalo_sound_material", mat); } catch {}
  };

  const value = useMemo(() => ({
    tableTheme,
    setTableTheme: handleSetTableTheme,
    quality,
    setQuality: handleSetQuality,
    perspective3D,
    setPerspective3D: handleSetPerspective3D,
    soundMaterial,
    setSoundMaterial: handleSetSoundMaterial,
    gameTokens,
  }), [tableTheme, quality, perspective3D, soundMaterial, gameTokens]);

  return (
    <VisualSettingsContext.Provider value={value}>
      <div
        className={`${styles.environment} ${styles[tableTheme]} ${styles[`quality-${quality}`]}`}
        data-quality={quality}
        data-perspective={perspective3D ? "true" : "false"}
        data-game-theme={gameId ?? "default"}
        style={{
          ...(gameTokens
            ? ({
                "--game-primary": gameTokens.palette.primary,
                "--game-accent": gameTokens.palette.accent,
                "--game-bg": gameTokens.palette.bg,
                "--game-surface": gameTokens.palette.surface,
                "--game-border": gameTokens.palette.border,
                "--game-glow": gameTokens.palette.glow,
                "--game-text": gameTokens.palette.text,
                "--game-card-grad": gameTokens.palette.cardGradient,
                "--game-table-rim": gameTokens.palette.tableRim,
                "--game-turn-pulse": gameTokens.turnPulseColor,
              } as React.CSSProperties)
            : {}),
        }}
      >
        <div className={styles.ambientLighting} aria-hidden="true" />
        <div className={styles.tableSurface}>
          {children}
        </div>
      </div>
    </VisualSettingsContext.Provider>
  );
}
