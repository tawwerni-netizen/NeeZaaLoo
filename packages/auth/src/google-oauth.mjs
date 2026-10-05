/**
 * The Google identity provider integration. This is NOT a second
 * authentication system -- it is one more way to arrive at the exact same
 * place every other login path arrives at: `auth.loginPasswordless()`
 * (service.mjs), the same TOTP gate, the same session issuance, the same
 * security audit log every password and email-code login already uses.
 *
 * Two intents share one state machine, distinguished by `state.intent`
 * (see tokens.mjs's issueOAuthState/verifyOAuthState):
 *
 *   "login" -- an anonymous visitor. Resolve to an existing linked player,
 *   a brand-new player, or (the security-sensitive case) a REFUSAL to
 *   silently take over an existing account that merely shares an email --
 *   see handleLoginCallback's own comment.
 *
 *   "link" -- an ALREADY authenticated, ALREADY stepped-up player (the
 *   policy enforces stepUp on player.identity.link before a state is ever
 *   minted for this intent) attaching Google to their existing account.
 *   The callback route itself is anonymous -- it is Google's own browser
 *   redirect, carrying no bearer token -- so the signed state is what
 *   proves this specific player already passed authorization.
 *
 * A third operation, unlink(), needs no OAuth round trip at all: it is a
 * plain authenticated action gated the same way link's *start* is.
 */
import { randomUUID, randomBytes } from "node:crypto";
import { issueOAuthState, verifyOAuthState } from "./tokens.mjs";
import { writeSecurityEvent } from "./audit.mjs";

export const PROVIDER = "google";

export const GoogleOAuthError = Object.freeze({
  INVALID_RETURN_TO: "INVALID_RETURN_TO",
  BAD_STATE: "BAD_STATE",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  NOT_LINKED: "NOT_LINKED",
  ALREADY_LINKED: "ALREADY_LINKED",
  SUBJECT_ALREADY_LINKED: "SUBJECT_ALREADY_LINKED",
  LAST_AUTH_METHOD: "LAST_AUTH_METHOD",
  PLAYER_NOT_FOUND: "PLAYER_NOT_FOUND",
});

function generateHandle() {
  // "player_" + 10 hex chars: 17 characters, satisfies player_handle_shape
  // ([A-Za-z0-9_-]{3,24}) with margin, and reveals honestly that it is a
  // placeholder -- nickname/profile setup is a separate, later step
  // (directive #4), never invented from Google's name/email without
  // consent.
  return `player_${randomBytes(5).toString("hex")}`;
}

