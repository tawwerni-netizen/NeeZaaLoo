/**
 * The exact response shapes GET /v1/me/profile, GET /v1/players/:id and
 * GET /v1/players/:id/preview return (packages/profile/src/service.mjs).
 * One shared file so a future chat/leaderboard/spectator component reuses
 * these types instead of re-declaring its own guess at the shape.
 */
export type ExpProgress = {
  level: number;
  totalExp: number;
  currentLevelFloor: number;
  nextLevelFloor: number;
  expIntoLevel: number;
  expToNextLevel: number;
};

export type GameRating = {
  gameId: string;
  displayName: string;
  rating: number;
  gamesPlayed: number;
  lastPlayedAt: string | null;
};

export type ProfileStats = { games: number; wins: number; losses: number; draws: number };

export type PlayerBadge = { code: string; source: "ACHIEVEMENT" | "PURCHASE" };

/** Beginner < Intermediate < Advanced < Expert < Master -- see
 * packages/mastery/src/mastery.mjs for the exact, non-inflatable gates. */
export type MasteryLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT" | "MASTER";

export type GameMastery = {
  gameId: string;
  displayName: string;
  rating: number;
  gamesPlayed: number;
  established: boolean;
  percentile: number | null;
  level: MasteryLevel;
};

export type StreakStatus = { current: number; longest: number; activeToday: boolean; atRisk: boolean };

export type TournamentStats = { played: number; won: number };

export type PublicProfile = {
  id: string;
  nickname: string;
  bio: string;
  avatarUrl: string | null;
  clanTag?: string;
  selectedBadge: string | null;
  selectedFrame: string | null;
  allowDirectMessages?: boolean;
  exp: ExpProgress;
  globalSkill: number | null;
  ratings: GameRating[];
  stats: ProfileStats;
  mastery: GameMastery[];
  streak: StreakStatus;
  highestRatings: Record<string, number>;
  tournaments: TournamentStats;
  achievements: string[];
  badges: PlayerBadge[];
  frames: string[];
  memberSince: string;
};

/** The small, fast shape for chat/leaderboard/spectator previews. */
export type ProfilePreview = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  level: number;
  exp: number;
  globalSkill: number | null;
  selectedBadge: string | null;
};
