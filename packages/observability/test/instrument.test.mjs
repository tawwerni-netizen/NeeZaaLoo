/**
 * instrument() is meant to wrap ANY existing service without touching its
 * source. Proven two ways: against a small fake service (fast, precise
 * assertions), and against a REAL service already in this repo
 * (`@nizalo/matchmaking`) to show the mechanism actually generalizes rather
 * than only working against a shape built to fit it.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { instrument } from "../src/instrument.mjs";
import { createMetricsRegistry } from "../src/metrics.mjs";
import { createLogger, createCollectingSink } from "../src/logger.mjs";
import { createMatchmakingService } from "../../matchmaking/src/matchmaking.mjs";

function fakeService() {
  return {
    async ok(x) { return x * 2; },
    async boom() { throw Object.assign(new Error("insufficient funds"), { code: "INSUFFICIENT_FUNDS" }); },
    notAFunction: 42,
  };
}

describe("instrument: generic wrapping", () => {
  test("a successful call passes through its return value unchanged, and records a call + duration", async () => {
    const metrics = createMetricsRegistry();
    const svc = instrument(fakeService(), { name: "fake", metrics });
    const result = await svc.ok(21);
    assert.equal(result, 42);

    const snap = metrics.snapshot();
    assert.equal(snap.fake_calls_total.series['method="ok"'], 1);
    assert.ok(snap.fake_duration_ms.series['method="ok"'].count === 1);
  });

  test("a rejected call still throws the ORIGINAL error, but is counted as an error and logged", async () => {
    const metrics = createMetricsRegistry();
    const sink = createCollectingSink();
    const logger = createLogger({ service: "test", sink });
    const svc = instrument(fakeService(), { name: "fake", metrics, logger });

    await assert.rejects(() => svc.boom(), /insufficient funds/);

    const snap = metrics.snapshot();
    assert.equal(snap.fake_errors_total.series['method="boom"'], 1);
    assert.equal(snap.fake_calls_total.series['method="boom"'], 1, "a call that errors still counts as a call");

    assert.equal(sink.lines.length, 1);
    assert.equal(sink.lines[0].event, "service_call.failed");
    assert.equal(sink.lines[0].method, "boom");
    assert.equal(sink.lines[0].code, "INSUFFICIENT_FUNDS");
  });

  test("non-function properties pass through untouched", async () => {
    const svc = instrument(fakeService(), { name: "fake", metrics: createMetricsRegistry() });
    assert.equal(svc.notAFunction, 42);
  });

  test("instrument() requires a name -- an anonymous metric series is useless", () => {
    assert.throws(() => instrument(fakeService(), {}), TypeError);
  });

  test("redactArgs lets a caller keep sensitive call arguments out of the failure log", async () => {
    const sink = createCollectingSink();
    const logger = createLogger({ service: "test", sink });
    const svc = instrument(fakeService(), {
      name: "fake", logger, redactArgs: (method, args) => (method === "boom" ? "[withheld]" : args),
    });
    await assert.rejects(() => svc.boom());
    assert.equal(sink.lines[0].args, "[withheld]");
  });
});

describe("instrument: against a REAL service, not a fixture built to fit it", () => {
  async function freshDb() {
    const db = await PGlite.create();
    await migrate(db);
    // speed-math's own row already exists from migration 0029.
    for (const p of ["ply1", "ply2"]) await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [p]);
    return db;
  }

  test("wrapping the real matchmaking service preserves its behavior exactly", async () => {
    const db = await freshDb();
    const metrics = createMetricsRegistry();
    const mm = instrument(createMatchmakingService(db), { name: "matchmaking", metrics });

    const a = await mm.enqueue({ playerId: "ply1", gameId: "chess", ratingX100: 150000, timeControl: { initialMs: 300000 } });
    assert.equal(a.ok, true);
    const dup = await mm.enqueue({ playerId: "ply1", gameId: "chess", ratingX100: 150000, timeControl: { initialMs: 300000 } });
    assert.equal(dup.ok, false, "the real ALREADY_QUEUED business logic still runs, unmodified");

    const snap = metrics.snapshot();
    assert.equal(snap.matchmaking_calls_total.series['method="enqueue"'], 2);
    // Both calls succeeded as far as instrument() is concerned -- ALREADY_QUEUED
    // is a normal `{ok:false}` return value, not a thrown error, exactly like
    // it is for every direct caller of this service. The error counter exists
    // (registered at wrap time) but has recorded nothing.
    assert.equal(Object.keys(snap.matchmaking_errors_total.series).length, 0);
  });
});
