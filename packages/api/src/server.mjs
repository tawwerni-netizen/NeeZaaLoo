/**
 * The REST API.
 *
 * Every route declares the policy action it performs. That is not a convention
 * a reviewer has to enforce -- the server REFUSES TO START if any route names
 * an action the policy does not declare, so an endpoint cannot ship without
 * someone deciding, in the policy, who may call it.
 *
 * The request pipeline is fixed and there is no way around it:
 *
 *   parse -> rate limit -> identify -> AUTHORIZE -> handle
 *
 * A handler never runs unless authorize() returned ALLOW. Ownership, capability,
 * step-up, four-eyes and emergency switches are all decided before any handler
 * sees the request, and the handler cannot re-open that decision.
 */
import { createServer } from "node:http";
import { authorize, Decision, ACTIONS, capabilitiesFor, undeclaredActions } from "../../authz/src/policy.mjs";
import {
  compileRoutes, matchRoute, readJsonBody, sendJson, errorBody,
} from "./router.mjs";
import { createRateLimiter, takeToken } from "../../realtime/src/protocol.mjs";
import { createMatchmakingService, MatchmakingError } from "../../matchmaking/src/matchmaking.mjs";
import { createVsComputerService } from "../../matchmaking/src/vs-computer.mjs";
import { createChallengeService, ChallengeError } from "../../matchmaking/src/challenge.mjs";
import { SUPPORTED_LOCALE_CODES, DEFAULT_LOCALE } from "../../i18n/src/locales.mjs";
import { RbacError } from "../../authz/src/rbac.mjs";
import { EmailIdentityError } from "../../auth/src/email-identity.mjs";
import { EmailVerificationError } from "../../auth/src/email-verification.mjs";
import { getAuthMethods } from "../../auth/src/auth-methods.mjs";
import { TicketError } from "../../support/src/ticket.mjs";
import { ChatAuthError, matchChannelId, globalChannelId } from "../../chat/src/channels.mjs";
import { ChatMessageError } from "../../chat/src/messages.mjs";
import { ModerationError } from "../../chat/src/moderation.mjs";
import { BlockError } from "../../chat/src/blocks.mjs";
import { ReportError } from "../../chat/src/reports.mjs";

export function createApi({
  db, auth, settlement = null, tournament = null, globalSkill = null, reconciliation = null, rbac = null,
  emailIdentity = null, emailVerification = null, welcomeEmail = null, emailLoginCode = null, passwordReset = null,
  googleOAuth = null, profile = null, support = null, ticketNotifications = null, chat = null,
  // Read-only admin visibility into EXP/achievements/badges (Slice 11,
  // directive #20) -- { exp, achievements, badges }, the SAME
  // packages/profile services `profile` above already wraps for the
  // player-facing view. No award/mutation method is ever reachable
  // through this bundle's routes below -- see this file's own comment at
  // the route itself for why a manual-EXP-edit endpoint does not exist.
  progression = null,
  // Where the browser is sent after the Google OAuth callback finishes --
  // a fixed, server-configured ORIGIN, never anything the request itself
  // supplies (see the callback route's own comment on why an
  // externally-controlled redirect target would be an open redirect). The
  // full path is built as `${origin}/${locale}/auth/google/complete`,
  // locale-prefixed like every other page this app serves; `locale` comes
  // from the signed OAuth state (see tokens.mjs's issueOAuthState), never
  // from the request, and falls back to the default locale if absent.
  googleFrontendOrigin = "https://nizalo.com",
  now = () => Date.now(), rateLimit, controlCacheMs = 1000,
  // A second, stricter, per-IP limiter for specific public/pre-auth routes
  // that a global per-client budget is too generous for -- see routes
  // tagged with `rateLimitKey` below. Keyed by that string, not by route,
  // so a future route (password reset's own request endpoint) can share
  // the same named bucket deliberately, or get its own.
  sensitiveRateLimits = {},
  // No origin is trusted unless explicitly configured -- a browser-based
  // client (the web app) is cross-origin from this API by construction, so
  // the safe default is "CORS headers are never sent", not "allow
  // everything and lock it down later". Exact-match allowlist only, never
  // a wildcard or a reflected-origin default: this API sits in front of
  // the same financial/matchmaking surfaces the rest of this file protects.
  corsOrigins = [],
}) {
  const routes = compileRoutes(buildRoutes());

  // Fail closed at startup. An undeclared action here is a deployment that
  // would have served an endpoint nobody authorised.
  const undeclared = undeclaredActions(routes.map((r) => r.action).filter(Boolean));
  if (undeclared.length) {
    throw new Error(
      `refusing to start: these routes name actions the policy does not declare: ${undeclared.join(", ")}`
    );
  }
  const missingAction = routes.filter((r) => !r.action).map((r) => `${r.method} ${r.path}`);
  if (missingAction.length) {
    throw new Error(`refusing to start: routes without a declared action: ${missingAction.join(", ")}`);
  }

  const limiters = new Map();
  // sensitiveLimiters: rateLimitKey -> (ip -> limiter). Each key gets its
  // own independent set of per-IP buckets, configured via
  // `sensitiveRateLimits[key]` (defaults to a conservative 5-per-5-minutes
  // if a route names a key with no explicit config).
  const sensitiveLimiters = new Map();
  let controlCache = { at: 0, value: null };

  async function loadControls() {
    const t = now();
    if (controlCache.value && t - controlCache.at < controlCacheMs) return controlCache.value;
    const r = await db.query("SELECT key, control_enabled(key) AS on FROM platform_control");
    const value = Object.fromEntries(r.rows.map((x) => [x.key, x.on]));
    controlCache = { at: t, value };
    return value;
  }

  /** Resolve the caller. An absent or bad token means an anonymous actor. */
  async function identify(req) {
    const header = req.headers.authorization ?? "";
    if (!header.startsWith("Bearer ")) return { type: "ANON", id: null };
    const token = header.slice(7).trim();

    const res = await auth.verifyAccessStrict(token);
    if (!res.ok) return { type: "ANON", id: null, tokenError: res.reason };

    const playerId = res.claims.sub;

    // An admin identity is derived from the database, never from the token.
    // A token cannot claim a role it was not granted.
    const adminRow = await db.query(
      `SELECT u.id, u.mfa_enrolled, u.disabled_at, admin_roles(u.id) AS roles
         FROM admin_user u WHERE u.id = $1`,
      [playerId]
    );
    if (adminRow.rows.length) {
      const a = adminRow.rows[0];
      // Merge in whatever the custom RBAC layer (rbac.mjs) grants this
      // admin through a custom role -- TICKET_VIEW/REPLY/ASSIGN/ESCALATE/
      // CLOSE and any future permission code. Safe to union into the SAME
      // Set the fixed grid populates: `permission.code` and
      // ROLE_CAPABILITIES's capability strings are disjoint namespaces by
      // construction (see rbac.mjs's own header and its reconciliation
      // test), so this can never hand out a fixed-grid capability through
      // a custom role, and authorize() itself needs no change to start
      // honouring these -- it already just checks `caps.has(...)`.
      const fixedCapabilities = capabilitiesFor(a.roles ?? []);
      const customPermissions = rbac ? await rbac.effectivePermissions(a.id) : [];
      const capabilities = new Set([...fixedCapabilities, ...customPermissions]);
      return {
        type: "ADMIN",
        id: a.id,
        roles: a.roles ?? [],
        capabilities,
        mfaEnrolled: a.mfa_enrolled,
        disabled: a.disabled_at !== null,
        sessionId: res.claims.sid,
      };
    }
    return { type: "PLAYER", id: playerId, sessionId: res.claims.sid };
  }

  const server = createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      // The client is told nothing about the failure beyond that it happened.
      // Stacks, SQL and internal ids stay on this side of the wire.
      // eslint-disable-next-line no-console
      console.error("api error", err);
      if (!res.headersSent) sendJson(res, 500, errorBody("INTERNAL"));
      else res.end();
    }
  });

  function applyCors(req, res) {
    const origin = req.headers.origin;
    if (!origin || !corsOrigins.includes(origin)) return false;
    // `vary: origin` is required whenever the allowed-origin header's value
    // depends on the request -- otherwise a shared cache could serve one
    // origin's CORS-approved response to a different, disallowed origin.
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "origin");
    return true;
  }

  async function handle(req, res) {
    const allowed = applyCors(req, res);

    // A preflight is never a real route and carries no body or auth of its
    // own -- answer it before rate limiting, body parsing or routing ever
    // see it. An origin that didn't pass applyCors gets a plain 204 with no
    // allow-origin header, which is exactly what makes the browser refuse
    // the real request that would have followed.
    if (req.method === "OPTIONS") {
      if (allowed) {
        res.setHeader("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
        res.setHeader("access-control-allow-headers", "content-type, authorization, x-step-up-token");
        res.setHeader("access-control-max-age", "600");
      }
      res.writeHead(204).end();
      return;
    }

    const url = new URL(req.url, "http://localhost");
    const matched = matchRoute(routes, req.method, url.pathname);

    if (!matched) return sendJson(res, 404, errorBody("NOT_FOUND"));
    if (matched.methodNotAllowed) return sendJson(res, 405, errorBody("METHOD_NOT_ALLOWED"));

    const { route, params } = matched;

    // Rate limiting before any work, keyed by client address.
    const key = req.socket.remoteAddress ?? "unknown";
    if (!limiters.has(key)) limiters.set(key, createRateLimiter(rateLimit));
    if (!takeToken(limiters.get(key), now())) {
      return sendJson(res, 429, errorBody("RATE_LIMITED"), { "retry-after": "1" });
    }

    // A second, stricter, per-IP budget for specific high-risk public
    // routes (see `rateLimitKey` on the route definition) -- on top of,
    // never instead of, the general limiter above.
    if (route.rateLimitKey) {
      if (!sensitiveLimiters.has(route.rateLimitKey)) sensitiveLimiters.set(route.rateLimitKey, new Map());
      const byIp = sensitiveLimiters.get(route.rateLimitKey);
      if (!byIp.has(key)) {
        byIp.set(key, createRateLimiter(sensitiveRateLimits[route.rateLimitKey] ?? { capacity: 5, refillPerSecond: 5 / 300 }));
      }
      if (!takeToken(byIp.get(key), now())) {
        return sendJson(res, 429, errorBody("RATE_LIMITED"), { "retry-after": "60" });
      }
    }

    // A route may declare its own `maxBodyBytes` -- today only the avatar
    // upload route does, since a base64-encoded image legitimately
    // exceeds the default 64KB cap every other JSON body is held to.
    // Every other route is unaffected by this being configurable at all.
    const parsed = ["POST", "PUT", "PATCH"].includes(req.method)
      ? await readJsonBody(req, route.maxBodyBytes ? { maxBytes: route.maxBodyBytes } : {})
      : { ok: true, body: {} };
    if (!parsed.ok) {
      const status = parsed.code === "PAYLOAD_TOO_LARGE" ? 413
        : parsed.code === "UNSUPPORTED_MEDIA_TYPE" ? 415 : 400;
      return sendJson(res, status, errorBody(parsed.code));
    }

    const actor = await identify(req);
    const ctx = {
      params, body: parsed.body, query: url.searchParams, actor,
      ip: req.socket.remoteAddress, db, auth, settlement, tournament, globalSkill, reconciliation, rbac,
      emailIdentity, emailVerification, welcomeEmail, emailLoginCode, passwordReset,
      googleOAuth, googleFrontendOrigin, profile, support, ticketNotifications, chat, progression, now,
    };

    if (!route.anonymous && actor.type === "ANON") {
      return sendJson(res, 401, errorBody("UNAUTHENTICATED"));
    }

    // Step-up is presented as a header and verified here, never trusted from
    // the body and never remembered across requests.
    const stepUpToken = req.headers["x-step-up-token"];
    let effectiveActor = actor;
    if (stepUpToken && actor.id) {
      const step = auth.verifyStepUp(String(stepUpToken), route.action);
      if (step.ok && step.claims.sub === actor.id) {
        effectiveActor = { ...actor, stepUpFor: route.action };
      }
    }

    const decision = authorize({
      actor: effectiveActor.type === "ANON"
        ? { type: "PLAYER", id: null }   // anonymous routes are player-scoped
        : effectiveActor,
      action: route.action,
      resource: route.owner ? { ownerId: route.owner(ctx) } : {},
      controls: await loadControls(),
      // A four-eyes action is only ever backed by a REAL row from
      // approval_request, fetched here from the database -- never from
      // anything the client asserts about who approved it. The client
      // supplies only the id; whether it is actually approved, and by whom,
      // comes from the row the second admin's own decision wrote.
      approval: ACTIONS[route.action]?.fourEyes ? await resolveApproval(ctx.body?.approvalRequestId) : null,
    });

    if (decision.decision !== Decision.ALLOW) {
      await recordDenial(actor, route, decision, ctx);
      const status =
        decision.decision === Decision.REQUIRE_STEP_UP ? 401 :
        decision.decision === Decision.REQUIRE_APPROVAL ? 409 :
        decision.reason === "CONTROL_DISABLED" ? 503 : 403;
      return sendJson(res, status, errorBody(decision.reason, decision.detail));
    }

    const result = await route.handler(ctx);
    if (actor.type === "ADMIN") await recordAdminAction(actor, route, ctx, result);
    // `headers` is used by exactly one route today: the Google OAuth
    // callback, which is landed on by Google's OWN browser redirect (not a
    // fetch() the frontend controls) and therefore has to hand off with an
    // HTTP redirect of its own -- the one deliberate exception to "this API
    // serves JSON to programs, never markup to browsers" documented at the
    // top of router.mjs. Every other route leaves this unset.
    return sendJson(res, result.status ?? 200, result.body ?? {}, result.headers ?? {});
  }

  async function resolveApproval(approvalRequestId) {
    if (!approvalRequestId) return null;
    const r = await db.query(
      `SELECT action, status, decided_by FROM approval_request WHERE id = $1`,
      [approvalRequestId]
    );
    if (!r.rows.length || r.rows[0].status !== "APPROVED") return null;
    return { action: r.rows[0].action, approvedBy: r.rows[0].decided_by };
  }

  async function recordDenial(actor, route, decision, ctx) {
    if (actor.type !== "ADMIN") return;
    await db.query(
      `INSERT INTO admin_audit (admin_id, action, decision, detail, ip)
       VALUES ($1,$2,$3,$4::jsonb,$5)`,
      [actor.id, route.action, decision.decision,
       JSON.stringify({ reason: decision.reason }), ctx.ip ?? null]
    );
  }

  async function recordAdminAction(actor, route, ctx, result) {
    // A handler may return `audit: {...}` alongside its body -- e.g. the
    // before/after state of a role's permissions -- to enrich this record.
    // Existing handlers return no such field and get exactly the {} this
    // always wrote before. `audit.subjectId` additionally overrides the
    // subject id for a route where the real subject is chosen in the body,
    // not the URL -- creating a role by POSTing its id is the case this
    // exists for; every :id-in-the-path route still gets it from params.
    const subjectId = result?.audit?.subjectId ?? ctx.params.id ?? ctx.params.key ?? null;
    await db.query(
      `INSERT INTO admin_audit (admin_id, action, decision, subject_type, subject_id, detail, ip)
       VALUES ($1,$2,'ALLOW',$3,$4,$5::jsonb,$6)`,
      [actor.id, route.action, route.subjectType ?? null,
       subjectId, JSON.stringify(result?.audit ?? {}), ctx.ip ?? null]
    );
  }

  return {
    server,
    routes,
    listen: () => new Promise((r) => server.listen(0, "127.0.0.1", r)),
    get port() { return server.address().port; },
    get url() { return `http://127.0.0.1:${server.address().port}`; },
    close: () => new Promise((r) => server.close(r)),
  };
}

