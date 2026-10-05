/**
 * Turn a plain async function into the `{ tick, start, stop }` shape
 * `createWorkerRuntime()` (and the matchmaking dispatch worker before it)
 * already expects.
 *
 * Not every service that needs to run on a schedule is shaped like a
 * dedicated worker module (`dispatch.mjs` manages its own interval because
 * it always has; `createReconciliationService()` deliberately does not,
 * since running checks IS its whole job and "run this repeatedly" is a
 * separate, reusable concern). This is that reusable concern, written once.
 */
export function createTickLoop(fn, { intervalMs: defaultIntervalMs = 60000 } = {}) {
  let timer = null;
  let running = false;
  let consecutiveErrors = 0;

  async function scheduleNext(intervalMs) {
    if (!running) return;
    try {
      await fn();
      consecutiveErrors = 0;
    } catch {
      consecutiveErrors++;
    }
    if (!running) return;
    // Error backoff: prevent tight error loops on database outages/disconnects
    let delay = intervalMs;
    if (consecutiveErrors > 0) {
      delay = Math.min(30000, Math.max(intervalMs, consecutiveErrors * 5000));
    }
    timer = setTimeout(() => { scheduleNext(intervalMs); }, delay);
    if (typeof timer.unref === "function") timer.unref();
  }

  return {
    tick: (...args) => fn(...args),
    start(intervalMs = defaultIntervalMs) {
      if (running) return;
      running = true;
      consecutiveErrors = 0;
      timer = setTimeout(() => { scheduleNext(intervalMs); }, intervalMs);
      if (typeof timer.unref === "function") timer.unref();
    },
    stop() {
      running = false;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
