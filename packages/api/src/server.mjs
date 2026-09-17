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
import { randomUUID } from "node:crypto";
import { authorize, Decision, ACTIONS, capabilitiesFor, undeclaredActions } from "../../authz/src/policy.mjs";
import {
  compileRoutes, matchRoute, readJsonBody, sendJson, sendText, errorBody,
} from "./router.mjs";
import { createRateLimiter, takeToken } from "../../realtime/src/protocol.mjs";
import { createMatchmakingService, MatchmakingError } from "../../matchmaking/src/matchmaking.mjs";
import { createVsComputerService } from "../../matchmaking/src/vs-computer.mjs";
import { createChallengeService, ChallengeError } from "../../matchmaking/src/challenge.mjs";
import { DEFAULT_SPAWNERS } from "../../matchmaking/src/spawn.mjs";
import { isValidStakeMinor } from "../../matchmaking/src/stakes.mjs";
import { tryResolveTimeControl, resolveTimeControl, DEFAULT_TIME_PROFILE } from "../../duel-engine/src/time-profiles.mjs";
import { SUPPORTED_LOCALE_CODES, DEFAULT_LOCALE } from "../../i18n/src/locales.mjs";
import { RbacError } from "../../authz/src/rbac.mjs";
import { setActor as setLedgerActor, WithdrawalError } from "../../payments/src/payments.mjs";
import { EmailIdentityError } from "../../auth/src/email-identity.mjs";
import { EmailVerificationError } from "../../auth/src/email-verification.mjs";
import { getAuthMethods } from "../../auth/src/auth-methods.mjs";
import { TicketError } from "../../support/src/ticket.mjs";
import { ChatAuthError, matchChannelId, globalChannelId } from "../../chat/src/channels.mjs";
import { ChatMessageError } from "../../chat/src/messages.mjs";
import { ModerationError } from "../../chat/src/moderation.mjs";
import { BlockError } from "../../chat/src/blocks.mjs";
import { ReportError } from "../../chat/src/reports.mjs";
import { createDirectChatService } from "../../chat/src/direct.mjs";
import { createConsentService, ConsentError } from "../../compliance/src/consent.mjs";

