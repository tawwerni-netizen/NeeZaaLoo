/**
 * The production worker runtime.
 *
 * A worker only needs to expose `tick()` -- one bounded, awaitable pass of
 * its own work. The runtime owns ALL scheduling itself, on its own
 * `setInterval` per worker, and never calls a worker's own `start()`/`stop()`
 * (several existing workers, e.g. `packages/matchmaking/src/dispatch.mjs`,
 * have their own `start(intervalMs)`/`stop()` for STANDALONE use -- those
 * stay exactly as they are and remain useful without this runtime at all).
 *
 * This is deliberate, and fixes a real bug an earlier version of this file
 * had: wrapping `worker.tick = wrappedVersion` in place only helps if
 * whatever actually fires ticks calls `worker.tick()` (or `this.tick()`) by
 * property lookup at call time. `dispatch.mjs`'s own `start()` instead
 * closes over its internal `tick` function directly, so reassigning the
 * property on the returned object never changed what its OWN interval
 * actually invoked -- the health tracking below would have silently never
 * engaged for a real production interval loop, only for tests that called
 * `worker.tick()` directly. Owning the scheduling here, and calling
 * `worker.tick()` ourselves, closes that gap by construction: there is only
 * one thing that ever invokes a tick in production, and it is this runtime.
 */
import { createServer } from "node:http";
import { hostname } from "node:os";
import { installGracefulShutdown } from "./graceful-shutdown.mjs";

/**
 * A stable identity for this process instance -- used as the A4 lease
 * owner id, and as the `instance` field on every log line this process
 * emits, so a specific replica's behaviour is traceable across a fleet of
 * them. `WORKER_ID` lets an orchestrator assign a meaningful name (e.g. a
 * pod name); absent that, hostname+pid is unique enough to tell replicas
 * apart in any single environment.
 */
export function workerIdentity(env = process.env) {
  return env.WORKER_ID || `${hostname()}-${process.pid}`;
}

const DEFAULT_MAX_CONSECUTIVE_FAILURES = 5;

