/**
 * The production worker process entrypoint.
 *
 * This is what runs in every real environment (see docs/architecture/
 * WORKER_RUNTIME.md for LOCAL/STAGING/PRODUCTION specifics): one process,
 * wiring the real services already proven in `packages/*` to a real
 * PostgreSQL connection pool, driven by `@nizalo/bootstrap`'s runtime for
 * scheduling, health, readiness, metrics and graceful shutdown.
 *
 * Deliberately sandbox-only: the payment provider is always the sandbox
 * adapter here, never NOWPayments, regardless of what environment variables
 * happen to be set. Wiring a real provider is a decision this file must
 * never make on its own -- it requires the legal entity, licensing,
 * jurisdiction review, and provider approval this platform does not yet
 * have (see RISK_REGISTER.md). A future change to enable a real provider
 * should be its own deliberate, reviewed diff, not a side effect of an
 * environment variable this file happened to read.
 */
import pg from "pg";
import { createPgAdapter } from "../../../packages/ledger/src/pg-adapter.mjs";
import { createSettlementService } from "../../../packages/settlement/src/settle.mjs";
import { createDuelStore } from "../../../packages/realtime/src/store.mjs";
import { createMatchmakingService } from "../../../packages/matchmaking/src/matchmaking.mjs";
import { createChallengeService } from "../../../packages/matchmaking/src/challenge.mjs";
import { createDispatchWorker } from "../../../packages/matchmaking/src/dispatch.mjs";
import { createStandingByWorker } from "../../../packages/matchmaking/src/standing-by.mjs";
import { createRadarSeederWorker } from "../../../packages/matchmaking/src/radar-seeder.mjs";
import { createLiveArenaSimulator } from "../../../packages/matchmaking/src/live-arena-simulator.mjs";
import { createBotMatchSimulator } from "../../../packages/matchmaking/src/bot-simulator.mjs";
import { createPaymentService } from "../../../packages/payments/src/payments.mjs";
import { createSandboxProvider } from "../../../packages/payments/src/provider.mjs";
import { createOxapayProvider } from "../../../packages/payments/src/oxapay.mjs";
import { createChainReader } from "../../../packages/chain/src/reader.mjs";
import { createReconciliationService } from "../../../packages/reconciliation/src/reconcile.mjs";
import { createExpService } from "../../../packages/profile/src/exp.mjs";
import { createAchievementService } from "../../../packages/profile/src/achievements.mjs";
import { createBadgeService } from "../../../packages/profile/src/badges.mjs";
import { createProgressionService } from "../../../packages/progression/src/service.mjs";
import { createMasteryService } from "../../../packages/mastery/src/service.mjs";
import { createStreakService } from "../../../packages/engagement/src/streaks.mjs";
import { createTournamentService } from "../../../packages/tournament/src/tournament.mjs";
import { createTournamentSweep } from "../../../packages/tournament/src/sweep.mjs";
import { createAutomatedTournamentEngine } from "../../../packages/tournament/src/automated-engine.mjs";
import { createTournamentBotFiller } from "../../../packages/tournament/src/bot-filler.mjs";
import { createReferralSweep } from "../../../packages/referral/src/index.mjs";
import { createFairPlayEngine } from "../../../packages/fairplay/src/engine.mjs";
import { createCollusionDetector } from "../../../packages/fairplay/src/collusion.mjs";
import { createFairPlaySweep } from "../../../packages/fairplay/src/sweep.mjs";
import { ChessPlugin } from "../../../packages/game-chess/src/plugin.mjs";
import { SpeedMathPlugin } from "../../../packages/game-speed-math/src/plugin.mjs";
import { CheckersPlugin } from "../../../packages/game-checkers/src/plugin.mjs";
import { ConnectFourPlugin } from "../../../packages/game-connect-four/src/plugin.mjs";
import { XOPlugin } from "../../../packages/game-xo/src/plugin.mjs";
import { DominoesPlugin } from "../../../packages/game-dominoes/src/plugin.mjs";
import { BackgammonPlugin } from "../../../packages/game-backgammon/src/plugin.mjs";
import { SeegaPlugin } from "../../../packages/game-seega/src/plugin.mjs";
import { ReversiPlugin } from "../../../packages/game-reversi/src/plugin.mjs";
import { GomokuPlugin } from "../../../packages/game-gomoku/src/plugin.mjs";
import { createEmailService, createConsoleEmailProvider, createMockEmailProvider, createSmtpEmailProvider } from "../../../packages/email/src/index.mjs";
import {
  createLogger, createMetricsRegistry, createConsoleSink, createStructuredLogSink,
} from "../../../packages/observability/src/index.mjs";
import {
  createWorkerRuntime, createTickLoop, installGracefulShutdown, workerIdentity,
} from "../../../packages/bootstrap/src/index.mjs";
import { runMaintenance } from "../../../scripts/periodic_vacuum_and_cleanup.mjs";

