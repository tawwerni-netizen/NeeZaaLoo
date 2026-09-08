/**
 * Deposits and withdrawals.
 *
 * The two rules everything here exists to enforce:
 *
 *   DEPOSIT  -- a webhook is a notification to go LOOK. Credit happens only
 *               after we independently confirm asset, network, amount,
 *               destination and confirmation depth against the chain.
 *
 *   WITHDRAW -- money locks at request time, every transition is legal-by-
 *               construction, the broadcast is idempotent, and nothing leaves
 *               without step-up, allowlisting, risk, and (above a threshold) a
 *               second human.
 */
import { randomUUID } from "node:crypto";
import { ProviderPaymentState, ProviderPayoutState } from "./provider.mjs";

export const DepositError = {
  CONTROL_DISABLED: "CONTROL_DISABLED",
  UNDERPAID: "UNDERPAID",
  WRONG_ASSET: "WRONG_ASSET",
  WRONG_NETWORK: "WRONG_NETWORK",
  DUST: "DUST",
  NOT_FINAL: "NOT_FINAL",
  ALREADY_CREDITED: "ALREADY_CREDITED",
  SCREENING_HIT: "SCREENING_HIT",
};

export const WithdrawalError = {
  INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
  ADDRESS_NOT_ALLOWLISTED: "ADDRESS_NOT_ALLOWLISTED",
  ADDRESS_TIME_LOCKED: "ADDRESS_TIME_LOCKED",
  COOLING_OFF: "COOLING_OFF",
  CONTROL_DISABLED: "CONTROL_DISABLED",
  BELOW_MINIMUM: "BELOW_MINIMUM",
  NOT_SOLVENT: "NOT_SOLVENT",
  NEEDS_APPROVAL: "NEEDS_APPROVAL",
  WRONG_STATE: "WRONG_STATE",
};

const DEFAULTS = {
  confirmationDepth: 20,          // TRON: ~20 blocks to finality
  dustThresholdMinor: 1_000_000n, // 1 USDT; below this, recovery costs more than the funds
  minWithdrawalMinor: 5_000_000n, // 5 USDT
  reviewThresholdMinor: 500_000_000n, // 500 USDT -> a second human decides
  addressTimeLockHours: 24,
};