// ---------------------------------------------------------------------------

/** Maps a ticket.mjs error reason to the HTTP status the routes below return. */
function ticketErrorStatus(reason) {
  if (reason === TicketError.NOT_FOUND) return 404;
  if (reason === TicketError.DUPLICATE_OPEN_TICKET || reason === TicketError.TICKET_CLOSED
      || reason === TicketError.INVALID_TRANSITION) return 409;
  return 400;
}

/** The address/language a ticket notification goes out in -- both may come
 * back null (no email on file, no saved preference), which notify() itself
 * already treats as a silent skip / DEFAULT_LOCALE fallback. */
async function emailContactFor(db, playerId) {
  const r = await db.query(
    `SELECT p.locale, e.email_display FROM player p
       LEFT JOIN email_identity e ON e.player_id = p.id
      WHERE p.id = $1`,
    [playerId]
  );
  return { email: r.rows[0]?.email_display ?? null, locale: r.rows[0]?.locale ?? null };
}

/** Maps a chat package error reason (channels/messages/moderation/blocks/
 * reports) to the HTTP status the routes below return. */
function chatErrorStatus(reason) {
  if (reason === ChatAuthError.NO_SUCH_CHANNEL || reason === ChatAuthError.NO_SUCH_MATCH
      || reason === ChatMessageError.NOT_FOUND || reason === ModerationError.NOT_FOUND
      || reason === ReportError.NOT_FOUND) return 404;
  if (reason === ChatAuthError.NOT_A_PARTICIPANT || reason === ChatAuthError.NOT_YET_AVAILABLE
      || reason === ChatAuthError.CHANNEL_CLOSED || reason === ChatAuthError.SPECTATORS_DISABLED
      || reason === ChatAuthError.POST_GAME_CLOSED) return 403;
  if (reason === ChatMessageError.ALREADY_REMOVED || reason === ModerationError.ALREADY_REVOKED) return 409;
  return 400;
}

