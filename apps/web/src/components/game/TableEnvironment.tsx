"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import styles from "./TableEnvironment.module.css";

export type TableTheme = "classic-felt" | "obsidian-arena" | "royal-walnut" | "midnight-neon";
export type GraphicsQuality = "high" | "medium" | "low";

interface VisualSettingsContextType {
  tableTheme: TableTheme;
  setTableTheme: (theme: TableTheme) => void;
  quality: GraphicsQuality;
  setQuality: (quality: GraphicsQuality) => void;
  perspective3D: boolean;
  setPerspective3D: (enabled: boolean) => void;
}

const VisualSettingsContext = createContext<VisualSettingsContextType>({
  tableTheme: "classic-felt",
  setTableTheme: () => {},
  quality: "high",
  setQuality: () => {},
  perspective3D: true,
  setPerspective3D: () => {},
});

export const useVisualSettings = () => useContext(VisualSettingsContext);

export function TableEnvironmentProvider({ children }: { children: React.ReactNode }) {
  const [tableTheme, setTableTheme] = useState<TableTheme>("classic-felt");
  const [quality, setQuality] = useState<GraphicsQuality>("high");
  const [perspective3D, setPerspective3D] = useState<boolean>(true);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("nizalo_table_theme") as TableTheme | null;
      const savedQuality = localStorage.getItem("nizalo_graphics_quality") as GraphicsQuality | null;
      const saved3D = localStorage.getItem("nizalo_perspective_3d");

      if (savedTheme && ["classic-felt", "obsidian-arena", "royal-walnut", "midnight-neon"].includes(savedTheme)) {
        setTableTheme(savedTheme);
      }
      if (savedQuality && ["high", "medium", "low"].includes(savedQuality)) {
        setQuality(savedQuality);
      }
      if (saved3D !== null) {
        setPerspective3D(saved3D === "true");
      }
    } catch {
      // localStorage may fail in restricted environments
    }
  }, []);

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

  const value = useMemo(() => ({
    tableTheme,
    setTableTheme: handleSetTableTheme,
    quality,
    setQuality: handleSetQuality,
    perspective3D,
    setPerspective3D: handleSetPerspective3D,
  }), [tableTheme, quality, perspective3D]);

  return (
    <VisualSettingsContext.Provider value={value}>
      <div
        className={`${styles.environment} ${styles[tableTheme]} ${styles[`quality-${quality}`]}`}
        data-quality={quality}
        data-perspective={perspective3D ? "true" : "false"}
      >
        <div className={styles.ambientLighting} aria-hidden="true" />
        <div className={styles.tableSurface}>
          {children}
        </div>
      </div>
    </VisualSettingsContext.Provider>
  );
}
