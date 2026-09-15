/**
 * The authentication service.
 *
 * Register, log in, refresh, revoke, enrol 2FA, step up for privileged actions.
 *
 * Three properties this file exists to guarantee, each tested directly:
 *
 *   1. A stolen refresh token is DETECTED. Rotation is single-use and enforced
 *      by a unique constraint, so replaying a spent token cannot silently work.
 *      When it happens the whole session family dies.
 *   2. Nothing useful survives a database leak. Passwords are Argon2id,
 *      refresh tokens and recovery codes are hashes, TOTP secrets are encrypted
 *      with a key that is not in the database.
 *   3. Taking over an account does not immediately let you cash out. Changing
 *      a password or 2FA device starts a cooling-off window during which
 *      withdrawals are frozen.
 */
import { randomUUID, randomBytes, createHash, createCipheriv, createDecipheriv } from "node:crypto";
import { hash as argonHash, verify as argonVerify, Algorithm } from "@node-rs/argon2";
import {
  issueAccessToken, verifyAccessToken, generateRefreshToken, hashRefreshToken,
  issueStepUpToken, verifyStepUpToken,
} from "./tokens.mjs";
import { generateSecret, verifyTotp, base32Encode, otpauthUri, constantTimeEqual } from "./totp.mjs";
import { writeSecurityEvent } from "./audit.mjs";

// OWASP-aligned Argon2id parameters. Deliberately expensive: this is the one
// place in the system where being slow is the feature.
const ARGON = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const AuthError = {
  BAD_CREDENTIALS: "BAD_CREDENTIALS",
  LOCKED_OUT: "LOCKED_OUT",
  TOTP_REQUIRED: "TOTP_REQUIRED",
  TOTP_INVALID: "TOTP_INVALID",
  SESSION_INVALID: "SESSION_INVALID",
  SESSION_REVOKED: "SESSION_REVOKED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  TOKEN_REUSED: "TOKEN_REUSED",
  WEAK_PASSWORD: "WEAK_PASSWORD",
  HANDLE_TAKEN: "HANDLE_TAKEN",
  COOLING_OFF: "COOLING_OFF",
  CREDENTIAL_ALREADY_SET: "CREDENTIAL_ALREADY_SET",
  TERMS_ACCEPTANCE_REQUIRED: "TERMS_ACCEPTANCE_REQUIRED",
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
  // A distinct, stable code for the one ban category the player-facing UI
  // must not soften into the generic "account disabled" message -- see
  // disabled_category (0052_fairplay_sanction_and_seizure.sql) and the fair-
  // play tribunal's /decide route, the only place that category gets set.
  ACCOUNT_DISABLED_CHEATING: "ACCOUNT_DISABLED_CHEATING",
};

const MAX_FAILURES = 10;                 // per 15-minute window, per identifier
const REFRESH_TTL_MS = 30 * 24 * 3600_000;
const ACCESS_TTL_S = 900;

