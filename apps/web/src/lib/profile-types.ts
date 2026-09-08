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

export type PublicProfile = {
  id: string;
  nickname: string;
  bio: string;
  avatarUrl: string | null;
  selectedBadge: string | null;
  exp: ExpProgress;
  globalSkill: number | null;
  ratings: GameRating[];
  stats: ProfileStats;
  achievements: string[];
  badges: PlayerBadge[];
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
