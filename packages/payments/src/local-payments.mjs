/**
 * Vodafone Cash / InstaPay: the two local EGP rails added by
 * db/migrations/0062_local_egp_payment_rails.sql.
 *
 * This service is the one place application code touches that migration's
 * tables and functions. It does not reimplement any of the money logic --
 * `credit_local_deposit()` and `complete_manual_withdrawal()` remain the
 * only ways a deposit is credited or a local withdrawal is completed -- it
 * only validates input, translates a handful of Postgres errors into typed
 * results, and shapes rows for the API layer.
 *
 * The Android "Payment Receiver" app (packages/payment-receiver-android,
 * not built yet) will eventually call credit_local_deposit() itself once it
 * observes a matching transfer. Until then, `observeAndCredit()` below is
 * the manual stand-in: an admin who personally saw the money arrive logs it
 * by hand, through the EXACT same local_transfer_observed row and
 * credit_local_deposit() call the app will use later -- the deposit side of
 * this feature does not change shape when the app ships, only who calls it.
 */
import { randomUUID, createHash } from "node:crypto";
import { parseLocalPaymentSms, prepareReceiptText } from "./sms-parsers.mjs";

export const LocalPaymentError = {
  NOT_FOUND: "NOT_FOUND",
  INVALID_NETWORK: "INVALID_NETWORK",
  INVALID_AMOUNT: "INVALID_AMOUNT",
  INVALID_RECEIVING_NUMBER: "INVALID_RECEIVING_NUMBER",
  MISSING_SENDER_INFO: "MISSING_SENDER_INFO",
  NO_RATE_SET: "NO_RATE_SET",
  WRONG_STATE: "WRONG_STATE",
  REASON_REQUIRED: "REASON_REQUIRED",
  DUPLICATE_NUMBER: "DUPLICATE_NUMBER",
  RAIL_DISABLED: "RAIL_DISABLED",
  BELOW_MINIMUM: "BELOW_MINIMUM",
  ABOVE_MAXIMUM: "ABOVE_MAXIMUM",
  INVALID_IDEMPOTENCY_KEY: "INVALID_IDEMPOTENCY_KEY",
  INVALID_MESSAGE: "INVALID_MESSAGE",
  INVALID_OBSERVED_AT: "INVALID_OBSERVED_AT",
  INVALID_REFERENCE: "INVALID_REFERENCE",
  INVALID_SENDER: "INVALID_SENDER",
  DEVICE_DISABLED: "DEVICE_DISABLED",
};

/** What happened to one receipt a device reported. */
export const DeviceOutcome = {
  SUCCESS: "SUCCESS",                     // recorded and credited to the one matching intent
  NEEDS_REVIEW: "NEEDS_REVIEW",           // recorded; an admin must match it
  DUPLICATE: "DUPLICATE",                 // this receipt is already on file
  ALREADY_PROCESSED: "ALREADY_PROCESSED", // this device already reported this exact report
};

export const LOCAL_NETWORKS = new Set(["VODAFONE_CASH", "INSTAPAY"]);

const CLIENT_KEY_SHAPE = /^[A-Za-z0-9_-]{16,80}$/;
const MAX_RECEIPT_CHARS = 2000;
// observedAt is the phone's SMS timestamp; a phone clock a few minutes
// fast is ordinary, one far in the future is not a real receipt.
const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;

// Seeded by 0062 as an FK anchor for local_transfer_observed.device_id --
// there is no real device yet, so every manually-logged transfer is
// attributed to this placeholder rather than relaxing a NOT NULL constraint
// that will matter once the Android app is real.
const MANUAL_DEVICE_ID = "manual_admin";

