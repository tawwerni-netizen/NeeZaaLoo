/**
 * RealtimeBus (Slice 10, chat gap #2): the in-memory implementation every
 * single-instance test in this repo uses by default, and the real
 * Postgres-NOTIFY implementation that makes chat work across MULTIPLE
 * gateway processes -- see bus.mjs's own header. The genuine cross-PROCESS
 * proof lives in the live smoke harness (a unit test cannot spawn a second
 * OS process); what belongs here is the bus's own contract: publish/
 * subscribe/unsubscribe/close, and that a real failure surfaces through
 * the error hooks rather than vanishing silently.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createInMemoryBus, createPgBus, REALTIME_BUS_CHANNEL } from "../src/bus.mjs";

describe("createInMemoryBus", () => {
  test("publish delivers to every current subscriber of that topic", () => {
    const bus = createInMemoryBus();
    const seenA = [], seenB = [];
    bus.subscribe("chat:message", (m) => seenA.push(m));
    bus.subscribe("chat:message", (m) => seenB.push(m));
    bus.publish("chat:message", { hello: "world" });
    assert.deepEqual(seenA, [{ hello: "world" }]);
    assert.deepEqual(seenB, [{ hello: "world" }]);
  });

  test("a publish on a DIFFERENT topic never reaches this subscriber", () => {
    const bus = createInMemoryBus();
    const seen = [];
    bus.subscribe("chat:message", (m) => seen.push(m));
    bus.publish("chat:removed", { messageId: "1" });
    assert.deepEqual(seen, []);
  });

  test("unsubscribe stops further delivery, but does not affect other subscribers", () => {
    const bus = createInMemoryBus();
    const seenA = [], seenB = [];
    const unsub = bus.subscribe("chat:message", (m) => seenA.push(m));
    bus.subscribe("chat:message", (m) => seenB.push(m));
    unsub();
    bus.publish("chat:message", { n: 1 });
    assert.deepEqual(seenA, []);
    assert.deepEqual(seenB, [{ n: 1 }]);
  });

  test("a subscriber that throws does not prevent other subscribers from being called", () => {
    const bus = createInMemoryBus();
    const seen = [];
    bus.subscribe("chat:message", () => { throw new Error("boom"); });
    bus.subscribe("chat:message", (m) => seen.push(m));
    assert.doesNotThrow(() => bus.publish("chat:message", { n: 1 }));
    assert.deepEqual(seen, [{ n: 1 }]);
  });

  test("close() is a clean no-op that can be awaited", async () => {
    const bus = createInMemoryBus();
    await assert.doesNotReject(bus.close());
  });
});

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || "postgres://postgres:postgres@localhost:5432/skill_platform_test";
let reachable = true;
try {
  const probe = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await probe.connect();
  await probe.query("SELECT 1");
  await probe.end();
} catch { reachable = false; }

describe(
  "createPgBus, against real Postgres LISTEN/NOTIFY",
  { skip: reachable ? false : `Postgres not reachable at ${TEST_DATABASE_URL}` },
  () => {
    function pool() {
      // A tiny real pool, not the ledger's pg-adapter -- this test exercises
      // the bus in isolation, exactly the shape apps/api and apps/gateway
      // hand it.
      return new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 3 });
    }

    test("a message published on one bus instance is received by a DIFFERENT bus instance subscribed to the same topic -- the real cross-process mechanism, exercised within one process", async () => {
      const poolA = pool(); const poolB = pool();
      const busA = createPgBus({ pool: poolA, connect: async () => { const c = new pg.Client({ connectionString: TEST_DATABASE_URL }); await c.connect(); return c; } });
      const busB = createPgBus({ pool: poolB, connect: async () => { const c = new pg.Client({ connectionString: TEST_DATABASE_URL }); await c.connect(); return c; } });
      try {
        const received = await new Promise((resolve, reject) => {
          busB.subscribe("bus-test:topic", resolve);
          // subscribe() opens its LISTEN connection asynchronously; give it
          // a moment before publishing, exactly like a real gateway startup
          // beats a real API process's first publish by more than this.
          setTimeout(() => busA.publish("bus-test:topic", { marker: "cross-bus" }), 300);
          setTimeout(() => reject(new Error("timed out waiting for cross-bus delivery")), 5000);
        });
        assert.deepEqual(received, { marker: "cross-bus" });
      } finally {
        await Promise.all([busA.close(), busB.close(), poolA.end(), poolB.end()]);
      }
    });

    test("publishing before subscribe() has ever been called still succeeds (publish never requires a LISTEN connection)", async () => {
      const p = pool();
      const bus = createPgBus({ pool: p, connect: async () => { const c = new pg.Client({ connectionString: TEST_DATABASE_URL }); await c.connect(); return c; } });
      try {
        assert.doesNotThrow(() => bus.publish("bus-test:never-subscribed", { n: 1 }));
      } finally {
        await Promise.all([bus.close(), p.end()]);
      }
    });

    test("a payload over the NOTIFY size limit throws synchronously from publish(), rather than silently vanishing at the database", async () => {
      const p = pool();
      const bus = createPgBus({ pool: p, connect: async () => { const c = new pg.Client({ connectionString: TEST_DATABASE_URL }); await c.connect(); return c; } });
      try {
        assert.throws(() => bus.publish("bus-test:huge", { blob: "x".repeat(9000) }), /too large/);
      } finally {
        await Promise.all([bus.close(), p.end()]);
      }
    });

    test("onPublishError fires when the underlying pg_notify genuinely fails (a closed pool)", async () => {
      const p = pool();
      await p.end(); // pool is already closed -- every query against it must fail
      let errorSeen = null;
      const bus = createPgBus({
        pool: p,
        connect: async () => { const c = new pg.Client({ connectionString: TEST_DATABASE_URL }); await c.connect(); return c; },
        onPublishError: (err) => { errorSeen = err; },
      });
      bus.publish("bus-test:will-fail", { n: 1 });
      await new Promise((r) => setTimeout(r, 300));
      assert.ok(errorSeen, "onPublishError must be called with the real underlying error");
      await bus.close();
    });

    test("REALTIME_BUS_CHANNEL is a stable, non-empty Postgres identifier", () => {
      assert.equal(typeof REALTIME_BUS_CHANNEL, "string");
      assert.ok(REALTIME_BUS_CHANNEL.length > 0);
    });
  }
);
