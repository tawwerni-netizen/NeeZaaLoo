"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { GameRegistry } from "@/lib/games/registry";
import { RulesetRegistry, getRuleset } from "@nizalo/duel-engine/ruleset";
import styles from "./RulesPanel.module.css";

export interface RulesPanelProps {
  open: boolean;
  gameSlug: string;
  variantSlug?: string;
  onClose: () => void;
}

export function RulesPanel({ open, gameSlug, variantSlug, onClose }: RulesPanelProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "rules" | "timing" | "fairplay">("overview");

  const normalizedSlug = useMemo(() => gameSlug.replace(/-/g, "_"), [gameSlug]);
  const registryEntry = useMemo(() => {
    const reg = RulesetRegistry as Record<string, any>;
    return reg[normalizedSlug] || reg[gameSlug] || null;
  }, [normalizedSlug, gameSlug]);

  const availableVariants = useMemo(() => {
    if (!registryEntry?.variants) return [];
    return Object.values(registryEntry.variants) as any[];
  }, [registryEntry]);

  const [selectedVariant, setSelectedVariant] = useState<string>(
    variantSlug || registryEntry?.defaultVariant || (availableVariants[0]?.variant ?? "default")
  );

  useEffect(() => {
    if (variantSlug) {
      setSelectedVariant(variantSlug);
    } else if (registryEntry?.defaultVariant) {
      setSelectedVariant(registryEntry.defaultVariant);
    }
  }, [variantSlug, registryEntry]);

  const currentRuleset = useMemo(() => {
    try {
      return (getRuleset as any)(gameSlug, selectedVariant);
    } catch {
      return null;
    }
  }, [gameSlug, selectedVariant]);

  const fallbackGame = GameRegistry.get(gameSlug);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;
  if (!fallbackGame && !currentRuleset) return null;

  const displayName = currentRuleset?.name || fallbackGame?.name || gameSlug;
  const displayNameAr = currentRuleset?.nameAr || fallbackGame?.nameAr || "";
  const standard = currentRuleset?.source || fallbackGame?.rulesVersion?.standard || fallbackGame?.rules?.governingStandard || "Official Rules";
  const version = currentRuleset?.version || fallbackGame?.rules?.version || "v1.0";
  const duration = fallbackGame?.durationMinutes || fallbackGame?.typicalDuration || "5-10 min";
  const playerMode = fallbackGame?.playerMode || fallbackGame?.playerModeDisplay || "1v1 Head-to-Head";
  const isCash = currentRuleset?.cashEligible ?? fallbackGame?.stakeEligibility?.isCashEligible ?? true;
  const isTourney = currentRuleset?.tournamentEligible ?? true;

  const doc = currentRuleset?.rulesDocument;
  const rngPolicy = doc?.rngPolicy || (fallbackGame?.rules?.hasRng ? "CSPRNG" : "DETERMINISTIC");
  const rngDesc = doc?.rngDescription || (fallbackGame?.rules?.hasRng ? "Cryptographically verifiable server RNG seeds ensure 100% fair tile/dice outcomes." : "100% pure skill. No dice, no cards, no chance mechanics.");
  const movesText = doc?.legalMoves || doc?.movementAndCapture || "All moves strictly validated server-side by the Nizalo duel engine.";

  const content = (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`${displayName} Rules & Regulations`}
    >
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <span className={styles.gameIcon} aria-hidden="true">
              {fallbackGame?.icon || "🎮"}
            </span>
            <div>
              <h2 className={styles.title}>{displayName}</h2>
              <p className={styles.subtitle}>
                {displayNameAr ? `${displayNameAr} • ` : ""}
                {standard} ({version})
              </p>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close rules panel"
          >
            ×
          </button>
        </div>

        {availableVariants.length > 1 && (
          <div className={styles.variantSelector}>
            <span className={styles.variantLabel}>Variant:</span>
            {availableVariants.map((v) => (
              <button
                key={v.variant}
                type="button"
                className={[styles.variantChip, selectedVariant === v.variant ? styles.variantChipActive : ""].join(" ")}
                onClick={() => setSelectedVariant(v.variant)}
              >
                {v.name}
              </button>
            ))}
          </div>
        )}

        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            className={[styles.tab, activeTab === "overview" ? styles.tabActive : ""].join(" ")}
            onClick={() => setActiveTab("overview")}
            role="tab"
            aria-selected={activeTab === "overview"}
          >
            📖 Overview
          </button>
          <button
            type="button"
            className={[styles.tab, activeTab === "rules" ? styles.tabActive : ""].join(" ")}
            onClick={() => setActiveTab("rules")}
            role="tab"
            aria-selected={activeTab === "rules"}
          >
            ♟️ Rules & Moves
          </button>
          <button
            type="button"
            className={[styles.tab, activeTab === "timing" ? styles.tabActive : ""].join(" ")}
            onClick={() => setActiveTab("timing")}
            role="tab"
            aria-selected={activeTab === "timing"}
          >
            ⏱️ Timing & Turns
          </button>
          <button
            type="button"
            className={[styles.tab, activeTab === "fairplay" ? styles.tabActive : ""].join(" ")}
            onClick={() => setActiveTab("fairplay")}
            role="tab"
            aria-selected={activeTab === "fairplay"}
          >
            🛡️ Fair Play
          </button>
        </div>

        <div className={styles.content}>
          {activeTab === "overview" && (
            <>
              <div className={styles.ruleCard}>
                <h3 className={styles.ruleCardTitle}>Objective & Governance</h3>
                <p className={styles.ruleCardText}>{doc?.overview || fallbackGame?.shortDescription}</p>
                {fallbackGame?.shortDescriptionAr && (
                  <p className={styles.ruleCardText} dir="rtl">{fallbackGame.shortDescriptionAr}</p>
                )}
                <p className={styles.ruleCardText} style={{ marginTop: "4px", opacity: 0.85 }}>
                  Governed by <strong>{standard}</strong>. Sanctioned engine version {currentRuleset?.engineVersion ?? 1} (Effective {currentRuleset?.effectiveDate ?? "2024"}).
                </p>
              </div>

              {currentRuleset?.boardDefinition && (
                <div className={styles.ruleCard}>
                  <h3 className={styles.ruleCardTitle}>Board & Setup</h3>
                  <p className={styles.ruleCardText}>
                    <strong>Format:</strong> {currentRuleset.boardDefinition.type}
                    {currentRuleset.boardDefinition.dimensions ? ` (${currentRuleset.boardDefinition.dimensions.join("×")})` : ""}
                  </p>
                  <p className={styles.ruleCardText}>{currentRuleset.boardDefinition.setupDescription}</p>
                </div>
              )}

              <div className={styles.ruleCard}>
                <h3 className={styles.ruleCardTitle}>Match Parameters & Certification</h3>
                <div className={styles.badgeList}>
                  <span className={styles.badge}>⏱️ {duration}</span>
                  <span className={styles.badge}>👥 {playerMode}</span>
                  <span className={styles.badge}>🔄 {currentRuleset?.turnModel || "ALTERNATING"}</span>
                  <span className={styles.badge}>
                    {isCash ? "💰 Certified Cash Eligible" : "🎮 Free Practice Only"}
                  </span>
                  {isTourney && <span className={styles.badge}>🏆 Tournament Sanctioned</span>}
                  <span className={styles.badge}>🎲 RNG: {rngPolicy}</span>
                </div>
              </div>
            </>
          )}

          {activeTab === "rules" && (
            <>
              <div className={styles.ruleCard}>
                <h3 className={styles.ruleCardTitle}>Legal Moves & Movement</h3>
                <p className={styles.ruleCardText}>{movesText}</p>
                {doc?.scoring && (
                  <div style={{ marginTop: "8px" }}>
                    <h4 className={styles.ruleCardTitle} style={{ fontSize: "12px", marginBottom: "4px" }}>Scoring Rules</h4>
                    <p className={styles.ruleCardText}>{doc.scoring}</p>
                  </div>
                )}
                {doc?.passRule && (
                  <div style={{ marginTop: "8px" }}>
                    <h4 className={styles.ruleCardTitle} style={{ fontSize: "12px", marginBottom: "4px" }}>Pass Rule</h4>
                    <p className={styles.ruleCardText}>{doc.passRule}</p>
                  </div>
                )}
                {doc?.forcedPass && (
                  <div style={{ marginTop: "8px" }}>
                    <h4 className={styles.ruleCardTitle} style={{ fontSize: "12px", marginBottom: "4px" }}>Forced Pass</h4>
                    <p className={styles.ruleCardText}>{doc.forcedPass}</p>
                  </div>
                )}
                {doc?.sanctuaryRule && (
                  <div style={{ marginTop: "8px" }}>
                    <h4 className={styles.ruleCardTitle} style={{ fontSize: "12px", marginBottom: "4px" }}>Sanctuary Rule</h4>
                    <p className={styles.ruleCardText}>{doc.sanctuaryRule}</p>
                  </div>
                )}
                {doc?.specialRules && (
                  <div style={{ marginTop: "8px" }}>
                    <h4 className={styles.ruleCardTitle} style={{ fontSize: "12px", marginBottom: "4px" }}>Special Rules</h4>
                    <p className={styles.ruleCardText}>{doc.specialRules}</p>
                  </div>
                )}
              </div>

              {doc?.winConditions && doc.winConditions.length > 0 && (
                <div className={styles.ruleCard}>
                  <h3 className={styles.ruleCardTitle}>Victory Conditions</h3>
                  <ul className={styles.bulletList}>
                    {doc.winConditions.map((cond: string, i: number) => (
                      <li key={i} className={styles.bulletItem}>✓ {cond}</li>
                    ))}
                  </ul>
                </div>
              )}

              {doc?.drawConditions && doc.drawConditions.length > 0 && (
                <div className={styles.ruleCard}>
                  <h3 className={styles.ruleCardTitle}>Draw Conditions</h3>
                  <ul className={styles.bulletList}>
                    {doc.drawConditions.map((cond: string, i: number) => (
                      <li key={i} className={styles.bulletItem}>= {cond}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {activeTab === "timing" && (
            <div className={styles.ruleCard}>
              <h3 className={styles.ruleCardTitle}>Official Clock & Turn Limits</h3>
              <p className={styles.ruleCardText}>
                • Matches run with official FIDE / tournament-grade server-authoritative countdown clocks.
              </p>
              {currentRuleset?.timeControls && (
                <p className={styles.ruleCardText}>
                  • Default time control: <strong>{currentRuleset.timeControls.defaultProfile}</strong>.
                  {currentRuleset.timeControls.allowedProfiles?.length > 1 && (
                    <span> Allowed profiles: {currentRuleset.timeControls.allowedProfiles.join(", ")}.</span>
                  )}
                </p>
              )}
              <p className={styles.ruleCardText}>
                • Flag Fall: If your clock reaches zero, you flag out and forfeit the match immediately.
              </p>
              <p className={styles.ruleCardText}>
                • Disconnection grace period: 30 seconds to reconnect before forfeiting the match.
              </p>
            </div>
          )}

          {activeTab === "fairplay" && (
            <div className={styles.ruleCard}>
              <h3 className={styles.ruleCardTitle}>Fair Play & Integrity Policy</h3>
              <p className={styles.ruleCardText}>
                • <strong>Zero Assistance:</strong> Zero external chess/game engine or AI assistance permitted during rated and cash play. Matches are subjected to automated behavioral, blunder-correlation, and move-timing analysis.
              </p>
              <p className={styles.ruleCardText}>
                • <strong>Server Authority:</strong> Client inputs are pure intents; all moves, captures, turns, and outcomes are validated and resolved strictly server-side.
              </p>
              <p className={styles.ruleCardText}>
                • <strong>RNG Model:</strong> {rngDesc}
              </p>
              <p className={styles.ruleCardText}>
                • <strong>Immutable Replay Ledger:</strong> Every move is recorded in an append-only event stream with SHA-256 state hashing for instant verification and dispute auditability.
              </p>
              {doc?.fairPlay && (
                <p className={styles.ruleCardText}>
                  • <strong>Engine Guarantee:</strong> {doc.fairPlay}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof window === "undefined") return null;
  return createPortal(content, document.body);
}
