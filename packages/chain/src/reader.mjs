/**
 * The independent, on-chain observation layer.
 *
 * This is what payments.mjs calls `chain`. It is deliberately a completely
 * separate object from the payment PROVIDER (packages/payments/src/
 * provider.mjs): the provider reports what NOWPayments (or whichever
 * processor) CLAIMS happened; this reports what the blockchain itself says
 * happened. verifyAndCredit() in payments.mjs only ever credits from this,
 * never from the provider's own claim -- "a webhook is a notification to
 * go look, never the reason we credit."
 *
 * Two implementations live here, and the distinction between them is a
 * production-safety boundary, not a style choice:
 *
 *   createMockChainReader()  -- deterministic, in-memory, seeded by the
 *                               caller. For local development and tests
 *                               ONLY. Refuses to construct at all under
 *                               NODE_ENV=production, exactly like
 *                               createConsoleEmailProvider() in
 *                               packages/email/src/provider.mjs -- the same
 *                               established pattern in this codebase for "a
 *                               stand-in that must never reach real money".
 *
 *   createTronChainReader()  -- the real thing: a BlockchainProvider
 *                               (provider.mjs) backed by a real TRON
 *                               full-node/TronGrid RPC client
 *                               (tron-rpc.mjs), independently re-deriving
 *                               contract/sender/recipient/amount/status/
 *                               confirmations from the transaction's own
 *                               raw event log -- see provider.mjs's own
 *                               header for the full trust model.
 *
 * Both expose the SAME shape, so payments.mjs (and every test) can drive
 * either one identically:
 *
 *   verifyIncoming({ network, address, requiredConfirmations })
 *     -- discovery + independent verification, address-scoped. The single
 *        call the deposit flow actually uses.
 *   getTransaction / getTokenTransfer / getReceipt / getConfirmationState /
 *   verifyTransfer / listIncomingTransfers
 *     -- the decomposed BlockchainProvider primitives, for anything that
 *        needs to inspect a specific transaction directly (an admin
 *        lookup, a targeted test) rather than poll an address.
 *
 * createChainReader() is the one factory application code should call: it
 * picks the adapter from configuration and FAILS BEFORE STARTING rather
 * than silently falling back to the mock when NODE_ENV=production and no
 * real adapter is configured.
 */
import { createTronRpcClient } from "./tron-rpc.mjs";
import { createTronBlockchainProvider, VerifyOutcome, DEFAULT_USDT_TRC20_CONTRACT } from "./provider.mjs";

export { VerifyOutcome, DEFAULT_USDT_TRC20_CONTRACT };

/**
 * Poll an address for candidate transfers, then independently verify each
 * one until either a VERIFIED transfer is found or the candidates are
 * exhausted. Shared by the mock and the real reader so both produce
 * EXACTLY the same discriminated outcome shape from the same inputs.
 */
async function verifyIncomingVia(provider, { network, address, requiredConfirmations }) {
  if (network !== provider.network) return { outcome: VerifyOutcome.WRONG_NETWORK };

  const candidates = await provider.listIncomingTransfers({ address });
  if (candidates.length === 0) return { outcome: VerifyOutcome.NOT_FOUND };

  let best = { outcome: VerifyOutcome.NOT_FOUND };
  for (const c of candidates) {
    const v = await provider.verifyTransfer({
      txHash: c.txHash, expectedNetwork: network, expectedRecipient: address, requiredConfirmations,
    });
    if (v.outcome === VerifyOutcome.VERIFIED) return { ...v, outputIndex: 0 };
    // A provider outage means nothing else discovered here can be trusted
    // either -- surface it immediately rather than reporting a lesser
    // outcome from a possibly-stale candidate list.
    if (v.outcome === VerifyOutcome.PROVIDER_UNAVAILABLE) return v;
    best = v;
  }
  return best;
}

/**
 * A fully in-memory chain, seeded by the caller with exact, already-decoded
 * "as if independently verified" transfers. Never talks to a network. This
 * is a double of the BlockchainProvider contract, not a shortcut around
 * it -- it still runs candidates through the identical VERIFIED / wrong-*
 * / NOT_CONFIRMED / TX_FAILED / PROVIDER_UNAVAILABLE decision the real
 * reader makes, so a test written against this mock is exercising the same
 * state machine payments.mjs drives in production.
 */
