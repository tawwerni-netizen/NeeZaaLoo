/**
 * OxaPay payment provider adapter.
 *
 * Implements the ProviderPaymentState and ProviderPayoutState abstraction
 * for the OxaPay gateway (https://oxapay.com).
 *
 * Uses:
 * - White-Label API for dynamic user deposit addresses (POST /v1/payment/white-label)
 * - Webhook HMAC SHA-512 signature verification over raw request body
 * - Payout API (POST /v1/payout)
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { ProviderPaymentState, ProviderPayoutState, SigError } from "./provider.mjs";

const DEFAULT_BASE_URL = "https://api.oxapay.com";

function mapPaymentStatus(status) {
  const map = {
    paid: ProviderPaymentState.CONFIRMED,
    paying: ProviderPaymentState.CONFIRMING,
    confirming: ProviderPaymentState.CONFIRMING,
    waiting: ProviderPaymentState.PENDING,
    pending: ProviderPaymentState.PENDING,
    underpaid: ProviderPaymentState.UNDERPAID,
    failed: ProviderPaymentState.FAILED,
    expired: ProviderPaymentState.EXPIRED,
    rejected: ProviderPaymentState.FAILED,
  };
  return map[status] || ProviderPaymentState.PENDING;
}

function mapPayoutStatus(status) {
  const map = {
    complete: ProviderPayoutState.CONFIRMED,
    completed: ProviderPayoutState.CONFIRMED,
    paid: ProviderPayoutState.CONFIRMED,
    processing: ProviderPayoutState.PROCESSING,
    sending: ProviderPayoutState.BROADCASTED,
    pending: ProviderPayoutState.CREATED,
    failed: ProviderPayoutState.FAILED,
    rejected: ProviderPayoutState.FAILED,
  };
  return map[status] || ProviderPayoutState.PROCESSING;
}

/**
 * Standard fetch-based HTTP helper for OxaPay.
 */
