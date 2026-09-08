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
  return {
    tick: (...args) => fn(...args),
    start(intervalMs = defaultIntervalMs) {
      if (timer) return;
      timer = setInterval(() => { fn().catch(() => {}); }, intervalMs);
      if (typeof timer.unref === "function") timer.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