export function createAuthService(db, {
  signingKey,
  encryptionKey,                          // 32 bytes; from the secrets manager
  now = () => Date.now(),
  argon = ARGON,
} = {}) {
  if (!signingKey || signingKey.length < 32) {
    throw new TypeError("signingKey must be at least 32 bytes");
  }
  if (!encryptionKey || encryptionKey.length !== 32) {
    throw new TypeError("encryptionKey must be exactly 32 bytes (AES-256)");
  }

  const audit = writeSecurityEvent;

  const svc = {
    /** Create an account. The password is never stored, logged, or echoed. */
    async register({ playerId, handle, email = null, password, referralCode = null, termsAccepted = true, locale = "en", policyVersion = "1.0.0" }, ctx = {}) {
      if (termsAccepted !== true) {
        return { ok: false, reason: AuthError.TERMS_ACCEPTANCE_REQUIRED };
      }

      const weak = checkPasswordStrength(password);
      if (weak) return { ok: false, reason: AuthError.WEAK_PASSWORD, detail: weak };

      const passwordHash = await argonHash(password, argon);

      return db.transaction(async (tx) => {
        const exists = await tx.query("SELECT 1 FROM player WHERE LOWER(handle) = LOWER($1)", [handle]);
        if (exists.rows.length) return { ok: false, reason: AuthError.HANDLE_TAKEN };

        if (email) {
          const normEmail = String(email).trim().toLowerCase();
          const emailCheck = await tx.query("SELECT 1 FROM email_identity WHERE email = $1", [normEmail]);
          if (emailCheck.rows.length) return { ok: false, reason: "EMAIL_TAKEN" };
        }

        await tx.query("INSERT INTO player (id, handle, locale) VALUES ($1,$2,$3)", [playerId, handle, locale || "en"]);
        await tx.query(
          "INSERT INTO credential (player_id, password_hash) VALUES ($1,$2)",
          [playerId, passwordHash]
        );
        await tx.query("SELECT ledger_open_user_wallet($1)", [playerId]);

        if (email) {
          const normEmail = String(email).trim().toLowerCase();
          await tx.query(
            "INSERT INTO email_identity (id, player_id, email, email_display) VALUES ($1,$2,$3,$4)",
            [`eid_${randomUUID()}`, playerId, normEmail, String(email).trim()]
          );
        }

        const consentId = `lcn_${randomUUID()}`;
        const consentTime = new Date(now()).toISOString();
        await tx.query(
          `INSERT INTO legal_consent
             (id, player_id, policy_identifier, policy_version, locale, consent_type, source, accepted_at, ip_hash, user_agent_hash)
           VALUES ($1, $2, 'terms_of_service', $3, $4, 'TERMS_AND_CONDITIONS', 'WEB_REGISTRATION', $5, $6, $7)`,
          [
            consentId,
            playerId,
            policyVersion || "1.0.0",
            locale || "en",
            consentTime,
            ctx.ip ? sha256(ctx.ip) : null,
            ctx.userAgent ? sha256(ctx.userAgent) : null,
          ]
        );

        if (referralCode) {
          const cleanCode = String(referralCode).trim().toUpperCase();
          const rc = await tx.query(
            "SELECT player_id, is_active FROM referral_code WHERE code = $1",
            [cleanCode]
          );
          if (rc.rows.length && rc.rows[0].is_active && rc.rows[0].player_id !== playerId) {
            await tx.query(
              `INSERT INTO referral_attribution (referred_player_id, referrer_player_id, referral_code)
               VALUES ($1, $2, $3)`,
              [playerId, rc.rows[0].player_id, cleanCode]
            );
          }
        }

        await audit(tx, playerId, "REGISTERED", { handle, termsAccepted: true, policyVersion: policyVersion || "1.0.0" }, ctx);
        return { ok: true, playerId };
      });
    },

    /**
     * Log in. Returns tokens only when every factor has been satisfied.
     *
     * The failure path is uniform on purpose: an unknown handle and a wrong
     * password return the same reason after the same work, so the endpoint
     * cannot be used to enumerate who has an account.
     */
    async login({ identifier, password, totpCode = null, deviceFingerprint = null }, ctx = {}) {
      const t = now();

      const failures = await db.query("SELECT auth_recent_failures($1) AS n", [identifier]);
      if (failures.rows[0].n >= MAX_FAILURES) {
        await db.query(
          "INSERT INTO login_attempt (identifier, ip, succeeded) VALUES ($1,$2,FALSE)",
          [identifier, ctx.ip ?? null]
        );
        return { ok: false, reason: AuthError.LOCKED_OUT };
      }

      const row = await db.query(
        `SELECT p.id, p.disabled_at, p.disabled_category, c.password_hash
           FROM player p
           JOIN credential c ON c.player_id = p.id
           LEFT JOIN email_identity e ON e.player_id = p.id
          WHERE LOWER(p.handle) = LOWER($1) OR LOWER(e.email) = LOWER($1)
          LIMIT 1`,
        [String(identifier ?? "").trim()]
      );

      // Always do the Argon2 work, even for an unknown handle, so response time
      // does not reveal whether the account exists.
      const stored = row.rows[0]?.password_hash ?? DUMMY_HASH;
      let passwordOk = false;
      try {
        passwordOk = await argonVerify(stored, password);
      } catch {
        passwordOk = false;
      }
      if (!row.rows.length) passwordOk = false;

      if (!passwordOk) {
        await db.query(
          "INSERT INTO login_attempt (identifier, ip, succeeded) VALUES ($1,$2,FALSE)",
          [identifier, ctx.ip ?? null]
        );
        return { ok: false, reason: AuthError.BAD_CREDENTIALS };
      }

      if (row.rows[0]?.disabled_at) {
        return {
          ok: false,
          reason: row.rows[0].disabled_category === "CHEATING"
            ? AuthError.ACCOUNT_DISABLED_CHEATING
            : AuthError.ACCOUNT_DISABLED,
        };
      }

      const playerId = row.rows[0].id;

      const totpRow = await db.query(
        "SELECT secret_encrypted, key_id, confirmed_at, last_used_step FROM totp_secret WHERE player_id=$1",
        [playerId]
      );
      const has2fa = totpRow.rows.length > 0 && totpRow.rows[0].confirmed_at !== null;

      if (has2fa) {
        if (!totpCode) return { ok: false, reason: AuthError.TOTP_REQUIRED };
        const secret = decrypt(totpRow.rows[0].secret_encrypted, encryptionKey);
        const check = verifyTotp(secret, totpCode, t, {
          lastUsedStep: totpRow.rows[0].last_used_step,
        });
        if (!check.ok) {
          await db.query(
            "INSERT INTO login_attempt (identifier, ip, succeeded) VALUES ($1,$2,FALSE)",
            [identifier, ctx.ip ?? null]
          );
          await db.query(
            `INSERT INTO security_event (player_id, type, detail, ip)
             VALUES ($1,'TOTP_FAILED',$2::jsonb,$3)`,
            [playerId, JSON.stringify({ reason: check.reason }), ctx.ip ?? null]
          );
          return { ok: false, reason: AuthError.TOTP_INVALID, detail: check.reason };
        }
        // Burn the step so the same code cannot be replayed inside its window.
        await db.query("UPDATE totp_secret SET last_used_step = $2 WHERE player_id = $1",
          [playerId, check.step]);
      }

      return db.transaction(async (tx) => {
        const deviceId = deviceFingerprint
          ? await upsertDevice(tx, playerId, deviceFingerprint, t)
          : null;

        const session = await newSession(tx, {
          playerId, deviceId, familyId: randomUUID(), parentId: null, t, ctx,
        });

        await tx.query(
          "INSERT INTO login_attempt (identifier, ip, succeeded) VALUES ($1,$2,TRUE)",
          [identifier, ctx.ip ?? null]
        );
        await audit(tx, playerId, "LOGIN", { has2fa }, { ...ctx, deviceId });

        return {
          ok: true,
          playerId,
          accessToken: issueAccessToken(
            { playerId, sessionId: session.id, ttlSeconds: ACCESS_TTL_S }, signingKey, t
          ),
          refreshToken: session.refreshToken,
          expiresInSeconds: ACCESS_TTL_S,
        };
      });
    },

    /**
     * Issues a normal session for a player whose identity has ALREADY been
     * verified by some other factor -- today, a confirmed email login code
     * (packages/auth/src/email-login-code.mjs); a validated Google identity
     * later. This is not a second kind of session: it calls the exact same
     * `newSession()` every other login path uses, and enforces the exact
     * same TOTP gate `login()` does below -- a passwordless first factor
     * does not exempt an account from its own second factor. The caller is
     * trusted to have already confirmed the first factor; this method's
     * only job is "does this account also need TOTP, and if so was it
     * satisfied", then "create the session".
     */
    async loginPasswordless({ playerId, totpCode = null, deviceFingerprint = null }, ctx = {}) {
      const t = now();

      const playerCheck = await db.query("SELECT disabled_at, disabled_category FROM player WHERE id = $1", [playerId]);
      if (playerCheck.rows[0]?.disabled_at) {
        return {
          ok: false,
          reason: playerCheck.rows[0].disabled_category === "CHEATING"
            ? AuthError.ACCOUNT_DISABLED_CHEATING
            : AuthError.ACCOUNT_DISABLED,
        };
      }

      const totpRow = await db.query(
        "SELECT secret_encrypted, key_id, confirmed_at, last_used_step FROM totp_secret WHERE player_id=$1",
        [playerId]
      );
      const has2fa = totpRow.rows.length > 0 && totpRow.rows[0].confirmed_at !== null;

      if (has2fa) {
        if (!totpCode) return { ok: false, reason: AuthError.TOTP_REQUIRED };
        const secret = decrypt(totpRow.rows[0].secret_encrypted, encryptionKey);
        const check = verifyTotp(secret, totpCode, t, { lastUsedStep: totpRow.rows[0].last_used_step });
        if (!check.ok) {
          await db.query(
            `INSERT INTO security_event (player_id, type, detail, ip)
             VALUES ($1,'TOTP_FAILED',$2::jsonb,$3)`,
            [playerId, JSON.stringify({ reason: check.reason }), ctx.ip ?? null]
          );
          return { ok: false, reason: AuthError.TOTP_INVALID, detail: check.reason };
        }
        await db.query("UPDATE totp_secret SET last_used_step = $2 WHERE player_id = $1", [playerId, check.step]);
      }

      return db.transaction(async (tx) => {
        const deviceId = deviceFingerprint
          ? await upsertDevice(tx, playerId, deviceFingerprint, t)
          : null;

        const session = await newSession(tx, {
          playerId, deviceId, familyId: randomUUID(), parentId: null, t, ctx,
        });

        await audit(tx, playerId, "LOGIN", { has2fa, method: "EMAIL_CODE" }, { ...ctx, deviceId });

        return {
          ok: true,
          playerId,
          accessToken: issueAccessToken(
            { playerId, sessionId: session.id, ttlSeconds: ACCESS_TTL_S }, signingKey, t
          ),
          refreshToken: session.refreshToken,
          expiresInSeconds: ACCESS_TTL_S,
        };
      });
    },

    /**
     * Exchange a refresh token for a new pair.
     *
     * Single-use. Presenting a token that has already been rotated means the
     * token was captured -- we cannot tell the thief from the victim, so the
     * entire family is revoked and both must log in again.
     */
    async refresh(refreshToken, ctx = {}) {
      const t = now();
      const hash = hashRefreshToken(refreshToken);

      return db.transaction(async (tx) => {
        const r = await tx.query(
          `SELECT id, family_id, player_id, device_id, expires_at, rotated_at, revoked_at
             FROM auth_session WHERE refresh_hash = $1 FOR UPDATE`,
          [hash]
        );
        if (!r.rows.length) return { ok: false, reason: AuthError.SESSION_INVALID };
        const s = r.rows[0];

        if (s.revoked_at) return { ok: false, reason: AuthError.SESSION_REVOKED };

        const playerCheck = await tx.query("SELECT disabled_at, disabled_category FROM player WHERE id = $1", [s.player_id]);
        if (playerCheck.rows[0]?.disabled_at) {
          await tx.query("UPDATE auth_session SET revoked_at = now(), revoked_reason = 'ACCOUNT_DISABLED' WHERE id = $1", [s.id]);
          return {
            ok: false,
            reason: playerCheck.rows[0].disabled_category === "CHEATING"
              ? AuthError.ACCOUNT_DISABLED_CHEATING
              : AuthError.ACCOUNT_DISABLED,
          };
        }

        if (s.rotated_at) {
          // Replay of a spent token. Burn the whole chain.
          const n = await tx.query("SELECT auth_revoke_family($1,$2) AS n",
            [s.family_id, "refresh token reuse detected"]);
          await audit(tx, s.player_id, "REFRESH_REUSE_DETECTED",
            { familyId: s.family_id, revokedSessions: n.rows[0].n }, ctx);
          return { ok: false, reason: AuthError.TOKEN_REUSED, revoked: n.rows[0].n };
        }

        if (new Date(s.expires_at).getTime() <= t) {
          return { ok: false, reason: AuthError.SESSION_EXPIRED };
        }

        const child = await newSession(tx, {
          playerId: s.player_id, deviceId: s.device_id,
          familyId: s.family_id, parentId: s.id, t, ctx,
        });
        await tx.query("UPDATE auth_session SET rotated_at = now() WHERE id = $1", [s.id]);

        return {
          ok: true,
          playerId: s.player_id,
          accessToken: issueAccessToken(
            { playerId: s.player_id, sessionId: child.id, ttlSeconds: ACCESS_TTL_S }, signingKey, t
          ),
          refreshToken: child.refreshToken,
          expiresInSeconds: ACCESS_TTL_S,
        };
      });
    },

    /** Verify an access token. No database round trip; that is the point. */
    verifyAccess(token) {
      return verifyAccessToken(token, signingKey, now());
    },

    /**
     * Verify an access token AND confirm its session is still alive.
     * Used on money surfaces, where a 15-minute revocation gap is too long.
     */
    async verifyAccessStrict(token) {
      const res = verifyAccessToken(token, signingKey, now());
      if (!res.ok) return res;
      const r = await db.query(
        "SELECT revoked_at FROM auth_session WHERE id = $1", [res.claims.sid]
      );
      if (!r.rows.length) return { ok: false, reason: AuthError.SESSION_INVALID };
      if (r.rows[0].revoked_at) return { ok: false, reason: AuthError.SESSION_REVOKED };
      return res;
    },

    async logout(refreshToken, { everywhere = false } = {}, ctx = {}) {
      const hash = hashRefreshToken(refreshToken);
      return db.transaction(async (tx) => {
        const r = await tx.query(
          "SELECT id, family_id, player_id FROM auth_session WHERE refresh_hash = $1", [hash]
        );
        if (!r.rows.length) return { ok: true, revoked: 0 };
        const s = r.rows[0];
        if (everywhere) {
          const all = await tx.query(
            `UPDATE auth_session SET revoked_at = now(), revoked_reason = 'logout everywhere'
              WHERE player_id = $1 AND revoked_at IS NULL RETURNING id`, [s.player_id]
          );
          await audit(tx, s.player_id, "LOGOUT_EVERYWHERE", { count: all.rows.length }, ctx);
          return { ok: true, revoked: all.rows.length };
        }
        const n = await tx.query("SELECT auth_revoke_family($1,$2) AS n", [s.family_id, "logout"]);
        await audit(tx, s.player_id, "LOGOUT", {}, ctx);
        return { ok: true, revoked: n.rows[0].n };
      });
    },

    /**
     * Change a password. Revokes every other session -- if the password changed
     * because it was compromised, leaving old sessions alive defeats the change
     * -- and starts the withdrawal cooling-off window.
     */
    async changePassword({ playerId, currentPassword, newPassword }, ctx = {}) {
      const weak = checkPasswordStrength(newPassword);
      if (weak) return { ok: false, reason: AuthError.WEAK_PASSWORD, detail: weak };

      const r = await db.query("SELECT password_hash FROM credential WHERE player_id = $1", [playerId]);
      if (!r.rows.length) return { ok: false, reason: AuthError.BAD_CREDENTIALS };
      if (!(await argonVerify(r.rows[0].password_hash, currentPassword))) {
        return { ok: false, reason: AuthError.BAD_CREDENTIALS };
      }

      const newHash = await argonHash(newPassword, argon);
      return db.transaction(async (tx) => {
        await tx.query(
          "UPDATE credential SET password_hash = $2, changed_at = now() WHERE player_id = $1",
          [playerId, newHash]
        );
        const revoked = await tx.query(
          `UPDATE auth_session SET revoked_at = now(), revoked_reason = 'password changed'
            WHERE player_id = $1 AND revoked_at IS NULL RETURNING id`, [playerId]
        );
        await audit(tx, playerId, "PASSWORD_CHANGED", { revokedSessions: revoked.rows.length }, ctx);
        return { ok: true, revokedSessions: revoked.rows.length };
      });
    },

    /**
     * Sets a new password without knowing the old one -- for a caller that
     * has ALREADY proven identity some other way (packages/auth/src/
     * password-reset.mjs, after its own PASSWORD_RESET challenge is
     * consumed). Deliberately everything `changePassword()` does except
     * the current-password check: same strength policy, same Argon2id
     * hashing, same "revoke every active session" response to a
     * high-risk credential change (a stolen session must not remain a
     * silent, permanent way in after the real owner takes their account
     * back), same audit trail -- just its own event type, so a
     * self-service change and a challenge-proven reset are still
     * distinguishable in the log. Does not touch email_identity in any
     * way: a password reset is not proof of a *new* claim to the email
     * address (verifying the address already proved that, separately),
     * so it must never grant, revoke, or otherwise change verification
     * status, and never touches TOTP or any other account state.
     */
    async resetPassword({ playerId, newPassword }, ctx = {}) {
      const weak = checkPasswordStrength(newPassword);
      if (weak) return { ok: false, reason: AuthError.WEAK_PASSWORD, detail: weak };

      const newHash = await argonHash(newPassword, argon);
      return db.transaction(async (tx) => {
        await tx.query(
          "UPDATE credential SET password_hash = $2, changed_at = now() WHERE player_id = $1",
          [playerId, newHash]
        );
        const revoked = await tx.query(
          `UPDATE auth_session SET revoked_at = now(), revoked_reason = 'password reset'
            WHERE player_id = $1 AND revoked_at IS NULL RETURNING id`, [playerId]
        );
        await audit(tx, playerId, "PASSWORD_RESET_COMPLETED", { revokedSessions: revoked.rows.length }, ctx);
        return { ok: true, revokedSessions: revoked.rows.length };
      });
    },

    /**
     * Sets a password for a player who does not have one yet -- a Google-
     * only account (packages/auth/src/google-oauth.mjs's signup path never
     * creates a `credential` row, since there is no password to store).
     * This is deliberately NOT changePassword() or resetPassword(): both of
     * those UPDATE an existing row, and this player has none. It exists
     * because directive #8's unlink-safety policy requires an escape hatch
     * -- a Google-only player who wants to remove Google must be able to
     * gain a password first, or they would otherwise be permanently locked
     * out of their own account. Refuses outright if a credential already
     * exists (that is what changePassword() is for); no existing session is
     * revoked, because there is no prior password-derived session to have
     * been compromised.
     */
    async setInitialPassword({ playerId, newPassword }, ctx = {}) {
      const weak = checkPasswordStrength(newPassword);
      if (weak) return { ok: false, reason: AuthError.WEAK_PASSWORD, detail: weak };

      const existing = await db.query("SELECT 1 FROM credential WHERE player_id = $1", [playerId]);
      if (existing.rows.length) return { ok: false, reason: AuthError.CREDENTIAL_ALREADY_SET };

      const passwordHash = await argonHash(newPassword, argon);
      return db.transaction(async (tx) => {
        const inserted = await tx.query(
          `INSERT INTO credential (player_id, password_hash) VALUES ($1,$2)
             ON CONFLICT (player_id) DO NOTHING RETURNING player_id`,
          [playerId, passwordHash]
        );
        if (!inserted.rows.length) {
          // Lost a race with a concurrent setInitialPassword/register for
          // the same player -- exactly the same "not an error, someone
          // else already got there" shape as this file's other unique
          // constraints.
          return { ok: false, reason: AuthError.CREDENTIAL_ALREADY_SET };
        }
        await audit(tx, playerId, "PASSWORD_INITIALIZED", {}, ctx);
        return { ok: true };
      });
    },

    // --- Two-factor ----------------------------------------------------------

    /** Begin enrolment. The secret is not active until a code confirms it. */
    async beginTotpEnrolment(playerId, accountLabel) {
      const secret = generateSecret();
      await db.query(
        `INSERT INTO totp_secret (player_id, secret_encrypted, key_id, changed_at)
         VALUES ($1,$2,'primary', now())
         ON CONFLICT (player_id) DO UPDATE
           SET secret_encrypted = EXCLUDED.secret_encrypted,
               confirmed_at = NULL, changed_at = now(), last_used_step = NULL`,
        [playerId, encrypt(secret, encryptionKey)]
      );
      return {
        ok: true,
        secretBase32: base32Encode(secret),
        uri: otpauthUri({ secret, account: accountLabel }),
      };
    },

    /** Confirm enrolment and issue single-use recovery codes. */
    async confirmTotpEnrolment(playerId, code, ctx = {}) {
      const r = await db.query(
        "SELECT secret_encrypted FROM totp_secret WHERE player_id = $1", [playerId]
      );
      if (!r.rows.length) return { ok: false, reason: "NOT_ENROLLING" };

      const secret = decrypt(r.rows[0].secret_encrypted, encryptionKey);
      const check = verifyTotp(secret, code, now());
      if (!check.ok) return { ok: false, reason: AuthError.TOTP_INVALID, detail: check.reason };

      const codes = Array.from({ length: 10 }, () => randomBytes(5).toString("hex"));
      return db.transaction(async (tx) => {
        await tx.query(
          "UPDATE totp_secret SET confirmed_at = now(), last_used_step = $2 WHERE player_id = $1",
          [playerId, check.step]
        );
        await tx.query("DELETE FROM recovery_code WHERE player_id = $1", [playerId]);
        for (const c of codes) {
          await tx.query(
            "INSERT INTO recovery_code (player_id, code_hash) VALUES ($1,$2)",
            [playerId, sha256(c)]
          );
        }
        await audit(tx, playerId, "TOTP_ENABLED", {}, ctx);
        // Shown once, never retrievable again.
        return { ok: true, recoveryCodes: codes };
      });
    },

    /** Spend a recovery code. Single-use, and constant-time on the lookup. */
    async useRecoveryCode(playerId, code, ctx = {}) {
      return db.transaction(async (tx) => {
        const r = await tx.query(
          `SELECT code_hash FROM recovery_code
            WHERE player_id = $1 AND code_hash = $2 AND used_at IS NULL FOR UPDATE`,
          [playerId, sha256(code)]
        );
        if (!r.rows.length) return { ok: false, reason: "INVALID_RECOVERY_CODE" };
        await tx.query(
          "UPDATE recovery_code SET used_at = now() WHERE player_id = $1 AND code_hash = $2",
          [playerId, r.rows[0].code_hash]
        );
        await audit(tx, playerId, "RECOVERY_CODE_USED", {}, ctx);
        return { ok: true };
      });
    },

    // --- Step-up -------------------------------------------------------------

    /**
     * Re-authenticate for one privileged action. Requires the password, and the
     * TOTP code when 2FA is on. The resulting token is bound to that action and
     * lives five minutes.
     */
    async stepUp({ playerId, action, password, totpCode = null }, ctx = {}) {
      const t = now();
      const r = await db.query("SELECT password_hash FROM credential WHERE player_id=$1", [playerId]);
      if (!r.rows.length) return { ok: false, reason: AuthError.BAD_CREDENTIALS };
      if (!(await argonVerify(r.rows[0].password_hash, password))) {
        return { ok: false, reason: AuthError.BAD_CREDENTIALS };
      }

      const totpRow = await db.query(
        "SELECT secret_encrypted, confirmed_at, last_used_step FROM totp_secret WHERE player_id=$1",
        [playerId]
      );
      if (totpRow.rows.length && totpRow.rows[0].confirmed_at) {
        if (!totpCode) return { ok: false, reason: AuthError.TOTP_REQUIRED };
        const secret = decrypt(totpRow.rows[0].secret_encrypted, encryptionKey);
        const check = verifyTotp(secret, totpCode, t, {
          lastUsedStep: totpRow.rows[0].last_used_step,
        });
        if (!check.ok) return { ok: false, reason: AuthError.TOTP_INVALID };
        await db.query("UPDATE totp_secret SET last_used_step=$2 WHERE player_id=$1",
          [playerId, check.step]);
      }

      await db.query(
        `INSERT INTO security_event (player_id, type, detail) VALUES ($1,'STEP_UP',$2::jsonb)`,
        [playerId, JSON.stringify({ action })]
      );
      return { ok: true, stepUpToken: issueStepUpToken({ playerId, action }, signingKey, t) };
    },

    verifyStepUp(token, action) {
      return verifyStepUpToken(token, action, signingKey, now());
    },

    /**
     * The gate every withdrawal must pass. Combines step-up with the
     * post-change freeze, because either one alone leaves the takeover path
     * open.
     */
    async authoriseWithdrawal({ playerId, stepUpToken }) {
      const step = verifyStepUpToken(stepUpToken, "withdrawal", signingKey, now());
      if (!step.ok) return { ok: false, reason: "STEP_UP_REQUIRED", detail: step.reason };
      if (step.claims.sub !== playerId) return { ok: false, reason: "STEP_UP_MISMATCH" };

      const cool = await db.query("SELECT auth_in_cooling_off($1) AS c", [playerId]);
      if (cool.rows[0].c) return { ok: false, reason: AuthError.COOLING_OFF };

      return { ok: true };
    },

    async listSessions(playerId) {
      const r = await db.query(
        `SELECT id, family_id, device_id, issued_at, expires_at, rotated_at, revoked_at, ip
           FROM auth_session WHERE player_id = $1 ORDER BY issued_at DESC`,
        [playerId]
      );
      return r.rows;
    },
  };

  return svc;

  async function newSession(tx, { playerId, deviceId, familyId, parentId, t, ctx }) {
    const id = randomUUID();
    const refreshToken = generateRefreshToken();
    // issued_at is set from the SERVICE clock, not the database default.
    // Mixing an injectable clock with now() means the two can disagree, and
    // auth_session_expiry_after_issue then rejects a perfectly valid session.
    await tx.query(
      `INSERT INTO auth_session
         (id, family_id, player_id, device_id, refresh_hash, parent_id,
          issued_at, expires_at, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, familyId, playerId, deviceId, hashRefreshToken(refreshToken), parentId,
       new Date(t).toISOString(), new Date(t + REFRESH_TTL_MS).toISOString(),
       ctx.ip ?? null, ctx.userAgent ?? null]
    );
    return { id, refreshToken };
  }
}

// --- helpers -----------------------------------------------------------------

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/**
 * AES-256-GCM envelope encryption for TOTP secrets. The key lives in the
 * secrets manager, never in the database -- so a dumped table yields
 * ciphertext, and 2FA is not silently defeated by a SQL injection.
 */
function encrypt(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

function decrypt(payload, key) {
  const buf = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
}

async function upsertDevice(tx, playerId, fingerprint, t) {
  const id = `dev_${sha256(playerId + fingerprint).slice(0, 24)}`;
  await tx.query(
    `INSERT INTO device (id, player_id, fingerprint) VALUES ($1,$2,$3)
     ON CONFLICT (player_id, fingerprint) DO UPDATE SET last_seen_at = now()`,
    [id, playerId, fingerprint]
  );
  const r = await tx.query(
    "SELECT id FROM device WHERE player_id=$1 AND fingerprint=$2", [playerId, fingerprint]
  );
  return r.rows[0].id;
}

/**
 * Length first, then obvious weakness. Deliberately NOT a composition rule
 * ("one uppercase, one symbol") -- those push users toward Password1! and are
 * worse than a length floor.
 */
/**
 * Exported so a flow that needs to validate a new password BEFORE
 * consuming some other one-time resource (password-reset.mjs validates
 * before spending the reset challenge, so a weak password does not burn a
 * still-good code) can reuse the exact same policy `changePassword()` and
 * `register()` already enforce, instead of a second, potentially
 * inconsistent password rule living in another file.
 */
export function checkPasswordStrength(password) {
  if (typeof password !== "string") return "password must be a string";
  if (password.length < 12) return "password must be at least 12 characters";
  if (password.length > 256) return "password must be at most 256 characters";
  const lowered = password.toLowerCase();
  const common = ["password", "12345678", "qwerty", "letmein", "iloveyou", "admin123", "nizalo"];
  if (common.some((c) => lowered.includes(c))) return "password is too easily guessed";
  if (/^(.)\1+$/.test(password)) return "password cannot be a single repeated character";
  return null;
}

// A real Argon2id hash of a random value, so the unknown-account path does the
// same work as the known-account path.
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZTEyMw$" +
  "R6bMDh5vJHkPPYBqMUBRbCsLBUP8LWL0h2K0Zb0hxOM";
