/**
 * createTronBlockchainProvider(): the composite, independent verification
 * pipeline -- transaction lookup, token/contract validation, transfer
 * event decoding, recipient validation, status, and confirmation depth,
 * all re-derived from the transaction's own raw data via an injected fake
 * `rpc` (never a real network call).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createTronBlockchainProvider, VerifyOutcome, TRANSFER_EVENT_TOPIC, DEFAULT_USDT_TRC20_CONTRACT } from "../src/provider.mjs";
import { ProviderUnavailableError } from "../src/tron-rpc.mjs";
import { tronBase58ToHex, base58CheckEncode, TRON_MAINNET_PREFIX } from "../src/tron-address.mjs";

/** A syntactically real (valid checksum) TRON address from an arbitrary 20-byte fill, for fixtures. */
function fakeAddress(fillByte) {
  return base58CheckEncode(Buffer.concat([Buffer.from([TRON_MAINNET_PREFIX]), Buffer.alloc(20, fillByte)]));
}

const RECIPIENT = fakeAddress(0x11);
const SENDER = fakeAddress(0x22);
const CONTRACT_HEX = tronBase58ToHex(DEFAULT_USDT_TRC20_CONTRACT);

function addressTopic(base58Address) {
  // Reverse of topicToBase58Address: pad the address's 20-byte payload to 32 bytes.
  const hex = tronBase58ToHex(base58Address).slice(2); // drop the 0x41 prefix byte
  return "0".repeat(24) + hex;
}

function transferLog({ contractAddressHex = CONTRACT_HEX, from = SENDER, to = RECIPIENT, amountRaw = 5_000_000n } = {}) {
  return {
    address: contractAddressHex,
    topics: [TRANSFER_EVENT_TOPIC, addressTopic(from), addressTopic(to)],
    data: amountRaw.toString(16).padStart(64, "0"),
  };
}

function fakeRpc({
  tx = { txID: "0xabc" },
  info = { blockNumber: 100, log: [transferLog()] },
  headBlock = 130,
} = {}) {
  return {
    async getTransactionById() { return tx; },
    async getTransactionInfoById() { return info; },
    async getNowBlock() { return { number: headBlock }; },
    async getTrc20TransfersToAddress() { return []; },
  };
}

