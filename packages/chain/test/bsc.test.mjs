/**
 * The BNB Smart Chain verifier, against a scripted JSON-RPC node.
 *
 * The cases that matter most are the ones that move money wrongly without
 * erroring: an 18-decimal amount read as 6 decimals (a $20 deposit credited
 * as twenty trillion), a transfer of a different stablecoin satisfying the
 * intent, and a node that refuses a query being read as "nothing there".
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createBscChainReader, toPlatformMinor, BSC_TOKENS, ERC20_TRANSFER_TOPIC,
} from "../src/bsc.mjs";
import { createMultiChainReader, createMockChainReader, VerifyOutcome } from "../src/reader.mjs";
import { ProviderUnavailableError } from "../src/tron-rpc.mjs";

const PLAYER = "0x" + "ab".repeat(20);
const OTHER = "0x" + "cd".repeat(20);
const SENDER = "0x" + "12".repeat(20);
const HASH = "0x" + "f".repeat(64);
const E18 = 10n ** 18n;

const topic = (addr) => "0x" + addr.slice(2).padStart(64, "0");
const hex = (n) => "0x" + BigInt(n).toString(16);

function transferLog({ token = "USDT", to = PLAYER, amount = 20n * E18, logIndex = 3 }) {
  return {
    address: BSC_TOKENS[token].contract,
    topics: [ERC20_TRANSFER_TOPIC, topic(SENDER), topic(to)],
    data: "0x" + amount.toString(16).padStart(64, "0"),
    logIndex: hex(logIndex),
    blockNumber: hex(1000),
    transactionHash: HASH,
  };
}

/** A node that answers from a script; a function value is called with params. */
function fakeRpc(script) {
  const calls = [];
  return {
    calls,
    async call(method, params) {
      calls.push(method);
      if (!(method in script)) throw new Error(`unscripted ${method}`);
      const v = script[method];
      if (v instanceof Error) throw v;
      return typeof v === "function" ? v(params) : v;
    },
  };
}

const receipt = (logs, status = "0x1", block = 1000) => ({ status, blockNumber: hex(block), logs });

describe("decimals: on-chain 18 -> platform 6", () => {
  test("20 USDT (18 decimals) is 20_000_000 platform minor units", () => {
    assert.equal(toPlatformMinor(20n * E18, 18), 20_000_000n);
  });
  test("sub-microdollar dust is floored, never rounded up", () => {
    assert.equal(toPlatformMinor(E18 / 1_000_000n - 1n, 18), 0n);
    // 0.123456789999999999 tokens -> 0.123456 dollars; the trailing digits are dropped, not rounded.
    assert.equal(toPlatformMinor(123_456_789_999_999_999n, 18), 123_456n);
  });
  test("6-decimal tokens pass through unchanged", () => {
    assert.equal(toPlatformMinor(5_000_000n, 6), 5_000_000n);
  });
});

