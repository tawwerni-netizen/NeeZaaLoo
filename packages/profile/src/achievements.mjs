/**
 * Achievements -- a tiny, deliberately incomplete catalog (see migration
 * 0020's own comment: infrastructure first, not dozens of unlocks).
 * Idempotency here needs no dedupe key of its own: PRIMARY KEY
 * (player_id, achievement_code) on player_achievement already makes
 * "award the same achievement to the same player twice" structurally
 * impossible, so a retried award attempt is just a harmless no-op.
 *
 * This module knows nothing about EXP or badges -- composing "earning
 * FIRST_WIN also grants a badge and some EXP" is the caller's job (e.g. a
 * future match-settlement hook awarding all three independently, each
 * idempotent on its own terms), not something hardwired in here.
 */
export const AchievementError = Object.freeze({
  UNKNOWN_ACHIEVEMENT: "UNKNOWN_ACHIEVEMENT",
});

export function createAchievementService(db, { now = () => Date.now() } = {}) {
  async function award(playerId, code, ctx = {}) {
    try {
      await db.query(
        "INSERT INTO player_achievement (player_id, achievement_code, earned_at) VALUES ($1,$2,$3)",
        [playerId, code, new Date(now()).toISOString()]
      );
      return { ok: true, awarded: true };
    } catch (e) {
      if (/player_achievement_pkey/.test(e.message)) {
        return { ok: true, awarded: false };
      }
      if (/achievement_code/.test(e.message) && /foreign key|violates/i.test(e.message)) {
        return { ok: false, reason: AchievementError.UNKNOWN_ACHIEVEMENT };
      }
      throw e;
    }
  }

  async function listFor(playerId) {
    const r = await db.query(
      "SELECT achievement_code, earned_at FROM player_achievement WHERE player_id = $1 ORDER BY earned_at",
      [playerId]
    );
    return r.rows;
  }

  return { award, listFor };
}
