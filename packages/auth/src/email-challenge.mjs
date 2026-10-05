/**
 * The one mechanism behind email verification, the 6-character login code,
 * and password reset (see db/migrations/0018_email_challenges.sql for why
 * they share a table but can never share a token). This module knows
 * nothing about email content or sending -- it only issues and checks a
 * short-lived, single-use, attempt-limited code for a given (player,
 * purpose) pair. The purpose-specific flows (packages/auth/src/
 * email-verification.mjs today; login-code and password-reset in later
 * slices) are the only callers, and each always passes its own fixed
 * `purpose`, so a code can never be checked against the wrong flow by a
 * caller accidentally passing the wrong value -- but see ChallengePurpose
 * below for the actual enum this is validated against.
 */
import { randomUUID, randomInt, createHash } from "node:crypto";
import { writeSecurityEvent } from "./audit.mjs";

export const ChallengePurpose = Object.freeze({
  VERIFICATION: "VERIFICATION",
  LOGIN_CODE: "LOGIN_CODE",
  PASSWORD_RESET: "PASSWORD_RESET",
});

export const ChallengeError = Object.freeze({
  NOT_FOUND: "NOT_FOUND",
  EXPIRED: "EXPIRED",
  ALREADY_USED: "ALREADY_USED",
  TOO_MANY_ATTEMPTS: "TOO_MANY_ATTEMPTS",
  INVALID_CODE: "INVALID_CODE",
  COOLDOWN: "COOLDOWN",
});

// Excludes 0/O/1/I/L -- easy to misread in a font, easy to mistype from a
// phone screen. 32 symbols so an 8-character code still carries 40 bits of
// entropy despite the smaller alphabet. Exported so any caller that needs
// to shape-validate a code (email-login-code.mjs's CODE_SHAPE) builds its
// regex from this exact alphabet instead of hand-writing a second one that
// can silently drift from it -- see that file's own test suite for the
// bug this already caught once (a hand-written `[A-Z2-9]` accepted the
// excluded letters I/L/O, which are also in A-Z).
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateCode(length = 8) {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

const hashCode = (code) => createHash("sha256").update(code).digest("hex");

export function createEmailChallengeService(db, { now = () => Date.now() } = {}) {
  /**
   * Issues a new challenge, invalidating any still-active one for the same
   * (player, purpose) first -- at most one live challenge per purpose at a
   * time, so an old code can never be used once a new one has been sent.
   * Refuses if the previous one is younger than `cooldownMs` (resend abuse
   * protection) WITHOUT invalidating it -- a blocked resend must not burn
   * the still-valid code the player may already have in their inbox.
   */
  async function issue({ playerId, purpose, email, ttlMs, codeLength = 8, cooldownMs = 60_000 }, ctx = {}) {
    return db.transaction(async (tx) => {
      const recent = await tx.query(
        `SELECT created_at FROM email_challenge
          WHERE player_id = $1 AND purpose = $2 AND used_at IS NULL
          ORDER BY created_at DESC LIMIT 1`,
        [playerId, purpose]
      );
      if (recent.rows.length) {
        const ageMs = now() - new Date(recent.rows[0].created_at).getTime();
        if (ageMs < cooldownMs) {
          return { ok: false, reason: ChallengeError.COOLDOWN, retryAfterMs: cooldownMs - ageMs };
        }
      }

      await tx.query(
        `UPDATE email_challenge SET used_at = $3
          WHERE player_id = $1 AND purpose = $2 AND used_at IS NULL`,
        [playerId, purpose, new Date(now()).toISOString()]
      );

      const code = generateCode(codeLength);
      const id = `chl_${randomUUID()}`;
      // created_at is set from the injected clock explicitly, not the
      // column's own DEFAULT now() -- the same reasoning service.mjs's
      // newSession() documents: a cooldown/expiry check compares this
      // column against the SAME now() used here, and a real database
      // timestamp compared against an artificially time-travelled clock
      // (exactly what these tests do) drifts by however much real wall-clock
      // time the surrounding test suite actually took to run.
      await tx.query(
        `INSERT INTO email_challenge (id, player_id, purpose, email, secret_hash, created_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, playerId, purpose, email, hashCode(code), new Date(now()).toISOString(), new Date(now() + ttlMs).toISOString()]
      );
      // The raw code exists in memory for exactly this one return value --
      // the caller (the purpose-specific flow) must hand it straight to the
      // email service and never persist or log it.
      return { ok: true, id, code, expiresAt: new Date(now() + ttlMs) };
    });
  }

  /** Checks `code` against the most recent active challenge for (player, purpose). */
  async function verify({ playerId, purpose, code }, ctx = {}) {
    return db.transaction(async (tx) => {
      const r = await tx.query(
        `SELECT id, secret_hash, attempts, max_attempts, expires_at FROM email_challenge
          WHERE player_id = $1 AND purpose = $2 AND used_at IS NULL
          ORDER BY created_at DESC LIMIT 1`,
        [playerId, purpose]
      );
      if (!r.rows.length) return { ok: false, reason: ChallengeError.NOT_FOUND };
      const row = r.rows[0];

      if (new Date(row.expires_at).getTime() < now()) {
        return { ok: false, reason: ChallengeError.EXPIRED };
      }
      if (row.attempts >= row.max_attempts) {
        return { ok: false, reason: ChallengeError.TOO_MANY_ATTEMPTS };
      }
      if (hashCode(code) !== row.secret_hash) {
        await tx.query("UPDATE email_challenge SET attempts = attempts + 1 WHERE id = $1", [row.id]);
        const failed = await tx.query("SELECT attempts, max_attempts FROM email_challenge WHERE id = $1", [row.id]);
        const exhausted = failed.rows[0].attempts >= failed.rows[0].max_attempts;
        await writeSecurityEvent(tx, playerId, `${purpose}_CHALLENGE_FAILED`,
          { exhausted }, ctx);
        return { ok: false, reason: exhausted ? ChallengeError.TOO_MANY_ATTEMPTS : ChallengeError.INVALID_CODE };
      }

      // Atomic compare-and-swap, not a re-use of the SELECT above: two
      // concurrent verify() calls can both read used_at IS NULL before
      // either commits (this is wrapped in a transaction, but the SELECT
      // and this UPDATE are still two separate statements). Re-asserting
      // `used_at IS NULL` IN THE UPDATE's own WHERE clause is what actually
      // makes consumption exactly-once: Postgres evaluates that condition
      // against the row's state at lock-acquisition time, so the loser of
      // two simultaneous attempts updates zero rows, no matter what its own
      // earlier SELECT saw. Same idiom this codebase already uses for
      // reconciliation_run's partial-unique-index guard and the duel
      // ownership lease's fencing token -- a real race this exact shape
      // was found to still be possible in practice, just rare, so this is
      // a correctness fix, not new behaviour.
      const consumed = await tx.query(
        "UPDATE email_challenge SET used_at = $2 WHERE id = $1 AND used_at IS NULL RETURNING id",
        [row.id, new Date(now()).toISOString()]
      );
      if (!consumed.rows.length) {
        // Someone else consumed it in the window between our SELECT and
        // this UPDATE -- indistinguishable, from here, from "no active
        // challenge exists".
        return { ok: false, reason: ChallengeError.NOT_FOUND };
      }
      return { ok: true };
    });
  }

  return { issue, verify };
}