describe("verifyTransfer", () => {
  test("a confirmed USDT transfer to the player is VERIFIED with the amount in platform units", async () => {
    const rpc = fakeRpc({ eth_getTransactionReceipt: receipt([transferLog({})]), eth_blockNumber: hex(1020) });
    const r = createBscChainReader({ rpc });
    const v = await r.verifyTransfer({ txHash: HASH, expectedNetwork: "BEP20", expectedRecipient: PLAYER, asset: "USDT", requiredConfirmations: 15 });
    assert.equal(v.outcome, VerifyOutcome.VERIFIED);
    assert.equal(v.amountRaw, "20000000", "must be 6-decimal platform units, not the 18-decimal chain integer");
    assert.equal(v.amountOnChain, String(20n * E18));
    assert.equal(v.asset, "USDT");
    assert.equal(v.network, "BEP20");
    assert.equal(v.confirmations, 21);
    assert.equal(v.outputIndex, 3);
  });

  test("DAI is verified as DAI, from DAI's own contract", async () => {
    const rpc = fakeRpc({ eth_getTransactionReceipt: receipt([transferLog({ token: "DAI", amount: 7n * E18 })]), eth_blockNumber: hex(1100) });
    const v = await createBscChainReader({ rpc }).verifyTransfer({ txHash: HASH, expectedNetwork: "BSC", expectedRecipient: PLAYER, asset: "DAI" });
    assert.equal(v.outcome, VerifyOutcome.VERIFIED);
    assert.equal(v.asset, "DAI");
    assert.equal(v.amountRaw, "7000000");
  });

  test("a USDC transfer does NOT satisfy a USDT expectation", async () => {
    const rpc = fakeRpc({ eth_getTransactionReceipt: receipt([transferLog({ token: "USDC" })]), eth_blockNumber: hex(1100) });
    const v = await createBscChainReader({ rpc }).verifyTransfer({ txHash: HASH, expectedNetwork: "BEP20", expectedRecipient: PLAYER, asset: "USDT" });
    assert.equal(v.outcome, VerifyOutcome.NO_TRANSFER_EVENT);
  });

  test("a look-alike token at a different contract is ignored entirely", async () => {
    const fake = { ...transferLog({}), address: "0x" + "99".repeat(20) };
    const rpc = fakeRpc({ eth_getTransactionReceipt: receipt([fake]), eth_blockNumber: hex(1100) });
    const v = await createBscChainReader({ rpc }).verifyTransfer({ txHash: HASH, expectedNetwork: "BEP20", expectedRecipient: PLAYER, asset: "USDT" });
    assert.equal(v.outcome, VerifyOutcome.NO_TRANSFER_EVENT);
  });

  test("a transfer to someone else is WRONG_RECIPIENT, naming who actually received it", async () => {
    const rpc = fakeRpc({ eth_getTransactionReceipt: receipt([transferLog({ to: OTHER })]), eth_blockNumber: hex(1100) });
    const v = await createBscChainReader({ rpc }).verifyTransfer({ txHash: HASH, expectedNetwork: "BEP20", expectedRecipient: PLAYER, asset: "USDT" });
    assert.equal(v.outcome, VerifyOutcome.WRONG_RECIPIENT);
    assert.deepEqual(v.observedRecipients, [OTHER]);
  });

  test("a reverted transaction is TX_FAILED", async () => {
    const rpc = fakeRpc({ eth_getTransactionReceipt: receipt([transferLog({})], "0x0"), eth_blockNumber: hex(1100) });
    const v = await createBscChainReader({ rpc }).verifyTransfer({ txHash: HASH, expectedNetwork: "BEP20", expectedRecipient: PLAYER, asset: "USDT" });
    assert.equal(v.outcome, VerifyOutcome.TX_FAILED);
  });

  test("too few confirmations is NOT_CONFIRMED, never VERIFIED", async () => {
    const rpc = fakeRpc({ eth_getTransactionReceipt: receipt([transferLog({})]), eth_blockNumber: hex(1005) });
    const v = await createBscChainReader({ rpc }).verifyTransfer({ txHash: HASH, expectedNetwork: "BEP20", expectedRecipient: PLAYER, asset: "USDT", requiredConfirmations: 15 });
    assert.equal(v.outcome, VerifyOutcome.NOT_CONFIRMED);
    assert.equal(v.confirmations, 6);
  });

  test("an unknown hash is NOT_FOUND", async () => {
    const rpc = fakeRpc({ eth_getTransactionReceipt: null, eth_blockNumber: hex(1100) });
    const v = await createBscChainReader({ rpc }).verifyTransfer({ txHash: HASH, expectedNetwork: "BEP20", expectedRecipient: PLAYER, asset: "USDT" });
    assert.equal(v.outcome, VerifyOutcome.NOT_FOUND);
  });

  test("an unreachable node is PROVIDER_UNAVAILABLE, never a rejection", async () => {
    const rpc = fakeRpc({ eth_getTransactionReceipt: new ProviderUnavailableError("down") });
    const v = await createBscChainReader({ rpc }).verifyTransfer({ txHash: HASH, expectedNetwork: "BEP20", expectedRecipient: PLAYER, asset: "USDT" });
    assert.equal(v.outcome, VerifyOutcome.PROVIDER_UNAVAILABLE);
  });

  test("a Tron network is WRONG_NETWORK with no RPC call made", async () => {
    const rpc = fakeRpc({});
    const v = await createBscChainReader({ rpc }).verifyTransfer({ txHash: HASH, expectedNetwork: "TRON", expectedRecipient: PLAYER, asset: "USDT" });
    assert.equal(v.outcome, VerifyOutcome.WRONG_NETWORK);
    assert.equal(rpc.calls.length, 0);
  });

  test("several transfers of the same coin to the player in one tx are summed", async () => {
    const rpc = fakeRpc({
      eth_getTransactionReceipt: receipt([transferLog({ amount: 5n * E18, logIndex: 1 }), transferLog({ amount: 3n * E18, logIndex: 2 })]),
      eth_blockNumber: hex(1100),
    });
    const v = await createBscChainReader({ rpc }).verifyTransfer({ txHash: HASH, expectedNetwork: "BEP20", expectedRecipient: PLAYER, asset: "USDT" });
    assert.equal(v.amountRaw, "8000000");
  });
});

