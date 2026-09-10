/**
 * The BlockchainProvider: independent, read-only verification of a TRC20
 * transfer against TRON's own chain data. This is what "a webhook is a
 * notification to go LOOK, never the reason we credit" (packages/payments/
 * src/payments.mjs's own header) actually means in code -- every field the
 * trust model requires is re-derived here from data this backend fetched
 * itself, not trusted from a client, a provider webhook, or even from
 * TronGrid's own convenience decoding.
 *
 * Two data sources, deliberately used for two different jobs:
 *
 *   DISCOVERY   TronGrid's indexed `/v1/accounts/.../transactions/trc20`
 *               (tron-rpc.mjs's getTrc20TransfersToAddress). Fast, and
 *               already decoded -- but it is an INDEX, a hint about which
 *               transaction hashes are worth looking at. Nothing here is
 *               ever credited on the strength of this list alone.
 *
 *   VERIFICATION  verifyTransfer() re-derives contract, sender, recipient,
 *               and amount directly from the transaction's own raw event
 *               log (`wallet/gettransactioninfobyid`'s `log` array),
 *               independently of whatever the indexer said, and checks the
 *               transaction's own execution result and confirmation depth
 *               against chain data this backend fetched itself
 *               (`wallet/gettransactionbyid`, `wallet/getnowblock`).
 *
 * The standard TRC20/ERC20 Transfer(address,address,uint256) event
 * signature hash below is not TRON-specific and not invented -- it is
 * keccak256("Transfer(address,address,uint256)"), the same constant every
 * EVM/TVM chain's explorers and indexers use to recognise a transfer log.
 */
import { ProviderUnavailableError } from "./tron-rpc.mjs";
import { tronBase58ToHex, topicToBase58Address } from "./tron-address.mjs";

export const TRANSFER_EVENT_TOPIC =
  "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** The real, publicly documented USDT-TRC20 mainnet contract, as shipped by Tether. */
export const DEFAULT_USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

export const VerifyOutcome = Object.freeze({
  VERIFIED: "VERIFIED",
  NOT_FOUND: "NOT_FOUND",
  WRONG_NETWORK: "WRONG_NETWORK",
  TX_FAILED: "TX_FAILED",
  NO_TRANSFER_EVENT: "NO_TRANSFER_EVENT",
  WRONG_RECIPIENT: "WRONG_RECIPIENT",
  NOT_CONFIRMED: "NOT_CONFIRMED",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
});

function normalizeHex(h) {
  return (h ?? "").toLowerCase().replace(/^0x/, "");
}

/**
 * Every log entry emitted by OUR configured contract that carries the
 * standard Transfer topic, decoded independently of any indexer. A
 * transaction can legitimately emit more than one (a router contract
 * forwarding several transfers); the caller picks the one addressed to it.
 */
function decodeTransferLogs(info, contractAddressHex) {
  const logs = info?.log ?? [];
  const out = [];
  for (const log of logs) {
    if (normalizeHex(log.address) !== contractAddressHex) continue;
    const topic0 = normalizeHex(log.topics?.[0]);
    if (topic0 !== TRANSFER_EVENT_TOPIC) continue;
    if (!log.topics?.[1] || !log.topics?.[2]) continue;
    out.push({
      from: topicToBase58Address(log.topics[1]),
      to: topicToBase58Address(log.topics[2]),
      amountRaw: BigInt(`0x${normalizeHex(log.data) || "0"}`),
    });
  }
  return out;
}

/** SUCCESS unless the node explicitly says otherwise -- see TransactionInfo's own
 * shape (tronweb's own type: a top-level `result` field that is EITHER absent
 * (success) OR the literal string 'FAILED'; `receipt.result` corroborates). */
function transactionSucceeded(info) {
  if (info.result === "FAILED") return false;
  if (info.receipt?.result && info.receipt.result !== "SUCCESS") return false;
  return true;
}

