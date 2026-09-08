/**
 * Badges -- displayable, `source`-tagged (see migration 0020's own header
 * for why `EARNED`/`PURCHASE` share one table but can never be confused).
 * A player's selected preview badge (the one shown in chat/leaderboard
 * previews) lives on `player.selected_badge_code`; selecting one is
 * refused unless the player actually owns it -- there is no path to
 * display a badge nobody ever awarded them.
 */
export const BadgeError = Object.freeze({
  UNKNOWN_BADGE: "UNKNOWN_BADGE",
  NOT_OWNED: "NOT_OWNED",
});

export const BadgeSource = Object.freeze({
  ACHIEVEMENT: "ACHIEVEMENT",
  PURCHASE: "PURCHASE",
});

export function createBadgeService(db, { now = () => Date.now() } = {}) {
  async function award(playerId, code, source, ctx = {}) {
    try {
      await db.query(
        "INSERT INTO player_badge (player_id, badge_code, source, earned_at) VALUES ($1,$2,$3,$4)",
        [playerId, code, source, new Date(now()).toISOString()]
      );
      return { ok: true, awarded: true };
    } catch (e) {
      if (/player_badge_pkey/.test(e.message)) return { ok: true, awarded: false };
      if (/badge_code/.test(e.message) && /foreign key|violates/i.test(e.message)) {
        return { ok: false, reason: BadgeError.UNKNOWN_BADGE };
      }
      throw e;
    }
  }

  async function listFor(playerId) {
    const r = await db.query(
      "SELECT badge_code, source, earned_at FROM player_badge WHERE player_id = $1 ORDER BY earned_at",
      [playerId]
    );
    return r.rows;
  }

  /** `code: null` clears the selection. Otherwise refuses a badge the
   * player does not hold -- ownership, not just existence in the catalog. */
  async function select(playerId, code) {
    if (code === null) {
      await db.query("UPDATE player SET selected_badge_code = NULL WHERE id = $1", [playerId]);
      return { ok: true };
    }
    const owns = await db.query(
      "SELECT 1 FROM player_badge WHERE player_id = $1 AND badge_code = $2", [playerId, code]
    );
    if (!owns.rows.length) return { ok: false, reason: BadgeError.NOT_OWNED };
    await db.query("UPDATE player SET selected_badge_code = $2 WHERE id = $1", [playerId, code]);
    return { ok: true };
  }

  return { award, listFor, select };
}