function buildRoutes() {
  return [
    { method: "GET", path: "/v1/health", action: "player.login", anonymous: true,
      handler: async () => ({ body: { ok: true } }) },

    // --- Auth ----------------------------------------------------------------
    { method: "POST", path: "/v1/auth/register", action: "player.register", anonymous: true,
      handler: async ({ body, auth, ip }) => {
        const { handle, password } = body;
        if (typeof handle !== "string" || typeof password !== "string") {
          return { status: 400, body: errorBody("BAD_REQUEST") };
        }
        const r = await auth.register({ playerId: handle, handle, password }, { ip });
        return r.ok
          ? { status: 201, body: { playerId: r.playerId } }
          : { status: 400, body: errorBody(r.reason, r.detail) };
      } },

    { method: "POST", path: "/v1/auth/login", action: "player.login", anonymous: true,
      handler: async ({ body, auth, ip }) => {
        const r = await auth.login({
          identifier: String(body.identifier ?? ""),
          password: String(body.password ?? ""),
          totpCode: body.totpCode ? String(body.totpCode) : null,
          deviceFingerprint: body.deviceFingerprint ? String(body.deviceFingerprint) : null,
        }, { ip });
        if (!r.ok) {
          // 401 for every credential failure, and 429 only for throttling: the
          // status code must not distinguish "wrong password" from "no account".
          const status = r.reason === "LOCKED_OUT" ? 429 : 401;
          return { status, body: errorBody(r.reason) };
        }
        return { body: {
          playerId: r.playerId, accessToken: r.accessToken,
          refreshToken: r.refreshToken, expiresInSeconds: r.expiresInSeconds,
        } };
      } },

    { method: "POST", path: "/v1/auth/refresh", action: "player.login", anonymous: true,
      handler: async ({ body, auth, ip }) => {
        const r = await auth.refresh(String(body.refreshToken ?? ""), { ip });
        return r.ok
          ? { body: { accessToken: r.accessToken, refreshToken: r.refreshToken } }
          : { status: 401, body: errorBody(r.reason) };
      } },

    // Passwordless login via a 6-character emailed code (Slice 3). Both
    // routes are anonymous like register/login/refresh above -- the caller
    // has no session yet, that is the entire point. request() is
    // enumeration-safe BY CONSTRUCTION (see email-login-code.mjs's own
    // header) and always returns this same body regardless of what
    // actually happened server-side; verify() hands off to the exact same
    // session machinery login() uses (auth.loginPasswordless), so a code
    // login and a password login are indistinguishable once a session
    // exists.
    { method: "POST", path: "/v1/auth/email-code/request", action: "player.login", anonymous: true,
      rateLimitKey: "email-code-request",
      handler: async ({ body, ip, emailLoginCode }) => {
        if (typeof body.email !== "string") {
          return { status: 400, body: errorBody("BAD_REQUEST", "email is required") };
        }
        await emailLoginCode.request(body.email, { locale: typeof body.locale === "string" ? body.locale : undefined }, { ip });
        return { status: 202, body: { message: "If that address is eligible, a login code was sent." } };
      } },

    { method: "POST", path: "/v1/auth/email-code/verify", action: "player.login", anonymous: true,
      rateLimitKey: "email-code-verify",
      handler: async ({ body, ip, emailLoginCode, auth }) => {
        if (typeof body.email !== "string" || typeof body.code !== "string") {
          return { status: 400, body: errorBody("BAD_REQUEST", "email and code are required") };
        }
        const verified = await emailLoginCode.verify({ email: body.email, code: body.code }, { ip });
        if (!verified.ok) {
          const status = verified.reason === "TOO_MANY_ATTEMPTS" ? 429 : 401;
          return { status, body: errorBody(verified.reason) };
        }
        const session = await auth.loginPasswordless({
          playerId: verified.playerId,
          totpCode: body.totpCode ? String(body.totpCode) : null,
          deviceFingerprint: body.deviceFingerprint ? String(body.deviceFingerprint) : null,
        }, { ip });
        if (!session.ok) {
          // The code was genuinely correct -- this is TOTP_REQUIRED/INVALID,
          // never a credential failure, so 401 here means "second factor
          // needed", not "your code was wrong".
          return { status: 401, body: errorBody(session.reason) };
        }
        return { body: {
          playerId: session.playerId, accessToken: session.accessToken,
          refreshToken: session.refreshToken, expiresInSeconds: session.expiresInSeconds,
        } };
      } },

    // Password reset via a 10-character emailed code (Slice 4). Both routes
    // are anonymous like email-code above -- the caller has, by definition,
    // no session and possibly no memory of their credential. request() is
    // enumeration-safe BY CONSTRUCTION (see password-reset.mjs's own
    // header: identical {ok:true}-shaped response whether or not the
    // account exists, whether the email is verified, and regardless of any
    // provider failure) and never requires prior email verification --
    // unlike email-code, this is a recovery mechanism, and completing it is
    // itself proof of inbox access. confirm() changes only the password
    // credential (via auth.resetPassword, the exact same hashing and
    // session-revocation as changePassword()) and never touches session
    // issuance itself -- the caller must still log in afterward through the
    // normal /v1/auth/login path, TOTP included if enrolled.
    { method: "POST", path: "/v1/auth/password-reset/request", action: "player.login", anonymous: true,
      rateLimitKey: "password-reset-request",
      handler: async ({ body, ip, passwordReset }) => {
        if (typeof body.email !== "string") {
          return { status: 400, body: errorBody("BAD_REQUEST", "email is required") };
        }
        await passwordReset.request(body.email, { locale: typeof body.locale === "string" ? body.locale : undefined }, { ip });
        return { status: 202, body: { message: "If that address is eligible, a password reset code was sent." } };
      } },

    { method: "POST", path: "/v1/auth/password-reset/confirm", action: "player.login", anonymous: true,
      rateLimitKey: "password-reset-confirm",
      handler: async ({ body, ip, passwordReset }) => {
        if (typeof body.email !== "string" || typeof body.code !== "string" || typeof body.newPassword !== "string") {
          return { status: 400, body: errorBody("BAD_REQUEST", "email, code and newPassword are required") };
        }
        const r = await passwordReset.confirm({
          email: body.email, code: body.code, newPassword: body.newPassword,
          locale: typeof body.locale === "string" ? body.locale : undefined,
        }, { ip });
        if (!r.ok) {
          const status = r.reason === "TOO_MANY_ATTEMPTS" ? 429
            : r.reason === "WEAK_PASSWORD" ? 400 : 401;
          return { status, body: errorBody(r.reason, r.detail) };
        }
        return { body: { message: "Your password has been reset. Log in with your new password." } };
      } },

    // Google OAuth/OIDC login (Slice 5). This is an IDENTITY PROVIDER
    // integration, not a second authentication system: the callback below
    // resolves to a real player id and then hands off (via a short-lived,
    // single-use code -- see oauth-handoff.mjs's own header) to
    // /finalize, which calls the exact same auth.loginPasswordless() every
    // other passwordless factor already uses. TOTP, session issuance and
    // the security audit log are all untouched by any of this.
    //
    // /start is a plain JSON endpoint returning the URL to navigate to,
    // not a redirect itself -- consistent with this API's own stated
    // design (see router.mjs's header: "this API serves JSON to programs,
    // never markup to browsers"). /callback is the ONE deliberate
    // exception: it is landed on by GOOGLE's own browser redirect, not a
    // fetch() the frontend controls, so it has no choice but to respond
    // with an HTTP redirect of its own -- to a FIXED, server-configured
    // frontend URL, never anything the request supplies (see directive
    // #17/#18: no open redirect, exact registered redirect_uri only).
    { method: "GET", path: "/v1/auth/google/start", action: "player.login", anonymous: true,
      handler: async ({ query, googleOAuth }) => {
        if (!googleOAuth) return { status: 503, body: errorBody("GOOGLE_LOGIN_UNAVAILABLE") };
        const returnTo = query.get("returnTo");
        const locale = query.get("locale");
        const r = googleOAuth.buildLoginAuthorizationUrl({
          returnTo, locale: locale && SUPPORTED_LOCALE_CODES.includes(locale) ? locale : null,
        });
        if (!r.ok) return { status: 400, body: errorBody(r.reason) };
        return { body: { url: r.url } };
      } },

    { method: "GET", path: "/v1/auth/google/callback", action: "player.login", anonymous: true,
      handler: async ({ query, ip, googleOAuth, googleFrontendOrigin }) => {
        const redirect = (outcome, extra = {}) => {
          const locale = extra.locale && SUPPORTED_LOCALE_CODES.includes(extra.locale) ? extra.locale : DEFAULT_LOCALE;
          const url = new URL(`${googleFrontendOrigin}/${locale}/auth/google/complete`);
          url.searchParams.set("outcome", outcome);
          for (const [k, v] of Object.entries(extra)) if (k !== "locale" && v != null) url.searchParams.set(k, v);
          return { status: 302, headers: { location: url.toString() }, body: {} };
        };
        if (!googleOAuth) return redirect("unavailable");

        // Google itself reports a problem (the person clicked Cancel, or a
        // provider-side outage) BEFORE any code/state exchange -- directive
        // #16's "authorization denied" and "cancelled flow" cases. No
        // signed state to recover a locale from here, so this one instance
        // falls back to the default.
        if (typeof query.get("error") === "string") return redirect("denied");

        const code = query.get("code");
        const state = query.get("state");
        if (typeof code !== "string" || typeof state !== "string") return redirect("invalid");

        const r = await googleOAuth.handleCallback({ code, state }, { ip });
        if (!r.ok) return redirect("error", { returnTo: r.returnTo, locale: r.locale });
        if (r.outcome === "session") return redirect("session", { handoff: r.handoffCode, returnTo: r.returnTo, locale: r.locale });
        if (r.outcome === "link_required") return redirect("link_required", { email: r.email, returnTo: r.returnTo, locale: r.locale });
        if (r.outcome === "linked") return redirect("linked", { returnTo: r.returnTo, locale: r.locale });
        return redirect("link_failed", { reason: r.reason, returnTo: r.returnTo, locale: r.locale });
      } },

    { method: "POST", path: "/v1/auth/google/finalize", action: "player.login", anonymous: true,
      rateLimitKey: "google-finalize",
      handler: async ({ body, ip, googleOAuth }) => {
        if (!googleOAuth) return { status: 503, body: errorBody("GOOGLE_LOGIN_UNAVAILABLE") };
        if (typeof body.handoffCode !== "string") {
          return { status: 400, body: errorBody("BAD_REQUEST", "handoffCode is required") };
        }
        const r = await googleOAuth.finalize({
          handoffCode: body.handoffCode,
          totpCode: body.totpCode ? String(body.totpCode) : null,
          deviceFingerprint: body.deviceFingerprint ? String(body.deviceFingerprint) : null,
        }, { ip });
        if (!r.ok) return { status: 401, body: errorBody(r.reason) };
        return { body: {
          playerId: r.playerId, accessToken: r.accessToken,
          refreshToken: r.refreshToken, expiresInSeconds: r.expiresInSeconds,
        } };
      } },

    // Account linking: an ALREADY authenticated, ALREADY stepped-up player
    // attaching (or detaching) Google. High-risk per directive #7 --
    // player.identity.link/unlink both carry stepUp:true in the policy,
    // exactly like player.password.change.
    { method: "POST", path: "/v1/me/identities/google/link/start", action: "player.identity.link",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, body, googleOAuth }) => {
        if (!googleOAuth) return { status: 503, body: errorBody("GOOGLE_LOGIN_UNAVAILABLE") };
        const returnTo = typeof body.returnTo === "string" ? body.returnTo : null;
        const locale = typeof body.locale === "string" && SUPPORTED_LOCALE_CODES.includes(body.locale) ? body.locale : null;
        const r = googleOAuth.buildLinkAuthorizationUrl({ playerId: actor.id, returnTo, locale });
        if (!r.ok) return { status: 400, body: errorBody(r.reason) };
        return { body: { url: r.url } };
      } },

    { method: "DELETE", path: "/v1/me/identities/google", action: "player.identity.unlink",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, ip, googleOAuth }) => {
        if (!googleOAuth) return { status: 503, body: errorBody("GOOGLE_LOGIN_UNAVAILABLE") };
        const r = await googleOAuth.unlink(actor.id, { ip });
        if (!r.ok) {
          const status = r.reason === "LAST_AUTH_METHOD" ? 409 : 404;
          return { status, body: errorBody(r.reason) };
        }
        return { body: { unlinked: true } };
      } },

    // Companion to identity unlinking: lets a Google-only account (no
    // credential row at all) gain a password so unlinking Google does not
    // permanently lock them out -- directive #8's required escape hatch.
    { method: "POST", path: "/v1/me/password", action: "player.password.set",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, body, ip, auth }) => {
        if (typeof body.newPassword !== "string") {
          return { status: 400, body: errorBody("BAD_REQUEST", "newPassword is required") };
        }
        const r = await auth.setInitialPassword({ playerId: actor.id, newPassword: body.newPassword }, { ip });
        if (!r.ok) {
          const status = r.reason === "WEAK_PASSWORD" ? 400 : 409;
          return { status, body: errorBody(r.reason, r.detail) };
        }
        return { status: 201, body: { set: true } };
      } },

    // The ordinary path for a player who ALREADY has a password -- distinct
    // from /v1/me/password above (that one only ever bootstraps a FIRST
    // password and refuses outright once one exists). Reuses
    // auth.changePassword() unchanged: same current-password check, same
    // strength policy, same session revocation. player.password.change was
    // already declared in the policy (stepUp:true) before this route
    // existed to use it.
    { method: "POST", path: "/v1/me/password/change", action: "player.password.change",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, body, ip, auth }) => {
        if (typeof body.currentPassword !== "string" || typeof body.newPassword !== "string") {
          return { status: 400, body: errorBody("BAD_REQUEST", "currentPassword and newPassword are required") };
        }
        const r = await auth.changePassword({
          playerId: actor.id, currentPassword: body.currentPassword, newPassword: body.newPassword,
        }, { ip });
        if (!r.ok) {
          const status = r.reason === "WEAK_PASSWORD" ? 400 : 401;
          return { status, body: errorBody(r.reason, r.detail) };
        }
        return { body: { changed: true, revokedSessions: r.revokedSessions } };
      } },

    { method: "POST", path: "/v1/auth/logout", action: "player.session.revoke",
      owner: ({ actor }) => actor.id,
      handler: async ({ body, auth, ip }) => {
        const r = await auth.logout(String(body.refreshToken ?? ""),
          { everywhere: body.everywhere === true }, { ip });
        return { body: { revoked: r.revoked } };
      } },

    { method: "POST", path: "/v1/auth/step-up", action: "player.login",
      handler: async ({ body, actor, auth }) => {
        const r = await auth.stepUp({
          playerId: actor.id,
          action: String(body.action ?? ""),
          password: String(body.password ?? ""),
          totpCode: body.totpCode ? String(body.totpCode) : null,
        });
        return r.ok
          ? { body: { stepUpToken: r.stepUpToken } }
          : { status: 401, body: errorBody(r.reason) };
      } },

    { method: "GET", path: "/v1/me", action: "player.profile.read",
      handler: async ({ actor, db, emailIdentity }) => {
        const r = await db.query(
          "SELECT id, handle, locale, created_at FROM player WHERE id = $1", [actor.id]
        );
        if (!r.rows.length) return { body: {} };
        const email = await emailIdentity?.getByPlayerId(actor.id);
        return { body: {
          ...r.rows[0],
          email: email?.email_display ?? null,
          emailVerified: Boolean(email?.verified_at),
        } };
      } },

    // A safe, read-only summary for the Security / Login Methods screen --
    // see auth-methods.mjs's own header for exactly why it is only ever
    // these four booleans/flags and nothing else.
    { method: "GET", path: "/v1/me/auth-methods", action: "player.auth_methods.read",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, db }) => ({ body: await getAuthMethods(db, actor.id) }) },

    // The full competitive-identity profile (Slice 7) -- see
    // packages/profile/src/service.mjs's own header for why this is
    // deliberately the EXACT same shape as the public GET /v1/players/:id
    // below: nothing sensitive is ever assembled here, so there is
    // nothing an owner needs that a stranger does not also see.
    { method: "GET", path: "/v1/me/profile", action: "player.profile.read",
      handler: async ({ actor, profile }) => {
        if (!profile) return { status: 503, body: errorBody("PROFILE_UNAVAILABLE") };
        const p = await profile.ownProfile(actor.id);
        return p ? { body: p } : { status: 404, body: errorBody("NOT_FOUND") };
      } },

    { method: "PATCH", path: "/v1/me/profile", action: "player.profile.update",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, body, ip, profile }) => {
        if (!profile) return { status: 503, body: errorBody("PROFILE_UNAVAILABLE") };
        if (body.nickname !== undefined && typeof body.nickname !== "string") {
          return { status: 400, body: errorBody("BAD_REQUEST", "nickname must be a string") };
        }
        if (body.bio !== undefined && typeof body.bio !== "string") {
          return { status: 400, body: errorBody("BAD_REQUEST", "bio must be a string") };
        }
        const r = await profile.updateProfile(actor.id, { nickname: body.nickname, bio: body.bio }, { ip });
        if (!r.ok) {
          const status = r.reason === "TAKEN" ? 409
            : r.reason === "COOLDOWN" ? 429
            : r.reason === "NOT_FOUND" ? 404
            : 400;
          return { status, body: errorBody(r.reason, r.retryAfterMs ? { retryAfterMs: r.retryAfterMs } : undefined) };
        }
        return { body: r.profile };
      } },

    // A base64-encoded image in a JSON body, not multipart -- see
    // router.mjs's own "this API serves JSON to programs" design and this
    // route's `maxBodyBytes` override (large enough for a base64-inflated
    // 2MB avatar, nothing else). validateAvatarBuffer() inspects the
    // DECODED bytes' real magic number -- the client's claimed `mimeType`
    // is accepted as a hint for nothing.
    { method: "POST", path: "/v1/me/profile/avatar", action: "player.profile.update",
      owner: ({ actor }) => actor.id,
      maxBodyBytes: 3 * 1024 * 1024,
      handler: async ({ actor, body, ip, profile }) => {
        if (!profile) return { status: 503, body: errorBody("PROFILE_UNAVAILABLE") };
        if (typeof body.imageBase64 !== "string" || !body.imageBase64) {
          return { status: 400, body: errorBody("BAD_REQUEST", "imageBase64 is required") };
        }
        let buffer;
        try {
          buffer = Buffer.from(body.imageBase64, "base64");
        } catch {
          return { status: 400, body: errorBody("INVALID_IMAGE") };
        }
        const r = await profile.setAvatar(actor.id, buffer, { ip });
        if (!r.ok) {
          const status = r.reason === "TOO_LARGE" ? 413 : 400;
          return { status, body: errorBody(r.reason) };
        }
        return { body: { avatarUrl: r.avatarUrl } };
      } },

    // Directive #3/#4's minimal report primitive -- files a report against
    // another player's avatar/bio/nickname; a review queue is a later
    // slice's job (see content_report's own migration comment). `:id` in
    // this path is actually the player's CURRENT nickname (see the
    // GET /v1/players/:id route's own comment) -- resolved to their
    // stable id before it ever reaches content_report, which references
    // player(id), not a nickname that can move.
    { method: "POST", path: "/v1/players/:id/report", action: "player.content.report",
      handler: async ({ actor, params, body, profile }) => {
        if (!profile) return { status: 503, body: errorBody("PROFILE_UNAVAILABLE") };
        if (!["AVATAR", "BIO", "NICKNAME"].includes(body.contentType)) {
          return { status: 400, body: errorBody("BAD_REQUEST", "contentType must be AVATAR, BIO or NICKNAME") };
        }
        const subjectPlayerId = await profile.resolveByNickname(params.id);
        if (!subjectPlayerId) return { status: 404, body: errorBody("NOT_FOUND") };
        const r = await profile.reportContent({
          reporterId: actor.id, subjectPlayerId, contentType: body.contentType,
          reason: typeof body.reason === "string" ? body.reason.slice(0, 500) : null,
        });
        if (!r.ok) return { status: 400, body: errorBody(r.reason) };
        return { status: 201, body: { reportId: r.reportId } };
      } },

    // The only profile field this route accepts today is the player's saved
    // language preference (see packages/i18n's resolution order: an
    // explicit in-session choice beats this, but this beats their device
    // locale on every later visit). Not a general-purpose profile-patch
    // endpoint -- selfOnly per the policy, and there is exactly one field to
    // validate.
    { method: "PATCH", path: "/v1/me", action: "player.profile.update",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, db, body }) => {
        if (typeof body.locale !== "string" || !SUPPORTED_LOCALE_CODES.includes(body.locale)) {
          return { status: 400, body: errorBody("UNSUPPORTED_LOCALE") };
        }
        const r = await db.query(
          "UPDATE player SET locale = $2 WHERE id = $1 RETURNING id, handle, locale, created_at",
          [actor.id, body.locale]
        );
        return { body: r.rows[0] };
      } },

    // Sets the calling player's email. Deliberately its own route rather
    // than folded into PATCH /v1/me: email identity has its own service,
    // its own uniqueness rules, and its own security event, and this keeps
    // that boundary visible at the API surface too (see
    // packages/auth/src/email-identity.mjs). Sending a verification email
    // is the next authentication slice -- this route only records the
    // address and leaves it unverified.
    { method: "PATCH", path: "/v1/me/email", action: "player.email.set",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, body, ip, db, emailIdentity, emailVerification, welcomeEmail }) => {
        if (typeof body.email !== "string") {
          return { status: 400, body: errorBody("BAD_REQUEST", "email is required") };
        }
        const r = await emailIdentity.setEmail(actor.id, body.email, { ip });
        if (!r.ok) {
          const status = r.reason === EmailIdentityError.EMAIL_TAKEN ? 409 : 400;
          return { status, body: errorBody(r.reason) };
        }

        // Best-effort, never blocking the response on a provider round
        // trip and never turning a slow/failed email into a failed
        // "set your email" request: welcome-email is idempotent
        // (sendOnce, see welcome-email.mjs) and a verification request
        // failure here just means the player uses "resend" from the UI.
        const player = (await db.query("SELECT handle, locale FROM player WHERE id = $1", [actor.id])).rows[0];
        if (welcomeEmail) {
          await welcomeEmail.sendOnce(
            { playerId: actor.id, nickname: player?.handle ?? actor.id, email: r.identity.email_display, locale: player?.locale },
            { ip }
          ).catch(() => {});
        }
        if (emailVerification) {
          await emailVerification.request(actor.id, { locale: player?.locale }, { ip }).catch(() => {});
        }

        return { body: { email: r.identity.email_display, verified: false } };
      } },

    { method: "POST", path: "/v1/me/email/verification", action: "player.email.set",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, db, ip, emailVerification }) => {
        const player = (await db.query("SELECT locale FROM player WHERE id = $1", [actor.id])).rows[0];
        const r = await emailVerification.request(actor.id, { locale: player?.locale }, { ip });
        if (!r.ok) {
          const status = r.reason === EmailVerificationError.COOLDOWN ? 429
            : r.reason === EmailVerificationError.NO_EMAIL_ON_FILE ? 400 : 409;
          return { status, body: errorBody(r.reason, r.retryAfterMs ? { retryAfterMs: r.retryAfterMs } : undefined) };
        }
        return { status: 202, body: { expiresAt: r.expiresAt } };
      } },

    { method: "POST", path: "/v1/me/email/verification/confirm", action: "player.email.set",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, body, ip, emailVerification }) => {
        if (typeof body.code !== "string") {
          return { status: 400, body: errorBody("BAD_REQUEST", "code is required") };
        }
        const r = await emailVerification.confirm(actor.id, body.code, { ip });
        if (!r.ok) {
          return { status: 400, body: errorBody(r.reason) };
        }
        return { body: { verified: true } };
      } },

    { method: "GET", path: "/v1/me/sessions", action: "player.session.list",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, auth }) => ({ body: { sessions: await auth.listSessions(actor.id) } }) },

    // A player's public competitive profile (Slice 7) -- nickname, bio,
    // avatar, EXP/level, Global Skill, ratings, stats, achievements,
    // badges. Never email/wallet/KYC/moderation/session data; see
    // profile.mjs's own header. `:id` is the player's CURRENT nickname
    // (== `player.handle`), not the immutable internal id -- a shared
    // profile link has to keep resolving through whatever a player has
    // renamed themselves to, exactly like the URL a player.mjs consumer
    // would expect from "GET /v1/players/:nickname". It is only ever
    // called `:id` in this route table because it reuses the path
    // `/v1/players/:id/wallet` etc. already use for a DIFFERENT (and
    // genuinely id-keyed) purpose just below. Reuses global_skill.read's
    // policy (freely readable, no ownership check) rather than adding a
    // new action for something with an identical trust boundary --
    // everything here was already public one way or another (handle on
    // every duel record, ratings on the leaderboard, Global Skill on its
    // own already-public route).
    { method: "GET", path: "/v1/players/:id", action: "global_skill.read",
      handler: async ({ params, db, profile }) => {
        if (!profile) {
          const r = await db.query("SELECT id, handle FROM player WHERE id = $1", [params.id]);
          return r.rows.length ? { body: r.rows[0] } : { status: 404, body: errorBody("NOT_FOUND") };
        }
        const p = await profile.publicProfileByNickname(params.id);
        return p ? { body: p } : { status: 404, body: errorBody("NOT_FOUND") };
      } },

    // The small, fast shape for a chat message, leaderboard row or
    // spectator overlay -- never the full profile just to render an
    // avatar and a level badge.
    { method: "GET", path: "/v1/players/:id/preview", action: "global_skill.read",
      handler: async ({ params, profile }) => {
        if (!profile) return { status: 503, body: errorBody("PROFILE_UNAVAILABLE") };
        const p = await profile.previewByNickname(params.id);
        return p ? { body: p } : { status: 404, body: errorBody("NOT_FOUND") };
      } },

    // The BY-ID sibling of the route above. A duel's `players` (seat_0/
    // seat_1, from STATE/EVENT over the websocket) are always the
    // player's stable ID, never their handle -- and a handle can change
    // after registration (see profile/service.mjs's own comment), so
    // resolving a live game's opponent identity through the nickname
    // route would silently break for anyone who has ever renamed. Reuses
    // previewFor(), already exported by the profile service and already
    // exercised by the nickname route's own previewByNickname() -- no new
    // service code, only a second, ID-shaped door to the same function.
    { method: "GET", path: "/v1/players/by-id/:id/preview", action: "global_skill.read",
      handler: async ({ params, profile }) => {
        if (!profile) return { status: 503, body: errorBody("PROFILE_UNAVAILABLE") };
        const p = await profile.previewFor(params.id);
        return p ? { body: p } : { status: 404, body: errorBody("NOT_FOUND") };
      } },

    // --- Wallet --------------------------------------------------------------
    { method: "GET", path: "/v1/players/:id/wallet", action: "wallet.read",
      owner: ({ params }) => params.id,
      handler: async ({ params, db }) => {
        const r = await db.query(
          `SELECT a.key,
                  ledger_natural_balance(a.normal_side, COALESCE(b.balance,0))::text AS balance,
                  a.asset
             FROM ledger_account a
             LEFT JOIN ledger_balance b ON b.account_id = a.id
            WHERE a.owner_type = 'USER' AND a.owner_id = $1
            ORDER BY a.key`,
          [params.id]
        );
        return { body: { accounts: r.rows } };
      } },

    { method: "POST", path: "/v1/players/:id/withdrawals", action: "wallet.withdraw",
      owner: ({ params }) => params.id,
      handler: async () => ({
        // The withdrawal state machine is not built yet. The route exists so
        // that its policy, step-up and control gating are proven now, rather
        // than bolted on beside a working payout path later.
        status: 501, body: errorBody("NOT_IMPLEMENTED", "withdrawals are not yet available"),
      }) },

    // --- Play ----------------------------------------------------------------
    // Generic across every game: the pool is chosen by whatever gameId the
    // client asks for, defaulting to chess only for convenience. Nothing
    // game-specific lives in this handler -- the same route seats a Speed
    // Math ticket exactly as it does a chess one.
    { method: "POST", path: "/v1/matchmaking/tickets", action: "duel.play.free",
      handler: async ({ actor, body, db }) => {
        const gameId = String(body.gameId ?? "chess");
        const mode = String(body.mode ?? "standard");
        const timeControl = body.timeControl ?? { initialMs: 300000, incrementMs: 0 };
        const rating = await db.query(
          "SELECT rating_x100 FROM rating WHERE player_id=$1 AND game_id=$2", [actor.id, gameId]
        );
        const mm = createMatchmakingService(db);
        const r = await mm.enqueue({
          playerId: actor.id, gameId, mode, timeControl,
          ratingX100: rating.rows[0]?.rating_x100 ?? 150000,
        });
        if (!r.ok) {
          const status = r.reason === MatchmakingError.ALREADY_QUEUED ? 409 : 400;
          return { status, body: errorBody(r.reason) };
        }
        return { status: 201, body: { ticketId: r.ticketId, expiresAt: r.expiresAt } };
      } },

    // VS_COMPUTER -- deliberately its own route, not a `mode` flag on the
    // ticket route above: there is no queue, no pairing, and no opponent
    // to wait for, so nothing about "enqueue and poll for a match" applies.
    // Reuses `duel.play.free`'s own permission -- a bot is never a cash
    // opponent, so `duel.play.cash` is never relevant here.
    { method: "POST", path: "/v1/matchmaking/vs-computer", action: "duel.play.free",
      handler: async ({ actor, body, db }) => {
        const gameId = String(body.gameId ?? "chess");
        const difficulty = String(body.difficulty ?? "MEDIUM").toUpperCase();
        const vsComputer = createVsComputerService(db);
        const r = await vsComputer.createDuel({ gameId, playerId: actor.id, difficulty });
        if (!r.ok) return { status: 400, body: errorBody(r.reason) };
        return { status: 201, body: { duelId: r.duelId } };
      } },

    // PLAY WITH FRIEND -- a challenge to a specific, named opponent (see
    // challenge.mjs's own header for why this is a separate primitive from
    // both matchmaking's pool and vs-computer's no-opponent case). Always
    // FREE, exactly like vs-computer -- reuses the same permission.
    { method: "POST", path: "/v1/challenges", action: "duel.play.free",
      handler: async ({ actor, body, db }) => {
        const gameId = String(body.gameId ?? "chess");
        const opponentNickname = String(body.opponentNickname ?? "");
        const challenge = createChallengeService(db);
        const r = await challenge.create({ gameId, challengerId: actor.id, opponentNickname });
        if (!r.ok) {
          const status = r.reason === ChallengeError.ALREADY_PENDING ? 409 : 400;
          return { status, body: errorBody(r.reason) };
        }
        return { status: 201, body: { challengeId: r.challengeId, expiresAt: r.expiresAt } };
      } },

    { method: "GET", path: "/v1/challenges", action: "duel.play.free",
      handler: async ({ actor, db }) => {
        const challenge = createChallengeService(db);
        const [incoming, outgoing] = await Promise.all([
          challenge.listIncoming(actor.id), challenge.listOutgoing(actor.id),
        ]);
        return { body: { incoming, outgoing } };
      } },

    { method: "POST", path: "/v1/challenges/:id/accept", action: "duel.play.free",
      handler: async ({ actor, params, db }) => {
        const challenge = createChallengeService(db);
        const r = await challenge.accept(params.id, actor.id);
        if (!r.ok) {
          const status = r.reason === ChallengeError.NOT_FOUND ? 404
            : r.reason === ChallengeError.NOT_YOUR_CHALLENGE ? 403 : 400;
          return { status, body: errorBody(r.reason) };
        }
        return { body: { duelId: r.duelId } };
      } },

    { method: "POST", path: "/v1/challenges/:id/decline", action: "duel.play.free",
      handler: async ({ actor, params, db }) => {
        const challenge = createChallengeService(db);
        const r = await challenge.decline(params.id, actor.id);
        if (!r.ok) {
          const status = r.reason === ChallengeError.NOT_FOUND ? 404
            : r.reason === ChallengeError.NOT_YOUR_CHALLENGE ? 403 : 400;
          return { status, body: errorBody(r.reason) };
        }
        return { body: { ok: true } };
      } },

    { method: "POST", path: "/v1/challenges/:id/cancel", action: "duel.play.free",
      handler: async ({ actor, params, db }) => {
        const challenge = createChallengeService(db);
        const r = await challenge.cancel(params.id, actor.id);
        if (!r.ok) {
          const status = r.reason === ChallengeError.NOT_FOUND ? 404
            : r.reason === ChallengeError.NOT_YOUR_CHALLENGE ? 403 : 400;
          return { status, body: errorBody(r.reason) };
        }
        return { body: { ok: true } };
      } },

    // Polled by the client while waiting in queue -- this is how a web/
    // mobile client learns it has been matched (duelId becomes non-null)
    // without needing a push channel. The dispatch worker (a separate
    // process) is what actually performs the match; this route only ever
    // reads the ticket row it wrote.
    { method: "GET", path: "/v1/matchmaking/status", action: "duel.play.free",
      handler: async ({ actor, db }) => {
        const mm = createMatchmakingService(db);
        const ticket = await mm.status(actor.id);
        return { body: { ticket } };
      } },

    { method: "POST", path: "/v1/matchmaking/cancel", action: "duel.play.free",
      handler: async ({ actor, db }) => {
        const mm = createMatchmakingService(db);
        const r = await mm.cancel(actor.id);
        return { body: r };
      } },

    // Spectator discovery ("Watch Live", directive #11/#12): real live
    // duels only -- never a fabricated count or a placeholder row. No
    // internal id beyond the duelId itself (already the public handle
    // every other duel route uses); no server-only state (fairplay_meta,
    // seed, lease ownership). PLAYERS_ONLY-policy duels are excluded
    // entirely -- discovery must not even ADVERTISE a match nobody may
    // actually open. Registered BEFORE /v1/duels/:id below: the router
    // matches routes in registration order and both paths have the same
    // segment count, so "live" would otherwise be swallowed as a :id.
    { method: "GET", path: "/v1/duels/live", action: "duel.spectate",
      handler: async ({ db, query }) => {
        const limit = Math.min(Math.max(1, Number(query.get("limit")) || 20), 50);
        const r = await db.query(
          `SELECT d.id, d.game_id, d.started_at,
                  pa.handle AS handle_0, pa.selected_badge_code AS badge_0,
                  pb.handle AS handle_1, pb.selected_badge_code AS badge_1,
                  ra.rating_x100 AS rating_0, rb.rating_x100 AS rating_1
             FROM duel d
             JOIN player pa ON pa.id = d.seat_0
             JOIN player pb ON pb.id = d.seat_1
             LEFT JOIN rating ra ON ra.player_id = d.seat_0 AND ra.game_id = d.game_id
             LEFT JOIN rating rb ON rb.player_id = d.seat_1 AND rb.game_id = d.game_id
            WHERE d.status = 'LIVE' AND d.spectator_policy = 'OPEN'
            ORDER BY d.started_at DESC
            LIMIT $1`,
          [limit]
        );
        return {
          body: {
            matches: r.rows.map((row) => ({
              duelId: row.id,
              gameId: row.game_id,
              startedAt: row.started_at,
              players: [
                { handle: row.handle_0, badge: row.badge_0, ratingX100: row.rating_0 ?? null },
                { handle: row.handle_1, badge: row.badge_1, ratingX100: row.rating_1 ?? null },
              ],
            })),
          },
        };
      } },

    { method: "GET", path: "/v1/duels/:id", action: "duel.spectate",
      handler: async ({ params, db }) => {
        const r = await db.query(
          `SELECT id, game_id, seat_0, seat_1, tier, status, result,
                  termination_reason, game_hash, created_at
             FROM duel WHERE id = $1`, [params.id]
        );
        return r.rows.length
          ? { body: r.rows[0] }
          : { status: 404, body: errorBody("NOT_FOUND") };
      } },

    { method: "GET", path: "/v1/me/duels", action: "duel.history.read",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, db, query }) => {
        const limit = Math.min(Number(query.get("limit") ?? 50) || 50, 200);
        const r = await db.query(
          `SELECT id, game_id, seat_0, seat_1, tier, status, result,
                  termination_reason, created_at, completed_at
             FROM duel WHERE seat_0 = $1 OR seat_1 = $1
            ORDER BY created_at DESC LIMIT $2`,
          [actor.id, limit]
        );
        return { body: { duels: r.rows } };
      } },

    // --- Customer support tickets (Slice 8) -------------------------------------
    // Entry points live all over the product (nav, wallet, deposit/withdrawal,
    // match/tournament pages) but every one of them ends up calling these same
    // four routes -- category-specific UI never talks to a category-specific
    // endpoint. Ownership of a SPECIFIC ticket (read/message) is enforced
    // inside ticket.mjs itself (`AND player_id = $2` on every query), not via
    // `resource.ownerId`, since the URL names a ticket id, not a player id --
    // see policy.mjs's own comment on player.ticket.read/message.

    { method: "POST", path: "/v1/me/tickets", action: "player.ticket.create",
      handler: async ({ actor, body, support, ticketNotifications, db, ip }) => {
        const r = await support.createTicket({
          playerId: actor.id,
          category: body.category,
          subject: body.subject,
          description: body.description,
          referenceId: body.referenceId,
        }, { ip });
        if (!r.ok) return { status: ticketErrorStatus(r.reason), body: errorBody(r.reason, r.existingTicketId ? { existingTicketId: r.existingTicketId } : undefined) };

        // Best-effort, never blocking the response on a provider round trip
        // and never turning a slow/failed courtesy email into a failed
        // ticket creation -- same reasoning as the welcome-email call in
        // PATCH /v1/me/email above. notify() is itself idempotent, so a
        // client retry of this very request cannot double-send either.
        if (ticketNotifications) {
          const contact = await emailContactFor(db, actor.id);
          await ticketNotifications.notify({
            ticketId: r.ticketId, notification: "TICKET_CREATED",
            email: contact.email, locale: contact.locale, subject: body.subject,
          }).catch(() => {});
        }

        return { status: 201, body: { ticketId: r.ticketId, priority: r.priority } };
      } },

    { method: "GET", path: "/v1/me/tickets", action: "player.ticket.list",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, query, support }) => {
        const limit = Math.min(Number(query.get("limit") ?? 20) || 20, 100);
        const offset = Math.max(Number(query.get("offset") ?? 0) || 0, 0);
        const tickets = await support.listForCustomer(actor.id, { limit, offset });
        return { body: { tickets } };
      } },

    { method: "GET", path: "/v1/me/tickets/:id", action: "player.ticket.read",
      handler: async ({ params, actor, support }) => {
        const ticket = await support.getForCustomer(params.id, actor.id);
        if (!ticket) return { status: 404, body: errorBody("NOT_FOUND") };
        const messages = await support.listMessagesForCustomer(params.id, actor.id);
        return { body: { ticket, messages } };
      } },

    { method: "POST", path: "/v1/me/tickets/:id/messages", action: "player.ticket.message",
      handler: async ({ params, actor, body, support, ip }) => {
        const r = await support.sendCustomerMessage({ ticketId: params.id, playerId: actor.id, content: body.content }, { ip });
        if (!r.ok) return { status: ticketErrorStatus(r.reason), body: errorBody(r.reason) };
        return { status: 201, body: { messageId: r.messageId, reopened: r.reopened } };
      } },

    // --- Chat (Slice 9) ----------------------------------------------------------
    // Sending happens over the realtime gateway (see packages/realtime/src/
    // gateway.mjs's CHAT_SEND handling), never here -- these routes cover
    // exactly what directive #11/#16/#17 ask for outside the socket:
    // paginated history, blocking, and reporting.

    { method: "GET", path: "/v1/chat/global/messages", action: "player.chat.global.read",
      handler: async ({ actor, query, chat }) => {
        const before = query.get("before");
        const after = query.get("after");
        const rows = await chat.messages.listHistory({
          channelId: globalChannelId(), viewerId: actor.id,
          before: before ?? undefined, after: after ?? undefined,
          limit: query.get("limit") || undefined,
        });
        return { body: { messages: rows } };
      } },

    { method: "GET", path: "/v1/duels/:id/chat/messages", action: "player.chat.match.read",
      handler: async ({ params, actor, query, chat }) => {
        const channel = await chat.channels.getOrCreateMatchChannel(params.id);
        const access = await chat.channels.canAccessChannel(channel, actor.id);
        if (!access.ok) return { status: chatErrorStatus(access.reason), body: errorBody(access.reason) };
        const rows = await chat.messages.listHistory({
          channelId: channel.id, viewerId: actor.id,
          before: query.get("before") ?? undefined, after: query.get("after") ?? undefined,
          limit: query.get("limit") || undefined,
        });
        return { body: { channelId: channel.id, messages: rows } };
      } },

    // Spectator chat (Slice 10): the SAME shape as match chat's own route
    // above -- getOrCreate, canAccessChannel (re-derives spectator_policy
    // from the real duel row, never trusts the client), listHistory. A
    // non-eligible spectator (PLAYERS_ONLY) gets exactly the same 403
    // treatment a non-participant gets on the match route.
    { method: "GET", path: "/v1/duels/:id/spectator-chat/messages", action: "player.chat.spectator.read",
      handler: async ({ params, actor, query, chat }) => {
        const channel = await chat.channels.getOrCreateSpectatorChannel(params.id);
        const access = await chat.channels.canAccessChannel(channel, actor.id);
        if (!access.ok) return { status: chatErrorStatus(access.reason), body: errorBody(access.reason) };
        const rows = await chat.messages.listHistory({
          channelId: channel.id, viewerId: actor.id,
          before: query.get("before") ?? undefined, after: query.get("after") ?? undefined,
          limit: query.get("limit") || undefined,
        });
        return { body: { channelId: channel.id, messages: rows } };
      } },

    { method: "POST", path: "/v1/chat/blocks", action: "player.chat.block",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, body, chat }) => {
        if (typeof body.blockedId !== "string" || !body.blockedId) {
          return { status: 400, body: errorBody("BAD_REQUEST", "blockedId is required") };
        }
        const r = await chat.blocks.blockPlayer(actor.id, body.blockedId);
        if (!r.ok) return { status: 400, body: errorBody(r.reason) };
        return { status: 201, body: r };
      } },

    { method: "GET", path: "/v1/chat/blocks", action: "player.chat.block",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, chat }) => ({ body: { blocked: await chat.blocks.listBlockedBy(actor.id) } }) },

    { method: "DELETE", path: "/v1/chat/blocks/:id", action: "player.chat.block",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, params, chat }) => {
        await chat.blocks.unblockPlayer(actor.id, params.id);
        return { body: { ok: true } };
      } },

    { method: "POST", path: "/v1/chat/reports", action: "player.chat.report",
      handler: async ({ actor, body, chat }) => {
        const r = typeof body.messageId !== "undefined"
          ? await chat.reports.reportMessage({ reporterId: actor.id, messageId: body.messageId, category: body.category, reason: body.reason })
          : await chat.reports.reportPlayer({ reporterId: actor.id, subjectPlayerId: body.subjectPlayerId, category: body.category, reason: body.reason });
        if (!r.ok) return { status: chatErrorStatus(r.reason), body: errorBody(r.reason) };
        return { status: 201, body: r };
      } },

    { method: "GET", path: "/v1/leaderboard", action: "player.profile.read",
      handler: async ({ db, query }) => {
        // Per-game leaderboard, generic across any registered game -- not
        // just chess. The cross-game combination lives at /v1/leaderboard/global.
        const limit = Math.min(Number(query.get("limit") ?? 50) || 50, 200);
        const gameId = query.get("game") ?? "chess";
        const r = await db.query(
          `SELECT r.player_id, p.handle, r.rating_x100, r.rd_x100, r.games_played
             FROM rating r JOIN player p ON p.id = r.player_id
            WHERE r.game_id = $2 AND r.games_played >= 10
            ORDER BY r.rating_x100 DESC LIMIT $1`, [limit, gameId]
        );
        return { body: { gameId, entries: r.rows } };
      } },

    // --- Global Skill Score ----------------------------------------------------
    // Percentiles, tiers and the weighting breakdown are all read-only
    // projections of ratings the player already earned by playing. Nothing
    // here is client-supplied, and nothing here touches anti-cheat or risk
    // data -- the breakdown is deliberately safe to show any authenticated
    // viewer, including about another player.

    { method: "GET", path: "/v1/me/global-skill", action: "global_skill.read",
      handler: async ({ actor, globalSkill }) => ({ body: await globalSkill.scoreFor(actor.id) }) },

    { method: "GET", path: "/v1/players/:id/global-skill", action: "global_skill.read",
      handler: async ({ params, globalSkill }) => ({ body: await globalSkill.scoreFor(params.id) }) },

    { method: "GET", path: "/v1/leaderboard/global", action: "global_skill.read",
      handler: async ({ globalSkill, query }) => {
        const board = await globalSkill.leaderboard();
        const limit = Math.min(Number(query.get("limit") ?? 100) || 100, 500);
        return { body: { entries: board.slice(0, limit) } };
      } },

    // --- Tournaments -------------------------------------------------------------
    // Every read here reflects rows the SERVER wrote (pairings, standings,
    // settlements). There is no field anywhere a client supplies a result, a
    // standing, or a prize amount -- those all come from the tournament
    // engine via reportResult/advance/settlePrizes, never from a request body.

    { method: "GET", path: "/v1/tournaments", action: "tournament.read",
      handler: async ({ db, query }) => {
        const status = query.get("status");
        const r = await db.query(
          `SELECT id, game_id, format, status, tier, entry_fee_minor::text AS entry_fee_minor,
                  asset, capacity, registration_closes_at, starts_at, completed_at
             FROM tournament
            WHERE ($1::tournament_status IS NULL OR status = $1)
            ORDER BY created_at DESC LIMIT 100`,
          [status]
        );
        return { body: { tournaments: r.rows } };
      } },

    { method: "GET", path: "/v1/tournaments/:id", action: "tournament.read",
      handler: async ({ params, db }) => {
        const r = await db.query(
          `SELECT id, game_id, format, status, tier, entry_fee_minor::text AS entry_fee_minor,
                  asset, capacity, min_players, time_control, swiss_rounds,
                  registration_closes_at, starts_at, completed_at, prize_structure
             FROM tournament WHERE id = $1`,
          [params.id]
        );
        if (!r.rows.length) return { status: 404, body: errorBody("NOT_FOUND") };
        const count = await db.query(
          `SELECT count(*)::int c FROM tournament_registration WHERE tournament_id=$1 AND status='REGISTERED'`,
          [params.id]
        );
        return { body: { ...r.rows[0], registeredCount: count.rows[0].c } };
      } },

    { method: "GET", path: "/v1/tournaments/:id/standings", action: "tournament.read",
      handler: async ({ params, tournament }) => ({ body: { standings: await tournament.standings(params.id) } }) },

    { method: "GET", path: "/v1/tournaments/:id/pairings", action: "tournament.read",
      handler: async ({ params, db, query }) => {
        // One endpoint covers rounds, bracket and results: a bracket IS the
        // round-1..N pairings for a single-elimination tournament, and Swiss
        // "results" are just every pairing across every round.
        const round = query.get("round");
        const r = await db.query(
          `SELECT round_number, slot, seat_0, seat_1, status, result, duel_id
             FROM tournament_pairing
            WHERE tournament_id=$1 AND ($2::int IS NULL OR round_number = $2)
            ORDER BY round_number, slot`,
          [params.id, round ? Number(round) : null]
        );
        return { body: { pairings: r.rows } };
      } },

    { method: "GET", path: "/v1/tournaments/:id/prizes", action: "tournament.read",
      handler: async ({ params, db }) => {
        const r = await db.query(
          `SELECT player_id, rank, prize_minor::text AS prize_minor, settled_at
             FROM tournament_settlement WHERE tournament_id=$1 ORDER BY rank`,
          [params.id]
        );
        return { body: { prizes: r.rows } };
      } },

    { method: "POST", path: "/v1/tournaments/:id/register", action: "tournament.join",
      handler: async ({ params, actor, db, tournament }) => {
        // The seed rating is read from the player's OWN established rating
        // row, server-side. It is never accepted from the request body: a
        // client-supplied seed is a client determining its own bracket
        // position, which is exactly the kind of thing this system exists
        // to prevent.
        const t = await db.query("SELECT game_id FROM tournament WHERE id=$1", [params.id]);
        if (!t.rows.length) return { status: 404, body: errorBody("NOT_FOUND") };
        const rating = await db.query(
          "SELECT rating_x100 FROM rating WHERE player_id=$1 AND game_id=$2",
          [actor.id, t.rows[0].game_id]
        );
        const r = await tournament.register({
          tournamentId: params.id, playerId: actor.id,
          ratingX100: rating.rows[0]?.rating_x100 ?? 150000,
        });
        return r.ok ? { status: 201, body: r } : { status: 400, body: errorBody(r.reason) };
      } },

    { method: "POST", path: "/v1/tournaments/:id/withdraw", action: "tournament.withdraw",
      handler: async ({ params, actor, tournament }) => {
        const r = await tournament.withdraw({ tournamentId: params.id, playerId: actor.id });
        return r.ok ? { body: r } : { status: 400, body: errorBody(r.reason) };
      } },

    // --- Admin: tournaments ------------------------------------------------------
    // Orchestration only. Pairings, standings and settlement amounts are all
    // computed by the tournament engine itself -- these handlers never
    // construct a result or a payout from request data.

    { method: "POST", path: "/v1/admin/tournaments", action: "admin.tournament.manage",
      subjectType: "tournament",
      handler: async ({ body, actor, tournament }) => {
        const r = await tournament.create({ ...body, createdBy: actor.id });
        return { status: 201, body: r };
      } },

    { method: "POST", path: "/v1/admin/tournaments/:id/open", action: "admin.tournament.manage",
      subjectType: "tournament",
      handler: async ({ params, tournament }) => {
        const r = await tournament.openRegistration(params.id);
        return r.ok ? { body: r } : { status: 400, body: errorBody(r.reason) };
      } },

    { method: "POST", path: "/v1/admin/tournaments/:id/start", action: "admin.tournament.manage",
      subjectType: "tournament",
      handler: async ({ params, tournament }) => {
        const r = await tournament.start(params.id);
        return r.ok ? { body: r } : { status: 400, body: errorBody(r.reason) };
      } },

    { method: "POST", path: "/v1/admin/tournaments/:id/advance", action: "admin.tournament.manage",
      subjectType: "tournament",
      handler: async ({ params, tournament }) => {
        const r = await tournament.advance(params.id);
        return r.ok ? { body: r } : { status: 400, body: errorBody(r.reason) };
      } },

    // Step 1 of settlement: request it. This is stepUp-only (no fourEyes) --
    // requesting a review is not itself a money-moving action.
    { method: "POST", path: "/v1/admin/tournaments/:id/settle/request", action: "admin.tournament.manage",
      subjectType: "tournament",
      handler: async ({ params, actor, body, db }) => {
        const id = `apr_${params.id}_${Date.now()}`;
        await db.query(
          `INSERT INTO approval_request (id, action, subject_type, subject_id, requested_by, reason)
           VALUES ($1,'admin.tournament.settle','tournament',$2,$3,$4)`,
          [id, params.id, actor.id, body.reason ?? "tournament settlement"]
        );
        return { status: 201, body: { approvalRequestId: id } };
      } },

    // Step 2: a DIFFERENT admin decides. The database's own
    // approval_no_self_approval constraint is the real enforcement here --
    // this handler does not need to (and must not) re-implement that check.
    { method: "POST", path: "/v1/admin/approvals/:id/decide", action: "admin.tournament.manage",
      subjectType: "approval_request",
      handler: async ({ params, actor, body, db }) => {
        try {
          const r = await db.query(
            `UPDATE approval_request
                SET status = $2::approval_status, decided_by = $3, decided_at = now(), decision_note = $4
              WHERE id = $1 AND status = 'PENDING'
              RETURNING id, status`,
            [params.id, body.approve ? "APPROVED" : "REJECTED", actor.id, body.note ?? null]
          );
          if (!r.rows.length) return { status: 409, body: errorBody("NOT_PENDING") };
          return { body: r.rows[0] };
        } catch (e) {
          if (/approval_no_self_approval|violates check constraint/.test(e.message)) {
            return { status: 403, body: errorBody("SELF_APPROVAL_FORBIDDEN") };
          }
          throw e;
        }
      } },

    // Step 3: settle, with the approval id from step 1/2. authorize() itself
    // fetched and validated the approval before this handler ever runs; by
    // the time execution reaches here, a second admin's real decision has
    // already been confirmed.
    { method: "POST", path: "/v1/admin/tournaments/:id/settle", action: "admin.tournament.settle",
      subjectType: "tournament",
      handler: async ({ params, tournament }) => {
        const r = await tournament.settlePrizes(params.id);
        return r.ok ? { body: r } : { status: 400, body: errorBody(r.reason) };
      } },

    // --- Admin ---------------------------------------------------------------
    { method: "GET", path: "/v1/admin/players/:id", action: "admin.user.read",
      subjectType: "player",
      handler: async ({ params, db }) => {
        const r = await db.query(
          "SELECT id, handle, created_at FROM player WHERE id = $1", [params.id]
        );
        return r.rows.length ? { body: r.rows[0] } : { status: 404, body: errorBody("NOT_FOUND") };
      } },

    // Read-only progression visibility (Slice 11, directive #20): EXP
    // total + the raw event log (type/source/amount/timestamp -- the
    // player-facing profile route only ever returns the TOTAL, never this
    // level of detail), achievements, badges. Deliberately no write path
    // here or anywhere else reachable from a client: EXP/achievements/
    // badges are granted ONLY by packages/progression's own sweep,
    // triggered ONLY by a real SETTLED duel or a settled tournament --
    // "the client must never be the authority for progression" (directive
    // #19). A future manual-correction workflow is its own, separate,
    // audited decision, not a side effect of this admin view existing.
    { method: "GET", path: "/v1/admin/players/:id/progression", action: "admin.user.read",
      subjectType: "player",
      handler: async ({ params, progression }) => {
        if (!progression) return { status: 503, body: errorBody("PROGRESSION_UNAVAILABLE") };
        const [total, history, achievementRows, badgeRows] = await Promise.all([
          progression.exp.totalFor(params.id),
          progression.exp.historyFor(params.id, { limit: 100 }),
          progression.achievements.listFor(params.id),
          progression.badges.listFor(params.id),
        ]);
        return {
          body: {
            exp: { total, history },
            achievements: achievementRows,
            badges: badgeRows,
          },
        };
      } },

    { method: "GET", path: "/v1/admin/ledger/:id", action: "admin.ledger.read",
      subjectType: "player",
      handler: async ({ params, db }) => {
        const r = await db.query(
          `SELECT a.key, ledger_natural_balance(a.normal_side, COALESCE(b.balance,0))::text AS balance
             FROM ledger_account a LEFT JOIN ledger_balance b ON b.account_id = a.id
            WHERE a.owner_id = $1 ORDER BY a.key`, [params.id]
        );
        return { body: { accounts: r.rows } };
      } },

    { method: "GET", path: "/v1/admin/audit", action: "admin.audit.read",
      handler: async ({ db, query }) => {
        const limit = Math.min(Number(query.get("limit") ?? 100) || 100, 500);
        const r = await db.query(
          "SELECT admin_id, action, decision, at FROM admin_audit ORDER BY id DESC LIMIT $1",
          [limit]
        );
        return { body: { events: r.rows } };
      } },

    { method: "POST", path: "/v1/admin/controls/:key", action: "admin.control.toggle",
      subjectType: "control",
      handler: async ({ params, body, actor, db }) => {
        if (typeof body.enabled !== "boolean" || typeof body.reason !== "string") {
          return { status: 400, body: errorBody("BAD_REQUEST") };
        }
        if (params.key === "GLOBAL_EMERGENCY") {
          // The global switch has its own action and its own capability, held
          // by SUPER_ADMIN alone. It is not reachable through this route.
          return { status: 403, body: errorBody("WRONG_ACTION_FOR_CONTROL") };
        }
        try {
          const r = await db.query(
            `UPDATE platform_control SET enabled=$2, changed_by=$3, reason=$4, changed_at=now()
              WHERE key=$1 RETURNING key, enabled`,
            [params.key, body.enabled, actor.id, body.reason]
          );
          return r.rows.length
            ? { body: r.rows[0] }
            : { status: 404, body: errorBody("NOT_FOUND") };
        } catch (e) {
          if (/requires a new reason|requires a named actor/.test(e.message)) {
            return { status: 400, body: errorBody("REASON_REQUIRED") };
          }
          throw e;
        }
      } },

    // --- Admin: reconciliation ---------------------------------------------------
    // Read access and decision access are two different actions (see
    // authz/policy.mjs): everyone who can see the audit trail can see these
    // cases, but only FINANCE_ADMIN/SUPER_ADMIN can acknowledge or close one.
    // No handler here ever writes to the ledger, a deposit, or a withdrawal
    // directly -- resolving a case only ever changes the CASE's own status
    // and appends an event. The one financial action reconciliation can take
    // (the solvency-breach withdrawal halt) is system-triggered inside the
    // service itself, never reachable through any of these routes.

    { method: "GET", path: "/v1/admin/reconciliation/cases", action: "admin.reconciliation.read",
      handler: async ({ reconciliation, query }) => {
        const r = await reconciliation.listCases({
          status: query.get("status") || undefined,
          category: query.get("category") || undefined,
          severity: query.get("severity") || undefined,
          subjectType: query.get("subjectType") || undefined,
          limit: query.get("limit") || undefined,
          offset: query.get("offset") || undefined,
        });
        return { body: r };
      } },

    { method: "GET", path: "/v1/admin/reconciliation/cases/:id", action: "admin.reconciliation.read",
      subjectType: "reconciliation_case",
      handler: async ({ params, reconciliation }) => {
        const c = await reconciliation.getCase(params.id);
        return c ? { body: c } : { status: 404, body: errorBody("NOT_FOUND") };
      } },

    { method: "GET", path: "/v1/admin/reconciliation/cases/:id/events", action: "admin.reconciliation.read",
      subjectType: "reconciliation_case",
      handler: async ({ params, reconciliation }) => {
        const c = await reconciliation.getCase(params.id);
        if (!c) return { status: 404, body: errorBody("NOT_FOUND") };
        return { body: { events: await reconciliation.getCaseEvents(params.id) } };
      } },

    { method: "POST", path: "/v1/admin/reconciliation/cases/:id/review", action: "admin.reconciliation.decide",
      subjectType: "reconciliation_case",
      handler: async ({ params, actor, body, reconciliation }) => {
        const r = await reconciliation.reviewCase(params.id, {
          reviewedBy: actor.id, note: typeof body.note === "string" ? body.note : null,
        });
        if (!r.ok) {
          const status = r.reason === "NOT_FOUND" ? 404 : 409;
          return { status, body: errorBody(r.reason) };
        }
        return { body: r };
      } },

    { method: "POST", path: "/v1/admin/reconciliation/cases/:id/resolve", action: "admin.reconciliation.decide",
      subjectType: "reconciliation_case",
      handler: async ({ params, actor, body, reconciliation }) => {
        if (body.status !== "RESOLVED" && body.status !== "FALSE_POSITIVE") {
          return { status: 400, body: errorBody("BAD_REQUEST", "status must be RESOLVED or FALSE_POSITIVE") };
        }
        const r = await reconciliation.resolveCase(params.id, {
          resolvedBy: actor.id,
          status: body.status,
          resolution: typeof body.resolution === "string" ? body.resolution : null,
          note: typeof body.note === "string" ? body.note : "",
        });
        if (!r.ok) {
          const status = r.reason === "NOT_FOUND_OR_ALREADY_CLOSED" ? 409 : 400;
          return { status, body: errorBody(r.reason) };
        }
        return { body: r };
      } },

    { method: "GET", path: "/v1/admin/reconciliation/runs", action: "admin.reconciliation.read",
      handler: async ({ db, query }) => {
        const kind = query.get("kind");
        const limit = Math.min(Number(query.get("limit") ?? 100) || 100, 500);
        const r = await db.query(
          `SELECT id, kind, status, started_at, completed_at, records_checked, mismatches_found, cases_opened, error
             FROM reconciliation_run
            WHERE ($1::reconciliation_run_kind IS NULL OR kind = $1)
            ORDER BY started_at DESC LIMIT $2`,
          [kind, limit]
        );
        return { body: { runs: r.rows } };
      } },

    // --- Admin: support tickets (Slice 8) ---------------------------------------
    // Every route below is gated by TICKET_VIEW/REPLY/ASSIGN/ESCALATE/CLOSE --
    // permission codes granted through the CUSTOM RBAC layer (rbac.mjs), never
    // through ROLE_CAPABILITIES, so a staff member has no ticket access AT ALL
    // until a real custom-role grant exists for them; SUPER_ADMIN gets none of
    // this "for free" through the fixed grid (see policy.mjs's own comment).
    // Financial safety: nothing here ever touches ledger_account, ledger_entry,
    // deposit.status, or withdrawal.status -- a support agent can READ the
    // payment/withdrawal context a ticket references (already snapshotted,
    // safely, into support_ticket.context at creation) but every one of these
    // handlers only ever writes support_ticket*, never a financial table.

    { method: "GET", path: "/v1/admin/tickets", action: "admin.ticket.view",
      handler: async ({ query, support }) => {
        const tickets = await support.listForStaff({
          status: query.get("status") || undefined,
          priority: query.get("priority") || undefined,
          category: query.get("category") || undefined,
          team: query.get("team") || undefined,
          assigneeId: query.get("assigneeId") || undefined,
          search: query.get("search") || undefined,
          limit: query.get("limit") || undefined,
          offset: query.get("offset") || undefined,
        });
        return { body: { tickets } };
      } },

    { method: "GET", path: "/v1/admin/tickets/:id", action: "admin.ticket.view",
      subjectType: "support_ticket",
      handler: async ({ params, support }) => {
        const ticket = await support.getForStaff(params.id);
        if (!ticket) return { status: 404, body: errorBody("NOT_FOUND") };
        const messages = await support.listMessagesForStaff(params.id);
        return { body: { ticket, messages } };
      } },

    { method: "POST", path: "/v1/admin/tickets/:id/assign", action: "admin.ticket.assign",
      subjectType: "support_ticket",
      handler: async ({ params, actor, body, support }) => {
        const assigneeId = typeof body.assigneeId === "string" && body.assigneeId ? body.assigneeId : actor.id;
        const r = await support.assignTicket({ ticketId: params.id, assigneeId, assignedBy: actor.id });
        if (!r.ok) return { status: ticketErrorStatus(r.reason), body: errorBody(r.reason) };
        return { body: r, audit: { event: "TICKET_ASSIGNED", ticketId: params.id, assigneeId } };
      } },

    { method: "POST", path: "/v1/admin/tickets/:id/messages", action: "admin.ticket.reply",
      subjectType: "support_ticket",
      handler: async ({ params, actor, body, support, ticketNotifications, db }) => {
        const visibility = body.visibility === "INTERNAL" ? "INTERNAL" : "CUSTOMER";
        const r = await support.sendStaffMessage({ ticketId: params.id, staffId: actor.id, content: body.content, visibility });
        if (!r.ok) return { status: ticketErrorStatus(r.reason), body: errorBody(r.reason) };

        // Never notify for an INTERNAL note (directive: "Do NOT send
        // internal notes") -- only a genuinely customer-visible reply.
        if (visibility === "CUSTOMER" && ticketNotifications) {
          const ticket = await support.getForStaff(params.id);
          const contact = await emailContactFor(db, ticket.player_id);
          await ticketNotifications.notify({
            ticketId: params.id, notification: "STAFF_REPLIED", messageId: r.messageId,
            email: contact.email, locale: contact.locale, subject: ticket.subject,
          }).catch(() => {});
        }

        return {
          status: 201, body: { messageId: r.messageId },
          audit: { event: visibility === "INTERNAL" ? "TICKET_INTERNAL_NOTE_ADDED" : "TICKET_MESSAGE_SENT", ticketId: params.id },
        };
      } },

    // Routine, non-final progress through the state machine -- triage, pick
    // up, hand back to the customer. See policy.mjs's comment on why this is
    // TICKET_REPLY rather than a sixth capability.
    { method: "POST", path: "/v1/admin/tickets/:id/status", action: "admin.ticket.reply",
      subjectType: "support_ticket",
      handler: async ({ params, body, support, ticketNotifications, db }) => {
        const toStatus = body.toStatus;
        if (!["TRIAGED", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_USER"].includes(toStatus)) {
          return { status: 400, body: errorBody("BAD_REQUEST", "toStatus must be one of TRIAGED, ASSIGNED, IN_PROGRESS, WAITING_FOR_USER") };
        }
        const r = await support.changeStatus({ ticketId: params.id, toStatus });
        if (!r.ok) return { status: ticketErrorStatus(r.reason), body: errorBody(r.reason, { from: r.from }) };

        if (toStatus === "WAITING_FOR_USER" && ticketNotifications) {
          const ticket = await support.getForStaff(params.id);
          const contact = await emailContactFor(db, ticket.player_id);
          await ticketNotifications.notify({
            ticketId: params.id, notification: "WAITING_FOR_USER",
            email: contact.email, locale: contact.locale, subject: ticket.subject,
          }).catch(() => {});
        }

        return { body: r, audit: { event: "TICKET_STATUS_CHANGED", ticketId: params.id, from: r.from, to: r.to } };
      } },

    { method: "POST", path: "/v1/admin/tickets/:id/escalate", action: "admin.ticket.escalate",
      subjectType: "support_ticket",
      handler: async ({ params, body, support }) => {
        const r = await support.escalateTicket({ ticketId: params.id, toTeam: body.toTeam });
        if (!r.ok) return { status: ticketErrorStatus(r.reason), body: errorBody(r.reason) };
        return { body: r, audit: { event: "TICKET_ESCALATED", ticketId: params.id, fromTeam: r.fromTeam, toTeam: r.toTeam } };
      } },

    { method: "POST", path: "/v1/admin/tickets/:id/resolve", action: "admin.ticket.close",
      subjectType: "support_ticket",
      handler: async ({ params, support, ticketNotifications, db }) => {
        const r = await support.changeStatus({ ticketId: params.id, toStatus: "RESOLVED" });
        if (!r.ok) return { status: ticketErrorStatus(r.reason), body: errorBody(r.reason, { from: r.from }) };

        if (ticketNotifications) {
          const ticket = await support.getForStaff(params.id);
          const contact = await emailContactFor(db, ticket.player_id);
          await ticketNotifications.notify({
            ticketId: params.id, notification: "TICKET_RESOLVED",
            email: contact.email, locale: contact.locale, subject: ticket.subject,
          }).catch(() => {});
        }

        return { body: r, audit: { event: "TICKET_RESOLVED", ticketId: params.id } };
      } },

    { method: "POST", path: "/v1/admin/tickets/:id/close", action: "admin.ticket.close",
      subjectType: "support_ticket",
      handler: async ({ params, support }) => {
        const r = await support.changeStatus({ ticketId: params.id, toStatus: "CLOSED" });
        if (!r.ok) return { status: ticketErrorStatus(r.reason), body: errorBody(r.reason, { from: r.from }) };
        return { body: r, audit: { event: "TICKET_CLOSED", ticketId: params.id } };
      } },

    { method: "POST", path: "/v1/admin/tickets/:id/reopen", action: "admin.ticket.close",
      subjectType: "support_ticket",
      handler: async ({ params, support, ticketNotifications }) => {
        const r = await support.changeStatus({ ticketId: params.id, toStatus: "OPEN" });
        if (!r.ok) return { status: ticketErrorStatus(r.reason), body: errorBody(r.reason, { from: r.from }) };

        // Free both ticket-level slots so this new episode of the ticket's
        // life can notify again -- see notifications.mjs's own header on
        // why these two (and only these two) are ticket-scoped rather than
        // message-scoped.
        if (ticketNotifications) {
          await ticketNotifications.clearOccurrence({ ticketId: params.id, notification: "WAITING_FOR_USER" });
          await ticketNotifications.clearOccurrence({ ticketId: params.id, notification: "TICKET_RESOLVED" });
        }

        return { body: r, audit: { event: "TICKET_REOPENED", ticketId: params.id } };
      } },

    // --- Admin: chat moderation (Slice 9) ---------------------------------------
    // Gated by CHAT_VIEW/CHAT_DELETE/CHAT_MUTE/CHAT_REPORT_REVIEW -- custom
    // RBAC permission codes, exactly the TICKET_* pattern above: no admin
    // holds these "for free" through the fixed grid, including SUPER_ADMIN.

    { method: "GET", path: "/v1/admin/chat/global/messages", action: "admin.chat.view",
      handler: async ({ query, chat }) => {
        const rows = await chat.messages.listHistoryForStaff({
          channelId: globalChannelId(),
          before: query.get("before") ?? undefined, after: query.get("after") ?? undefined,
          limit: query.get("limit") || undefined,
        });
        return { body: { messages: rows } };
      } },

    { method: "GET", path: "/v1/admin/duels/:id/chat/messages", action: "admin.chat.view",
      subjectType: "chat_channel",
      handler: async ({ params, query, chat }) => {
        const channel = await chat.channels.getChannel(matchChannelId(params.id));
        if (!channel) return { status: 404, body: errorBody("NO_SUCH_CHANNEL") };
        const rows = await chat.messages.listHistoryForStaff({
          channelId: channel.id,
          before: query.get("before") ?? undefined, after: query.get("after") ?? undefined,
          limit: query.get("limit") || undefined,
        });
        return { body: { channelId: channel.id, messages: rows } };
      } },

    { method: "POST", path: "/v1/admin/chat/messages/:id/delete", action: "admin.chat.delete",
      subjectType: "chat_message",
      handler: async ({ params, actor, chat }) => {
        const r = await chat.messages.moderateDelete({ messageId: params.id, moderatorId: actor.id });
        if (!r.ok) return { status: chatErrorStatus(r.reason), body: errorBody(r.reason) };
        return { body: r, audit: { event: "CHAT_MESSAGE_DELETED", messageId: params.id, channelId: r.channelId } };
      } },

    { method: "POST", path: "/v1/admin/chat/mutes", action: "admin.chat.mute",
      subjectType: "chat_mute",
      handler: async ({ actor, body, chat }) => {
        const r = await chat.moderation.muteUser({
          targetId: body.targetId, moderatorId: actor.id, reason: body.reason, scope: body.scope,
          durationMs: typeof body.durationMs === "number" ? body.durationMs : null,
        });
        if (!r.ok) return { status: chatErrorStatus(r.reason), body: errorBody(r.reason) };
        return {
          status: 201, body: r,
          audit: { event: "CHAT_USER_MUTED", targetId: body.targetId, scope: body.scope, muteId: r.muteId },
        };
      } },

    { method: "POST", path: "/v1/admin/chat/mutes/:id/revoke", action: "admin.chat.mute",
      subjectType: "chat_mute",
      handler: async ({ params, actor, chat }) => {
        const r = await chat.moderation.unmuteUser({ muteId: params.id, revokedBy: actor.id });
        if (!r.ok) return { status: chatErrorStatus(r.reason), body: errorBody(r.reason) };
        return { body: r, audit: { event: "CHAT_USER_UNMUTED", muteId: params.id } };
      } },

    { method: "GET", path: "/v1/admin/chat/mutes/:targetId", action: "admin.chat.view",
      handler: async ({ params, chat }) => ({ body: { mutes: await chat.moderation.listActiveMutesFor(params.targetId) } }) },

    { method: "GET", path: "/v1/admin/chat/reports", action: "admin.chat.view",
      handler: async ({ query, chat }) => ({
        body: {
          reports: await chat.reports.listQueue({
            status: query.get("status") || undefined, limit: query.get("limit") || undefined, offset: query.get("offset") || undefined,
          }),
        },
      }) },

    { method: "POST", path: "/v1/admin/chat/reports/:id/review", action: "admin.chat.report_review",
      subjectType: "content_report",
      handler: async ({ params, body, chat }) => {
        // Reuses the report queue's OWN status vocabulary (content_report,
        // migration 0020) rather than inventing a chat-specific one.
        if (body.status !== "REVIEWED" && body.status !== "DISMISSED") {
          return { status: 400, body: errorBody("BAD_REQUEST", "status must be REVIEWED or DISMISSED") };
        }
        const r = await chat.reports.reviewReport({ reportId: params.id, status: body.status });
        if (!r.ok) return { status: chatErrorStatus(r.reason), body: errorBody(r.reason) };
        return { body: r, audit: { event: "CHAT_MODERATION_ACTION", action: "REPORT_REVIEWED", reportId: params.id, status: body.status } };
      } },

    // --- Admin: custom roles & permissions (db/migrations/0015) -----------------
    // Every route below is admin.rbac.manage, held only by SUPER_ADMIN (see
    // policy.mjs). This is the surface that assigns privileges, so it is
    // deliberately the least widely held capability in the whole grid --
    // see rbac.mjs's own header comment for why this is a separate system
    // from the fixed role/capability grid these same routes cannot touch.

    { method: "GET", path: "/v1/admin/permissions", action: "admin.rbac.manage",
      handler: async ({ rbac }) => ({ body: { permissions: await rbac.listPermissions() } }) },

    { method: "GET", path: "/v1/admin/roles", action: "admin.rbac.manage",
      handler: async ({ rbac }) => ({ body: { roles: await rbac.listRoles() } }) },

    { method: "GET", path: "/v1/admin/roles/:id", action: "admin.rbac.manage",
      subjectType: "role",
      handler: async ({ params, rbac }) => {
        const role = await rbac.getRole(params.id);
        return role ? { body: role } : { status: 404, body: errorBody("NOT_FOUND") };
      } },

    { method: "POST", path: "/v1/admin/roles", action: "admin.rbac.manage",
      subjectType: "role",
      handler: async ({ actor, body, rbac }) => {
        if (typeof body.id !== "string" || typeof body.name !== "string") {
          return { status: 400, body: errorBody("BAD_REQUEST", "id and name are required") };
        }
        const permissionCodes = Array.isArray(body.permissions) ? body.permissions : [];
        try {
          const role = await rbac.createRole({
            id: body.id, name: body.name,
            description: typeof body.description === "string" ? body.description : "",
            permissionCodes, createdBy: actor.id,
          });
          return { status: 201, body: role, audit: { subjectId: role.id, name: role.name, permissions: role.permissions } };
        } catch (e) {
          if (e.code === RbacError.UNKNOWN_PERMISSION) {
            return { status: 400, body: errorBody(e.code, e.detail) };
          }
          if (e.code === RbacError.DUPLICATE_NAME) {
            return { status: 409, body: errorBody(e.code) };
          }
          throw e;
        }
      } },

    { method: "PATCH", path: "/v1/admin/roles/:id", action: "admin.rbac.manage",
      subjectType: "role",
      handler: async ({ params, body, rbac }) => {
        try {
          const before = await rbac.getRole(params.id);
          if (!before) return { status: 404, body: errorBody("NOT_FOUND") };
          const role = await rbac.updateRole(params.id, {
            name: typeof body.name === "string" ? body.name : undefined,
            description: typeof body.description === "string" ? body.description : undefined,
          });
          return { body: role, audit: { before: { name: before.name }, after: { name: role.name } } };
        } catch (e) {
          if (e.code === RbacError.SYSTEM_ROLE_IMMUTABLE) return { status: 403, body: errorBody(e.code) };
          if (e.code === RbacError.ROLE_NOT_FOUND) return { status: 404, body: errorBody(e.code) };
          throw e;
        }
      } },

    { method: "DELETE", path: "/v1/admin/roles/:id", action: "admin.rbac.manage",
      subjectType: "role",
      handler: async ({ params, rbac }) => {
        try {
          await rbac.deleteRole(params.id);
          return { status: 204, body: {} };
        } catch (e) {
          if (e.code === RbacError.SYSTEM_ROLE_IMMUTABLE) return { status: 403, body: errorBody(e.code) };
          if (e.code === RbacError.ROLE_NOT_FOUND) return { status: 404, body: errorBody(e.code) };
          throw e;
        }
      } },

    { method: "PATCH", path: "/v1/admin/roles/:id/permissions", action: "admin.rbac.manage",
      subjectType: "role",
      handler: async ({ params, body, rbac }) => {
        if (!Array.isArray(body.permissions)) {
          return { status: 400, body: errorBody("BAD_REQUEST", "permissions must be an array of codes") };
        }
        try {
          const diff = await rbac.setRolePermissions(params.id, body.permissions);
          return { body: diff, audit: diff };
        } catch (e) {
          if (e.code === RbacError.UNKNOWN_PERMISSION) return { status: 400, body: errorBody(e.code, e.detail) };
          if (e.code === RbacError.SYSTEM_ROLE_IMMUTABLE) return { status: 403, body: errorBody(e.code) };
          if (e.code === RbacError.ROLE_NOT_FOUND) return { status: 404, body: errorBody(e.code) };
          throw e;
        }
      } },

    { method: "POST", path: "/v1/admin/admin-users/:id/roles", action: "admin.rbac.manage",
      subjectType: "admin_user",
      handler: async ({ params, actor, body, rbac }) => {
        if (typeof body.roleId !== "string") return { status: 400, body: errorBody("BAD_REQUEST") };
        try {
          await rbac.grantRole({ adminId: params.id, roleId: body.roleId, grantedBy: actor.id });
          return { status: 201, body: { roles: await rbac.rolesFor(params.id) }, audit: { granted: body.roleId } };
        } catch (e) {
          if (e.code === RbacError.SELF_GRANT) return { status: 403, body: errorBody(e.code) };
          if (e.code === RbacError.ROLE_NOT_FOUND) return { status: 404, body: errorBody(e.code) };
          throw e;
        }
      } },

    { method: "DELETE", path: "/v1/admin/admin-users/:id/roles/:roleId", action: "admin.rbac.manage",
      subjectType: "admin_user",
      handler: async ({ params, rbac }) => {
        await rbac.revokeRole({ adminId: params.id, roleId: params.roleId });
        return { body: { roles: await rbac.rolesFor(params.id) }, audit: { revoked: params.roleId } };
      } },

    { method: "GET", path: "/v1/admin/admin-users/:id/permissions", action: "admin.rbac.manage",
      subjectType: "admin_user",
      handler: async ({ params, rbac }) => ({
        body: { roles: await rbac.rolesFor(params.id), permissions: await rbac.effectivePermissions(params.id) },
      }) },
  ];
}

export { ACTIONS };
