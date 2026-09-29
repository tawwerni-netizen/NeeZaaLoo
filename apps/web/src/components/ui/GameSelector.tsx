"use client";

import React, { useState, useMemo } from "react";
import { GameRegistry } from "@/lib/games/registry";
import { type GameDefinition, type GameCategory } from "@/lib/games/types";
import { GameCard } from "./GameCard";
import { EmptyState } from "./EmptyState";
import styles from "./GameSelector.module.css";

export interface GameSelectorProps {
  selectedSlug?: string;
  onSelectGame?: (game: GameDefinition) => void;
  locale?: string;
  className?: string;
}

const CATEGORIES: { id: GameCategory; label: string; icon: string }[] = [
  { id: "ALL", label: "All Games", icon: "🌐" },
  { id: "SKILL", label: "Skill Games", icon: "⚡" },
  { id: "STRATEGY", label: "Strategy", icon: "🧠" },
  { id: "SPEED", label: "Speed", icon: "⏱️" },
  { id: "BOARD", label: "Board", icon: "🎲" },
  { id: "CASUAL", label: "Casual", icon: "🎯" },
  { id: "FREE_TO_PLAY", label: "Free to Play", icon: "🎮" },
  { id: "CASH_ELIGIBLE", label: "Cash Eligible", icon: "💰" },
  { id: "POPULAR", label: "Popular", icon: "🔥" },
  { id: "NEW", label: "New", icon: "✨" },
];

export function GameSelector({
  selectedSlug,
  onSelectGame,
  locale = "en",
  className,
}: GameSelectorProps) {
  const [activeCategory, setActiveCategory] = useState<GameCategory>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const games = useMemo(() => {
    let result =
      activeCategory === "ALL"
        ? GameRegistry.getAll()
        : GameRegistry.filter(activeCategory);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (g) =>
          (g.name || g.id).toLowerCase().includes(q) ||
          (g.nameAr || "").includes(q) ||
          (g.shortDescription || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [activeCategory, searchQuery]);

  return (
    <div className={[styles.container, className].filter(Boolean).join(" ")}>
      <div className={styles.searchBar}>
        <span className={styles.searchIcon} aria-hidden="true">
          🔍
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search games by name or rules..."
          className={styles.searchInput}
          aria-label="Search games"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            style={{ background: "none", border: "none", color: "var(--nz-text-3)", cursor: "pointer" }}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      <div className={styles.categoryScroll} role="tablist" aria-label="Game Categories">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={[
              styles.categoryBtn,
              activeCategory === cat.id ? styles.categoryActive : "",
            ].join(" ")}
            onClick={() => setActiveCategory(cat.id)}
            role="tab"
            aria-selected={activeCategory === cat.id}
          >
            <span>{cat.icon}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {games.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="No Games Found"
          description={`No games matched "${searchQuery}". Try a different filter or search query.`}
          action={
            <button
              type="button"
              className={styles.categoryBtn}
              onClick={() => {
                setActiveCategory("ALL");
                setSearchQuery("");
              }}
            >
              Reset Filters
            </button>
          }
        />
      ) : (
        <div className={styles.gamesGrid}>
          {games.map((g) => {
            const slug = g.slug || g.id;
            return (
              <div
                key={slug}
                className={[
                  onSelectGame ? styles.itemSelectable : "",
                  selectedSlug === slug ? styles.itemSelected : "",
                ].join(" ")}
                onClick={onSelectGame ? () => onSelectGame(g) : undefined}
              >
                <GameCard game={g} locale={locale} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
