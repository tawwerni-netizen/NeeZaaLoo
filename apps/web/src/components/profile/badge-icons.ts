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
};

export function badgeIcon(code: string): string {
  return BADGE_ICON[code] ?? "🎖️";
}
