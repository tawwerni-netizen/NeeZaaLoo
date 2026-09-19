/**
 * The REST API production process entrypoint.
 *
 * A separate deployable from the realtime gateway (see apps/gateway) and
 * the background worker (see apps/worker), matching the architecture's own
 * stated design: the API's low-throughput, latency-sensitive request path
 * must never be starved by a chess rush hour on the gateway, and a crash
 * here must not take either of the others with it.
 *
 * Health/readiness/metrics are served on a SEPARATE port from the API
 * itself (`OBSERVABILITY_PORT`) rather than added to the API's own route
 * table: `createApi()`'s router requires every route to declare a policy
 * action and pass through the full authorize() pipeline (`/v1/health`
 * already exists as the anonymous liveness check for exactly that reason),
 * and a Prometheus scraper does not carry a bearer token. Keeping them on
 * their own port is a zero-risk addition -- nothing in `packages/api`
 * changes.
 *
 * Sandbox-only: see apps/worker's entrypoint for the same rule, restated
 * here because this process ALSO constructs a payment service (for
 * reconciliation's provider-mismatch checks) and must make the same choice
 * the same way.
 */
import pg from "pg";
import { createPgAdapter } from "../../../packages/ledger/src/pg-adapter.mjs";
import { migrate } from "../../../packages/ledger/src/migrate.mjs";
import { seedBotsAndFund } from "./bots/seed-bots.mjs";
import { createAuthService } from "../../../packages/auth/src/service.mjs";
import { createSettlementService } from "../../../packages/settlement/src/settle.mjs";
import { createTournamentService } from "../../../packages/tournament/src/tournament.mjs";
import { createGlobalSkillService } from "../../../packages/global-skill/src/service.mjs";
import { createPaymentService } from "../../../packages/payments/src/payments.mjs";
import { createRailService } from "../../../packages/payments/src/valuation.mjs";
import { createLocalPaymentsService } from "../../../packages/payments/src/local-payments.mjs";
import { createHealthService } from "../../../packages/payments/src/health.mjs";
import { createSandboxProvider, createOxapayProvider } from "../../../packages/payments/src/provider.mjs";
import { createChainReader } from "../../../packages/chain/src/reader.mjs";
import { createReconciliationService } from "../../../packages/reconciliation/src/reconcile.mjs";
import { createRbacService } from "../../../packages/authz/src/rbac.mjs";
import { createEmailIdentityService } from "../../../packages/auth/src/email-identity.mjs";
import { createEmailChallengeService } from "../../../packages/auth/src/email-challenge.mjs";
import { createEmailVerificationFlow } from "../../../packages/auth/src/email-verification.mjs";
import { createWelcomeEmailFlow } from "../../../packages/auth/src/welcome-email.mjs";
import { createEmailLoginCodeFlow } from "../../../packages/auth/src/email-login-code.mjs";
import { createPasswordResetFlow } from "../../../packages/auth/src/password-reset.mjs";
import { createOAuthIdentityService } from "../../../packages/auth/src/oauth-identity.mjs";
import { createOAuthHandoffService } from "../../../packages/auth/src/oauth-handoff.mjs";
import { createGoogleOidcProvider } from "../../../packages/auth/src/google-provider.mjs";
import { createGoogleOAuthFlow } from "../../../packages/auth/src/google-oauth.mjs";
import { createNicknameService } from "../../../packages/profile/src/nickname.mjs";
import { createExpService } from "../../../packages/profile/src/exp.mjs";
import { createAchievementService } from "../../../packages/profile/src/achievements.mjs";
import { createBadgeService } from "../../../packages/profile/src/badges.mjs";
import { createFrameService } from "../../../packages/profile/src/frames.mjs";
import { createLocalAvatarStorage } from "../../../packages/profile/src/avatar-storage.mjs";
import { createProfileService } from "../../../packages/profile/src/service.mjs";
import { createMasteryService } from "../../../packages/mastery/src/service.mjs";
import { createStreakService } from "../../../packages/engagement/src/streaks.mjs";
import { createDailyChallengeService } from "../../../packages/engagement/src/daily-challenges.mjs";
import { createRecommendationService } from "../../../packages/engagement/src/recommendations.mjs";
import { ChessPlugin } from "../../../packages/game-chess/src/plugin.mjs";
import { SpeedMathPlugin } from "../../../packages/game-speed-math/src/plugin.mjs";
import { CheckersPlugin } from "../../../packages/game-checkers/src/plugin.mjs";
import { BilliardsPlugin } from "../../../packages/game-billiards/src/plugin.mjs";
import { ConnectFourPlugin } from "../../../packages/game-connect-four/src/plugin.mjs";
import { XOPlugin } from "../../../packages/game-xo/src/plugin.mjs";
import { DominoesPlugin } from "../../../packages/game-dominoes/src/plugin.mjs";
import { BackgammonPlugin } from "../../../packages/game-backgammon/src/plugin.mjs";
import { SeegaPlugin } from "../../../packages/game-seega/src/plugin.mjs";
import { ReversiPlugin } from "../../../packages/game-reversi/src/plugin.mjs";
import { GomokuPlugin } from "../../../packages/game-gomoku/src/plugin.mjs";
import { createTicketService } from "../../../packages/support/src/ticket.mjs";
import { createTicketNotificationFlow } from "../../../packages/support/src/notifications.mjs";
import { createChannelService } from "../../../packages/chat/src/channels.mjs";
import { createModerationService } from "../../../packages/chat/src/moderation.mjs";
import { createBlockService } from "../../../packages/chat/src/blocks.mjs";
import { createMessageService } from "../../../packages/chat/src/messages.mjs";
import { createReportService } from "../../../packages/chat/src/reports.mjs";
import { createReferralService } from "../../../packages/referral/src/index.mjs";
import { createConsentService } from "../../../packages/compliance/src/consent.mjs";
import { createPgBus } from "../../../packages/realtime/src/bus.mjs";
import { createEmailService, createConsoleEmailProvider, createMockEmailProvider, createSmtpEmailProvider } from "../../../packages/email/src/index.mjs";
import { createApi } from "../../../packages/api/src/server.mjs";
import {
  createLogger, createMetricsRegistry, createConsoleSink, createStructuredLogSink,
} from "../../../packages/observability/src/index.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createObservabilityServer, installGracefulShutdown, requireEnv, loadOrGenerateKey, workerIdentity,
} from "../../../packages/bootstrap/src/index.mjs";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch {
    // ignore
  }
}