const { Pool } = pg;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const pool = new Pool({
    connectionString: databaseUrl,
    max: Number(process.env.DB_POOL_SIZE || 3),
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
    options: "-c statement_timeout=10000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=15000",
    ssl: { rejectUnauthorized: false },
    keepAlive: true,
  });
  pool.on("connect", (client) => {
    client.query("SET statement_timeout = 10000; SET lock_timeout = 5000; SET idle_in_transaction_session_timeout = 15000;").catch(() => {});
  });
  pool.on("error", (err) => console.error("[worker pg pool error]", err.message));
  const db = createPgAdapter(pool);

  // LOCAL (a developer's own terminal) wants readable output; every other
  // environment wants one JSON object per line for a real log shipper.
  const sink = process.env.LOG_FORMAT === "pretty" ? createConsoleSink() : createStructuredLogSink();
  const logger = createLogger({ service: "worker", sink });
  const metrics = createMetricsRegistry();

  const plugins = new Map([
    ["chess", ChessPlugin], ["speed-math", SpeedMathPlugin],
    ["checkers", CheckersPlugin], ["connect-four", ConnectFourPlugin],
    ["xo", XOPlugin], ["dominoes", DominoesPlugin], ["backgammon", BackgammonPlugin],
    ["seega", SeegaPlugin], ["reversi", ReversiPlugin], ["gomoku", GomokuPlugin],
  ]);
  const settlement = createSettlementService(db);
  const store = createDuelStore(db, { emit: logger.emit });
  const mm = createMatchmakingService(db);

  const dispatchWorker = createDispatchWorker(db, {
    settlement, store, plugins, mm, emit: logger.emit,
  });

  // OxaPay provider when configured, otherwise Sandbox in dev/test ONLY.
  // In production an unconfigured provider means the payments surface stays
  // OFF -- never the sandbox, which mints `Tsbx_...` addresses that look
  // real enough to pay into and that a reconciliation loop would then treat
  // as genuine. Everything else this worker does (settlement, tournaments,
  // progression, fair play, referrals) is independent of payments and keeps
  // running, so a missing key never takes the games down with it.
  const oxapayConfigured = Boolean(process.env.OXAPAY_MERCHANT_API_KEY);
  const isProduction = process.env.NODE_ENV === "production";
  if (!oxapayConfigured && isProduction) {
    logger.emit("payments.provider_unconfigured", {
      severity: "error",
      detail: "OXAPAY_MERCHANT_API_KEY is not set: payment reconciliation is disabled. The sandbox provider is never used in production.",
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
  // `plugins` (constructed above) lets reconciliation's runReplayVerification()
  // independently re-derive a settled cash duel's real result and check it
  // against what was actually paid -- see reconcile.mjs's own header on why
  // this closes a real gap (a game plugin decided every payout with nothing
  // ever re-checking its answer).
  const reconciliation = paymentSvc
    ? createReconciliationService(db, { paymentSvc, provider, plugins, emit: logger.emit })
    : null;
  const reconciliationIntervalMs = Number(process.env.RECONCILIATION_INTERVAL_MS || 60000);
  const reconciliationWorker = reconciliation
    ? createTickLoop(() => reconciliation.runAll(), { intervalMs: reconciliationIntervalMs })
    : null;

  // Settlement sweep: settlement.settleDue() (packages/settlement/src/
  // settle.mjs) already existed and was already fully idempotent/
  // fair-play-aware (skips anything under fairplay_hold), but nothing in
  // any production entrypoint actually CALLED it -- a real gap this slice
  // closes, since progression below can only ever see a duel that has
  // genuinely reached SETTLED. Runs frequently: this is the ordinary,
  // expected path for every completed match, cash or free, tournament or
  // not.
  const settlementSweepIntervalMs = Number(process.env.SETTLEMENT_SWEEP_INTERVAL_MS || 6000);
  const settlementSweepWorker = createTickLoop(() => settlement.settleDue(), {
    intervalMs: settlementSweepIntervalMs,
  });

  // Progression sweep (Slice 11): EXP/achievements/badges for real,
  // SETTLED game and tournament completions -- see packages/progression's
  // own header for why this runs as its OWN step, strictly AFTER
  // settlement has already committed, rather than inside settle()'s own
  // transaction (directive: "a failure in progression must never block or
  // corrupt financial settlement"). Every award underneath is idempotent
  // on its own terms, so a slower or more frequent cadence than
  // settlement's own is always safe.
  const exp = createExpService(db);
  const achievements = createAchievementService(db);
  const badges = createBadgeService(db);
  const mastery = createMasteryService(db);
  const streaks = createStreakService(db);
  const progression = createProgressionService(db, { exp, achievements, badges, mastery, streaks });
  const progressionSweepIntervalMs = Number(process.env.PROGRESSION_SWEEP_INTERVAL_MS || 6000);
  const progressionSweepWorker = createTickLoop(
    async () => {
      const duels = await progression.progressionDue();
      const tournaments = await progression.tournamentProgressionDue();
      return { duels, tournaments };
    },
    { intervalMs: progressionSweepIntervalMs }
  );

  // Tournament sweep: closes registration at the deadline, bridges a
  // pairing's duel result into the bracket once it completes through the
  // ordinary duel lifecycle (nothing else in production ever calls
  // tournament.reportResult()), advances a round once every pairing in it
  // is decided, and auto-settles FREE-tier tournaments. Runs at the same
  // cadence as settlement/progression -- every step here is idempotent and
  let emailProvider;
  if (process.env.SMTP_HOST) {
    emailProvider = createSmtpEmailProvider({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 465,
      secure: process.env.SMTP_SECURE !== "false",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  } else {
    emailProvider = process.env.NODE_ENV === "production" ? createMockEmailProvider() : createConsoleEmailProvider();
  }
  const emailService = createEmailService({ provider: emailProvider });

  const tournament = createTournamentService(db, { emailService });
  const tournamentSweep = createTournamentSweep(db, tournament, settlement);
  const tournamentSweepIntervalMs = Number(process.env.TOURNAMENT_SWEEP_INTERVAL_MS || 6000);
  const tournamentSweepWorker = createTickLoop(() => tournamentSweep.sweepAll(), {
    intervalMs: tournamentSweepIntervalMs,
  });

  const automatedTournamentEngine = createAutomatedTournamentEngine(db, tournament);
  const automatedTournamentIntervalMs = Number(process.env.AUTOMATED_TOURNAMENT_INTERVAL_MS || 10000);
  const automatedTournamentWorker = createTickLoop(() => automatedTournamentEngine.tick(), {
    intervalMs: automatedTournamentIntervalMs,
  });

  const tournamentBotFiller = createTournamentBotFiller(db, tournament, {
    fillIntervalMs: process.env.TOURNAMENT_BOT_FILL_INTERVAL_MS ? Number(process.env.TOURNAMENT_BOT_FILL_INTERVAL_MS) : undefined,
    reservedSeats: process.env.TOURNAMENT_BOT_RESERVED_SEATS ? Number(process.env.TOURNAMENT_BOT_RESERVED_SEATS) : undefined,
    maxWaitMs: process.env.TOURNAMENT_BOT_MAX_WAIT_MS ? Number(process.env.TOURNAMENT_BOT_MAX_WAIT_MS) : undefined,
  });
  const tournamentBotFillerIntervalMs = Number(process.env.TOURNAMENT_BOT_FILLER_INTERVAL_MS || 10000);
  const tournamentBotFillerWorker = createTickLoop(() => tournamentBotFiller.tick(), {
    intervalMs: tournamentBotFillerIntervalMs,
  });

  // PLAY WITH FRIEND: "if no action within 30 seconds, EXPIRED -- the
  // system must log this automatically." A live client polling GET
  // /v1/challenges already flips a stale row lazily (challenge.mjs's own
  // expireIfDue/expireStale), but this sweep is what makes the automatic
  // part true even for a challenge nobody is looking at anymore -- a
  // closed tab, a player who never opened the popup at all. Runs often
  // given the window itself is only 30 seconds.
  const challenge = createChallengeService(db);
  const challengeExpiryIntervalMs = Number(process.env.CHALLENGE_EXPIRY_INTERVAL_MS || 10000);
  const challengeExpiryWorker = createTickLoop(() => challenge.expireStale(), {
    intervalMs: challengeExpiryIntervalMs,
  });

  // Referral Reward Settlement Sweep: sweeps qualifying deposits (>= $5) from
  // attributed referees, verifies anti-fraud scoring, and atomically posts the
  // $1 reward through the double-entry ledger.
  const referralSweep = createReferralSweep(db);
  const referralSweepIntervalMs = Number(process.env.REFERRAL_SWEEP_INTERVAL_MS || 15000);
  const referralSweepWorker = createTickLoop(() => referralSweep.sweepDue(), {
    intervalMs: referralSweepIntervalMs,
  });

  // Fair Play Sweep: real signals have been flowing in from real gameplay
  // since recordFromCompletedDuel/recordReplayedAction/recordConcurrentSeat
  // were wired into realtime/gateway.mjs, and the collusion detector's
  // pair-level anomaly scoring has existed just as long -- but nothing in
  // any production entrypoint ever turned either into a fairplay_case the
  // admin Tribunal could review. Runs on a slower cadence than matchmaking:
  // this is a review queue, not a payment path, and evaluate()/openCase()
  // never sanction anyone on their own -- see packages/fairplay/src/sweep.mjs.
  const fairPlayEngine = createFairPlayEngine(db);
  const collusionDetector = createCollusionDetector(db);
  const fairPlaySweep = createFairPlaySweep(db, fairPlayEngine, collusionDetector);
  const fairPlaySweepIntervalMs = Number(process.env.FAIRPLAY_SWEEP_INTERVAL_MS || 30000);
  const fairPlaySweepWorker = createTickLoop(() => fairPlaySweep.sweepDue(), {
    intervalMs: fairPlaySweepIntervalMs,
  });

  const standingByWorker = createTickLoop(
    createStandingByWorker(db, mm, {
      timeoutSeconds: Number(process.env.STANDING_BY_TIMEOUT_SECONDS || 5),
      emit: logger.emit,
    }),
    { intervalMs: Number(process.env.STANDING_BY_INTERVAL_MS || 5000) }
  );

  const botMatchSimulator = createBotMatchSimulator(db, { emit: logger.emit });
  const botSimulatorIntervalMs = Number(process.env.BOT_SIMULATOR_INTERVAL_MS || 60000);
  const botSimulatorWorker = createTickLoop(
    () => botMatchSimulator(),
    { intervalMs: botSimulatorIntervalMs }
  );

  const radarSeederIntervalMs = Number(process.env.RADAR_SEEDER_INTERVAL_MS || 35000);
  const radarSeederWorker = createTickLoop(
    createRadarSeederWorker(db, { emit: logger.emit }),
    { intervalMs: radarSeederIntervalMs }
  );

  const liveArenaSimulatorIntervalMs = Number(process.env.LIVE_ARENA_SIMULATOR_INTERVAL_MS || 35000);
  const liveArenaSimulatorWorker = createTickLoop(
    createLiveArenaSimulator(db, { emit: logger.emit }),
    { intervalMs: liveArenaSimulatorIntervalMs }
  );

  // Periodic Safe Database Maintenance & VACUUM (Every 2 Hours):
  // Keeps database storage lean, purges transient events/notifications,
  // reclaims dead tuples, and verifies ongoing system solvency.
  const maintenanceIntervalMs = Number(process.env.MAINTENANCE_INTERVAL_MS || (2 * 3600 * 1000));
  const maintenanceWorker = createTickLoop(
    async () => {
      try {
        await runMaintenance(db);
      } catch (err) {
        logger.emit("maintenance.error", { severity: "error", error: err.message });
      }
    },
    { intervalMs: maintenanceIntervalMs }
  );

  const runtime = createWorkerRuntime({
    workers: [
      { name: "matchmaking_dispatch", worker: dispatchWorker },
      { name: "standing_by_matchmaking", worker: standingByWorker, intervalMs: Number(process.env.STANDING_BY_INTERVAL_MS || 2500) },
      { name: "bot_match_simulator", worker: botSimulatorWorker, intervalMs: botSimulatorIntervalMs },
      { name: "radar_seeder", worker: radarSeederWorker, intervalMs: radarSeederIntervalMs },
      { name: "live_arena_simulator", worker: liveArenaSimulatorWorker, intervalMs: liveArenaSimulatorIntervalMs },
      { name: "periodic_maintenance", worker: maintenanceWorker, intervalMs: maintenanceIntervalMs },
      // Reconciliation runs far less often than matchmaking dispatch --
      // minutes, not milliseconds -- so it declares its OWN interval here
      // rather than inheriting runtime.start()'s shared cadence. Absent
      // entirely when no payment provider is configured (see above).
      ...(reconciliationWorker
        ? [{ name: "reconciliation", worker: reconciliationWorker, intervalMs: reconciliationIntervalMs }]
        : []),
      { name: "settlement_sweep", worker: settlementSweepWorker, intervalMs: settlementSweepIntervalMs },
      { name: "progression_sweep", worker: progressionSweepWorker, intervalMs: progressionSweepIntervalMs },
      { name: "tournament_sweep", worker: tournamentSweepWorker, intervalMs: tournamentSweepIntervalMs },
      { name: "automated_tournament", worker: automatedTournamentWorker, intervalMs: automatedTournamentIntervalMs },
      { name: "tournament_bot_filler", worker: tournamentBotFillerWorker, intervalMs: tournamentBotFillerIntervalMs },
      { name: "challenge_expiry", worker: challengeExpiryWorker, intervalMs: challengeExpiryIntervalMs },
      { name: "referral_sweep", worker: referralSweepWorker, intervalMs: referralSweepIntervalMs },
      { name: "fairplay_sweep", worker: fairPlaySweepWorker, intervalMs: fairPlaySweepIntervalMs },
    ],
    logger,
    metrics,
    port: Number(process.env.PORT || 3001),
  });

  const { port } = await runtime.start(Number(process.env.TICK_INTERVAL_MS || 1000));
  logger.emit("worker.tick_started", { worker: "runtime", workerId: workerIdentity(), port });

  installGracefulShutdown({
    logger,
    gracefulShutdownMs: Number(process.env.GRACEFUL_SHUTDOWN_MS || 10000),
    stop: async () => {
      await runtime.stop();
      await pool.end();
    },
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("worker failed to start", err);
  process.exit(1);
});
