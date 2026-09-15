import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createOxapayProvider } from "../src/oxapay.mjs";
import { ProviderPaymentState, ProviderPayoutState, SigError } from "../src/provider.mjs";

describe("OxaPay Provider", () => {
  const merchantApiKey = "test-merchant-key-12345";
  const payoutApiKey = "test-payout-key-67890";

  test("createDepositIntent calls static-address API and returns formatted intent", async () => {
    let capturedReq = null;
    const http = async (method, url, options) => {
      capturedReq = { method, url, options };
      return {
        result: 100,
        message: "success",
        trackId: 987654321,
        address: "TX9zNizaloRealDepositAddressTRC20Official",
        qrCode: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      };
    };

    const provider = createOxapayProvider({ merchantApiKey, payoutApiKey, http });
    const res = await provider.createDepositIntent({
      userId: "alice",
      asset: "USDT",
      network: "TRC20",
      amountMinor: 25_000_000n, // $25.00
      idempotencyKey: "dep_intent_001",
    });

    assert.equal(capturedReq.method, "POST");
    assert.equal(capturedReq.url, "https://api.oxapay.com/v1/payment/static-address");
    assert.equal(capturedReq.options.headers.merchant_api_key, merchantApiKey);
    assert.equal(capturedReq.options.body.network, "TRON");
    assert.equal(capturedReq.options.body.to_currency, "USDT");

    assert.equal(res.providerRef, "987654321");
    assert.equal(res.address, "TX9zNizaloRealDepositAddressTRC20Official");
    assert.equal(res.qrCodeUrl, "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=");
    assert.equal(res.asset, "USDT");
    assert.equal(res.network, "TRC20");
    assert.equal(res.isStatic, true);
  });

  test("createDepositIntent falls back to white-label if static-address is unsupported", async () => {
    let calls = [];
    const http = async (method, url, options) => {
      calls.push({ method, url, options });
      if (url.includes("static-address")) {
        throw new Error("Static address not supported on account");
      }
      return {
        result: 100,
        message: "success",
        trackId: 123123123,
        address: "TFallbackWhiteLabelAddressTRC20",
      };
    };

    const provider = createOxapayProvider({ merchantApiKey, payoutApiKey, http });
    const res = await provider.createDepositIntent({
      userId: "alice",
      asset: "USDT",
      network: "TRC20",
      amountMinor: 25_000_000n,
      idempotencyKey: "dep_intent_fallback",
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://api.oxapay.com/v1/payment/static-address");
    assert.equal(calls[1].url, "https://api.oxapay.com/v1/payment/white-label");
    assert.equal(res.address, "TFallbackWhiteLabelAddressTRC20");
    assert.equal(res.isStatic, false);
  });

  test("verifyWebhook validates HMAC-SHA512 correctly", () => {
    const provider = createOxapayProvider({ merchantApiKey, payoutApiKey });
    const payload = {
      trackId: "123456",
      status: "Paid",
      amount: "50.00",
      pay_currency: "USDT",
      currency: "USD",
      txID: "0xabc123def456",
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const validHmac = createHmac("sha512", merchantApiKey).update(rawBody).digest("hex");

    // 1. Valid signature
    const verified = provider.verifyWebhook(rawBody, { HMAC: validHmac });
    assert.equal(verified.ok, true);
    assert.equal(verified.event.providerRef, "123456");
    assert.equal(verified.event.state, ProviderPaymentState.CONFIRMED);
    assert.equal(verified.event.reportedAmount, "50.00");
    assert.equal(verified.event.reportedTxHash, "0xabc123def456");

    // 2. Tampered body
    const tamperedBody = Buffer.from(JSON.stringify({ ...payload, amount: "5000.00" }));
    const tamperedCheck = provider.verifyWebhook(tamperedBody, { HMAC: validHmac });
    assert.equal(tamperedCheck.ok, false);
    assert.equal(tamperedCheck.error, SigError.INVALID);

    // 3. Missing HMAC header
    const missingCheck = provider.verifyWebhook(rawBody, {});
    assert.equal(missingCheck.ok, false);
    assert.equal(missingCheck.error, SigError.MISSING);
  });

  test("verifyWebhook maps OxaPay statuses accurately", () => {
    const provider = createOxapayProvider({ merchantApiKey, payoutApiKey });
    const checkStatus = (oxapayStatus, expectedState) => {
      const raw = Buffer.from(JSON.stringify({ trackId: "999", status: oxapayStatus }));
      const hmac = createHmac("sha512", merchantApiKey).update(raw).digest("hex");
      const r = provider.verifyWebhook(raw, { hmac });
      assert.equal(r.ok, true);
      assert.equal(r.event.state, expectedState, `status ${oxapayStatus} should map to ${expectedState}`);
    };

    checkStatus("Paid", ProviderPaymentState.CONFIRMED);
    checkStatus("paying", ProviderPaymentState.CONFIRMING);
    checkStatus("Expired", ProviderPaymentState.EXPIRED);
    checkStatus("Failed", ProviderPaymentState.FAILED);
    checkStatus("underPaid", ProviderPaymentState.UNDERPAID);
  });

  test("createPayout calls payout API and returns formatted reference", async () => {
    let capturedReq = null;
    const http = async (method, url, options) => {
      capturedReq = { method, url, options };
      return {
        result: 100,
        trackId: 888777666,
        status: "processing",
      };
    };

    const provider = createOxapayProvider({ merchantApiKey, payoutApiKey, http });
    const res = await provider.createPayout({
      withdrawalId: "wd_test_99",
      asset: "USDT",
      network: "TRC20",
      destination: "TLyqRhpP7fUqLhYQyA5H...",
      amountMinor: 15_000_000n, // $15.00
    });

    assert.equal(capturedReq.method, "POST");
    assert.equal(capturedReq.url, "https://api.oxapay.com/v1/payout");
    assert.equal(capturedReq.options.headers.payout_api_key, payoutApiKey);
    assert.equal(capturedReq.options.body.amount, 15);
    assert.equal(capturedReq.options.body.address, "TLyqRhpP7fUqLhYQyA5H...");

    assert.equal(res.providerRef, "888777666");
    assert.equal(res.state, ProviderPayoutState.PROCESSING);
  });
});
