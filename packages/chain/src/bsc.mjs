/**
 * BNB Smart Chain (BEP20) verifier for USDT, USDC and DAI.
 *
 * Same trust model as the Tron reader, same contract: nothing is credited or
 * confirmed on anyone's word. A deposit or payout is VERIFIED only when this
 * reader has read the transaction receipt itself and found OUR configured
 * token contract emitting a Transfer to the expected recipient, at the
 * required depth. It returns the exact discriminated outcomes payments.mjs
 * already drives (see provider.mjs VerifyOutcome), so no caller changes
 * meaning when a deposit happens to be on BSC instead of Tron.
 *
 * Two things are different from Tron and both are load-bearing:
 *
 * 1. DECIMALS. Every stablecoin on BSC uses 18 decimals; the platform's
 *    minor unit is 6 (a microdollar). payments.mjs reads `amountRaw` as
 *    minor units directly, so this reader converts BEFORE returning --
 *    otherwise a $20 deposit would be credited as twenty trillion dollars.
 *    Anything below one microdollar is dropped (floored), never rounded up.
 *    The untouched on-chain integer is kept as `amountOnChain` for audit.
 *
 * 2. DISCOVERY. Finding transfers TO an address needs eth_getLogs, which
 *    public BSC nodes refuse ("limit exceeded"). Verifying a KNOWN tx hash
 *    needs only eth_getTransactionReceipt, which every node serves -- and
 *    the provider webhook carries the hash. So the hash path is primary. A
 *    refused or failed discovery call is reported as PROVIDER_UNAVAILABLE
 *    (retry later), never NOT_FOUND: "could not ask" is not "nothing there".
 *    Configure BSC_RPC_URL with a node that serves logs for discovery too.
 *
 * Contract addresses were checked on-chain (symbol/name/decimals via
 * eth_call against chainId 56) and against CoinGecko's Binance-Peg listings.
 */
import { VerifyOutcome } from "./provider.mjs";
import { ProviderUnavailableError } from "./tron-rpc.mjs";

export const BSC_CHAIN_ID = 56;
export const BSC_NETWORK = "BEP20";
export const PLATFORM_DECIMALS = 6;

/** keccak256("Transfer(address,address,uint256)") -- identical on every EVM chain. */
export const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export const BSC_TOKENS = Object.freeze({
  USDT: { contract: "0x55d398326f99059ff775485246999027b3197955", decimals: 18 },
  USDC: { contract: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18 },
  DAI:  { contract: "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3", decimals: 18 },
});

const NETWORK_ALIASES = new Set(["BEP20", "BSC", "BNB"]);
const isBscNetwork = (n) => NETWORK_ALIASES.has(String(n ?? "").trim().toUpperCase());

const lower = (s) => String(s ?? "").toLowerCase();
const isAddress = (a) => /^0x[0-9a-f]{40}$/.test(lower(a));
const topicToAddress = (topic) => "0x" + lower(topic).replace(/^0x/, "").slice(-40);
const addressToTopic = (addr) => "0x" + lower(addr).replace(/^0x/, "").padStart(64, "0");
const hexToBigInt = (h) => (h && h !== "0x" ? BigInt(h) : 0n);
const hexToNumber = (h) => Number(hexToBigInt(h));

/** On-chain integer (token decimals) -> platform minor units (6 decimals), floored. */
export function toPlatformMinor(amountOnChain, decimals) {
  const raw = BigInt(amountOnChain);
  if (decimals === PLATFORM_DECIMALS) return raw;
  if (decimals > PLATFORM_DECIMALS) return raw / 10n ** BigInt(decimals - PLATFORM_DECIMALS);
  return raw * 10n ** BigInt(PLATFORM_DECIMALS - decimals);
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** JSON-RPC with timeout and bounded backoff. Transport faults become ProviderUnavailableError. */
export function createBscRpcClient({
  rpcUrl = "https://bsc-dataseed.bnbchain.org",
  fetchImpl = fetch,
  timeoutMs = 8000,
  maxAttempts = 3,
  baseDelayMs = 200,
} = {}) {
  let id = 0;
  async function call(method, params) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (RETRYABLE_STATUS.has(res.status) || !res.ok) {
          lastError = new Error(`HTTP ${res.status} from BSC RPC`);
        } else {
          const body = await res.json();
          // A JSON-RPC error (rate limit, "limit exceeded", method unsupported)
          // is the node declining to answer -- not an answer about the chain.
          if (body.error) {
            lastError = new Error(`BSC RPC ${method}: ${body.error.message ?? JSON.stringify(body.error)}`);
          } else {
            return body.result;
          }
        }
      } catch (e) {
        clearTimeout(timer);
        lastError = e.name === "AbortError" ? new Error(`BSC RPC ${method} timed out after ${timeoutMs}ms`) : e;
      }
      if (attempt < maxAttempts) await sleep(baseDelayMs * 2 ** (attempt - 1) + Math.random() * baseDelayMs);
    }
    throw new ProviderUnavailableError(`BSC RPC unavailable for ${method} after ${maxAttempts} attempts`, { cause: lastError });
  }
  return { call, rpcUrl };
}