describe("verifyTransfer()", () => {
  test("a valid, sufficiently confirmed USDT transfer is VERIFIED", async () => {
    const provider = createTronBlockchainProvider({ rpc: fakeRpc(), requiredConfirmations: 20 });
    const result = await provider.verifyTransfer({ txHash: "0xabc", expectedNetwork: "TRON", expectedRecipient: RECIPIENT });
    assert.equal(result.outcome, VerifyOutcome.VERIFIED);
    assert.equal(result.from, SENDER);
    assert.equal(result.to, RECIPIENT);
    assert.equal(result.amountRaw, "5000000");
    assert.equal(result.confirmations, 31); // 130 - 100 + 1
  });

  test("WRONG NETWORK: a provider fixed to TRON refuses instantly, no RPC call made", async () => {
    let called = false;
    const rpc = { async getTransactionById() { called = true; return null; } };
    const provider = createTronBlockchainProvider({ rpc });
    const result = await provider.verifyTransfer({ txHash: "x", expectedNetwork: "ETHEREUM", expectedRecipient: RECIPIENT });
    assert.equal(result.outcome, VerifyOutcome.WRONG_NETWORK);
    assert.equal(called, false, "no chain lookup is made for a chain this provider does not speak");
  });

  test("NOT FOUND: the transaction does not exist on chain", async () => {
    const provider = createTronBlockchainProvider({ rpc: fakeRpc({ tx: null }) });
    const result = await provider.verifyTransfer({ txHash: "ghost", expectedNetwork: "TRON", expectedRecipient: RECIPIENT });
    assert.equal(result.outcome, VerifyOutcome.NOT_FOUND);
  });

  test("WRONG TOKEN: a transfer log from a different contract is not recognised as USDT", async () => {
    const otherContractHex = "41" + "ee".repeat(20);
    const provider = createTronBlockchainProvider({
      rpc: fakeRpc({ info: { blockNumber: 100, log: [transferLog({ contractAddressHex: otherContractHex })] } }),
    });
    const result = await provider.verifyTransfer({ txHash: "0xabc", expectedNetwork: "TRON", expectedRecipient: RECIPIENT });
    assert.equal(result.outcome, VerifyOutcome.NO_TRANSFER_EVENT);
  });

  test("a transaction that calls the right contract but emits no Transfer event at all is NO_TRANSFER_EVENT", async () => {
    const provider = createTronBlockchainProvider({ rpc: fakeRpc({ info: { blockNumber: 100, log: [] } }) });
    const result = await provider.verifyTransfer({ txHash: "0xabc", expectedNetwork: "TRON", expectedRecipient: RECIPIENT });
    assert.equal(result.outcome, VerifyOutcome.NO_TRANSFER_EVENT);
  });

  test("WRONG RECIPIENT: a real, confirmed USDT transfer, but not to the expected address", async () => {
    const provider = createTronBlockchainProvider({ rpc: fakeRpc() });
    const someoneElse = fakeAddress(0x33);
    const result = await provider.verifyTransfer({ txHash: "0xabc", expectedNetwork: "TRON", expectedRecipient: someoneElse });
    assert.equal(result.outcome, VerifyOutcome.WRONG_RECIPIENT);
    assert.deepEqual(result.observedRecipients, [RECIPIENT]);
  });

  test("UNCONFIRMED: correct in every respect, but below the required confirmation depth", async () => {
    const provider = createTronBlockchainProvider({ rpc: fakeRpc({ headBlock: 105 }), requiredConfirmations: 20 });
    const result = await provider.verifyTransfer({ txHash: "0xabc", expectedNetwork: "TRON", expectedRecipient: RECIPIENT });
    assert.equal(result.outcome, VerifyOutcome.NOT_CONFIRMED);
    assert.equal(result.confirmations, 6); // 105 - 100 + 1
  });

  test("a transaction that exists but has no execution info yet (too fresh) is NOT_CONFIRMED with zero confirmations", async () => {
    const provider = createTronBlockchainProvider({ rpc: fakeRpc({ info: null }) });
    const result = await provider.verifyTransfer({ txHash: "0xabc", expectedNetwork: "TRON", expectedRecipient: RECIPIENT });
    assert.equal(result.outcome, VerifyOutcome.NOT_CONFIRMED);
    assert.equal(result.confirmations, 0);
  });

  test("FAILED TX: a reverted transaction (top-level result:'FAILED') is TX_FAILED, not silently ignored", async () => {
    const provider = createTronBlockchainProvider({
      rpc: fakeRpc({ info: { blockNumber: 100, result: "FAILED", log: [transferLog()] } }),
    });
    const result = await provider.verifyTransfer({ txHash: "0xabc", expectedNetwork: "TRON", expectedRecipient: RECIPIENT });
    assert.equal(result.outcome, VerifyOutcome.TX_FAILED);
  });

  test("FAILED TX via receipt.result also counts, not only the top-level field", async () => {
    const provider = createTronBlockchainProvider({
      rpc: fakeRpc({ info: { blockNumber: 100, receipt: { result: "REVERT" }, log: [transferLog()] } }),
    });
    const result = await provider.verifyTransfer({ txHash: "0xabc", expectedNetwork: "TRON", expectedRecipient: RECIPIENT });
    assert.equal(result.outcome, VerifyOutcome.TX_FAILED);
  });

  test("PROVIDER UNAVAILABLE: a real RPC outage is reported distinctly, never as NOT_FOUND", async () => {
    const rpc = {
      async getTransactionById() { throw new ProviderUnavailableError("simulated outage"); },
      async getTransactionInfoById() { throw new ProviderUnavailableError("simulated outage"); },
      async getNowBlock() { throw new ProviderUnavailableError("simulated outage"); },
    };
    const provider = createTronBlockchainProvider({ rpc });
    const result = await provider.verifyTransfer({ txHash: "x", expectedNetwork: "TRON", expectedRecipient: RECIPIENT });
    assert.equal(result.outcome, VerifyOutcome.PROVIDER_UNAVAILABLE);
  });

  test("PROVIDER UNAVAILABLE specifically during the confirmation-depth lookup (tx itself verified fine)", async () => {
    const rpc = fakeRpc();
    rpc.getNowBlock = async () => { throw new ProviderUnavailableError("head block unreachable"); };
    const provider = createTronBlockchainProvider({ rpc });
    const result = await provider.verifyTransfer({ txHash: "0xabc", expectedNetwork: "TRON", expectedRecipient: RECIPIENT });
    assert.equal(result.outcome, VerifyOutcome.PROVIDER_UNAVAILABLE);
  });

  test("a transaction that has MULTIPLE transfer logs picks the one addressed to the expected recipient", async () => {
    const provider = createTronBlockchainProvider({
      rpc: fakeRpc({
        info: {
          blockNumber: 100,
          log: [
            transferLog({ to: fakeAddress(0x33), amountRaw: 1n }),
            transferLog({ to: RECIPIENT, amountRaw: 7_000_000n }),
          ],
        },
      }),
    });
    const result = await provider.verifyTransfer({ txHash: "0xabc", expectedNetwork: "TRON", expectedRecipient: RECIPIENT });
    assert.equal(result.outcome, VerifyOutcome.VERIFIED);
    assert.equal(result.amountRaw, "7000000");
  });
});

