"use client";

import React, { useState } from "react";
import { type GameDefinition } from "@/lib/games/types";
import { RulesPanel } from "./RulesPanel";
import styles from "./GameHero.module.css";

export interface GameHeroProps {
  game: GameDefinition;
  onPlayAction?: () => void;
  playActionLabel?: string;
  className?: string;
}

export function GameHero({
  game,
  onPlayAction,
  playActionLabel = "Play Now",
  className,
}: GameHeroProps) {
  const [rulesOpen, setRulesOpen] = useState(false);

  const slug = game.slug || game.id;
  const name = game.name || game.id;
  const nameAr = game.nameAr || "";
  const standard = game.rulesVersion?.standard || game.rules?.governingStandard || "Official Standard";
  const duration = game.durationMinutes || game.typicalDuration;
  const playerMode = game.playerMode || game.playerModeDisplay;

  return (
    <>
      <section
        className={[styles.hero, className].filter(Boolean).join(" ")}
        aria-label={`${name} Tactical Overview`}
      >
        <div className={styles.mainInfo}>
          <div className={styles.gameIcon} aria-hidden="true">
            {game.icon}
          </div>
          <div className={styles.titleArea}>
            <h1 className={styles.title}>{name}</h1>
            <p className={styles.subtitle}>
              {nameAr ? `${nameAr} • ` : ""}
              {standard}
            </p>
          </div>
        </div>

        <div className={styles.tacticalSpecs}>
          <span className={styles.specBadge} title="Match Duration">
            ⏱️ {duration}
          </span>
          <span className={styles.specBadge} title="Player Configuration">
            👥 {playerMode}
          </span>
          <span className={styles.specBadge} title="Skill Tier">
            ⚡ {game.skillLevel} Skill
          </span>
          <span className={styles.specBadge} title="Engine Authority">
            🛡️ Server Authoritative
          </span>
        </div>

        <div className={styles.actions}>
          {onPlayAction && (
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={onPlayAction}
            >
              ⚔️ {playActionLabel}
            </button>
          )}
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => setRulesOpen(true)}
          >
            📖 Rules Guide
          </button>
        </div>
      </section>

      <RulesPanel
        open={rulesOpen}
        gameSlug={slug}
        onClose={() => setRulesOpen(false)}
      />
    </>
  );
}
