/**
 * Deposits and withdrawals.
 *
 * The two rules everything here exists to enforce:
 *
 *   DEPOSIT  -- a webhook is a notification to go LOOK. Credit happens only
 *               after we independently confirm asset, network, amount,
 *               destination and confirmation depth against the chain.
 *
 *   WITHDRAW -- Available - amount -> Held the instant a request is made,
 *               every transition is legal-by-construction, the broadcast is
 *               idempotent, and nothing leaves without step-up, allowlisting,
 *               risk, a real financial permission, and (above a threshold --
 *               currently EVERY withdrawal) a second human. COMPLETED is
 *               never reached on a provider's word alone: only Nizalo's own
 *               chain observation may make that call, the outbound mirror of
 *               the deposit rule above.
 */
import { randomUUID } from "node:crypto";
import { ProviderPaymentState, ProviderPayoutState } from "./provider.mjs";
import { authorize, Decision } from "../../authz/src/policy.mjs";

export const DepositError = {
  CONTROL_DISABLED: "CONTROL_DISABLED",
  UNDERPAID: "UNDERPAID",
  WRONG_ASSET: "WRONG_ASSET",
  WRONG_NETWORK: "WRONG_NETWORK",
  DUST: "DUST",
  NOT_FINAL: "NOT_FINAL",
  ALREADY_CREDITED: "ALREADY_CREDITED",
  SCREENING_HIT: "SCREENING_HIT",
  TX_FAILED: "TX_FAILED",
  ORPHANED: "ORPHANED",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  // A real, verified on-chain output that a DIFFERENT deposit intent already
  // claimed first (deposit_one_credit_per_output's own UNIQUE constraint is
  // what actually decides "first" under concurrency). Distinct from
  // ORPHANED: an orphan means nothing else ever had a legitimate claim on
  // the transfer; this means something else's claim simply won the race.
  OUTPUT_ALREADY_CLAIMED: "OUTPUT_ALREADY_CLAIMED",
};

// A deposit in any of these statuses can never legitimately receive a
// credit again: CREDITED already did (checked separately, first, so its
// own ALREADY_CREDITED reason is more specific); the rest are terminal
// refusals. A verified, sufficiently-confirmed transfer that arrives for a
// deposit in NONE of these -- i.e. still genuinely open -- proceeds to
// screening and the ledger; one that arrives for a deposit that IS one of
// these becomes ORPHANED (see verifyAndCredit below): real money, on a
// dead intent, credited to nobody automatically.
const TERMINAL_NON_CREDIT_STATUSES = new Set([
  "CREDITED", "EXPIRED", "WRONG_ASSET", "WRONG_NETWORK", "QUARANTINED", "ORPHANED",
]);

export const WithdrawalError = {
  INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
  ADDRESS_NOT_ALLOWLISTED: "ADDRESS_NOT_ALLOWLISTED",
  ADDRESS_TIME_LOCKED: "ADDRESS_TIME_LOCKED",
  COOLING_OFF: "COOLING_OFF",
  CONTROL_DISABLED: "CONTROL_DISABLED",
  BELOW_MINIMUM: "BELOW_MINIMUM",
  ABOVE_MAXIMUM: "ABOVE_MAXIMUM",
  NOT_SOLVENT: "NOT_SOLVENT",
  NEEDS_APPROVAL: "NEEDS_APPROVAL",
  WRONG_STATE: "WRONG_STATE",
  NOT_ELIGIBLE: "NOT_ELIGIBLE",
  COMPLIANCE_BLOCKED: "COMPLIANCE_BLOCKED",
  DAILY_LIMIT_EXCEEDED: "DAILY_LIMIT_EXCEEDED",
  PLATFORM_LIMIT_EXCEEDED: "PLATFORM_LIMIT_EXCEEDED",
  UNKNOWN_ADMIN: "UNKNOWN_ADMIN",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  DIGEST_MISMATCH: "DIGEST_MISMATCH",
  NO_CHAIN_EVIDENCE: "NO_CHAIN_EVIDENCE",
};

// Statuses from which a withdrawal can still be rejected. Kept in sync with
// withdrawal_transition_allowed()'s own REJECTED edges (0007 + 0040) -- this
// is a service-level convenience for a clean WRONG_STATE reason, not the
// real enforcement, which is the trigger.
const REJECTABLE_STATUSES = new Set(["VALIDATING", "RISK_CHECK", "PENDING_REVIEW", "ON_HOLD", "APPROVED"]);

const DEFAULTS = {
  confirmationDepth: 20,          // TRON: ~20 blocks to finality
  dustThresholdMinor: 1_000_000n, // 1 USDT; below this, recovery costs more than the funds
  minWithdrawalMinor: 10_000_000n,  // $10
  // $2,000 -- the same ceiling the platform already uses as its maximum
  // competitive stake, reused here as the maximum per-withdrawal amount.
  maxWithdrawalMinor: 2_000_000_000n,
  // Default launch posture: 0n routes all withdrawals through review unless overridden
  // by service config (which sets reviewThresholdMinor: 500_000_000n for automated payouts <= $499).
  reviewThresholdMinor: 0n,
  addressTimeLockHours: 24,
  // Backstops, not the primary control -- the primary control at launch is
  // a human reviewing every withdrawal. Two maximal withdrawals a day is a
  // conversation, not a limit failure; beyond that, review is REQUIRED
  // rather than merely available.
  perUserDailyLimitMinor: 10_000_000_000n,   // $10,000 / 24h
  platformDailyLimitMinor: 50_000_000_000n,  // $50,000 / 24h, platform-wide
};

