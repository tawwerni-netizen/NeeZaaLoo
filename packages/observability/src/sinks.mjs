/**
 * Destinations for the structured events `createLogger()` produces.
 *
 * A sink is anything with `write(jsonLine: string): void` -- exactly what
 * `createLogger({ sink })` already accepts, so every sink here is a drop-in
 * replacement for the plain `process.stdout` default. Nothing here commits
 * to a managed logging or metrics vendor: there is no production bootstrap
 * process yet (see RISK_REGISTER item 18), so choosing a specific vendor now
 * would be guessing at infrastructure that does not exist. What every
 * eventual backend agrees on is: readable local output during development,
 * one JSON object per line in production (what every real log shipper --
 * CloudWatch, Loki, Datadog's agent, journald -- expects), and the
 * Prometheus text exposition format for metrics (already produced by
 * `metrics.mjs`'s `renderPrometheus()`). Swapping in a real vendor later is
 * "point the log shipper at stdout" and "point a Prometheus server's scrape
 * config at this route" -- not a rewrite of anything in this package.
 */

/**
 * Human-readable, single-line-per-event console output for local
 * development. Never used in production: production wants machine-parsable
 * JSON, not a formatted string, which is exactly what `createLogger`'s
 * default (plain `process.stdout`) already gives you -- this sink exists
 * for the LOCAL developer actually reading their own terminal.
 */
export function createConsoleSink({ stream = process.stdout, color = true } = {}) {
  const wrap = (code, s) => (color ? `[${code}m${s}[0m` : s);
  return {
    write(line) {
      const evt = JSON.parse(line);
      const { ts, event, service, ...rest } = evt;
      const head = `${wrap(90, ts)} ${wrap(36, service)} ${wrap(1, event)}`;
      const fields = Object.keys(rest).length ? " " + JSON.stringify(rest) : "";
      stream.write(head + fields + "\n");
    },
  };
}

/**
 * The production default: exactly what `createLogger` already writes to
 * `process.stdout` by default, made explicit and named so a caller can be
 * unambiguous about intent rather than relying on an implicit default, and
 * so it can be pointed at a file descriptor or any other writable stream a
 * given deployment wants (a sidecar's named pipe, a rotated log file, ...).
 */
export function createStructuredLogSink({ stream = process.stdout } = {}) {
  return { write: (line) => stream.write(line) };
}

/** Writes nothing. For tests that construct a logger but do not care about its output. */
export function createNullSink() {
  return { write() {} };
}

/** Fan a single event out to every sink in the list. One bad sink cannot silence the others. */
export function createMultiSink(sinks) {
  return {
    write(line) {
      for (const s of sinks) {
        try { s.write(line); } catch { /* one sink's failure must not silence the rest */ }
      }
    },
  };
}

/**
 * A framework-agnostic Prometheus scrape handler: `(req, res) => void`,
 * mountable on Node's bare `http` server (what `packages/api/src/server.mjs`
 * already uses) or any router built on top of it, without this package
 * taking a dependency on any specific HTTP framework.
 */
export function createPrometheusHandler(registry) {
  return function metricsHandler(req, res) {
    const body = registry.renderPrometheus();
    res.writeHead(200, {
      "content-type": "text/plain; version=0.0.4; charset=utf-8",
      "content-length": Buffer.byteLength(body),
    });
    res.end(body);
  };
}
