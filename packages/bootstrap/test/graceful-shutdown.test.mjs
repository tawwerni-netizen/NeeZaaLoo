import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { installGracefulShutdown } from "../src/graceful-shutdown.mjs";

describe("installGracefulShutdown", () => {
  test("SIGTERM calls stop() then the injected exit(0)", async () => {
    let stopped = false;
    let exitCode = null;
    installGracefulShutdown({
      stop: async () => { stopped = true; },
      exit: (code) => { exitCode = code; },
    });
    process.emit("SIGTERM");
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(stopped, true);
    assert.equal(exitCode, 0);
  });

  test("a second signal while already shutting down is ignored", async () => {
    let stopCalls = 0;
    let exitCode = null;
    installGracefulShutdown({
      stop: async () => { stopCalls++; await new Promise((r) => setTimeout(r, 30)); },
      exit: (code) => { exitCode = code; },
    });
    process.emit("SIGINT");
    process.emit("SIGINT");
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(stopCalls, 1);
    assert.equal(exitCode, 0);
  });

  test("a stop() that throws exits with code 1, not left hanging", async () => {
    let exitCode = null;
    installGracefulShutdown({
      stop: async () => { throw new Error("boom"); },
      exit: (code) => { exitCode = code; },
    });
    process.emit("SIGTERM");
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(exitCode, 1);
  });

  test("a stop() that never resolves is force-exited after the grace period", async () => {
    // The hard timeout is gracefulShutdownMs + a fixed 2s buffer (see
    // graceful-shutdown.mjs) -- there is no way to make this scenario fast
    // without changing that buffer, so this one test pays the real cost.
    let exitCode = null;
    installGracefulShutdown({
      stop: () => new Promise(() => {}), // never resolves
      gracefulShutdownMs: 10,
      exit: (code) => { exitCode = code; },
    });
    process.emit("SIGTERM");
    assert.equal(exitCode, null, "not yet -- still within the grace period");
    await new Promise((r) => setTimeout(r, 2100));
    assert.equal(exitCode, 1, "hard timeout fired");
  });
});
