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
import fs from "node:fs";
import { hostname } from "node:os";
import { execSync } from "node:child_process";
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
      if (port != null && port !== false) {
        httpServer = buildHttpServer();
        // Retry binding on EADDRINUSE: Hostinger spawns overlapping master
        // instances during deployment. The new child may encounter the old
        // child still holding the port. We evict stale holders and wait (up to 60s) instead of dying.
        const deadline = Date.now() + 60_000;
        while (true) {
          try {
            await new Promise((resolve, reject) => {
              const onListening = () => {
                httpServer.removeListener("error", onError);
                resolve();
              };
              const onError = (err) => {
                httpServer.removeListener("listening", onListening);
                reject(err);
              };
              httpServer.once("error", onError);
              httpServer.once("listening", onListening);
              httpServer.listen(port, "127.0.0.1");
            });
            break; // bound successfully
          } catch (err) {
            if (err.code !== "EADDRINUSE" || Date.now() >= deadline) throw err;
          const remaining = Math.round((deadline - Date.now()) / 1000);
          console.warn(`[runtime] Port ${port} busy (EADDRINUSE), evicting stale holder and retrying for ${remaining}s more...`);
          if (process.platform === "linux") {
            try {
              const hexPort = port.toString(16).toUpperCase().padStart(4, "0");
              const inodes = new Set();
              for (const f of ["/proc/net/tcp", "/proc/net/tcp6"]) {
                if (!fs.existsSync(f)) continue;
                for (const l of fs.readFileSync(f, "utf8").split("\n")) {
                  const parts = l.trim().split(/\s+/);
                  if (parts[1]?.endsWith(":" + hexPort) && parts[3] === "0A") {
                    if (parts[9] && parts[9] !== "0") inodes.add(parts[9]);
                  }
                }
              }
              if (inodes.size > 0) {
                for (const entry of fs.readdirSync("/proc")) {
                  if (!/^\d+$/.test(entry)) continue;
                  const pid = parseInt(entry, 10);
                  if (pid === process.pid) continue;
                  const fdDir = `/proc/${pid}/fd`;
                  try {
                    for (const fd of fs.readdirSync(fdDir)) {
                      const link = fs.readlinkSync(`${fdDir}/${fd}`);
                      for (const inode of inodes) {
                        if (link.includes(`socket:[${inode}]`)) {
                          process.kill(pid, "SIGKILL");
                          break;
                        }
                      }
                    }
                  } catch {}
                }
              }
            } catch {}
            try {
              const cmd = `sh -c "fuser -k ${port}/tcp 2>/dev/null || (lsof -ti:${port} 2>/dev/null | xargs kill -9 2>/dev/null) || true"`;
              execSync(cmd, { stdio: "ignore", timeout: 2000 });
            } catch {}
          }
          // Recreate the server so the next listen() starts from a clean state
          httpServer = buildHttpServer();
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
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
      let running = true;
      let consecutiveErrors = 0;
      let timer = null;

      async function scheduleNext() {
        if (!running || stopping) return;
        try {
          await worker.tick();
          consecutiveErrors = 0;
        } catch {
          consecutiveErrors++;
        }
        if (!running || stopping) return;
        let delay = effectiveIntervalMs;
        if (consecutiveErrors > 0) {
          delay = Math.min(30000, Math.max(effectiveIntervalMs, consecutiveErrors * 5000));
        }
        timer = setTimeout(scheduleNext, delay);
        if (typeof timer.unref === "function") timer.unref();
      }

      timer = setTimeout(scheduleNext, effectiveIntervalMs);
      if (typeof timer.unref === "function") timer.unref();
      timers.push({
        clear: () => {
          running = false;
          if (timer) clearTimeout(timer);
        },
      });
      logger?.emit("worker.tick_started", { worker: name, intervalMs: effectiveIntervalMs });
    }
    return { port: httpServer ? httpServer.address()?.port : null };
  },

    /**
     * Stop accepting new work and let in-flight ticks finish, bounded by
     * `gracefulShutdownMs`. This is what a SIGTERM handler should call
     * before the orchestrator's own kill timeout expires and sends SIGKILL.
     */
    async stop() {
      if (stopping) return;
      stopping = true;
      for (const item of timers.splice(0)) {
        if (item?.clear) {
          item.clear();
        } else {
          clearInterval(item);
          clearTimeout(item);
        }
      }

      if (httpServer && httpServer.listening) {
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