export function createTronBlockchainProvider({
  rpc,
  network = "TRON",
  contractAddress = DEFAULT_USDT_TRC20_CONTRACT,
  requiredConfirmations = 20,
} = {}) {
  if (!rpc) throw new TypeError("createTronBlockchainProvider requires a tron-rpc client");
  const contractAddressHex = normalizeHex(tronBase58ToHex(contractAddress));

  const provider = {
    id: "tron-blockchain-provider",
    network,
    contractAddress,

    /** DISCOVERY: candidate transfer hashes TronGrid's indexer has seen for this address. Never itself a basis for crediting. */
    async listIncomingTransfers({ address, limit = 20, minTimestamp } = {}) {
      try {
        const rows = await rpc.getTrc20TransfersToAddress({
          address, contractAddress, limit, minTimestamp,
        });
        return rows.map((r) => ({
          txHash: r.transaction_id,
          from: r.from,
          to: r.to,
          amountRaw: String(r.value),
          contractAddress: r.token_info?.address ?? null,
          observedAtMs: r.block_timestamp ?? null,
        }));
      } catch (e) {
        if (e instanceof ProviderUnavailableError) throw e;
        throw new ProviderUnavailableError(`discovery failed for ${address}`, { cause: e });
      }
    },

    /** Does this transaction exist on-chain at all? */
    async getTransaction(txHash) {
      const raw = await rpc.getTransactionById(txHash);
      return raw ? { exists: true, raw } : { exists: false, raw: null };
    },

    /**
     * The independently-decoded TRC20 Transfer event(s) this transaction's
     * OWN log actually emitted for OUR configured contract -- never the
     * indexer's decode. `null` if the transaction has no execution info
     * yet (too fresh to have a receipt) or emitted no matching event.
     */
    async getTokenTransfer(txHash) {
      const info = await rpc.getTransactionInfoById(txHash);
      if (!info) return null;
      const transfers = decodeTransferLogs(info, contractAddressHex);
      return { info, transfers };
    },

    /** SUCCESS/FAILED/UNKNOWN, straight from the transaction's own receipt. */
    async getReceipt(txHash) {
      const info = await rpc.getTransactionInfoById(txHash);
      if (!info) return { status: "UNKNOWN", blockNumber: null };
      return { status: transactionSucceeded(info) ? "SUCCESS" : "FAILED", blockNumber: info.blockNumber };
    },

    /** How many blocks have been produced since blockNumber, against a caller-supplied (never hardcoded) requirement. */
    async getConfirmationState(blockNumber, { requiredConfirmations: required = requiredConfirmations } = {}) {
      const head = await rpc.getNowBlock();
      const confirmations = blockNumber == null ? 0 : head.number - blockNumber + 1;
      return { currentBlock: head.number, confirmations: Math.max(0, confirmations), confirmed: confirmations >= required };
    },

    /**
     * The composite check the deposit flow actually calls: everything the
     * trust model requires, in one independently-verified answer. Never
     * throws for an ordinary "no" (not found, wrong recipient, unconfirmed,
     * failed) -- only for genuine provider unavailability, which the
     * caller MUST treat as PENDING/RETRYABLE, never as a rejection.
     */
    async verifyTransfer({ txHash, expectedNetwork, expectedRecipient, requiredConfirmations: required = requiredConfirmations }) {
      if (expectedNetwork && expectedNetwork !== network) {
        // This provider instance only ever speaks TRON; asking it to
        // verify a different chain's transaction is refused instantly,
        // with no RPC call made -- there is nothing on THIS chain to look up.
        return { outcome: VerifyOutcome.WRONG_NETWORK };
      }

      let tx, info;
      try {
        tx = await rpc.getTransactionById(txHash);
        info = await rpc.getTransactionInfoById(txHash);
      } catch (e) {
        if (e instanceof ProviderUnavailableError) {
          return { outcome: VerifyOutcome.PROVIDER_UNAVAILABLE, error: e };
        }
        throw e;
      }

      if (!tx) return { outcome: VerifyOutcome.NOT_FOUND };
      if (!info) {
        // The transaction exists but has no execution receipt yet -- too
        // fresh to say anything about confirmations or success.
        return { outcome: VerifyOutcome.NOT_CONFIRMED, confirmations: 0 };
      }
      if (!transactionSucceeded(info)) {
        return { outcome: VerifyOutcome.TX_FAILED, blockNumber: info.blockNumber };
      }

      const transfers = decodeTransferLogs(info, contractAddressHex);
      if (transfers.length === 0) {
        return { outcome: VerifyOutcome.NO_TRANSFER_EVENT };
      }

      const match = transfers.find((t) => t.to === expectedRecipient);
      if (!match) {
        return { outcome: VerifyOutcome.WRONG_RECIPIENT, observedRecipients: transfers.map((t) => t.to) };
      }

      let confirmationState;
      try {
        confirmationState = await provider.getConfirmationState(info.blockNumber, { requiredConfirmations: required });
      } catch (e) {
        if (e instanceof ProviderUnavailableError) {
          return { outcome: VerifyOutcome.PROVIDER_UNAVAILABLE, error: e };
        }
        throw e;
      }

      const base = {
        txHash, network, asset: "USDT", contractAddress,
        from: match.from, to: match.to, amountRaw: match.amountRaw.toString(),
        blockNumber: info.blockNumber, confirmations: confirmationState.confirmations,
      };

      if (!confirmationState.confirmed) {
        return { outcome: VerifyOutcome.NOT_CONFIRMED, ...base };
      }
      return { outcome: VerifyOutcome.VERIFIED, ...base };
    },
  };

  return provider;
}
