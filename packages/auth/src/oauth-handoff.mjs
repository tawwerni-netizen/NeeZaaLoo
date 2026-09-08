/**
 * The one problem this file exists to solve: after a browser-redirect OAuth
 * callback validates a Google identity, the RESULT has to reach a
 * JSON-speaking single-page frontend, but the request that just happened
 * was a plain browser navigation (Google's own 302), not a fetch() the
 * frontend can read a body from. The only thing that can carry state across
 * that hop is another redirect -- and a bearer token must never ride in a
 * URL (query strings end up in server logs, browser history, and Referer
 * headers). So the callback mints a short-lived, single-use, opaque code,
 * redirects the browser to the frontend with THAT in the query string, and
 * the frontend immediately exchanges it here for the real session tokens
 * via google-oauth.mjs's finalize().
 *
 * Structurally this is the same "issue a secret, verify it exactly once"
 * shape as email-challenge.mjs, right down to the atomic used_at-is-null
 * compare-and-swap for consumption -- but it is not a human-typed,
 * attempt-limited, emailed code, and it has no `purpose`/`email` concept,
 * so it does not belong in that table. See
 * db/migrations/0019_oauth_identity.sql for the schema.
 */
import { randomUUID, randomBytes, createHash } from "node:crypto";

export const HandoffError = Object.freeze({
  NOT_FOUND: "NOT_FOUND",
  EXPIRED: "EXPIRED",
});

const hashCode = (code) => createHash("sha256").update(code).digest("hex");

export function createOAuthHandoffService(db, { now = () => Date.now() } = {}) {
  /** 256 bits of opaque randomness -- nothing to guess, nothing to forge. */
  async function issue({ playerId, provider, ttlMs = 2 * 60_000 }) {
    const code = randomBytes(32).toString("base64url");
    const id = `oh_${randomUUID()}`;
    await db.query(
      `INSERT INTO oauth_handoff (id, player_id, provider, code_hash, created_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, playerId, provider, hashCode(code), new Date(now()).toISOString(), new Date(now() + ttlMs).toISOString()]
    );
    return { ok: true, code };
  }

  async function consume({ code, provider }) {
    return db.transaction(async (tx) => {
      const r = await tx.query(
        `SELECT id, player_id, expires_at FROM oauth_handoff
          WHERE code_hash = $1 AND provider = $2 AND used_at IS NULL`,
        [hashCode(code), provider]
      );
      if (!r.rows.length) return { ok: false, reason: HandoffError.NOT_FOUND };
      const row = r.rows[0];

      if (new Date(row.expires_at).getTime() < now()) {
        return { ok: false, reason: HandoffError.EXPIRED };
      }

      // Same atomic CAS as email-challenge.mjs's verify() -- see that
      // file's own comment for why the plain SELECT above is not enough on
      // its own to make consumption exactly-once under real concurrency.
      const consumed = await tx.query(
        "UPDATE oauth_handoff SET used_at = $2 WHERE id = $1 AND used_at IS NULL RETURNING id",
        [row.id, new Date(now()).toISOString()]
      );
      if (!consumed.rows.length) return { ok: false, reason: HandoffError.NOT_FOUND };
      return { ok: true, playerId: row.player_id };
    });
  }

  return { issue, consume };
}
