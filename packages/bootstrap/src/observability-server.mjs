/**
 * The health/readiness/metrics HTTP surface, for processes that are NOT a
 * ticking worker (the REST API, the realtime gateway) and so cannot use
 * `createWorkerRuntime`'s tick-tracking readiness model. Readiness here is
 * whatever the caller says it is -- a list of named async checks (e.g. "can
 * I reach the database") -- rather than "has completed a tick", since a
 * request-driven server has no ticks to have completed.
 */
import { createServer } from "node:http";

export function createObservabilityServer({ metrics = null, checks = [], port = 0 } = {}) {
  let server = null;

  async function runChecks() {
    const results = {};
    let allOk = true;
    for (const { name, check } of checks) {
      try {
        const ok = await check();
        results[name] = ok ? "ok" : "fail";
        if (!ok) allOk = false;
      } catch (err) {
        results[name] = `error: ${err.message}`;
        allOk = false;
      }
    }
    return { ok: allOk, checks: results };
  }

  return {
    async start() {
      server = createServer(async (req, res) => {
        if (req.url === "/healthz") {
          res.writeHead(200, { "content-type": "application/json" });
          return res.end(JSON.stringify({ ok: true }));
        }
        if (req.url === "/readyz") {
          const result = await runChecks();
          res.writeHead(result.ok ? 200 : 503, { "content-type": "application/json" });
          return res.end(JSON.stringify(result));
        }
        if (req.url === "/metrics" && metrics) {
          const body = metrics.renderPrometheus();
          res.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
          return res.end(body);
        }
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "NOT_FOUND" }));
      });
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, () => resolve());
      });
      return { port: server.address().port };
    },
    async stop() {
      if (!server) return;
      await new Promise((resolve) => server.close(() => resolve()));
      server = null;
    },
  };
}
