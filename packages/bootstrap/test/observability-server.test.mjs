import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createObservabilityServer } from "../src/observability-server.mjs";
import { createMetricsRegistry } from "../../observability/src/metrics.mjs";

async function get(port, path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

describe("createObservabilityServer", () => {
  test("/healthz is always 200 once started, with no checks configured", async () => {
    const srv = createObservabilityServer({});
    const { port } = await srv.start();
    const r = await get(port, "/healthz");
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    await srv.stop();
  });

  test("/readyz is 200 when every check passes", async () => {
    const srv = createObservabilityServer({
      checks: [{ name: "database", check: async () => true }],
    });
    const { port } = await srv.start();
    const r = await get(port, "/readyz");
    assert.equal(r.status, 200);
    assert.equal(r.body.checks.database, "ok");
    await srv.stop();
  });

  test("/readyz is 503 when any check fails", async () => {
    const srv = createObservabilityServer({
      checks: [
        { name: "database", check: async () => true },
        { name: "cache", check: async () => false },
      ],
    });
    const { port } = await srv.start();
    const r = await get(port, "/readyz");
    assert.equal(r.status, 503);
    assert.equal(r.body.checks.database, "ok");
    assert.equal(r.body.checks.cache, "fail");
    await srv.stop();
  });

  test("a check that throws is reported, not left to crash the server", async () => {
    const srv = createObservabilityServer({
      checks: [{ name: "database", check: async () => { throw new Error("connection refused"); } }],
    });
    const { port } = await srv.start();
    const r = await get(port, "/readyz");
    assert.equal(r.status, 503);
    assert.match(r.body.checks.database, /connection refused/);
    await srv.stop();
  });

  test("/metrics serves the registry's Prometheus text when one is provided", async () => {
    const metrics = createMetricsRegistry();
    metrics.counter("api_requests_total").inc(5);
    const srv = createObservabilityServer({ metrics });
    const { port } = await srv.start();
    const res = await fetch(`http://127.0.0.1:${port}/metrics`);
    const text = await res.text();
    assert.equal(res.status, 200);
    assert.match(text, /api_requests_total 5/);
    await srv.stop();
  });

  test("/metrics is a clean 404 when no registry was provided -- never a crash", async () => {
    const srv = createObservabilityServer({});
    const { port } = await srv.start();
    const res = await fetch(`http://127.0.0.1:${port}/metrics`);
    assert.equal(res.status, 404);
    await srv.stop();
  });

  test("an unknown path is a clean 404", async () => {
    const srv = createObservabilityServer({});
    const { port } = await srv.start();
    const r = await get(port, "/nope");
    assert.equal(r.status, 404);
    await srv.stop();
  });

  test("stop() closes the server; a request afterward fails to connect", async () => {
    const srv = createObservabilityServer({});
    const { port } = await srv.start();
    await srv.stop();
    await assert.rejects(() => fetch(`http://127.0.0.1:${port}/healthz`));
  });

  test("stop() before start(), or twice, does not throw", async () => {
    const srv = createObservabilityServer({});
    await assert.doesNotReject(() => srv.stop());
    await srv.start();
    await srv.stop();
    await assert.doesNotReject(() => srv.stop());
  });
});
