/**
 * EXP -> Level, centralized. This is the ONLY place a level is ever
 * computed from an EXP total -- nowhere else (a route handler, a React
 * component, a badge-award check) may hardcode a level formula or a
 * threshold table of its own. Changing the progression curve later means
 * changing exactly this file.
 *
 * The curve: triangular growth, `BASE_EXP_PER_LEVEL` per step -- level 2
 * costs 100 EXP, level 3 costs another 200 (300 total), level 4 another
 * 300 (600 total), and so on. Simple, strictly increasing, and easy to
 * re-tune by changing one constant if the real economy needs a different
 * shape later.
 */
export const BASE_EXP_PER_LEVEL = 100;

/** Total cumulative EXP required to REACH `level` (level 1 requires 0). */
export function expRequiredForLevel(level) {
  if (level <= 1) return 0;
  return (BASE_EXP_PER_LEVEL * (level - 1) * level) / 2;
}

export function levelForExp(totalExp) {
  const exp = Math.max(0, totalExp);
  let level = 1;
  while (expRequiredForLevel(level + 1) <= exp) level++;
  return level;
}

/** Everything a profile screen needs to render a level/progress bar in
 * one call, so no caller re-derives these numbers independently. */
export function expProgress(totalExp) {
  const exp = Math.max(0, totalExp);
  const level = levelForExp(exp);
  const currentLevelFloor = expRequiredForLevel(level);
  const nextLevelFloor = expRequiredForLevel(level + 1);
  return {
    level,
    totalExp: exp,
    currentLevelFloor,
    nextLevelFloor,
    expIntoLevel: exp - currentLevelFloor,
    expToNextLevel: nextLevelFloor - exp,
  };
}
