"use client";

import React, { useState } from "react";
import { useVisualSettings, type TableTheme, type GraphicsQuality } from "./TableEnvironment";
import { useI18n } from "@/lib/i18n/context";
import styles from "./GameVisualSettings.module.css";

export function GameVisualSettings() {
  const { t } = useI18n();
  const { tableTheme, setTableTheme, quality, setQuality, perspective3D, setPerspective3D } = useVisualSettings();
  const [isOpen, setIsOpen] = useState(false);

  const themes: { id: TableTheme; label: string; preview: string }[] = [
    { id: "classic-felt", label: "Classic Felt", preview: "#0E4A3C" },
    { id: "obsidian-arena", label: "Obsidian Arena", preview: "#1C2027" },
    { id: "royal-walnut", label: "Royal Walnut", preview: "#4A2E18" },
    { id: "midnight-neon", label: "Midnight Neon", preview: "#1E293B" },
  ];

  const qualities: { id: GraphicsQuality; label: string }[] = [
    { id: "high", label: "High (3D)" },
    { id: "medium", label: "Medium" },
    { id: "low", label: "Low / 2D" },
  ];

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.triggerButton}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Table & Visual Settings"
        title="Visual Settings"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {isOpen && (
        <div className={styles.popover}>
          <div className={styles.popoverHeader}>
            <span className={styles.popoverTitle}>Visuals & Table</span>
            <button type="button" className={styles.closeButton} onClick={() => setIsOpen(false)}>×</button>
          </div>

          <div className={styles.section}>
            <span className={styles.sectionLabel}>Table Theme</span>
            <div className={styles.themeGrid}>
              {themes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={[styles.themeOption, tableTheme === t.id ? styles.selectedTheme : ""].join(" ")}
                  onClick={() => setTableTheme(t.id)}
                >
                  <span className={styles.themeSwatch} style={{ backgroundColor: t.preview }} />
                  <span className={styles.themeName}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <span className={styles.sectionLabel}>Graphics Quality</span>
            <div className={styles.qualityRow}>
              {qualities.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  className={[styles.qualityOption, quality === q.id ? styles.selectedQuality : ""].join(" ")}
                  onClick={() => setQuality(q.id)}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.toggleRow}>
              <span className={styles.sectionLabel}>3D Perspective</span>
              <button
                type="button"
                className={[styles.toggleSwitch, perspective3D ? styles.toggleOn : ""].join(" ")}
                onClick={() => setPerspective3D(!perspective3D)}
                aria-pressed={perspective3D}
              >
                <span className={styles.toggleThumb} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
