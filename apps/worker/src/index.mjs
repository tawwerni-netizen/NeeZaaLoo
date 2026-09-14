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
import { createPaymentService } from "../../../packages/payments/src/payments.mjs";
import { createSandboxProvider } from "../../../packages/payments/src/provider.mjs";
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
import { createReferralSweep } from "../../../packages/referral/src/index.mjs";
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
import {
  createLogger, createMetricsRegistry, createConsoleSink, createStructuredLogSink,
} from "../../../packages/observability/src/index.mjs";
import {
  createWorkerRuntime, createTickLoop, installGracefulShutdown, workerIdentity,
} from "../../../packages/bootstrap/src/index.mjs";

const { Pool } = pg;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const pool = new Pool({ connectionString: databaseUrl, max: Number(process.env.DB_POOL_SIZE || 10) });
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

  // Sandbox only -- see the header comment. `chain`, by contrast, IS the
  // real on-chain reader: createChainReader() honours CHAIN_READER=tron
  // (with TRON_API_KEY) when configured, and REFUSES TO START under
  // NODE_ENV=production without it -- deposits must never be able to
  // "confirm" from a reader that always answers null.
  const provider = createSandboxProvider();
  const chain = createChainReader();
  const paymentSvc = createPaymentService(db, {
    provider,
    chain,
    config: {
      reviewThresholdMinor: BigInt(process.env.WITHDRAWAL_REVIEW_THRESHOLD_MINOR || "500000000"), // 500 USDT ($499+ manual review)
    },
  });
  // `plugins` (constructed above) lets reconciliation's runReplayVerification()
  // independently re-derive a settled cash duel's real result and check it
  // against what was actually paid -- see reconcile.mjs's own header on why
  // this closes a real gap (a game plugin decided every payout with nothing
  // ever re-checking its answer).
  const reconciliation = createReconciliationService(db, { paymentSvc, provider, plugins, emit: logger.emit });
  const reconciliationIntervalMs = Number(process.env.RECONCILIATION_INTERVAL_MS || 60000);
  const reconciliationWorker = createTickLoop(() => reconciliation.runAll(), {
    intervalMs: reconciliationIntervalMs,
  });

  // Settlement sweep: settlement.settleDue() (packages/settlement/src/
  // settle.mjs) already existed and was already fully idempotent/
  // fair-play-aware (skips anything under fairplay_hold), but nothing in
  // any production entrypoint actually CALLED it -- a real gap this slice
  // closes, since progression below can only ever see a duel that has
  // genuinely reached SETTLED. Runs frequently: this is the ordinary,
  // expected path for every completed match, cash or free, tournament or
  // not.
  const settlementSweepIntervalMs = Number(process.env.SETTLEMENT_SWEEP_INTERVAL_MS || 3000);
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
  const progressionSweepIntervalMs = Number(process.env.PROGRESSION_SWEEP_INTERVAL_MS || 3000);
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
  // status-gated, so a faster or slower tick is always safe.
  const tournament = createTournamentService(db);
  const tournamentSweep = createTournamentSweep(db, tournament, settlement);
  const tournamentSweepIntervalMs = Number(process.env.TOURNAMENT_SWEEP_INTERVAL_MS || 3000);
  const tournamentSweepWorker = createTickLoop(() => tournamentSweep.sweepAll(), {
    intervalMs: tournamentSweepIntervalMs,
  });

  const automatedTournamentEngine = createAutomatedTournamentEngine(db, tournament);
  const automatedTournamentIntervalMs = Number(process.env.AUTOMATED_TOURNAMENT_INTERVAL_MS || 5000);
  const automatedTournamentWorker = createTickLoop(() => automatedTournamentEngine.tick(), {
    intervalMs: automatedTournamentIntervalMs,
  });

  // PLAY WITH FRIEND: "if no action within 30 seconds, EXPIRED -- the
  // system must log this automatically." A live client polling GET
  // /v1/challenges already flips a stale row lazily (challenge.mjs's own
  // expireIfDue/expireStale), but this sweep is what makes the automatic
  // part true even for a challenge nobody is looking at anymore -- a
  // closed tab, a player who never opened the popup at all. Runs often
  // given the window itself is only 30 seconds.
  const challenge = createChallengeService(db);
  const challengeExpiryIntervalMs = Number(process.env.CHALLENGE_EXPIRY_INTERVAL_MS || 5000);
  const challengeExpiryWorker = createTickLoop(() => challenge.expireStale(), {
    intervalMs: challengeExpiryIntervalMs,
  });

  // Referral Reward Settlement Sweep: sweeps qualifying deposits (>= $5) from
  // attributed referees, verifies anti-fraud scoring, and atomically posts the
  // $1 reward through the double-entry ledger.
  const referralSweep = createReferralSweep(db);
  const referralSweepIntervalMs = Number(process.env.REFERRAL_SWEEP_INTERVAL_MS || 10000);
  const referralSweepWorker = createTickLoop(() => referralSweep.sweepDue(), {
    intervalMs: referralSweepIntervalMs,
  });

  const runtime = createWorkerRuntime({
    workers: [
      { name: "matchmaking_dispatch", worker: dispatchWorker },
      // Reconciliation runs far less often than matchmaking dispatch --
      // minutes, not milliseconds -- so it declares its OWN interval here
      // rather than inheriting runtime.start()'s shared cadence.
      { name: "reconciliation", worker: reconciliationWorker, intervalMs: reconciliationIntervalMs },
      { name: "settlement_sweep", worker: settlementSweepWorker, intervalMs: settlementSweepIntervalMs },
      { name: "progression_sweep", worker: progressionSweepWorker, intervalMs: progressionSweepIntervalMs },
      { name: "tournament_sweep", worker: tournamentSweepWorker, intervalMs: tournamentSweepIntervalMs },
      { name: "automated_tournament", worker: automatedTournamentWorker, intervalMs: automatedTournamentIntervalMs },
      { name: "challenge_expiry", worker: challengeExpiryWorker, intervalMs: challengeExpiryIntervalMs },
      { name: "referral_sweep", worker: referralSweepWorker, intervalMs: referralSweepIntervalMs },
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
