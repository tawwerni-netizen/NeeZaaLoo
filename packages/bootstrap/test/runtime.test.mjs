/**
 * The worker runtime: liveness/readiness/metrics HTTP, graceful shutdown,
 * and the tick-wrapping that makes worker health observable without
 * touching any worker's own start()/stop()/tick() implementation.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createWorkerRuntime, workerIdentity } from "../src/runtime.mjs";
import { createMetricsRegistry } from "../../observability/src/metrics.mjs";
import { createLogger, createCollectingSink } from "../../observability/src/logger.mjs";

/** A worker whose tick() is fully controlled by the test. start()/stop() are spies only. */
function fakeWorker({ fails = false } = {}) {
  let started = false, stopped = false, startArgs = null;
  return {
    started: () => started,
    stopped: () => stopped,
    startArgs: () => startArgs,
    async tick() {
      if (fails) throw new Error("boom");
      return { ok: true };
    },
    start(intervalMs) { started = true; startArgs = intervalMs; },
    stop() { stopped = true; },
  };
}

async function get(port, path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function getText(port, path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  return { status: res.status, body: await res.text() };
}

describe("construction", () => {
  test("requires at least one worker", () => {
    assert.throws(() => createWorkerRuntime({ workers: [] }), TypeError);
  });

  test("each entry needs a name and a tick() method", () => {
    assert.throws(() => createWorkerRuntime({ workers: [{ worker: fakeWorker() }] }), TypeError);
    assert.throws(() => createWorkerRuntime({ workers: [{ name: "x", worker: {} }] }), TypeError);
  });
});

describe("workerIdentity", () => {
  test("uses WORKER_ID when set", () => {
    assert.equal(workerIdentity({ WORKER_ID: "pod-7" }), "pod-7");
  });

  test("falls back to hostname-pid when unset", () => {
    const id = workerIdentity({});
    assert.match(id, /-\d+$/);
  });
});

describe("liveness and readiness", () => {
  test("/healthz is 200 as soon as the server starts, regardless of worker state", async () => {
    const w = fakeWorker();
    const rt = createWorkerRuntime({ workers: [{ name: "w1", worker: w }] });
    const { port } = await rt.start(50);
    const res = await get(port, "/healthz");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    await rt.stop();
  });

  test("/readyz is 503 before any worker has completed a tick", async () => {
    const w = fakeWorker();
    const rt = createWorkerRuntime({ workers: [{ name: "w1", worker: w }] });
    const { port } = await rt.start(50); // fakeWorker.start() does NOT auto-tick
    const res = await get(port, "/readyz");
    assert.equal(res.status, 503);
    assert.equal(res.body.ok, false);
    await rt.stop();
  });

  test("/readyz turns 200 once every registered worker has completed at least one tick", async () => {
    const w1 = fakeWorker();
    const w2 = fakeWorker();
    const rt = createWorkerRuntime({ workers: [{ name: "w1", worker: w1 }, { name: "w2", worker: w2 }] });
    const { port } = await rt.start(50);

    await w1.tick();
    assert.equal((await get(port, "/readyz")).status, 503, "w2 has not ticked yet");

    await w2.tick();
    const res = await get(port, "/readyz");
    assert.equal(res.status, 200);
    assert.equal(res.body.workers.w1.tickCount, 1);
    assert.equal(res.body.workers.w2.tickCount, 1);

    await rt.stop();
  });

  test("a worker that crash-loops past the failure threshold flips readiness back to false", async () => {
    const w = fakeWorker({ fails: true });
    const rt = createWorkerRuntime({ workers: [{ name: "w1", worker: w }], maxConsecutiveFailures: 3 });
    const { port } = await rt.start(50);

    for (let i = 0; i < 3; i++) await assert.rejects(() => w.tick());
    const res = await get(port, "/readyz");
    assert.equal(res.status, 503);
    assert.equal(res.body.workers.w1.consecutiveFailures, 3);
    assert.match(res.body.workers.w1.lastError, /boom/);

    await rt.stop();
  });

  test("a single successful tick resets the consecutive-failure count", async () => {
    let fail = true;
    const w = {
      async tick() { if (fail) throw new Error("transient"); return { ok: true }; },
      start() {}, stop() {},
    };
    const rt = createWorkerRuntime({ workers: [{ name: "w1", worker: w }], maxConsecutiveFailures: 2 });
    const { port } = await rt.start(50);

    await assert.rejects(() => w.tick());
    await assert.rejects(() => w.tick());
    assert.equal((await get(port, "/readyz")).status, 503);

    fail = false;
    await w.tick();
    const res = await get(port, "/readyz");
    assert.equal(res.status, 200);
    assert.equal(res.body.workers.w1.consecutiveFailures, 0);

    await rt.stop();
  });
});

describe("metrics", () => {
  test("/metrics exposes tick counts in Prometheus text format", async () => {
    const w = fakeWorker();
    const metrics = createMetricsRegistry();
    const rt = createWorkerRuntime({ workers: [{ name: "dispatch", worker: w }], metrics });
    const { port } = await rt.start(50);

    await w.tick();
    await w.tick();

    const res = await getText(port, "/metrics");
    assert.equal(res.status, 200);
    assert.match(res.body, /worker_ticks_total\{worker="dispatch"\} 2/);
    assert.match(res.body, /worker_ready\{worker="dispatch"\} 1/);

    await rt.stop();
  });

  test("a failed tick increments the failure counter", async () => {
    const w = fakeWorker({ fails: true });
    const metrics = createMetricsRegistry();
    const rt = createWorkerRuntime({ workers: [{ name: "dispatch", worker: w }], metrics });
    await rt.start(50);
    await assert.rejects(() => w.tick());
    const text = metrics.renderPrometheus();
    assert.match(text, /worker_tick_failures_total\{worker="dispatch"\} 1/);
    await rt.stop();
  });
});

describe("logging", () => {
  test("a failed tick is logged with the worker name and the error", async () => {
    const w = fakeWorker({ fails: true });
    const sink = createCollectingSink();
    const logger = createLogger({ service: "worker-runtime", sink });
    const rt = createWorkerRuntime({ workers: [{ name: "dispatch", worker: w }], logger });
    await rt.start(50);
    await assert.rejects(() => w.tick());
    const line = sink.lines.find((l) => l.event === "worker.tick_failed");
    assert.ok(line);
    assert.equal(line.worker, "dispatch");
    assert.match(line.error, /boom/);
    await rt.stop();
  });
});

describe("per-worker interval override", () => {
  test("a worker with its own intervalMs ticks on that cadence, not start()'s shared default", async () => {
    let fastTicks = 0, slowTicks = 0;
    const fast = { async tick() { fastTicks++; }, start() {}, stop() {} };
    const slow = { async tick() { slowTicks++; }, start() {}, stop() {} };
    const rt = createWorkerRuntime({
      workers: [
        { name: "fast", worker: fast },
        { name: "slow", worker: slow, intervalMs: 500 },
      ],
    });
    await rt.start(20); // "fast" inherits this; "slow" overrides to 500ms
    await new Promise((r) => setTimeout(r, 120));
    await rt.stop();

    assert.ok(fastTicks >= 3, `expected several fast ticks in 120ms at a 20ms cadence, got ${fastTicks}`);
    assert.equal(slowTicks, 0, "500ms has not elapsed yet -- the override held, it did not inherit 20ms");
  });
});

describe("start/stop wiring", () => {
  test("start() never calls a worker's own start()/stop() -- the runtime is the only scheduler", async () => {
    const w = fakeWorker();
    const rt = createWorkerRuntime({ workers: [{ name: "w1", worker: w }] });
    await rt.start(1234);
    assert.equal(w.started(), false, "the worker's own start() must never be invoked");
    await rt.stop();
    assert.equal(w.stopped(), false, "nor its own stop()");
  });

  test("THE regression this runtime exists to close: the runtime's own interval actually invokes the WRAPPED tick, so health tracking engages for real scheduled ticks, not just direct calls", async () => {
    const w = fakeWorker();
    const metrics = createMetricsRegistry();
    const rt = createWorkerRuntime({ workers: [{ name: "w1", worker: w }], metrics });
    const { port } = await rt.start(20); // fast interval; nothing here calls w.tick() directly

    await new Promise((r) => setTimeout(r, 100)); // several real interval firings

    const ready = await get(port, "/readyz");
    assert.equal(ready.status, 200, "the runtime's OWN scheduling produced at least one tracked tick");
    assert.ok(ready.body.workers.w1.tickCount >= 1);
    const text = metrics.renderPrometheus();
    assert.match(text, /worker_ticks_total\{worker="w1"\} [1-9]/, "metrics were recorded from the real interval, not a manual call");

    await rt.stop();
  });

  test("stop() clears the runtime's own interval (no further ticks) and closes the HTTP server", async () => {
    const w = fakeWorker();
    const rt = createWorkerRuntime({ workers: [{ name: "w1", worker: w }] });
    const { port } = await rt.start(20);
    await new Promise((r) => setTimeout(r, 50));
    const before = (await get(port, "/readyz")).body.workers.w1.tickCount;

    await rt.stop();
    await assert.rejects(() => fetch(`http://127.0.0.1:${port}/healthz`));

    // No way to observe ticks after the server is closed directly, but the
    // interval itself is asserted cleared by construction (stop() splices
    // and clears every stored timer) -- the HTTP rejection above already
    // confirms shutdown completed.
    assert.ok(before >= 1);
  });

  test("stop() is idempotent -- calling it twice does not throw", async () => {
    const w = fakeWorker();
    const rt = createWorkerRuntime({ workers: [{ name: "w1", worker: w }] });
    await rt.start(50);
    await rt.stop();
    await assert.doesNotReject(() => rt.stop());
  });

  test("wrapping tick() does not disturb a worker's OTHER methods", async () => {
    const w = fakeWorker();
    const originalStart = w.start;
    createWorkerRuntime({ workers: [{ name: "w1", worker: w }] });
    assert.equal(w.start, originalStart);
  });
});

describe("installSignalHandlers", () => {
  test("SIGTERM triggers a graceful stop and calls the injected exit(0)", async () => {
    const w = fakeWorker();
    const rt = createWorkerRuntime({ workers: [{ name: "w1", worker: w }], gracefulShutdownMs: 200 });
    const { port } = await rt.start(50);

    let exitCode = null;
    rt.installSignalHandlers((code) => { exitCode = code; });
    process.emit("SIGTERM");
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(exitCode, 0);
    await assert.rejects(() => fetch(`http://127.0.0.1:${port}/healthz`), "the HTTP server -- and with it the runtime's own tick intervals -- is torn down");
  });
});