export function createLocalPaymentsService(db, { intentTtlMinutes = 30 } = {}) {
  const svc = {
    // =========================================================================
    // Public / player-facing reads
    // =========================================================================

    /** What a player sees before choosing to send money: active numbers + the current rate. */
    async listActiveRails() {
      const numbers = await db.query(
        `SELECT ln.id, ln.network, ln.phone_number AS "phoneNumber", ln.label
           FROM local_payment_number ln
           JOIN payment_rail r ON r.asset = 'USDT' AND r.network = ln.network
          WHERE ln.enabled = TRUE AND r.enabled = TRUE AND r.deposits_enabled = TRUE
            AND r.status = 'ACTIVE'
          ORDER BY ln.network, ln.id`
      );
      const rate = await readEgpRate(db);
      return { numbers: numbers.rows, rate };
    },

    async getEgpRate() {
      return readEgpRate(db);
    },

    // =========================================================================
    // Player: deposit intents
    // =========================================================================

    async createDepositIntent({ playerId, network, receivingNumberId, senderName, senderPhone, amountEgpMinor }) {
      const net = String(network ?? "").trim().toUpperCase();
      if (!LOCAL_NETWORKS.has(net)) return { ok: false, reason: LocalPaymentError.INVALID_NETWORK };

      let amount;
      try { amount = BigInt(amountEgpMinor); } catch { return { ok: false, reason: LocalPaymentError.INVALID_AMOUNT }; }
      if (amount <= 0n) return { ok: false, reason: LocalPaymentError.INVALID_AMOUNT };

      const name = String(senderName ?? "").trim();
      const phone = String(senderPhone ?? "").trim();
      if (!name || !phone) return { ok: false, reason: LocalPaymentError.MISSING_SENDER_INFO };

      const numRes = await db.query(
        `SELECT id FROM local_payment_number WHERE id = $1 AND network = $2 AND enabled = TRUE`,
        [receivingNumberId, net]
      );
      if (!numRes.rows.length) return { ok: false, reason: LocalPaymentError.INVALID_RECEIVING_NUMBER };

      const rate = await readEgpRate(db);
      if (!rate) return { ok: false, reason: LocalPaymentError.NO_RATE_SET };

      // Same min/max every other rail already enforces on the admin Finance
      // Control screen (payment_rail.min/max_deposit_minor), applied to the
      // USDT amount this EGP deposit projects to at the current rate -- the
      // rail's own bounds are always denominated in the asset actually
      // credited, never in the local currency being converted from.
      const railRes = await db.query(
        `SELECT enabled, deposits_enabled, status, min_deposit_minor::text AS min, max_deposit_minor::text AS max
           FROM payment_rail WHERE asset = 'USDT' AND network = $1`,
        [net]
      );
      if (railRes.rows.length) {
        const rail = railRes.rows[0];
        if (!rail.enabled || !rail.deposits_enabled || rail.status !== "ACTIVE") {
          return { ok: false, reason: LocalPaymentError.RAIL_DISABLED };
        }
        const projectedUsdtMinor = (amount * BigInt(rate.usdRateX1e8)) / 10000n;
        if (rail.min != null && projectedUsdtMinor < BigInt(rail.min)) {
          return { ok: false, reason: LocalPaymentError.BELOW_MINIMUM };
        }
        if (rail.max != null && projectedUsdtMinor > BigInt(rail.max)) {
          return { ok: false, reason: LocalPaymentError.ABOVE_MAXIMUM };
        }
      }

      const id = `ldi_${randomUUID()}`;
      const r = await db.query(
        `INSERT INTO local_deposit_intent
           (id, player_id, network, receiving_number_id, declared_sender_name, declared_sender_phone,
            declared_amount_egp_minor, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7, now() + ($8 * interval '1 minute'))
         RETURNING id, player_id AS "playerId", network, receiving_number_id AS "receivingNumberId",
                   declared_sender_name AS "senderName", declared_sender_phone AS "senderPhone",
                   declared_amount_egp_minor::text AS "amountEgpMinor", status,
                   created_at AS "createdAt", expires_at AS "expiresAt"`,
        [id, playerId, net, receivingNumberId, name, phone, amount.toString(), intentTtlMinutes]
      );
      return { ok: true, intent: r.rows[0] };
    },

    async listPlayerIntents(playerId, { limit = 20 } = {}) {
      const r = await db.query(
        `SELECT id, network, receiving_number_id AS "receivingNumberId",
                declared_sender_name AS "senderName", declared_sender_phone AS "senderPhone",
                declared_amount_egp_minor::text AS "amountEgpMinor", status,
                credited_amount_usdt_minor::text AS "creditedAmountUsdtMinor",
                created_at AS "createdAt", expires_at AS "expiresAt", credited_at AS "creditedAt"
           FROM local_deposit_intent WHERE player_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [playerId, limit]
      );
      return r.rows;
    },

    // =========================================================================
    // Admin: numbers
    // =========================================================================

    async listNumbers() {
      const r = await db.query(
        `SELECT id, network, phone_number AS "phoneNumber", label, enabled, created_at AS "createdAt"
           FROM local_payment_number ORDER BY network, id`
      );
      return r.rows;
    },

    async createNumber({ id, network, phoneNumber, label }) {
      const net = String(network ?? "").trim().toUpperCase();
      if (!LOCAL_NETWORKS.has(net)) return { ok: false, reason: LocalPaymentError.INVALID_NETWORK };
      const phone = String(phoneNumber ?? "").trim();
      if (!phone) return { ok: false, reason: LocalPaymentError.INVALID_AMOUNT };
      const prefix = net === "VODAFONE_CASH" ? "vf" : "instapay";
      const numberId = id ? String(id) : `${prefix}_${randomUUID().slice(0, 8)}`;
      try {
        const r = await db.query(
          `INSERT INTO local_payment_number (id, network, phone_number, label)
           VALUES ($1,$2,$3,$4)
           RETURNING id, network, phone_number AS "phoneNumber", label, enabled, created_at AS "createdAt"`,
          [numberId, net, phone, label ? String(label) : null]
        );
        return { ok: true, number: r.rows[0] };
      } catch (e) {
        if (/local_payment_number_unique/.test(e.message)) return { ok: false, reason: LocalPaymentError.DUPLICATE_NUMBER };
        if (/local_payment_number_pkey/.test(e.message)) return { ok: false, reason: LocalPaymentError.DUPLICATE_NUMBER };
        throw e;
      }
    },

    async setNumberEnabled(id, enabled) {
      const r = await db.query(
        `UPDATE local_payment_number SET enabled = $2 WHERE id = $1
         RETURNING id, network, phone_number AS "phoneNumber", label, enabled, created_at AS "createdAt"`,
        [id, enabled === true]
      );
      if (!r.rows.length) return { ok: false, reason: LocalPaymentError.NOT_FOUND };
      return { ok: true, number: r.rows[0] };
    },

    async deleteNumber(id) {
      try {
        const r = await db.query(`DELETE FROM local_payment_number WHERE id = $1 RETURNING id`, [id]);
        if (!r.rows.length) return { ok: false, reason: LocalPaymentError.NOT_FOUND };
        return { ok: true };
      } catch (e) {
        if (/violates foreign key constraint/.test(e.message)) {
          return { ok: false, reason: "IN_USE" };
        }
        throw e;
      }
    },

    // =========================================================================
    // Admin: EGP/USD rate
    // =========================================================================

    /** `egpPerUsd`: what the admin types ("1 USD = how many EGP"), e.g. 50. */
    async setEgpRate({ egpPerUsd, adminId, reason }) {
      const egp = Number(egpPerUsd);
      if (!Number.isFinite(egp) || egp <= 0) return { ok: false, reason: LocalPaymentError.INVALID_AMOUNT };
      if (!reason || !String(reason).trim()) return { ok: false, reason: LocalPaymentError.REASON_REQUIRED };
      const usdRateX1e8 = Math.round(1e8 / egp);
      const r = await db.query(
        `SELECT snapshot_id::text AS "snapshotId", status, deviation_bps AS "deviationBps"
           FROM record_valuation_snapshot('EGP', $1, 'MANUAL', now(), 10000, $2, $3)`,
        [usdRateX1e8, adminId, String(reason)]
      );
      return { ok: true, snapshot: r.rows[0], rate: await readEgpRate(db) };
    },

    // =========================================================================
    // Admin: deposit review
    // =========================================================================

    async adminListIntents({ status, limit = 100 } = {}) {
      const params = [];
      let where = "";
      if (status) { params.push(String(status)); where = `WHERE status = $${params.length}`; }
      params.push(limit);
      const r = await db.query(
        `SELECT id, player_id AS "playerId", network, receiving_number_id AS "receivingNumberId",
                declared_sender_name AS "senderName", declared_sender_phone AS "senderPhone",
                declared_amount_egp_minor::text AS "amountEgpMinor", status,
                credited_amount_usdt_minor::text AS "creditedAmountUsdtMinor",
                reviewed_by AS "reviewedBy", review_reason AS "reviewReason",
                created_at AS "createdAt", expires_at AS "expiresAt", credited_at AS "creditedAt"
           FROM local_deposit_intent ${where}
          ORDER BY created_at DESC LIMIT $${params.length}`,
        params
      );
      return r.rows;
    },

    /**
     * The manual stand-in for the Android app: an admin personally saw a
     * transfer arrive and logs it, exactly as the app eventually will. Goes
     * through the SAME local_transfer_observed insert + credit_local_deposit()
     * call, so a deposit credited this way is indistinguishable in the
     * ledger from one the app will credit later.
     */
    async observeAndCredit({ intentId, adminId, rawSenderName, rawSenderPhone, amountEgpMinor, rawMessage, observedAt, transactionRef }) {
      const intentRes = await db.query(`SELECT * FROM local_deposit_intent WHERE id = $1`, [intentId]);
      if (!intentRes.rows.length) return { ok: false, reason: LocalPaymentError.NOT_FOUND };
      const intent = intentRes.rows[0];
      // Idempotent, mirroring credit_local_deposit()'s own idempotency: a
      // retried report (the operator's phone forwarding the same
      // notification twice, or an admin double-clicking) must not attempt a
      // second transfer/credit against an intent already settled.
      if (intent.status === "CREDITED") return { ok: true, intent };
      if (!["PENDING", "MATCHED"].includes(intent.status)) return { ok: false, reason: LocalPaymentError.WRONG_STATE };

      let amount;
      try { amount = BigInt(amountEgpMinor); } catch { return { ok: false, reason: LocalPaymentError.INVALID_AMOUNT }; }
      if (amount <= 0n) return { ok: false, reason: LocalPaymentError.INVALID_AMOUNT };

      const transferId = `lto_${randomUUID()}`;
      await db.query(
        `INSERT INTO local_transfer_observed
           (id, network, received_number_id, raw_sender_name, raw_sender_phone, amount_egp_minor,
            raw_message, device_id, observed_at, transaction_ref)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          transferId, intent.network, intent.receiving_number_id,
          rawSenderName ? String(rawSenderName) : null, rawSenderPhone ? String(rawSenderPhone) : null,
          amount.toString(), rawMessage ? String(rawMessage) : `Manually logged by admin ${adminId}`,
          MANUAL_DEVICE_ID, observedAt ? new Date(observedAt) : new Date(), transactionRef ? String(transactionRef) : null
        ]
      );

      try {
        const credited = await db.query(`SELECT * FROM credit_local_deposit($1,$2)`, [intentId, transferId]);
        return { ok: true, intent: credited.rows[0] };
      } catch (e) {
        if (/no EGP\/USD rate/.test(e.message)) return { ok: false, reason: LocalPaymentError.NO_RATE_SET };
        throw e;
      }
    },

    async rejectIntent({ intentId, adminId, reason }) {
      if (!reason || !String(reason).trim()) return { ok: false, reason: LocalPaymentError.REASON_REQUIRED };
      const r = await db.query(
        `UPDATE local_deposit_intent
            SET status = 'REJECTED', reviewed_by = $2, review_reason = $3, reviewed_at = now()
          WHERE id = $1 AND status IN ('PENDING','MATCHED')
          RETURNING id, status, reviewed_by AS "reviewedBy", review_reason AS "reviewReason"`,
        [intentId, adminId, String(reason)]
      );
      if (!r.rows.length) return { ok: false, reason: LocalPaymentError.WRONG_STATE };
      return { ok: true, intent: r.rows[0] };
    },

    // =========================================================================
    // Admin: withdrawal fulfilment
    // =========================================================================

    async adminListPendingWithdrawals({ limit = 100 } = {}) {
      const rate = await readEgpRate(db);
      const egpPerUsd = rate?.egpPerUsd ?? 50;
      const r = await db.query(
        `SELECT id, player_id AS "playerId", asset, network, destination,
                amount_minor::text AS "amountMinor", fee_minor::text AS "feeMinor",
                status, requested_at AS "requestedAt"
           FROM withdrawal
          WHERE network IN ('VODAFONE_CASH','INSTAPAY') AND status IN ('APPROVED','PROCESSING')
          ORDER BY requested_at ASC LIMIT $1`,
        [limit]
      );
      return r.rows.map((row) => {
        const usdtAmount = Number(row.amountMinor) / 1_000_000;
        const egpAmount = (usdtAmount * egpPerUsd).toFixed(2);
        const egpRound = Math.round(usdtAmount * egpPerUsd);
        const cleanPhone = String(row.destination || "").replace(/[^0-9]/g, "");
        const ussdCode = row.network === "VODAFONE_CASH" && cleanPhone
          ? `*9*7*${cleanPhone}*${egpRound}#`
          : null;
        return {
          ...row,
          amountUsdt: usdtAmount.toFixed(2),
          amountEgp: egpAmount,
          amountEgpRound: egpRound,
          cleanPhone,
          ussdCode,
          egpPerUsd,
        };
      });
    },

    async completeWithdrawal({ withdrawalId, adminId, reference }) {
      if (!reference || !String(reference).trim()) return { ok: false, reason: LocalPaymentError.REASON_REQUIRED };
      try {
        const r = await db.query(
          `SELECT id, status::text AS status, tx_hash AS "reference", provider, completed_at AS "completedAt"
             FROM complete_manual_withdrawal($1,$2,$3)`,
          [withdrawalId, adminId, String(reference)]
        );
        return { ok: true, withdrawal: r.rows[0] };
      } catch (e) {
        if (/no such withdrawal/.test(e.message)) return { ok: false, reason: LocalPaymentError.NOT_FOUND };
        if (/is only for local rails|cannot complete|requires a reference|requires the admin/.test(e.message)) {
          return { ok: false, reason: LocalPaymentError.WRONG_STATE, detail: e.message };
        }
        throw e;
      }
    },

    // =========================================================================
    // Admin: Device Management
    // =========================================================================

    async listDevices() {
      const r = await db.query(`
        SELECT id, label, enabled, created_by AS "createdBy", created_at AS "createdAt", last_seen_at AS "lastSeenAt"
        FROM payment_receiver_device
        WHERE id != $1
        ORDER BY created_at DESC
      `, [MANUAL_DEVICE_ID]);
      return r.rows;
    },

    async issueDeviceKey({ label, adminId }) {
      if (!label || !String(label).trim()) return { ok: false, reason: LocalPaymentError.REASON_REQUIRED };
      
      const id = `prd_${randomUUID()}`;
      const apiKey = `prk_${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`;
      const hash = createHash('sha256').update(apiKey).digest('hex');
      
      await db.query(`
        INSERT INTO payment_receiver_device (id, label, api_key_hash, created_by)
        VALUES ($1, $2, $3, $4)
      `, [id, String(label).trim(), hash, adminId]);
      
      return { ok: true, device: { id, label: String(label).trim(), apiKey } };
    },

    async setDeviceEnabled(id, enabled) {
      if (id === MANUAL_DEVICE_ID) return { ok: false, reason: LocalPaymentError.WRONG_STATE };
      const r = await db.query(`
        UPDATE payment_receiver_device SET enabled = $2 WHERE id = $1
        RETURNING id, label, enabled, created_by AS "createdBy", created_at AS "createdAt", last_seen_at AS "lastSeenAt"
      `, [id, enabled === true]);
      if (!r.rows.length) return { ok: false, reason: LocalPaymentError.NOT_FOUND };
      return { ok: true, device: r.rows[0] };
    },

    async deleteDevice(id) {
      if (id === MANUAL_DEVICE_ID) return { ok: false, reason: LocalPaymentError.WRONG_STATE };
      try {
        const r = await db.query(`DELETE FROM payment_receiver_device WHERE id = $1 RETURNING id`, [id]);
        if (!r.rows.length) return { ok: false, reason: LocalPaymentError.NOT_FOUND };
        return { ok: true };
      } catch (e) {
        if (/violates foreign key constraint/.test(e.message)) {
          return { ok: false, reason: "IN_USE" };
        }
        throw e;
      }
    },

    // =========================================================================
    // Device: Transfer Reporting
    // =========================================================================

    /**
     * The legacy device route (POST /v1/payment-receiver/transfers), kept for
     * APKs already installed. Same ingest path as the typed route below, so
     * old devices get the same duplicate and trust rules; only the response
     * shape is the old one.
     */
    async reportDeviceTransfer(input) {
      // Old APKs never send the SMS sender; the typed route requires it.
      const r = await svc.ingestDeviceTransfer({ ...input, clientTransactionId: null, smsSender: null, requireSender: false });
      if (!r.ok) return r;
      if (r.outcome === DeviceOutcome.DUPLICATE || r.outcome === DeviceOutcome.ALREADY_PROCESSED) {
        return { ok: true, status: "IGNORED", reason: "DUPLICATE" };
      }
      return {
        ok: true,
        status: r.transaction.status,
        intentId: r.transaction.intentId ?? undefined,
        transferId: r.transaction.id,
      };
    },

    /**
     * Records one receipt a device observed and, when it is unambiguous,
     * credits the one deposit intent it pays for.
     *
     * Trust rules:
     * - The amount, sender and reference credited come from the SERVER's own
     *   parse of `rawMessage`. The device's extracted fields are advisory and
     *   only stored when the server cannot parse the text -- and such a
     *   transfer is never auto-credited.
     * - A receipt whose SMS came from a personal mobile number is never
     *   auto-credited: providers do not send from one, forgers do.
     * - Auto-credit requires exactly one PENDING intent on the same network,
     *   receiving number and amount, from the same sender phone or name.
     *
     * Duplicate rules, checked by the database, not by a read-then-write:
     * - Same (device, clientTransactionId): the device's own retry ->
     *   ALREADY_PROCESSED with the original result.
     * - Same receipt text or same provider reference under a different key ->
     *   DUPLICATE, nothing new recorded.
     */
    async ingestDeviceTransfer({
      deviceId, clientTransactionId, network, receivingNumberId,
      rawSenderName, rawSenderPhone, amountEgpMinor, rawMessage, observedAt, transactionRef,
      smsSender, requireSender = true,
    }) {
      const net = String(network ?? "").trim().toUpperCase();
      if (!LOCAL_NETWORKS.has(net)) return { ok: false, reason: LocalPaymentError.INVALID_NETWORK };

      const sender = smsSender == null ? "" : String(smsSender).trim();
      if ((requireSender && !sender) || sender.length > 64) {
        return { ok: false, reason: LocalPaymentError.INVALID_SENDER };
      }
      // "unknown": the phone could not capture the sender (e.g. a receipt
      // carried over from an older app version), so nothing vouches for it.
      const untrustedSender = sender !== "" && (isPersonalNumberSender(sender) || sender.toLowerCase() === "unknown");

      const key = clientTransactionId == null ? null : String(clientTransactionId);
      if (key !== null && !CLIENT_KEY_SHAPE.test(key)) {
        return { ok: false, reason: LocalPaymentError.INVALID_IDEMPOTENCY_KEY };
      }

      const text = typeof rawMessage === "string" ? rawMessage : "";
      if (!text.trim() || text.length > MAX_RECEIPT_CHARS) {
        return { ok: false, reason: LocalPaymentError.INVALID_MESSAGE };
      }

      const observed = observedAt == null ? new Date() : new Date(observedAt);
      if (Number.isNaN(observed.getTime()) || observed.getTime() > Date.now() + MAX_CLOCK_SKEW_MS) {
        return { ok: false, reason: LocalPaymentError.INVALID_OBSERVED_AT };
      }

      if (key !== null) {
        const prior = await findDeviceTransferByKey(db, deviceId, key);
        if (prior) return { ok: true, outcome: DeviceOutcome.ALREADY_PROCESSED, transaction: prior };
      }

      const parsed = parseLocalPaymentSms(text);
      const serverParsed = parsed !== null && parsed.network === net;

      let amount;
      let senderName;
      let senderPhone;
      let ref;
      let reviewReason = null;
      if (serverParsed) {
        amount = parsed.amountEgpMinor;
        senderName = parsed.senderName;
        senderPhone = parsed.senderPhone;
        ref = parsed.transactionRef;
      } else {
        reviewReason = parsed === null ? "UNPARSEABLE" : "NETWORK_MISMATCH";
        try { amount = BigInt(amountEgpMinor); } catch { return { ok: false, reason: LocalPaymentError.INVALID_AMOUNT }; }
        if (amount <= 0n) return { ok: false, reason: LocalPaymentError.INVALID_AMOUNT };
        senderName = rawSenderName ? String(rawSenderName).slice(0, 200) : null;
        senderPhone = rawSenderPhone ? String(rawSenderPhone).slice(0, 32) : null;
        ref = transactionRef ? String(transactionRef).slice(0, 64) : null;
      }
      if (untrustedSender) reviewReason = "UNTRUSTED_SENDER";

      // A device on a dual-SIM phone may not know which of its lines the SMS
      // arrived on, and sends every candidate number id; the first is where
      // the row is filed unless an intent on another candidate matches.
      const possibleNumbers = String(receivingNumberId ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const primaryNumber = possibleNumbers[0];
      if (!primaryNumber) return { ok: false, reason: LocalPaymentError.INVALID_RECEIVING_NUMBER };
      const numRes = await db.query(
        "SELECT id FROM local_payment_number WHERE id = $1 AND network = $2",
        [primaryNumber, net]
      );
      if (!numRes.rows.length) return { ok: false, reason: LocalPaymentError.INVALID_RECEIVING_NUMBER };

      const transferId = `lto_${randomUUID()}`;
      const inserted = await db.query(
        `INSERT INTO local_transfer_observed
           (id, network, received_number_id, raw_sender_name, raw_sender_phone, amount_egp_minor,
            raw_message, device_id, observed_at, status, transaction_ref,
            client_idempotency_key, message_fingerprint, review_reason, sms_sender)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'UNMATCHED',$10,$11,$12,$13,$14)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          transferId, net, primaryNumber, senderName, senderPhone, amount.toString(), text,
          deviceId, observed, ref, key, receiptFingerprint(net, text), reviewReason, sender || null,
        ]
      );

      if (!inserted.rows.length) {
        // Lost a race with our own retry, or this receipt is already on file.
        if (key !== null) {
          const prior = await findDeviceTransferByKey(db, deviceId, key);
          if (prior) return { ok: true, outcome: DeviceOutcome.ALREADY_PROCESSED, transaction: prior };
        }
        const original = await findTransferByReceipt(db, net, receiptFingerprint(net, text), ref);
        return { ok: true, outcome: DeviceOutcome.DUPLICATE, transaction: original };
      }

      if (serverParsed && !untrustedSender) {
        await tryAutoCredit(db, {
          transferId, net, possibleNumbers, primaryNumber, amount, observed,
          senderPhone: senderPhone ?? "", senderName: senderName ?? "",
        });
      }

      const transaction = await findTransferById(db, transferId);
      return {
        ok: true,
        outcome: transaction.credited ? DeviceOutcome.SUCCESS : DeviceOutcome.NEEDS_REVIEW,
        transaction,
      };
    },

    /** Current backend view of transfers this device reported -- never another device's. */
    async deviceTransactionStatuses({ deviceId, ids }) {
      const list = (Array.isArray(ids) ? ids : []).map(String).filter((s) => /^lto_[0-9a-f-]{36}$/.test(s)).slice(0, 100);
      if (!list.length) return [];
      const r = await db.query(
        `${TRANSFER_SELECT} WHERE t.device_id = $1 AND t.id = ANY($2::text[])`,
        [deviceId, list]
      );
      return r.rows.map(shapeTransfer);
    },

    /** Today's activity for one device, "today" being the Cairo calendar day the operator lives in. */
    async deviceStatistics({ deviceId }) {
      const r = await db.query(
        `WITH today AS (
           SELECT date_trunc('day', now() AT TIME ZONE 'Africa/Cairo') AT TIME ZONE 'Africa/Cairo' AS start_at
         )
         SELECT
           (SELECT count(*) FROM local_transfer_observed t, today
             WHERE t.device_id = $1 AND t.reported_at >= today.start_at)::int AS received,
           (SELECT count(*) FROM local_transfer_observed t, today
             WHERE t.device_id = $1 AND t.reported_at >= today.start_at AND t.status = 'MATCHED')::int AS credited,
           (SELECT count(*) FROM local_transfer_observed t, today
             WHERE t.device_id = $1 AND t.reported_at >= today.start_at AND t.status = 'UNMATCHED')::int AS "needsReview",
           (SELECT count(*) FROM withdrawal
             WHERE network IN ('VODAFONE_CASH','INSTAPAY') AND status IN ('APPROVED','PROCESSING'))::int AS "pendingWithdrawals",
           (SELECT count(*) FROM local_deposit_intent
             WHERE status = 'PENDING' AND expires_at > now())::int AS "pendingDeposits"`,
        [deviceId]
      );
      return r.rows[0];
    },

    async deviceGetWithdrawal({ withdrawalId }) {
      const r = await db.query(
        `${WITHDRAWAL_SELECT} WHERE w.id = $1 AND w.network IN ('VODAFONE_CASH','INSTAPAY')`,
        [String(withdrawalId ?? "")]
      );
      if (!r.rows.length) return { ok: false, reason: LocalPaymentError.NOT_FOUND };
      return { ok: true, withdrawal: shapeWithdrawal(r.rows[0], await readEgpRate(db)) };
    },

    /**
     * The operator sent the money by hand; record it. Idempotent per
     * `idempotencyKey`: the second tap of a double-tap, or a retry after a
     * lost response, answers ALREADY_PROCESSED and posts nothing.
     */
    async deviceConfirmWithdrawal({ deviceId, withdrawalId, idempotencyKey, reference }) {
      const key = String(idempotencyKey ?? "");
      if (!CLIENT_KEY_SHAPE.test(key)) return { ok: false, reason: LocalPaymentError.INVALID_IDEMPOTENCY_KEY };
      const typed = reference == null ? "" : String(reference).trim();
      if (typed.length > 64) return { ok: false, reason: LocalPaymentError.INVALID_REFERENCE };
      // No reference typed: the payout is still traceable to this device and
      // this request, and unique per withdrawal as the ledger requires.
      const ref = typed || `PRD-${String(withdrawalId)}`;
      try {
        const r = await db.query(
          `SELECT o_outcome AS outcome FROM device_confirm_local_withdrawal($1,$2,$3,$4)`,
          [key, String(withdrawalId ?? ""), deviceId, ref]
        );
        const detail = await svc.deviceGetWithdrawal({ withdrawalId });
        return { ok: true, outcome: r.rows[0].outcome, withdrawal: detail.withdrawal };
      } catch (e) {
        if (/no such withdrawal/.test(e.message)) return { ok: false, reason: LocalPaymentError.NOT_FOUND };
        if (/idempotency key reused/.test(e.message)) return { ok: false, reason: LocalPaymentError.INVALID_IDEMPOTENCY_KEY };
        if (/withdrawal_one_tx_per_payout/.test(e.message)) return { ok: false, reason: LocalPaymentError.INVALID_REFERENCE };
        if (/is not enabled/.test(e.message)) return { ok: false, reason: LocalPaymentError.DEVICE_DISABLED };
        if (/is only for local rails|cannot complete|requires a reference|requires the admin/.test(e.message)) {
          return { ok: false, reason: LocalPaymentError.WRONG_STATE, detail: e.message };
        }
        throw e;
      }
    },

    /** Resolves a device api key; null for unknown or disabled keys. */
    async authenticateDevice(apiKey) {
      if (typeof apiKey !== "string" || apiKey.length < 16 || apiKey.length > 200) return null;
      return resolveDevice(db, apiKey);
    },

    /** Caller has already authenticated the device (see authenticateDevice). */
    async deviceListPendingDeposits() {
      const r = await db.query(
        `SELECT id, player_id AS "playerId", network, receiving_number_id AS "receivingNumberId",
                declared_sender_name AS "senderName", declared_sender_phone AS "senderPhone",
                declared_amount_egp_minor::text AS "amountEgpMinor", status,
                created_at AS "createdAt", expires_at AS "expiresAt"
           FROM local_deposit_intent
          WHERE status = 'PENDING'
          ORDER BY created_at ASC LIMIT 100`
      );
      return { ok: true, deposits: r.rows };
    },

    /** Caller has already authenticated the device (see authenticateDevice). */
    async deviceListPendingWithdrawals() {
      const r = await db.query(
        `${WITHDRAWAL_SELECT}
          WHERE w.network IN ('VODAFONE_CASH','INSTAPAY') AND w.status IN ('APPROVED','PROCESSING')
          ORDER BY w.requested_at ASC`
      );
      // withdrawal.amount_minor is always USDT (6 decimals) -- the player's
      // balance was never anything else -- but the operator is sending cash
      // EGP by hand. Without the rate here, the app has no way to tell them
      // how many pounds that USDT amount is actually worth right now.
      const rate = await readEgpRate(db);
      return { ok: true, withdrawals: r.rows.map((row) => shapeWithdrawal(row, rate)), rate };
    },

    // =========================================================================
    // Admin: Transfer Review (Unmatched)
    // =========================================================================


    async listUnmatchedTransfers({ limit = 100 } = {}) {
      const r = await db.query(`
        SELECT id, network, received_number_id AS "receivedNumberId",
               raw_sender_name AS "rawSenderName", raw_sender_phone AS "rawSenderPhone",
               amount_egp_minor::text AS "amountEgpMinor", raw_message AS "rawMessage",
               device_id AS "deviceId", observed_at AS "observedAt", reported_at AS "reportedAt"
        FROM local_transfer_observed
        WHERE status = 'UNMATCHED'
        ORDER BY reported_at DESC LIMIT $1
      `, [limit]);
      return r.rows;
    },

    async matchTransferToIntent({ intentId, transferId, adminId }) {
      const intentRes = await db.query(`SELECT status FROM local_deposit_intent WHERE id = $1`, [intentId]);
      if (!intentRes.rows.length) return { ok: false, reason: LocalPaymentError.NOT_FOUND };
      if (!['PENDING', 'MATCHED'].includes(intentRes.rows[0].status)) return { ok: false, reason: LocalPaymentError.WRONG_STATE };
      
      const transferRes = await db.query(`SELECT status FROM local_transfer_observed WHERE id = $1`, [transferId]);
      if (!transferRes.rows.length) return { ok: false, reason: LocalPaymentError.NOT_FOUND };
      if (transferRes.rows[0].status !== 'UNMATCHED') return { ok: false, reason: LocalPaymentError.WRONG_STATE };

      try {
        const credited = await db.query(`SELECT * FROM credit_local_deposit($1,$2)`, [intentId, transferId]);
        
        await db.query(`
          UPDATE local_deposit_intent 
          SET reviewed_by = $1, review_reason = 'Manual match by admin', reviewed_at = now()
          WHERE id = $2
        `, [adminId, intentId]);

        return { ok: true, intent: credited.rows[0] };
      } catch (e) {
        if (/no EGP\/USD rate/.test(e.message)) return { ok: false, reason: LocalPaymentError.NO_RATE_SET };
        throw e;
      }
    },
  };
  return svc;
}

/**
 * Resolves the Android app's api key to its device row, or null.
 *
 * Hashed in JS, not with SQL's sha256($1::bytea): a plain JS string handed
 * to a bytea-typed parameter is not reliably the same bytes as
 * createHash('sha256').update(apiKey) expects -- Postgres's bytea 'escape'
 * input format is not a UTF-8 encoding, it is its own literal syntax, and
 * drivers differ on how a bare string gets there. Hashing here instead,
 * exactly like server.mjs's own device routes already do, compares hex to
 * hex with no cast involved.
 */
async function resolveDevice(db, apiKey) {
  const hash = createHash("sha256").update(String(apiKey ?? "")).digest("hex");
  const r = await db.query(
    "SELECT id, label, created_by AS \"createdBy\" FROM payment_receiver_device WHERE api_key_hash = $1 AND enabled = true",
    [hash]
  );
  if (!r.rows.length) return null;
  await db.query(
    `UPDATE payment_receiver_device SET last_seen_at = now()
      WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < now() - interval '30 seconds')`,
    [r.rows[0].id]
  );
  return r.rows[0];
}

/**
 * The text a receipt fingerprint is taken over: the same message delivered
 * twice must hash the same even if a carrier re-wrapped whitespace or the
 * phone rendered digits as Arabic-Indic.
 */
export function normalizeReceiptText(text) {
  return prepareReceiptText(text).replace(/\s+/g, " ").trim();
}

/**
 * True for an ordinary phone number as an SMS sender. Providers send from
 * alphanumeric IDs ("VF-Cash", "CIB") or short codes. Mirrors SenderPolicy
 * in the Android app.
 */
export function isPersonalNumberSender(address) {
  const compact = String(address ?? "").replace(/[\s()-]/g, "");
  if (!/^\+?\d+$/.test(compact)) return false;
  return compact.replace(/\D/g, "").length >= 8;
}

export function receiptFingerprint(network, text) {
  return createHash("sha256").update(`${network}\n${normalizeReceiptText(text)}`).digest("hex");
}

const TRANSFER_SELECT = `
  SELECT t.id, t.network, t.received_number_id AS "receivingNumberId",
         t.amount_egp_minor::text AS "amountEgpMinor",
         t.raw_sender_name AS "senderName", t.raw_sender_phone AS "senderPhone",
         t.transaction_ref AS "transactionRef", t.status::text AS status,
         t.review_reason AS "reviewReason", t.matched_intent_id AS "intentId",
         i.status::text AS "intentStatus",
         i.credited_amount_usdt_minor::text AS "creditedAmountUsdtMinor",
         p.handle AS "playerHandle",
         t.client_idempotency_key AS "clientTransactionId", t.sms_sender AS "smsSender",
         t.observed_at AS "observedAt", t.reported_at AS "reportedAt"
    FROM local_transfer_observed t
    LEFT JOIN local_deposit_intent i ON i.id = t.matched_intent_id
    LEFT JOIN player p ON p.id = i.player_id`;

function shapeTransfer(row) {
  if (!row) return null;
  const { intentStatus, ...rest } = row;
  return { ...rest, credited: row.status === "MATCHED" && intentStatus === "CREDITED" };
}

async function findTransferById(db, id) {
  const r = await db.query(`${TRANSFER_SELECT} WHERE t.id = $1`, [id]);
  return shapeTransfer(r.rows[0]);
}

async function findDeviceTransferByKey(db, deviceId, key) {
  const r = await db.query(
    `${TRANSFER_SELECT} WHERE t.device_id = $1 AND t.client_idempotency_key = $2`,
    [deviceId, key]
  );
  return shapeTransfer(r.rows[0]);
}

async function findTransferByReceipt(db, network, fingerprint, ref) {
  const r = await db.query(
    `${TRANSFER_SELECT}
      WHERE t.network = $1 AND (t.message_fingerprint = $2 OR ($3::text IS NOT NULL AND t.transaction_ref = $3))
      ORDER BY t.reported_at ASC LIMIT 1`,
    [network, fingerprint, ref ?? null]
  );
  return shapeTransfer(r.rows[0]);
}

async function setReviewReason(db, transferId, reason) {
  await db.query(
    `UPDATE local_transfer_observed SET review_reason = $2 WHERE id = $1 AND status = 'UNMATCHED'`,
    [transferId, reason]
  );
}

/**
 * Credits the one PENDING intent this transfer pays for, or records why it
 * could not. Phone OR name, not phone alone: InstaPay receipts never carry a
 * sender phone. Amount + network + receiving number + expiry already narrow
 * this to a small set; requiring exactly one candidate is what keeps a
 * same-amount coincidence from ever being credited to the wrong player.
 */
async function tryAutoCredit(db, { transferId, net, possibleNumbers, primaryNumber, amount, observed, senderPhone, senderName }) {
  const phoneTail = String(senderPhone).replace(/\D/g, "").slice(-10);
  const intentRes = await db.query(
    `SELECT id, receiving_number_id FROM local_deposit_intent
      WHERE network = $1
        AND receiving_number_id = ANY($2::text[])
        AND declared_amount_egp_minor = $3
        AND status = 'PENDING'
        AND expires_at >= $4
        AND (
          ($5 <> '' AND right(regexp_replace(declared_sender_phone, '\\D', '', 'g'), 10) = $5)
          OR ($6 <> '' AND regexp_replace(lower(trim(declared_sender_name)), '\\s+', ' ', 'g')
                         = regexp_replace(lower(trim($6)), '\\s+', ' ', 'g'))
        )`,
    [net, possibleNumbers, amount.toString(), observed, phoneTail.length === 10 ? phoneTail : "", String(senderName)]
  );
  if (intentRes.rows.length === 0) return setReviewReason(db, transferId, "NO_MATCHING_INTENT");
  if (intentRes.rows.length > 1) return setReviewReason(db, transferId, "AMBIGUOUS_MATCH");

  const intent = intentRes.rows[0];
  if (intent.receiving_number_id !== primaryNumber) {
    await db.query(`UPDATE local_transfer_observed SET received_number_id = $1 WHERE id = $2`, [intent.receiving_number_id, transferId]);
  }
  try {
    const r = await db.query(
      `SELECT matched_transfer_id AS "matchedTransferId" FROM credit_local_deposit($1,$2)`,
      [intent.id, transferId]
    );
    // credit_local_deposit() returns an already-CREDITED intent unchanged:
    // another transfer won the race for it, and this one was not used.
    if (r.rows[0]?.matchedTransferId !== transferId) {
      return setReviewReason(db, transferId, "INTENT_ALREADY_CREDITED");
    }
  } catch (e) {
    if (/no EGP\/USD rate/.test(e.message)) return setReviewReason(db, transferId, "NO_RATE_SET");
    if (/cannot credit/.test(e.message)) return setReviewReason(db, transferId, "INTENT_ALREADY_CREDITED");
    throw e;
  }
}

const WITHDRAWAL_SELECT = `
  SELECT w.id, w.player_id AS "playerId", p.handle AS "playerHandle", w.asset, w.network, w.destination,
         w.amount_minor::text AS "amountMinor", w.fee_minor::text AS "feeMinor",
         w.status::text AS status, w.requested_at AS "requestedAt", w.completed_at AS "completedAt",
         w.tx_hash AS reference
    FROM withdrawal w JOIN player p ON p.id = w.player_id`;

// The operator's view of a payout's lifecycle. Everything before APPROVED is
// still the platform's decision, not something the operator can act on.
function receiverStatus(status) {
  if (status === "APPROVED") return "PENDING";
  if (status === "PROCESSING") return "PROCESSING";
  if (status === "COMPLETED") return "COMPLETED";
  if (["REJECTED", "FAILED", "CANCELLED"].includes(status)) return "REJECTED";
  return "AWAITING_APPROVAL";
}

function shapeWithdrawal(row, rate) {
  // USDT minor (6dp) -> EGP piastres (2dp) at usd_rate_x1e8 = USD per EGP x 1e8,
  // integer-only like credit_local_deposit().
  const egpMinor = rate ? (BigInt(row.amountMinor) * 10000n) / BigInt(rate.usdRateX1e8) : null;
  return {
    ...row,
    receiverStatus: receiverStatus(row.status),
    actionable: row.status === "APPROVED" || row.status === "PROCESSING",
    amountEgpMinor: egpMinor === null ? null : egpMinor.toString(),
    // What the operator actually sends: whole pounds, nearest, as the admin console does.
    amountEgpToSend: egpMinor === null ? null : ((egpMinor + 50n) / 100n).toString(),
  };
}

async function readEgpRate(db) {
  const r = await db.query(
    `SELECT usd_rate_x1e8::text AS "usdRateX1e8", status, effective_at AS "effectiveAt",
            source, created_by AS "createdBy", reason
       FROM valuation_current($1)`,
    ["EGP"]
  );
  // valuation_current() is a non-SETOF function: called in a FROM clause it
  // always yields exactly one row, even when its own body found nothing --
  // an all-NULL row, not zero rows. usdRateX1e8 is NOT NULL on the real
  // table, so NULL here is the only signal "no snapshot exists yet".
  if (!r.rows.length || r.rows[0].usdRateX1e8 == null) return null;
  const row = r.rows[0];
  return {
    usdRateX1e8: row.usdRateX1e8,
    egpPerUsd: Math.round((1e8 / Number(row.usdRateX1e8)) * 100) / 100,
    status: row.status,
    effectiveAt: row.effectiveAt,
    source: row.source,
    createdBy: row.createdBy,
    reason: row.reason,
  };
}
