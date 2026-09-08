/**
 * The payment provider abstraction.
 *
 * The core platform must not know that NOWPayments exists. Provider-specific
 * vocabulary -- their status strings, their signature scheme, their id formats
 * -- stops at the adapter boundary and is mapped into our own enums before it
 * reaches anything else.
 *
 * The acceptance test for whether this abstraction is real: adding a second
 * provider must require zero changes to the ledger, wallet, risk or compliance
 * modules. `SandboxProvider` below exists partly to prove that, by being a
 * completely different implementation that the same code drives.
 */
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

/** Our vocabulary. A provider's strings are mapped into these, never stored raw. */
export const ProviderPaymentState = {
  PENDING: "PENDING",
  DETECTED: "DETECTED",
  CONFIRMING: "CONFIRMING",
  CONFIRMED: "CONFIRMED",
  UNDERPAID: "UNDERPAID",
  OVERPAID: "OVERPAID",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
};

export const ProviderPayoutState = {
  CREATED: "CREATED",
  PROCESSING: "PROCESSING",
  BROADCASTED: "BROADCASTED",
  CONFIRMED: "CONFIRMED",
  FAILED: "FAILED",
};

export const SigError = {
  MISSING: "SIGNATURE_MISSING",
  INVALID: "SIGNATURE_INVALID",
  MALFORMED: "PAYLOAD_MALFORMED",
};

/**
 * Verify an HMAC webhook signature.
 *
 * Two properties that matter more than they look:
 *   - the signature is checked against the RAW BYTES, before any parsing, so a
 *     payload that would crash or confuse the parser never reaches it;
 *   - comparison is constant-time, so the endpoint cannot be used as an oracle
 *     to discover a valid signature byte by byte.
 */
export function verifyHmacSignature(rawBody, signature, secret, { algorithm = "sha512" } = {}) {
  if (!signature || typeof signature !== "string") return { ok: false, error: SigError.MISSING };

  const expected = createHmac(algorithm, secret).update(rawBody).digest("hex");
  const given = Buffer.from(signature, "hex");
  const want = Buffer.from(expected, "hex");

  if (given.length !== want.length || given.length === 0) {
    return { ok: false, error: SigError.INVALID };
  }
  if (!timingSafeEqual(given, want)) return { ok: false, error: SigError.INVALID };
  return { ok: true };
}

/**
 * NOWPayments signs the JSON body with HMAC-SHA512 over the payload sorted by
 * key. Sorting is the provider's convention, so it lives here and nowhere else.
 */
export function canonicalNowPaymentsBody(payload) {
  const sortDeep = (v) => {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])]));
    }
    return v;
  };
  return JSON.stringify(sortDeep(payload));
}

/**
 * The NOWPayments adapter.
 *
 * Note what it does NOT do: it never credits anything, never touches the
 * ledger, and never decides that a payment is final. It reports what the
 * provider said. Whether that becomes money is decided elsewhere, after
 * independent on-chain confirmation.
 */
export function createNowPaymentsProvider({ apiKey, ipnSecret, http, baseUrl = "https://api.nowpayments.io/v1" }) {
  if (!ipnSecret) throw new TypeError("NOWPayments requires an IPN secret for webhook verification");

  const STATUS_MAP = {
    waiting: ProviderPaymentState.PENDING,
    confirming: ProviderPaymentState.CONFIRMING,
    confirmed: ProviderPaymentState.CONFIRMED,
    sending: ProviderPaymentState.CONFIRMING,
    partially_paid: ProviderPaymentState.UNDERPAID,
    finished: ProviderPaymentState.CONFIRMED,
    failed: ProviderPaymentState.FAILED,
    refunded: ProviderPaymentState.FAILED,
    expired: ProviderPaymentState.EXPIRED,
  };

  const PAYOUT_MAP = {
    CREATING: ProviderPayoutState.CREATED,
    WAITING: ProviderPayoutState.PROCESSING,
    PROCESSING: ProviderPayoutState.PROCESSING,
    SENDING: ProviderPayoutState.BROADCASTED,
    FINISHED: ProviderPayoutState.CONFIRMED,
    FAILED: ProviderPayoutState.FAILED,
    REJECTED: ProviderPayoutState.FAILED,
  };

  return {
    id: "nowpayments",

    async createDepositIntent({ userId, asset, network, idempotencyKey, amountMinor }) {
      const body = await http("POST", `${baseUrl}/payment`, {
        headers: { "x-api-key": apiKey, "content-type": "application/json" },
        body: {
          price_amount: Number(amountMinor) / 1e6,
          price_currency: "usd",
          pay_currency: payCurrency(asset, network),
          order_id: idempotencyKey,
          order_description: `deposit for ${userId}`,
        },
      });
      return {
        providerRef: String(body.payment_id),
        address: body.pay_address,
        asset,
        network,
        expiresAt: body.expiration_estimate_date ?? null,
      };
    },

    verifyWebhook(rawBody, headers) {
      const signature = headers["x-nowpayments-sig"] ?? headers["X-Nowpayments-Sig"];
      let parsed;
      try {
        parsed = JSON.parse(rawBody.toString("utf8"));
      } catch {
        return { ok: false, error: SigError.MALFORMED };
      }
      // NOWPayments signs the sorted form, so we must re-canonicalise before
      // comparing rather than signing the bytes as they arrived.
      const check = verifyHmacSignature(canonicalNowPaymentsBody(parsed), signature, ipnSecret);
      if (!check.ok) return check;

      return {
        ok: true,
        event: {
          providerEventId: `${parsed.payment_id}:${parsed.payment_status}`,
          type: "payment.status",
          providerRef: String(parsed.payment_id),
          state: STATUS_MAP[parsed.payment_status] ?? ProviderPaymentState.PENDING,
          // Reported only. Nothing here is trusted for crediting.
          reportedAmount: parsed.actually_paid ?? null,
          reportedAsset: parsed.pay_currency ?? null,
          reportedTxHash: parsed.payin_hash ?? null,
          raw: parsed,
        },
      };
    },

    async getPayment(providerRef) {
      const body = await http("GET", `${baseUrl}/payment/${providerRef}`, {
        headers: { "x-api-key": apiKey },
      });
      return {
        providerRef,
        state: STATUS_MAP[body.payment_status] ?? ProviderPaymentState.PENDING,
        reportedAmount: body.actually_paid ?? null,
        reportedTxHash: body.payin_hash ?? null,
      };
    },

    async createPayout({ withdrawalId, asset, network, destination, amountMinor, idempotencyKey }) {
      const body = await http("POST", `${baseUrl}/payout`, {
        headers: { "x-api-key": apiKey, "content-type": "application/json" },
        body: {
          withdrawals: [{
            address: destination,
            currency: payCurrency(asset, network),
            amount: Number(amountMinor) / 1e6,
            // The provider's own idempotency handle. Where a provider does not
            // support one, we reconcile before retrying -- never blind-retry.
            ipn_callback_url: undefined,
            unique_external_id: idempotencyKey ?? withdrawalId,
          }],
        },
      });
      const first = body.withdrawals?.[0] ?? {};
      return {
        providerRef: String(first.id ?? body.id),
        state: PAYOUT_MAP[first.status] ?? ProviderPayoutState.CREATED,
      };
    },

    async getPayout(providerRef) {
      const body = await http("GET", `${baseUrl}/payout/${providerRef}`, {
        headers: { "x-api-key": apiKey },
      });
      return {
        providerRef,
        state: PAYOUT_MAP[body.status] ?? ProviderPayoutState.PROCESSING,
        txHash: body.hash ?? null,
      };
    },
  };
}

