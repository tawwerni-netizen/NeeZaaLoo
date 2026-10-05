/**
 * Third-party identity links -- see db/migrations/0019_oauth_identity.sql
 * for the schema and why it is its own table, separate from both
 * `credential` and `email_identity`. This module owns exactly "which
 * provider subject is this player linked to" -- it knows nothing about
 * Google specifically, nothing about OIDC validation, and writes no
 * security events of its own: `provider` is just a string, and the
 * caller (packages/auth/src/google-oauth.mjs today; a future provider's
 * own orchestrator later) is the one that knows a provider-specific event
 * name like GOOGLE_LINKED is worth writing. Keeping that decision
 * out of this file is what lets a second provider reuse it unchanged.
 */
import { randomUUID } from "node:crypto";

export const OAuthIdentityError = Object.freeze({
  // The provider subject is already linked to a DIFFERENT player -- refused
  // rather than silently re-pointing it, or this table would let an
  // attacker who merely obtains a valid Google login for an email steal a
  // Nizalo account out from under its real owner.
  SUBJECT_ALREADY_LINKED: "SUBJECT_ALREADY_LINKED",
  // This player already has a DIFFERENT identity linked for this provider.
  ALREADY_LINKED: "ALREADY_LINKED",
  NOT_LINKED: "NOT_LINKED",
});

export function createOAuthIdentityService(db, { now = () => Date.now() } = {}) {
  async function getByProviderSubject(provider, subject) {
    const r = await db.query(
      `SELECT id, player_id, provider, provider_subject, email, email_verified, created_at
         FROM oauth_identity WHERE provider = $1 AND provider_subject = $2`,
      [provider, subject]
    );
    return r.rows[0] ?? null;
  }

  async function getByPlayerId(playerId, provider) {
    const r = await db.query(
      `SELECT id, player_id, provider, provider_subject, email, email_verified, created_at
         FROM oauth_identity WHERE player_id = $1 AND provider = $2`,
      [playerId, provider]
    );
    return r.rows[0] ?? null;
  }

  /**
   * Links `subject` (the provider's stable identifier) to `playerId`.
   * Relinking the exact same (player, provider, subject) triple that is
   * already in effect is a harmless no-op success -- everything else that
   * would touch an existing row is refused, never overwritten.
   */
  async function link({ playerId, provider, subject, email = null, emailVerified = false }) {
    try {
      return await db.transaction(async (tx) => {
        const bySubject = await tx.query(
          "SELECT player_id FROM oauth_identity WHERE provider = $1 AND provider_subject = $2",
          [provider, subject]
        );
        if (bySubject.rows.length && bySubject.rows[0].player_id !== playerId) {
          return { ok: false, reason: OAuthIdentityError.SUBJECT_ALREADY_LINKED };
        }

        const existing = await tx.query(
          "SELECT provider_subject FROM oauth_identity WHERE player_id = $1 AND provider = $2",
          [playerId, provider]
        );
        if (existing.rows.length) {
          if (existing.rows[0].provider_subject !== subject) {
            return { ok: false, reason: OAuthIdentityError.ALREADY_LINKED };
          }
          return { ok: true, alreadyLinked: true };
        }

        const id = `oid_${randomUUID()}`;
        const r = await tx.query(
          `INSERT INTO oauth_identity (id, player_id, provider, provider_subject, email, email_verified, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id, player_id, provider, provider_subject, email, email_verified, created_at`,
          [id, playerId, provider, subject, email, emailVerified, new Date(now()).toISOString()]
        );
        return { ok: true, identity: r.rows[0] };
      });
    } catch (e) {
      // The SELECT-then-INSERT above is not enough on its own to make
      // linking race-safe: two genuinely concurrent link() calls (two
      // different players racing for the same subject, or the same
      // player's own double-click retried) can both pass their own SELECT
      // before either commits. Postgres's own UNIQUE constraints are the
      // real guarantee; this just translates the loser's constraint
      // violation into the same graceful result the pre-check already
      // returns for the non-racing case, instead of an unhandled
      // exception -- same idiom as email-identity.mjs's setEmail().
      if (/oauth_identity_unique_subject/.test(e.message)) {
        // The loser still has to ask WHO won: if it was this exact same
        // player (their own concurrent retry beat them to it), that is the
        // same harmless idempotent success the non-racing pre-check
        // returns above -- not a conflict with a stranger's account.
        const winner = await getByProviderSubject(provider, subject);
        if (winner?.player_id === playerId) return { ok: true, alreadyLinked: true };
        return { ok: false, reason: OAuthIdentityError.SUBJECT_ALREADY_LINKED };
      }
      if (/oauth_identity_one_per_provider/.test(e.message)) {
        return { ok: false, reason: OAuthIdentityError.ALREADY_LINKED };
      }
      throw e;
    }
  }

  async function unlink(playerId, provider) {
    const r = await db.query(
      "DELETE FROM oauth_identity WHERE player_id = $1 AND provider = $2 RETURNING id",
      [playerId, provider]
    );
    if (!r.rows.length) return { ok: false, reason: OAuthIdentityError.NOT_LINKED };
    return { ok: true };
  }

  return { getByProviderSubject, getByPlayerId, link, unlink };
}
