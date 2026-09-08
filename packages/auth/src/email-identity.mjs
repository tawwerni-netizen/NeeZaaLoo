/**
 * Email identity -- see db/migrations/0016_email_identity.sql for the
 * schema and why it is its own table. This module owns exactly the state
 * of "what email does this player have, and is it verified" -- sending a
 * verification email, generating a login code, and issuing a password
 * reset token are separate modules (later authentication slices) that
 * depend on this one, not the other way around.
 */
import { randomUUID } from "node:crypto";
import { writeSecurityEvent } from "./audit.mjs";

export const EmailIdentityError = Object.freeze({
  INVALID_EMAIL: "INVALID_EMAIL",
  EMAIL_TAKEN: "EMAIL_TAKEN",
  NOT_FOUND: "NOT_FOUND",
});

// Deliberately just shape + case/whitespace normalization -- not a
// provider-specific rewrite (e.g. treating "a.b+tag@gmail.com" as
// "ab@gmail.com"). That trick is real for Gmail but wrong for most other
// providers, and silently folding addresses together is exactly the kind
// of surprising behaviour that turns into an account-takeover report.
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeEmail(raw) {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

function isValidEmail(normalized) {
  return EMAIL_SHAPE.test(normalized) && normalized.length <= 320;
}

export function createEmailIdentityService(db) {
  async function getByPlayerId(playerId) {
    const r = await db.query(
      "SELECT id, player_id, email, email_display, verified_at, created_at FROM email_identity WHERE player_id = $1",
      [playerId]
    );
    return r.rows[0] ?? null;
  }

  async function getByEmail(rawEmail) {
    const email = normalizeEmail(rawEmail);
    if (!email) return null;
    const r = await db.query(
      "SELECT id, player_id, email, email_display, verified_at, created_at FROM email_identity WHERE email = $1",
      [email]
    );
    return r.rows[0] ?? null;
  }

  /**
   * Attaches or replaces the calling player's email. Changing the email
   * always resets verification -- a player proving they own
   * "old@x.com" is not proof they own "new@x.com".
   */
  async function setEmail(playerId, rawEmail, ctx = {}) {
    const email = normalizeEmail(rawEmail);
    if (!isValidEmail(email)) {
      return { ok: false, reason: EmailIdentityError.INVALID_EMAIL };
    }

    try {
      return await db.transaction(async (tx) => {
        const existing = await tx.query(
          "SELECT player_id FROM email_identity WHERE email = $1", [email]
        );
        if (existing.rows.length && existing.rows[0].player_id !== playerId) {
          return { ok: false, reason: EmailIdentityError.EMAIL_TAKEN };
        }

        const id = `eml_${randomUUID()}`;
        const r = await tx.query(
          `INSERT INTO email_identity (id, player_id, email, email_display)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (player_id) DO UPDATE
             SET email = EXCLUDED.email, email_display = EXCLUDED.email_display,
                 verified_at = NULL, updated_at = now()
           RETURNING id, player_id, email, email_display, verified_at, created_at`,
          [id, playerId, email, rawEmail.trim()]
        );
        await writeSecurityEvent(tx, playerId, "EMAIL_SET", { email }, ctx);
        return { ok: true, identity: r.rows[0] };
      });
    } catch (e) {
      // The transaction's own SELECT already covers the common case; this
      // catches the race where two players claim the same address in the
      // same instant -- one of the two unique-key inserts loses, and loses
      // as a clean EMAIL_TAKEN, not an unhandled 500.
      if (/email_identity_unique_email/.test(e.message)) {
        return { ok: false, reason: EmailIdentityError.EMAIL_TAKEN };
      }
      throw e;
    }
  }

  async function markVerified(playerId, ctx = {}) {
    return db.transaction(async (tx) => {
      const r = await tx.query(
        `UPDATE email_identity SET verified_at = now(), updated_at = now()
          WHERE player_id = $1 AND verified_at IS NULL
          RETURNING id, player_id, email, email_display, verified_at, created_at`,
        [playerId]
      );
      if (!r.rows.length) {
        // Either there is no email on file, or it was already verified --
        // both are "nothing to do", not an error a caller needs to branch on.
        const current = await tx.query(
          "SELECT id, player_id, email, email_display, verified_at, created_at FROM email_identity WHERE player_id = $1",
          [playerId]
        );
        if (!current.rows.length) return { ok: false, reason: EmailIdentityError.NOT_FOUND };
        return { ok: true, identity: current.rows[0], alreadyVerified: true };
      }
      await writeSecurityEvent(tx, playerId, "EMAIL_VERIFIED", { email: r.rows[0].email }, ctx);
      return { ok: true, identity: r.rows[0] };
    });
  }

  return { getByPlayerId, getByEmail, setEmail, markVerified };
}