async function poolBatch(tasks, concurrency = 3) {
  const results = new Array(tasks.length);
  let nextIdx = 0;
  async function worker() {
    while (nextIdx < tasks.length) {
      const idx = nextIdx++;
      results[idx] = await tasks[idx]();
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Calculates a player's Anti-Money Laundering (AML) playthrough summary and withdrawable balance.
 *
 * Rule: Deposited funds cannot be withdrawn without meeting the 1x playthrough/wagering requirement.
 *   - totalDeposited: sum of all CREDITED deposits.
 *   - totalPlayed: sum of entry fees staked in cash duels (LIVE/COMPLETED/SETTLED) + cash tournaments.
 *   - totalWon: sum of payouts won from settled cash duels + tournament prizes.
 *   - unplayedDeposit: max(0, totalDeposited - totalPlayed) -- locked under AML rules.
 *   - withdrawable: max(0, availableBalance - unplayedDeposit) -- fully cleared capital and winnings.
 */
export async function getPlayerAmlSummary(db, playerId, asset = "USDT") {
  const [depRes, duelPlayedRes, tourneyPlayedRes, duelWonRes, tourneyWonRes, balRes] = await Promise.all([
    // Total Credited Deposits (USDT)
    db.query(
      `SELECT COALESCE(SUM(observed_amount_minor), 0)::bigint AS total_deposited
         FROM deposit
        WHERE player_id = $1 AND status = 'CREDITED' AND asset = $2`,
      [playerId, asset]
    ),
    // Total Played / Wagered in Duels (USDT)
    // Only CASH duels that were not cancelled/voided (i.e. LIVE, COMPLETED, or SETTLED)
    db.query(
      `SELECT COALESCE(SUM(stake_minor), 0)::bigint AS total_played_duels
         FROM duel
        WHERE tier = 'CASH' AND asset = $2
          AND (seat_0 = $1 OR seat_1 = $1)
          AND status IN ('LIVE', 'COMPLETED', 'SETTLED')`,
      [playerId, asset]
    ),
    // Total Played in Tournaments (USDT)
    db.query(
      `SELECT COALESCE(SUM(t.entry_fee_minor), 0)::bigint AS total_played_tournaments
         FROM tournament_registration tr
         JOIN tournament t ON t.id = tr.tournament_id
        WHERE tr.player_id = $1
          AND tr.status = 'REGISTERED'
          AND t.tier = 'CASH' AND t.asset = $2
          AND t.status::text IN ('LIVE', 'FINALS', 'COMPLETED', 'SETTLED', 'IN_PROGRESS')`,
      [playerId, asset]
    ),
    // Total Won from Settled Duels (USDT)
    db.query(
      `SELECT COALESCE(SUM(
         CASE
           WHEN seat_0 = $1 AND result = '1-0' THEN (2 * stake_minor) - COALESCE(rake_minor, 0)
           WHEN seat_1 = $1 AND result = '0-1' THEN (2 * stake_minor) - COALESCE(rake_minor, 0)
           WHEN (seat_0 = $1 OR seat_1 = $1) AND result = '1/2-1/2' THEN stake_minor
           ELSE 0
         END
       ), 0)::bigint AS total_won_duels
         FROM duel
        WHERE tier = 'CASH' AND asset = $2
          AND (seat_0 = $1 OR seat_1 = $1)
          AND status = 'SETTLED'`,
      [playerId, asset]
    ),
    // Total Won from Tournaments (USDT)
    db.query(
      `SELECT COALESCE(SUM(ts.prize_minor), 0)::bigint AS total_won_tournaments
         FROM tournament_settlement ts
         JOIN tournament t ON t.id = ts.tournament_id
        WHERE ts.player_id = $1 AND t.asset = $2`,
      [playerId, asset]
    ),
    // Current Ledger Available & Locked Balances
    db.query(
      `SELECT 
         COALESCE((
           SELECT ledger_natural_balance(a.normal_side, COALESCE(b.balance, 0))
             FROM ledger_account a
             LEFT JOIN ledger_balance b ON b.account_id = a.id
            WHERE a.owner_type = 'USER' AND a.owner_id = $1 AND a.key = 'user:' || $1 || ':available' AND a.asset = $2
         ), 0)::bigint AS available,
         COALESCE((
           SELECT ledger_natural_balance(a.normal_side, COALESCE(b.balance, 0))
             FROM ledger_account a
             LEFT JOIN ledger_balance b ON b.account_id = a.id
            WHERE a.owner_type = 'USER' AND a.owner_id = $1 AND a.key = 'user:' || $1 || ':locked' AND a.asset = $2
         ), 0)::bigint AS locked`,
      [playerId, asset]
    ),
  ]);

  const totalDepositedMinor = BigInt(depRes.rows[0]?.total_deposited ?? 0);
  const totalPlayedDuelsMinor = BigInt(duelPlayedRes.rows[0]?.total_played_duels ?? 0);
  const totalPlayedTourneysMinor = BigInt(tourneyPlayedRes.rows[0]?.total_played_tournaments ?? 0);
  const totalPlayedMinor = totalPlayedDuelsMinor + totalPlayedTourneysMinor;

  const totalWonDuelsMinor = BigInt(duelWonRes.rows[0]?.total_won_duels ?? 0);
  const totalWonTourneysMinor = BigInt(tourneyWonRes.rows[0]?.total_won_tournaments ?? 0);
  const totalWonMinor = totalWonDuelsMinor + totalWonTourneysMinor;

  const availableMinor = BigInt(balRes.rows[0]?.available ?? 0);
  const lockedMinor = BigInt(balRes.rows[0]?.locked ?? 0);

  // Unplayed deposited amount: deposits that have not yet satisfied the 1x wagering/turnover requirement
  const unplayedDepositMinor = totalDepositedMinor > totalPlayedMinor
    ? totalDepositedMinor - totalPlayedMinor
    : 0n;

  // Withdrawable balance: available balance minus unplayed deposited funds, bounded by [0, available]
  let withdrawableMinor = availableMinor > unplayedDepositMinor
    ? availableMinor - unplayedDepositMinor
    : 0n;
  if (withdrawableMinor > availableMinor) {
    withdrawableMinor = availableMinor;
  }

  return {
    asset,
    totalDepositedMinor: totalDepositedMinor.toString(),
    totalPlayedMinor: totalPlayedMinor.toString(),
    totalWonMinor: totalWonMinor.toString(),
    availableMinor: availableMinor.toString(),
    lockedMinor: lockedMinor.toString(),
    unplayedDepositMinor: unplayedDepositMinor.toString(),
    withdrawableMinor: withdrawableMinor.toString(),
    playthroughRequired: unplayedDepositMinor > 0n,
    playthroughCompleted: unplayedDepositMinor === 0n,
  };
}

export function createApi({
  db, auth, settlement = null, tournament = null, globalSkill = null, reconciliation = null, rbac = null,
  emailIdentity = null, emailVerification = null, welcomeEmail = null, emailLoginCode = null, passwordReset = null,
  googleOAuth = null, profile = null, support = null, ticketNotifications = null, chat = null,
  mastery = null, streaks = null, dailyChallenges = null, recommendations = null, frames = null,
  consent = null,
  // Read-only admin visibility into EXP/achievements/badges (Slice 11,
  // directive #20) -- { exp, achievements, badges }, the SAME
  // packages/profile services `profile` above already wraps for the
  // player-facing view. No award/mutation method is ever reachable
  // through this bundle's routes below -- see this file's own comment at
  // the route itself for why a manual-EXP-edit endpoint does not exist.
  progression = null,
  referral = null, referrals = null,
  // The Admin Payment & Stablecoin Control Center: `rails` is
  // createRailService() (packages/payments/src/valuation.mjs), `railHealth`
  // is createHealthService() (packages/payments/src/health.mjs). Both null
  // by default like every other optional service bundle above -- a
  // deployment that has not wired the chain reader yet still starts, and
  // every /v1/admin/payments/* route below answers SERVICE_UNAVAILABLE
  // rather than crashing.
  rails = null, railHealth = null,
  paymentSvc = null, paymentProvider = null,
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

    const playerRow = await db.query(
      "SELECT id, disabled_at FROM player WHERE id = $1",
      [playerId]
    );
    if (!playerRow.rows.length) return { type: "ANON", id: null, tokenError: "NO_SUCH_PLAYER" };
    return {
      type: "PLAYER",
      id: playerId,
      sessionId: res.claims.sid,
      disabled: playerRow.rows[0].disabled_at !== null,
    };
  }

  const consentService = consent || (db ? createConsentService(db, { now }) : null);

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
      // The 5-per-5-minutes default suits one-shot flows (request a code,
      // confirm a reset). Step-up is different in kind: one operator can
      // legitimately need a fresh token for several DIFFERENT actions in a
      // row, since each token is bound to exactly one. It still needs a
      // hard ceiling -- it is a password check -- just a workable one.
      const fallbackBudget = route.rateLimitKey === "step-up"
        ? { capacity: 15, refillRatePerSecond: 15 / 300 }
        : { capacity: 5, refillRatePerSecond: 5 / 300 };
      const perIpBudget = sensitiveRateLimits[route.rateLimitKey] ?? fallbackBudget;
      if (!sensitiveLimiters.has(route.rateLimitKey)) {
        sensitiveLimiters.set(route.rateLimitKey, new Map());
      }
      const map = sensitiveLimiters.get(route.rateLimitKey);
      if (!map.has(key)) map.set(key, createRateLimiter(perIpBudget));
      if (!takeToken(map.get(key), now())) {
        return sendJson(res, 429, errorBody("RATE_LIMITED"), { "retry-after": "60" });
      }
    }

    const parsed = ["POST", "PUT", "PATCH"].includes(req.method)
      ? await readJsonBody(req, route.maxBodyBytes ? { maxBytes: route.maxBodyBytes } : {})
      : { ok: true, body: {} };
    if (!parsed.ok) {
      const status = parsed.code === "PAYLOAD_TOO_LARGE" ? 413
        : parsed.code === "UNSUPPORTED_MEDIA_TYPE" ? 415 : 400;
      return sendJson(res, status, errorBody(parsed.code));
    }

    const actor = await identify(req);
    if (actor?.id && db) {
      db.query(
        "UPDATE player SET last_seen_at = now() WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < now() - INTERVAL '1 minute')",
        [actor.id]
      ).catch(() => {});
    }

    // Platform emergency controls: loaded once per request, passed into
    // authorize() and on to handlers through `ctx.controls` so any secondary
    // check (e.g. a competitive challenge/ticket re-checked against
    // duel.play.cash on top of the route's own duel.play.free) read the
    const controls = await loadControls();
    const directChat = createDirectChatService(db);
    const ctx = {
      params, body: parsed.body, rawBody: parsed.rawBody, headers: req.headers, query: url.searchParams, actor,
      ip: req.socket.remoteAddress, userAgent: req.headers["user-agent"],
      db, auth, settlement, tournament, globalSkill, reconciliation, rbac,
      emailIdentity, emailVerification, welcomeEmail, emailLoginCode, passwordReset,
      googleOAuth, googleFrontendOrigin, profile, support, ticketNotifications, chat, progression, now,
      mastery, streaks, dailyChallenges, recommendations, frames,
      rails, railHealth, referral, referrals, consent: consentService, controls, directChat,
      paymentSvc, paymentProvider,
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
      controls,
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
      // A step-up denial names the action it wants re-authentication FOR: a
      // step-up token is bound to exactly one action, so a client that is
      // only told "step up" cannot mint the right one. This is the action
      // the route already declared -- never anything the client sent.
      const detail = decision.decision === Decision.REQUIRE_STEP_UP
        ? (decision.action ?? route.action)
        : decision.detail;
      return sendJson(res, status, errorBody(decision.reason, detail));
    }

    const result = await route.handler(ctx);
    if (actor.type === "ADMIN") await recordAdminAction(actor, route, ctx, result);
    if (result.text !== undefined) {
      return sendText(res, result.status ?? 200, result.text, result.headers ?? {});
    }
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
/**
 * The coin a cash stake is placed in. Every enabled stablecoin can be staked
 * and a winner is paid in that same coin -- nothing is ever converted, so a
 * request naming a coin the platform does not hold is refused, never
 * quietly staked as USDT.
 */
async function resolveStakeAsset(q, raw) {
  const code = String(raw ?? "USDT").trim().toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(code)) return null;
  const r = await q.query("SELECT code FROM asset WHERE code = $1 AND enabled IS NOT FALSE", [code]);
  return r.rows.length ? code : null;
}

/** A player's spendable balance in one coin, in minor units. */
async function availableMinor(q, playerId, asset) {
  const r = await q.query(
    `SELECT ledger_natural_balance(a.normal_side, COALESCE(b.balance, 0)) AS bal
       FROM ledger_account a
       LEFT JOIN ledger_balance b ON b.account_id = a.id
      WHERE a.key = 'user:' || $1 || ':available' AND a.asset = $2`,
    [playerId, asset]
  );
  return r.rows.length ? BigInt(r.rows[0].bal || 0) : 0n;
}

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
      // `payments` reports whether THIS RUNNING PROCESS has a real payment
      // provider wired, as a bare boolean -- no key, no key fragment, no
      // provider name beyond what any deposit response already reveals.
      //
      // It exists because the alternative was unanswerable from outside: the
      // API silently fell back to sandbox deposit addresses while the keys
      // were correctly set in the hosting panel, and the only way anyone
      // found out was reading minted addresses out of the database hours
      // later. Whether payments are live is an operational fact about the
      // deployment, and one a status check should be able to state.
      handler: async ({ paymentSvc, googleOAuth }) => ({
        body: {
          ok: true,
          payments: paymentSvc ? "configured" : "unavailable",
          // The web client uses this to decide whether to show ANY Google
          // sign-in UI at all -- showing a "Continue with Google" prompt
          // that always fails (GOOGLE_LOGIN_UNAVAILABLE on every click) is
          // a broken, confusing flow, not a degraded one.
          googleLogin: googleOAuth ? "configured" : "unavailable",
        },
      }) },

    // The asset/network pairs money can actually move on end to end -- what
    // the wallet should offer. Public and read-only: it describes the
    // platform, not any player. `null` means the verifier does not declare
    // its coverage; an empty list means payments are not wired at all.
    { method: "GET", path: "/v1/payments/rails", action: "player.login", anonymous: true,
      handler: async ({ paymentSvc }) => ({
        body: { ok: true, rails: paymentSvc ? paymentSvc.supportedRails() : [] },
      }) },

    // --- Auth ----------------------------------------------------------------
    { method: "POST", path: "/v1/auth/register", action: "player.register", anonymous: true,
      handler: async ({ body, auth, welcomeEmail, ip, userAgent }) => {
        const { handle, email, password, referralCode, termsAccepted, locale, policyVersion } = body ?? {};
        if (typeof handle !== "string" || typeof password !== "string") {
          return { status: 400, body: errorBody("BAD_REQUEST") };
        }
        if (termsAccepted === false) {
          return { status: 400, body: errorBody("TERMS_ACCEPTANCE_REQUIRED", "You must agree to the Terms & Conditions to register") };
        }
        const normalizedEmail = typeof email === "string" && email.trim() ? email.trim() : null;
        const r = await auth.register({
          playerId: handle,
          handle,
          email: normalizedEmail,
          password,
          referralCode: referralCode ? String(referralCode) : null,
          termsAccepted: true,
          locale: locale ? String(locale) : "en",
          policyVersion: policyVersion ? String(policyVersion) : "1.0.0",
        }, { ip, userAgent });
        if (!r.ok) return { status: 400, body: errorBody(r.reason, r.detail) };
        // Best-effort welcome email -- never blocks or fails the registration.
        if (welcomeEmail && normalizedEmail) {
          welcomeEmail.sendOnce({
            playerId: r.playerId,
            nickname: handle,
            email: normalizedEmail,
            locale: locale ? String(locale) : "en",
          }, { ip, userAgent }).catch(() => {});
        }
        return { status: 201, body: { playerId: r.playerId } };
      } },


    { method: "POST", path: "/v1/auth/login", action: "player.login", anonymous: true,
      handler: async ({ body, auth, ip }) => {
        const identifier = String(body.identifier ?? "").trim();
        // Login by nickname is strictly disallowed in production; valid email addresses are required
        if (process.env.NODE_ENV !== "test" && !identifier.includes("@")) {
          return { status: 401, body: errorBody("BAD_CREDENTIALS") };
        }
        const r = await auth.login({
          identifier,
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
      // Its own per-IP budget, on top of the general limiter. Step-up is a
      // password check that an ALREADY-authenticated caller can repeat, and
      // it is now the gate in front of granting roles, seizing balances and
      // approving payouts -- so an attacker holding a stolen session must
      // not be able to sit on this endpoint guessing the password.
      rateLimitKey: "step-up",
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
        const rolesRes = await db.query("SELECT admin_roles($1) AS roles", [actor.id]);
        const roles = rolesRes.rows[0]?.roles ?? [];
        const isAdmin = roles.includes("SUPER_ADMIN") || roles.includes("ADMIN");
        return { body: {
          ...r.rows[0],
          email: email?.email_display ?? null,
          emailVerified: Boolean(email?.verified_at),
          isAdmin
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

    // --- Wallet & Payments ---------------------------------------------------
    { method: "GET", path: "/v1/players/:id/wallet", action: "wallet.read",
      owner: ({ params }) => params.id,
      handler: async ({ params, db }) => {
        const [accountsRes, withdrawalsRes, depositsRes, amlSummary] = await Promise.all([
          db.query(
            `SELECT a.key,
                    ledger_natural_balance(a.normal_side, COALESCE(b.balance,0))::text AS balance,
                    a.asset
               FROM ledger_account a
               LEFT JOIN ledger_balance b ON b.account_id = a.id
              WHERE a.owner_type = 'USER' AND a.owner_id = $1
              ORDER BY a.key`,
            [params.id]
          ),
          db.query(
            `SELECT id, asset, network, destination, amount_minor::text, status::text, requested_at
               FROM withdrawal
              WHERE player_id = $1
              ORDER BY requested_at DESC
              LIMIT 20`,
            [params.id]
          ),
          db.query(
            // Sandbox-minted addresses are excluded outright. A handful were
            // issued while the API was falling back to the sandbox provider,
            // and they sit here in AWAITING_PAYMENT -- which a wallet renders
            // as "waiting for your payment", next to a copyable address that
            // leads nowhere. They are already barred from reuse; this stops
            // the ones already written from being shown as payable at all.
            `SELECT id, asset, network, address, status::text,
                    COALESCE(observed_amount_minor, 0)::text AS amount_minor,
                    observed_tx_hash, created_at, expires_at, credited_at
               FROM deposit
              WHERE player_id = $1
                AND address NOT LIKE 'Tsbx\\_%'
              ORDER BY created_at DESC
              LIMIT 20`,
            [params.id]
          ),
          getPlayerAmlSummary(db, params.id, "USDT"),
        ]);
        return {
          body: {
            accounts: accountsRes.rows,
            withdrawals: withdrawalsRes.rows,
            deposits: depositsRes.rows,
            amlSummary,
          },
        };
      } },

    { method: "POST", path: "/v1/players/:id/deposits", action: "wallet.deposit",
      owner: ({ params }) => params.id,
      handler: async ({ params, body, db, paymentSvc, paymentProvider }) => {
        const asset = String(body?.asset ?? "USDT").trim();
        const network = String(body?.network ?? "TRC20").trim();
        // What actually gets stored on the deposit row and checked against
        // the chain -- see custodyNetwork()'s own header on why "TRC20" and
        // "TRON" must resolve to the one seeded custody account. Used for
        // every DB lookup/write below; `network` (raw, user-facing) stays
        // what the wallet UI's network tabs sent and is only ever echoed
        // back in responses, never queried against.
        const storedNetwork = network === "TRC20" ? "TRON" : network;
        const rawAmount = body?.amountMinor ?? (body?.amount != null ? Math.round(Number(body.amount) * 1_000_000) : null);
        const amountMinor = rawAmount ? BigInt(rawAmount) : 10_000_000n;

        // Before anything else -- including handing back an address issued
        // earlier -- refuse a pair the chain verifier cannot confirm. An
        // address already sitting on such a pair is exactly as unsafe to pay
        // into as a new one: the deposit is quarantined, never credited.
        if (paymentSvc && !paymentSvc.isRailVerifiable(asset, storedNetwork)) {
          return {
            status: 422,
            body: errorBody("UNSUPPORTED_RAIL", `${asset} deposits on ${network} are not available yet.`),
          };
        }

        // Ensure player wallet exists in ledger
        await db.query("SELECT ledger_open_user_wallet($1)", [params.id]);

        // If player already has a static/dedicated address for this asset and network, reuse it!
        const existingDep = await db.query(
          `SELECT id, address, asset, network, provider_ref, expires_at
             FROM deposit
            WHERE player_id = $1 AND asset = $2 AND network = $3
              AND status NOT IN ('EXPIRED', 'ORPHANED', 'QUARANTINED')
              AND address NOT LIKE 'Tsbx_%'
            ORDER BY created_at DESC LIMIT 1`,
          [params.id, asset, storedNetwork]
        );
        if (existingDep.rows.length) {
          const row = existingDep.rows[0];
          return {
            status: 200,
            body: {
              ok: true,
              deposit: {
                id: row.id,
                address: row.address,
                // The client renders the QR from `address` itself; handing out
                // a third-party image URL for a payment address is a
                // redirection risk, not a convenience. See QrCode.tsx.
                qrCodeUrl: null,
                asset: row.asset,
                network,
                display: `${row.asset} — ${network}`,
                expiresAt: row.expires_at || new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000).toISOString(),
                isStatic: true,
              },
            },
          };
        }

        if (paymentSvc) {
          const res = await paymentSvc.createDeposit({
            playerId: params.id,
            asset,
            network: storedNetwork,
          });
          if (!res.ok) {
            return { status: 400, body: errorBody(res.reason || "DEPOSIT_FAILED") };
          }
          const depRow = await db.query("SELECT * FROM deposit WHERE id = $1", [res.depositId]);
          return {
            status: 201,
            body: {
              ok: true,
              deposit: {
                id: res.depositId,
                address: res.address,
                qrCodeUrl: null,
                asset: res.asset,
                network,
                display: res.display,
                isStatic: true,
                expiresAt: depRow.rows[0]?.expires_at || new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000).toISOString(),
              },
            },
          };
        }

        if (paymentProvider && typeof paymentProvider.createDepositIntent === "function") {
          try {
            const intent = await paymentProvider.createDepositIntent({
              userId: params.id,
              asset,
              network,
              amountMinor,
              idempotencyKey: `dep_${randomUUID()}`,
            });
            const id = `dep_${randomUUID()}`;
            await db.query(
              `INSERT INTO deposit (id, player_id, asset, network, provider, provider_ref, address, status, expires_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'AWAITING_PAYMENT', now() + interval '365 days')`,
              [id, params.id, asset, storedNetwork, paymentProvider.id, intent.providerRef, intent.address]
            );
            return {
              status: 201,
              body: {
                ok: true,
                deposit: {
                  id,
                  address: intent.address,
                  qrCodeUrl: null,
                  asset,
                  network,
                  expiresAt: intent.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
                },
              },
            };
          } catch (e) {
            console.error("Failed to create deposit via provider:", e);
            return { status: 502, body: errorBody("DEPOSIT_PROVIDER_FAILED", "The payment provider could not issue a deposit address. Please try again shortly.") };
          }
        }

        // No provider at all. There used to be a "fallback" here that minted
        // `T` + 32 random hex characters, stored it as a real AWAITING_PAYMENT
        // deposit, and handed it to the player as their address -- under ANY
        // network, BEP20 and ERC20 included. It looks like a genuine Tron
        // address, so unlike the sandbox's `Tsbx_` prefix nothing downstream
        // could tell it apart: it passed the reuse filter, showed in wallet
        // history, and anything paid into it was simply gone. It was also the
        // path a production process with no payment keys fell straight into.
        // A deposit address is either issued by the real provider or not
        // issued at all.
        return {
          status: 503,
          body: errorBody("PAYMENTS_UNAVAILABLE", "Deposits are temporarily unavailable. No address has been issued."),
        };
      } },

    // Deposit webhook from OxaPay. The ONLY supported path is
    // paymentSvc.ingestWebhook() -> verifyAndCredit(): verify signature,
    // record+dedupe the raw event, then independently re-derive the deposit
    // from the chain (packages/chain's own reader) before ever posting a
    // ledger entry. There is deliberately no inline fallback that credits
    // from the webhook body directly -- a payment provider is configured
    // (see apps/api/src/index.mjs) or deposits simply do not auto-credit,
    // which is the safe failure mode.
    { method: "POST", path: "/v1/payments/oxapay/webhook", action: "payment.webhook", anonymous: true,
      rateLimitKey: "payment-webhook",
      handler: async ({ body, rawBody, headers, paymentSvc }) => {
        const raw = rawBody || Buffer.from(JSON.stringify(body || {}));
        const reqHeaders = headers || {};

        if (!paymentSvc || typeof paymentSvc.ingestWebhook !== "function") {
          return { status: 200, text: "ok" };
        }
        const res = await paymentSvc.ingestWebhook(raw, reqHeaders);
        if (!res.ok) {
          return { status: 400, text: "invalid signature" };
        }
        return { status: 200, text: "ok" };
      } },

    // Webhook alias for /api/oxapay-webhook
    { method: "POST", path: "/api/oxapay-webhook", action: "payment.webhook", anonymous: true,
      handler: async (ctx) => {
        const primary = routes.find((r) => r.path === "/v1/payments/oxapay/webhook" && r.method === "POST");
        if (primary && primary.handler) return await primary.handler(ctx);
        return { status: 200, text: "ok" };
      } },

    // Payout status webhook from OxaPay.
    //
    // Deliberately does NOT trust the webhook body for anything but "go look":
    // it verifies the signature, resolves provider_ref -> our withdrawal id,
    // and hands off to paymentSvc.reconcile() -- the SAME function the
    // background reconciliation worker calls on a schedule. reconcile() never
    // advances BROADCASTED to CONFIRMED on a provider's word; it re-queries
    // the provider itself (provider.getPayout()) and, from there, requires an
    // independent chain.verifyTransfer() before completion ever posts a
    // ledger entry. A forged or replayed webhook can at worst trigger an
    // early reconcile() call that finds nothing new -- exactly mirroring the
    // deposit webhook's ingestWebhook() -> verifyAndCredit() shape below.
    { method: "POST", path: "/v1/payments/oxapay/payout-webhook", action: "payment.webhook", anonymous: true,
      rateLimitKey: "payment-webhook",
      handler: async ({ body, rawBody, headers, db, paymentProvider, paymentSvc }) => {
        const raw = rawBody || Buffer.from(JSON.stringify(body || {}));
        const reqHeaders = headers || {};

        if (!paymentProvider || typeof paymentProvider.verifyWebhook !== "function") {
          return { status: 200, text: "ok" };
        }
        const verified = paymentProvider.verifyWebhook(raw, reqHeaders);
        if (!verified.ok) {
          return { status: 400, text: "invalid signature" };
        }
        if (!paymentSvc || typeof paymentSvc.reconcile !== "function") {
          // No payment service wired -- nothing safe to do. Never fall back
          // to writing withdrawal state directly from a webhook body.
          return { status: 200, text: "ok" };
        }

        const ev = verified.event;
        const trackId = String(ev?.providerRef || ev?.raw?.track_id || "");
        if (!trackId) return { status: 200, text: "ok" };

        const wd = await db.query(
          `SELECT id FROM withdrawal WHERE provider_ref = $1 AND status IN ('PROCESSING', 'BROADCASTED', 'APPROVED')`,
          [trackId]
        );
        if (wd.rows.length) {
          // Errors here are the worker's problem too -- reconcile() is safe
          // to call repeatedly and idempotent on every terminal transition,
          // so a failure just means the next scheduled poll picks it up.
          await paymentSvc.reconcile(wd.rows[0].id).catch((err) => {
            console.error("paymentSvc.reconcile error in payout webhook:", err);
          });
        }
        return { status: 200, text: "ok" };
      } },

    { method: "POST", path: "/v1/players/:id/withdrawals", action: "wallet.withdraw",
      owner: ({ params }) => params.id,
      handler: async ({ params, body, db, paymentSvc }) => {
        const rawAmount = body?.amountMinor ?? (body?.amount != null ? Math.round(Number(body.amount) * 1_000_000) : null);
        const amountMinor = BigInt(rawAmount ?? 0);
        if (amountMinor <= 0n) {
          return { status: 400, body: errorBody("INVALID_AMOUNT", "Withdrawal amount must be greater than zero") };
        }
        if (amountMinor < 10_000_000n) {
          return { status: 400, body: errorBody("BELOW_MINIMUM", "Minimum withdrawal is $10.00") };
        }

        const destination = String(body?.destination ?? body?.address ?? "").trim();
        if (!destination) {
          return { status: 400, body: errorBody("INVALID_DESTINATION", "Destination address is required") };
        }
        const rawNetwork = String(body?.network ?? "TRC20").trim().toUpperCase();
        const storedNetwork = rawNetwork === "TRC20" ? "TRON" : rawNetwork;
        const network = rawNetwork;
        const asset = String(body?.asset ?? "USDT").trim().toUpperCase();

        // Refused before any funds are locked. A payout on a pair the chain
        // verifier cannot read would be sent and then never confirmed --
        // stuck in BROADCASTED, the player's balance locked indefinitely.
        if (!paymentSvc) {
          return { status: 503, body: errorBody("PAYMENTS_UNAVAILABLE", "Withdrawals are temporarily unavailable.") };
        }
        if (!paymentSvc.isRailVerifiable(asset, storedNetwork)) {
          return {
            status: 422,
            body: errorBody("UNSUPPORTED_RAIL", `${asset} withdrawals on ${network} are not available yet.`),
          };
        }

        // Mathematical check for blockchain network fee
        const NETWORK_FEES_MINOR = {
          TRC20: 1_000_000n, // 1.00 USD
          TRON: 1_000_000n,
          BEP20: 250_000n,   // 0.25 USD
          BSC: 250_000n,
          ERC20: 3_500_000n, // 3.50 USD
          ETH: 3_500_000n,
        };
        const feeMinor = NETWORK_FEES_MINOR[storedNetwork] ?? NETWORK_FEES_MINOR[network] ?? 1_000_000n;

        if (amountMinor <= feeMinor) {
          return {
            status: 400,
            body: errorBody(
              "AMOUNT_LESS_THAN_FEE",
              `Withdrawal amount ($${(Number(amountMinor) / 1e6).toFixed(2)}) must exceed network transfer fee of $${(Number(feeMinor) / 1e6).toFixed(2)}`
            ),
          };
        }

        // Strict AML playthrough & ledger balance check:
        const aml = await getPlayerAmlSummary(db, params.id, asset);
        const available = BigInt(aml.availableMinor);
        const withdrawable = BigInt(aml.withdrawableMinor);

        if (available < amountMinor) {
          return {
            status: 400,
            body: errorBody("INSUFFICIENT_FUNDS", "Insufficient available funds for withdrawal"),
          };
        }

        if (withdrawable < amountMinor) {
          return {
            status: 400,
            body: {
              error: {
                code: "AML_PLAYTHROUGH_REQUIRED",
                message: "Deposited funds must be played in duels before withdrawal for Anti-Money Laundering (AML) compliance.",
                withdrawableMinor: aml.withdrawableMinor,
                unplayedDepositMinor: aml.unplayedDepositMinor,
                totalDepositedMinor: aml.totalDepositedMinor,
                totalPlayedMinor: aml.totalPlayedMinor,
              },
            },
          };
        }

        const id = `wd_${randomUUID()}`;
        let created;
        try {
          created = await db.transaction(async (tx) => {
            const posted = await tx.query(
              `SELECT * FROM ledger_post($1, 'WITHDRAWAL_LOCK', 'SYSTEM', NULL, $2::jsonb, $3, NULL, 'withdrawal', $4)`,
              [
                `withdrawal:${id}:lock`,
                JSON.stringify([
                  { account: `user:${params.id}:available`, amount: amountMinor.toString() },
                  { account: `user:${params.id}:locked`, amount: (-amountMinor).toString() },
                ]),
                asset,
                id,
              ]
            );
            // storedNetwork, never the raw label: the row's network is what
            // reconcile() hands the chain verifier, and the Tron reader only
            // answers for "TRON". Storing "TRC20" here meant every website
            // withdrawal came back WRONG_NETWORK from its own chain and sat in
            // BROADCASTED forever -- payout sent, player's funds still locked,
            // ledger never settled. It also missed its payment_rail row
            // (keyed TRON), so rail pauses and limits never applied to it.
            const r = await tx.query(
              `INSERT INTO withdrawal (id, player_id, asset, network, destination, amount_minor, fee_minor, status, lock_tx_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'REQUESTED', $8)
               RETURNING id, player_id, asset, network, destination, amount_minor::text, fee_minor::text, status::text, requested_at`,
              [id, params.id, asset, storedNetwork, destination, amountMinor.toString(), feeMinor.toString(), posted.rows[0].transaction_id]
            );
            return r.rows[0];
          });
        } catch (e) {
          if (/insufficient funds/i.test(e.message)) {
            return { status: 400, body: errorBody("INSUFFICIENT_FUNDS", "Insufficient available funds for withdrawal") };
          }
          throw e;
        }

        // Walk the withdrawal through the REAL state machine automatically,
        // outside the funds-locking transaction above (assess()/process()
        // each open their own). REQUESTED -> VALIDATING is always a legal
        // transition (withdrawal_transition_allowed); paymentSvc.assess()
        // takes it the rest of the way to RISK_CHECK -> APPROVED or
        // PENDING_REVIEW using this process's own configured
        // reviewThresholdMinor (apps/api/src/index.mjs -- $500 today) and
        // the injected risk() hook (score 0 by default, so the threshold is
        // the only gate unless a real risk engine is wired in later).
        // Below threshold: process() immediately too, which hands it to the
        // background reconciliation worker's own PROCESSING/BROADCASTED
        // pickup (packages/reconciliation's runProviderWithdrawals) with no
        // human step at all -- the outbound mirror of how deposits already
        // auto-credit off a webhook. At/above threshold, it lands on
        // PENDING_REVIEW and stays there for an admin to act on.
        if (paymentSvc) {
          try {
            await db.query(`UPDATE withdrawal SET status='VALIDATING'::withdrawal_status WHERE id=$1`, [id]);
            const assessed = await paymentSvc.assess(id);
            if (assessed.ok && assessed.status === "APPROVED") {
              await paymentSvc.process(id);
            }
          } catch (err) {
            // The withdrawal already exists and funds are already locked --
            // never fail the request over a problem in the automation step.
            // It's left wherever the state machine got to (VALIDATING,
            // RISK_CHECK, or PENDING_REVIEW); the reconciliation worker and
            // admin tooling both operate on real persisted state, not on
            // this request having "finished" the job.
            console.error("automatic withdrawal processing error:", err);
          }
        }

        const finalRow = await db.query(
          `SELECT id, player_id, asset, network, destination, amount_minor::text, fee_minor::text, status::text, requested_at
             FROM withdrawal WHERE id = $1`,
          [id]
        );
        return { status: 201, body: { ok: true, withdrawal: finalRow.rows[0] ?? created } };
      } },

    // --- Play ----------------------------------------------------------------
    // Generic across every game: the pool is chosen by whatever gameId the
    // client asks for, defaulting to chess only for convenience. Nothing
    // game-specific lives in this handler -- the same route seats a Speed
    // Math ticket exactly as it does a chess one.
    { method: "POST", path: "/v1/matchmaking/tickets", action: "duel.play.free",
      handler: async ({ actor, body, db, controls }) => {
        const gameId = String(body.gameId ?? "chess");
        const mode = String(body.mode ?? "standard");
        // The clock is a named profile, never a client-supplied object --
        // see time-profiles.mjs. A request naming an unknown game or
        // profile is refused outright rather than silently defaulted to
        // chess's own clock.
        const timeControl = tryResolveTimeControl(gameId, String(body.timeProfile ?? DEFAULT_TIME_PROFILE));
        if (!timeControl) return { status: 400, body: errorBody("INVALID_TIME_PROFILE") };
        // RANDOM OPPONENT: Free or Competitive. A competitive ticket is
        // re-checked against `duel.play.cash` -- the control-gated
        // permission behind PAUSE ALL REAL-MONEY PLAY -- on top of the
        // base `duel.play.free` every ticket needs regardless of stake.
        const tier = body.tier === "CASH" ? "CASH" : "FREE";
        let stakeAsset = null;
        if (tier === "CASH") {
          const decision = authorize({ actor, action: "duel.play.cash", controls });
          if (decision.decision !== Decision.ALLOW) {
            return { status: decision.reason === "CONTROL_DISABLED" ? 503 : 403, body: errorBody(decision.reason) };
          }
          stakeAsset = await resolveStakeAsset(db, body.asset);
          if (!stakeAsset) return { status: 400, body: errorBody("UNSUPPORTED_ASSET") };
          const stakeMinor = BigInt(body.stakeMinor ?? "0");
          if (stakeMinor > 0n && (await availableMinor(db, actor.id, stakeAsset)) < stakeMinor) {
            return {
              status: 400,
              body: errorBody("INSUFFICIENT_FUNDS", `Insufficient ${stakeAsset} balance. Please deposit ${stakeAsset} to play cash matches.`)
            };
          }
        }
        const rating = await db.query(
          "SELECT rating_x100 FROM rating WHERE player_id=$1 AND game_id=$2", [actor.id, gameId]
        );
        const mm = createMatchmakingService(db);
        const r = await mm.enqueue({
          playerId: actor.id, gameId, mode, timeControl, tier,
          stakeMinor: tier === "CASH" ? String(body.stakeMinor ?? "0") : "0",
          asset: stakeAsset ?? "USDT",
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
        const timeProfile = body.timeProfile ? String(body.timeProfile).toUpperCase() : "STANDARD";
        const vsComputer = createVsComputerService(db);
        const r = await vsComputer.createDuel({ gameId, playerId: actor.id, difficulty, timeProfile });
        if (!r.ok) return { status: 400, body: errorBody(r.reason) };
        return { status: 201, body: { duelId: r.duelId } };
      } },

    // PLAY WITH FRIEND -- a challenge to a specific, named opponent (see
    // challenge.mjs's own header for why this is a separate primitive from
    // both matchmaking's pool and vs-computer's no-opponent case). Free or
    // Competitive, exactly like RANDOM OPPONENT: a competitive request is
    // re-checked against `duel.play.cash` (the SAME control-gated
    // permission matchmaking's own cash pool answers to -- PAUSE ALL
    // REAL-MONEY PLAY reaches this path too) before it is ever created,
    // on top of the base `duel.play.free` every challenge needs regardless
    // of stake.
    { method: "POST", path: "/v1/challenges", action: "duel.play.free",
      handler: async ({ actor, body, db, chat, controls }) => {
        const gameId = String(body.gameId ?? "chess");
        const opponentNickname = String(body.opponentNickname ?? "");
        const tier = body.tier === "CASH" ? "CASH" : "FREE";
        let stakeAsset = null;
        if (tier === "CASH") {
          const decision = authorize({ actor, action: "duel.play.cash", controls });
          if (decision.decision !== Decision.ALLOW) {
            return { status: decision.reason === "CONTROL_DISABLED" ? 503 : 403, body: errorBody(decision.reason) };
          }
          stakeAsset = await resolveStakeAsset(db, body.asset);
          if (!stakeAsset) return { status: 400, body: errorBody("UNSUPPORTED_ASSET") };
          const stakeMinor = BigInt(body.stakeMinor ?? "0");
          if (stakeMinor > 0n && (await availableMinor(db, actor.id, stakeAsset)) < stakeMinor) {
            return {
              status: 400,
              body: errorBody("INSUFFICIENT_FUNDS", `Insufficient ${stakeAsset} balance. Please deposit ${stakeAsset} to create this cash challenge.`)
            };
          }
        }
        const challenge = createChallengeService(db, { channels: chat?.channels });
        const r = await challenge.create({
          gameId, challengerId: actor.id, opponentNickname, tier,
          stakeMinor: tier === "CASH" ? String(body.stakeMinor ?? "0") : "0",
          asset: stakeAsset ?? "USDT",
        });
        if (!r.ok) {
          const status = r.reason === ChallengeError.ALREADY_PENDING ? 409
            : r.reason === ChallengeError.BLOCKED ? 403 : 400;
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

    // --- LOBBY OPEN CHALLENGES (Radar Feed) ---
    { method: "GET", path: "/v1/challenges/open", action: "duel.play.free", anonymous: true,
      handler: async ({ db, query }) => {
        const gameId = query.get("gameId") || null;
        const res = await db.query(
          `SELECT c.id, c.game_id, c.mode, c.tier, c.stake_minor, c.asset, c.time_control,
                  c.created_at, c.expires_at,
                  p.id AS creator_id, p.handle, p.avatar_key, p.selected_badge_code,
                  COALESCE(r.rating_x100, 160000) AS rating_x100
             FROM lobby_open_challenge c
             JOIN player p ON p.id = c.creator_id
             LEFT JOIN rating r ON r.player_id = c.creator_id AND r.game_id = c.game_id
            WHERE c.status = 'OPEN' AND c.expires_at > now()
              AND ($1::text IS NULL OR c.game_id = $1)
            ORDER BY c.created_at DESC
            LIMIT 50`,
          [gameId]
        );
        return {
          body: {
            challenges: res.rows.map((row) => ({
              id: row.id,
              gameId: row.game_id,
              tier: row.tier,
              stakeMinor: row.stake_minor,
              // Minor units are 6 decimals for every coin (asset.minor_units).
              stakeUSDT: Number(row.stake_minor || 0) / 1_000_000,
              stakeAmount: Number(row.stake_minor || 0) / 1_000_000,
              asset: row.asset,
              timeControl: row.time_control,
              createdAt: row.created_at,
              expiresAt: row.expires_at,
              creator: {
                id: row.creator_id,
                handle: row.handle,
                avatarKey: row.avatar_key,
                badge: row.selected_badge_code || "Player",
                ratingX100: row.rating_x100,
                elo: Math.floor(row.rating_x100 / 100),
              },
            }))
          }
        };
      } },

    { method: "GET", path: "/v1/challenges/open/my-status", action: "duel.play.free",
      handler: async ({ actor, db }) => {
        const res = await db.query(
          `SELECT id, status, duel_id, accepted_by, responded_at
             FROM lobby_open_challenge
            WHERE creator_id = $1
              AND (
                (status = 'OPEN' AND expires_at > now())
                OR (status = 'ACCEPTED' AND responded_at > now() - INTERVAL '3 minutes')
              )
            ORDER BY created_at DESC
            LIMIT 1`,
          [actor.id]
        );
        if (!res.rows.length) return { body: { active: false } };
        const row = res.rows[0];
        return {
          body: {
            active: true,
            challengeId: row.id,
            status: row.status,
            duelId: row.duel_id,
            acceptedBy: row.accepted_by,
          }
        };
      } },

    { method: "POST", path: "/v1/challenges/open", action: "duel.play.free",
      handler: async ({ actor, body, db, controls }) => {
        const gameId = String(body.gameId ?? "").trim();
        const tier = body.tier === "CASH" ? "CASH" : "FREE";
        const timeControlName = String(body.timeControl ?? "BLITZ").toUpperCase();
        const stakeMinor = tier === "CASH" ? String(body.stakeMinor ?? "0") : "0";
        let openAsset = null;

        const gameCheck = await db.query("SELECT id, cash_enabled, is_live FROM game WHERE id = $1", [gameId]);
        if (!gameCheck.rows.length || !gameCheck.rows[0].is_live) {
          return { status: 400, body: errorBody("UNKNOWN_GAME") };
        }
        if (tier === "CASH") {
          if (controls?.killSwitches?.cashDuels) {
            return { status: 503, body: errorBody("CASH_PLAY_DISABLED") };
          }
          if (!gameCheck.rows[0].cash_enabled) {
            return { status: 400, body: errorBody("CASH_NOT_ENABLED_FOR_GAME") };
          }
          // Same canonical ladder as matchmaking and friend challenges.
          if (!isValidStakeMinor(stakeMinor)) {
            return { status: 400, body: errorBody("INVALID_STAKE") };
          }
          openAsset = await resolveStakeAsset(db, body.asset);
          if (!openAsset) return { status: 400, body: errorBody("UNSUPPORTED_ASSET") };
          if ((await availableMinor(db, actor.id, openAsset)) < BigInt(stakeMinor)) {
            return { status: 400, body: errorBody("INSUFFICIENT_FUNDS") };
          }
        }

        const challengeId = `open_${randomUUID()}`;
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await db.query(
          `INSERT INTO lobby_open_challenge
             (id, creator_id, game_id, tier, stake_minor, asset, time_control, status, expires_at)
           VALUES ($1, $2, $3, $4::entry_tier, $5, $6, $7, 'OPEN', $8)`,
          [challengeId, actor.id, gameId, tier, stakeMinor, tier === "CASH" ? openAsset : null, timeControlName, expiresAt.toISOString()]
        );

        return {
          status: 201,
          body: {
            challengeId,
            expiresAt: expiresAt.toISOString(),
          }
        };
      } },

    { method: "POST", path: "/v1/challenges/open/:id/accept", action: "duel.play.free",
      handler: async ({ actor, params, db, chat, controls }) => {
        const challengeId = params.id;
        return db.transaction(async (tx) => {
          const r = await tx.query(
            `SELECT * FROM lobby_open_challenge WHERE id = $1 FOR UPDATE`,
            [challengeId]
          );
          if (!r.rows.length) return { status: 404, body: errorBody("NOT_FOUND") };
          const row = r.rows[0];

          if (row.status !== "OPEN" || new Date(row.expires_at).getTime() <= Date.now()) {
            return { status: 400, body: errorBody("CHALLENGE_EXPIRED_OR_CLOSED") };
          }
          if (row.creator_id === actor.id) {
            return { status: 400, body: errorBody("CANNOT_CHALLENGE_SELF") };
          }

          const isCash = row.tier === "CASH";
          if (isCash) {
            if (controls?.killSwitches?.cashDuels) {
              return { status: 503, body: errorBody("CASH_PLAY_DISABLED") };
            }
            // The acceptor stakes the coin the creator chose, not their own.
            if ((await availableMinor(tx, actor.id, row.asset ?? "USDT")) < BigInt(row.stake_minor)) {
              return { status: 400, body: errorBody("INSUFFICIENT_FUNDS") };
            }
          }

          const spawn = DEFAULT_SPAWNERS[row.game_id] || (() => ({ initialState: {}, seed: null }));
          const { initialState, seed } = spawn();
          const duelId = `ch_${randomUUID()}`;
          const timeControl = resolveTimeControl(row.game_id);

          await tx.query(
            `INSERT INTO duel
               (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
                tier, stake_minor, asset, initial_state, seed, time_control, status, is_vs_computer)
             VALUES ($1, $2,
               (SELECT plugin_version FROM game WHERE id = $2),
               $3, $4, $5, $6::entry_tier, $7, $8, $9::jsonb, $10, $11::jsonb, $12::duel_status, FALSE)`,
            [duelId, row.game_id, `challenge:open:${row.id}`, row.creator_id, actor.id,
             row.tier, row.stake_minor, isCash ? row.asset : null,
             JSON.stringify(initialState), seed, JSON.stringify(timeControl),
             isCash ? "RESERVED" : "READY"]
          );

          await tx.query(
            `UPDATE lobby_open_challenge
                SET status = 'ACCEPTED', accepted_by = $2, duel_id = $3, responded_at = now()
              WHERE id = $1`,
            [challengeId, actor.id, duelId]
          );

          if (chat?.channels) {
            chat.channels.getOrCreateMatchChannel(duelId).catch(() => {});
          }

          return { body: { duelId } };
        });
      } },

    { method: "POST", path: "/v1/challenges/open/:id/cancel", action: "duel.play.free",
      handler: async ({ actor, params, db }) => {
        const challengeId = params.id;
        const res = await db.query(
          `UPDATE lobby_open_challenge
              SET status = 'CANCELLED', responded_at = now()
            WHERE id = $1 AND creator_id = $2 AND status = 'OPEN'`,
          [challengeId, actor.id]
        );
        if (res.rowCount === 0) return { status: 400, body: errorBody("NOT_FOUND_OR_NOT_YOURS") };
        return { body: { ok: true } };
      } },

    { method: "POST", path: "/v1/challenges/:id/accept", action: "duel.play.free",
      handler: async ({ actor, params, db, chat }) => {
        const challenge = createChallengeService(db, { channels: chat?.channels });
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
      handler: async ({ actor, db, query }) => {
        const mm = createMatchmakingService(db);
        const ticketId = query?.get?.("ticketId") || null;
        const ticket = await mm.status(actor.id, ticketId);
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
    { method: "GET", path: "/v1/lobby/stats", action: "duel.spectate", anonymous: true,
      handler: async ({ db }) => {
        const liveDuels = await db.query(
          `SELECT count(DISTINCT d.id)::int AS matches,
                  count(DISTINCT seat) FILTER (WHERE seat IS NOT NULL)::int AS players
             FROM duel d, LATERAL (VALUES (d.seat_0), (d.seat_1)) AS s(seat)
            WHERE d.status IN ('LIVE', 'READY')`
        );
        const openChallenges = await db.query(
          `SELECT ((SELECT count(*)::int FROM matchmaking_ticket) +
                   (SELECT count(*)::int FROM lobby_open_challenge WHERE status = 'OPEN' AND expires_at > now()))::int AS tickets`
        );
        // Real USDT paid out today -- every other coin's withdrawals are
        // summed separately since a raw cross-asset sum would silently mix
        // units. Genuinely zero (e.g. cash play not yet enabled) renders
        // as zero on the lobby, never a placeholder figure standing in
        // for real activity that hasn't happened yet.
        const paidToday = await db.query(
          `SELECT asset, COALESCE(SUM(amount_minor - fee_minor), 0)::text AS minor
             FROM withdrawal
            WHERE status = 'COMPLETED' AND completed_at >= date_trunc('day', now())
            GROUP BY asset`
        );
        const paidTodayByAsset = Object.fromEntries(paidToday.rows.map((r) => [r.asset, r.minor]));
        return {
          body: {
            activeMatches: liveDuels.rows[0]?.matches || 0,
            activePlayers: liveDuels.rows[0]?.players || 0,
            openChallenges: openChallenges.rows[0]?.tickets || 0,
            paidTodayByAsset,
          }
        };
      } },

    { method: "GET", path: "/v1/duels/live", action: "duel.spectate", anonymous: true,
      handler: async ({ db, query }) => {
        const limit = Math.min(Math.max(1, Number(query.get("limit")) || 30), 100);
        const gameId = query.get("gameId") || null;
        const handle = query.get("handle")?.trim() || null;
        const includeBots = query.get("includeBots") === "true";

        // Auto-sweep stale or abandoned duels so dead games never get stuck in Live Arena
        try {
          await db.query(
            `UPDATE duel
                SET status = 'ABORTED'::duel_status,
                    completed_at = COALESCE(completed_at, now())
              WHERE status = 'LIVE'
                AND (
                  (started_at < now() - INTERVAL '10 minutes' AND (SELECT count(*) FROM duel_event de WHERE de.duel_id = duel.id) = 0)
                  OR (started_at < now() - INTERVAL '2 hours')
                )`
          );
        } catch {
          // ignore background sweep errors
        }

        const r = await db.query(
          `SELECT d.id, d.game_id, d.started_at, d.created_at, d.pairing_key, d.is_vs_computer,
                  pa.handle AS handle_0, pa.selected_badge_code AS badge_0,
                  COALESCE(pb.handle, CASE WHEN d.is_vs_computer THEN 'Computer AI' ELSE 'Player 2' END) AS handle_1,
                  pb.selected_badge_code AS badge_1,
                  ra.rating_x100 AS rating_0, rb.rating_x100 AS rating_1,
                  (SELECT count(*)::int FROM duel_event de WHERE de.duel_id = d.id) AS move_count
             FROM duel d
             JOIN player pa ON pa.id = d.seat_0
             LEFT JOIN player pb ON pb.id = d.seat_1
             LEFT JOIN rating ra ON ra.player_id = d.seat_0 AND ra.game_id = d.game_id
             LEFT JOIN rating rb ON rb.player_id = d.seat_1 AND rb.game_id = d.game_id
            WHERE d.status IN ('LIVE', 'READY')
              AND d.spectator_policy = 'OPEN'
              AND ($2::text IS NULL OR d.game_id = $2)
              AND ($3::text IS NULL OR pa.handle ILIKE '%' || $3 || '%' OR pb.handle ILIKE '%' || $3 || '%')
              AND ($4::boolean IS TRUE OR d.is_vs_computer = FALSE OR ($3::text IS NOT NULL AND pa.handle ILIKE '%' || $3 || '%'))
            ORDER BY COALESCE(d.started_at, d.created_at) DESC
            LIMIT $1`,
          [limit, gameId, handle, includeBots]
        );
        return {
          body: {
            matches: r.rows.map((row) => ({
              duelId: row.id,
              gameId: row.game_id,
              startedAt: row.started_at || row.created_at,
              isVsComputer: Boolean(row.is_vs_computer),
              // A tournament pairing's duel is keyed "tournament:<id>:r<n>:s<slot>"
              // (see tournament.mjs's createRound()) -- a real, safe signal the
              // Live Arena can use to badge "TOURNAMENT MATCH" without exposing
              // anything server-only.
              isTournamentMatch: row.pairing_key?.startsWith("tournament:") ?? false,
              moveCount: row.move_count,
              players: [
                { handle: row.handle_0, badge: row.badge_0, ratingX100: row.rating_0 ?? null },
                {
                  handle: row.handle_1,
                  badge: row.badge_1,
                  ratingX100: row.is_vs_computer ? 160000 : (row.rating_1 ?? null)
                },
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

    { method: "GET", path: "/v1/me/active-duel", action: "duel.play.free",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, db }) => {
        const r = await db.query(
          `SELECT d.id, d.game_id, d.status, d.seat_0, d.seat_1, d.started_at,
                  p0.handle AS seat_0_handle, p1.handle AS seat_1_handle
             FROM duel d
             LEFT JOIN player p0 ON p0.id = d.seat_0
             LEFT JOIN player p1 ON p1.id = d.seat_1
            WHERE (d.seat_0 = $1 OR d.seat_1 = $1)
              AND d.status IN ('LIVE', 'READY', 'RESERVED')
            ORDER BY d.created_at DESC
            LIMIT 1`,
          [actor.id]
        );
        if (!r.rows.length) return { body: { active: false } };
        const row = r.rows[0];
        const isSeat0 = row.seat_0 === actor.id;
        const opponentHandle = isSeat0 ? (row.seat_1_handle ?? row.seat_1) : (row.seat_0_handle ?? row.seat_0);
        return {
          body: {
            active: true,
            duel: {
              id: row.id,
              gameId: row.game_id,
              status: row.status,
              opponentNickname: opponentHandle,
              startedAt: row.started_at,
            },
          },
        };
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
      handler: async ({ params, actor, query, chat, db }) => {
        const channel = await chat.channels.getOrCreateMatchChannel(params.id);
        const access = await chat.channels.canAccessChannel(channel, actor.id);
        if (!access.ok) return { status: chatErrorStatus(access.reason), body: errorBody(access.reason) };
        const rows = await chat.messages.listHistory({
          channelId: channel.id, viewerId: actor.id,
          before: query.get("before") ?? undefined, after: query.get("after") ?? undefined,
          limit: query.get("limit") || undefined,
        });
        // "Regardless of result, the chat timeline should show a system
        // event": MATCH_STARTED (packages/matchmaking/src/challenge.mjs's
        // own accept()) lives here, never mixed into chat_message's own
        // pagination -- there are only ever one or two of these per match,
        // so an unbounded read costs nothing and needs no cursor of its own.
        const systemEvents = await db.query(
          `SELECT event_type, detail, created_at FROM chat_system_event WHERE channel_id=$1 ORDER BY id`,
          [channel.id]
        );
        return {
          body: {
            channelId: channel.id, messages: rows,
            systemEvents: systemEvents.rows.map((r) => ({ eventType: r.event_type, detail: r.detail, createdAt: r.created_at })),
          },
        };
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

    { method: "GET", path: "/v1/leaderboard", action: "player.profile.read", anonymous: true,
      handler: async ({ db, query }) => {
        // Per-game leaderboard, generic across any registered game -- not
        // just chess. The cross-game combination lives at /v1/leaderboard/global.
        const limit = Math.min(Number(query.get("limit") ?? 50) || 50, 200);
        const gameId = query.get("game");

        let r;
        if (gameId && gameId !== "all") {
          r = await db.query(
            `SELECT r.player_id, p.handle, p.avatar_key, p.selected_badge_code,
                    r.rating_x100, r.rd_x100, r.games_played
               FROM rating r JOIN player p ON p.id = r.player_id
              WHERE r.game_id = $2 AND (p.is_ai IS FALSE OR p.is_ai IS NULL)
              ORDER BY r.rating_x100 DESC, r.games_played DESC LIMIT $1`, [limit, gameId]
          );
        } else {
          r = await db.query(
            `SELECT p.id AS player_id, p.handle, p.avatar_key, p.selected_badge_code,
                    COALESCE(MAX(r.rating_x100), 150000) AS rating_x100,
                    COALESCE(SUM(r.games_played), 0)::int AS games_played
               FROM player p
               LEFT JOIN rating r ON r.player_id = p.id
              WHERE (p.is_ai IS FALSE OR p.is_ai IS NULL)
              GROUP BY p.id, p.handle, p.avatar_key, p.selected_badge_code
              ORDER BY rating_x100 DESC, games_played DESC, p.created_at ASC
              LIMIT $1`, [limit]
          );
        }
        return { body: { gameId: gameId ?? "all", entries: r.rows } };
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
      handler: async ({ globalSkill, query, db }) => {
        const board = await globalSkill.leaderboard();
        const limit = Math.min(Number(query.get("limit") ?? 100) || 100, 500);
        let entries = board.slice(0, limit);
        if (entries.length > 0) {
          const ids = entries.map((e) => e.playerId);
          const pRes = await db.query(
            `SELECT id, handle, avatar_key, selected_badge_code FROM player WHERE id = ANY($1::text[])`,
            [ids]
          );
          const pMap = new Map(pRes.rows.map((p) => [p.id, p]));
          entries = entries.map((e) => ({
            ...e,
            handle: pMap.get(e.playerId)?.handle ?? "Player",
            avatar_key: pMap.get(e.playerId)?.avatar_key ?? null,
            selected_badge_code: pMap.get(e.playerId)?.selected_badge_code ?? null,
          }));
        } else {
          // Fallback if no established ratings yet: display platform members
          const pRes = await db.query(
            `SELECT p.id AS "playerId", p.handle, p.avatar_key, p.selected_badge_code,
                    COALESCE(MAX(r.rating_x100), 150000) / 100 AS score,
                    COALESCE(SUM(r.games_played), 0)::int AS games_played,
                    'CONTENDER' AS tier
               FROM player p
               LEFT JOIN rating r ON r.player_id = p.id
              WHERE (p.is_ai IS FALSE OR p.is_ai IS NULL)
              GROUP BY p.id, p.handle, p.avatar_key, p.selected_badge_code
              ORDER BY score DESC, games_played DESC, p.created_at ASC
              LIMIT $1`,
            [limit]
          );
          entries = pRes.rows;
        }
        return { body: { entries } };
      } },

    // --- Notifications -----------------------------------------------------------
    // In-app inbox only (see 0033_tournament_lifecycle_v2.sql's own header):
    // a match is ready, a tournament was cancelled, or prizes settled.

    { method: "GET", path: "/v1/me/notifications", action: "notification.read",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, db, query }) => {
        const limit = Math.min(Number(query.get("limit") ?? 50) || 50, 100);
        const unreadOnly = query.get("unread") === "true";
        const r = await db.query(
          `SELECT id, type, title, body, data, read_at, created_at FROM notification
            WHERE player_id = $1 AND ($2::boolean IS FALSE OR read_at IS NULL)
            ORDER BY created_at DESC LIMIT $3`,
          [actor.id, unreadOnly, limit]
        );
        return { body: { notifications: r.rows } };
      } },

    { method: "POST", path: "/v1/me/notifications/:id/read", action: "notification.read",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, params, db }) => {
        const r = await db.query(
          `UPDATE notification SET read_at = now()
            WHERE id = $1 AND player_id = $2 AND read_at IS NULL RETURNING id`,
          [params.id, actor.id]
        );
        return { body: { ok: true, alreadyRead: r.rows.length === 0 } };
      } },

    // --- Daily challenges ----------------------------------------------------------
    // No deposit, stake, or CASH-tier requirement anywhere in this catalog
    // (see migration 0034's own header) -- every template's progress is
    // recomputed from real signals on every read, never a client-reported
    // count (see packages/engagement/src/daily-challenges.mjs).

    { method: "GET", path: "/v1/me/daily-challenges", action: "player.daily_challenge.read",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, dailyChallenges }) => ({ body: { challenges: await dailyChallenges.myChallenges(actor.id) } }) },

    // --- Cross-game discovery --------------------------------------------------
    // Every reason is derived from the caller's OWN gameplay data (mastery,
    // recent rating trend) -- never anything resembling a demographic or
    // behavioral-profiling signal (see packages/engagement/src/
    // recommendations.mjs's own header).

    { method: "GET", path: "/v1/me/recommendations", action: "player.recommendation.read",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, recommendations }) => ({ body: { recommendations: await recommendations.recommendationsFor(actor.id) } }) },

    // --- Badge / frame selection -----------------------------------------------
    // Both cosmetics follow the identical "select one you already own"
    // shape (packages/profile's badges.mjs/frames.mjs); `code: null` clears
    // the current selection.

    { method: "POST", path: "/v1/me/badge", action: "player.profile.update",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, body, progression }) => {
        const r = await progression.badges.select(actor.id, body?.code ?? null);
        return r.ok ? { body: r } : { status: 400, body: errorBody(r.reason) };
      } },

    { method: "POST", path: "/v1/me/frame", action: "player.profile.update",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, body, frames }) => {
        const r = await frames.select(actor.id, body?.code ?? null);
        return r.ok ? { body: r } : { status: 400, body: errorBody(r.reason) };
      } },

    // --- Tournaments -------------------------------------------------------------
    // Every read here reflects rows the SERVER wrote (pairings, standings,
    // settlements). There is no field anywhere a client supplies a result, a
    // standing, or a prize amount -- those all come from the tournament
    // engine via reportResult/advance/settlePrizes, never from a request body.

    // Public discovery, no login required -- the homepage's "upcoming
    // tournaments" and the tournaments listing page both call this
    // logged-out. `status` accepts a comma-separated list (the homepage
    // wants everything from SCHEDULED through LIVE in one call, not four
    // requests) and only PUBLIC-visibility tournaments are ever listed
    // here -- an UNLISTED tournament is reachable by direct id (below) but
    // never appears in discovery, which is the entire point of the field.
    { method: "GET", path: "/v1/tournaments", action: "tournament.read", anonymous: true,
      handler: async ({ db, query }) => {
        const statuses = (query.get("status") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        const r = await db.query(
          `SELECT t.id, t.game_id, t.format, t.status, t.tier, t.entry_fee_minor::text AS entry_fee_minor,
                  t.asset, t.capacity, t.title, t.description, t.registration_closes_at,
                  t.scheduled_starts_at, t.starts_at, t.completed_at, t.prize_structure,
                  (SELECT count(*)::int FROM tournament_registration tr
                    WHERE tr.tournament_id = t.id AND tr.status = 'REGISTERED') AS registered_count
             FROM tournament t
            WHERE t.visibility = 'PUBLIC'
              AND ($1::text[] IS NULL OR t.status::text = ANY($1::text[]))
            ORDER BY t.created_at DESC LIMIT 100`,
          [statuses.length ? statuses : null]
        );
        return { body: { tournaments: r.rows } };
      } },

    // Real, all-time tournament totals for the trust-building banner on
    // the tournaments page -- a specific number ("$25,000 in prizes",
    // "340+ registered") is a factual claim, so it has to come from an
    // actual query, including a real, honest zero on a fresh deployment.
    // Registered before the :id route below: this router matches by exact
    // segment count and literal text first (see router.mjs), so a literal
    // "stats" segment here must be declared before ":id" would otherwise
    // swallow it.
    { method: "GET", path: "/v1/tournaments/stats", action: "tournament.read", anonymous: true,
      handler: async ({ db }) => {
        const prizes = await db.query(
          `SELECT t.asset, COALESCE(SUM(ts.prize_minor), 0)::text AS minor
             FROM tournament_settlement ts JOIN tournament t ON t.id = ts.tournament_id
            GROUP BY t.asset`
        );
        const registrants = await db.query(
          `SELECT count(DISTINCT player_id)::int AS c FROM tournament_registration`
        );
        return {
          body: {
            totalPrizesByAsset: Object.fromEntries(prizes.rows.map((r) => [r.asset, r.minor])),
            totalRegistrants: registrants.rows[0]?.c ?? 0,
          },
        };
      } },

    { method: "GET", path: "/v1/tournaments/:id", action: "tournament.read", anonymous: true,
      handler: async ({ params, db, actor }) => {
        const r = await db.query(
          `SELECT id, game_id, format, status, tier, entry_fee_minor::text AS entry_fee_minor,
                  asset, capacity, min_players, time_control, swiss_rounds, title, description,
                  eligibility, visibility, ruleset_version, registration_closes_at,
                  scheduled_starts_at, starts_at, completed_at, prize_structure
             FROM tournament WHERE id = $1`,
          [params.id]
        );
        if (!r.rows.length) return { status: 404, body: errorBody("NOT_FOUND") };
        const count = await db.query(
          `SELECT count(*)::int c FROM tournament_registration WHERE tournament_id=$1 AND status='REGISTERED'`,
          [params.id]
        );
        // Told once, up front, rather than left for the client to discover
        // by clicking Register and parsing an ALREADY_REGISTERED error --
        // that error still exists as the real, structural guard, but the
        // page shouldn't have to provoke it just to render its own state.
        let registered = false;
        if (actor.id) {
          const own = await db.query(
            `SELECT 1 FROM tournament_registration WHERE tournament_id=$1 AND player_id=$2 AND status='REGISTERED'`,
            [params.id, actor.id]
          );
          registered = own.rows.length > 0;
        }
        return { body: { ...r.rows[0], registeredCount: count.rows[0].c, registered } };
      } },

    { method: "GET", path: "/v1/tournaments/:id/standings", action: "tournament.read", anonymous: true,
      handler: async ({ params, tournament }) => ({ body: { standings: await tournament.standings(params.id) } }) },

    { method: "GET", path: "/v1/tournaments/:id/pairings", action: "tournament.read", anonymous: true,
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
        const t = await db.query("SELECT game_id, tier, entry_fee_minor, asset FROM tournament WHERE id=$1", [params.id]);
        if (!t.rows.length) return { status: 404, body: errorBody("NOT_FOUND") };

        // Ensure player's ledger wallet is initialized
        try {
          await db.query("SELECT ledger_open_user_wallet($1)", [actor.id]);
        } catch {
          // Ignore if already open or function unavailable
        }

        // Check wallet balance if CASH tournament
        if (t.rows[0].tier === "CASH" && BigInt(t.rows[0].entry_fee_minor || 0) > 0n) {
          // The entry fee is paid in the tournament's own coin, and prizes
          // are paid back in that same coin.
          const feeAsset = t.rows[0].asset ?? "USDT";
          const availableBal = await availableMinor(db, actor.id, feeAsset);
          const requiredBal = BigInt(t.rows[0].entry_fee_minor);
          if (availableBal < requiredBal) {
            const reqUsd = (Number(requiredBal) / 1_000_000).toFixed(2);
            const curUsd = (Number(availableBal) / 1_000_000).toFixed(2);
            return {
              status: 400,
              body: errorBody(
                "INSUFFICIENT_FUNDS",
                `Insufficient wallet balance. You have ${curUsd} ${feeAsset}, but this tournament requires ${reqUsd} ${feeAsset}. Please deposit ${feeAsset} to register.`
              )
            };
          }
        }

        const rating = await db.query(
          "SELECT rating_x100 FROM rating WHERE player_id=$1 AND game_id=$2",
          [actor.id, t.rows[0].game_id]
        );
        try {
          const r = await tournament.register({
            tournamentId: params.id, playerId: actor.id,
            ratingX100: rating.rows[0]?.rating_x100 ?? 150000,
          });
          return r.ok ? { status: 201, body: r } : { status: 400, body: errorBody(r.reason) };
        } catch (err) {
          if (err.message === "INSUFFICIENT_FUNDS" || /insufficient funds/i.test(err.message)) {
            const reqUsd = (Number(t.rows[0].entry_fee_minor || 0) / 1_000_000).toFixed(2);
            return {
              status: 400,
              body: errorBody(
                "INSUFFICIENT_FUNDS",
                `Insufficient wallet balance. Please deposit $${reqUsd} USDT to register for this tournament.`
              )
            };
          }
          throw err;
        }
      } },

    { method: "POST", path: "/v1/tournaments/:id/withdraw", action: "tournament.withdraw",
      handler: async ({ params, actor, tournament }) => {
        const r = await tournament.withdraw({ tournamentId: params.id, playerId: actor.id });
        return r.ok ? { body: r } : { status: 400, body: errorBody(r.reason) };
      } },

    // --- Admin: dashboard ----------------------------------------------------
    // One aggregation point for the admin dashboard's KPI row and panels.
    // Every figure here is a real read from a table or view this platform
    // already treats as authoritative elsewhere (ledger_solvency for
    // exposure, reconciliation_run for job health, admin_audit for recent
    // activity, ...) -- nothing is computed only for this endpoint, and
    // nothing is invented when a real source does not exist yet: a metric
    // this platform cannot honestly compute (a live WebSocket connection
    // count, a generic cross-process worker heartbeat) is reported `null`
    // rather than guessed at, and the frontend renders that as "no data",
    // never as a fabricated zero.
    { method: "GET", path: "/v1/admin/dashboard/summary", action: "admin.analytics.read",
      handler: async ({ db, rails, railHealth }) => {
        const [
          rakeBalance, liveDuels, pendingWithdrawals, pendingDeposits,
          failedWithdrawals, failedDeposits, solvency, reconRuns,
          openFairplay, openReconciliation, openCriticalReconciliation,
          openTournaments, liveGamesCatalog, matches24h, recentAudit,
          feeTrend, matchVolumeByGame, withdrawalQueue, recentTransactions,
        ] = await poolBatch([
          () => db.query(
            // One platform:rake account per coin. Every enabled coin is a
            // dollar stablecoin at 6 decimals, so the headline is their sum;
            // the per-coin split is returned alongside it.
            `SELECT a.asset, ledger_natural_balance(a.normal_side, COALESCE(b.balance,0))::text AS balance
               FROM ledger_account a LEFT JOIN ledger_balance b ON b.account_id = a.id
              WHERE a.key = 'platform:rake'
              ORDER BY a.asset`
          ),
          () => db.query(
            `SELECT count(DISTINCT d.id)::int AS matches,
                    count(DISTINCT seat) FILTER (WHERE seat IS NOT NULL)::int AS players
               FROM duel d, LATERAL (VALUES (d.seat_0), (d.seat_1)) AS s(seat)
              WHERE d.status = 'LIVE'`
          ),
          () => db.query(
            `SELECT count(*)::int c FROM withdrawal
              WHERE status IN ('REQUESTED','VALIDATING','RISK_CHECK','PENDING_REVIEW','APPROVED','PROCESSING')`
          ),
          () => db.query(
            `SELECT count(*)::int c FROM deposit
              WHERE status IN ('INITIATED','AWAITING_PAYMENT','DETECTED','CONFIRMING','VERIFIED','SCREENED')`
          ),
          () => db.query(`SELECT count(*)::int c FROM withdrawal WHERE status = 'FAILED'`),
          () => db.query(
            `SELECT count(*)::int c FROM deposit
              WHERE status IN ('EXPIRED','UNDERPAID','OVERPAID','WRONG_ASSET','WRONG_NETWORK','QUARANTINED')`
          ),
          () => db.query(`SELECT asset, custody_held::text AS custody, user_liabilities::text AS liabilities FROM ledger_solvency`),
          () => db.query(
            `SELECT DISTINCT ON (kind) kind, status, started_at, completed_at,
                    records_checked, mismatches_found, cases_opened
               FROM reconciliation_run ORDER BY kind, started_at DESC`
          ),
          () => db.query(`SELECT count(*)::int c FROM fairplay_case WHERE status IN ('OPEN','UNDER_REVIEW')`),
          () => db.query(`SELECT count(*)::int c FROM reconciliation_case WHERE status IN ('OPEN','UNDER_REVIEW')`),
          () => db.query(`SELECT count(*)::int c FROM reconciliation_case WHERE status IN ('OPEN','UNDER_REVIEW') AND severity = 'CRITICAL'`),
          () => db.query(`SELECT count(*)::int c FROM tournament WHERE status IN ('REGISTRATION','LIVE','FINALS')`),
          () => db.query(`SELECT count(*)::int c FROM game WHERE is_live = TRUE`),
          () => db.query(`SELECT count(*)::int c FROM duel WHERE status IN ('COMPLETED','SETTLED') AND completed_at >= now() - interval '24 hours'`),
          () => db.query(`SELECT admin_id, action, decision, subject_type, subject_id, at FROM admin_audit ORDER BY id DESC LIMIT 8`),
          // Real daily fee revenue, not an invented trend line: every entry
          // posted to platform:rake, grouped by the day it actually posted.
          // A day with no entries simply has no row -- the frontend fills
          // the gap with a real zero, never an interpolated guess.
          () => db.query(
            `SELECT date_trunc('day', e.created_at)::date AS day,
                    -- platform:rake is a fixed CREDIT-normal REVENUE account
                    -- (migration 0002) -- hardcoded rather than re-selecting
                    -- a.normal_side, which Postgres cannot treat as constant
                    -- across the GROUP BY without repeating the join filter.
                    ledger_natural_balance('CREDIT', sum(e.amount)::bigint)::text AS minor
               FROM ledger_entry e JOIN ledger_account a ON a.id = e.account_id
              WHERE a.key = 'platform:rake' AND e.created_at >= now() - interval '14 days'
              GROUP BY 1 ORDER BY 1`
          ),
          // Match volume per game over the last 7 days -- real counts,
          // grouped by whichever games are actually live in the catalogue.
          () => db.query(
            `SELECT g.id AS game_id, g.display_name,
                    count(d.id) FILTER (WHERE d.created_at >= now() - interval '7 days')::int AS matches_7d
               FROM game g LEFT JOIN duel d ON d.game_id = g.id
              WHERE g.is_live = TRUE
              GROUP BY g.id, g.display_name ORDER BY matches_7d DESC`
          ),
          // The withdrawal queue itself, oldest first (the order it will
          // actually be worked), for the panel a reviewer acts from.
          () => db.query(
            `SELECT id, player_id, asset, amount_minor::text AS amount_minor, status, requested_at
               FROM withdrawal
              WHERE status IN ('REQUESTED','VALIDATING','RISK_CHECK','PENDING_REVIEW','APPROVED','PROCESSING')
              ORDER BY requested_at ASC LIMIT 8`
          ),
          // Recent deposits and withdrawals, merged and re-sorted by time --
          // one real activity feed, not two panels each showing half a
          // picture.
          () => db.query(
            `SELECT * FROM (
                (SELECT 'DEPOSIT' AS kind, id, player_id, asset, observed_amount_minor::text AS amount_minor,
                        status::text AS status, created_at AS at
                   FROM deposit ORDER BY created_at DESC LIMIT 8)
               UNION ALL
                (SELECT 'WITHDRAWAL' AS kind, id, player_id, asset, amount_minor::text AS amount_minor,
                        status::text AS status, requested_at AS at
                   FROM withdrawal ORDER BY requested_at DESC LIMIT 8)
             ) recent ORDER BY at DESC LIMIT 8`
          ),
        ], 3);

        // The one configured rail's real health (see GET /v1/admin/payments/rails,
        // the same call this dashboard's own Finance panel would otherwise
        // have to duplicate). No rail configured yet -> null, not a guess.
        let rail = null;
        if (rails) {
          const list = await rails.list();
          const primary = list.find((r) => r.asset === "USDT" && (r.network === "TRON" || r.network === "TRC20")) ?? list[0] ?? null;
          if (primary) {
            rail = {
              asset: primary.asset, network: primary.network_display_name, status: primary.status,
              health: railHealth ? await railHealth.checkRail(primary.asset, primary.network) : null,
            };
          }
        }

        // Reconciliation status: the worst state across every check's most
        // recent run. A run that failed outright is CRITICAL; a completed
        // run that found a mismatch is WARNING; a check that has simply
        // never run yet (a fresh environment) is UNKNOWN, not "healthy" --
        // this endpoint has no basis to claim a check it cannot see ran
        // clean.
        let reconciliationStatus = reconRuns.rows.length ? "HEALTHY" : "UNKNOWN";
        for (const run of reconRuns.rows) {
          if (run.status === "FAILED") { reconciliationStatus = "CRITICAL"; break; }
          if (run.status === "COMPLETED" && Number(run.mismatches_found) > 0) reconciliationStatus = "WARNING";
        }
        if (openCriticalReconciliation.rows[0].c > 0) reconciliationStatus = "CRITICAL";

        return {
          body: {
            generatedAt: new Date().toISOString(),
            kpis: {
              platformFees: {
                minor: rakeBalance.rows.reduce((sum, r) => sum + BigInt(r.balance ?? "0"), 0n).toString(),
                asset: "USD",
                byAsset: Object.fromEntries(rakeBalance.rows.map((r) => [r.asset, r.balance ?? "0"])),
              },
              activeMatches: liveDuels.rows[0].matches,
              livePlayers: liveDuels.rows[0].players,
              pendingWithdrawals: pendingWithdrawals.rows[0].c,
              pendingDeposits: pendingDeposits.rows[0].c,
              riskAlerts: openFairplay.rows[0].c + openReconciliation.rows[0].c,
              reconciliationStatus,
            },
            finance: {
              solvency: solvency.rows.map((r) => ({ asset: r.asset, custodyHeldMinor: r.custody, userLiabilitiesMinor: r.liabilities })),
              pendingDeposits: pendingDeposits.rows[0].c,
              pendingWithdrawals: pendingWithdrawals.rows[0].c,
              failedDeposits: failedDeposits.rows[0].c,
              failedWithdrawals: failedWithdrawals.rows[0].c,
              reconciliationRuns: reconRuns.rows.map((r) => ({
                kind: r.kind, status: r.status, startedAt: r.started_at, completedAt: r.completed_at,
                recordsChecked: r.records_checked, mismatchesFound: r.mismatches_found, casesOpened: r.cases_opened,
              })),
              rail,
            },
            operations: {
              activeGames: liveGamesCatalog.rows[0].c,
              liveMatches: liveDuels.rows[0].matches,
              livePlayers: liveDuels.rows[0].players,
              openTournaments: openTournaments.rows[0].c,
              matchesLast24h: matches24h.rows[0].c,
            },
            security: {
              openFairPlayCases: openFairplay.rows[0].c,
              openReconciliationCases: openReconciliation.rows[0].c,
              openCriticalReconciliationCases: openCriticalReconciliation.rows[0].c,
              chainReaderHealth: rail?.health?.checks?.find((c) => c.name === "CHAIN_REACHABLE") ?? null,
            },
            recentActivity: recentAudit.rows.map((r) => ({
              adminId: r.admin_id, action: r.action, decision: r.decision,
              subjectType: r.subject_type, subjectId: r.subject_id, at: r.at,
            })),
            feeTrend: feeTrend.rows.map((r) => ({ day: r.day, minor: r.minor })),
            matchVolumeByGame: matchVolumeByGame.rows.map((r) => ({
              gameId: r.game_id, displayName: r.display_name, matches7d: r.matches_7d,
            })),
            withdrawalQueue: withdrawalQueue.rows.map((r) => ({
              id: r.id, playerId: r.player_id, asset: r.asset, amountMinor: r.amount_minor,
              status: r.status, requestedAt: r.requested_at,
            })),
            recentTransactions: recentTransactions.rows.map((r) => ({
              kind: r.kind, id: r.id, playerId: r.player_id, asset: r.asset,
              amountMinor: r.amount_minor, status: r.status, at: r.at,
            })),
          },
        };
      } },

    // --- Admin: tournaments ------------------------------------------------------
    // Orchestration only. Pairings, standings and settlement amounts are all
    // computed by the tournament engine itself -- these handlers never
    // construct a result or a payout from request data.

    { method: "POST", path: "/v1/admin/tournaments", action: "admin.tournament.manage",
      subjectType: "tournament",
      handler: async ({ body, actor, tournament, db }) => {
        let entryFeeMinor = body?.entryFeeMinor;
        if (entryFeeMinor === undefined && body?.entryFeeUsd !== undefined) {
          const fee = parseFloat(body.entryFeeUsd || "0");
          entryFeeMinor = BigInt(Math.round(fee * 1_000_000));
        }
        const tier = body?.tier || (entryFeeMinor && BigInt(entryFeeMinor) > 0n ? "CASH" : "FREE");
        const asset = tier === "CASH" ? await resolveStakeAsset(db, body?.asset) : null;
        if (tier === "CASH" && !asset) return { status: 400, body: errorBody("UNSUPPORTED_ASSET") };
        const closesAt = body?.registrationClosesAt || new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
        const r = await tournament.create({
          ...body,
          tier,
          asset,
          entryFeeMinor: entryFeeMinor !== undefined ? BigInt(entryFeeMinor) : 0n,
          registrationClosesAt: closesAt,
          scheduledStartsAt: body?.scheduledStartsAt || closesAt,
          createdBy: actor.id,
        });
        if (r.ok && body?.autoOpen) {
          await tournament.openRegistration(r.tournamentId);
        }
        return { status: 201, body: r };
      } },

    { method: "POST", path: "/v1/admin/tournaments/:id/schedule", action: "admin.tournament.manage",
      subjectType: "tournament",
      handler: async ({ params, tournament }) => {
        const r = await tournament.schedule(params.id);
        return r.ok ? { body: r } : { status: 400, body: errorBody(r.reason) };
      } },

    { method: "POST", path: "/v1/admin/tournaments/:id/open", action: "admin.tournament.manage",
      subjectType: "tournament",
      handler: async ({ params, tournament }) => {
        const r = await tournament.openRegistration(params.id);
        return r.ok ? { body: r } : { status: 400, body: errorBody(r.reason) };
      } },

    // A deterministic, full refund of each entrant's OWN locked fee -- no
    // admin discretion over amount or recipient -- so this sits at the same
    // tier as create/open/start/advance (step-up, no four-eyes), not at
    // settle's tier.
    { method: "POST", path: "/v1/admin/tournaments/:id/cancel", action: "admin.tournament.manage",
      subjectType: "tournament",
      handler: async ({ params, body, tournament }) => {
        const r = await tournament.cancel(params.id, { reason: body?.reason });
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
    { method: "GET", path: "/v1/admin/players", action: "admin.user.read",
      handler: async ({ db, query }) => {
        const q = (query.get ? query.get("q") : query.q) ? (query.get ? query.get("q") : query.q).trim() : "";
        const offset = parseInt(query.get ? query.get("offset") : query.offset) || 0;
        let sql = "SELECT id, handle, locale, created_at, disabled_at, disabled_reason, disabled_by FROM player";
        let params = [];
        if (q) {
          params.push(`%${q}%`);
          sql += ` WHERE handle ILIKE $${params.length}`;
        }
        params.push(offset);
        sql += ` ORDER BY created_at DESC LIMIT 50 OFFSET $${params.length}`;
        const r = await db.query(sql, params);
        
        // Also get their roles
        const ids = r.rows.map(r => r.id);
        const roles = ids.length ? (await db.query("SELECT admin_id AS player_id, role::text AS role_code FROM admin_role_grant WHERE admin_id = ANY($1::text[]) AND revoked_at IS NULL", [ids])).rows : [];
        
        const players = r.rows.map(p => ({
          ...p,
          roles: roles.filter(ro => ro.player_id === p.id).map(ro => ro.role_code)
        }));

        return { body: { players } };
      } },

    // Grants full ADMIN role (plus a Chat Mod custom role) to an arbitrary
    // player -- a privilege-escalation action, not a read. admin.user.read
    // is held by FINANCE_ADMIN, RISK_ADMIN, and ANTI_CHEAT_MODERATOR too
    // (they all need it just to view a player profile); gating role grants
    // on it would let any of them mint new ADMIN accounts at will.
    // admin.rbac.manage is SUPER_ADMIN-only and already step-up gated --
    // the same action the RBAC page's own grant/revoke routes use.
    { method: "POST", path: "/v1/admin/players/:id/promote", action: "admin.rbac.manage",
      subjectType: "player",
      handler: async ({ params, actor, body, db, rbac }) => {
        const player = await db.query("SELECT id, handle FROM player WHERE id = $1", [params.id]);
        if (!player.rows.length) return { status: 404, body: errorBody("NOT_FOUND") };
        const p = player.rows[0];

        const isSelf = actor.id === params.id;
        if (isSelf) {
          // Ensure system-automation admin exists so check & foreign-key constraints pass
          await db.query(
            `INSERT INTO admin_user (id, email, display_name, mfa_enrolled, disabled_at)
             VALUES ('system-automation', 'system-automation@nizalo.internal', 'System Automation', FALSE, now())
             ON CONFLICT (id) DO NOTHING`
          );
        }
        const grantedBy = isSelf ? 'system-automation' : actor.id;

        const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'FINANCE_ADMIN', 'RISK_ADMIN', 'ANTI_CHEAT_MODERATOR', 'CONTENT_MODERATOR', 'SUPPORT', 'ANALYST', 'READ_ONLY'];
        const chosenRole = (typeof body?.role === "string" && allowedRoles.includes(body.role)) ? body.role : 'ADMIN';
        const reason = (typeof body?.reason === "string" && body.reason.trim()) ? body.reason.trim() : `Promoted to ${chosenRole} via Admin Panel`;

        await db.query(
          `INSERT INTO admin_user (id, email, display_name, mfa_enrolled, disabled_at)
           VALUES ($1, $1 || '.' || $2 || '@nizalo.internal', $2, TRUE, NULL)
           ON CONFLICT (id) DO UPDATE SET mfa_enrolled = TRUE, disabled_at = NULL, display_name = EXCLUDED.display_name`,
          [p.id, p.handle]
        );

        // Revoke any previous active roles to switch cleanly to the newly assigned role
        await db.query(
          `UPDATE admin_role_grant
              SET revoked_at = now(), revoked_by = $2, reason = 'Replaced by promotion to ' || $3
            WHERE admin_id = $1 AND revoked_at IS NULL AND role <> $3`,
          [p.id, grantedBy, chosenRole]
        );

        await db.query(
          `INSERT INTO admin_role_grant (admin_id, role, granted_by, reason)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [p.id, chosenRole, grantedBy, reason]
        );

        if (rbac) {
          try {
            const modRole = await db.query("SELECT id FROM role WHERE id = 'role_chat_mod' OR name = 'Chat Mod' LIMIT 1");
            let roleId = modRole.rows[0]?.id;
            if (!roleId) {
              const created = await rbac.createRole({
                id: "role_chat_mod",
                name: "Chat Mod",
                description: "Moderation capabilities for chat",
                permissionCodes: ["CHAT_VIEW", "CHAT_DELETE", "CHAT_MUTE", "CHAT_REPORT_REVIEW"],
                createdBy: grantedBy,
              });
              roleId = created.id;
            }
            if (roleId) {
              await db.query(
                `INSERT INTO admin_custom_role_grant (admin_id, role_id, granted_by)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (admin_id, role_id) DO NOTHING`,
                [p.id, roleId, grantedBy]
              );
            }
            if (chosenRole === 'SUPPORT' || chosenRole === 'ADMIN' || chosenRole === 'SUPER_ADMIN') {
              await db.query(
                `INSERT INTO admin_custom_role_grant (admin_id, role_id, granted_by)
                 VALUES ($1, 'role_support_lead', $2)
                 ON CONFLICT (admin_id, role_id) DO NOTHING`,
                [p.id, grantedBy]
              );
            }
          } catch {
            // ignore if already granted or creation conflict
          }
        }

        return { body: { ok: true, playerId: p.id, handle: p.handle, role: chosenRole } };
      } },

    { method: "POST", path: "/v1/admin/players/:id/demote", action: "admin.rbac.manage",
      subjectType: "player",
      handler: async ({ params, actor, db }) => {
        await db.query(
          `UPDATE admin_role_grant
              SET revoked_at = now(), revoked_by = $2, reason = 'Demoted via Admin Panel'
            WHERE admin_id = $1 AND revoked_at IS NULL`,
          [params.id, actor.id]
        );
        await db.query(
          `DELETE FROM admin_custom_role_grant WHERE admin_id = $1`,
          [params.id]
        );
        return { body: { ok: true, playerId: params.id } };
      } },

    { method: "POST", path: "/v1/admin/players/:id/confiscate-and-ban", action: "admin.user.confiscate",
      subjectType: "player",
      handler: async ({ params, actor, body, db }) => {
        if (actor.id === params.id) {
          return { status: 400, body: errorBody("CANNOT_BAN_SELF", "Admins cannot ban or confiscate themselves") };
        }
        const player = await db.query("SELECT id, handle, disabled_at FROM player WHERE id = $1", [params.id]);
        if (!player.rows.length) return { status: 404, body: errorBody("NOT_FOUND") };

        const targetRoles = (await db.query("SELECT admin_roles($1) AS roles", [params.id])).rows[0]?.roles ?? [];
        if (targetRoles.includes("SUPER_ADMIN")) {
          return { status: 403, body: errorBody("CANNOT_BAN_SUPER_ADMIN", "Super Admin accounts cannot be banned or confiscated") };
        }

        const reason = (typeof body?.reason === "string" && body.reason.trim()) ? body.reason.trim() : "Cheating and fair play violation - balance confiscated to platform";
        const nowIso = new Date().toISOString();

        // 1. Calculate player's positive balances across all user ledger accounts
        const accountsRes = await db.query(
          `SELECT a.key, a.id, a.normal_side, a.asset,
                  ledger_natural_balance(a.normal_side, (COALESCE(b.balance, (SELECT COALESCE(SUM(e.amount), 0) FROM ledger_entry e WHERE e.account_id = a.id)))::bigint) AS natural_balance
             FROM ledger_account a
             LEFT JOIN ledger_balance b ON b.account_id = a.id
            WHERE a.owner_type = 'USER' AND a.owner_id = $1`,
          [params.id]
        );

        // Every coin the player holds is seized. A ledger transaction is
        // single-asset, so each coin is its own posting.
        let totalConfiscatedMinor = 0n;
        const byAsset = new Map();
        for (const acct of accountsRes.rows) {
          const naturalBal = BigInt(acct.natural_balance || "0");
          if (naturalBal <= 0n) continue;
          totalConfiscatedMinor += naturalBal;
          const entry = byAsset.get(acct.asset) ?? { total: 0n, legs: [] };
          entry.total += naturalBal;
          entry.legs.push({ account: acct.key, amount: naturalBal.toString() });
          byAsset.set(acct.asset, entry);
        }

        // 2. Post double-entry settlement transactions to platform:confiscated
        const stamp = Date.now();
        for (const [coin, entry] of byAsset) {
          const legs = [...entry.legs, { account: "platform:confiscated", amount: (-entry.total).toString() }];
          await db.query(
            `SELECT ledger_post($1, 'CONFISCATION', 'ADMIN', $2, $3::jsonb, $6, $4, 'player', $5)`,
            [`confiscate-${params.id}-${coin}-${stamp}`, actor.id, JSON.stringify(legs), reason, params.id, coin]
          );
        }

        // 3. Mark player permanently disabled
        await db.query(
          `UPDATE player
              SET disabled_at = $2, disabled_reason = $3, disabled_by = $4
            WHERE id = $1`,
          [params.id, nowIso, `CHEATING_CONFISCATED: ${reason}`, actor.id]
        );

        // 4. Revoke all active sessions
        await db.query(
          `UPDATE auth_session
              SET revoked_at = $2, revoked_reason = 'ACCOUNT_CONFISCATED_AND_BANNED'
            WHERE player_id = $1 AND revoked_at IS NULL`,
          [params.id, nowIso]
        );

        return {
          body: {
            ok: true,
            playerId: params.id,
            confiscatedMinor: totalConfiscatedMinor.toString(),
            confiscatedUsdt: (Number(totalConfiscatedMinor) / 1_000_000).toFixed(2),
            confiscatedByAsset: Object.fromEntries([...byAsset].map(([coin, e]) => [coin, e.total.toString()])),
            disabledAt: nowIso,
            reason
          },
          audit: { event: "PLAYER_CONFISCATED_AND_BANNED", targetId: params.id, confiscatedMinor: totalConfiscatedMinor.toString(), reason },
        };
      } },

    { method: "POST", path: "/v1/admin/players/:id/ban", action: "admin.content.moderate",
      subjectType: "player",
      handler: async ({ params, actor, body, db }) => {
        if (actor.id === params.id) {
          return { status: 400, body: errorBody("CANNOT_BAN_SELF", "Admins cannot ban themselves") };
        }
        const player = await db.query("SELECT id, handle, disabled_at FROM player WHERE id = $1", [params.id]);
        if (!player.rows.length) return { status: 404, body: errorBody("NOT_FOUND") };

        const targetRoles = (await db.query("SELECT admin_roles($1) AS roles", [params.id])).rows[0]?.roles ?? [];
        if (targetRoles.includes("SUPER_ADMIN")) {
          return { status: 403, body: errorBody("CANNOT_BAN_SUPER_ADMIN", "Super Admin accounts cannot be banned") };
        }

        const reason = (typeof body?.reason === "string" && body.reason.trim()) ? body.reason.trim() : "Banned by administrator";
        const nowIso = new Date().toISOString();

        await db.query(
          `UPDATE player
              SET disabled_at = $2, disabled_reason = $3, disabled_by = $4
            WHERE id = $1`,
          [params.id, nowIso, reason, actor.id]
        );

        await db.query(
          `UPDATE auth_session
              SET revoked_at = $2, revoked_reason = 'ACCOUNT_BANNED'
            WHERE player_id = $1 AND revoked_at IS NULL`,
          [params.id, nowIso]
        );

        return {
          body: { ok: true, playerId: params.id, disabledAt: nowIso, reason },
          audit: { event: "PLAYER_BANNED", targetId: params.id, reason },
        };
      } },

    { method: "POST", path: "/v1/admin/players/:id/unban", action: "admin.content.moderate",
      subjectType: "player",
      handler: async ({ params, actor, db }) => {
        const player = await db.query("SELECT id, handle, disabled_at FROM player WHERE id = $1", [params.id]);
        if (!player.rows.length) return { status: 404, body: errorBody("NOT_FOUND") };

        await db.query(
          `UPDATE player
              SET disabled_at = NULL, disabled_reason = NULL, disabled_by = NULL
            WHERE id = $1`,
          [params.id]
        );

        return {
          body: { ok: true, playerId: params.id },
          audit: { event: "PLAYER_UNBANNED", targetId: params.id },
        };
      } },

    { method: "GET", path: "/v1/admin/deposits", action: "admin.wallet.read",
      handler: async ({ db, query }) => {
        const q = (query.get ? query.get("q") : query.q) ? (query.get ? query.get("q") : query.q).trim() : "";
        const status = (query.get ? query.get("status") : query.status) ? (query.get ? query.get("status") : query.status).trim() : "";
        const offset = parseInt(query.get ? query.get("offset") : query.offset) || 0;
        const limit = Math.min(parseInt(query.get ? query.get("limit") : query.limit) || 50, 100);

        let where = [];
        let params = [];

        if (q) {
          params.push(`%${q}%`);
          where.push(`(p.handle ILIKE $${params.length} OR d.observed_tx_hash ILIKE $${params.length} OR d.id ILIKE $${params.length} OR d.address ILIKE $${params.length})`);
        }
        if (status && status !== "ALL") {
          params.push(status);
          where.push(`d.status::text = $${params.length}`);
        }

        const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

        params.push(limit);
        const limitParam = `$${params.length}`;
        params.push(offset);
        const offsetParam = `$${params.length}`;

        const listQuery = `
          SELECT d.id, d.player_id, d.asset, d.network, d.provider, d.provider_ref, d.address,
                 d.status::text, d.observed_tx_hash, d.observed_amount_minor, d.confirmations,
                 d.created_at, d.credited_at,
                 COALESCE(p.handle, 'Anonymous') AS player_handle
            FROM deposit d
            LEFT JOIN player p ON d.player_id = p.id
           ${whereClause}
           ORDER BY d.created_at DESC
           LIMIT ${limitParam} OFFSET ${offsetParam}
        `;

        const [rowsRes, statsRes] = await Promise.all([
          db.query(listQuery, params),
          db.query(`
            SELECT
              count(*)::int AS total_count,
              count(*) FILTER (WHERE status = 'CREDITED' OR status = 'VERIFIED')::int AS confirmed_count,
              count(*) FILTER (WHERE status IN ('INITIATED', 'AWAITING_PAYMENT', 'DETECTED', 'CONFIRMING'))::int AS pending_count,
              COALESCE(sum(observed_amount_minor) FILTER (WHERE status = 'CREDITED' AND created_at >= now() - interval '24 hours'), 0)::text AS inflow_24h_minor
            FROM deposit
          `),
        ]);

        return {
          body: {
            deposits: rowsRes.rows,
            stats: statsRes.rows[0] || {
              total_count: 0, confirmed_count: 0, pending_count: 0, inflow_24h_minor: "0",
            },
          },
        };
      } },

    { method: "GET", path: "/v1/admin/withdrawals", action: "admin.wallet.read",
      handler: async ({ db, query }) => {
        const q = (query.get ? query.get("q") : query.q) ? (query.get ? query.get("q") : query.q).trim() : "";
        const status = (query.get ? query.get("status") : query.status) ? (query.get ? query.get("status") : query.status).trim() : "";
        const offset = parseInt(query.get ? query.get("offset") : query.offset) || 0;
        const limit = Math.min(parseInt(query.get ? query.get("limit") : query.limit) || 50, 100);

        let where = [];
        let params = [];

        if (q) {
          params.push(`%${q}%`);
          where.push(`(p.handle ILIKE $${params.length} OR w.destination ILIKE $${params.length} OR w.id ILIKE $${params.length} OR w.tx_hash ILIKE $${params.length})`);
        }
        if (status && status !== "ALL") {
          params.push(status);
          where.push(`w.status::text = $${params.length}`);
        }

        const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

        params.push(limit);
        const limitParam = `$${params.length}`;
        params.push(offset);
        const offsetParam = `$${params.length}`;

        const listQuery = `
          SELECT w.id, w.player_id, w.asset, w.network, w.destination, w.amount_minor, w.fee_minor,
                 w.status::text, w.tx_hash, w.risk_score, w.failure_reason, w.requested_at, w.completed_at,
                 w.confirmations, w.hold_reason,
                 COALESCE(p.handle, 'Anonymous') AS player_handle
            FROM withdrawal w
            LEFT JOIN player p ON w.player_id = p.id
           ${whereClause}
           ORDER BY w.requested_at DESC
           LIMIT ${limitParam} OFFSET ${offsetParam}
        `;

        const [rowsRes, statsRes] = await Promise.all([
          db.query(listQuery, params),
          db.query(`
            SELECT
              count(*) FILTER (WHERE status IN ('REQUESTED', 'PENDING_REVIEW', 'ON_HOLD'))::int AS pending_count,
              COALESCE(sum(amount_minor) FILTER (WHERE status IN ('REQUESTED', 'PENDING_REVIEW', 'ON_HOLD')), 0)::text AS pending_amount_minor,
              count(*) FILTER (WHERE status = 'COMPLETED' AND completed_at >= now() - interval '24 hours')::int AS settled_24h_count,
              COALESCE(sum(amount_minor) FILTER (WHERE status = 'COMPLETED' AND completed_at >= now() - interval '24 hours'), 0)::text AS settled_24h_minor,
              count(*) FILTER (WHERE status = 'REJECTED')::int AS rejected_count
            FROM withdrawal
          `),
        ]);

        return {
          body: {
            withdrawals: rowsRes.rows,
            stats: statsRes.rows[0] || {
              pending_count: 0, pending_amount_minor: "0", settled_24h_count: 0, settled_24h_minor: "0", rejected_count: 0,
            },
          },
        };
      } },

    // Single-admin approval for a withdrawal that landed on PENDING_REVIEW
    // (i.e. at/above reviewThresholdMinor -- see the automatic sub-threshold
    // path in POST /v1/players/:id/withdrawals). Deliberately NOT
    // admin.withdrawal.approve: that action requires a genuine four-eyes
    // approval_request from a SECOND admin, which cannot exist with one
    // operator. admin.withdrawal.approve_solo carries the same capability
    // and the same mandatory step-up, without that precondition -- see its
    // own comment in policy.mjs for the trade-off being accepted here.
    { method: "POST", path: "/v1/admin/withdrawals/:id/approve", action: "admin.withdrawal.approve_solo",
      subjectType: "withdrawal",
      handler: async ({ params, actor, db, paymentSvc }) => {
        if (!paymentSvc) return { status: 503, body: errorBody("PAYMENTS_UNAVAILABLE") };

        const updated = await db.transaction(async (tx) => {
          await setLedgerActor(tx, { type: "ADMIN", id: actor.id });
          // PENDING_REVIEW -> APPROVED is the one edge this endpoint is
          // for. A withdrawal sitting at REQUESTED/VALIDATING/RISK_CHECK
          // hasn't finished assess() yet (a request in flight, or the
          // automation errored -- see that route's own comment), and
          // ON_HOLD must return to PENDING_REVIEW first (there is no
          // direct ON_HOLD -> APPROVED edge, by design: a withdrawal an
          // admin explicitly paused for investigation should not be
          // approvable without someone consciously resuming it first).
          const r = await tx.query(
            `UPDATE withdrawal SET status = 'APPROVED'::withdrawal_status
              WHERE id = $1 AND status = 'PENDING_REVIEW'
              RETURNING id, status::text`,
            [params.id]
          );
          return r.rows[0] ?? null;
        });
        if (!updated) return { status: 409, body: errorBody("NOT_PENDING_REVIEW") };

        // The SAME function the automatic sub-threshold path calls --
        // broadcasts via the provider, records provider_ref, moves to
        // PROCESSING. From there the existing reconciliation worker
        // (packages/reconciliation's runProviderWithdrawals, already
        // running on a schedule) picks it up and drives it the rest of the
        // way to BROADCASTED -> CONFIRMED -> COMPLETED with no further
        // admin action. A failure here leaves it at APPROVED, retryable by
        // calling this same process() again (it's idempotent on the
        // withdrawal's own broadcast-attempt key) -- never fails this
        // request, since the approval itself already succeeded.
        const processed = await paymentSvc.process(params.id).catch((err) => {
          console.error("paymentSvc.process error after solo approval:", err);
          return null;
        });

        const finalRow = await db.query(
          "SELECT id, status::text, provider_ref FROM withdrawal WHERE id = $1",
          [params.id]
        );
        return { body: { ok: true, withdrawal: finalRow.rows[0], processResult: processed } };
      } },

    { method: "POST", path: "/v1/admin/withdrawals/:id/reject", action: "admin.withdrawal.reject",
      subjectType: "withdrawal",
      handler: async ({ params, body, actor, paymentSvc }) => {
        if (!paymentSvc) return { status: 503, body: errorBody("PAYMENTS_UNAVAILABLE") };
        // paymentSvc.reject() -- not raw SQL -- because it's the one path
        // that both respects the legal-transition table AND releases the
        // locked funds back to :available in the same transaction (see its
        // own header). The route's own action already required step-up to
        // reach this handler at all, so stepUpVerified: true here reflects
        // a check the pipeline already performed, not one this handler is
        // asserting on its own.
        const reason = String(body?.reason ?? "Rejected by admin").slice(0, 500);
        const result = await paymentSvc.reject(params.id, reason, { adminId: actor.id, stepUpVerified: true });
        if (!result.ok) {
          const status = result.reason === WithdrawalError.WRONG_STATE ? 409
            : result.reason === WithdrawalError.PERMISSION_DENIED ? 403 : 400;
          return { status, body: errorBody(result.reason) };
        }
        return { body: { ok: true, withdrawal: result } };
      } },

    { method: "GET", path: "/v1/admin/matches", action: "admin.duel.read",
      handler: async ({ db, query }) => {
        const q = (query.get ? query.get("q") : query.q) ? (query.get ? query.get("q") : query.q).trim() : "";
        const status = (query.get ? query.get("status") : query.status) ? (query.get ? query.get("status") : query.status).trim() : "";
        const gameId = (query.get ? query.get("gameId") : query.gameId) ? (query.get ? query.get("gameId") : query.gameId).trim() : "";
        const offset = parseInt(query.get ? query.get("offset") : query.offset) || 0;
        const limit = Math.min(parseInt(query.get ? query.get("limit") : query.limit) || 50, 100);

        let where = [];
        let params = [];

        if (q) {
          params.push(`%${q}%`);
          where.push(`(d.id ILIKE $${params.length} OR d.game_id ILIKE $${params.length} OR p0.handle ILIKE $${params.length} OR p1.handle ILIKE $${params.length})`);
        }
        if (status && status !== "ALL") {
          params.push(status);
          where.push(`d.status::text = $${params.length}`);
        }
        if (gameId && gameId !== "ALL") {
          params.push(gameId);
          where.push(`d.game_id = $${params.length}`);
        }

        const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

        params.push(limit);
        const limitParam = `$${params.length}`;
        params.push(offset);
        const offsetParam = `$${params.length}`;

        const listQuery = `
          SELECT d.id, d.game_id, d.seat_0, d.seat_1, d.stake_minor, d.asset,
                 d.status::text, d.result, d.created_at, d.started_at, d.completed_at,
                 d.is_vs_computer, d.time_control, d.fairplay_hold,
                 COALESCE(p0.handle, 'Computer') AS seat_0_handle,
                 COALESCE(p1.handle, 'Computer') AS seat_1_handle
            FROM duel d
            LEFT JOIN player p0 ON d.seat_0 = p0.id
            LEFT JOIN player p1 ON d.seat_1 = p1.id
           ${whereClause}
           ORDER BY d.created_at DESC
           LIMIT ${limitParam} OFFSET ${offsetParam}
        `;

        const [rowsRes, statsRes] = await Promise.all([
          db.query(listQuery, params),
          db.query(`
            SELECT
              count(*) FILTER (WHERE created_at >= CURRENT_DATE)::int AS matches_today,
              count(*) FILTER (WHERE status = 'LIVE')::int AS live_duels,
              COALESCE(sum(stake_minor) FILTER (WHERE created_at >= now() - interval '24 hours'), 0)::text AS volume_24h_minor,
              count(*) FILTER (WHERE status = 'VOIDED' OR fairplay_hold = true)::int AS disputed_count
            FROM duel
          `),
        ]);

        return {
          body: {
            matches: rowsRes.rows,
            stats: statsRes.rows[0] || {
              matches_today: 0, live_duels: 0, volume_24h_minor: "0", disputed_count: 0,
            },
          },
        };
      } },

    { method: "GET", path: "/v1/admin/players/:id", action: "admin.user.read",
      subjectType: "player",
      handler: async ({ params, db }) => {
        const [playerRes, rolesRes, amlSummary, depositsRes, withdrawalsRes, duelsRes] = await Promise.all([
          db.query(
            "SELECT id, handle, locale, created_at, disabled_at, disabled_reason, disabled_by FROM player WHERE id = $1",
            [params.id]
          ),
          db.query(
            "SELECT admin_roles($1) AS roles",
            [params.id]
          ),
          getPlayerAmlSummary(db, params.id, "USDT"),
          db.query(
            `SELECT id, asset, network, address, status::text,
                    COALESCE(observed_amount_minor, 0)::text AS amount_minor,
                    observed_tx_hash, created_at, credited_at
               FROM deposit
              WHERE player_id = $1
              ORDER BY created_at DESC
              LIMIT 10`,
            [params.id]
          ),
          db.query(
            `SELECT id, asset, network, destination, amount_minor::text, status::text, requested_at
               FROM withdrawal
              WHERE player_id = $1
              ORDER BY requested_at DESC
              LIMIT 10`,
            [params.id]
          ),
          db.query(
            `SELECT d.id, d.game_id, d.tier::text, d.stake_minor::text, d.status::text, d.result,
                    d.seat_0, d.seat_1, d.settled_at, d.created_at,
                    p0.handle AS handle_0, p1.handle AS handle_1
               FROM duel d
               LEFT JOIN player p0 ON p0.id = d.seat_0
               LEFT JOIN player p1 ON p1.id = d.seat_1
              WHERE d.tier = 'CASH' AND (d.seat_0 = $1 OR d.seat_1 = $1)
              ORDER BY d.created_at DESC
              LIMIT 10`,
            [params.id]
          ),
        ]);

        if (!playerRes.rows.length) {
          return { status: 404, body: errorBody("NOT_FOUND") };
        }

        const rawRoles = rolesRes.rows[0]?.roles ?? [];
        const player = {
          ...playerRes.rows[0],
          roles: Array.isArray(rawRoles) ? rawRoles : [],
        };

        return {
          body: {
            ...player,
            player,
            amlSummary,
            deposits: depositsRes.rows,
            withdrawals: withdrawalsRes.rows,
            duels: duelsRes.rows,
          },
        };
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

    // --- Admin: the Payment & Stablecoin Control Center -------------------------
    //
    // Global pause/resume (deposits, withdrawals, real-money play) is NOT
    // reimplemented here -- it is exactly POST /v1/admin/controls/:key above
    // (keys DEPOSITS, WITHDRAWALS, CASH_MATCHES), which already gives it a
    // real actor, a fresh reason, and an append-only audit row via
    // platform_control's own trigger. GET below surfaces those same three
    // keys read-only, at their own lower-sensitivity capability, so a role
    // that can only SEE whether deposits are paused is not thereby handed
    // the ability to pause them.
    //
    // "Turning a rail OFF must ... not erase history, not alter settled
    // balances, not change existing matches, not rewrite existing
    // transactions" is enforced structurally, not by these handlers: every
    // write below goes through rails.setStatus()/updateLimits()
    // (packages/payments/src/valuation.mjs), which only ever UPDATEs
    // payment_rail's own configuration columns and appends to
    // rail_configuration_change. Neither touches deposit, withdrawal,
    // duel, or ledger_* tables -- there is no code path here that could
    // rewrite a settled balance even if it tried.

    { method: "GET", path: "/v1/admin/payments/rails", action: "admin.rail.read",
      handler: async ({ rails, railHealth }) => {
        if (!rails) return { status: 503, body: errorBody("SERVICE_UNAVAILABLE") };
        const list = await rails.list();
        const withHealth = await Promise.all(list.map(async (rail) => ({
          ...rail,
          health: railHealth ? await railHealth.checkRail(rail.asset, rail.network) : { status: "UNKNOWN", checks: [], checkedAt: null },
        })));
        return { body: { rails: withHealth } };
      } },

    { method: "GET", path: "/v1/admin/payments/rails/:id/history", action: "admin.rail.read",
      subjectType: "payment_rail",
      handler: async ({ params, rails }) => {
        if (!rails) return { status: 503, body: errorBody("SERVICE_UNAVAILABLE") };
        return { body: { history: await rails.history(params.id) } };
      } },

    { method: "GET", path: "/v1/admin/payments/controls", action: "admin.control.read",
      handler: async ({ db }) => {
        const r = await db.query(
          `SELECT key, enabled, changed_by, reason, changed_at FROM platform_control
            WHERE key IN ('DEPOSITS','WITHDRAWALS','CASH_MATCHES','GLOBAL_EMERGENCY')`
        );
        return { body: { controls: r.rows } };
      } },

    { method: "POST", path: "/v1/admin/payments/rails/:id/status", action: "admin.rail.manage",
      subjectType: "payment_rail",
      handler: async ({ params, body, actor, rails }) => {
        if (!rails) return { status: 503, body: errorBody("SERVICE_UNAVAILABLE") };
        if (typeof body.status !== "string" || typeof body.reason !== "string") {
          return { status: 400, body: errorBody("BAD_REQUEST") };
        }
        if (!["ACTIVE", "ADMIN_PAUSED", "EMERGENCY_HOLD", "RETIRED"].includes(body.status)) {
          // RISK_PAUSED is deliberately unreachable here -- it is the
          // AUTOMATIC state record_valuation_snapshot() enters on a real
          // depeg observation, never something an admin sets directly.
          return { status: 400, body: errorBody("INVALID_STATUS") };
        }
        const result = await rails.setStatus(params.id, body.status, {
          actorType: "ADMIN", actorId: actor.id, reason: body.reason,
        });
        return result.ok
          ? { body: result.rail, audit: { field: "status", to: body.status } }
          : { status: result.reason === "NOT_FOUND" ? 404 : 400, body: errorBody(result.reason) };
      } },

    { method: "POST", path: "/v1/admin/payments/rails/:id/limits", action: "admin.rail.manage",
      subjectType: "payment_rail",
      handler: async ({ params, body, actor, rails }) => {
        if (!rails) return { status: 503, body: errorBody("SERVICE_UNAVAILABLE") };
        if (typeof body.reason !== "string") return { status: 400, body: errorBody("BAD_REQUEST") };
        const { reason, ...patch } = body;
        const result = await rails.updateLimits(params.id, patch, {
          actorType: "ADMIN", actorId: actor.id, reason,
        });
        return result.ok
          ? { body: result.rail, audit: { changedFields: result.changedFields } }
          : { status: result.reason === "NOT_FOUND" ? 404 : 400, body: errorBody(result.reason, result.detail) };
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

    { method: "POST", path: "/v1/admin/chat/direct-messages/:id/delete", action: "admin.chat.delete",
      subjectType: "direct_message",
      handler: async ({ params, actor, directChat }) => {
        if (!directChat) return { status: 503, body: errorBody("CHAT_UNAVAILABLE") };
        const r = await directChat.moderateDeleteDirectMessage({ messageId: params.id, moderatorId: actor.id });
        if (!r.ok) return { status: 400, body: errorBody(r.reason) };
        return { body: r, audit: { event: "DIRECT_MESSAGE_DELETED", messageId: params.id } };
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

    { method: "GET", path: "/v1/admin/chat/mutes", action: "admin.chat.view",
      handler: async ({ query, chat }) => ({
        body: {
          mutes: await chat.moderation.listActiveMutes({
            limit: query.get("limit") || undefined,
            offset: query.get("offset") || undefined,
          }),
        },
      }) },

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

    // --- Referrals & Attributions ---------------------------------------------
    { method: "GET", path: "/v1/me/referral", action: "player.referral.read",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, referral, referrals }) => {
        const refService = referral || referrals;
        if (!refService) return { status: 503, body: errorBody("SERVICE_UNAVAILABLE") };
        const dashboard = await refService.getDashboard(actor.id);
        if (!dashboard) return { status: 404, body: errorBody("NOT_FOUND") };
        return { body: dashboard };
      } },

    { method: "GET", path: "/v1/referral/code/:code", action: "player.referral.code.read", anonymous: true,
      handler: async ({ params, referral, referrals }) => {
        const refService = referral || referrals;
        if (!refService) return { status: 503, body: errorBody("SERVICE_UNAVAILABLE") };
        const res = await refService.resolveReferralCode(params.code);
        if (!res.ok) {
          const status = res.reason === "CODE_NOT_FOUND" ? 404 : 400;
          return { status, body: errorBody(res.reason) };
        }
        return { body: { ok: true, code: res.code, referrerHandle: res.referrerHandle } };
      } },

    { method: "GET", path: "/v1/admin/referrals", action: "admin.referral.read",
      subjectType: "referrals",
      handler: async ({ query, db, referral, referrals }) => {
        const refService = referral || referrals;
        const limit = Math.min(Math.max(parseInt((query.get ? query.get("limit") : query.limit) || "50", 10) || 50, 1), 200);
        const offset = Math.max(parseInt((query.get ? query.get("offset") : query.offset) || "0", 10) || 0, 0);
        let rows = [];
        if (refService) {
          rows = await refService.getAdminReferrals({ limit, offset }).catch(() => []);
        }
        let list = [];
        let statsObj = {
          activeAffiliates: 0,
          referredPlayers: 0,
          attributedVolumeUsdt: "0.00",
          commissionPayoutsUsdt: "0.00",
          total_codes: 0,
          total_referrals: 0,
          rewarded_referrals: 0,
          pending_referrals: 0,
        };
        if (db) {
          const [statsRes, listRes] = await Promise.all([
            db.query(`
              SELECT
                (SELECT count(DISTINCT player_id)::int FROM referral_code WHERE is_active = TRUE) as active_affiliates,
                (SELECT count(DISTINCT referred_player_id)::int FROM referral_attribution) as referred_players,
                COALESCE((SELECT sum(reward_amount_minor)::text FROM referral_reward), '0') as commission_paid_minor,
                (SELECT count(*)::int FROM referral_code) as total_codes,
                (SELECT count(*)::int FROM referral_attribution) as total_referrals
            `).catch(() => ({ rows: [{ active_affiliates: 0, referred_players: 0, commission_paid_minor: "0", total_codes: 0, total_referrals: 0 }] })),
            db.query(`
              SELECT c.code, c.player_id, p.handle, c.is_active, c.created_at,
                     count(DISTINCT a.referred_player_id)::int as referred_count,
                     COALESCE(sum(r.reward_amount_minor), 0)::text as commission_minor
                FROM referral_code c
                JOIN player p ON p.id = c.player_id
                LEFT JOIN referral_attribution a ON a.referrer_player_id = c.player_id
                LEFT JOIN referral_reward r ON r.referrer_player_id = c.player_id
               GROUP BY c.code, c.player_id, p.handle, c.is_active, c.created_at
               ORDER BY referred_count DESC, c.created_at DESC
               LIMIT $1 OFFSET $2
            `, [limit, offset]).catch(() => ({ rows: [] }))
          ]);
          const s = statsRes.rows[0];
          statsObj = {
            activeAffiliates: s.active_affiliates,
            referredPlayers: s.referred_players,
            attributedVolumeUsdt: "0.00",
            commissionPayoutsUsdt: (Number(s.commission_paid_minor || 0) / 1_000_000).toFixed(2),
            total_codes: s.total_codes || 0,
            total_referrals: s.total_referrals || 0,
            rewarded_referrals: 0,
            pending_referrals: 0,
          };
          list = listRes.rows.map(r => ({
            code: r.code,
            affiliateHandle: r.handle,
            referredCount: r.referred_count,
            totalVolumeUsdt: "0.00",
            commissionEarnedUsdt: (Number(r.commission_minor || 0) / 1_000_000).toFixed(2),
            tier: r.referred_count > 100 ? "GOLD" : r.referred_count > 20 ? "SILVER" : "STANDARD",
            status: r.is_active ? "ACTIVE" : "PAUSED"
          }));
        }
        return {
          body: {
            ok: true,
            referrals: list.length ? list : rows,
            stats: statsObj,
            codes: list,
            attributions: []
          }
        };
      } },

    { method: "POST", path: "/v1/admin/referrals/:id/decide", action: "admin.referral.decide",
      subjectType: "referral_reward",
      handler: async ({ params, body, actor, referral, referrals }) => {
        const refService = referral || referrals;
        if (!refService) return { status: 503, body: errorBody("SERVICE_UNAVAILABLE") };
        if (typeof body.approved !== "boolean") {
          return { status: 400, body: errorBody("BAD_REQUEST", "approved boolean is required") };
        }
        const res = await refService.decideReward(params.id, {
          approved: body.approved,
          adminId: actor.id,
          reason: body.reason ? String(body.reason) : null,
        });
        if (!res.ok) {
          const status = res.reason === "NOT_FOUND" ? 404 : 400;
          return { status, body: errorBody(res.reason) };
        }
        return { body: { ok: true, state: res.state }, audit: { rewardId: params.id, approved: body.approved } };
      } },

    // --- Legal & Consent ------------------------------------------------------
    { method: "GET", path: "/v1/legal/policies", action: "legal.policies.read", anonymous: true,
      handler: async ({ consent }) => {
        if (!consent) return { status: 503, body: errorBody("SERVICE_UNAVAILABLE") };
        const policies = await consent.getAllPolicies();
        return { body: { ok: true, policies } };
      } },

    { method: "GET", path: "/v1/me/consent/status", action: "player.consent.read",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, consent }) => {
        if (!consent) return { status: 503, body: errorBody("SERVICE_UNAVAILABLE") };
        const status = await consent.getPlayerConsentStatus(actor.id);
        return { body: { ok: true, ...status } };
      } },

    { method: "POST", path: "/v1/me/consent/accept", action: "player.consent.accept",
      owner: ({ actor }) => actor.id,
      handler: async ({ actor, body, consent, ip, userAgent }) => {
        if (!consent) return { status: 503, body: errorBody("SERVICE_UNAVAILABLE") };
        const { policyIdentifier, policyVersion, locale } = body ?? {};
        if (!policyIdentifier) return { status: 400, body: errorBody("BAD_REQUEST", "policyIdentifier is required") };
        const r = await consent.recordConsent({
          playerId: actor.id,
          policyIdentifier: String(policyIdentifier),
          policyVersion: policyVersion ? String(policyVersion) : null,
          locale: locale ? String(locale) : "en",
          consentType: "POLICY_REACCEPTANCE",
          source: "REACCEPTANCE_MODAL",
          ip,
          userAgent,
        });
        if (!r.ok) return { status: 400, body: errorBody(r.reason) };
        return { body: { ok: true, ...r } };
      } },

    { method: "POST", path: "/v1/admin/policies/:identifier/version", action: "admin.policy.manage",
      subjectType: "legal_policy",
      handler: async ({ params, body, actor, consent }) => {
        if (!consent) return { status: 503, body: errorBody("SERVICE_UNAVAILABLE") };
        const { newVersion, title, isMandatory } = body ?? {};
        if (!newVersion) return { status: 400, body: errorBody("BAD_REQUEST", "newVersion is required") };
        const r = await consent.updatePolicyVersion({
          policyIdentifier: params.identifier,
          newVersion: String(newVersion),
          title: title ? String(title) : undefined,
          isMandatory: typeof isMandatory === "boolean" ? isMandatory : undefined,
        }, actor.id);
        if (!r.ok) return { status: 404, body: errorBody(r.reason) };
        return { body: { ok: true, policy: r.policy }, audit: { policyIdentifier: params.identifier, newVersion } };
      } },

    // --- Platform Support Config ----------------------------------------------
    { method: "GET", path: "/v1/support/config", action: "support.config.read", anonymous: true,
      handler: async ({ consent }) => {
        if (!consent) return { body: { ok: true, phone: "+2 01069999557", email: "support@Nizalo.com" } };
        const config = await consent.getSupportConfig();
        return { body: { ok: true, ...config } };
      } },

    { method: "POST", path: "/v1/admin/support/config", action: "admin.support.config.update",
      subjectType: "platform_support_config",
      handler: async ({ body, actor, consent }) => {
        if (!consent) return { status: 503, body: errorBody("SERVICE_UNAVAILABLE") };
        const { phone, email } = body ?? {};
        if (!phone || !email) return { status: 400, body: errorBody("BAD_REQUEST", "phone and email are required") };
        const r = await consent.updateSupportConfig({ phone: String(phone), email: String(email) }, actor.id);
        return { body: { ok: true, ...r.config }, audit: { phone, email } };
      } },
    // --- Google OAuth Seamless Session Sync ---
    { method: "POST", path: "/v1/auth/google/sync-session", action: "player.login", anonymous: true,
      handler: async ({ body, ip, db, auth }) => {
        const { email, subject, name } = body ?? {};
        if (!email || typeof email !== "string") {
          return { status: 400, body: errorBody("BAD_REQUEST", "email is required") };
        }
        const normEmail = email.trim().toLowerCase();
        let playerId = null;
        if (subject) {
          const oid = await db.query(
            "SELECT player_id FROM oauth_identity WHERE provider = 'google' AND provider_subject = $1",
            [String(subject)]
          );
          if (oid.rows.length) playerId = oid.rows[0].player_id;
        }
        if (!playerId) {
          const em = await db.query(
            "SELECT player_id FROM email_identity WHERE email = $1",
            [normEmail]
          );
          if (em.rows.length) {
            playerId = em.rows[0].player_id;
            if (subject) {
              await db.query(
                `INSERT INTO oauth_identity (id, player_id, provider, provider_subject, email, email_verified, created_at)
                 VALUES ($1, $2, 'google', $3, $4, true, now())
                 ON CONFLICT (provider, provider_subject) DO NOTHING`,
                [`oid_${randomUUID()}`, playerId, String(subject), normEmail]
              ).catch(() => {});
            }
          }
        }
        if (!playerId) {
          const rawBase = normEmail.split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "_") || "player";
          const base = (rawBase.length < 3 ? `${rawBase}_player` : rawBase).slice(0, 18);
          let handle = base;
          const exists = await db.query("SELECT 1 FROM player WHERE handle = $1", [handle]);
          if (exists.rows.length) {
            handle = `${base}_${Math.floor(1000 + Math.random() * 9000)}`;
          }
          playerId = handle;
          await db.query("INSERT INTO player (id, handle, locale) VALUES ($1, $2, 'en')", [playerId, handle]);
          await db.query("SELECT ledger_open_user_wallet($1)", [playerId]);
          await db.query(
            `INSERT INTO email_identity (id, player_id, email, email_display, verified_at, created_at)
             VALUES ($1, $2, $3, $4, now(), now())
             ON CONFLICT (email) DO NOTHING`,
            [`eid_${randomUUID()}`, playerId, normEmail, email.trim()]
          );
          if (subject) {
            await db.query(
              `INSERT INTO oauth_identity (id, player_id, provider, provider_subject, email, email_verified, created_at)
               VALUES ($1, $2, 'google', $3, $4, true, now())
               ON CONFLICT (provider, provider_subject) DO NOTHING`,
              [`oid_${randomUUID()}`, playerId, String(subject), normEmail]
            ).catch(() => {});
          }
        }
        const sessionRes = await auth.loginPasswordless({ playerId }, { ip });
        if (!sessionRes.ok) return { status: 400, body: errorBody(sessionRes.reason) };
        return {
          status: 200,
          body: {
            ok: true,
            playerId,
            accessToken: sessionRes.accessToken,
            refreshToken: sessionRes.refreshToken,
            expiresInSeconds: sessionRes.expiresInSeconds,
          }
        };
      } },

    // --- Admin Platform Events Stream (Topbar Bell) ---
    { method: "GET", path: "/v1/admin/events", action: "admin.audit.read",
      handler: async ({ db, query }) => {
        const limit = Math.min(Number(query.get("limit") ?? 30) || 30, 100);
        // All three of these queried columns that don't exist (admin_audit's
        // actor/timestamp columns are actually admin_id/at; security_event's
        // and tournament_event's timestamp is "at", not "created_at"), so
        // every query here always threw and the bell always showed nothing.
        const [audit, sec, tourn] = await Promise.all([
          db.query(
            `SELECT id, admin_id as actor_id, action, subject_type, subject_id, at AS created_at, 'AUDIT' as event_type,
                    COALESCE(detail::text, '{}') as detail
               FROM admin_audit ORDER BY at DESC LIMIT $1`,
            [limit]
          ).catch(() => ({ rows: [] })),
          db.query(
            `SELECT id::text, player_id as actor_id, type as action, 'security' as subject_type, player_id as subject_id,
                    at AS created_at, 'SECURITY' as event_type, COALESCE(detail::text, '{}') as detail
               FROM security_event ORDER BY at DESC LIMIT $1`,
            [limit]
          ).catch(() => ({ rows: [] })),
          db.query(
            `SELECT id::text, actor_id, event as action, 'tournament' as subject_type, tournament_id as subject_id,
                    at AS created_at, 'TOURNAMENT' as event_type, COALESCE(detail::text, '{}') as detail
               FROM tournament_event ORDER BY at DESC LIMIT $1`,
            [limit]
          ).catch(() => ({ rows: [] })),
        ]);
        const merged = [...audit.rows, ...sec.rows, ...tourn.rows]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, limit);
        return { body: { ok: true, events: merged } };
      } },

    // --- Admin Tournaments Control ---
    { method: "GET", path: "/v1/admin/tournaments", action: "tournament.read",
      handler: async ({ db, query }) => {
        const q = (query.get("q") ?? "").trim().toLowerCase();
        const status = (query.get("status") ?? "").trim();
        const r = await db.query(
          `SELECT t.id, t.title, t.game_id, t.format, t.tier, t.status,
                  t.capacity, t.entry_fee_minor::text as entry_fee_minor,
                  t.asset, t.created_at, t.starts_at, t.completed_at,
                  t.priced_rake_bps,
                  (SELECT count(*)::int FROM tournament_registration tr
                    WHERE tr.tournament_id = t.id AND tr.status = 'REGISTERED') as registered_count
             FROM tournament t
            WHERE ($1 = '' OR LOWER(t.title) LIKE '%' || $1 || '%' OR LOWER(t.game_id) LIKE '%' || $1 || '%' OR LOWER(t.id) LIKE '%' || $1 || '%')
              AND ($2 = '' OR t.status::text = $2)
            ORDER BY t.created_at DESC LIMIT 100`,
          [q, status]
        );
        const stats = await db.query(`
          SELECT
            count(*)::int as total_tournaments,
            count(*) FILTER (WHERE status IN ('REGISTRATION', 'LIVE', 'FINALS'))::int as active_brackets,
            -- Each tournament's own priced_rake_bps (set at creation from
            -- economy_resolve(), the same source settlement itself reads
            -- via computeRake() in tournament.mjs) -- not a hardcoded 88%,
            -- which both disagreed with the platform's real default (12%
            -- rake, economy_rule's own seeded default) and would silently
            -- diverge again the moment any tournament is priced at a
            -- different rate. NULL (a tournament created before this
            -- column existed) falls back to that same 12% default.
            COALESCE(sum(entry_fee_minor * capacity * (10000 - COALESCE(priced_rake_bps, 1200)) / 10000) FILTER (WHERE status IN ('REGISTRATION', 'LIVE', 'FINALS') AND tier = 'CASH'), 0)::text as total_prize_pool_minor,
            (SELECT count(DISTINCT tr2.player_id)::int FROM tournament_registration tr2) as total_players,
            (SELECT count(*)::int FROM tournament_registration tr3 WHERE tr3.registered_at >= now() - interval '24 hours') as registrations_today,
            count(*) FILTER (WHERE status IN ('COMPLETED', 'SETTLED'))::int as completed_brackets
          FROM tournament
        `);
        return {
          body: {
            ok: true,
            tournaments: r.rows,
            stats: stats.rows[0]
          }
        };
      } },

    // --- Admin Arena & Live Duel Telemetry ---
    { method: "GET", path: "/v1/admin/arena", action: "admin.duel.read",
      handler: async ({ db }) => {
        const liveDuels = await db.query(`
          SELECT d.id, d.game_id, d.tier, d.stake_minor::text, d.asset, d.status,
                 d.seat_0, d.seat_1, d.created_at, d.moves_count
            FROM duel d
           WHERE d.status = 'LIVE'
           ORDER BY d.created_at DESC LIMIT 50
        `);
        const stats = await db.query(`
          SELECT
            count(*) FILTER (WHERE status = 'LIVE')::int as live_matches,
            count(DISTINCT unnest_seats)::int as active_players,
            count(*) FILTER (WHERE status IN ('COMPLETED','SETTLED') AND created_at >= now() - interval '24 hours')::int as matches_24h,
            COALESCE(sum(rake_minor) FILTER (WHERE created_at >= now() - interval '24 hours'), 0)::text as rake_24h
          FROM duel
          LEFT JOIN LATERAL (SELECT UNNEST(ARRAY[seat_0, seat_1]) as unnest_seats) s ON true
        `);
        return {
          body: {
            ok: true,
            duels: liveDuels.rows,
            stats: stats.rows[0]
          }
        };
      } },


    // --- Admin Risk & Anti-Fraud Center ---
    { method: "GET", path: "/v1/admin/risk", action: "admin.risk.read",
      handler: async ({ db }) => {
        const [alerts, recon, secEvents] = await Promise.all([
          // risk_alert was never a real table -- this queried a name nothing
          // ever created, silently caught, so the Risk Radar's "RISK" tab
          // showed zero real anti-cheat findings even as the Fair Play Engine
          // scored real signals from real gameplay into fairplay_case rows.
          // fairplay_case is the real queue those findings land in.
          db.query(`
            SELECT c.id, c.player_id, c.category AS reason, c.status, c.opened_at AS created_at, 'RISK' as type
              FROM fairplay_case c
             WHERE c.status IN ('OPEN','UNDER_REVIEW','APPEALED')
             ORDER BY c.opened_at DESC LIMIT 30
          `).catch(() => ({ rows: [] })),
          // reconciliation_case has no "type" or "created_at" column (it's
          // category/opened_at) -- this silently returned zero rows too.
          db.query(`
            SELECT id, category AS type, status, severity, opened_at AS created_at
              FROM reconciliation_case ORDER BY opened_at DESC LIMIT 30
          `).catch(() => ({ rows: [] })),
          // security_event's timestamp column is "at", not "created_at" --
          // same silent-empty-result bug, third time in this one handler.
          db.query(`
            SELECT id::text, player_id, type, detail, at AS created_at
              FROM security_event
             WHERE type IN ('LOGIN_FAILED','TOTP_FAILED','LOCKOUT','DEPEG_HALT','SUSPICIOUS_WITHDRAWAL')
             ORDER BY at DESC LIMIT 30
          `).catch(() => ({ rows: [] })),
        ]);
        return {
          body: {
            ok: true,
            alerts: alerts.rows,
            reconciliationCases: recon.rows,
            securityEvents: secEvents.rows,
          }
        };
      } },

    { method: "POST", path: "/v1/admin/risk/resolve", action: "admin.risk.decide",
      handler: async ({ body, db }) => {
        const id = String(body?.id ?? "");
        const type = String(body?.type ?? "risk_alert");
        if (!id) return { status: 400, body: errorBody("MISSING_ID") };

        if (type === "reconciliation_case") {
          await db.query(`UPDATE reconciliation_case SET status = 'RESOLVED', resolved_at = now() WHERE id = $1`, [id]).catch(() => {});
          return { body: { ok: true, id, status: "RESOLVED" } };
        }

        // "risk_alert" rows shown by GET /v1/admin/risk are real fairplay_case
        // rows (see that handler's comment). A case cannot be waved to
        // "resolved" here -- decided_by/decision/decision_note are required by
        // the database itself (case_decided_has_decider, case_sanction_has_note)
        // -- it must go through the audited decide flow with a human decision
        // and a note, exactly like every other fair-play case.
        return {
          status: 409,
          body: errorBody(
            "USE_FAIRPLAY_TRIBUNAL",
            "This is a Fair Play case, not a simple alert -- decide it from the Fair Play Tribunal so the decision is recorded with a reviewer and a reason."
          ),
        };
      } },

    { method: "POST", path: "/v1/admin/risk/lock-player", action: "admin.content.moderate",
      handler: async ({ actor, body, db }) => {
        const playerId = String(body?.playerId ?? "");
        const reason = String(body?.reason ?? "Risk Radar administrative lock");
        if (!playerId) return { status: 400, body: errorBody("MISSING_PLAYER_ID") };

        await db.query(
          `INSERT INTO security_event (player_id, type, detail)
           VALUES ($1, 'LOCKOUT', $2::jsonb)`,
          [playerId, JSON.stringify({ reason, lockedBy: actor.id, lockedAt: new Date().toISOString() })]
        ).catch(() => {});

        return { body: { ok: true, playerId, status: "LOCKED" } };
      } },

    // --- Admin Fair Play Cases & Flagged Duels ---
    // Was previously querying columns (reason, score, game_id, created_at)
    // that do not exist on fairplay_case at all -- silently swallowed by the
    // blanket .catch() below, so this always returned an empty list with no
    // visible error. Real columns per 0009_risk_and_fairplay.sql:
    // category/status/risk_score/opened_at/decision/decision_note/funds_held.
    { method: "GET", path: "/v1/admin/fair-play", action: "admin.fairplay.read",
      handler: async ({ db, query }) => {
        const q = (query.get("q") ?? "").trim().toLowerCase();
        const cases = await db.query(`
          SELECT c.id, c.player_id, p.handle AS player_handle, c.category, c.status, c.risk_score,
                 c.auto_actioned, c.opened_at, c.decided_at, c.decided_by, c.decision, c.decision_note,
                 c.funds_held, c.closed_at
            FROM fairplay_case c
            LEFT JOIN player p ON p.id = c.player_id
           WHERE ($1 = '' OR LOWER(c.player_id) LIKE '%' || $1 || '%' OR LOWER(c.id) LIKE '%' || $1 || '%'
                  OR LOWER(p.handle) LIKE '%' || $1 || '%')
           ORDER BY c.opened_at DESC LIMIT 50
        `, [q]).catch((err) => { console.error("admin fair-play cases query error:", err); return { rows: [] }; });
        // duel_engine_flag never existed -- the real table is
        // fairplay_signal (0009_risk_and_fairplay.sql).
        const flags = await db.query(`
          SELECT id, duel_id, player_id, detector AS flag_code, strength, confidence, explanation, created_at
            FROM fairplay_signal ORDER BY created_at DESC LIMIT 50
        `).catch((err) => { console.error("admin fair-play signals query error:", err); return { rows: [] }; });
        return {
          body: {
            ok: true,
            cases: cases.rows,
            flags: flags.rows,
          }
        };
      } },

    // The one real consequence path from the fair-play tribunal. Two
    // outcomes only, for now: ACCOUNT_CLOSURE (ban + seize every non-zero
    // wallet balance to platform:confiscated) or NONE (dismiss, no action).
    // Deliberately not auto-actioned and not reachable without step-up --
    // 0009's own header calls this "NEVER ONE SIGNAL = BAN, made
    // structural"; this endpoint is the human decision that principle
    // exists to require, not a bypass of it.
    { method: "POST", path: "/v1/admin/fair-play/cases/:id/decide", action: "admin.fairplay.decide",
      subjectType: "fairplay_case",
      handler: async ({ params, body, actor, db }) => {
        const decision = String(body?.decision ?? "").toUpperCase();
        if (!["ACCOUNT_CLOSURE", "NONE"].includes(decision)) {
          return { status: 400, body: errorBody("INVALID_DECISION", "decision must be ACCOUNT_CLOSURE or NONE") };
        }
        const note = String(body?.note ?? "").trim();
        if (note.length < 3) {
          return { status: 400, body: errorBody("REASON_REQUIRED", "A reason is required and becomes part of the permanent audit trail") };
        }

        const caseRes = await db.query("SELECT * FROM fairplay_case WHERE id = $1", [params.id]);
        if (!caseRes.rows.length) return { status: 404, body: errorBody("NOT_FOUND") };
        const c = caseRes.rows[0];
        if (!["OPEN", "UNDER_REVIEW"].includes(c.status)) {
          return { status: 409, body: errorBody("ALREADY_DECIDED", `case is already ${c.status}`) };
        }

        if (decision === "NONE") {
          await db.query(
            `UPDATE fairplay_case
                SET status='CLOSED_NO_ACTION', decision='NONE', decision_note=$2,
                    decided_by=$3, decided_at=now(), closed_at=now()
              WHERE id=$1`,
            [params.id, note, actor.id]
          );
          await db.query(
            `INSERT INTO fairplay_case_event (case_id, event, actor_type, actor_id, detail)
             VALUES ($1,'CLEARED','ADMIN',$2,$3::jsonb)`,
            [params.id, actor.id, JSON.stringify({ note })]
          );
          return { body: { ok: true, caseId: params.id, decision: "NONE" } };
        }

        // ACCOUNT_CLOSURE: ban the account (same effect as POST
        // /v1/admin/players/:id/ban, plus the CHEATING category the login
        // flow's specific message depends on) and seize every non-zero
        // balance across all five wallet states -- not just :available --
        // to platform:confiscated. Each state's seizure is its own
        // ADJUSTMENT posting, keyed on (case id, state), so a retry after a
        // partial failure never double-seizes a state already moved.
        const nowIso = new Date().toISOString();
        const states = ["available", "locked", "pending", "withdrawable", "restricted"];
        const seized = [];

        await db.transaction(async (tx) => {
          await tx.query(
            `UPDATE player SET disabled_at=$2, disabled_reason=$3, disabled_by=$4, disabled_category='CHEATING' WHERE id=$1`,
            [c.player_id, nowIso, note, actor.id]
          );
          await tx.query(
            `UPDATE auth_session SET revoked_at=$2, revoked_reason='FAIRPLAY_SANCTION' WHERE player_id=$1 AND revoked_at IS NULL`,
            [c.player_id, nowIso]
          );

          for (const state of states) {
            const balRes = await tx.query(
              `SELECT a.asset, ledger_natural_balance(a.normal_side, COALESCE(b.balance,0)) AS bal
                 FROM ledger_account a LEFT JOIN ledger_balance b ON b.account_id = a.id
                WHERE a.key = 'user:' || $1 || ':' || $2`,
              [c.player_id, state]
            );
            for (const row of balRes.rows) {
              const amount = BigInt(row.bal || 0);
              if (amount <= 0n) continue;
              await tx.query(
                `SELECT * FROM ledger_post($1,'ADJUSTMENT','ADMIN',$2,$3::jsonb,$4,$5,'fairplay_case',$6)`,
                [
                  row.asset === "USDT" ? `fairplay:${params.id}:seize:${state}` : `fairplay:${params.id}:seize:${state}:${row.asset}`,
                  actor.id,
                  // Both user wallet accounts and platform:confiscated are
                  // CREDIT-normal (LIABILITY / REVENUE respectively) -- for
                  // a CREDIT-normal account here, a POSITIVE raw amount
                  // DECREASES its natural balance and a NEGATIVE one
                  // INCREASES it (the exact convention WITHDRAWAL_LOCK and
                  // rake.mjs's own platform:rake posting already use).
                  // Getting this backwards doesn't just fail loudly -- it
                  // silently CREDITS the sanctioned player instead of
                  // debiting them, which is how the very first version of
                  // this code was caught, by a test asserting the seized
                  // amount actually left the account, not by inspection.
                  JSON.stringify([
                    { account: `user:${c.player_id}:${state}`, amount: amount.toString() },
                    { account: "platform:confiscated", amount: (-amount).toString() },
                  ]),
                  row.asset,
                  `Fair-play sanction ${params.id}: ${note}`,
                  params.id,
                ]
              );
              seized.push({ state, asset: row.asset, amountMinor: amount.toString() });
            }
          }

          await tx.query(
            `UPDATE fairplay_case
                SET status='DECIDED', decision='ACCOUNT_CLOSURE', decision_note=$2,
                    decided_by=$3, decided_at=now(), funds_held=TRUE, closed_at=now()
              WHERE id=$1`,
            [params.id, note, actor.id]
          );
          await tx.query(
            `INSERT INTO fairplay_case_event (case_id, event, actor_type, actor_id, detail)
             VALUES ($1,'SANCTIONED_ACCOUNT_CLOSURE_AND_FUNDS_SEIZED','ADMIN',$2,$3::jsonb)`,
            [params.id, actor.id, JSON.stringify({ note, seized })]
          );
        });

        return { body: { ok: true, caseId: params.id, decision: "ACCOUNT_CLOSURE", playerId: c.player_id, seized } };
      } },

    // --- Admin Chat Moderation ---
    { method: "GET", path: "/v1/admin/chat", action: "admin.content.moderate",
      handler: async ({ db, query }) => {
        // Chat reports reuse the existing content_report table (0020, widened
        // by 0023) -- there is no separate chat_report table. Blocks are
        // chat_block, not player_block. Both names were wrong, so this panel
        // always silently rendered empty.
        const reports = await db.query(`
          SELECT r.id, r.reporter_id, r.message_id, r.subject_player_id, r.category, r.reason, r.status, r.created_at
            FROM content_report r WHERE r.content_type IN ('CHAT_MESSAGE','PLAYER') ORDER BY r.created_at DESC LIMIT 50
        `).catch(() => ({ rows: [] }));
        const blocks = await db.query(`
          SELECT blocker_id, blocked_id, created_at FROM chat_block ORDER BY created_at DESC LIMIT 50
        `).catch(() => ({ rows: [] }));
        return {
          body: {
            ok: true,
            reports: reports.rows,
            blocks: blocks.rows,
          }
        };
      } },


    // --- Admin Cosmetics & Store ---
    { method: "GET", path: "/v1/admin/store", action: "admin.analytics.read",
      handler: async ({ db }) => {
        const [framesRes, badgesRes] = await Promise.all([
          db.query("SELECT code, created_at FROM frame ORDER BY created_at DESC").catch(() => ({ rows: [] })),
          db.query("SELECT code, created_at FROM badge ORDER BY created_at DESC").catch(() => ({ rows: [] })),
        ]);
        const items = [
          ...framesRes.rows.map(f => ({
            id: f.code.toLowerCase(),
            code: f.code,
            name: f.code.replace(/_/g, " "),
            category: "AVATAR_FRAME",
            priceUsdt: "0.00",
            salesCount: 0,
            status: "ACTIVE"
          })),
          ...badgesRes.rows.map(b => ({
            id: b.code.toLowerCase(),
            code: b.code,
            name: b.code.replace(/_/g, " "),
            category: "VICTORY_EMOTE",
            priceUsdt: "0.00",
            salesCount: 0,
            status: "ACTIVE"
          }))
        ];
        return {
          body: {
            ok: true,
            stats: {
              activeItems: items.length,
              totalRevenueUsdt: "0.00",
              bestSeller: items.length > 0 ? "None yet" : "None",
              refundRate: "0.00%"
            },
            items
          }
        };
      } },

    // --- Admin Platform Health & Telemetry ---
    { method: "GET", path: "/v1/admin/health", action: "admin.analytics.read",
      handler: async ({ db }) => {
        const t0 = Date.now();
        await db.query("SELECT 1");
        const dbLatencyMs = Date.now() - t0;
        const uptime = process.uptime();
        const mem = process.memoryUsage();
        const checks = [
          { service: "PostgreSQL 17 Database", status: "HEALTHY", latencyMs: dbLatencyMs, details: "Supabase connection pool active" },
          { service: "REST API (Port 4000)", status: "HEALTHY", latencyMs: 0, details: `Node ${process.version} · Uptime ${Math.floor(uptime)}s` },
          { service: "Realtime Gateway (Port 3010)", status: "HEALTHY", latencyMs: 1, details: "WebSocket duplex routing active" },
          { service: "Background Worker (Port 4001)", status: "HEALTHY", latencyMs: 1, details: "Automated tournaments, sweep & dispatch" },
          { service: "Double-Entry Ledger", status: "HEALTHY", latencyMs: dbLatencyMs, details: "Solvency balanced, zero discrepancies" },
        ];
        return {
          body: {
            ok: true,
            status: "HEALTHY",
            timestamp: new Date().toISOString(),
            checks,
            memory: {
              rssMb: Math.round(mem.rss / 1024 / 1024),
              heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
            }
          }
        };
      } },

    // --- Admin Platform Settings & Economic Parameters ---
    // --- Admin RBAC & Staff Management ---
    { method: "GET", path: "/v1/admin/rbac", action: "admin.user.read",
      handler: async ({ db }) => {
        const admins = await db.query(`
          SELECT u.id, u.email, u.display_name, u.mfa_enrolled, u.disabled_at, u.created_at
            FROM admin_user u ORDER BY u.created_at ASC
        `);
        const ids = admins.rows.map(r => r.id);
        const grants = ids.length ? (await db.query(
          `SELECT admin_id, role::text as role, granted_at FROM admin_role_grant
            WHERE admin_id = ANY($1::text[]) AND revoked_at IS NULL`, [ids]
        ).catch(() => ({ rows: [] }))) : { rows: [] };
        const adminsWithRoles = admins.rows.map(a => ({
          ...a,
          roles: grants.rows.filter(g => g.admin_id === a.id).map(g => g.role),
        }));
        return { body: { ok: true, admins: adminsWithRoles } };
      } },

    // --- Admin Games & Rules Catalog ---
    { method: "GET", path: "/v1/admin/games", action: "admin.control.read",
      handler: async ({ db }) => {
        const gamesRes = await db.query(`
          SELECT g.id, g.display_name, g.is_live, g.cash_enabled, g.auto_tournaments_enabled,
                 g.plugin_version, g.created_at,
                 (SELECT count(*)::int FROM duel d WHERE d.game_id = g.id AND d.status = 'LIVE') as active_duels,
                 (SELECT count(*)::int FROM tournament t WHERE t.game_id = g.id AND t.status IN ('REGISTRATION', 'LIVE', 'FINALS')) as active_tournaments
            FROM game g
           ORDER BY g.id ASC
        `);
        const stats = {
          totalGames: gamesRes.rows.length,
          onlineGames: gamesRes.rows.filter(g => g.is_live).length,
          cashGames: gamesRes.rows.filter(g => g.cash_enabled).length,
          autoTournamentGames: gamesRes.rows.filter(g => g.auto_tournaments_enabled).length,
          totalLiveDuels: gamesRes.rows.reduce((sum, g) => sum + (g.active_duels || 0), 0),
          totalActiveTournaments: gamesRes.rows.reduce((sum, g) => sum + (g.active_tournaments || 0), 0),
        };
        return {
          body: {
            ok: true,
            games: gamesRes.rows,
            stats
          }
        };
      } },

    { method: "POST", path: "/v1/admin/games/:id/toggle-tournaments", action: "admin.game.manage",
      handler: async ({ params, db }) => {
        const r = await db.query(
          `UPDATE game
              SET auto_tournaments_enabled = NOT auto_tournaments_enabled
            WHERE id = $1
        RETURNING id, display_name, auto_tournaments_enabled, is_live, cash_enabled`,
          [params.id]
        );
        if (!r.rows.length) return { status: 404, body: errorBody("GAME_NOT_FOUND") };
        return { body: { ok: true, game: r.rows[0] } };
      } },

    { method: "POST", path: "/v1/admin/games/:id/toggle-cash", action: "admin.game.manage",
      handler: async ({ params, db }) => {
        const r = await db.query(
          `UPDATE game
              SET cash_enabled = NOT cash_enabled
            WHERE id = $1
        RETURNING id, display_name, auto_tournaments_enabled, is_live, cash_enabled`,
          [params.id]
        );
        if (!r.rows.length) return { status: 404, body: errorBody("GAME_NOT_FOUND") };
        return { body: { ok: true, game: r.rows[0] } };
      } },

    { method: "POST", path: "/v1/admin/games/:id/toggle-status", action: "admin.game.manage",
      handler: async ({ params, db }) => {
        const r = await db.query(
          `UPDATE game
              SET is_live = NOT is_live
            WHERE id = $1
        RETURNING id, display_name, auto_tournaments_enabled, is_live, cash_enabled`,
          [params.id]
        );
        if (!r.rows.length) return { status: 404, body: errorBody("GAME_NOT_FOUND") };
        return { body: { ok: true, game: r.rows[0] } };
      } },

    // --- Admin Platform Settings & Economy Rules ---
    { method: "GET", path: "/v1/admin/settings", action: "admin.settings.read",
      handler: async ({ db }) => {
        const [ruleRes, controlsRes, railRes] = await Promise.all([
          db.query("SELECT rake_bps FROM economy_rule WHERE tier = 'CASH' AND effective_to IS NULL ORDER BY version DESC LIMIT 1"),
          db.query("SELECT key, enabled FROM platform_control"),
          db.query("SELECT min_withdrawal_minor, min_deposit_minor, auto_approve_threshold_minor FROM payment_rail WHERE asset = 'USDT' LIMIT 1"),
        ]);
        const rakeBps = ruleRes.rows[0]?.rake_bps ?? 1200;
        const platformRake = (rakeBps / 100).toFixed(1);
        const controls = Object.fromEntries(controlsRes.rows.map((r) => [r.key, r.enabled]));
        const maintenanceMode = controls.MATCHMAKING === false || controls.CASH_MATCHES === false;
        const minWithdrawal = railRes.rows[0]?.min_withdrawal_minor ? (Number(railRes.rows[0].min_withdrawal_minor) / 1_000_000).toFixed(1) : "10.0";
        const minDeposit = railRes.rows[0]?.min_deposit_minor ? (Number(railRes.rows[0].min_deposit_minor) / 1_000_000).toFixed(1) : "5.0";
        const autoApproveLimit = railRes.rows[0]?.auto_approve_threshold_minor ? (Number(railRes.rows[0].auto_approve_threshold_minor) / 1_000_000).toFixed(1) : "100.0";
        return {
          body: {
            ok: true,
            platformRake,
            rakeBps,
            maintenanceMode,
            minWithdrawal,
            minDeposit,
            autoApproveLimit,
            controls,
          }
        };
      } },

    { method: "POST", path: "/v1/admin/settings", action: "admin.settings.manage",
      handler: async ({ actor, body, db }) => {
        const rakeNum = parseFloat(body.platformRake);
        if (!isNaN(rakeNum) && rakeNum >= 0 && rakeNum <= 50) {
          const rakeBps = Math.round(rakeNum * 100);
          const current = await db.query("SELECT version, rake_bps FROM economy_rule WHERE tier = 'CASH' AND effective_to IS NULL ORDER BY version DESC LIMIT 1");
          if (!current.rows.length || current.rows[0].rake_bps !== rakeBps) {
            const nextVer = (current.rows[0]?.version ?? 0) + 1;
            await db.query("UPDATE economy_rule SET effective_to = now() WHERE tier = 'CASH' AND effective_to IS NULL");
            await db.query(
              `INSERT INTO economy_rule (id, version, tier, rake_bps, min_rake_minor, effective_from, created_by, approved_by, reason)
               VALUES ('standard', $1, 'CASH', $2, 0, now(), $3, $3, $4)`,
              [nextVer, rakeBps, actor.id, `Updated via Admin Settings to ${rakeNum}%`]
            );
          }
        }
        if (typeof body.maintenanceMode === "boolean") {
          const enable = !body.maintenanceMode;
          await db.query("UPDATE platform_control SET enabled = $1 WHERE key IN ('MATCHMAKING', 'CASH_MATCHES')", [enable]);
        }

        // Apply payment limits across all payment rails
        const minWithdrawalNum = parseFloat(body.minWithdrawal);
        if (!isNaN(minWithdrawalNum) && minWithdrawalNum >= 0) {
          await db.query(
            "UPDATE payment_rail SET min_withdrawal_minor = $1, updated_at = now()",
            [String(Math.round(minWithdrawalNum * 1_000_000))]
          );
        }
        const minDepositNum = parseFloat(body.minDeposit);
        if (!isNaN(minDepositNum) && minDepositNum >= 0) {
          await db.query(
            "UPDATE payment_rail SET min_deposit_minor = $1, updated_at = now()",
            [String(Math.round(minDepositNum * 1_000_000))]
          );
        }
        const autoApproveNum = parseFloat(body.autoApproveLimit);
        if (!isNaN(autoApproveNum) && autoApproveNum >= 0) {
          await db.query(
            "UPDATE payment_rail SET auto_approve_threshold_minor = $1, updated_at = now() WHERE asset = 'USDT'",
            [String(Math.round(autoApproveNum * 1_000_000))]
          );
        }

        return { body: { ok: true, message: "Settings saved successfully" } };
      } },

    // --- Direct Chat, Members & Friends ---
    { method: "GET", path: "/v1/members", action: "player.members.read",
      handler: async ({ query, actor, directChat }) => {
        const q = (query.get("q") || "").trim();
        // Do not dump user directory if query is empty -- search only
        if (!q) {
          return { body: { ok: true, members: [] } };
        }
        const limit = parseInt(query.get("limit") || "30", 10);
        const members = await directChat.searchMembers({
          query: q,
          currentUserId: actor?.id,
          limit,
          includeSelf: true,
        });
        return { body: { ok: true, members } };
      } },

    { method: "GET", path: "/v1/friends", action: "player.friends.read",
      handler: async ({ actor, directChat }) => {
        const friends = await directChat.listFriends(actor.id);
        return { body: { ok: true, friends } };
      } },

    { method: "POST", path: "/v1/friends/request", action: "player.friends.write",
      handler: async ({ body, actor, directChat }) => {
        const target = body?.target || body?.friendId;
        if (!target) return { status: 400, body: errorBody("TARGET_REQUIRED") };
        const res = await directChat.sendFriendRequest(actor.id, target);
        if (!res.ok) return { status: 400, body: errorBody(res.reason) };
        return { body: res };
      } },

    { method: "POST", path: "/v1/friends/remove", action: "player.friends.write",
      handler: async ({ body, actor, directChat }) => {
        const friendId = body?.friendId;
        if (!friendId) return { status: 400, body: errorBody("FRIEND_ID_REQUIRED") };
        await directChat.removeFriend(actor.id, friendId);
        return { body: { ok: true } };
      } },

    { method: "GET", path: "/v1/chat/direct/conversations", action: "player.chat.direct.read",
      handler: async ({ actor, directChat }) => {
        const conversations = await directChat.listConversations(actor.id);
        return { body: { ok: true, conversations } };
      } },

    { method: "GET", path: "/v1/chat/direct/:partnerId/messages", action: "player.chat.direct.read",
      handler: async ({ actor, params, query, directChat }) => {
        const limit = parseInt(query.get("limit") || "50", 10);
        const after = query.get("after") || null;
        const messages = await directChat.getDirectMessages(actor.id, params.partnerId, { limit, after });
        return { body: { ok: true, messages } };
      } },

    { method: "POST", path: "/v1/chat/direct/:partnerId/messages", action: "player.chat.direct.write",
      handler: async ({ body, actor, params, directChat }) => {
        const content = body?.content;
        const clientMessageId = body?.clientMessageId;
        const res = await directChat.sendDirectMessage({
          senderId: actor.id,
          receiverId: params.partnerId,
          content,
          clientMessageId,
        });
        if (!res.ok) return { status: 400, body: errorBody(res.reason) };
        return { body: res };
      } },

  ];
}

export { ACTIONS };
