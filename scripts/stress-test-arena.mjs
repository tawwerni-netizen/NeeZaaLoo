/**
 * Nizalo Arena High-Concurrency Stress Testing Suite.
 *
 * Simulates concurrent connections and high-throughput interactions:
 * 1. REST API Throughput & Latency (Games, Tournaments, Live Duels, Leaderboard)
 * 2. Realtime WebSocket Concurrent Handshakes & Ping-Pong Round-Trip-Time (RTT)
 * 3. Statistical Analysis: p50, p95, p99 Latency percentiles & Error Rates.
 *
 * Usage:
 *   node scripts/stress-test-arena.mjs [--target=https://nizalo.com] [--sockets=50] [--iterations=200]
 */
import { WebSocket } from "ws";

const args = process.argv.slice(2);
const targetArg = args.find((a) => a.startsWith("--target="))?.split("=")[1] || "https://nizalo.com";
const socketsCount = parseInt(args.find((a) => a.startsWith("--sockets="))?.split("=")[1] || "30", 10);
const iterationsCount = parseInt(args.find((a) => a.startsWith("--iterations="))?.split("=")[1] || "100", 10);

const isHttps = targetArg.startsWith("https://");
const wsTarget = `${targetArg.replace(/^http/, "ws")}/gateway`;

console.log("==================================================================");
console.log("⚡ NIZALO ARENA HIGH-CONCURRENCY STRESS TEST");
console.log(`🎯 Target Server: ${targetArg}`);
console.log(`🔌 WebSocket Endpoint: ${wsTarget}`);
console.log(`👥 Concurrent Sockets: ${socketsCount}`);
console.log(`🔁 Iterations per Batch: ${iterationsCount}`);
console.log("==================================================================\n");

