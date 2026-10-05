/**
 * Blocking -- directive #16: a blocked player's messages simply never reach
 * the blocker again. This is enforced at TWO points, both per-viewer, never
 * globally: history queries (listMessages in messages.mjs filters by the
 * VIEWER's own block list) and realtime broadcast (the gateway projects
 * each connection's own feed, the same way it already omits a player's
 * private duel state from a spectator's view -- see gateway.mjs's own
 * `broadcast()`). Blocking never stops the blocked player from sending, and
 * never touches required system/account communication (email, tickets),
 * which do not go through this module at all.
 */
export const BlockError = Object.freeze({
  CANNOT_BLOCK_SELF: "CANNOT_BLOCK_SELF",
});

export function createBlockService(db) {
  async function blockPlayer(blockerId, blockedId) {
    if (blockerId === blockedId) return { ok: false, reason: BlockError.CANNOT_BLOCK_SELF };
    await db.query(
      `INSERT INTO chat_block (blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [blockerId, blockedId]
    );
    return { ok: true };
  }

  async function unblockPlayer(blockerId, blockedId) {
    await db.query("DELETE FROM chat_block WHERE blocker_id = $1 AND blocked_id = $2", [blockerId, blockedId]);
    return { ok: true };
  }

  async function listBlockedBy(blockerId) {
    const r = await db.query(
      `SELECT cb.blocked_id, p.handle, cb.created_at FROM chat_block cb
         JOIN player p ON p.id = cb.blocked_id
        WHERE cb.blocker_id = $1 ORDER BY cb.created_at DESC`,
      [blockerId]
    );
    return r.rows;
  }

  /** The set of player ids `viewerId` has blocked -- used to filter both
   * history reads and realtime delivery. Empty for the overwhelming common
   * case (nobody blocked), so callers should treat this as cheap. */
  async function blockedSetFor(viewerId) {
    const r = await db.query("SELECT blocked_id FROM chat_block WHERE blocker_id = $1", [viewerId]);
    return new Set(r.rows.map((row) => row.blocked_id));
  }

  return { blockPlayer, unblockPlayer, listBlockedBy, blockedSetFor };
}
