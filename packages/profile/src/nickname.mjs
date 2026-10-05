/**
 * Nicknames -- the public-facing name shown everywhere (chat, leaderboards,
 * match records, spectator mode). This is presentation terminology only:
 * the underlying column is still `player.handle` (unique, shape-checked at
 * the database level since migration 0003) and stays that way -- renaming
 * a column that half the codebase already queries by name would be a
 * destructive schema churn for a label change, not a real improvement.
 * Every function here validates the exact same shape the database itself
 * enforces (`^[A-Za-z0-9_-]{3,24}$`), so a rejection never depends on
 * which layer happens to catch it first.
 */
import { randomBytes } from "node:crypto";
import { writeSecurityEvent } from "../../auth/src/audit.mjs";

export const NicknameError = Object.freeze({
  INVALID_SHAPE: "INVALID_SHAPE",
  RESERVED: "RESERVED",
  PROHIBITED: "PROHIBITED",
  TAKEN: "TAKEN",
  COOLDOWN: "COOLDOWN",
});

// Mirrors db/migrations/0003's player_handle_shape CHECK exactly -- see
// that migration's own constraint if this ever needs to change; it must
// change in both places at once, or the database becomes the real
// validator and this function starts lying about what it rejects.
const SHAPE = /^[A-Za-z0-9_-]{3,24}$/;

// Reserved, case-insensitive, matched as a SUBSTRING -- "obvious variants"
// (ADMIN_TEAM, official_nizalo, SUPPORT123) are exactly the impersonation
// attempts a bare exact-match list would miss. This is deliberately short:
// broad enough to block platform-identity impersonation, not an attempt at
// a general profanity/trademark filter.
const RESERVED_SUBSTRINGS = Object.freeze([
  "nizalo", "admin", "moderator", "mod", "support", "system", "staff", "official",
]);

// A minimal, intentionally small denylist -- infrastructure for the real
// requirement (nicknames must not be created that are obviously abusive),
// not a claim of comprehensive profanity coverage. A production deployment
// would swap this for a maintained wordlist/service behind the same
// `isProhibited` boundary; nothing else in this module would need to change.
const PROHIBITED_SUBSTRINGS = Object.freeze(["fuck", "shit", "nigger", "faggot", "cunt"]);

const COOLDOWN_MS = 30 * 24 * 3600_000; // 30 days between nickname changes

export function normalizeNickname(raw) {
  return typeof raw === "string" ? raw.trim() : "";
}

function containsAny(lower, list) {
  return list.some((word) => lower.includes(word));
}

/** Shape + reserved + prohibited checks only -- no database access, so
 * this can run before ever touching a connection. */
export function validateNicknameContent(nickname) {
  if (!SHAPE.test(nickname)) return NicknameError.INVALID_SHAPE;
  const lower = nickname.toLowerCase();
  if (containsAny(lower, RESERVED_SUBSTRINGS)) return NicknameError.RESERVED;
  if (containsAny(lower, PROHIBITED_SUBSTRINGS)) return NicknameError.PROHIBITED;
  return null;
}

export function generatePlaceholderNickname() {
  // Used only for a Google-first signup that has not chosen a nickname
  // yet (packages/auth/src/google-oauth.mjs) -- honestly a placeholder,
  // never derived from Google's own name/email without consent.
  return `player_${randomBytes(5).toString("hex")}`;
}

export function createNicknameService(db, { now = () => Date.now() } = {}) {
  /**
   * Changes `playerId`'s nickname (== `player.handle`). Checks, in order:
   * shape, reserved/prohibited content, the 30-day cooldown since the last
   * change, then case-INSENSITIVE uniqueness -- deliberately stricter than
   * the database's own case-sensitive UNIQUE index, so "Admin" cannot be
   * taken merely because "admin" is spelled differently; the database
   * constraint remains the final, structural guarantee underneath this.
   */
  async function changeNickname(playerId, rawNickname, ctx = {}) {
    const nickname = normalizeNickname(rawNickname);
    const contentError = validateNicknameContent(nickname);
    if (contentError) return { ok: false, reason: contentError };

    return db.transaction(async (tx) => {
      const current = await tx.query("SELECT handle, handle_changed_at FROM player WHERE id = $1", [playerId]);
      if (!current.rows.length) return { ok: false, reason: "NOT_FOUND" };
      const { handle: oldHandle, handle_changed_at: changedAt } = current.rows[0];

      if (changedAt) {
        const elapsed = now() - new Date(changedAt).getTime();
        if (elapsed < COOLDOWN_MS) {
          return { ok: false, reason: NicknameError.COOLDOWN, retryAfterMs: COOLDOWN_MS - elapsed };
        }
      }

      if (nickname.toLowerCase() === oldHandle.toLowerCase()) {
        // Renaming to the exact same value (possibly a case change of
        // one's own name) is a harmless no-op, not a conflict with itself.
        if (nickname === oldHandle) return { ok: true, nickname, unchanged: true };
      } else {
        const clash = await tx.query(
          "SELECT 1 FROM player WHERE LOWER(handle) = LOWER($1) AND id <> $2", [nickname, playerId]
        );
        if (clash.rows.length) return { ok: false, reason: NicknameError.TAKEN };
      }

      let updated;
      try {
        updated = await tx.query(
          "UPDATE player SET handle = $2, handle_changed_at = $3 WHERE id = $1 RETURNING handle",
          [playerId, nickname, new Date(now()).toISOString()]
        );
      } catch (e) {
        if (/player_handle_key|handle/.test(e.message) && /unique/i.test(e.message)) {
          return { ok: false, reason: NicknameError.TAKEN };
        }
        throw e;
      }

      await writeSecurityEvent(tx, playerId, "NICKNAME_CHANGED", { from: oldHandle, to: nickname }, ctx);
      return { ok: true, nickname: updated.rows[0].handle };
    });
  }

  return { changeNickname };
}