describe("CONCURRENT VERIFICATION: many simultaneous verifyTransfer() calls against the same stateless rpc never interfere", () => {
  test("20 concurrent verifications of the same transaction all agree", async () => {
    const provider = createTronBlockchainProvider({ rpc: fakeRpc() });
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        provider.verifyTransfer({ txHash: "0xabc", expectedNetwork: "TRON", expectedRecipient: RECIPIENT }))
    );
    for (const r of results) {
      assert.equal(r.outcome, VerifyOutcome.VERIFIED);
      assert.equal(r.amountRaw, "5000000");
    }
  });

  test("concurrent verifications of DIFFERENT transactions never cross-contaminate results", async () => {
    const rpc = {
      async getTransactionById(hash) { return { txID: hash }; },
      async getTransactionInfoById(hash) {
        return { blockNumber: 100, log: [transferLog({ amountRaw: hash === "a" ? 1_000_000n : 9_000_000n })] };
      },
      async getNowBlock() { return { number: 130 }; },
    };
    const provider = createTronBlockchainProvider({ rpc });
    const [a, b] = await Promise.all([
      provider.verifyTransfer({ txHash: "a", expectedNetwork: "TRON", expectedRecipient: RECIPIENT }),
      provider.verifyTransfer({ txHash: "b", expectedNetwork: "TRON", expectedRecipient: RECIPIENT }),
    ]);
    assert.equal(a.amountRaw, "1000000");
    assert.equal(b.amountRaw, "9000000");
  });
});

describe("listIncomingTransfers()", () => {
  test("maps the indexer's rows into the discovery shape", async () => {
    const rpc = {
      async getTrc20TransfersToAddress() {
        return [{ transaction_id: "0x1", from: SENDER, to: RECIPIENT, value: "2000000", token_info: { address: DEFAULT_USDT_TRC20_CONTRACT }, block_timestamp: 123 }];
      },
    };
    const provider = createTronBlockchainProvider({ rpc });
    const rows = await provider.listIncomingTransfers({ address: RECIPIENT });
    assert.equal(rows[0].txHash, "0x1");
    assert.equal(rows[0].amountRaw, "2000000");
  });

  test("a discovery-layer outage surfaces as ProviderUnavailableError, not an empty list", async () => {
    const rpc = { async getTrc20TransfersToAddress() { throw new ProviderUnavailableError("indexer down"); } };
    const provider = createTronBlockchainProvider({ rpc });
    await assert.rejects(() => provider.listIncomingTransfers({ address: RECIPIENT }), ProviderUnavailableError);
  });
});