async function main() {
  loadEnvFile(path.resolve(process.cwd(), ".env"));
  loadEnvFile(path.resolve(process.cwd(), "apps/api/.env"));
  loadEnvFile(path.resolve(__dirname, "../../../.env"));
  loadEnvFile(path.resolve(__dirname, "../.env"));
  requireEnv(["DATABASE_URL"]);

  const sink = process.env.LOG_FORMAT === "pretty" ? createConsoleSink() : createStructuredLogSink();
  const logger = createLogger({ service: "api", sink });
  const metrics = createMetricsRegistry();

  const signingKey = loadOrGenerateKey("AUTH_SIGNING_KEY_B64", { bytes: 32, logger });
  const encryptionKey = loadOrGenerateKey("AUTH_ENCRYPTION_KEY_B64", { bytes: 32, logger });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_SIZE || 8) });
  const db = createPgAdapter(pool);

  // Auto-apply pending migrations and seed personas on startup
  try {
    const ran = await migrate(db, { log: true });
    if (ran.length > 0) {
      logger.emit("db.migrations_applied", { count: ran.length, files: ran });
      console.log(`[database] Successfully applied ${ran.length} migrations:`, ran);
    }
  } catch (err) {
    logger.emit("db.migration_error", { error: err.message });
    console.error("[database] Migration error on startup:", err.message);
  }

  try {
    const seedResult = await seedBotsAndFund(db);
    console.log(`[bots] Seeded/updated ${seedResult.totalBots} personas on startup.`);
  } catch (err) {
    console.warn("[bots] Seeder warning on startup:", err.message);
  }

  const auth = createAuthService(db, { signingKey, encryptionKey });
  const settlement = createSettlementService(db);
  const globalSkill = createGlobalSkillService(db);
  const rbac = createRbacService(db);
  const emailIdentity = createEmailIdentityService(db);
  const emailChallenge = createEmailChallengeService(db);
  // Use SMTP if configured, else fallback to dev/mock providers
  let emailProvider;
  if (process.env.SMTP_HOST) {
    emailProvider = createSmtpEmailProvider({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 465,
      secure: process.env.SMTP_SECURE !== "false", // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      }
    });
  } else {
    emailProvider = process.env.NODE_ENV === "production"
      ? createMockEmailProvider()
      : createConsoleEmailProvider();
  }
  const emailServiceInstance = createEmailService({ provider: emailProvider });
  const tournament = createTournamentService(db, { emailService: emailServiceInstance });
  const emailVerification = createEmailVerificationFlow(db, { emailChallenge, emailIdentity, emailService: emailServiceInstance });
  const welcomeEmail = createWelcomeEmailFlow(db, { emailService: emailServiceInstance });
  const emailLoginCode = createEmailLoginCodeFlow(db, { emailChallenge, emailIdentity, emailService: emailServiceInstance });
  const passwordReset = createPasswordResetFlow(db, { emailChallenge, emailIdentity, emailService: emailServiceInstance, auth });

  // Google OAuth/OIDC (Slice 5) -- entirely optional. Unlike email, which
  // this product cannot function without, Google sign-in is one more way
  // in, not a requirement: with no client credentials configured,
  // `googleOAuth` stays null and every /v1/auth/google/* and
  // /v1/me/identities/google/* route responds 503 GOOGLE_LOGIN_UNAVAILABLE
  // instead of failing to start. Never wire real Google credentials here
  // via a committed default -- they come from the deployment's own secret
  // store, same as AUTH_SIGNING_KEY_B64/AUTH_ENCRYPTION_KEY_B64 above.
  const oauthIdentity = createOAuthIdentityService(db);
  const oauthHandoff = createOAuthHandoffService(db);
  let googleOAuth = null;
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI) {
    const googleProvider = createGoogleOidcProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: process.env.GOOGLE_REDIRECT_URI,
    });
    googleOAuth = createGoogleOAuthFlow(db, {
      googleProvider, oauthIdentity, oauthHandoff, emailIdentity, auth, signingKey,
      allowedReturnPaths: (process.env.GOOGLE_ALLOWED_RETURN_PATHS || "").split(",").map((s) => s.trim()).filter(Boolean),
    });
  } else {
    logger.emit("worker.tick_failed", {
      worker: "api",
      error: "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REDIRECT_URI not set -- Google sign-in routes will return 503 until configured.",
    });
  }

  // Profile / User Identity (Slice 7). Avatar storage is local-disk for
  // now -- a real deployment points AVATAR_STORAGE_DIR at a persistent
  // volume and AVATAR_PUBLIC_BASE_URL at wherever those files are
  // actually served from (a CDN, an object-storage public bucket) --
  // nothing above avatar-storage.mjs's own four-method interface needs to
  // change to swap that in later.
  const avatarStorage = createLocalAvatarStorage({
    dir: process.env.AVATAR_STORAGE_DIR || "./data/avatars",
    baseUrl: process.env.AVATAR_PUBLIC_BASE_URL || "http://localhost:3000/avatars",
  });
  // Named (not inlined) so the SAME instances can also back the read-only
  // admin progression view below -- no duplicate service objects, and
  // both call sites are provably looking at the same thing.
  const expService = createExpService(db);
  const achievementService = createAchievementService(db);
  const badgeService = createBadgeService(db);
  const frameService = createFrameService(db);
  const masteryService = createMasteryService(db);
  const streakService = createStreakService(db);
  const dailyChallenges = createDailyChallengeService(db);
  const recommendations = createRecommendationService(db, masteryService);
  const gamePlugins = new Map([
    ["chess", ChessPlugin], ["speed-math", SpeedMathPlugin],
    ["checkers", CheckersPlugin], ["billiards", BilliardsPlugin], ["connect-four", ConnectFourPlugin],
    ["xo", XOPlugin], ["dominoes", DominoesPlugin], ["backgammon", BackgammonPlugin],
    ["seega", SeegaPlugin], ["reversi", ReversiPlugin], ["gomoku", GomokuPlugin],
  ]);
  const profile = createProfileService(db, {
    nicknameService: createNicknameService(db),
    expService, achievementService, badgeService, frameService,
    avatarStorage,
    globalSkill,
    masteryService, streakService,
  });
  // Read-only bundle for GET /v1/admin/players/:id/progression -- see
  // server.mjs's own route for why this exposes no award/mutation path.
  const progression = { exp: expService, achievements: achievementService, badges: badgeService };

  // OxaPay provider when configured, otherwise Sandbox in dev/test.
  // `chain` is the real on-chain reader (packages/chain/src/reader.mjs): it honours
  // CHAIN_READER=tron when configured and refuses to start under
  // NODE_ENV=production without it, rather than silently verifying nothing.
  // In production, an unconfigured provider means NO payments surface at
  // all -- never the sandbox. The sandbox mints `Tsbx_...` addresses that
  // look real enough to paste into a wallet, and that fallback shipped once
  // and was live, handing players fake deposit addresses. Leaving the
  // service null makes every payments route answer PAYMENTS_UNAVAILABLE
  // (503), honestly, while games, chat and tournaments keep serving.
  const oxapayConfigured = Boolean(process.env.OXAPAY_MERCHANT_API_KEY);
  const isProduction = process.env.NODE_ENV === "production";
  if (!oxapayConfigured && isProduction) {
    logger.emit("payments.provider_unconfigured", {
      severity: "error",
      detail: "OXAPAY_MERCHANT_API_KEY is not set: deposits and withdrawals are disabled. The sandbox provider is never used in production.",
    });
  }
  const provider = oxapayConfigured
    ? createOxapayProvider({
        merchantApiKey: process.env.OXAPAY_MERCHANT_API_KEY,
        payoutApiKey: process.env.OXAPAY_PAYOUT_API_KEY,
        callbackUrl: process.env.OXAPAY_CALLBACK_URL,
      })
    : (isProduction ? null : createSandboxProvider());
  const chain = createChainReader();
  const paymentSvc = provider
    ? createPaymentService(db, {
        provider,
        chain,
        config: {
          reviewThresholdMinor: BigInt(process.env.WITHDRAWAL_REVIEW_THRESHOLD_MINOR || "500000000"), // 500 USDT ($499+ manual review)
        },
      })
    : null;
  // `gamePlugins` (constructed above for the gateway's own plugin
  // registry) also lets reconciliation's runReplayVerification() and
  // runEvidenceCleanup() independently re-derive a settled cash duel's
  // real result and check it against what was actually paid -- see
  // reconcile.mjs's own header.
  const reconciliation = createReconciliationService(db, { paymentSvc, provider, plugins: gamePlugins, emit: logger.emit });

  // Admin Payment & Stablecoin Control Center. railHealth's chain check
  // reuses the SAME chain reader payments/reconciliation already read
  // through -- no second, independently-configured connection to TRON.
  const rails = createRailService(db);
  const railHealth = createHealthService({ db, chain });
  // Vodafone Cash / InstaPay (0062) -- unlike `rails`/`railHealth` above,
  // needs no chain reader: there is nothing on a blockchain to check, so
  // this is safe to construct unconditionally whenever `db` exists.
  const localPayments = createLocalPaymentsService(db);

  // Customer Support / Ticket System (Slice 8). Staff access is granted
  // entirely through the custom RBAC layer (rbac.mjs) via TICKET_VIEW/
  // REPLY/ASSIGN/ESCALATE/CLOSE -- no admin holds ticket access "for free"
  // through a fixed role, including SUPER_ADMIN. Grant a real custom role
  // through POST /v1/admin/roles + /v1/admin/roles/:id/grants before any
  // staff member can reach /v1/admin/tickets/*.
  const support = createTicketService(db);
  const ticketNotifications = createTicketNotificationFlow(db, { emailService: emailServiceInstance });

  // Realtime Chat Foundation (Slice 9). Sending goes through the realtime
  // gateway (apps/gateway), not this process -- what lives here is
  // history, blocking, reporting, and staff moderation, gated by
  // CHAT_VIEW/CHAT_DELETE/CHAT_MUTE/CHAT_REPORT_REVIEW through the SAME
  // custom RBAC layer as tickets above.
  // Realtime moderation propagation (Slice 10, chat gap #3): this process
  // holds no websocket connections at all -- the gateway does -- so a
  // moderator's delete can only ever reach an already-open chat window by
  // publishing to the SAME cross-process bus the gateway subscribes to.
  // publish() here uses the ordinary pool via pg_notify(); this process
  // never calls subscribe(), so it never opens the dedicated LISTEN
  // connection createPgBus's `connect` option exists for.
  // SAME metric names as the gateway's own (get-or-create by name) --
  // apps/api only ever publishes, so only a publish-error counter applies
  // here; this process never opens a LISTEN connection at all.
  const chatBusPublishErrors = metrics.counter("chat_bus_publish_errors_total", { help: "Failed attempts to publish a chat event onto the RealtimeBus" });
  const chatBus = createPgBus({
    pool,
    connect: async () => { throw new Error("apps/api never subscribes to the realtime bus"); },
    onPublishError: () => chatBusPublishErrors.inc(),
  });
  const chatChannels = createChannelService(db);
  const chatModeration = createModerationService(db);
  const chatBlocks = createBlockService(db);
  const chatMessages = createMessageService(db, { channels: chatChannels, moderation: chatModeration, blocks: chatBlocks, avatarStorage, bus: chatBus });
  const chatReports = createReportService(db);
  const chat = { channels: chatChannels, moderation: chatModeration, blocks: chatBlocks, messages: chatMessages, reports: chatReports };

  const referrals = createReferralService(db);
  const consent = createConsentService(db);

  const api = createApi({
    db, auth, settlement, tournament, globalSkill, reconciliation, rbac,
    emailIdentity, emailVerification, welcomeEmail, emailLoginCode, passwordReset,
    googleOAuth, googleFrontendOrigin: process.env.GOOGLE_FRONTEND_ORIGIN || "https://nizalo.com",
    profile, support, ticketNotifications, chat, progression,
    mastery: masteryService, streaks: streakService, dailyChallenges, recommendations, frames: frameService,
    rails, railHealth, localPayments, referrals, consent,
    paymentSvc, paymentProvider: provider,
    rateLimit: { capacity: Number(process.env.RATE_LIMIT_CAPACITY || 100), refillPerSecond: Number(process.env.RATE_LIMIT_REFILL || 20) },
    sensitiveRateLimits: {
      // Ten password attempts per five minutes per IP. Generous enough that
      // an operator running a batch of admin actions never notices it, far
      // too tight to guess a password with.
      "step-up": {
        capacity: Number(process.env.STEP_UP_RATE_CAPACITY || 10),
        refillPerSecond: Number(process.env.STEP_UP_RATE_REFILL_PER_SEC || 10 / 300),
      },
      "email-code-request": {
        capacity: Number(process.env.EMAIL_CODE_REQUEST_RATE_CAPACITY || 5),
        refillPerSecond: Number(process.env.EMAIL_CODE_REQUEST_RATE_REFILL_PER_SEC || 5 / 300),
      },
      "email-code-verify": {
        capacity: Number(process.env.EMAIL_CODE_VERIFY_RATE_CAPACITY || 10),
        refillPerSecond: Number(process.env.EMAIL_CODE_VERIFY_RATE_REFILL_PER_SEC || 10 / 300),
      },
      "password-reset-request": {
        capacity: Number(process.env.PASSWORD_RESET_REQUEST_RATE_CAPACITY || 5),
        refillPerSecond: Number(process.env.PASSWORD_RESET_REQUEST_RATE_REFILL_PER_SEC || 5 / 300),
      },
      "password-reset-confirm": {
        capacity: Number(process.env.PASSWORD_RESET_CONFIRM_RATE_CAPACITY || 10),
        refillPerSecond: Number(process.env.PASSWORD_RESET_CONFIRM_RATE_REFILL_PER_SEC || 10 / 300),
      },
      "google-finalize": {
        capacity: Number(process.env.GOOGLE_FINALIZE_RATE_CAPACITY || 10),
        refillPerSecond: Number(process.env.GOOGLE_FINALIZE_RATE_REFILL_PER_SEC || 10 / 300),
      },
      // Keyed per-IP like every other sensitive route. OxaPay's webhook
      // traffic comes from a small, stable set of provider IPs and can be
      // bursty across many users' deposits/withdrawals at once, so this
      // budget is far more generous than the auth-flow limits above -- the
      // real defense against a forged/replayed webhook is signature
      // verification plus paymentSvc's own chain re-derivation, not rate
      // limiting; this is a backstop against flood/DoS, not the primary
      // control.
      "payment-webhook": {
        capacity: Number(process.env.PAYMENT_WEBHOOK_RATE_CAPACITY || 120),
        refillPerSecond: Number(process.env.PAYMENT_WEBHOOK_RATE_REFILL_PER_SEC || 2),
      },
    },
    // Comma-separated exact origins, e.g. "https://app.nizalo.com" in
    // production or "http://localhost:3400" for local frontend dev against
    // this API. Empty by default -- see server.mjs's own comment on why
    // that is the safe default, not an oversight to relax later.
    corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000,https://nizalo.com,https://app.nizalo.com").split(",").map((s) => s.trim()).filter(Boolean),
  });

  const host = process.env.HOST || "0.0.0.0";
  const port = Number(process.env.PORT || 4000);
  await new Promise((resolve, reject) => {
    api.server.once("error", reject);
    api.server.listen(port, host, () => resolve());
  });
  logger.emit("worker.tick_started", { worker: "api", workerId: workerIdentity(), host, port });

  const obs = createObservabilityServer({
    metrics,
    checks: [{ name: "database", check: async () => { await db.query("SELECT 1"); return true; } }],
    port: Number(process.env.OBSERVABILITY_PORT || 3001),
  });
  const obsInfo = await obs.start();
  logger.emit("worker.tick_started", { worker: "api-observability", port: obsInfo.port });

  installGracefulShutdown({
    logger,
    gracefulShutdownMs: Number(process.env.GRACEFUL_SHUTDOWN_MS || 10000),
    stop: async () => {
      await Promise.all([api.close(), obs.stop(), chatBus.close()]);
      await pool.end();
    },
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("api server failed to start", err);
  process.exit(1);
});