export function createPaymentService(db, {
  provider,
  chain,                          // independent chain reader; NOT the provider
  screening = async () => ({ ok: true }),
  risk = async () => ({ score: 0 }),
  now = () => Date.now(),
  config = {},
} = {}) {
  const cfg = { ...DEFAULTS, ...config };

  const controlOn = async (key) => {
    const r = await db.query("SELECT control_enabled($1) AS on", [key]);
    return r.rows[0].on === true;
  };

  const svc = {
    // =========================================================================
    // DEPOSITS
    // =========================================================================

    async createDeposit({ playerId, asset = "USDT", network = "TRON" }) {
      if (!(await controlOn("DEPOSITS"))) {
        return { ok: false, reason: DepositError.CONTROL_DISABLED };
      }
      const id = `dep_${randomUUID()}`;
      const intent = await provider.createDepositIntent({
        userId: playerId, asset, network, idempotencyKey: id,
      });
      await db.query(
        `INSERT INTO deposit (id, player_id, asset, network, provider, provider_ref,
                              address, status, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'AWAITING_PAYMENT', now() + interval '24 hours')`,
        [id, playerId, asset, network, provider.id, intent.providerRef, intent.address]
      );
      return {
        ok: true, depositId: id, address: intent.address,
        // Asset and network always travel together, everywhere, per the brand
        // rule -- never a bare "USDT".
        display: `${asset} — ${network} (${network === "TRON" ? "TRC20" : network})`,
        asset, network,
      };
    },

    /**
     * Record a provider webhook. Deliberately does NOT credit anything.
     *
     * It stores the raw claim, deduplicates it, and schedules verification.
     * A forged or replayed webhook can at worst cause us to go and look at a
     * chain that will not confirm it.
     */
    async ingestWebhook(rawBody, headers) {
      const verified = provider.verifyWebhook(rawBody, headers);
      if (!verified.ok) {
        // Recorded, so a burst of bad signatures is visible, but nothing else
        // happens and no work is done.
        await db.query(
          `INSERT INTO provider_event (provider, provider_event_id, signature_ok, payload, outcome)
           VALUES ($1,$2,FALSE,$3::jsonb,'REJECTED_SIGNATURE')
           ON CONFLICT (provider, provider_event_id) DO NOTHING`,
          [provider.id, `bad:${randomUUID()}`, JSON.stringify({ reason: verified.error })]
        );
        return { ok: false, reason: verified.error };
      }

      const ev = verified.event;
      const inserted = await db.query(
        `INSERT INTO provider_event (provider, provider_event_id, event_type, signature_ok, payload)
         VALUES ($1,$2,$3,TRUE,$4::jsonb)
         ON CONFLICT (provider, provider_event_id) DO NOTHING
         RETURNING id`,
        [provider.id, ev.providerEventId, ev.type, JSON.stringify(ev.raw)]
      );

      if (!inserted.rows.length) {
        // Replay. By construction a no-op: the original outcome stands.
        return { ok: true, replayed: true, credited: false };
      }

      const result = await svc.verifyAndCredit(ev.providerRef);
      await db.query(
        `UPDATE provider_event SET processed_at = now(), outcome = $2
          WHERE provider = $1 AND provider_event_id = $3`,
        [provider.id, result.reason ?? (result.credited ? "CREDITED" : "PENDING"), ev.providerEventId]
      );
      return { ok: true, replayed: false, ...result };
    },

    /**
     * The only path to a credit.
     *
     * Everything below is checked against the CHAIN, not against anything the
     * provider said. If the two disagree, the chain wins and the provider's
     * claim is a discrepancy for reconciliation to raise.
     */
    async verifyAndCredit(providerRef) {
      const d = await db.query(
        `SELECT * FROM deposit WHERE provider = $1 AND provider_ref = $2`,
        [provider.id, providerRef]
      );
      if (!d.rows.length) return { credited: false, reason: "UNKNOWN_DEPOSIT" };
      const dep = d.rows[0];
      if (dep.status === "CREDITED") return { credited: false, reason: DepositError.ALREADY_CREDITED };

      const observed = await chain.getIncoming({ network: dep.network, address: dep.address });
      if (!observed) {
        await setDepositStatus(db, dep.id, "AWAITING_PAYMENT");
        return { credited: false, reason: "NOTHING_ON_CHAIN" };
      }

      // Asset and network are checked before anything else. A wrong-network
      // send is a support case with a documented recovery path, never a credit.
      if (observed.asset !== dep.asset) {
        await quarantine(db, dep.id, "WRONG_ASSET", observed);
        return { credited: false, reason: DepositError.WRONG_ASSET };
      }
      if (observed.network !== dep.network) {
        await quarantine(db, dep.id, "WRONG_NETWORK", observed);
        return { credited: false, reason: DepositError.WRONG_NETWORK };
      }
      if (observed.address !== dep.address) {
        await quarantine(db, dep.id, "WRONG_DESTINATION", observed);
        return { credited: false, reason: "WRONG_DESTINATION" };
      }

      const amount = BigInt(observed.amountMinor);
      if (amount < cfg.dustThresholdMinor) {
        await quarantine(db, dep.id, "DUST", observed);
        return { credited: false, reason: DepositError.DUST };
      }

      if (observed.confirmations < cfg.confirmationDepth) {
        await db.query(
          `UPDATE deposit SET status='CONFIRMING', confirmations=$2,
                  observed_amount_minor=$3 WHERE id=$1`,
          [dep.id, observed.confirmations, amount.toString()]
        );
        return { credited: false, reason: DepositError.NOT_FINAL, confirmations: observed.confirmations };
      }

      const screened = await screening({ network: dep.network, txHash: observed.txHash, from: observed.from });
      if (!screened.ok) {
        await quarantine(db, dep.id, `SCREENING:${screened.reason ?? "HIT"}`, observed);
        return { credited: false, reason: DepositError.SCREENING_HIT };
      }

      return db.transaction(async (tx) => {
        // Lock the row so two verifiers cannot both credit the same deposit.
        const locked = await tx.query("SELECT status FROM deposit WHERE id=$1 FOR UPDATE", [dep.id]);
        if (locked.rows[0].status === "CREDITED") {
          return { credited: false, reason: DepositError.ALREADY_CREDITED };
        }

        const posted = await tx.query(
          `SELECT * FROM ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb,$3,NULL,'deposit',$4)`,
          [
            // Keyed on the on-chain output, so the same output can never credit
            // twice even across providers or retries.
            `deposit:${dep.network}:${observed.txHash}:${observed.outputIndex ?? 0}`,
            JSON.stringify([
              { account: `platform:custody:${dep.asset}:${dep.network}`, amount: amount.toString() },
              { account: `user:${dep.player_id}:available`, amount: (-amount).toString() },
            ]),
            dep.asset, dep.id,
          ]
        );

        await tx.query(
          `UPDATE deposit
              SET status='CREDITED', credited_tx_id=$2, credited_at=now(),
                  observed_tx_hash=$3, observed_output_index=$4, observed_amount_minor=$5,
                  observed_asset=$6, observed_network=$7, confirmations=$8
            WHERE id=$1`,
          [dep.id, posted.rows[0].transaction_id, observed.txHash, observed.outputIndex ?? 0,
           amount.toString(), observed.asset, observed.network, observed.confirmations]
        );

        return { credited: true, depositId: dep.id, amountMinor: amount.toString() };
      });
    },

    // =========================================================================
    // WITHDRAWALS
    // =========================================================================

    /** Add a payout address. Time-locked, so it cannot be used immediately. */
    async addPayoutAddress({ playerId, asset = "USDT", network = "TRON", address, label }) {
      if (!isValidTronAddress(address) && network === "TRON") {
        return { ok: false, reason: "INVALID_ADDRESS" };
      }
      const id = `addr_${randomUUID()}`;
      await db.query(
        `INSERT INTO payout_address (id, player_id, asset, network, address, label, usable_from)
         VALUES ($1,$2,$3,$4,$5,$6, now() + ($7 || ' hours')::interval)
         ON CONFLICT (player_id, network, address) DO NOTHING`,
        [id, playerId, asset, network, address, label ?? null, String(cfg.addressTimeLockHours)]
      );
      return { ok: true, addressId: id, usableInHours: cfg.addressTimeLockHours };
    },

    /**
     * Request a withdrawal. Funds LOCK here, before any review, so the same
     * balance cannot fund a duel or a second withdrawal while this is pending.
     */
    async request({ playerId, asset = "USDT", network = "TRON", destination, amountMinor, authorised }) {
      const amount = BigInt(amountMinor);

      if (!(await controlOn("WITHDRAWALS"))) {
        return { ok: false, reason: WithdrawalError.CONTROL_DISABLED };
      }
      // Step-up and cooling-off are decided by the auth service and passed in;
      // this service does not re-implement them, it refuses without them.
      if (authorised !== true) return { ok: false, reason: "NOT_AUTHORISED" };
      if (amount < cfg.minWithdrawalMinor) {
        return { ok: false, reason: WithdrawalError.BELOW_MINIMUM };
      }

      const usable = await db.query(
        "SELECT payout_address_usable($1,$2,$3) AS ok", [playerId, network, destination]
      );
      if (!usable.rows[0].ok) {
        const known = await db.query(
          `SELECT usable_from FROM payout_address
            WHERE player_id=$1 AND network=$2 AND address=$3 AND removed_at IS NULL`,
          [playerId, network, destination]
        );
        return {
          ok: false,
          reason: known.rows.length
            ? WithdrawalError.ADDRESS_TIME_LOCKED
            : WithdrawalError.ADDRESS_NOT_ALLOWLISTED,
        };
      }

      const id = `wd_${randomUUID()}`;
      return db.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO withdrawal (id, player_id, asset, network, destination, amount_minor)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [id, playerId, asset, network, destination, amount.toString()]
        );

        // The ledger refuses if the player cannot cover it, which is also the
        // structural answer to two simultaneous withdrawal requests: the second
        // cannot lock funds the first already holds.
        let posted;
        try {
          posted = await tx.query(
            `SELECT * FROM ledger_post($1,'WITHDRAWAL_LOCK','SYSTEM',NULL,$2::jsonb,$3,NULL,'withdrawal',$4)`,
            [`withdrawal:${id}:lock`, JSON.stringify([
              { account: `user:${playerId}:available`, amount: amount.toString() },
              { account: `user:${playerId}:locked`, amount: (-amount).toString() },
            ]), asset, id]
          );
        } catch (e) {
          if (/insufficient funds/.test(e.message)) {
            throw Object.assign(new Error(WithdrawalError.INSUFFICIENT_FUNDS), { expected: true });
          }
          throw e;
        }

        await tx.query(
          `UPDATE withdrawal SET lock_tx_id=$2, status='VALIDATING'::withdrawal_status WHERE id=$1`,
          [id, posted.rows[0].transaction_id]
        );
        return { ok: true, withdrawalId: id, status: "VALIDATING" };
      });
    },

    /** Score it and route: auto-approve small and clean, escalate everything else. */
    async assess(withdrawalId) {
      const w = await getWithdrawal(db, withdrawalId);
      if (!w) return { ok: false, reason: "NOT_FOUND" };
      if (w.status !== "VALIDATING") return { ok: false, reason: WithdrawalError.WRONG_STATE };

      await advance(db, withdrawalId, "RISK_CHECK");
      const scored = await risk({
        playerId: w.player_id, amountMinor: w.amount_minor,
        destination: w.destination, network: w.network,
      });

      const needsHuman =
        BigInt(w.amount_minor) >= cfg.reviewThresholdMinor ||
        scored.score >= 50 ||
        scored.forceReview === true;

      await db.query("UPDATE withdrawal SET risk_score=$2 WHERE id=$1", [withdrawalId, scored.score]);

      if (needsHuman) {
        await advance(db, withdrawalId, "PENDING_REVIEW");
        return { ok: true, status: "PENDING_REVIEW", riskScore: scored.score };
      }
      await advance(db, withdrawalId, "APPROVED");
      return { ok: true, status: "APPROVED", riskScore: scored.score };
    },

    /**
     * A human approves. The approval must already exist, and its requester and
     * decider must differ -- the database refuses anything else.
     */
    async approve(withdrawalId, { approvalRequestId }) {
      const w = await getWithdrawal(db, withdrawalId);
      if (!w) return { ok: false, reason: "NOT_FOUND" };
      if (w.status !== "PENDING_REVIEW") return { ok: false, reason: WithdrawalError.WRONG_STATE };

      const ap = await db.query(
        `SELECT status, requested_by, decided_by FROM approval_request WHERE id=$1`,
        [approvalRequestId]
      );
      if (!ap.rows.length || ap.rows[0].status !== "APPROVED") {
        return { ok: false, reason: WithdrawalError.NEEDS_APPROVAL };
      }

      await db.query("UPDATE withdrawal SET approval_request_id=$2 WHERE id=$1",
        [withdrawalId, approvalRequestId]);
      await advance(db, withdrawalId, "APPROVED");
      return { ok: true, status: "APPROVED" };
    },

    async reject(withdrawalId, reason) {
      const w = await getWithdrawal(db, withdrawalId);
      if (!w) return { ok: false, reason: "NOT_FOUND" };
      return db.transaction(async (tx) => {
        // Rejecting returns the money before the state moves, so a crash can
        // never leave a rejected withdrawal holding locked funds.
        if (w.lock_tx_id) await releaseLock(tx, w, "reject");
        await tx.query(
          `UPDATE withdrawal SET status='REJECTED'::withdrawal_status, failure_reason=$2 WHERE id=$1`,
          [withdrawalId, reason]
        );
        return { ok: true, status: "REJECTED" };
      });
    },

    /**
     * Send it. Idempotent on the withdrawal id: a retry after an ambiguous
     * provider response returns the ORIGINAL payout rather than sending twice.
     */
    async process(withdrawalId) {
      const w = await getWithdrawal(db, withdrawalId);
      if (!w) return { ok: false, reason: "NOT_FOUND" };
      if (w.status !== "APPROVED") return { ok: false, reason: WithdrawalError.WRONG_STATE };

      const solvent = await db.query(
        "SELECT payout_would_keep_solvent($1,$2) AS ok", [w.asset, w.amount_minor]
      );
      if (!solvent.rows[0].ok) return { ok: false, reason: WithdrawalError.NOT_SOLVENT };

      await advance(db, withdrawalId, "PROCESSING");

      const payout = await provider.createPayout({
        withdrawalId, asset: w.asset, network: w.network,
        destination: w.destination, amountMinor: w.amount_minor,
        idempotencyKey: `withdrawal:${withdrawalId}`,
      });

      await db.query("UPDATE withdrawal SET provider=$2, provider_ref=$3 WHERE id=$1",
        [withdrawalId, provider.id, payout.providerRef]);
      return { ok: true, status: "PROCESSING", providerRef: payout.providerRef };
    },

    /** Poll the provider and move the state forward. Never moves it backwards. */
    async reconcile(withdrawalId) {
      const w = await getWithdrawal(db, withdrawalId);
      if (!w || !w.provider_ref) return { ok: false, reason: "NOT_FOUND" };

      const state = await provider.getPayout(w.provider_ref);

      if (state.state === ProviderPayoutState.FAILED) {
        return db.transaction(async (tx) => {
          if (w.lock_tx_id) await releaseLock(tx, w, "payout failed");
          await tx.query(
            `UPDATE withdrawal SET status='FAILED'::withdrawal_status, failure_reason='provider reported failure'
              WHERE id=$1`, [withdrawalId]
          );
          return { ok: true, status: "FAILED" };
        });
      }

      if (state.state === ProviderPayoutState.BROADCASTED && w.status === "PROCESSING") {
        await db.query("UPDATE withdrawal SET tx_hash=$2 WHERE id=$1", [withdrawalId, state.txHash]);
        await advance(db, withdrawalId, "BROADCASTED");
        return { ok: true, status: "BROADCASTED", txHash: state.txHash };
      }

      if (state.state === ProviderPayoutState.CONFIRMED) {
        if (w.status === "PROCESSING") {
          await db.query("UPDATE withdrawal SET tx_hash=$2 WHERE id=$1", [withdrawalId, state.txHash]);
          await advance(db, withdrawalId, "BROADCASTED");
        }
        const cur = await getWithdrawal(db, withdrawalId);
        if (cur.status === "BROADCASTED") await advance(db, withdrawalId, "CONFIRMED");
        return svc.complete(withdrawalId);
      }

      return { ok: true, status: w.status, unchanged: true };
    },

    /** Final: the locked funds leave custody and the user's liability is gone. */
    async complete(withdrawalId) {
      return db.transaction(async (tx) => {
        const r = await tx.query("SELECT * FROM withdrawal WHERE id=$1 FOR UPDATE", [withdrawalId]);
        const w = r.rows[0];
        if (!w) return { ok: false, reason: "NOT_FOUND" };
        if (w.status === "COMPLETED") return { ok: true, status: "COMPLETED", alreadyDone: true };
        if (w.status !== "CONFIRMED") return { ok: false, reason: WithdrawalError.WRONG_STATE };

        const amount = BigInt(w.amount_minor);
        const posted = await tx.query(
          `SELECT * FROM ledger_post($1,'WITHDRAWAL','SYSTEM',NULL,$2::jsonb,$3,NULL,'withdrawal',$4)`,
          [`withdrawal:${withdrawalId}:debit`, JSON.stringify([
            { account: `user:${w.player_id}:locked`, amount: amount.toString() },
            { account: `platform:custody:${w.asset}:${w.network}`, amount: (-amount).toString() },
          ]), w.asset, withdrawalId]
        );

        await tx.query(
          `UPDATE withdrawal SET status='COMPLETED'::withdrawal_status,
                  settle_tx_id=$2, completed_at=now() WHERE id=$1`,
          [withdrawalId, posted.rows[0].transaction_id]
        );
        return { ok: true, status: "COMPLETED", transactionId: posted.rows[0].transaction_id };
      });
    },

    async history(withdrawalId) {
      const r = await db.query(
        `SELECT from_status, to_status, actor_type, at FROM withdrawal_transition
          WHERE withdrawal_id=$1 ORDER BY id`, [withdrawalId]
      );
      return r.rows;
    },
  };

  return svc;
}

