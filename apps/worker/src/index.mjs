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
import { createDispatchWorker } from "../../../packages/matchmaking/src/dispatch.mjs";
import { createPaymentService } from "../../../packages/payments/src/payments.mjs";
import { createSandboxProvider } from "../../../packages/payments/src/provider.mjs";
import { createReconciliationService } from "../../../packages/reconciliation/src/reconcile.mjs";
import { createExpService } from "../../../packages/profile/src/exp.mjs";
import { createAchievementService } from "../../../packages/profile/src/achievements.mjs";
import { createBadgeService } from "../../../packages/profile/src/badges.mjs";
import { createProgressionService } from "../../../packages/progression/src/service.mjs";
import { ChessPlugin } from "../../../packages/game-chess/src/plugin.mjs";
import { SpeedMathPlugin } from "../../../packages/game-speed-math/src/plugin.mjs";
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

  const plugins = new Map([["chess", ChessPlugin], ["speed-math", SpeedMathPlugin]]);
  const settlement = createSettlementService(db);
  const store = createDuelStore(db, { emit: logger.emit });
  const mm = createMatchmakingService(db);

  const dispatchWorker = createDispatchWorker(db, {
    settlement, store, plugins, mm, emit: logger.emit,
  });

  // Sandbox only -- see the header comment. `chain` has no real on-chain
  // reader wired in yet (there is no chain-reading capability in this
  // codebase beyond the per-address `getIncoming()` shape payments.mjs
  // already depends on); deposits will not actually credit from this
  // process until a real chain reader exists, which is honest, not a bug.
  const provider = createSandboxProvider();
  const chain = { async getIncoming() { return null; } };
  const paymentSvc = createPaymentService(db, { provider, chain });
  const reconciliation = createReconciliationService(db, { paymentSvc, provider, emit: logger.emit });
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
  const progression = createProgressionService(db, { exp, achievements, badges });
  const progressionSweepIntervalMs = Number(process.env.PROGRESSION_SWEEP_INTERVAL_MS || 3000);
  const progressionSweepWorker = createTickLoop(
    async () => {
      const duels = await progression.progressionDue();
      const tournaments = await progression.tournamentProgressionDue();
      return { duels, tournaments };
    },
    { intervalMs: progressionSweepIntervalMs }
  );

  const runtime = createWorkerRuntime({
    workers: [
      { name: "matchmaking_dispatch", worker: dispatchWorker },
      // Reconciliation runs far less often than matchmaking dispatch --
      // minutes, not milliseconds -- so it declares its OWN interval here
      // rather than inheriting runtime.start()'s shared cadence.
      { name: "reconciliation", worker: reconciliationWorker, intervalMs: reconciliationIntervalMs },
      { name: "settlement_sweep", worker: settlementSweepWorker, intervalMs: settlementSweepIntervalMs },
      { name: "progression_sweep", worker: progressionSweepWorker, intervalMs: progressionSweepIntervalMs },
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