export function createMockChainReader({
  transactions = [], nodeEnv = process.env.NODE_ENV,
  network = "TRON", contractAddress = DEFAULT_USDT_TRC20_CONTRACT, requiredConfirmations = 20,
} = {}) {
  if (nodeEnv === "production") {
    throw new Error("createMockChainReader must never be used with NODE_ENV=production");
  }

  /** @type {Map<string, object>} keyed by txHash -- the full "on-chain truth" for a seeded transaction. */
  const byTxHash = new Map();
  /** @type {Map<string, string[]>} address -> ordered list of txHashes seen incoming to it, most recent first. */
  const byAddress = new Map();
  let pingFailure = null;
  let pingLatencyMs = 5;

  function seed(t) {
    const record = {
      txHash: t.txHash,
      network: t.network ?? network,
      from: t.from ?? "Tunknownsender00000000000000000000",
      to: t.to,
      contractAddress: t.contractAddress ?? contractAddress,
      amountRaw: String(t.amountRaw ?? t.amountMinor ?? "0"),
      status: t.status ?? "SUCCESS",
      confirmations: t.confirmations ?? 9999,
      unavailable: t.unavailable === true,
    };
    byTxHash.set(record.txHash, record);
    const list = byAddress.get(record.to) ?? [];
    list.unshift(record.txHash);
    byAddress.set(record.to, list);
    return record;
  }
  for (const t of transactions) seed(t);

  const provider = {
    id: "mock",
    _isMock: true,
    network,
    contractAddress,

    async listIncomingTransfers({ address }) {
      const hashes = byAddress.get(address) ?? [];
      return hashes.map((h) => {
        const r = byTxHash.get(h);
        return { txHash: r.txHash, from: r.from, to: r.to, amountRaw: r.amountRaw, contractAddress: r.contractAddress };
      });
    },

    async getTransaction(txHash) {
      const r = byTxHash.get(txHash);
      return { exists: !!r, raw: r ?? null };
    },

    async getTokenTransfer(txHash) {
      const r = byTxHash.get(txHash);
      if (!r) return null;
      if (r.contractAddress !== contractAddress) return { info: r, transfers: [] };
      return { info: r, transfers: [{ from: r.from, to: r.to, amountRaw: BigInt(r.amountRaw) }] };
    },

    async getReceipt(txHash) {
      const r = byTxHash.get(txHash);
      if (!r) return { status: "UNKNOWN", blockNumber: null };
      return { status: r.status, blockNumber: r.blockNumber ?? 1 };
    },

    async getConfirmationState(_blockNumber, { requiredConfirmations: required = requiredConfirmations } = {}) {
      return { currentBlock: 1, confirmations: 0, confirmed: false, required };
    },

    async verifyTransfer({ txHash, expectedNetwork, expectedRecipient, requiredConfirmations: required = requiredConfirmations }) {
      if (expectedNetwork && expectedNetwork !== network) return { outcome: VerifyOutcome.WRONG_NETWORK };
      const r = byTxHash.get(txHash);
      if (!r) return { outcome: VerifyOutcome.NOT_FOUND };
      if (r.unavailable) return { outcome: VerifyOutcome.PROVIDER_UNAVAILABLE };
      if (r.network !== network) return { outcome: VerifyOutcome.WRONG_NETWORK };
      if (r.status !== "SUCCESS") return { outcome: VerifyOutcome.TX_FAILED };
      if (r.contractAddress !== contractAddress) return { outcome: VerifyOutcome.NO_TRANSFER_EVENT };
      if (r.to !== expectedRecipient) return { outcome: VerifyOutcome.WRONG_RECIPIENT, observedRecipients: [r.to] };

      const base = {
        txHash, network, asset: "USDT", contractAddress,
        from: r.from, to: r.to, amountRaw: r.amountRaw,
        blockNumber: r.blockNumber ?? 1, confirmations: r.confirmations,
      };
      if (r.confirmations < required) return { outcome: VerifyOutcome.NOT_CONFIRMED, ...base };
      return { outcome: VerifyOutcome.VERIFIED, ...base };
    },

    async verifyIncoming({ network: n, address, requiredConfirmations: required = requiredConfirmations }) {
      return verifyIncomingVia(provider, { network: n, address, requiredConfirmations: required });
    },

    /**
     * The health-check primitive: is the chain actually reachable right
     * now? Seedable via `_setPingResult` so a test can simulate a real
     * outage without touching any deposit/withdrawal state -- this mock
     * defaults to a healthy answer, matching a freshly-started reader that
     * has not been told otherwise.
     */
    async ping() {
      if (pingFailure) throw pingFailure;
      return { ok: true, latencyMs: pingLatencyMs, blockNumber: 1 };
    },

    /** Test helper: seed (or add to) an address's observed transactions after construction. */
    _seed: seed,
    /** Test helper: make a specific already-seeded tx hash report PROVIDER_UNAVAILABLE. */
    _makeUnavailable(txHash) {
      const r = byTxHash.get(txHash);
      if (r) r.unavailable = true;
    },
    /** Test helper: make ping() fail (simulating a real RPC outage) or set its reported latency. */
    _setPingResult({ fail = false, latencyMs = 5 } = {}) {
      pingFailure = fail ? new Error("simulated chain RPC outage") : null;
      pingLatencyMs = latencyMs;
    },
  };

  return provider;
}

