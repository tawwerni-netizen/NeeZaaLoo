/**
 * The TRON RPC client's retry/timeout/outage behaviour -- the layer
 * responsible for the brief's own rule: "Blockchain/RPC failures must
 * produce PENDING/RETRYABLE, not FAILED, and definitely not CONFIRMED."
 * That distinction starts here, where a transient failure (timeout,
 * connection reset, 5xx, 429) is retried with backoff and only becomes a
 * ProviderUnavailableError once retries are exhausted -- while a genuine
 * "no" from the server (404-shaped empty object, or a real 4xx) is never
 * retried and never confused with unavailability.
 *
 * `fetchImpl` is injected throughout, the same convention
 * createNowPaymentsProvider() uses for its own `http` parameter -- no real
 * network call happens in this file.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createTronRpcClient, ProviderUnavailableError } from "../src/tron-rpc.mjs";

function jsonResponse(body, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** A fetch stub that fails `failTimes` times (network error) then succeeds. */
function flakyFetch(failTimes, finalBody) {
  let calls = 0;
  return async () => {
    calls++;
    if (calls <= failTimes) throw new Error("ECONNRESET (simulated)");
    return jsonResponse(finalBody);
  };
}

describe("transient failures retry, then succeed", () => {
  test("a network error is retried and eventually succeeds", async () => {
    const fetchImpl = flakyFetch(2, { txID: "abc123" });
    const rpc = createTronRpcClient({ fetchImpl, maxAttempts: 3 });
    const result = await rpc.getTransactionById("abc123");
    assert.equal(result.txID, "abc123");
  });

  test("a 503 is retried and eventually succeeds", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return calls < 2 ? jsonResponse({}, { status: 503 }) : jsonResponse({ txID: "ok" });
    };
    const rpc = createTronRpcClient({ fetchImpl, maxAttempts: 3 });
    const result = await rpc.getTransactionById("x");
    assert.equal(result.txID, "ok");
    assert.equal(calls, 2);
  });

  test("a 429 (rate limit) is retried like any other transient failure", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return calls < 2 ? jsonResponse({}, { status: 429 }) : jsonResponse({ txID: "ok" });
    };
    const rpc = createTronRpcClient({ fetchImpl, maxAttempts: 3 });
    await rpc.getTransactionById("x");
    assert.equal(calls, 2);
  });
});

describe("PROVIDER TIMEOUT / PROVIDER OUTAGE: exhausted retries become ProviderUnavailableError, never a false answer", () => {
  test("a request that always times out throws ProviderUnavailableError after maxAttempts", async () => {
    const fetchImpl = (url, { signal }) => new Promise((_resolve, reject) => {
      // Never resolves on its own; only the AbortController firing ends it,
      // exactly like a real hung connection would.
      signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
    const rpc = createTronRpcClient({ fetchImpl, timeoutMs: 20, maxAttempts: 2 });
    await assert.rejects(() => rpc.getTransactionById("x"), ProviderUnavailableError);
  });

  test("a total outage (every attempt fails) throws ProviderUnavailableError, not a null/false result", async () => {
    const fetchImpl = async () => { throw new Error("connection refused (simulated outage)"); };
    const rpc = createTronRpcClient({ fetchImpl, maxAttempts: 3 });
    await assert.rejects(() => rpc.getTransactionById("x"), ProviderUnavailableError);
  });

  test("persistent 500s exhaust retries and surface as ProviderUnavailableError", async () => {
    const fetchImpl = async () => jsonResponse({}, { status: 500 });
    const rpc = createTronRpcClient({ fetchImpl, maxAttempts: 3 });
    await assert.rejects(() => rpc.getNowBlock(), ProviderUnavailableError);
  });

  test("the underlying cause is preserved for observability", async () => {
    const fetchImpl = async () => { throw new Error("DNS resolution failed (simulated)"); };
    const rpc = createTronRpcClient({ fetchImpl, maxAttempts: 2 });
    try {
      await rpc.getTransactionById("x");
      assert.fail("expected a rejection");
    } catch (e) {
      assert.ok(e instanceof ProviderUnavailableError);
      assert.match(e.cause.message, /DNS resolution failed/);
    }
  });
});

describe("a genuine 'no' is never confused with unavailability", () => {
  test("an unknown transaction (empty object body) resolves to null, not an error", async () => {
    const rpc = createTronRpcClient({ fetchImpl: async () => jsonResponse({}) });
    assert.equal(await rpc.getTransactionById("nonexistent"), null);
  });

  test("a real 4xx (not 429) throws immediately, without retrying, and is not a ProviderUnavailableError", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return jsonResponse({ error: "bad request" }, { status: 400 }); };
    const rpc = createTronRpcClient({ fetchImpl, maxAttempts: 3 });
    await assert.rejects(
      () => rpc.getTransactionById("x"),
      (e) => e.status === 400 && !(e instanceof ProviderUnavailableError)
    );
    assert.equal(calls, 1, "a non-transient 4xx is never retried");
  });
});

describe("getNowBlock() and getTrc20TransfersToAddress()", () => {
  test("getNowBlock parses block_header.raw_data.number", async () => {
    const rpc = createTronRpcClient({
      fetchImpl: async () => jsonResponse({ blockID: "abc", block_header: { raw_data: { number: 42 } } }),
    });
    const block = await rpc.getNowBlock();
    assert.equal(block.number, 42);
  });

  test("getNowBlock throws (not silently returns 0) on a malformed response", async () => {
    const rpc = createTronRpcClient({ fetchImpl: async () => jsonResponse({ blockID: "abc" }) });
    await assert.rejects(() => rpc.getNowBlock(), /missing block_header/);
  });

  test("getTrc20TransfersToAddress requests the documented indexer path with the right query params", async () => {
    const fetchImpl = async (url) => {
      assert.match(url, /^https:\/\/api\.trongrid\.io\/v1\/accounts\/TAddr\/transactions\/trc20\?/);
      assert.match(url, /only_to=true/);
      assert.match(url, /contract_address=TContract/);
      return jsonResponse({ success: true, data: [{ transaction_id: "0x1" }] });
    };
    const rpc = createTronRpcClient({ fetchImpl });
    const rows = await rpc.getTrc20TransfersToAddress({ address: "TAddr", contractAddress: "TContract" });
    assert.equal(rows[0].transaction_id, "0x1");
  });

  test("a success:false body is treated as an error, not an empty result", async () => {
    const rpc = createTronRpcClient({ fetchImpl: async () => jsonResponse({ success: false }) });
    await assert.rejects(() => rpc.getTrc20TransfersToAddress({ address: "TAddr" }), /success=false/);
  });
});

describe("the API key header, when configured", () => {
  test("is attached to every request", async () => {
    const fetchImpl = async (url, opts) => {
      assert.equal(opts.headers["TRON-PRO-API-KEY"], "test-key-123");
      return jsonResponse({ txID: "x" });
    };
    const rpc = createTronRpcClient({ fetchImpl, apiKey: "test-key-123" });
    await rpc.getTransactionById("x");
  });

  test("is absent when no key is configured", async () => {
    const fetchImpl = async (url, opts) => {
      assert.equal(opts.headers["TRON-PRO-API-KEY"], undefined);
      return jsonResponse({ txID: "x" });
    };
    const rpc = createTronRpcClient({ fetchImpl });
    await rpc.getTransactionById("x");
  });
});