export function createPaymentService(db, {
  provider,
  chain,                          // independent chain reader; NOT the provider
  screening = async () => ({ ok: true }),
  risk = async () => ({ score: 0 }),
  // USER ELIGIBILITY: an optional hook, permissive by default, for whatever
  // account-standing signal exists (a fair-play restriction, a closed
  // account). No such restriction table exists in this codebase yet --
  // this is the seam it plugs into, exercised exactly like screening/risk.
  eligibility = async () => ({ ok: true }),
  // JURISDICTION / KYC: optional. When supplied, must expose
  // `can(playerId, product)` returning { verdict, reason } -- the exact
  // shape packages/compliance/src/compliance.mjs's own service returns.
  // Left unset, every existing caller keeps working exactly as before;
  // wiring the real service is a deployment decision, not a code change.
  compliance = null,
  now = () => Date.now(),
  config = {},
} = {}) {
  const cfg = { ...DEFAULTS, ...config };

  const controlOn = async (key) => {
    const r = await db.query("SELECT control_enabled($1) AS on", [key]);
    return r.rows[0].on === true;
  };

  /**
   * The payment_rail row for an asset/network pair, or null if none is
   * configured -- a rail-less asset/network pair (a test seeding an
   * uncommon combination, say) falls back to this service's own `cfg`
   * defaults everywhere below, exactly as it did before the rail model
   * existed. A configured rail's own bounds always take precedence.
   */
  const railOf = async (asset, network) => {
    const r = await db.query(
      `SELECT enabled, status, deposits_enabled, withdrawals_enabled,
              min_deposit_minor::text AS min_deposit_minor,
              max_deposit_minor::text AS max_deposit_minor,
              min_withdrawal_minor::text AS min_withdrawal_minor,
              max_withdrawal_minor::text AS max_withdrawal_minor,
              auto_approve_threshold_minor::text AS auto_approve_threshold_minor,
              confirmation_depth
         FROM payment_rail WHERE asset = $1 AND network = $2`,
      [asset, network]
    );
    return r.rows[0] ?? null;
  };

  const svc = {
    // =========================================================================
    // DEPOSITS
    // =========================================================================

    async createDeposit({ playerId, asset = "USDT", network = "TRON" }) {
      if (!(await controlOn("DEPOSITS"))) {
        return { ok: false, reason: DepositError.CONTROL_DISABLED };
      }
      // The per-rail switch, independent of the global DEPOSITS kill switch
      // above: an admin (or a depeg observation via record_valuation_snapshot())
      // can take THIS asset/network pair's deposits offline without touching
      // any other rail, or that same rail's withdrawals. A pair with no
      // configured rail at all falls through unblocked, same as before the
      // rail model existed.
      const rail = await railOf(asset, network);
      if (rail && !railOperationAllowed(rail, "deposits_enabled")) {
        return { ok: false, reason: DepositError.CONTROL_DISABLED };
      }

      // 1. Reuse existing permanent dedicated address if present and valid (not sandbox mock)
      const existing = await db.query(
        `SELECT id, address, asset, network, provider_ref, expires_at
           FROM deposit
          WHERE player_id = $1 AND asset = $2 AND network = $3
            AND status NOT IN ('EXPIRED', 'ORPHANED', 'QUARANTINED')
            AND address NOT LIKE 'Tsbx_%'
          ORDER BY created_at DESC LIMIT 1`,
        [playerId, asset, network]
      );
      if (existing.rows.length) {
        const row = existing.rows[0];
        return {
          ok: true,
          depositId: row.id,
          address: row.address,
          // Deliberately no QR URL: the client draws the code itself from
          // `address`, so no outside host ever sees a player's deposit
          // address or gets to decide what their scanner reads.
          qrCodeUrl: null,
          display: `${asset} — ${network} (${network === "TRON" ? "TRC20" : network})`,
          asset,
          network,
          isStatic: true,
          expiresAt: row.expires_at || new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000).toISOString(),
        };
      }

      const id = `dep_${randomUUID()}`;
      const intent = await provider.createDepositIntent({
        userId: playerId, asset, network, idempotencyKey: id,
      });
      const expiresAt = intent.expiresAt || (intent.isStatic ? new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000).toISOString() : null);
      await db.query(
        `INSERT INTO deposit (id, player_id, asset, network, provider, provider_ref,
                              address, status, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'AWAITING_PAYMENT', COALESCE($8::timestamptz, now() + interval '10 years'))`,
        [id, playerId, asset, network, provider.id, intent.providerRef, intent.address, expiresAt]
      );
      return {
        ok: true, depositId: id, address: intent.address,
        qrCodeUrl: null,
        display: `${asset} — ${network} (${network === "TRON" ? "TRC20" : network})`,
        asset, network,
        isStatic: Boolean(intent.isStatic),
        expiresAt,
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

      // Belt and braces beyond verifyAndCredit()'s own fix for F-6 (a
      // duplicate on-chain output no longer throws there at all): whatever
      // happens, this event's row always ends up with a recorded outcome,
      // never stuck at NULL/unprocessed forever because an unexpected
      // exception skipped the UPDATE below. A provider that retries a
      // webhook whose processing genuinely failed will hit the SAME
      // provider_event row (ON CONFLICT DO NOTHING above) and this time see
      // its recorded failure rather than triggering a second, redundant
      // verification attempt silently.
      let result;
      try {
        result = await svc.verifyAndCredit(ev.providerRef, {
          address: ev.address,
          txHash: ev.reportedTxHash,
        });
      } catch (e) {
        await db.query(
          `UPDATE provider_event SET processed_at = now(), outcome = $2
            WHERE provider = $1 AND provider_event_id = $3`,
          [provider.id, `ERROR:${String(e.message ?? e).slice(0, 200)}`, ev.providerEventId]
        );
        throw e;
      }
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
     * DEPOSIT INTENT -> blockchain observation -> transaction lookup ->
     * token validation -> recipient validation -> confirmation check
     * (all inside chain.verifyIncoming(), see packages/chain/src/
     * provider.mjs's own header for how each is independently re-derived
     * from the transaction's raw event log) -> amount validation ->
     * duplicate check (the ledger's own idempotency key plus
     * deposit_one_credit_per_output, both DB constraints) -> intent
     * association -> risk decision -> ledger.
     *
     * Everything is checked against the CHAIN, never against anything the
     * provider said. If the two disagree, the chain wins and the
     * provider's claim is a discrepancy for reconciliation to raise.
     *
     * A provider that could not be reached is NEVER treated as a
     * rejection: PROVIDER_UNAVAILABLE leaves the deposit's status
     * untouched (a network blip is not new information about the deposit
     * itself) and reports `retryable: true` so a caller polls again --
     * never FAILED, and definitely never CONFIRMED.
     */
    async verifyAndCredit(providerRef, opts = {}) {
      const lookupAddress = opts.address || null;
      const d = await db.query(
        `SELECT * FROM deposit
          WHERE provider = $1
            AND (provider_ref = $2 OR ($3::text IS NOT NULL AND address = $3))
          ORDER BY created_at DESC LIMIT 1`,
        [provider.id, providerRef, lookupAddress]
      );
      if (!d.rows.length) return { credited: false, reason: "UNKNOWN_DEPOSIT" };
      const dep = d.rows[0];
      if (dep.status === "CREDITED") return { credited: false, reason: DepositError.ALREADY_CREDITED };
      // A deposit already in a terminal, non-credit state must never be
      // REVIVED by a later verification pass (e.g. an EXPIRED intent
      // bounced back to AWAITING_PAYMENT just because nothing has been
      // seen on chain yet). Every status-mutating branch below is guarded
      // on this; only a VERIFIED transfer for an already-terminal deposit
      // does anything at all here, and what it does is become ORPHANED,
      // never a revival.
      const alreadyTerminal = TERMINAL_NON_CREDIT_STATUSES.has(dep.status);

      // The rail's own configured bounds take precedence over this
      // service's fallback defaults, so raising a rail's confirmation
      // requirement or minimum deposit takes effect without a deploy.
      const rail = await railOf(dep.asset, dep.network);
      const dustThreshold = rail ? BigInt(rail.min_deposit_minor) : cfg.dustThresholdMinor;
      const confirmationDepth = rail ? rail.confirmation_depth : cfg.confirmationDepth;

      let result;
      try {
        result = await chain.verifyIncoming({
          network: dep.network,
          address: dep.address,
          requiredConfirmations: confirmationDepth,
          txHash: opts.txHash || dep.observed_tx_hash || null,
        });
      } catch (e) {
        // A well-behaved reader resolves its own transient failures to
        // PROVIDER_UNAVAILABLE rather than throwing (see tron-rpc.mjs's
        // own retry-with-backoff); this catch is a second, defensive layer
        // for a reader that throws anyway, so a provider bug can never
        // masquerade as a hard rejection either.
        result = { outcome: "PROVIDER_UNAVAILABLE", error: e };
      }

      if (result.outcome === "PROVIDER_UNAVAILABLE") {
        await db.query(
          `UPDATE deposit
              SET verification_attempts = verification_attempts + 1,
                  last_verification_error = $2, last_verified_at = now()
            WHERE id = $1`,
          [dep.id, String(result.error?.message ?? "chain provider unavailable")]
        );
        return { credited: false, reason: DepositError.PROVIDER_UNAVAILABLE, retryable: true };
      }
      await db.query(`UPDATE deposit SET last_verified_at = now() WHERE id = $1`, [dep.id]);

      if (result.outcome === "NOT_FOUND") {
        if (!alreadyTerminal) await setDepositStatus(db, dep.id, "AWAITING_PAYMENT");
        return { credited: false, reason: "NOTHING_ON_CHAIN" };
      }
      if (result.outcome === "WRONG_NETWORK") {
        if (!alreadyTerminal) {
          await quarantine(db, dep.id, "WRONG_NETWORK", { asset: dep.asset, network: null, txHash: null, amountMinor: 0 });
        }
        return { credited: false, reason: DepositError.WRONG_NETWORK };
      }
      if (result.outcome === "NO_TRANSFER_EVENT") {
        // A transaction exists but never emitted OUR configured contract's
        // Transfer event -- it called some other method, or moved a
        // different token entirely. Whatever it was, it was not USDT.
        if (!alreadyTerminal) {
          await quarantine(db, dep.id, "WRONG_ASSET", { asset: null, network: dep.network, txHash: null, amountMinor: 0 });
        }
        return { credited: false, reason: DepositError.WRONG_ASSET };
      }
      if (result.outcome === "TX_FAILED") {
        // A reverted on-chain transaction moved no value. Not suspicious,
        // not creditable -- there is nothing here to attribute.
        return { credited: false, reason: DepositError.TX_FAILED };
      }
      if (result.outcome === "WRONG_RECIPIENT") {
        // Structurally rare: verifyIncoming() discovery is already scoped
        // to dep.address, so reaching this means the independent raw-log
        // decode disagreed with the indexer that found the candidate.
        // Treated exactly like any other destination mismatch.
        if (!alreadyTerminal) {
          await quarantine(db, dep.id, "WRONG_DESTINATION", { asset: dep.asset, network: dep.network, txHash: null, amountMinor: 0 });
        }
        return { credited: false, reason: "WRONG_DESTINATION" };
      }
      if (result.outcome === "NOT_CONFIRMED") {
        if (!alreadyTerminal) {
          await db.query(
            `UPDATE deposit
                SET status='CONFIRMING', confirmations=$2, observed_amount_minor=$3, observed_tx_hash=$4
              WHERE id=$1`,
            [dep.id, result.confirmations ?? 0, String(result.amountRaw ?? 0), result.txHash ?? null]
          );
        }
        return { credited: false, reason: DepositError.NOT_FINAL, confirmations: result.confirmations ?? 0 };
      }

      // result.outcome === "VERIFIED" from here on: an independently
      // re-derived, correctly-contracted, correctly-addressed, sufficiently
      // confirmed TRC20 transfer. Only amount, intent state, and risk remain.
      const amount = BigInt(result.amountRaw);

      // INTENT ASSOCIATION: real, verified money that arrived for an
      // intent no longer able to receive it (expired, cancelled, already
      // credited by a different tx) is never auto-credited and never
      // silently dropped -- it becomes ORPHANED for a human to reconcile.
      // Checked BEFORE the dust threshold: an orphan is still an orphan
      // regardless of size.
      if (alreadyTerminal) {
        await orphan(db, dep.id, result, amount);
        return { credited: false, reason: DepositError.ORPHANED, txHash: result.txHash };
      }

      if (amount < dustThreshold) {
        await quarantine(db, dep.id, "DUST", { asset: dep.asset, network: dep.network, txHash: result.txHash, amountMinor: amount });
        return { credited: false, reason: DepositError.DUST };
      }

      const screened = await screening({ network: dep.network, txHash: result.txHash, from: result.from });
      if (!screened.ok) {
        await quarantine(db, dep.id, `SCREENING:${screened.reason ?? "HIT"}`, { asset: dep.asset, network: dep.network, txHash: result.txHash, amountMinor: amount });
        return { credited: false, reason: DepositError.SCREENING_HIT };
      }

      try {
        return await db.transaction(async (tx) => {
          // Lock the row so two verifiers cannot both credit the same deposit.
          const locked = await tx.query("SELECT status FROM deposit WHERE id=$1 FOR UPDATE", [dep.id]);
          if (locked.rows[0].status === "CREDITED") {
            return { credited: false, reason: DepositError.ALREADY_CREDITED };
          }
          // Re-checked under the row lock: a concurrent expiry/cancel could
          // have landed between the check above and this transaction opening.
          if (TERMINAL_NON_CREDIT_STATUSES.has(locked.rows[0].status)) {
            await orphan(tx, dep.id, result, amount);
            return { credited: false, reason: DepositError.ORPHANED, txHash: result.txHash };
          }

          const posted = await tx.query(
            `SELECT * FROM ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb,$3,NULL,'deposit',$4)`,
            [
              // Keyed on the on-chain output, so the same output can never credit
              // twice even across providers or retries -- backed by the
              // ledger's own idempotency key AND deposit_one_credit_per_output
              // (a real UNIQUE constraint), not application logic alone.
              `deposit:${dep.network}:${result.txHash}:0`,
              JSON.stringify([
                { account: `platform:custody:${dep.asset}:${custodyNetwork(dep.network)}`, amount: amount.toString() },
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
            [dep.id, posted.rows[0].transaction_id, result.txHash, 0,
             amount.toString(), dep.asset, dep.network, result.confirmations]
          );

          return { credited: true, depositId: dep.id, amountMinor: amount.toString() };
        });
      } catch (e) {
        // F-6: a DIFFERENT deposit intent already credited this exact
        // on-chain output (deposit_one_credit_per_output, a real UNIQUE
        // constraint on observed_network/observed_tx_hash/observed_output_
        // index -- the database's own tie-breaker for "which intent got
        // there first" under concurrency, e.g. two intents sharing one
        // address). ledger_post() itself is harmless here -- its own
        // idempotency key collided too, so it replayed rather than
        // double-crediting -- but this deposit's own UPDATE lost the race
        // and the whole transaction rolled back.
        //
        // quarantine(), not orphan(): orphan() would try to stamp the SAME
        // (network, tx_hash, output_index) onto a second row and hit this
        // exact constraint again. quarantine() never writes
        // observed_output_index, so the deposit is still marked with what
        // it actually observed (network, tx_hash, amount) without
        // re-colliding -- real money, never silently dropped, never thrown
        // as an unhandled exception that would otherwise crash
        // ingestWebhook() and leave a provider webhook retrying forever.
        if (/deposit_one_credit_per_output/.test(e.message)) {
          await quarantine(db, dep.id, "OUTPUT_ALREADY_CLAIMED", {
            asset: dep.asset, network: dep.network, txHash: result.txHash, amountMinor: amount,
          });
          return { credited: false, reason: DepositError.OUTPUT_ALREADY_CLAIMED, txHash: result.txHash };
        }
        throw e;
      }
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
         ON CONFLICT (player_id, asset, network, address) DO NOTHING`,
        [id, playerId, asset, network, address, label ?? null, String(cfg.addressTimeLockHours)]
      );
      return { ok: true, addressId: id, usableInHours: cfg.addressTimeLockHours };
    },

    /**
     * Request a withdrawal.
     *
     * WALLET HOLD: Available - amount -> Held happens inside the same
     * transaction that creates the row, via a real ledger posting -- the
     * user cannot spend held funds because they are not IN "available"
     * anymore, not because of an application-level flag.
     *
     * VALIDATION, in order: control switches, step-up (pre-validated by the
     * caller, exactly like cooling-off), user eligibility, jurisdiction/KYC,
     * minimum, maximum, destination (asset+network+owner bound, allowlisted,
     * past its cooling period), then -- atomically, under a per-player
     * advisory lock so two concurrent requests cannot both fit under a
     * rolling-window cap that only one of them actually clears -- the daily
     * limits. Balance itself is enforced by the ledger posting below: it
     * simply refuses if the player cannot cover the amount.
     */
    async request({ playerId, asset = "USDT", network = "TRON", destination, amountMinor, authorised }) {
      const amount = BigInt(amountMinor);

      if (!(await controlOn("WITHDRAWALS"))) {
        return { ok: false, reason: WithdrawalError.CONTROL_DISABLED };
      }
      const rail = await railOf(asset, network);
      if (rail && !railOperationAllowed(rail, "withdrawals_enabled")) {
        return { ok: false, reason: WithdrawalError.CONTROL_DISABLED };
      }
      // Step-up and cooling-off are decided by the auth service and passed in;
      // this service does not re-implement them, it refuses without them.
      if (authorised !== true) return { ok: false, reason: "NOT_AUTHORISED" };

      const eligible = await eligibility({ playerId });
      if (!eligible.ok) {
        return { ok: false, reason: WithdrawalError.NOT_ELIGIBLE, detail: eligible.reason };
      }

      if (compliance) {
        const verdict = await compliance.can(playerId, "WITHDRAWAL");
        if (verdict.verdict !== "ALLOW") {
          return { ok: false, reason: WithdrawalError.COMPLIANCE_BLOCKED, detail: verdict.reason };
        }
      }

      const minAllowed = rail ? BigInt(rail.min_withdrawal_minor) : cfg.minWithdrawalMinor;
      const maxAllowed = rail?.max_withdrawal_minor != null ? BigInt(rail.max_withdrawal_minor) : cfg.maxWithdrawalMinor;
      if (amount < minAllowed) {
        return { ok: false, reason: WithdrawalError.BELOW_MINIMUM };
      }
      if (maxAllowed !== null && amount > maxAllowed) {
        return { ok: false, reason: WithdrawalError.ABOVE_MAXIMUM };
      }

      const usable = await db.query(
        "SELECT payout_address_usable($1,$2,$3,$4) AS ok", [playerId, asset, network, destination]
      );
      if (!usable.rows[0].ok) {
        const known = await db.query(
          `SELECT usable_from FROM payout_address
            WHERE player_id=$1 AND asset=$2 AND network=$3 AND address=$4 AND removed_at IS NULL`,
          [playerId, asset, network, destination]
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
        // G15: an advisory lock scoped to THIS player serialises every
        // withdrawal request they make -- never platform-wide, so two
        // DIFFERENT players' requests never contend. Two requests from the
        // SAME player racing each other now check the rolling-window totals
        // one at a time, so both can never fit under a cap only one of them
        // actually clears.
        await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`withdrawal:${playerId}`]);

        const usage = await tx.query(
          `SELECT
             COALESCE(SUM(amount_minor) FILTER (WHERE player_id = $1), 0)::text AS user_total,
             COALESCE(SUM(amount_minor), 0)::text AS platform_total
           FROM withdrawal
           WHERE requested_at >= now() - interval '24 hours'
             AND status NOT IN ('REJECTED','CANCELLED','FAILED')`,
          [playerId]
        );
        const userTotal = BigInt(usage.rows[0].user_total) + amount;
        const platformTotal = BigInt(usage.rows[0].platform_total) + amount;
        if (userTotal > cfg.perUserDailyLimitMinor) {
          return { ok: false, reason: WithdrawalError.DAILY_LIMIT_EXCEEDED };
        }
        if (platformTotal > cfg.platformDailyLimitMinor) {
          return { ok: false, reason: WithdrawalError.PLATFORM_LIMIT_EXCEEDED };
        }

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

    /** Score it and route: launch mode sends everything to a human -- see reviewThresholdMinor's own note. */
    async assess(withdrawalId) {
      const w = await getWithdrawal(db, withdrawalId);
      if (!w) return { ok: false, reason: "NOT_FOUND" };
      if (w.status !== "VALIDATING") return { ok: false, reason: WithdrawalError.WRONG_STATE };

      await advance(db, withdrawalId, "RISK_CHECK");
      const scored = await risk({
        playerId: w.player_id, amountMinor: w.amount_minor,
        destination: w.destination, network: w.network,
      });

      // The rail's own operator-set threshold wins when configured; the
      // service default (WITHDRAWAL_REVIEW_THRESHOLD_MINOR) is the fallback
      // for a rail that has never been tuned from the admin panel.
      const rail = await railOf(w.asset, w.network);
      const reviewAt = rail?.auto_approve_threshold_minor
        ? BigInt(rail.auto_approve_threshold_minor)
        : cfg.reviewThresholdMinor;

      const needsHuman =
        BigInt(w.amount_minor) >= reviewAt ||
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
     * An admin proposes releasing a PENDING_REVIEW withdrawal. This is step
     * one of the four-eyes ceremony: it freezes the exact payload (amount,
     * asset, network, destination) into the approval's own record via
     * withdrawal_payload_digest() (0040), so a SECOND admin's later decision
     * to approve cannot be redirected onto a withdrawal that changed in the
     * meantime. The second admin decides through the generic approval-
     * decision path (mirroring the tournament-settlement precedent in
     * server.mjs) -- this service does not re-implement that step.
     */
    async proposeApproval(withdrawalId, { requestedBy, reason }) {
      const w = await getWithdrawal(db, withdrawalId);
      if (!w) return { ok: false, reason: "NOT_FOUND" };
      if (w.status !== "PENDING_REVIEW") return { ok: false, reason: WithdrawalError.WRONG_STATE };

      const digest = await db.query("SELECT withdrawal_payload_digest($1) AS digest", [withdrawalId]);
      const approvalId = `apr_wd_${randomUUID()}`;
      await db.query(
        `INSERT INTO approval_request (id, action, subject_type, subject_id, payload, requested_by, reason)
         VALUES ($1,'admin.withdrawal.approve','withdrawal',$2,$3::jsonb,$4,$5)`,
        [approvalId, withdrawalId, JSON.stringify({ digest: digest.rows[0].digest }), requestedBy, reason]
      );
      return { ok: true, approvalRequestId: approvalId };
    },

    /**
     * The requester executes an already-decided approval. Four checks, all
     * of which must pass:
     *
     *   1. the approval_request exists and is APPROVED (a different admin
     *      decided it -- the database's approval_no_self_approval CHECK is
     *      what actually guarantees this, unconditionally);
     *   2. its stored payload digest still matches the withdrawal's CURRENT
     *      payload -- G9, closing the window between proposing and executing;
     *   3. the caller IS the original requester (nobody else may spend a
     *      second admin's decision on a withdrawal they did not raise);
     *   4. authorize() grants admin.withdrawal.approve to that admin right
     *      now -- capability, MFA, and (once the caller has actually
     *      completed it) step-up.
     */
    async approve(withdrawalId, { approvalRequestId, adminId, stepUpVerified = false }) {
      const w = await getWithdrawal(db, withdrawalId);
      if (!w) return { ok: false, reason: "NOT_FOUND" };
      if (w.status !== "PENDING_REVIEW") return { ok: false, reason: WithdrawalError.WRONG_STATE };

      const ap = await db.query(
        `SELECT status, requested_by, decided_by, payload FROM approval_request WHERE id=$1`,
        [approvalRequestId]
      );
      if (!ap.rows.length || ap.rows[0].status !== "APPROVED") {
        return { ok: false, reason: WithdrawalError.NEEDS_APPROVAL };
      }
      const approval = ap.rows[0];

      const digestRow = await db.query("SELECT withdrawal_payload_digest($1) AS digest", [withdrawalId]);
      if (!approval.payload || approval.payload.digest !== digestRow.rows[0].digest) {
        return { ok: false, reason: WithdrawalError.DIGEST_MISMATCH };
      }

      if (!adminId) return { ok: false, reason: WithdrawalError.UNKNOWN_ADMIN };
      if (adminId !== approval.requested_by) {
        return { ok: false, reason: WithdrawalError.PERMISSION_DENIED, detail: "only the original requester may execute an approved release" };
      }
      const actor = await loadAdminActor(db, adminId);
      if (!actor) return { ok: false, reason: WithdrawalError.UNKNOWN_ADMIN };
      const decision = authorize({
        actor: { ...actor, stepUpFor: stepUpVerified ? "admin.withdrawal.approve" : null },
        action: "admin.withdrawal.approve",
        approval: { approvedBy: approval.decided_by, action: "admin.withdrawal.approve" },
      });
      if (decision.decision !== Decision.ALLOW) {
        return { ok: false, reason: WithdrawalError.PERMISSION_DENIED, detail: decision.reason };
      }

      await db.query("UPDATE withdrawal SET approval_request_id=$2 WHERE id=$1",
        [withdrawalId, approvalRequestId]);
      return db.transaction(async (tx) => {
        await setActor(tx, { type: "ADMIN", id: adminId });
        await tx.query(`UPDATE withdrawal SET status='APPROVED'::withdrawal_status WHERE id=$1`, [withdrawalId]);
        return { ok: true, status: "APPROVED" };
      });
    },

    /** An admin defers a decision without making it. Reversible via resumeFromHold(). */
    async hold(withdrawalId, { adminId, reason, stepUpVerified = false } = {}) {
      const w = await getWithdrawal(db, withdrawalId);
      if (!w) return { ok: false, reason: "NOT_FOUND" };
      if (w.status !== "PENDING_REVIEW") return { ok: false, reason: WithdrawalError.WRONG_STATE };

      if (!adminId) return { ok: false, reason: WithdrawalError.UNKNOWN_ADMIN };
      const actor = await loadAdminActor(db, adminId);
      if (!actor) return { ok: false, reason: WithdrawalError.UNKNOWN_ADMIN };
      const decision = authorize({
        actor: { ...actor, stepUpFor: stepUpVerified ? "admin.withdrawal.review" : null },
        action: "admin.withdrawal.review",
      });
      if (decision.decision !== Decision.ALLOW) {
        return { ok: false, reason: WithdrawalError.PERMISSION_DENIED, detail: decision.reason };
      }

      return db.transaction(async (tx) => {
        await setActor(tx, { type: "ADMIN", id: adminId });
        await tx.query(
          `UPDATE withdrawal SET status='ON_HOLD'::withdrawal_status, hold_reason=$2 WHERE id=$1`,
          [withdrawalId, reason ?? null]
        );
        return { ok: true, status: "ON_HOLD" };
      });
    },

    /** Review resumes: ON_HOLD back to PENDING_REVIEW. */
    async resumeFromHold(withdrawalId, { adminId, stepUpVerified = false } = {}) {
      const w = await getWithdrawal(db, withdrawalId);
      if (!w) return { ok: false, reason: "NOT_FOUND" };
      if (w.status !== "ON_HOLD") return { ok: false, reason: WithdrawalError.WRONG_STATE };

      if (!adminId) return { ok: false, reason: WithdrawalError.UNKNOWN_ADMIN };
      const actor = await loadAdminActor(db, adminId);
      if (!actor) return { ok: false, reason: WithdrawalError.UNKNOWN_ADMIN };
      const decision = authorize({
        actor: { ...actor, stepUpFor: stepUpVerified ? "admin.withdrawal.review" : null },
        action: "admin.withdrawal.review",
      });
      if (decision.decision !== Decision.ALLOW) {
        return { ok: false, reason: WithdrawalError.PERMISSION_DENIED, detail: decision.reason };
      }

      return db.transaction(async (tx) => {
        await setActor(tx, { type: "ADMIN", id: adminId });
        await tx.query(
          `UPDATE withdrawal SET status='PENDING_REVIEW'::withdrawal_status, hold_reason=NULL WHERE id=$1`,
          [withdrawalId]
        );
        return { ok: true, status: "PENDING_REVIEW" };
      });
    },

    /**
     * Reject from any reviewable state, including ON_HOLD. Rejection
     * returns funds to AVAILABLE exactly once: the ledger's own idempotency
     * key on the release posting (`withdrawal:{id}:release`) makes a repeat
     * call a no-op even without the explicit alreadyDone short-circuit below,
     * which exists purely to avoid the pointless extra work, not for
     * correctness.
     */
    async reject(withdrawalId, reason, { adminId, stepUpVerified = false } = {}) {
      const w = await getWithdrawal(db, withdrawalId);
      if (!w) return { ok: false, reason: "NOT_FOUND" };
      if (w.status !== "REJECTED" && !REJECTABLE_STATUSES.has(w.status)) {
        return { ok: false, reason: WithdrawalError.WRONG_STATE };
      }

      if (!adminId) return { ok: false, reason: WithdrawalError.UNKNOWN_ADMIN };
      const actor = await loadAdminActor(db, adminId);
      if (!actor) return { ok: false, reason: WithdrawalError.UNKNOWN_ADMIN };
      const decision = authorize({
        actor: { ...actor, stepUpFor: stepUpVerified ? "admin.withdrawal.reject" : null },
        action: "admin.withdrawal.reject",
      });
      if (decision.decision !== Decision.ALLOW) {
        return { ok: false, reason: WithdrawalError.PERMISSION_DENIED, detail: decision.reason };
      }

      return db.transaction(async (tx) => {
        await setActor(tx, { type: "ADMIN", id: adminId });
        const locked = await tx.query("SELECT status, lock_tx_id FROM withdrawal WHERE id=$1 FOR UPDATE", [withdrawalId]);
        if (locked.rows[0].status === "REJECTED") {
          return { ok: true, status: "REJECTED", alreadyDone: true };
        }
        // Rejecting returns the money before the state moves, so a crash can
        // never leave a rejected withdrawal holding locked funds.
        if (locked.rows[0].lock_tx_id) await releaseLock(tx, w, "reject");
        await tx.query(
          `UPDATE withdrawal SET status='REJECTED'::withdrawal_status, failure_reason=$2 WHERE id=$1`,
          [withdrawalId, reason]
        );
        return { ok: true, status: "REJECTED" };
      });
    },

    /**
     * Send it, through the secure signing/custody boundary -- `provider`
     * here is exactly the same abstraction packages/chain's own reader uses
     * on the read side: a real credential never reaches this process, only
     * an injected interface (see apps/worker's own "Sandbox only" header for
     * why the constructed provider is never real in this codebase today).
     *
     * G16 / DUPLICATE BROADCAST: an attempt row is written, keyed on the
     * withdrawal's own idempotency key, BEFORE the provider is ever called.
     * A second call with the same key -- a genuine retry, a duplicate
     * request, or a resumed crash -- finds that row already exists and
     * reports its outcome instead of calling the provider again. Re-entrant
     * on PROCESSING as well as APPROVED, so a crash between "asked the
     * provider" and "recorded the answer" can be resumed by calling this
     * again rather than needing a separate recovery path.
     */
    async process(withdrawalId) {
      const w = await getWithdrawal(db, withdrawalId);
      if (!w) return { ok: false, reason: "NOT_FOUND" };
      if (!["APPROVED", "PROCESSING"].includes(w.status)) {
        return { ok: false, reason: WithdrawalError.WRONG_STATE };
      }

      const solvent = await db.query(
        "SELECT payout_would_keep_solvent($1,$2) AS ok", [w.asset, w.amount_minor]
      );
      if (!solvent.rows[0].ok) return { ok: false, reason: WithdrawalError.NOT_SOLVENT };

      const idempotencyKey = `withdrawal:${withdrawalId}`;

      const attempt = await db.query(
        `INSERT INTO withdrawal_broadcast_attempt (withdrawal_id, idempotency_key, provider)
         VALUES ($1,$2,$3)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id`,
        [withdrawalId, idempotencyKey, provider.id]
      );

      if (!attempt.rows.length) {
        // DUPLICATE BROADCAST REQUEST: an attempt already exists. The
        // provider is NEVER called a second time for the same key -- report
        // what the existing attempt resolved to instead.
        const existing = await db.query(
          `SELECT outcome, provider_ref, error_message FROM withdrawal_broadcast_attempt WHERE idempotency_key=$1`,
          [idempotencyKey]
        );
        const row = existing.rows[0];
        if (row.outcome === "PROVIDER_REF") {
          return { ok: true, status: "PROCESSING", providerRef: row.provider_ref, duplicate: true };
        }
        if (row.outcome === "ERROR") {
          return { ok: false, reason: "BROADCAST_FAILED", detail: row.error_message, retryable: true };
        }
        // responded_at IS NULL: another caller is actively handling this
        // exact attempt right now. Never race it.
        return { ok: true, status: w.status, inFlight: true };
      }

      await advance(db, withdrawalId, "PROCESSING");

      let payout;
      try {
        payout = await provider.createPayout({
          withdrawalId, asset: w.asset, network: w.network,
          destination: w.destination, amountMinor: w.amount_minor,
          idempotencyKey,
        });
      } catch (e) {
        // BROADCAST TIMEOUT / PROVIDER OUTAGE: PENDING/RETRYABLE, never
        // FAILED. The withdrawal itself stays PROCESSING -- nothing here
        // proves the payout did NOT reach the provider -- and the attempt
        // is closed as an error so a retry calls process() again (which
        // will see the resolved attempt and refuse to re-broadcast) rather
        // than looping on the same in-flight row forever.
        await db.query(
          `UPDATE withdrawal_broadcast_attempt SET responded_at=now(), outcome='ERROR', error_message=$2 WHERE idempotency_key=$1`,
          [idempotencyKey, String(e?.message ?? e)]
        );
        return { ok: false, reason: "BROADCAST_TIMEOUT", detail: e?.message, retryable: true };
      }

      await db.query(
        `UPDATE withdrawal_broadcast_attempt SET responded_at=now(), outcome='PROVIDER_REF', provider_ref=$2 WHERE idempotency_key=$1`,
        [idempotencyKey, payout.providerRef]
      );
      await db.query("UPDATE withdrawal SET provider=$2, provider_ref=$3 WHERE id=$1",
        [withdrawalId, provider.id, payout.providerRef]);
      return { ok: true, status: "PROCESSING", providerRef: payout.providerRef };
    },

    /**
     * Poll the provider and move the state forward. Never moves it
     * backwards, and -- the outbound mirror of the deposit rule -- NEVER
     * advances BROADCASTED to CONFIRMED on the provider's word. Only
     * Nizalo's own independent chain read (chain.verifyTransfer(), the
     * exact same BlockchainProvider primitive the deposit flow uses) may
     * make that call: same contract, same event log, same recipient/
     * confirmation checks, run against an outgoing payout instead of an
     * incoming deposit.
     */
    async reconcile(withdrawalId) {
      const w = await getWithdrawal(db, withdrawalId);
      if (!w || !w.provider_ref) return { ok: false, reason: "NOT_FOUND" };

      const state = await provider.getPayout(w.provider_ref);

      // A provider's own claim of failure is trusted ONLY while nothing has
      // been broadcast yet (no tx_hash recorded) -- exactly mirroring the
      // deposit rule's outbound half: "a webhook/provider answer is a
      // notification to go LOOK, never the reason we act." Once a tx_hash
      // exists, real money may already be in flight on-chain; releasing the
      // hold on the provider's word alone would let it be spent twice (once
      // on-chain, once back into the user's available balance). From here,
      // falling through to the chain-verification logic below is
      // deliberate: it independently re-derives the real outcome and only
      // its own TX_FAILED finding (an actual on-chain revert) may release
      // funds. Any other chain answer -- including one that disagrees with
      // the provider -- leaves the withdrawal untouched; the reconciliation
      // worker's runProviderWithdrawals() already opens a PROVIDER_MISMATCH
      // case whenever the provider says FAILED but our status does not
      // end up FAILED, so this is surfaced to a human, not silently dropped.
      if (state.state === ProviderPayoutState.FAILED && !w.tx_hash) {
        return db.transaction(async (tx) => {
          await setActor(tx, { type: "SYSTEM" });
          if (w.lock_tx_id) await releaseLock(tx, w, "payout failed");
          await tx.query(
            `UPDATE withdrawal SET status='FAILED'::withdrawal_status, failure_reason='provider reported failure'
              WHERE id=$1`, [withdrawalId]
          );
          return { ok: true, status: "FAILED" };
        });
      }

      if ((state.state === ProviderPayoutState.BROADCASTED || state.state === ProviderPayoutState.CONFIRMED)
          && w.status === "PROCESSING" && state.txHash) {
        await db.query("UPDATE withdrawal SET tx_hash=$2 WHERE id=$1", [withdrawalId, state.txHash]);
        await advance(db, withdrawalId, "BROADCASTED");
      }

      const cur = await getWithdrawal(db, withdrawalId);
      if (cur.status !== "BROADCASTED") {
        return { ok: true, status: cur.status, unchanged: true };
      }

      // A provider claiming CONFIRMED is a notification to go LOOK, never
      // the reason we mark a payout complete. Without an independent
      // verifier configured at all, stay put -- refusing to invent
      // confirmation is the correct behaviour, not a missing feature.
      if (typeof chain?.verifyTransfer !== "function") {
        return { ok: true, status: "BROADCASTED", unchanged: true, reason: "NO_CHAIN_VERIFIER" };
      }

      const rail = await railOf(w.asset, w.network);
      const requiredConfirmations = rail ? rail.confirmation_depth : cfg.confirmationDepth;

      let verified;
      try {
        verified = await chain.verifyTransfer({
          txHash: cur.tx_hash, expectedNetwork: w.network, expectedRecipient: w.destination, requiredConfirmations,
        });
      } catch (e) {
        return { ok: true, status: "BROADCASTED", unchanged: true, reason: "PROVIDER_UNAVAILABLE" };
      }

      if (verified.outcome === "PROVIDER_UNAVAILABLE") {
        // RPC OUTAGE: "could not ask" is not "not confirmed". Stay put,
        // retryable, never advance and never fail on an outage alone.
        return { ok: true, status: "BROADCASTED", unchanged: true, reason: "PROVIDER_UNAVAILABLE" };
      }
      if (verified.outcome === "TX_FAILED") {
        return db.transaction(async (tx) => {
          await setActor(tx, { type: "SYSTEM" });
          if (w.lock_tx_id) await releaseLock(tx, w, "broadcast transaction failed on-chain");
          await tx.query(
            `UPDATE withdrawal SET status='FAILED'::withdrawal_status, failure_reason='transaction failed on-chain' WHERE id=$1`,
            [withdrawalId]
          );
          return { ok: true, status: "FAILED" };
        });
      }
      if (verified.outcome !== "VERIFIED") {
        // NOT_CONFIRMED, WRONG_RECIPIENT, NO_TRANSFER_EVENT, ... -- not yet
        // safe to advance. Wait for the next poll; never assume.
        return { ok: true, status: "BROADCASTED", unchanged: true, reason: verified.outcome };
      }

      await db.query(
        `UPDATE withdrawal SET status='CONFIRMED'::withdrawal_status, confirmed_block_number=$2, confirmations=$3 WHERE id=$1`,
        [withdrawalId, verified.blockNumber, verified.confirmations]
      );

      return svc.complete(withdrawalId);
    },

    /**
     * Final: the locked funds leave custody and the user's liability is
     * gone. Only reachable from CONFIRMED, and CONFIRMED is only reachable
     * once reconcile() has recorded real chain evidence (G12) -- so this
     * can never mark a payout COMPLETED on anything but on-chain proof.
     * Idempotent: a second call after COMPLETED reports alreadyDone rather
     * than posting a second ledger transaction.
     */
    async complete(withdrawalId) {
      return db.transaction(async (tx) => {
        await setActor(tx, { type: "SYSTEM" });
        const r = await tx.query("SELECT * FROM withdrawal WHERE id=$1 FOR UPDATE", [withdrawalId]);
        const w = r.rows[0];
        if (!w) return { ok: false, reason: "NOT_FOUND" };
        if (w.status === "COMPLETED") return { ok: true, status: "COMPLETED", alreadyDone: true };
        if (w.status !== "CONFIRMED") return { ok: false, reason: WithdrawalError.WRONG_STATE };
        if (w.confirmed_block_number == null || w.confirmations == null) {
          // G12, re-checked here too (belt and braces on top of the CHECK
          // constraint): never complete without the evidence reconcile()
          // itself is the only path that writes.
          return { ok: false, reason: WithdrawalError.NO_CHAIN_EVIDENCE };
        }

        const amount = BigInt(w.amount_minor);
        const fee = BigInt(w.fee_minor ?? 0);
        const custodyAccount = `platform:custody:${w.asset}:${custodyNetwork(w.network)}`;
        const legs = [
          { account: `user:${w.player_id}:locked`, amount: amount.toString() },
          { account: custodyAccount, amount: (-amount).toString() },
        ];
        // G13: a declared network fee is posted as its own leg, in the SAME
        // transaction, to the platform's existing fees account -- never
        // silently unaccounted for, and never invented when fee_minor is
        // its default zero (every existing withdrawal, unchanged).
        if (fee > 0n) {
          legs.push(
            { account: custodyAccount, amount: (-fee).toString() },
            { account: `platform:fees:network`, amount: fee.toString() }
          );
        }

        const posted = await tx.query(
          `SELECT * FROM ledger_post($1,'WITHDRAWAL','SYSTEM',NULL,$2::jsonb,$3,NULL,'withdrawal',$4)`,
          [`withdrawal:${withdrawalId}:debit`, JSON.stringify(legs), w.asset, withdrawalId]
        );

        await tx.query(
          `UPDATE withdrawal SET status='COMPLETED'::withdrawal_status,
                  settle_tx_id=$2, fee_tx_id=$3, completed_at=now() WHERE id=$1`,
          [withdrawalId, posted.rows[0].transaction_id, fee > 0n ? posted.rows[0].transaction_id : null]
        );
        return { ok: true, status: "COMPLETED", transactionId: posted.rows[0].transaction_id };
      });
    },

    async history(withdrawalId) {
      const r = await db.query(
        `SELECT from_status, to_status, actor_type, actor_id, at FROM withdrawal_transition
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
            fee_minor::text AS fee_minor, status, lock_tx_id, provider_ref, tx_hash,
            confirmed_block_number, confirmations
       FROM withdrawal WHERE id=$1`, [id]
  );
  return r.rows[0] ?? null;
}

const advance = (db, id, to) =>
  db.query(`UPDATE withdrawal SET status=$2::withdrawal_status WHERE id=$1`, [id, to]);

/**
 * Stamps the transaction-local actor settings withdrawal_guard() (0040)
 * reads to name the REAL admin (or SYSTEM) behind a status transition,
 * instead of the hardcoded 'SYSTEM' every transition used to record
 * regardless of who actually caused it. `set_config(..., true)` scopes the
 * setting to the current transaction only -- it never leaks to the next one
 * on a pooled connection.
 */
export async function setActor(tx, { type, id = null }) {
  await tx.query(
    `SELECT set_config('nizalo.actor_type', $1, true), set_config('nizalo.actor_id', $2, true)`,
    [type, id ?? ""]
  );
}

/** The admin_user + admin_roles() shape authorize() expects, loaded fresh every call -- never cached. */
async function loadAdminActor(db, adminId) {
  const r = await db.query(
    `SELECT u.id, u.mfa_enrolled, u.disabled_at, admin_roles(u.id) AS roles FROM admin_user u WHERE u.id = $1`,
    [adminId]
  );
  if (!r.rows.length) return null;
  const a = r.rows[0];
  return {
    type: "ADMIN", id: a.id, roles: a.roles ?? [],
    mfaEnrolled: a.mfa_enrolled === true, disabled: a.disabled_at != null,
  };
}

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

/**
 * A genuinely valid, chain-verified, sufficiently-confirmed transfer that
 * arrived for a deposit intent no longer able to receive it. Unlike
 * quarantine() -- which flags something SUSPICIOUS about the transfer
 * itself -- an orphan is real money with nowhere safe to auto-attribute
 * it; it is recorded in full (deposit_orphaned_was_observed requires
 * observed_tx_hash) for a human to reconcile, never silently dropped and
 * never auto-credited onto a dead intent.
 */
async function orphan(db, id, result, amount) {
  await db.query(
    `UPDATE deposit
        SET status='ORPHANED'::deposit_status,
            observed_tx_hash=$2, observed_output_index=0, observed_amount_minor=$3,
            observed_asset='USDT', observed_network=$4, confirmations=$5
      WHERE id=$1`,
    [id, result.txHash, amount.toString(), result.network, result.confirmations ?? 0]
  );
}

/**
 * Mirrors rail_enabled_for() (0038_payment_rail.sql, updated by
 * 0042_rail_emergency_hold_enforcement.sql) exactly -- kept as one small
 * pure function, called from both createDeposit() and request(), so the
 * "which rail states block which operation" decision exists in exactly one
 * place in this file rather than being restated (and able to drift, as it
 * briefly did during development) at each call site.
 *
 * RISK_PAUSED is deliberately NOT a blanket stop: record_valuation_snapshot()
 * already set deposits_enabled/withdrawals_enabled to precisely what a
 * depeg should block, so gating on status here too would silently override
 * that per-operation, per-rail configuration. ADMIN_PAUSED, EMERGENCY_HOLD,
 * and RETIRED ARE full stops regardless of the individual flags -- an
 * incident response or a decommission means both operations, unconditionally.
 */
function railOperationAllowed(rail, flagField) {
  return rail.enabled
    && rail.status !== "ADMIN_PAUSED" && rail.status !== "RETIRED" && rail.status !== "EMERGENCY_HOLD"
    && rail[flagField] === true;
}

/** TRON base58 addresses start with T and are 34 characters. */
export const isValidTronAddress = (a) =>
  typeof a === "string" && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);

/**
 * The platform's ONE seeded custody account (0002_ledger_roles_and_platform_
 * accounts.sql) is `platform:custody:USDT:TRON` -- deliberately singular,
 * per PAYMENT_ARCHITECTURE.md's "exactly one network at launch". Deposit and
 * withdrawal rows, by contrast, store the OxaPay/UI-facing network label
 * ("TRC20"), because that is the vocabulary the provider and the wallet
 * network tabs speak. Without this mapping, every deposit or withdrawal on
 * TRC20 would try to post against a `platform:custody:USDT:TRC20` account
 * that was never created, and ledger_post() would reject it outright
 * ("no such ledger account") -- silently breaking every real deposit and
 * withdrawal, not a cosmetic mismatch.
 *
 * BEP20 and ERC20 are exposed as network tabs in the wallet UI today but
 * have no seeded custody account either (and, per the same doc, adding a
 * network is meant to be a deliberate, threat-modelled decision, not a UI
 * default) -- this function makes that gap explicit rather than silently
 * routing their funds into the TRON custody account.
 */
export function custodyNetwork(network) {
  if (network === "TRC20" || network === "TRON") return "TRON";
  return network;
}

export { ProviderPaymentState, ProviderPayoutState };
