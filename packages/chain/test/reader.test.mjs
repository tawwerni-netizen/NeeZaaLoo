/**
 * The chain reader: mock vs. real, and the production-safety gate between
 * them. verifyIncoming() (address-scoped discovery + independent
 * verification, in one call) is the shape payments.mjs actually drives;
 * see provider.test.mjs for the decomposed BlockchainProvider primitives
 * and tron-rpc.test.mjs for retry/timeout/outage behaviour.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createMockChainReader, createTronChainReader, createChainReader, VerifyOutcome,
} from "../src/reader.mjs";
import { base58CheckEncode, TRON_MAINNET_PREFIX } from "../src/tron-address.mjs";

function addr(fillByte) {
  return base58CheckEncode(Buffer.concat([Buffer.from([TRON_MAINNET_PREFIX]), Buffer.alloc(20, fillByte)]));
}

describe("createMockChainReader", () => {
  test("VERIFIED: a seeded, confirmed transfer to the queried address", async () => {
    const to = addr(1);
    const reader = createMockChainReader({
      nodeEnv: "test",
      transactions: [{ txHash: "0xabc", to, amountRaw: "1000000", confirmations: 25 }],
    });
    const result = await reader.verifyIncoming({ network: "TRON", address: to, requiredConfirmations: 20 });
    assert.equal(result.outcome, VerifyOutcome.VERIFIED);
    assert.equal(result.amountRaw, "1000000");
  });

  test("NOT_FOUND: nothing was seeded for this address", async () => {
    const reader = createMockChainReader({ nodeEnv: "test" });
    const result = await reader.verifyIncoming({ network: "TRON", address: addr(9), requiredConfirmations: 20 });
    assert.equal(result.outcome, VerifyOutcome.NOT_FOUND);
  });

  test("WRONG_NETWORK: the reader only ever speaks TRON", async () => {
    const reader = createMockChainReader({ nodeEnv: "test" });
    const result = await reader.verifyIncoming({ network: "ETHEREUM", address: addr(1), requiredConfirmations: 20 });
    assert.equal(result.outcome, VerifyOutcome.WRONG_NETWORK);
  });

  test("NOT_CONFIRMED: seeded below the required depth", async () => {
    const to = addr(2);
    const reader = createMockChainReader({
      transactions: [{ txHash: "0x1", to, amountRaw: "1000000", confirmations: 3 }], nodeEnv: "test",
    });
    const result = await reader.verifyIncoming({ network: "TRON", address: to, requiredConfirmations: 20 });
    assert.equal(result.outcome, VerifyOutcome.NOT_CONFIRMED);
    assert.equal(result.confirmations, 3);
  });

  test("TX_FAILED: seeded as a reverted transaction", async () => {
    const to = addr(3);
    const reader = createMockChainReader({
      transactions: [{ txHash: "0x1", to, amountRaw: "1000000", status: "FAILED" }], nodeEnv: "test",
    });
    const result = await reader.verifyIncoming({ network: "TRON", address: to, requiredConfirmations: 20 });
    assert.equal(result.outcome, VerifyOutcome.TX_FAILED);
  });

  test("PROVIDER_UNAVAILABLE: a seeded transaction explicitly marked unavailable", async () => {
    const to = addr(4);
    const reader = createMockChainReader({ nodeEnv: "test" });
    reader._seed({ txHash: "0x1", to, amountRaw: "1000000" });
    reader._makeUnavailable("0x1");
    const result = await reader.verifyIncoming({ network: "TRON", address: to, requiredConfirmations: 20 });
    assert.equal(result.outcome, VerifyOutcome.PROVIDER_UNAVAILABLE);
  });

  test("refuses to construct at all under NODE_ENV=production", () => {
    assert.throws(
      () => createMockChainReader({ nodeEnv: "production" }),
      /must never be used with NODE_ENV=production/
    );
  });

  test("is tagged _isMock so a production-safety check can recognise it", () => {
    const reader = createMockChainReader({ nodeEnv: "test" });
    assert.equal(reader._isMock, true);
  });

  test("the decomposed BlockchainProvider primitives are also present on the mock", async () => {
    const to = addr(5);
    const reader = createMockChainReader({
      transactions: [{ txHash: "0x1", to, amountRaw: "2000000", confirmations: 25 }], nodeEnv: "test",
    });
    assert.equal((await reader.getTransaction("0x1")).exists, true);
    assert.equal((await reader.getReceipt("0x1")).status, "SUCCESS");
    const transfer = await reader.getTokenTransfer("0x1");
    assert.equal(transfer.transfers[0].to, to);
    const list = await reader.listIncomingTransfers({ address: to });
    assert.equal(list[0].txHash, "0x1");
  });
});

describe("createTronChainReader — the real thing, driven by an injected fetch", () => {
  function fetchStub({ txExists = true, log, blockNumber = 100, headBlock = 130, listRows = [] } = {}) {
    return async (url) => {
      if (url.includes("/wallet/gettransactionbyid")) {
        return { ok: true, status: 200, json: async () => (txExists ? { txID: "0xabc" } : {}) };
      }
      if (url.includes("/wallet/gettransactioninfobyid")) {
        return { ok: true, status: 200, json: async () => (txExists ? { blockNumber, log: log ?? [] } : {}) };
      }
      if (url.includes("/wallet/getnowblock")) {
        return { ok: true, status: 200, json: async () => ({ block_header: { raw_data: { number: headBlock } } }) };
      }
      if (url.includes("/transactions/trc20")) {
        return { ok: true, status: 200, json: async () => ({ success: true, data: listRows }) };
      }
      throw new Error(`unexpected URL in test: ${url}`);
    };
  }

  test("VERIFIED end to end: discovery finds a candidate, verification independently confirms it", async () => {
    const to = addr(6);
    const { DEFAULT_USDT_TRC20_CONTRACT } = await import("../src/provider.mjs");
    const { TRANSFER_EVENT_TOPIC } = await import("../src/provider.mjs");
    const { tronBase58ToHex } = await import("../src/tron-address.mjs");
    const contractHex = tronBase58ToHex(DEFAULT_USDT_TRC20_CONTRACT);
    const toHex = tronBase58ToHex(to).slice(2);
    const fromHex = tronBase58ToHex(addr(7)).slice(2);

    const fetchImpl = fetchStub({
      listRows: [{ transaction_id: "0xdeadbeef", from: addr(7), to, value: "5000000", token_info: { address: DEFAULT_USDT_TRC20_CONTRACT } }],
      log: [{
        address: contractHex,
        topics: [TRANSFER_EVENT_TOPIC, "0".repeat(24) + fromHex, "0".repeat(24) + toHex],
        data: (5_000_000).toString(16).padStart(64, "0"),
      }],
    });

    const reader = createTronChainReader({ fetchImpl, requiredConfirmations: 20 });
    const result = await reader.verifyIncoming({ network: "TRON", address: to, requiredConfirmations: 20 });
    assert.equal(result.outcome, VerifyOutcome.VERIFIED);
    assert.equal(result.amountRaw, "5000000");
  });

  test("NOT_FOUND: the indexer reports no candidates at all", async () => {
    const reader = createTronChainReader({ fetchImpl: fetchStub({ listRows: [] }) });
    const result = await reader.verifyIncoming({ network: "TRON", address: addr(8), requiredConfirmations: 20 });
    assert.equal(result.outcome, VerifyOutcome.NOT_FOUND);
  });

  test("is never mistaken for a mock", () => {
    const reader = createTronChainReader({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }) });
    assert.equal(reader._isMock, false);
  });
});

describe("createChainReader — the production safety gate", () => {
  test("defaults to the mock reader outside production", () => {
    const reader = createChainReader({ kind: "mock", nodeEnv: "development" });
    assert.equal(reader._isMock, true);
  });

  test("refuses to start under NODE_ENV=production without CHAIN_READER=tron", () => {
    assert.throws(
      () => createChainReader({ kind: "mock", nodeEnv: "production" }),
      /CHAIN_READER=tron.*is required when NODE_ENV=production/
    );
  });

  test("constructs the real TRON reader when explicitly configured, even in production", () => {
    const reader = createChainReader({
      kind: "tron", nodeEnv: "production", apiKey: "k",
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    });
    assert.equal(reader._isMock, false);
  });
});
