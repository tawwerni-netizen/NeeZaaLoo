/**
 * A visible glyph per badge code -- purely cosmetic, resolved client-side
 * like every other display concern (see profile.mjs's own header on why
 * display names/icons never live in the database). An unrecognized code
 * (a future badge this build predates) falls back to a generic medal
 * rather than rendering nothing.
 */
export const BADGE_ICON: Record<string, string> = {
  FIRST_WIN: "🏆",
  FIRST_TOURNAMENT: "⚡",
  TOURNAMENT_CHAMPION: "👑",
  MASTERY_ADVANCED_ANY: "🔷",
  MASTERY_EXPERT_ANY: "🔶",
  MASTERY_MASTER_ANY: "🌟",
  MULTI_GAME_CHAMPION: "🎯",
  STREAK_7: "🔥",
  STREAK_30: "💎",
};

export function badgeIcon(code: string): string {
  return BADGE_ICON[code] ?? "🎖️";
}
