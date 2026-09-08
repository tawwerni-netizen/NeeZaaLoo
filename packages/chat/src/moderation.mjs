/**
 * Mutes -- directive #15: "Do not use a vague boolean only." Every mute is
 * its own auditable row (target, moderator, reason, scope, start, end),
 * never a single `player.muted` flag that forgets who did it or why.
 */
import { randomUUID } from "node:crypto";

export const ChatMuteScope = Object.freeze({
  GLOBAL_CHAT: "GLOBAL_CHAT", MATCH_CHAT: "MATCH_CHAT", SPECTATOR_CHAT: "SPECTATOR_CHAT", ALL_CHAT: "ALL_CHAT",
});

export const ModerationError = Object.freeze({
  NOT_FOUND: "NOT_FOUND",
  ALREADY_REVOKED: "ALREADY_REVOKED",
  INVALID_REASON: "INVALID_REASON",
});

export function createModerationService(db, { now = () => Date.now() } = {}) {
  async function muteUser({ targetId, moderatorId, reason, scope, durationMs = null }) {
    const trimmedReason = typeof reason === "string" ? reason.trim() : "";
    if (!trimmedReason || trimmedReason.length > 500) return { ok: false, reason: ModerationError.INVALID_REASON };

    const id = `mute_${randomUUID()}`;
    const t = new Date(now()).toISOString();
    const endsAt = durationMs != null ? new Date(now() + durationMs).toISOString() : null;
    await db.query(
      `INSERT INTO chat_mute (id, target_id, moderator_id, reason, scope, starts_at, ends_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$6)`,
      [id, targetId, moderatorId, trimmedReason, scope, t, endsAt]
    );
    return { ok: true, muteId: id, endsAt };
  }

  async function unmuteUser({ muteId, revokedBy }) {
    const t = new Date(now()).toISOString();
    const r = await db.query(
      `UPDATE chat_mute SET revoked_at = $2, revoked_by = $3 WHERE id = $1 AND revoked_at IS NULL RETURNING id`,
      [muteId, t, revokedBy]
    );
    if (r.rows.length) return { ok: true };
    const existing = await db.query("SELECT id FROM chat_mute WHERE id = $1", [muteId]);
    return { ok: false, reason: existing.rows.length ? ModerationError.ALREADY_REVOKED : ModerationError.NOT_FOUND };
  }

  /** Is `playerId` currently muted for `scope` (or covered by a broader
   * ALL_CHAT mute)? Checked before every send, on the hot path -- backed by
   * chat_mute_active_idx (0023_chat.sql), never a full scan. Two plain `OR`
   * branches rather than `scope = ANY($n::chat_mute_scope[])`: passing a JS
   * array as an enum-typed Postgres array parameter needs driver-specific
   * array-literal serialization this codebase's pg adapter does not do,
   * and a query built around it silently varies between PGlite and real
   * Postgres -- not worth it for a two-element set. */
  async function isMuted(playerId, scope) {
    const t = new Date(now()).toISOString();
    const r = await db.query(
      `SELECT 1 FROM chat_mute
        WHERE target_id = $1 AND revoked_at IS NULL AND (scope = $2 OR scope = 'ALL_CHAT')
          AND (ends_at IS NULL OR ends_at > $3)
        LIMIT 1`,
      [playerId, scope, t]
    );
    return r.rows.length > 0;
  }

  async function listActiveMutesFor(playerId) {
    const t = new Date(now()).toISOString();
    const r = await db.query(
      `SELECT id, moderator_id, reason, scope, starts_at, ends_at FROM chat_mute
        WHERE target_id = $1 AND revoked_at IS NULL AND (ends_at IS NULL OR ends_at > $2)
        ORDER BY starts_at DESC`,
      [playerId, t]
    );
    return r.rows;
  }

  return { muteUser, unmuteUser, isMuted, listActiveMutesFor };
}
