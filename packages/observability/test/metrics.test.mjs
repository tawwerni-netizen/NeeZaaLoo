import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createMetricsRegistry } from "../src/metrics.mjs";

describe("counter", () => {
  test("increments, defaulting to 1", () => {
    const reg = createMetricsRegistry();
    const c = reg.counter("matches_paired_total");
    c.inc();
    c.inc();
    c.inc(3);
    assert.equal(reg.snapshot().matches_paired_total.series[""], 5);
  });

  test("is per-label-set, not one shared number", () => {
    const reg = createMetricsRegistry();
    const c = reg.counter("api_calls_total");
    c.inc(1, { method: "GET" });
    c.inc(1, { method: "GET" });
    c.inc(1, { method: "POST" });
    const series = reg.snapshot().api_calls_total.series;
    assert.equal(series['method="GET"'], 2);
    assert.equal(series['method="POST"'], 1);
  });

  test("refuses to decrease -- a counter only ever goes up", () => {
    const reg = createMetricsRegistry();
    const c = reg.counter("x");
    assert.throws(() => c.inc(-1), RangeError);
  });

  test("label order does not create a second series for the same labels", () => {
    const reg = createMetricsRegistry();
    const c = reg.counter("x");
    c.inc(1, { a: "1", b: "2" });
    c.inc(1, { b: "2", a: "1" });
    assert.equal(Object.keys(reg.snapshot().x.series).length, 1);
    assert.equal(Object.values(reg.snapshot().x.series)[0], 2);
  });

  test("registering the same name twice with a different type is refused", () => {
    const reg = createMetricsRegistry();
    reg.counter("thing");
    assert.throws(() => reg.gauge("thing"), TypeError);
  });
});

describe("gauge", () => {
  test("set() replaces the value; inc()/dec() are relative", () => {
    const reg = createMetricsRegistry();
    const g = reg.gauge("queue_depth");
    g.set(10);
    g.inc(2);
    g.dec(5);
    assert.equal(reg.snapshot().queue_depth.series[""], 7);
  });
});

describe("histogram", () => {
  test("buckets are cumulative, and sum/count are tracked", () => {
    const reg = createMetricsRegistry();
    const h = reg.histogram("duration_ms", { buckets: [10, 100] });
    h.observe(5);
    h.observe(50);
    h.observe(500);
    const s = reg.snapshot().duration_ms.series[""];
    assert.equal(s.count, 3);
    assert.equal(s.sum, 555);
    assert.deepEqual(s.bucketCounts, [1, 2], "5<=10 (1 obs); 5 and 50 <=100 (2 obs); 500 in neither");
  });
});

describe("renderPrometheus", () => {
  test("produces a valid-looking exposition block for a counter, a gauge, and a histogram", () => {
    const reg = createMetricsRegistry();
    reg.counter("c_total", { help: "a counter" }).inc(3);
    reg.gauge("g", { help: "a gauge" }).set(42);
    reg.histogram("h_ms", { buckets: [10, 100] }).observe(50);

    const text = reg.renderPrometheus();
    assert.match(text, /# HELP c_total a counter/);
    assert.match(text, /# TYPE c_total counter/);
    assert.match(text, /^c_total 3$/m);
    assert.match(text, /^g 42$/m);
    assert.match(text, /h_ms_bucket\{le="10"\} 0/);
    assert.match(text, /h_ms_bucket\{le="100"\} 1/);
    assert.match(text, /h_ms_bucket\{le="\+Inf"\} 1/);
    assert.match(text, /h_ms_sum 50/);
    assert.match(text, /h_ms_count 1/);
  });

  test("labels render in Prometheus curly-brace form", () => {
    const reg = createMetricsRegistry();
    reg.counter("x").inc(1, { method: "pair" });
    const text = reg.renderPrometheus();
    assert.match(text, /x\{method="pair"\} 1/);
  });
});
