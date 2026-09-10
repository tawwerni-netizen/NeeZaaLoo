/**
 * A thin, faithful client for TRON's own full-node HTTP API and TronGrid's
 * indexer API -- both real, documented, maintained services (TronGrid is
 * the TRON Foundation's own public gateway to these exact endpoints; the
 * same endpoints are what the official `tronweb` SDK calls under the hood).
 * Nothing here is an invented API surface:
 *
 *   POST /wallet/gettransactionbyid       -- does this transaction exist?
 *   POST /wallet/gettransactioninfobyid   -- receipt, status, event logs,
 *                                            the block it landed in
 *   GET  /wallet/getnowblock              -- the current chain head, for
 *                                            computing confirmation depth
 *   GET  /v1/accounts/{addr}/transactions/trc20
 *                                          -- TronGrid's indexed, decoded
 *                                            TRC20 transfer history for an
 *                                            address (used for DISCOVERY
 *                                            only -- see provider.mjs's own
 *                                            header for why verification
 *                                            never trusts this alone)
 *
 * See https://developers.tron.network/reference (gettransactionbyid,
 * gettransactioninfobyid, getnowblock) and
 * https://developers.tron.network/reference/get-trc20-transaction-info-by-account-address
 * for the documented shapes this file parses.
 */

export class ProviderUnavailableError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = "ProviderUnavailableError";
    this.cause = cause;
  }
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One HTTP call with a timeout and bounded retry-with-backoff for
 * TRANSIENT failures only (network error, timeout, 429, 5xx). A 4xx other
 * than 429 is a well-formed "no" from the server, not a transient fault --
 * see requestJson()'s own callers for how a genuine "not found" is told
 * apart from "the provider could not be reached", which is the exact
 * distinction the deposit flow needs to never confuse a network blip with
 * "this transaction does not exist".
 */
async function requestJson(url, {
  method = "GET",
  body,
  headers = {},
  fetchImpl = fetch,
  timeoutMs = 8000,
  maxAttempts = 3,
  baseDelayMs = 200,
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method,
        headers: body ? { "content-type": "application/json", ...headers } : headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (RETRYABLE_STATUS.has(res.status)) {
        lastError = new Error(`transient HTTP ${res.status} from ${url}`);
        if (attempt < maxAttempts) {
          await sleep(baseDelayMs * 2 ** (attempt - 1) + Math.random() * baseDelayMs);
          continue;
        }
        // Retries exhausted on a persistently transient status -- this is
        // unavailability, not a hard rejection; falling through to the
        // generic "!res.ok" branch below would wrongly throw a plain,
        // non-retryable-shaped Error instead.
        throw new ProviderUnavailableError(
          `TRON RPC unavailable after ${maxAttempts} attempts: ${url}`, { cause: lastError }
        );
      }
      if (!res.ok) {
        // A genuine, non-transient error response (a 4xx that isn't a rate
        // limit). Not a provider-unavailable condition -- the provider
        // answered; it answered "no".
        const err = new Error(`HTTP ${res.status} from ${url}`);
        err.status = res.status;
        throw err;
      }
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof ProviderUnavailableError) {
        // Already the final, correctly-shaped answer (retries exhausted on
        // a persistently transient HTTP status, thrown just above) --
        // propagate as-is rather than re-wrapping it.
        throw e;
      } else if (e.name === "AbortError") {
        lastError = new Error(`request to ${url} timed out after ${timeoutMs}ms`);
      } else if (e.status !== undefined) {
        // A real, non-transient HTTP error -- do not retry, do not mask it
        // as unavailability.
        throw e;
      } else {
        lastError = e; // network error (connection refused, DNS, reset, ...)
      }
      if (attempt < maxAttempts) {
        await sleep(baseDelayMs * 2 ** (attempt - 1) + Math.random() * baseDelayMs);
        continue;
      }
    }
  }
  throw new ProviderUnavailableError(
    `TRON RPC unavailable after ${maxAttempts} attempts: ${url}`, { cause: lastError }
  );
}

export function createTronRpcClient({
  fullNodeUrl = "https://api.trongrid.io",
  indexerUrl = fullNodeUrl,
  apiKey,
  fetchImpl = fetch,
  timeoutMs = 8000,
  maxAttempts = 3,
} = {}) {
  const headers = apiKey ? { "TRON-PRO-API-KEY": apiKey } : {};
  const call = (url, opts) => requestJson(url, { fetchImpl, timeoutMs, maxAttempts, headers, ...opts });

  return {
    /** POST /wallet/gettransactionbyid -- does this transaction exist at all (full node, not yet-solidified included)? */
    async getTransactionById(txHash) {
      const body = await call(`${fullNodeUrl}/wallet/gettransactionbyid`, {
        method: "POST", body: { value: txHash },
      });
      // The full node returns `{}` for an unknown transaction ID -- there is
      // no error status, just an empty object. This is the documented shape.
      if (!body || !body.txID) return null;
      return body;
    },

    /** POST /wallet/gettransactioninfobyid -- receipt/status/logs/blockNumber. Same "empty object = not found" shape. */
    async getTransactionInfoById(txHash) {
      const body = await call(`${fullNodeUrl}/wallet/gettransactioninfobyid`, {
        method: "POST", body: { value: txHash },
      });
      if (!body || Object.keys(body).length === 0) return null;
      return body;
    },

    /** GET /wallet/getnowblock -- the current chain head, for confirmation math. */
    async getNowBlock() {
      const body = await call(`${fullNodeUrl}/wallet/getnowblock`, { method: "GET" });
      const number = body?.block_header?.raw_data?.number;
      if (typeof number !== "number") {
        throw new Error("getnowblock response missing block_header.raw_data.number");
      }
      return { number, blockId: body.blockID };
    },

    /**
     * GET /v1/accounts/{address}/transactions/trc20 -- TronGrid's indexed,
     * already-decoded transfer history. DISCOVERY ONLY: this tells the
     * caller which transaction hashes are worth independently verifying; it
     * is never itself the basis for a credit decision (see provider.mjs).
     */
    async getTrc20TransfersToAddress({ address, contractAddress, limit = 20, minTimestamp, onlyConfirmed = true }) {
      const params = new URLSearchParams({
        limit: String(limit),
        only_to: "true",
        only_confirmed: String(onlyConfirmed),
      });
      if (contractAddress) params.set("contract_address", contractAddress);
      if (minTimestamp) params.set("min_timestamp", String(minTimestamp));
      const body = await call(`${indexerUrl}/v1/accounts/${address}/transactions/trc20?${params}`, { method: "GET" });
      if (!body?.success) throw new Error(`trc20 transfer list request reported success=false for ${address}`);
      return body.data ?? [];
    },
  };
}
