/**
 * SIGTERM/SIGINT -> graceful `stop()` -> exit, with a hard exit if shutdown
 * does not complete in time. The one piece of process-lifecycle wiring every
 * long-running process here needs (worker, API, gateway) -- written once so
 * `createWorkerRuntime` and the API/gateway entrypoints do not each
 * reimplement the same signal handling and hard-timeout fallback slightly
 * differently.
 */
export function installGracefulShutdown({
  stop,
  gracefulShutdownMs = 10000,
  logger = null,
  exit = process.exit.bind(process),
  signals = ["SIGTERM", "SIGINT"],
} = {}) {
  let shuttingDown = false;
  const handler = (signal) => async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger?.emit("worker.tick_completed", { worker: "runtime", signal, phase: "shutdown_started" });
    const hardTimeout = setTimeout(() => exit(1), gracefulShutdownMs + 2000);
    if (typeof hardTimeout.unref === "function") hardTimeout.unref();
    try {
      await stop();
      exit(0);
    } catch {
      exit(1);
    }
  };
  for (const signal of signals) process.on(signal, handler(signal));
}
