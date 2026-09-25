import { test, describe } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createPgBus } from "../src/bus.mjs";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || "postgres://postgres:postgres@localhost:5432/skill_platform_test";
let reachable = true;
try {
  const probe = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await probe.connect();
  await probe.query("SELECT 1");
  await probe.end();
} catch { reachable = false; }

describe(
  "createPgBus Stress Test",
  { skip: reachable ? false : `Postgres not reachable at ${TEST_DATABASE_URL}` },
  () => {
    function pool() {
      return new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 10 });
    }

    test("handles a high volume of concurrent messages without dropping across instances", async () => {
      const p1 = pool();
      const p2 = pool();
      
      const bus1 = createPgBus({
        pool: p1,
        connect: async () => { const c = new pg.Client({ connectionString: TEST_DATABASE_URL }); await c.connect(); return c; }
      });
      const bus2 = createPgBus({
        pool: p2,
        connect: async () => { const c = new pg.Client({ connectionString: TEST_DATABASE_URL }); await c.connect(); return c; }
      });
      
      const MESSAGE_COUNT = 5000;
      let receivedCount = 0;
      const seenIds = new Set();
      
      try {
        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => reject(new Error(`Timeout! Received ${receivedCount}/${MESSAGE_COUNT}`)), 30000);
          
          bus2.subscribe("stress:topic", (msg) => {
            if (!seenIds.has(msg.id)) {
              seenIds.add(msg.id);
              receivedCount++;
              if (receivedCount === MESSAGE_COUNT) {
                clearTimeout(timeoutId);
                resolve();
              }
            }
          });
          
          // Allow connection to establish
          setTimeout(() => {
            const promises = [];
            for (let i = 0; i < MESSAGE_COUNT; i++) {
              promises.push(bus1.publish("stress:topic", { id: i, data: "x".repeat(100) }));
            }
          }, 1000);
        });
        
        assert.equal(receivedCount, MESSAGE_COUNT, "Should have received all messages");
      } finally {
        await Promise.all([bus1.close(), bus2.close(), p1.end(), p2.end()]);
      }
    });
  }
);