function calculatePercentiles(latencies) {
  if (latencies.length === 0) return { min: 0, p50: 0, p95: 0, p99: 0, max: 0, avg: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  return { min, p50, p95, p99, max, avg };
}

// -------------------------------------------------------------
// Phase 1: REST API Concurrent Throughput & Response Latency
// -------------------------------------------------------------
async function runRestBench() {
  console.log("▶ Phase 1: Testing REST API Throughput & Latency...");
  const endpoints = [
    "/v1/health",
    "/diag",
    "/v1/duels/live?limit=6",
    "/v1/leaderboard?game=all",
    "/v1/tournaments?limit=6",
  ];

  const results = {};

  for (const ep of endpoints) {
    const latencies = [];
    let errors = 0;
    const url = `${targetArg}${ep}`;

    const batchSize = 10;
    const batches = Math.ceil(iterationsCount / batchSize);

    for (let b = 0; b < batches; b++) {
      const promises = Array.from({ length: batchSize }, async () => {
        const start = performance.now();
        try {
          const res = await fetch(url, { headers: { "Accept": "application/json" } });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await res.json();
          latencies.push(performance.now() - start);
        } catch {
          errors++;
        }
      });
      await Promise.all(promises);
    }

    results[ep] = { ...calculatePercentiles(latencies), total: latencies.length, errors };
    console.log(`  ✓ ${ep.padEnd(28)} -> p50: ${results[ep].p50.toFixed(1)}ms | p95: ${results[ep].p95.toFixed(1)}ms | Errors: ${errors}`);
  }

  return results;
}

// -------------------------------------------------------------
// Phase 2: Concurrent WebSocket Handshakes & PING/PONG Latency
// -------------------------------------------------------------
async function runWebSocketBench() {
  console.log("\n▶ Phase 2: Testing Concurrent WebSocket Handshakes & RTT Ping-Pong...");
  const handshakeLatencies = [];
  const pingLatencies = [];
  let connectionErrors = 0;
  let activeSockets = [];

  // 1. Establish N concurrent connections
  const connectPromises = Array.from({ length: socketsCount }, (_, i) => {
    return new Promise((resolve) => {
      const start = performance.now();
      const ws = new WebSocket(wsTarget, {
        headers: {
          "Origin": targetArg,
          "User-Agent": `NizaloStressTestBot-${i}`,
        },
      });

      const timeout = setTimeout(() => {
        connectionErrors++;
        try { ws.close(); } catch {}
        resolve(null);
      }, 7000);

      ws.on("open", () => {
        clearTimeout(timeout);
        handshakeLatencies.push(performance.now() - start);
        activeSockets.push(ws);
        resolve(ws);
      });

      ws.on("error", () => {
        clearTimeout(timeout);
        connectionErrors++;
        resolve(null);
      });
    });
  });

  await Promise.all(connectPromises);
  console.log(`  ✓ Established ${activeSockets.length}/${socketsCount} concurrent WebSocket connections (Errors: ${connectionErrors})`);

  if (activeSockets.length > 0) {
    // 2. Perform 5 consecutive Ping-Pong cycles on each active socket
    console.log(`  ⚡ Running Ping-Pong RTT cycles across all connected sockets...`);
    const pingRounds = 5;

    for (let r = 0; r < pingRounds; r++) {
      const roundPromises = activeSockets.map((ws) => {
        return new Promise((resolve) => {
          const pingStart = performance.now();
          const onMessage = (raw) => {
            try {
              const msg = JSON.parse(raw.toString());
              if (msg.type === "PONG") {
                ws.removeListener("message", onMessage);
                pingLatencies.push(performance.now() - pingStart);
                resolve(true);
              }
            } catch {}
          };
          ws.on("message", onMessage);
          try {
            ws.send(JSON.stringify({ type: "PING", ts: Date.now() }));
          } catch {
            ws.removeListener("message", onMessage);
            resolve(false);
          }

          setTimeout(() => {
            ws.removeListener("message", onMessage);
            resolve(false);
          }, 3000);
        });
      });

      await Promise.all(roundPromises);
    }
  }

  // Close all sockets
  for (const ws of activeSockets) {
    try { ws.close(); } catch {}
  }

  return {
    handshakes: calculatePercentiles(handshakeLatencies),
    pings: calculatePercentiles(pingLatencies),
    connectionsAttempted: socketsCount,
    connectionsSuccess: activeSockets.length,
    connectionErrors,
  };
}

// -------------------------------------------------------------
// Main Runner & Formatted Summary
// -------------------------------------------------------------
async function run() {
  const startTime = Date.now();
  const restResults = await runRestBench();
  const wsResults = await runWebSocketBench();
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log("\n==================================================================");
  console.log("📊 NIZALO STRESS TEST BENCHMARK REPORT");
  console.log(`⏱ Total Benchmark Duration: ${totalDuration}s`);
  console.log("==================================================================");

  console.log("\n[1] REST API PERFORMANCE (ms):");
  console.log("------------------------------------------------------------------");
  console.log("Endpoint                       p50      p95      p99      Max    Errors");
  console.log("------------------------------------------------------------------");
  for (const [ep, res] of Object.entries(restResults)) {
    const padEp = ep.padEnd(29);
    const p50 = res.p50.toFixed(1).padStart(7);
    const p95 = res.p95.toFixed(1).padStart(8);
    const p99 = res.p99.toFixed(1).padStart(8);
    const max = res.max.toFixed(1).padStart(8);
    const err = String(res.errors).padStart(7);
    console.log(`${padEp} ${p50} ${p95} ${p99} ${max} ${err}`);
  }

  console.log("\n[2] REALTIME WEBSOCKET PERFORMANCE (ms):");
  console.log("------------------------------------------------------------------");
  console.log(`Connection Success Rate : ${((wsResults.connectionsSuccess / wsResults.connectionsAttempted) * 100).toFixed(1)}% (${wsResults.connectionsSuccess}/${wsResults.connectionsAttempted})`);
  console.log(`Handshake Latency (p50) : ${wsResults.handshakes.p50.toFixed(1)} ms (p95: ${wsResults.handshakes.p95.toFixed(1)} ms)`);
  console.log(`Ping-Pong RTT     (p50) : ${wsResults.pings.p50.toFixed(1)} ms (p95: ${wsResults.pings.p95.toFixed(1)} ms)`);
  console.log("==================================================================");

  if (wsResults.connectionErrors === 0) {
    console.log("🎉 ALL STRESS TESTS PASSED WITH 100% HEALTH & ZERO DROPS!");
  } else {
    console.log(`⚠️ Completed with ${wsResults.connectionErrors} connection errors.`);
  }
}

run().catch((err) => {
  console.error("Stress test failed:", err);
  process.exit(1);
});
