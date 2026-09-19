/**
 * The realtime gateway production process entrypoint.
 *
 * A separate deployable from the REST API and the background worker (see
 * apps/api, apps/worker) -- see gateway.mjs's own header for why. This
 * process:
 *
 *   1. recovers whatever was LIVE when it (or a predecessor) last exited
 *      (`store.recoverLive()`);
 *   2. runs the claim sweep (`sweepUnclaimableDuels`) on an interval, which
 *      is what makes A4's lease actually matter in a running deployment --
 *      it is the thing that notices a newly-live duel (paired by the
 *      matchmaking worker, a SEPARATE process) or a dead peer's expired
 *      lease, and claims it;
 *   3. renews this instance's own held leases, sweeps timed-out duels, and
 *      drops dead WebSocket connections, all on the SAME
 *      `createWorkerRuntime` used by apps/worker, for the identical
 *      health/readiness/metrics/graceful-shutdown story.
 */
import pg from "pg";
import { createPgAdapter } from "../../../packages/ledger/src/pg-adapter.mjs";
import { createAuthService } from "../../../packages/auth/src/service.mjs";
import { createDuelStore } from "../../../packages/realtime/src/store.mjs";
import { createLeaseManager } from "../../../packages/realtime/src/lease.mjs";
import { createGateway } from "../../../packages/realtime/src/gateway.mjs";
import { createPgBus } from "../../../packages/realtime/src/bus.mjs";
import { sweepUnclaimableDuels } from "../../../packages/realtime/src/claim-sweep.mjs";
import { createFairPlayEngine } from "../../../packages/fairplay/src/engine.mjs";
import { createChannelService } from "../../../packages/chat/src/channels.mjs";
import { createModerationService } from "../../../packages/chat/src/moderation.mjs";
import { createBlockService } from "../../../packages/chat/src/blocks.mjs";
import { createMessageService } from "../../../packages/chat/src/messages.mjs";
import { ChessPlugin } from "../../../packages/game-chess/src/plugin.mjs";
import { createChessAiAdapter } from "../../../packages/game-chess/src/ai.mjs";
import { SpeedMathPlugin } from "../../../packages/game-speed-math/src/plugin.mjs";
import { createSpeedMathAiAdapter } from "../../../packages/game-speed-math/src/ai.mjs";
import { CheckersPlugin } from "../../../packages/game-checkers/src/plugin.mjs";
import { BilliardsPlugin } from "../../../packages/game-billiards/src/plugin.mjs";
import { createCheckersAiAdapter } from "../../../packages/game-checkers/src/ai.mjs";
import { createBilliardsAiAdapter } from "../../../packages/game-billiards/src/ai.mjs";
import { ConnectFourPlugin } from "../../../packages/game-connect-four/src/plugin.mjs";
import { createConnectFourAiAdapter } from "../../../packages/game-connect-four/src/ai.mjs";
import { XOPlugin } from "../../../packages/game-xo/src/plugin.mjs";
import { createXoAiAdapter } from "../../../packages/game-xo/src/ai.mjs";
import { DominoesPlugin } from "../../../packages/game-dominoes/src/plugin.mjs";
import { createDominoesAiAdapter } from "../../../packages/game-dominoes/src/ai.mjs";
import { BackgammonPlugin } from "../../../packages/game-backgammon/src/plugin.mjs";
import { createBackgammonAiAdapter } from "../../../packages/game-backgammon/src/ai.mjs";
import { SeegaPlugin } from "../../../packages/game-seega/src/plugin.mjs";
import { createSeegaAiAdapter } from "../../../packages/game-seega/src/ai.mjs";
import { ReversiPlugin } from "../../../packages/game-reversi/src/plugin.mjs";
import { createReversiAiAdapter } from "../../../packages/game-reversi/src/ai.mjs";
import { GomokuPlugin } from "../../../packages/game-gomoku/src/plugin.mjs";
import { createGomokuAiAdapter } from "../../../packages/game-gomoku/src/ai.mjs";
import {
  createLogger, createMetricsRegistry, createConsoleSink, createStructuredLogSink,
} from "../../../packages/observability/src/index.mjs";
import {
  createWorkerRuntime, createTickLoop, installGracefulShutdown, requireEnv, loadOrGenerateKey, workerIdentity,
} from "../../../packages/bootstrap/src/index.mjs";

const { Pool } = pg;