/** USDT on TRON is "usdttrc20" in NOWPayments' vocabulary. */
function payCurrency(asset, network) {
  const key = `${asset}:${network}`.toUpperCase();
  const map = { "USDT:TRON": "usdttrc20" };
  const found = map[key];
  if (!found) throw new RangeError(`unsupported asset/network pair: ${asset} on ${network}`);
  return found;
}

/**
 * A fully in-process provider, used by the tests and by local development.
 *
 * It is a genuinely different implementation -- different signature scheme,
 * different id shapes, different state names -- so any test that drives both
 * this and the NOWPayments adapter through the same code is evidence that the
 * abstraction holds rather than leaking.
 */
export function createSandboxProvider({ secret = "sandbox-secret" } = {}) {
  const payments = new Map();
  const payouts = new Map();

  return {
    id: "sandbox",
    _payments: payments,
    _payouts: payouts,

    async createDepositIntent({ userId, asset, network, idempotencyKey }) {
      const providerRef = `sbx_${randomUUID().slice(0, 12)}`;
      const address = `T${providerRef.replace(/-/g, "").slice(0, 33)}`;
      payments.set(providerRef, {
        providerRef, userId, asset, network, idempotencyKey,
        state: ProviderPaymentState.PENDING,
      });
      return { providerRef, address, asset, network, expiresAt: null };
    },

    verifyWebhook(rawBody, headers) {
      const check = verifyHmacSignature(rawBody, headers["x-sandbox-sig"], secret, { algorithm: "sha256" });
      if (!check.ok) return check;
      let parsed;
      try { parsed = JSON.parse(rawBody.toString("utf8")); }
      catch { return { ok: false, error: SigError.MALFORMED }; }
      return {
        ok: true,
        event: {
          providerEventId: parsed.eventId,
          type: parsed.type,
          providerRef: parsed.providerRef,
          state: parsed.state,
          reportedAmount: parsed.amount ?? null,
          reportedAsset: parsed.asset ?? null,
          reportedTxHash: parsed.txHash ?? null,
          raw: parsed,
        },
      };
    },

    async getPayment(providerRef) {
      return payments.get(providerRef) ?? { providerRef, state: ProviderPaymentState.PENDING };
    },

    async createPayout({ withdrawalId, destination, amountMinor, idempotencyKey }) {
      const key = idempotencyKey ?? withdrawalId;
      // The provider is idempotent on the external id, so a retry after an
      // ambiguous response returns the ORIGINAL payout rather than a second one.
      for (const p of payouts.values()) if (p.externalId === key) return p;
      const providerRef = `payout_${randomUUID().slice(0, 12)}`;
      const payout = {
        providerRef, externalId: key, destination, amountMinor,
        state: ProviderPayoutState.PROCESSING, txHash: null,
      };
      payouts.set(providerRef, payout);
      return payout;
    },

    async getPayout(providerRef) {
      return payouts.get(providerRef) ?? { providerRef, state: ProviderPayoutState.FAILED };
    },

    /** Test helper: sign a webhook body the way this provider would. */
    sign(payload) {
      const raw = Buffer.from(JSON.stringify(payload));
      return { raw, signature: createHmac("sha256", secret).update(raw).digest("hex") };
    },
  };
}
