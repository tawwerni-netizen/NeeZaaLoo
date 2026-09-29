"use client";

import React, { useState } from "react";
import Link from "next/link";
import { type GameDefinition } from "@/lib/games/types";
import { RulesPanel } from "./RulesPanel";
import styles from "./GameCard.module.css";

export interface GameCardProps {
  game: GameDefinition;
  locale?: string;
  className?: string;
}

export function GameCard({ game, locale = "en", className }: GameCardProps) {
  const [rulesOpen, setRulesOpen] = useState(false);

  const slug = game.slug || game.id;
  const name = game.name || game.id;
  const nameAr = game.nameAr || "";
  const duration = game.durationMinutes || game.typicalDuration;
  const playerMode = game.playerMode || game.playerModeDisplay;
  const isCash = game.stakeEligibility?.isCashEligible ?? false;
  const description =
    locale === "ar"
      ? game.descriptionAr || game.shortDescriptionAr
      : game.shortDescription;

  return (
    <>
      <article
        className={[styles.card, className].filter(Boolean).join(" ")}
        aria-labelledby={`game-title-${slug}`}
      >
        <div className={styles.header}>
          <div className={styles.iconWrapper} aria-hidden="true">
            {game.icon}
          </div>
          <div className={styles.titleArea}>
            <h3 id={`game-title-${slug}`} className={styles.title}>
              {name}
            </h3>
            {nameAr && <p className={styles.subtitle}>{nameAr}</p>}
          </div>
          {(game.popular ?? game.isPopular) && (
            <span className={styles.badgePopular}>Hot</span>
          )}
        </div>

        <p className={styles.description}>{description}</p>

        <div className={styles.paramGrid}>
          <span className={styles.paramPill} title="Typical match duration">
            ⏱️ {duration}
          </span>
          <span className={styles.paramPill} title="Player mode">
            👥 {playerMode}
          </span>
          <span className={styles.paramPill} title="Skill factor">
            ⚡ {game.skillLevel}
          </span>
          <span
            className={[
              styles.paramPill,
              isCash ? styles.cashEligible : styles.freeOnly,
            ].join(" ")}
            title="Stake eligibility"
          >
            {isCash ? "💰 Cash & Free" : "🎮 Free Only"}
          </span>
        </div>

        <div className={styles.activeCount}>
          <span className={styles.pulseDot} aria-hidden="true" />
          <span>Active in queue</span>
        </div>

        <div className={styles.actions}>
          <Link
            href={`/${locale}/play/${slug}`}
            className={styles.playBtn}
            aria-label={`Play ${name}`}
          >
            Play {name}
          </Link>
          <button
            type="button"
            className={styles.rulesBtn}
            onClick={() => setRulesOpen(true)}
            aria-label={`View rules for ${name}`}
          >
            Rules
          </button>
        </div>
      </article>

      <RulesPanel
        open={rulesOpen}
        gameSlug={slug}
        onClose={() => setRulesOpen(false)}
      />
    </>
  );
}