describe("verifyIncoming (discovery)", () => {
  test("a node refusing eth_getLogs is PROVIDER_UNAVAILABLE -- a real deposit is never reported absent", async () => {
    const rpc = fakeRpc({ eth_blockNumber: hex(2000), eth_getLogs: new ProviderUnavailableError("limit exceeded") });
    const v = await createBscChainReader({ rpc }).verifyIncoming({ network: "BEP20", address: PLAYER, asset: "USDT" });
    assert.equal(v.outcome, VerifyOutcome.PROVIDER_UNAVAILABLE);
  });

  test("with the webhook's tx hash, no discovery query is needed at all", async () => {
    const rpc = fakeRpc({ eth_getTransactionReceipt: receipt([transferLog({})]), eth_blockNumber: hex(1100) });
    const v = await createBscChainReader({ rpc }).verifyIncoming({ network: "BEP20", address: PLAYER, asset: "USDT", txHash: HASH });
    assert.equal(v.outcome, VerifyOutcome.VERIFIED);
    assert.ok(!rpc.calls.includes("eth_getLogs"));
  });

  test("discovered candidates are verified, and nothing found is NOT_FOUND", async () => {
    const found = fakeRpc({
      eth_blockNumber: hex(1100),
      eth_getLogs: [transferLog({})],
      eth_getTransactionReceipt: receipt([transferLog({})]),
    });
    assert.equal((await createBscChainReader({ rpc: found }).verifyIncoming({ network: "BEP20", address: PLAYER, asset: "USDT" })).outcome, VerifyOutcome.VERIFIED);

    const empty = fakeRpc({ eth_blockNumber: hex(1100), eth_getLogs: [] });
    assert.equal((await createBscChainReader({ rpc: empty }).verifyIncoming({ network: "BEP20", address: PLAYER, asset: "USDT" })).outcome, VerifyOutcome.NOT_FOUND);
  });
});

describe("ping", () => {
  test("a node on the wrong chain id is refused -- verification against someone else's chain is worthless", async () => {
    const rpc = fakeRpc({ eth_chainId: hex(97), eth_blockNumber: hex(1) }); // 97 = BSC testnet
    await assert.rejects(() => createBscChainReader({ rpc }).ping(), /expected 56/);
  });
});

describe("multi-chain routing", () => {
  const tron = createMockChainReader({ network: "TRON" });
  const bscRpc = () => fakeRpc({ eth_getTransactionReceipt: receipt([transferLog({ token: "DAI" })]), eth_blockNumber: hex(1100), eth_chainId: hex(56) });

  test("declares every rail each reader covers", () => {
    const multi = createMultiChainReader([tron, createBscChainReader({ rpc: bscRpc() })]);
    assert.deepEqual(multi.supportedRails, [
      { asset: "USDT", network: "TRON" },
      { asset: "USDT", network: "BEP20" }, { asset: "USDC", network: "BEP20" }, { asset: "DAI", network: "BEP20" },
    ]);
  });

  test("routes BEP20 to BSC and pins the asset: DAI verifies as DAI, not as USDT", async () => {
    const multi = createMultiChainReader([tron, createBscChainReader({ rpc: bscRpc() })]);
    const dai = await multi.verifyTransfer({ txHash: HASH, expectedNetwork: "BEP20", expectedRecipient: PLAYER, asset: "DAI" });
    assert.equal(dai.outcome, VerifyOutcome.VERIFIED);
    const asUsdt = await multi.verifyTransfer({ txHash: HASH, expectedNetwork: "BEP20", expectedRecipient: PLAYER, asset: "USDT" });
    assert.notEqual(asUsdt.outcome, VerifyOutcome.VERIFIED);
  });

  test("a network no reader speaks is WRONG_NETWORK", async () => {
    const multi = createMultiChainReader([tron, createBscChainReader({ rpc: bscRpc() })]);
    const v = await multi.verifyIncoming({ network: "ERC20", address: PLAYER, asset: "USDT" });
    assert.equal(v.outcome, VerifyOutcome.WRONG_NETWORK);
  });
});
