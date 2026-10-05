import type { ComponentType } from "react";

export type Difficulty = "EASY" | "MEDIUM" | "HARD" | "EXPERT";
export const DIFFICULTIES: readonly Difficulty[] = ["EASY", "MEDIUM", "HARD", "EXPERT"];

/**
 * What a game's own Board component receives.
 */
export type BoardProps = {
  view: unknown;
  lastMove: unknown;
  /** True while it is genuinely this viewer's turn AND the duel is live */
  canMove: boolean;
  mySeat: 0 | 1 | null;
  /** Send one intent */
  onMove: (intent: unknown) => void;
};

// 1. GameCategory: The canonical category taxonomy required for Game Hub discovery
export type GameCategory =
  | "ALL"
  | "SKILL"
  | "STRATEGY"
  | "SPEED"
  | "BOARD"
  | "CASUAL"
  | "FREE_TO_PLAY"
  | "CASH_ELIGIBLE"
  | "AVAILABLE_NOW"
  | "POPULAR"
  | "NEW";

// 2. GameVariant: Specific time-controls or rules variants supported by the game
export type GameVariant = {
  id: string;
  name: string;
  nameAr?: string;
  description?: string;
  descriptionAr?: string;
  timeControl?: string; // e.g. "3m + 2s", "5m Blitz", "60s Clock"
  playerCount?: number; // 2 or 4
};

// 3. GameAvailability: Real-time operational availability and player benchmarks
export type GameAvailabilityStatus = "LIVE" | "BETA" | "MAINTENANCE" | "COMING_SOON";

export type GameAvailability = {
  status: GameAvailabilityStatus;
  isAvailableNow: boolean;
  onlinePlayersBenchmark: number; // Honest baseline active players
  serversOnline: boolean;
};

// 4. GameMode: Supported player configurations
export type GameModeType = "1v1" | "2-4p" | "SOLO_AI" | "TOURNAMENT" | "FRIEND_DUEL";

export type GameMode = {
  type: GameModeType;
  label: string;
  labelAr: string;
  minPlayers: number;
  maxPlayers: number;
};

// 5. GameStakeEligibility: Clear financial rules and stake constraints
export type GameStakeEligibility = {
  isCashEligible: boolean;
  isFreeToPlay: boolean;
  minStakeUsd?: number;
  maxStakeUsd?: number;
  currency?: string; // "USDT"
  reasonIfNotEligible?: string; // e.g. "Free Only · Solved Game Policy"
  reasonIfNotEligibleAr?: string; // "مجاني فقط · مخصص للتدريب والمنافسة الحرة"
};

// 6. RulesVersion: Official rules standard, governing bodies, and honest RNG model
export type RulesVersion = {
  version: string; // e.g. "FIDE 2024", "WBF 2023", "v1.1"
  rulesUrl: string; // "/games/chess"
  governingStandard: string; // e.g. "FIDE Blitz / Rapid Standard"
  lastReviewedDate: string; // "2026-09"
  hasRng: boolean; // false for Chess/XO, true for Dominoes/Backgammon/Ludo
  rngMechanism?: string; // e.g. "Server CSPRNG Cryptographic Seed"
  standard?: string;
  rngModel?: string;
  notes?: string;
};

// Base Board Plugin contract for game renderers
export type GameBoardPlugin = {
  id: string;
  nameKey: string;
  turnModel: "ALTERNATING" | "SIMULTANEOUS";
  supportsAI: boolean;
  difficulties: readonly Difficulty[];
  supportsDraw: boolean;
  cashEnabled: boolean;
  Board: ComponentType<BoardProps>;
};

// Canonical Full Game Entry
export type GameDefinition = GameBoardPlugin & {
  slug?: string | undefined;
  name?: string | undefined;
  nameAr?: string | undefined;
  descriptionAr?: string | undefined;
  durationMinutes?: string | number | undefined;
  playerMode?: string | undefined;
  popular?: boolean | undefined;
  rulesVersion?: {
    standard: string;
    rngModel: string;
    notes: string;
  } | undefined;
  icon: string; // e.g. "♟️", "🀄", "🎲", "🔢", "❌", "🔴", "⚫", "⚪", "🟢", "🎯"
  tagline: string;
  taglineAr: string;
  shortDescription: string;
  shortDescriptionAr: string;
  typicalDuration: string;
  typicalDurationAr: string;
  playerModeDisplay: string;
  playerModeDisplayAr: string;
  skillLevel: string;
  skillLevelAr: string;
  categories: GameCategory[];
  isPopular?: boolean | undefined;
  isNew?: boolean | undefined;
  availability: GameAvailability;
  stakeEligibility: GameStakeEligibility;
  rules: RulesVersion;
  variants: GameVariant[];
  modes: GameMode[];
};

export type GamePlugin = GameBoardPlugin;