async function main() {
  requireEnv(["DATABASE_URL"]);
  const sink = process.env.LOG_FORMAT === "pretty" ? createConsoleSink() : createStructuredLogSink();
  const logger = createLogger({ service: "gateway", sink });
  const metrics = createMetricsRegistry();

  const signingKey = loadOrGenerateKey("AUTH_SIGNING_KEY_B64", { bytes: 32, logger });
  const encryptionKey = loadOrGenerateKey("AUTH_ENCRYPTION_KEY_B64", { bytes: 32, logger });
  if (!process.env.DATABASE_URL) {
    logger.emit("system.error", { msg: "DATABASE_URL is required" });
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_SIZE || 1),
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 6000,
  });
  pool.on("error", (err) => console.error("[gw pg pool error]", err.message));
  const db = createPgAdapter(pool);

  const auth = createAuthService(db, { signingKey, encryptionKey });
  const store = createDuelStore(db, { emit: logger.emit });
  // The SAME Fair Play Engine the API process's admin/case-review surface
  // already talks to -- this process only ever adds evidence to it
  // (recordFromCompletedDuel/recordReplayedAction/recordConcurrentSeat),
  // never a second, parallel anti-cheat system.
  const fairPlay = createFairPlayEngine(db);
  const lease = createLeaseManager(db, { leaseMs: Number(process.env.LEASE_MS || 15000) });
  const plugins = new Map([
    ["chess", ChessPlugin], ["speed-math", SpeedMathPlugin],
    ["checkers", CheckersPlugin], ["billiards", BilliardsPlugin], ["connect-four", ConnectFourPlugin],
    ["xo", XOPlugin], ["dominoes", DominoesPlugin], ["backgammon", BackgammonPlugin],
    ["seega", SeegaPlugin], ["reversi", ReversiPlugin], ["gomoku", GomokuPlugin],
  ]);
  const ownerId = workerIdentity();

  const duels = new Map();
  // Startup recovery: rebuild every duel that was LIVE when a predecessor
  // exited. These are loaded but NOT yet leased to this instance -- the
  // claim sweep below takes care of that on its first tick, going through
  // the exact same compare-and-swap any other claim does.
  let recovered = new Map();
  try {
    recovered = await store.recoverLive(plugins, Date.now());
    for (const [duelId, duel] of recovered) duels.set(duelId, duel);
    logger.emit("worker.tick_started", { worker: "gateway-recovery", recovered: recovered.size });
  } catch (err) {
    console.warn("[gateway] Live recovery warning on startup (non-fatal, proceeding):", err.message);
  }

  // Realtime Chat Foundation (Slice 9) -- the SAME websocket server as
  // duels above, not a second one; see gateway.mjs's own `chat` option.
  const chatChannels = createChannelService(db);
  const chatModeration = createModerationService(db);
  const chatBlocks = createBlockService(db);
  const chatMessages = createMessageService(db, { channels: chatChannels, moderation: chatModeration, blocks: chatBlocks });

  // RealtimeBus (Slice 10, chat gap #2): a REAL cross-process transport,
  // built on Postgres LISTEN/NOTIFY -- the database this process already
  // requires, never a new infrastructure dependency. `connect` is invoked
  // lazily, exactly once, the first time this gateway's own broadcastChat
  // (or the "chat:removed" relay) calls subscribe() -- a fresh, DEDICATED
  // pg.Client (never a pool client: LISTEN needs one connection held open
  // for the process's lifetime, which the pool's own connections are never
  // guaranteed to be). Running MULTIPLE gateway processes against the same
  // DATABASE_URL is what makes them one chat, not N separate ones -- a
  // message sent to a socket on gateway A reaches a socket held open on
  // gateway B through this bus, never gateway A's local memory alone.
  // SAME names/help as gateway.mjs's own chatMetrics -- createMetricsRegistry
  // get-or-creates by name, so both call sites end up sharing one series,
  // never a second metrics system. This is the one wiring point outside
  // gateway.mjs's own closure, since the bus itself is built HERE, before
  // createGateway ever sees it.
  const chatBusMetrics = metrics ? {
    publishErrors: metrics.counter("chat_bus_publish_errors_total", { help: "Failed attempts to publish a chat event onto the RealtimeBus" }),
    listenErrors: metrics.counter("chat_bus_listen_errors_total", { help: "RealtimeBus LISTEN connection errors/drops on this instance" }),
  } : null;
  const chatBus = createPgBus({
    pool,
    connect: async () => {
      const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      return client;
    },
    onPublishError: () => chatBusMetrics?.publishErrors.inc(),
    onListenError: () => chatBusMetrics?.listenErrors.inc(),
  });

  const gw = createGateway({
    auth, duels, plugins, store, lease, ownerId, fairPlay,
    port: Number(process.env.WS_PORT || 3010),
    host: process.env.HOST || "0.0.0.0",
    // The same allowlist the REST API uses for CORS: a socket is just as
    // much a cross-origin surface, and is not covered by CORS at all.
    allowedOrigins: (process.env.CORS_ORIGINS
      || "http://localhost:3000,http://127.0.0.1:3000,https://nizalo.com,https://app.nizalo.com,https://www.nizalo.com")
      .split(",").map((s) => s.trim()).filter(Boolean),
    rateLimit: { capacity: Number(process.env.RATE_LIMIT_CAPACITY || 60), refillPerSecond: Number(process.env.RATE_LIMIT_REFILL || 10) },
    chat: { channels: chatChannels, moderation: chatModeration, blocks: chatBlocks, messages: chatMessages },
    chatBus,
    // A separate, PER-PLAYER budget from the duel rate limit above -- see
    // createGateway's own comment on why chat needs its own, reconnect-proof
    // limiter rather than reusing the per-connection one.
    chatRateLimit: {
      capacity: Number(process.env.CHAT_RATE_LIMIT_CAPACITY || 10),
      refillPerSecond: Number(process.env.CHAT_RATE_LIMIT_REFILL || 1),
    },
    // A separate, more generous budget for CHAT_JOIN -- see createGateway's
    // own comment on why sends and joins are never the same bucket.
    chatJoinRateLimit: {
      capacity: Number(process.env.CHAT_JOIN_RATE_LIMIT_CAPACITY || 30),
      refillPerSecond: Number(process.env.CHAT_JOIN_RATE_LIMIT_REFILL || 5),
    },
    // The SAME registry this process already exposes on OBSERVABILITY_PORT
    // below -- chat's counters/gauges/histogram just become more series on
    // it, never a second metrics system.
    metrics,
    // VS_COMPUTER: one adapter per game that actually has one -- today
    // exactly chess. A duel flagged `is_vs_computer` for any OTHER game
    // simply never receives a bot move (see vs-computer.mjs's own
    // AI_SUPPORTED_GAMES guard, which refuses to create one in the first
    // place).
    aiAdapters: new Map([
      ["chess", createChessAiAdapter()],
      ["checkers", createCheckersAiAdapter()],
      ["billiards", createBilliardsAiAdapter()],
      ["connect-four", createConnectFourAiAdapter()],
      ["xo", createXoAiAdapter()],
      ["speed-math", createSpeedMathAiAdapter()],
      ["dominoes", createDominoesAiAdapter()],
      ["backgammon", createBackgammonAiAdapter()],
      ["seega", createSeegaAiAdapter()],
      ["reversi", createReversiAiAdapter()],
      ["gomoku", createGomokuAiAdapter()],
    ]),
  });

  const claimSweepWorker = createTickLoop(() => sweepUnclaimableDuels(db, gw), {
    intervalMs: Number(process.env.CLAIM_SWEEP_INTERVAL_MS || 3000),
  });
  const leaseRenewalWorker = createTickLoop(() => gw.sweepLeaseRenewals(), {
    intervalMs: Number(process.env.LEASE_RENEWAL_INTERVAL_MS || 5000),
  });
  const timeoutSweepWorker = createTickLoop(() => gw.sweepTimeouts(), {
    intervalMs: Number(process.env.TIMEOUT_SWEEP_INTERVAL_MS || 1000),
  });
  const deadConnectionSweepWorker = createTickLoop(async () => gw.sweepDeadConnections(), {
    intervalMs: Number(process.env.DEAD_CONNECTION_SWEEP_INTERVAL_MS || 30000),
  });

  const runtime = createWorkerRuntime({
    workers: [
      { name: "claim_sweep", worker: claimSweepWorker, intervalMs: Number(process.env.CLAIM_SWEEP_INTERVAL_MS || 3000) },
      { name: "lease_renewal", worker: leaseRenewalWorker, intervalMs: Number(process.env.LEASE_RENEWAL_INTERVAL_MS || 5000) },
      { name: "timeout_sweep", worker: timeoutSweepWorker, intervalMs: Number(process.env.TIMEOUT_SWEEP_INTERVAL_MS || 1000) },
      { name: "dead_connection_sweep", worker: deadConnectionSweepWorker, intervalMs: Number(process.env.DEAD_CONNECTION_SWEEP_INTERVAL_MS || 30000) },
    ],
    logger,
    metrics,
    port: Number(process.env.OBSERVABILITY_PORT || 3011),
  });

  await runtime.start(1000);
  logger.emit("worker.tick_started", { worker: "gateway", workerId: ownerId, wsUrl: gw.url });

  installGracefulShutdown({
    logger,
    gracefulShutdownMs: Number(process.env.GRACEFUL_SHUTDOWN_MS || 10000),
    stop: async () => {
      await runtime.stop();
      await gw.close();
      // gw.close() only closes a bus it created itself -- this one was
      // supplied by this process, so this process closes it (UNLISTEN +
      // end the dedicated LISTEN connection, if one was ever opened).
      await chatBus.close();
      await pool.end();
    },
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("gateway failed to start", err);
  process.exit(1);
});
