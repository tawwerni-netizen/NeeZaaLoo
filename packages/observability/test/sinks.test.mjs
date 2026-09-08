import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createLogger } from "../src/logger.mjs";
import {
  createConsoleSink, createStructuredLogSink, createNullSink, createMultiSink, createPrometheusHandler,
} from "../src/sinks.mjs";
import { createMetricsRegistry } from "../src/metrics.mjs";
import { Events } from "../src/events.mjs";

function fakeStream() {
  const chunks = [];
  return { write: (s) => chunks.push(s), chunks };
}

describe("createConsoleSink", () => {
  test("renders a readable one-line summary, not raw JSON", () => {
    const stream = fakeStream();
    const sink = createConsoleSink({ stream, color: false });
    const log = createLogger({ service: "matchmaking", sink });
    log.emit(Events.MATCHMAKING.PAIRED, { duelId: "d1" });

    assert.equal(stream.chunks.length, 1);
    assert.match(stream.chunks[0], /matchmaking/);
    assert.match(stream.chunks[0], /matchmaking\.paired/);
    assert.match(stream.chunks[0], /"duelId":"d1"/);
  });

  test("still redacts -- readability is not an excuse to leak a secret", () => {
    const stream = fakeStream();
    const sink = createConsoleSink({ stream, color: false });
    const log = createLogger({ service: "auth", sink });
    log.emit(Events.AUTH.LOGIN_SUCCESS, { handle: "alice", password: "leak-me" });
    assert.doesNotMatch(stream.chunks[0], /leak-me/);
    assert.match(stream.chunks[0], /REDACTED/);
  });
});

describe("createStructuredLogSink", () => {
  test("writes the exact JSON line unchanged -- one object per line", () => {
    const stream = fakeStream();
    const sink = createStructuredLogSink({ stream });
    const log = createLogger({ service: "api", sink });
    log.emit(Events.API.REQUEST_COMPLETED, { path: "/v1/x" });

    assert.equal(stream.chunks.length, 1);
    const parsed = JSON.parse(stream.chunks[0]);
    assert.equal(parsed.event, Events.API.REQUEST_COMPLETED);
    assert.equal(parsed.path, "/v1/x");
  });
});

describe("createNullSink", () => {
  test("accepts writes and produces nothing observable, without throwing", () => {
    const sink = createNullSink();
    const log = createLogger({ service: "test", sink });
    assert.doesNotThrow(() => log.emit(Events.WORKER.TICK_STARTED, {}));
  });
});

describe("createMultiSink", () => {
  test("fans one event out to every sink", () => {
    const a = fakeStream();
    const b = fakeStream();
    const sink = createMultiSink([createStructuredLogSink({ stream: a }), createStructuredLogSink({ stream: b })]);
    const log = createLogger({ service: "test", sink });
    log.emit(Events.WORKER.TICK_COMPLETED, {});
    assert.equal(a.chunks.length, 1);
    assert.equal(b.chunks.length, 1);
    assert.deepEqual(a.chunks, b.chunks);
  });

  test("one sink throwing does not silence the others", () => {
    const good = fakeStream();
    const bad = { write: () => { throw new Error("disk full"); } };
    const sink = createMultiSink([bad, createStructuredLogSink({ stream: good })]);
    const log = createLogger({ service: "test", sink });
    assert.doesNotThrow(() => log.emit(Events.WORKER.TICK_FAILED, {}));
    assert.equal(good.chunks.length, 1);
  });
});

describe("createPrometheusHandler", () => {
  test("serves the registry's current text exposition with the right content-type", () => {
    const registry = createMetricsRegistry();
    registry.counter("duels_paired_total").inc(3);
    const handler = createPrometheusHandler(registry);

    let statusCode, headers, body = "";
    const res = {
      writeHead: (code, h) => { statusCode = code; headers = h; },
      end: (b) => { body = b; },
    };
    handler({}, res);

    assert.equal(statusCode, 200);
    assert.match(headers["content-type"], /text\/plain/);
    assert.match(body, /duels_paired_total 3/);
  });

  test("reflects metrics recorded after the handler was created -- the registry is live, not a snapshot", () => {
    const registry = createMetricsRegistry();
    const handler = createPrometheusHandler(registry);
    registry.gauge("queue_depth").set(7);

    let body = "";
    handler({}, { writeHead() {}, end: (b) => { body = b; } });
    assert.match(body, /queue_depth 7/);
  });
});