export function createGoogleOAuthFlow(db, {
  googleProvider, oauthIdentity, oauthHandoff, emailIdentity, auth,
  signingKey, now = () => Date.now(),
  // Exact-match allowlist of frontend-relative paths the browser may be
  // sent back to after the OAuth round trip -- directive #18's "prevent
  // open redirects... prefer allowlisted internal paths", enforced at both
  // buildXAuthorizationUrl() (reject before minting state) and the route
  // layer (reject again before issuing the final redirect).
  allowedReturnPaths = [],
} = {}) {
  function isAllowedReturnTo(path) {
    return path === null || (typeof path === "string" && allowedReturnPaths.includes(path));
  }

  function buildLoginAuthorizationUrl({ returnTo = null, locale = null } = {}) {
    if (!isAllowedReturnTo(returnTo)) return { ok: false, reason: GoogleOAuthError.INVALID_RETURN_TO };
    const state = issueOAuthState({ intent: "login", provider: PROVIDER, returnTo, locale }, signingKey, now());
    return { ok: true, url: googleProvider.buildAuthorizationUrl({ state }) };
  }

  /** `playerId` is trusted here ONLY because the route requires the caller
   * to already be authenticated (and, per policy, stepped-up) for
   * player.identity.link before this is ever invoked -- see this file's
   * own header. */
  function buildLinkAuthorizationUrl({ playerId, returnTo = null, locale = null }) {
    if (!isAllowedReturnTo(returnTo)) return { ok: false, reason: GoogleOAuthError.INVALID_RETURN_TO };
    const state = issueOAuthState({ intent: "link", provider: PROVIDER, playerId, returnTo, locale }, signingKey, now());
    return { ok: true, url: googleProvider.buildAuthorizationUrl({ state }) };
  }

  async function handleCallback({ code, state }, ctx = {}) {
    const verified = verifyOAuthState(state, signingKey, now());
    if (!verified.ok) {
      await writeSecurityEvent(db, null, "GOOGLE_LOGIN_FAILED", { reason: GoogleOAuthError.BAD_STATE }, ctx);
      return { ok: false, reason: GoogleOAuthError.BAD_STATE };
    }
    const { intent, playerId: statePlayerId, returnTo, locale } = verified.claims;

    const exchanged = await googleProvider.exchangeCode(code);
    if (!exchanged.ok) {
      await writeSecurityEvent(db, null, "GOOGLE_LOGIN_FAILED", { reason: exchanged.reason }, ctx);
      return { ok: false, reason: GoogleOAuthError.PROVIDER_ERROR, providerReason: exchanged.reason, returnTo, locale };
    }
    const claims = await googleProvider.validateIdToken(exchanged.idToken);
    if (!claims.ok) {
      await writeSecurityEvent(db, null, "GOOGLE_LOGIN_FAILED", { reason: claims.reason }, ctx);
      return { ok: false, reason: GoogleOAuthError.PROVIDER_ERROR, providerReason: claims.reason, returnTo, locale };
    }

    if (intent === "link") return handleLinkCallback({ playerId: statePlayerId, claims, returnTo, locale }, ctx);
    if (intent === "login") return handleLoginCallback({ claims, returnTo, locale }, ctx);
    await writeSecurityEvent(db, null, "GOOGLE_LOGIN_FAILED", { reason: GoogleOAuthError.BAD_STATE }, ctx);
    return { ok: false, reason: GoogleOAuthError.BAD_STATE, returnTo, locale };
  }

  async function handleLoginCallback({ claims, returnTo, locale }, ctx) {
    await writeSecurityEvent(db, null, "GOOGLE_LOGIN_STARTED", { subject: claims.subject }, ctx);

    const existingLink = await oauthIdentity.getByProviderSubject(PROVIDER, claims.subject);
    if (existingLink) {
      const handoff = await oauthHandoff.issue({ playerId: existingLink.player_id, provider: PROVIDER });
      await writeSecurityEvent(db, existingLink.player_id, "GOOGLE_LOGIN_SUCCESS", { subject: claims.subject }, ctx);
      return { ok: true, outcome: "session", handoffCode: handoff.code, returnTo, locale };
    }

    // Not yet linked. This is directive #5's case: DO NOT auto-merge merely
    // because Google reports the same email an existing player already
    // verified through the application's own email flow -- a Google login
    // is not proof of control over an ALREADY-EXISTING Nizalo account, only
    // over the Google account itself. Refuse the automatic path; the
    // frontend directs the person to log in normally and link Google from
    // settings (the authenticated "link" intent above), where step-up
    // already stands in for that missing proof.
    if (claims.emailVerified && claims.email) {
      const existingEmail = await emailIdentity.getByEmail(claims.email);
      if (existingEmail?.verified_at) {
        await writeSecurityEvent(db, existingEmail.player_id, "GOOGLE_LOGIN_FAILED",
          { reason: "LINK_REQUIRED" }, ctx);
        return { ok: true, outcome: "link_required", email: claims.email, returnTo, locale };
      }
    }

    const playerId = await createPlayerForGoogleSignup(claims, ctx);
    const handoff = await oauthHandoff.issue({ playerId, provider: PROVIDER });
    await writeSecurityEvent(db, playerId, "GOOGLE_LOGIN_SUCCESS", { subject: claims.subject, newAccount: true }, ctx);
    return { ok: true, outcome: "session", handoffCode: handoff.code, returnTo, locale };
  }

  /**
   * Creates a brand-new player for a Google subject seen for the first
   * time, mirroring auth.register()'s own "player row + wallet, in one
   * transaction" shape -- but with no credential row (there is no
   * password) and a generated placeholder handle (there is no user-chosen
   * one yet). Race-safe against a second, concurrent signup for the SAME
   * Google subject (two tabs, a double-click, a replayed callback): the
   * loser of the oauth_identity_unique_subject constraint is not an
   * error, it is "someone else already won this exact race", so its
   * result is discarded in favour of the winner's player id -- exactly one
   * player is ever created per Google subject, never two.
   */
  async function createPlayerForGoogleSignup(claims, ctx) {
    try {
      return await db.transaction(async (tx) => {
        let playerId;
        for (let attempt = 0; ; attempt++) {
          const candidate = generateHandle();
          const exists = await tx.query("SELECT 1 FROM player WHERE handle = $1", [candidate]);
          if (!exists.rows.length) { playerId = candidate; break; }
          if (attempt >= 4) throw new Error("could not generate a unique placeholder handle");
        }

        await tx.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [playerId]);
        await tx.query("SELECT ledger_open_user_wallet($1)", [playerId]);
        await tx.query(
          `INSERT INTO oauth_identity (id, player_id, provider, provider_subject, email, email_verified, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,now())`,
          [`oid_${randomUUID()}`, playerId, PROVIDER, claims.subject, claims.email, claims.emailVerified]
        );

        if (claims.emailVerified && claims.email) {
          // A brand-new player has no existing email_identity row to
          // overwrite, so it is safe to pre-populate and pre-verify it
          // from a provider-VERIFIED email -- through the ordinary
          // email_identity table, not a Google-only field, preserving
          // directive #10/#11's separation between the provider identity
          // and the application's own email concept. If this exact
          // address is already claimed by a DIFFERENT player (verified or
          // not -- email_identity.email is globally unique), that is a
          // rare pre-existing claim this signup has no standing to
          // dispute: the new player is still created, just without an
          // application email pre-filled.
          // A real unique-violation here would otherwise abort the WHOLE
          // surrounding transaction at the database level (Postgres does
          // not let a later statement continue after one fails, even if
          // the JS-level exception is caught) -- a SAVEPOINT is what lets
          // the player and oauth_identity rows just inserted above survive
          // this one optional step failing.
          await tx.query("SAVEPOINT before_email_prefill");
          try {
            await tx.query(
              `INSERT INTO email_identity (id, player_id, email, email_display, verified_at)
               VALUES ($1,$2,$3,$4,now())`,
              [`eml_${randomUUID()}`, playerId, claims.email.trim().toLowerCase(), claims.email.trim()]
            );
          } catch (e) {
            if (!/email_identity_unique_email/.test(e.message)) throw e;
            await tx.query("ROLLBACK TO SAVEPOINT before_email_prefill");
          }
        }

        await writeSecurityEvent(tx, playerId, "REGISTERED", { via: "google" }, ctx);
        return playerId;
      });
    } catch (e) {
      if (/oauth_identity_unique_subject/.test(e.message)) {
        const winner = await oauthIdentity.getByProviderSubject(PROVIDER, claims.subject);
        return winner.player_id;
      }
      throw e;
    }
  }

  async function handleLinkCallback({ playerId, claims, returnTo, locale }, ctx) {
    await writeSecurityEvent(db, playerId, "GOOGLE_LINK_STARTED", { subject: claims.subject }, ctx);

    const player = await db.query("SELECT id FROM player WHERE id = $1", [playerId]);
    if (!player.rows.length) {
      await writeSecurityEvent(db, playerId, "GOOGLE_LINK_FAILED", { reason: GoogleOAuthError.PLAYER_NOT_FOUND }, ctx);
      return { ok: true, outcome: "link_failed", reason: GoogleOAuthError.PLAYER_NOT_FOUND, returnTo, locale };
    }

    const r = await oauthIdentity.link({
      playerId, provider: PROVIDER, subject: claims.subject, email: claims.email, emailVerified: claims.emailVerified,
    });
    if (!r.ok) {
      await writeSecurityEvent(db, playerId, "GOOGLE_LINK_FAILED", { reason: r.reason }, ctx);
      return { ok: true, outcome: "link_failed", reason: r.reason, returnTo, locale };
    }
    await writeSecurityEvent(db, playerId, "GOOGLE_LINKED", { subject: claims.subject }, ctx);
    return { ok: true, outcome: "linked", returnTo, locale };
  }

  /** Consumes a login-outcome handoff code and mints a REAL session via the
   * exact same auth.loginPasswordless() every other passwordless factor
   * uses -- TOTP is enforced there, unconditionally, exactly as it is for
   * email-code login. A Google login is a first factor, never a bypass. */
  async function finalize({ handoffCode, totpCode = null, deviceFingerprint = null }, ctx = {}) {
    const consumed = await oauthHandoff.consume({ code: handoffCode, provider: PROVIDER });
    if (!consumed.ok) return { ok: false, reason: consumed.reason };
    return auth.loginPasswordless({ playerId: consumed.playerId, totpCode, deviceFingerprint }, ctx);
  }

  /**
   * Refuses to remove the player's only remaining way to authenticate.
   * "Another method" means a password credential OR a different linked
   * provider -- not merely a verified email, since anyone can request a
   * password reset or login code to an inbox they no longer control just
   * as easily as one they do; a password or another provider identity is
   * what this codebase already treats as a real, separate factor.
   */
  async function unlink(playerId, ctx = {}) {
    const [hasCredential, otherIdentity] = await Promise.all([
      db.query("SELECT 1 FROM credential WHERE player_id = $1", [playerId]),
      db.query("SELECT 1 FROM oauth_identity WHERE player_id = $1 AND provider <> $2", [playerId, PROVIDER]),
    ]);
    if (!hasCredential.rows.length && !otherIdentity.rows.length) {
      await writeSecurityEvent(db, playerId, "GOOGLE_UNLINK_FAILED", { reason: GoogleOAuthError.LAST_AUTH_METHOD }, ctx);
      return { ok: false, reason: GoogleOAuthError.LAST_AUTH_METHOD };
    }

    const r = await oauthIdentity.unlink(playerId, PROVIDER);
    if (!r.ok) {
      await writeSecurityEvent(db, playerId, "GOOGLE_UNLINK_FAILED", { reason: r.reason }, ctx);
      return { ok: false, reason: r.reason };
    }
    await writeSecurityEvent(db, playerId, "GOOGLE_UNLINKED", {}, ctx);
    return { ok: true };
  }

  return {
    buildLoginAuthorizationUrl, buildLinkAuthorizationUrl,
    handleCallback, finalize, unlink,
  };
}