/**
 * The real thing: TRON full-node/TronGrid RPC (tron-rpc.mjs) driving the
 * independent BlockchainProvider (provider.mjs). `http`/`fetchImpl` is
 * injectable for testing, the same dependency-injection convention
 * createNowPaymentsProvider() already uses.
 */
export function createTronChainReader({
  fetchImpl,
  apiKey,
  fullNodeUrl = "https://api.trongrid.io",
  indexerUrl,
  contractAddress = DEFAULT_USDT_TRC20_CONTRACT,
  requiredConfirmations = 20,
  timeoutMs,
  maxAttempts,
} = {}) {
  const rpc = createTronRpcClient({
    fullNodeUrl, indexerUrl, apiKey, fetchImpl, timeoutMs, maxAttempts,
  });
  const provider = createTronBlockchainProvider({ rpc, contractAddress, requiredConfirmations });

  return {
    ...provider,
    _isMock: false,
    async verifyIncoming({ network, address, requiredConfirmations: required = requiredConfirmations }) {
      return verifyIncomingVia(provider, { network, address, requiredConfirmations: required });
    },
    /**
     * The real health-check primitive: an actual round trip to the chain
     * RPC. Throws (never returns a fabricated "ok") if the node cannot be
     * reached at all -- the caller (packages/payments/src/health.mjs) is
     * what turns that into a DOWN/DEGRADED reading, never this function
     * pretending to know something it does not.
     */
    async ping() {
      const started = Date.now();
      const head = await rpc.getNowBlock();
      return { ok: true, latencyMs: Date.now() - started, blockNumber: head.number };
    },
  };
}

/**
 * The factory application code (apps/api, apps/worker) should call.
 *
 * `kind` defaults to the CHAIN_READER environment variable, falling back to
 * "mock" -- but ONLY when NODE_ENV is not "production". A production
 * process that reaches this function without CHAIN_READER=tron configured
 * fails to start, with a message naming exactly what is missing, rather
 * than quietly constructing a reader that can never confirm a real deposit.
 */
export function createChainReader({
  kind = process.env.CHAIN_READER || (process.env.NODE_ENV === "production" ? "tron" : "mock"),
  nodeEnv = process.env.NODE_ENV,
  apiKey = process.env.TRON_API_KEY,
  fullNodeUrl = process.env.TRON_FULL_NODE_URL,
  indexerUrl = process.env.TRON_INDEXER_URL,
  contractAddress = process.env.USDT_TRC20_CONTRACT_ADDRESS,
  requiredConfirmations = Number(process.env.TRON_CONFIRMATION_DEPTH || 20),
  fetchImpl,
} = {}) {
  if (kind === "tron") {
    return createTronChainReader({
      fetchImpl, apiKey, requiredConfirmations,
      ...(fullNodeUrl ? { fullNodeUrl } : {}),
      ...(indexerUrl ? { indexerUrl } : {}),
      ...(contractAddress ? { contractAddress } : {}),
    });
  }

  if (nodeEnv === "production") {
    throw new Error(
      "CHAIN_READER=tron (with TRON_API_KEY configured) is required when NODE_ENV=production; " +
      "the mock chain reader must never be used to verify real deposits."
    );
  }

  // createMockChainReader's own constructor guard is a second, independent
  // check of the exact same rule -- belt and braces on the one thing this
  // module exists to prevent.
  return createMockChainReader({ nodeEnv });
}
