/**
 * Profile frames -- a decorative border around a player's avatar,
 * mechanically identical to badges.mjs (award/list/select) but tracked
 * separately: a frame and a badge render in different places on a
 * profile and a player selects one of EACH independently. See migration
 * 0034's own header for why this is not folded into the badge table.
 */
export const FrameError = Object.freeze({
  UNKNOWN_FRAME: "UNKNOWN_FRAME",
  NOT_OWNED: "NOT_OWNED",
});

export function createFrameService(db, { now = () => Date.now() } = {}) {
  async function award(playerId, code) {
    try {
      await db.query(
        "INSERT INTO player_frame (player_id, frame_code, earned_at) VALUES ($1,$2,$3)",
        [playerId, code, new Date(now()).toISOString()]
      );
      return { ok: true, awarded: true };
    } catch (e) {
      if (/player_frame_pkey/.test(e.message)) return { ok: true, awarded: false };
      if (/frame_code/.test(e.message) && /foreign key|violates/i.test(e.message)) {
        return { ok: false, reason: FrameError.UNKNOWN_FRAME };
      }
      throw e;
    }
  }

  async function listFor(playerId) {
    const r = await db.query(
      "SELECT frame_code, earned_at FROM player_frame WHERE player_id = $1 ORDER BY earned_at",
      [playerId]
    );
    return r.rows;
  }

  /** `code: null` clears the selection. Otherwise refuses a frame the
   * player does not hold -- ownership, not just existence in the catalog. */
  async function select(playerId, code) {
    if (code === null) {
      await db.query("UPDATE player SET selected_frame_code = NULL WHERE id = $1", [playerId]);
      return { ok: true };
    }
    const owns = await db.query(
      "SELECT 1 FROM player_frame WHERE player_id = $1 AND frame_code = $2", [playerId, code]
    );
    if (!owns.rows.length) return { ok: false, reason: FrameError.NOT_OWNED };
    await db.query("UPDATE player SET selected_frame_code = $2 WHERE id = $1", [playerId, code]);
    return { ok: true };
  }

  return { award, listFor, select };
}