async function defaultHttp(method, url, { headers = {}, body } = {}) {
  const reqInit = {
    method,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  };
  if (body !== undefined) {
    reqInit.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  const res = await fetch(url, reqInit);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`OxaPay API HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  if (!res.ok && json?.result !== 100) {
    throw new Error(`OxaPay API error (${res.status}): ${json?.message || text.slice(0, 200)}`);
  }
  return json;
}

export function createOxapayProvider({
  merchantApiKey = process.env.OXAPAY_MERCHANT_API_KEY || "",
  payoutApiKey = process.env.OXAPAY_PAYOUT_API_KEY || "",
  callbackUrl = process.env.OXAPAY_CALLBACK_URL || "",
  baseUrl = DEFAULT_BASE_URL,
  http = defaultHttp,
} = {}) {
  return {
    id: "oxapay",

    /**
     * Generate a unique deposit address using OxaPay Static Address or White-Label API.
     */
    async createDepositIntent({ userId, asset = "USDT", network = "TRC20", idempotencyKey, amountMinor }) {
      const parsedAmount = amountMinor ? Number(amountMinor) / 1e6 : 10;
      const normalizedNetwork = network === "TRON" ? "TRC20" : network;
      const staticNetwork = normalizedNetwork === "TRC20" ? "TRON" : normalizedNetwork;

      let address = null;
      let trackId = null;
      let qrCode = null;
      let isStatic = false;

      // 1. First attempt: OxaPay Static Address (reusable dedicated user wallet)
      try {
        const staticPayload = {
          merchant_api_key: merchantApiKey,
          network: staticNetwork,
          to_currency: asset,
          description: `Static wallet for player ${userId}`,
        };
        if (callbackUrl) {
          staticPayload.callback_url = callbackUrl;
        }

        const staticRes = await http("POST", `${baseUrl}/v1/payment/static-address`, {
          headers: {
            merchant_api_key: merchantApiKey,
            "content-type": "application/json",
          },
          body: staticPayload,
        });

        const resData = staticRes?.data || staticRes;
        if (resData && (staticRes?.result === 100 || resData.address || staticRes.address)) {
          address = resData.address || staticRes.address;
          trackId = resData.trackId || resData.track_id || staticRes.trackId || `static_${Date.now()}`;
          qrCode = resData.qrCode || staticRes.qrCode || null;
          isStatic = true;
        }
      } catch (err) {
        // Static address not available on this tier or network; fallback to white-label
      }

      // 2. Fallback attempt: OxaPay White-Label API
      if (!address) {
        const payload = {
          amount: parsedAmount > 0 ? parsedAmount : 10,
          pay_currency: asset,
          currency: "USD",
          network: normalizedNetwork,
          lifetime: 1440, // 24 hours
          order_id: idempotencyKey || `dep_${Date.now()}`,
          description: `Deposit for player ${userId}`,
        };

        if (callbackUrl) {
          payload.callback_url = callbackUrl;
        }

        const response = await http("POST", `${baseUrl}/v1/payment/white-label`, {
          headers: {
            merchant_api_key: merchantApiKey,
            "content-type": "application/json",
          },
          body: payload,
        });

        const respData = response?.data || response;
        trackId = respData.trackId || respData.track_id || response.trackId || response.id;
        address = respData.address || respData.payAddress || response.address || response.payAddress;
        qrCode = respData.qrCode || response.qrCode || null;
      }

      if (!address) {
        throw new Error("OxaPay did not return a deposit address");
      }

      return {
        providerRef: String(trackId || idempotencyKey),
        address,
        qrCodeUrl: qrCode,
        asset,
        network: normalizedNetwork,
        isStatic,
        expiresAt: isStatic
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year
          : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
    },

    /**
     * Verify OxaPay HMAC-SHA512 webhook signature.
     */
    verifyWebhook(rawBody, headers = {}) {
      const signature = headers.hmac || headers.HMAC || headers["x-oxapay-sig"];
      if (!signature || typeof signature !== "string") {
        return { ok: false, error: SigError.MISSING };
      }

      if (!merchantApiKey) {
        return { ok: false, error: "MERCHANT_KEY_UNCONFIGURED" };
      }

      const rawBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8");
      const expected = createHmac("sha512", merchantApiKey).update(rawBuffer).digest("hex");
      const given = Buffer.from(signature.trim().toLowerCase(), "hex");
      const want = Buffer.from(expected.toLowerCase(), "hex");

      if (given.length !== want.length || given.length === 0) {
        return { ok: false, error: SigError.INVALID };
      }
      if (!timingSafeEqual(given, want)) {
        return { ok: false, error: SigError.INVALID };
      }

      let parsed;
      try {
        parsed = JSON.parse(rawBuffer.toString("utf8"));
      } catch {
        return { ok: false, error: SigError.MALFORMED };
      }

      const rawStatus = String(parsed.status || "pending").toLowerCase();
      const state = mapPaymentStatus(rawStatus);
      const trackId = String(parsed.trackId || parsed.track_id || parsed.order_id || "");
      const address = String(parsed.address || parsed.pay_address || "");

      return {
        ok: true,
        event: {
          providerEventId: `${trackId || address}:${rawStatus}:${parsed.txID || parsed.txId || Date.now()}`,
          type: "payment.status",
          providerRef: trackId,
          address: address || null,
          state,
          reportedAmount: parsed.amount ? String(parsed.amount) : null,
          reportedAsset: parsed.pay_currency || parsed.currency || "USDT",
          reportedTxHash: parsed.txID || parsed.txId || parsed.tx_hash || null,
          raw: parsed,
        },
      };
    },

    /**
     * Inquire payment status directly from OxaPay.
     */
    async getPayment(providerRef) {
      const body = await http("GET", `${baseUrl}/v1/payment/${providerRef}`, {
        headers: { merchant_api_key: merchantApiKey },
      });

      const rawStatus = String(body.status || "").toLowerCase();
      return {
        providerRef,
        state: mapPaymentStatus(rawStatus),
        reportedAmount: body.amount ?? null,
        reportedTxHash: body.txID || body.txId || body.tx_hash || null,
      };
    },

    /**
     * Request a crypto payout to user address via OxaPay Payouts API.
     */
    async createPayout({ withdrawalId, asset = "USDT", network = "TRC20", destination, amountMinor }) {
      if (!payoutApiKey) {
        throw new Error("OxaPay Payout API key is not configured. Set OXAPAY_PAYOUT_API_KEY in .env");
      }

      const amount = Number(amountMinor) / 1e6;
      const normalizedNetwork = network === "TRON" ? "TRC20" : network;

      const payload = {
        address: destination,
        currency: asset,
        network: normalizedNetwork,
        amount,
        description: `Payout for ${withdrawalId}`,
      };
      if (callbackUrl) {
        payload.callback_url = callbackUrl.replace("/webhook", "/payout-webhook");
      }

      const body = await http("POST", `${baseUrl}/v1/payout`, {
        headers: {
          payout_api_key: payoutApiKey,
          "content-type": "application/json",
        },
        body: payload,
      });

      const trackId = body.data?.track_id || body.trackId || body.id;
      const rawStatus = String(body.data?.status || body.status || "processing").toLowerCase();

      return {
        providerRef: String(trackId || `payout_${Date.now()}`),
        state: mapPayoutStatus(rawStatus),
      };
    },

    /**
     * Inquire payout status from OxaPay.
     */
    async getPayout(providerRef) {
      const body = await http("GET", `${baseUrl}/v1/payout/${providerRef}`, {
        headers: { payout_api_key: payoutApiKey },
      });

      const rawStatus = String(body.status || "processing").toLowerCase();
      return {
        providerRef,
        state: mapPayoutStatus(rawStatus),
        txHash: body.txID || body.txId || body.tx_hash || null,
      };
    },
  };
}