/**
 * @param {object} opts
 * @param {object} [opts.rpc]  a client with call(method, params); built from rpcUrl when omitted
 * @param {object} [opts.tokens] asset -> { contract, decimals }; defaults to the verified BSC_TOKENS
 * @param {number} [opts.lookbackBlocks] discovery window (~3s blocks; 20k is about 17 hours)
 */
export function createBscChainReader({
  rpc,
  rpcUrl,
  fetchImpl,
  tokens = BSC_TOKENS,
  requiredConfirmations = 15,
  lookbackBlocks = 20_000,
} = {}) {
  const client = rpc ?? createBscRpcClient({ ...(rpcUrl ? { rpcUrl } : {}), ...(fetchImpl ? { fetchImpl } : {}) });
  const byContract = new Map(Object.entries(tokens).map(([asset, t]) => [lower(t.contract), { asset, ...t }]));

  const unavailable = (e) => ({ outcome: VerifyOutcome.PROVIDER_UNAVAILABLE, error: e });

  async function verifyTransfer({
    txHash, expectedNetwork, expectedRecipient, asset, requiredConfirmations: required = requiredConfirmations,
  }) {
    if (expectedNetwork && !isBscNetwork(expectedNetwork)) return { outcome: VerifyOutcome.WRONG_NETWORK };
    if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return { outcome: VerifyOutcome.NOT_FOUND };

    // Which token(s) count: exactly the asset asked about. No asset means the
    // caller has no expectation, and any configured stablecoin may match --
    // the returned `asset` then says which one it was.
    const wanted = asset ? tokens[String(asset).toUpperCase()] : null;
    if (asset && !wanted) return { outcome: VerifyOutcome.NO_TRANSFER_EVENT };

    let receipt, head;
    try {
      receipt = await client.call("eth_getTransactionReceipt", [txHash]);
      if (!receipt) return { outcome: VerifyOutcome.NOT_FOUND };
      head = hexToNumber(await client.call("eth_blockNumber", []));
    } catch (e) {
      if (e instanceof ProviderUnavailableError) return unavailable(e);
      throw e;
    }

    if (receipt.status !== "0x1") return { outcome: VerifyOutcome.TX_FAILED };

    const transfers = (receipt.logs ?? [])
      .filter((l) => lower(l.topics?.[0]) === ERC20_TRANSFER_TOPIC && (l.topics?.length ?? 0) >= 3)
      .map((l) => ({ log: l, token: byContract.get(lower(l.address)) }))
      .filter(({ token }) => token && (!wanted || lower(token.contract) === lower(wanted.contract)));

    if (transfers.length === 0) return { outcome: VerifyOutcome.NO_TRANSFER_EVENT };

    const recipient = lower(expectedRecipient);
    const toRecipient = transfers.filter(({ log }) => topicToAddress(log.topics[2]) === recipient);
    if (toRecipient.length === 0) {
      return {
        outcome: VerifyOutcome.WRONG_RECIPIENT,
        observedRecipients: [...new Set(transfers.map(({ log }) => topicToAddress(log.topics[2])))],
      };
    }

    // Several transfers of the same token to the same recipient in one tx
    // are one payment in aggregate; mixing tokens is not (wanted pins one).
    const first = toRecipient[0];
    const token = first.token;
    const sameToken = toRecipient.filter(({ token: t }) => t.asset === token.asset);
    const amountOnChain = sameToken.reduce((sum, { log }) => sum + hexToBigInt(log.data), 0n);
    const blockNumber = hexToNumber(receipt.blockNumber);
    const confirmations = Math.max(0, head - blockNumber + 1);

    const base = {
      txHash,
      network: BSC_NETWORK,
      asset: token.asset,
      contractAddress: token.contract,
      from: topicToAddress(first.log.topics[1]),
      to: recipient,
      amountRaw: String(toPlatformMinor(amountOnChain, token.decimals)),
      amountOnChain: String(amountOnChain),
      tokenDecimals: token.decimals,
      blockNumber,
      confirmations,
      outputIndex: hexToNumber(first.log.logIndex),
    };
    if (confirmations < required) return { outcome: VerifyOutcome.NOT_CONFIRMED, ...base };
    return { outcome: VerifyOutcome.VERIFIED, ...base };
  }

  /** Transfers of `asset` to `address` in the lookback window, newest first. Throws ProviderUnavailableError. */
  async function listIncomingTransfers({ address, asset }) {
    if (!isAddress(address)) return [];
    const list = asset ? [tokens[String(asset).toUpperCase()]].filter(Boolean) : Object.values(tokens);
    if (list.length === 0) return [];
    const head = hexToNumber(await client.call("eth_blockNumber", []));
    const fromBlock = "0x" + Math.max(0, head - lookbackBlocks).toString(16);
    const logs = await client.call("eth_getLogs", [{
      fromBlock, toBlock: "latest",
      address: list.map((t) => t.contract),
      topics: [ERC20_TRANSFER_TOPIC, null, addressToTopic(address)],
    }]);
    return (logs ?? [])
      .slice()
      .sort((a, b) => hexToNumber(b.blockNumber) - hexToNumber(a.blockNumber))
      .map((l) => ({ txHash: l.transactionHash, to: lower(address), contractAddress: lower(l.address) }))
      .filter((c, i, arr) => arr.findIndex((x) => x.txHash === c.txHash) === i);
  }

  return {
    id: "bsc",
    _isMock: false,
    network: BSC_NETWORK,
    supportedRails: Object.keys(tokens).map((asset) => ({ asset, network: BSC_NETWORK })),

    verifyTransfer,
    listIncomingTransfers,

    async verifyIncoming({ network, address, asset, requiredConfirmations: required = requiredConfirmations, txHash }) {
      if (!isBscNetwork(network)) return { outcome: VerifyOutcome.WRONG_NETWORK };

      if (txHash) {
        const v = await verifyTransfer({ txHash, expectedNetwork: network, expectedRecipient: address, asset, requiredConfirmations: required });
        if (v.outcome === VerifyOutcome.VERIFIED || v.outcome === VerifyOutcome.PROVIDER_UNAVAILABLE) return v;
      }

      let candidates;
      try {
        candidates = await listIncomingTransfers({ address, asset });
      } catch (e) {
        // Most often a public node refusing eth_getLogs. That is not evidence
        // the deposit is absent -- report it as retryable, never NOT_FOUND.
        if (e instanceof ProviderUnavailableError) return unavailable(e);
        throw e;
      }
      if (candidates.length === 0) return { outcome: VerifyOutcome.NOT_FOUND };

      let best = { outcome: VerifyOutcome.NOT_FOUND };
      for (const c of candidates) {
        const v = await verifyTransfer({ txHash: c.txHash, expectedNetwork: network, expectedRecipient: address, asset, requiredConfirmations: required });
        if (v.outcome === VerifyOutcome.VERIFIED || v.outcome === VerifyOutcome.PROVIDER_UNAVAILABLE) return v;
        best = v;
      }
      return best;
    },

    async ping() {
      const started = Date.now();
      const chainId = hexToNumber(await client.call("eth_chainId", []));
      if (chainId !== BSC_CHAIN_ID) {
        // Pointed at the wrong chain (a testnet, another EVM network): every
        // "verification" would be against transactions that are not ours.
        throw new Error(`BSC_RPC_URL answers chainId ${chainId}, expected ${BSC_CHAIN_ID} (BNB Smart Chain mainnet)`);
      }
      const blockNumber = hexToNumber(await client.call("eth_blockNumber", []));
      return { ok: true, latencyMs: Date.now() - started, blockNumber };
    },
  };
}