// --- internals ---------------------------------------------------------------

async function getWithdrawal(db, id) {
  const r = await db.query(
    `SELECT id, player_id, asset, network, destination, amount_minor::text AS amount_minor,
            status, lock_tx_id, provider_ref, tx_hash
       FROM withdrawal WHERE id=$1`, [id]
  );
  return r.rows[0] ?? null;
}

const advance = (db, id, to) =>
  db.query(`UPDATE withdrawal SET status=$2::withdrawal_status WHERE id=$1`, [id, to]);

async function releaseLock(tx, w, why) {
  const amount = BigInt(w.amount_minor);
  await tx.query(
    `SELECT ledger_post($1,'WITHDRAWAL_RELEASE','SYSTEM',NULL,$2::jsonb,$3,$4,'withdrawal',$5)`,
    [`withdrawal:${w.id}:release`, JSON.stringify([
      { account: `user:${w.player_id}:locked`, amount: amount.toString() },
      { account: `user:${w.player_id}:available`, amount: (-amount).toString() },
    ]), w.asset, why, w.id]
  );
}

const setDepositStatus = (db, id, status) =>
  db.query(`UPDATE deposit SET status=$2::deposit_status WHERE id=$1`, [id, status]);

async function quarantine(db, id, reason, observed) {
  await db.query(
    `UPDATE deposit
        SET status='QUARANTINED'::deposit_status, quarantine_reason=$2,
            observed_amount_minor=$3, observed_asset=$4, observed_network=$5,
            observed_tx_hash=$6
      WHERE id=$1`,
    [id, reason, String(observed.amountMinor ?? 0), observed.asset ?? null,
     observed.network ?? null, observed.txHash ?? null]
  );
}

/** TRON base58 addresses start with T and are 34 characters. */
export const isValidTronAddress = (a) =>
  typeof a === "string" && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);

export { ProviderPaymentState, ProviderPayoutState };