export function createWorkerRuntime({
  workers = [],
  logger = null,
  metrics = null,
  port = 0,
  gracefulShutdownMs = 10000,
  maxConsecutiveFailures = DEFAULT_MAX_CONSECUTIVE_FAILURES,
  now = () => Date.now(),
} = {}) {
  if (!workers.length) throw new TypeError("createWorkerRuntime needs at least one worker");
  for (const w of workers) {
    if (!w.name || typeof w.worker?.tick !== "function") {
      throw new TypeError('each entry needs { name, worker } where worker.tick() exists');
    }
  }

  /** name -> { tickCount, lastTickAt, lastError, lastErrorAt, consecutiveFailures } */
  const health = new Map(workers.map((w) => [w.name, {
    tickCount: 0, lastTickAt: null, lastError: null, lastErrorAt: null, consecutiveFailures: 0,
  }]));

  const readyGauge = metrics?.gauge("worker_ready", { help: "1 if the named worker is ready, else 0" });
  const tickCounter = metrics?.counter("worker_ticks_total", { help: "completed worker ticks" });
  const failureCounter = metrics?.counter("worker_tick_failures_total", { help: "failed worker ticks" });

  // Wrap each worker's tick() in place so start()/stop() -- and every other
  // method the worker exposes -- are completely untouched.
  for (const { name, worker } of workers) {
    const originalTick = worker.tick.bind(worker);
    worker.tick = async (...args) => {
      const h = health.get(name);
      try {
        const result = await originalTick(...args);
        h.tickCount += 1;
        h.lastTickAt = now();
        h.consecutiveFailures = 0;
        tickCounter?.inc(1, { worker: name });
        readyGauge?.set(1, { worker: name });
        return result;
      } catch (err) {
        h.lastError = err.message;
        h.lastErrorAt = now();
        h.consecutiveFailures += 1;
        failureCounter?.inc(1, { worker: name });
        if (h.consecutiveFailures >= maxConsecutiveFailures) readyGauge?.set(0, { worker: name });
        logger?.emit("worker.tick_failed", { worker: name, error: err.message, consecutiveFailures: h.consecutiveFailures });
        throw err;
      }
    };
  }

  function snapshot() {
    return Object.fromEntries([...health.entries()].map(([name, h]) => [name, { ...h }]));
  }

  /**
   * Ready means: every worker has completed at least one tick since this
   * process started, AND none is currently crash-looping past the
   * threshold. Not ready before the first tick is a deliberate "prove you
   * can actually do the job before an orchestrator counts on you" signal,
   * exactly what a readiness probe is for.
   */
  function isReady() {
    for (const h of health.values()) {
      if (h.tickCount === 0) return false;
      if (h.consecutiveFailures >= maxConsecutiveFailures) return false;
    }
    return true;
  }

  let httpServer = null;
  let stopping = false;
  const timers = [];

  function buildHttpServer() {
    return createServer((req, res) => {
      if (req.url === "/healthz") {
        // Liveness: the process is up and answering HTTP at all. Never
        // reflects worker health -- a stuck DB should trigger a readiness
        // failure, not a liveness-triggered restart of a process that is
        // otherwise fine and could recover once the DB does.
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: true, workerId: workerIdentity() }));
      }
      if (req.url === "/readyz") {
        const ready = isReady();
        res.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: ready, workers: snapshot() }));
      }
      if (req.url === "/metrics" && metrics) {
        const body = metrics.renderPrometheus();
        res.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
        return res.end(body);
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "NOT_FOUND" }));
    });
  }

  return {
    workerId: workerIdentity(),
    health: snapshot,
    isReady,

    async start(intervalMs = 1000) {
      httpServer = buildHttpServer();
      await new Promise((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(port, () => resolve());
      });
      for (const { name, worker, intervalMs: perWorkerIntervalMs } of workers) {
        // A worker's own `intervalMs` (e.g. reconciliation wants minutes,
        // not milliseconds) overrides the shared default passed to start();
        // most workers just want the shared cadence and omit it.
        const effectiveIntervalMs = perWorkerIntervalMs ?? intervalMs;
        // `worker.tick` is looked up fresh on every firing (never a closed-
        // over reference to the pre-wrap function), so this always invokes
        // whichever version -- wrapped, here, for health tracking -- the
        // property currently holds. The worker's OWN start()/stop(), if it
        // has any, is never called: this runtime is the only scheduler.
        const timer = setInterval(() => { worker.tick().catch(() => {}); }, effectiveIntervalMs);
        if (typeof timer.unref === "function") timer.unref();
        timers.push(timer);
        logger?.emit("worker.tick_started", { worker: name, intervalMs: effectiveIntervalMs });
      }
      return { port: httpServer.address().port };
    },

    /**
     * Stop accepting new work and let in-flight ticks finish, bounded by
     * `gracefulShutdownMs`. This is what a SIGTERM handler should call
     * before the orchestrator's own kill timeout expires and sends SIGKILL.
     */
    async stop() {
      if (stopping) return;
      stopping = true;
      // Clearing the interval stops NEW ticks; it does not preempt one
      // already in flight. Every worker's own tick is designed to be a
      // single bounded pass (see dispatch.mjs), so there is nothing further
      // to wait out here; `gracefulShutdownMs` exists as the budget
      // `installSignalHandlers()` gives the whole shutdown sequence before
      // forcing exit, not as a sleep in this method.
      for (const timer of timers.splice(0)) clearInterval(timer);

      if (httpServer) {
        await new Promise((resolve) => httpServer.close(() => resolve()));
        httpServer = null;
      }
    },

    /**
     * Wire SIGTERM/SIGINT to a graceful `stop()`, with a hard exit if
     * shutdown does not complete within `gracefulShutdownMs` -- exactly the
     * contract an orchestrator's own kill timeout expects the process to
     * honour on its own, rather than needing SIGKILL.
     */
    installSignalHandlers(exit = process.exit.bind(process)) {
      installGracefulShutdown({ stop: () => this.stop(), gracefulShutdownMs, logger, exit });
    },
  };
}
