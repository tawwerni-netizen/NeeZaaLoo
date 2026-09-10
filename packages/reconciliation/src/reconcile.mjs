/**
 * The reconciliation job runner (section 19 of the ledger spec, section 7 of
 * the payment architecture doc).
 *
 * Three levels, plus a global solvency check, all following the SAME rule:
 * a discrepancy produces an ALERT and a CASE, and is reviewed by a human --
 * NEVER an automatic repair of any balance, ledger entry, deposit, or
 * withdrawal. The one deliberate exception, spelled out by name in both
 * source documents, is the global solvency check: if custody ever falls
 * below what is owed, withdrawals halt automatically, because that is a
 * safety brake, not a correction of financial history.
 *
 *   L1 LEDGER_DRIFT   -- does the cached balance snapshot still agree with
 *                        the entries that produced it?
 *   L2 PROVIDER       -- do our deposit/withdrawal records agree with what
 *                        the payment provider says happened? (L3, chain
 *                        custody vs. actual on-chain balance, needs a
 *                        capability this codebase does not have yet --
 *                        the BlockchainProvider (packages/chain/src/
 *                        provider.mjs) verifies one transaction, or one
 *                        address's incoming transfers, not an aggregate
 *                        custody balance across every address we control --
 *                        and is deliberately NOT implemented here rather
 *                        than faked.)
 *   SOLVENCY          -- custody >= liabilities, per asset, always.
 *   STUCK STATES      -- anything sitting in a transient deposit/withdrawal
 *                        status past its SLA.
 *   SETTLEMENT SLA    -- a duel COMPLETED but never SETTLED past its SLA.
 *   PRIZE SLA         -- a tournament COMPLETED with no prize settlement
 *                        past its SLA.
 *
 * Every run is idempotent and safe under concurrent execution two ways at
 * once, NEITHER of which is a transaction held open for the run's whole
 * duration:
 *
 *   - `reconciliation_run_one_running_per_kind` (a partial unique index) is
 *     the ENTIRE concurrency guard for "don't run the same check twice at
 *     once": starting a run is one INSERT that either succeeds or finds the
 *     index already satisfied. A run's own work (below) calls OTHER
 *     services -- `paymentSvc.verifyAndCredit()`, `paymentSvc.reconcile()`
 *     -- that open THEIR OWN transactions; holding this run's bookkeeping
 *     inside one continuous transaction while calling out to code that also
 *     opens transactions is exactly the tx-calls-public-service
 *     self-deadlock pattern this whole codebase has been audited against
 *     elsewhere, so this file deliberately never does it. (An earlier
 *     version of this file used a held transaction with a transaction-scoped
 *     advisory lock and hung immediately the first time a provider-mismatch
 *     path called `verifyAndCredit()` -- exactly this bug, caught by its own
 *     test rather than in production.)
 *   - `reconciliation_case_open_dedup` (a second partial unique index) makes
 *     opening a case for an already-flagged subject a structural no-op, so
 *     even a genuinely concurrent double-run of two DIFFERENT check
 *     invocations that happen to find the same discrepancy cannot produce
 *     two cases for it.
 */
import { randomUUID } from "node:crypto";
import { ProviderPaymentState, ProviderPayoutState } from "../../payments/src/provider.mjs";
import { createDuelStore } from "../../realtime/src/store.mjs";
import { serializeReplay, verifyReplay } from "../../duel-engine/src/duel.mjs";

export const RunOutcome = {
  COMPLETED: "COMPLETED",
  SKIPPED_ALREADY_RUNNING: "SKIPPED_ALREADY_RUNNING",
  FAILED: "FAILED",
};

/**
 * Run one reconciliation check. `fn(db, tally)` runs with the PLAIN db
 * handle -- never a held transaction -- so it, and anything it calls, is
 * free to open its own transactions without risking a self-deadlock.
 */
async function withRun(db, kind, fn, { emit }) {
  const started = await db.query(
    `INSERT INTO reconciliation_run (kind) VALUES ($1::reconciliation_run_kind)
     ON CONFLICT (kind) WHERE status = 'RUNNING' DO NOTHING
     RETURNING id`,
    [kind]
  );
  if (!started.rows.length) {
    return { outcome: RunOutcome.SKIPPED_ALREADY_RUNNING, kind };
  }
  const runId = started.rows[0].id;
  emit("reconciliation.run_started", { kind, runId });

  const tally = { checked: 0, mismatches: 0, casesOpened: 0 };
  try {
    await fn(db, tally);
    await db.query(
      `UPDATE reconciliation_run
          SET status='COMPLETED'::reconciliation_run_status, completed_at=now(),
              records_checked=$2, mismatches_found=$3, cases_opened=$4
        WHERE id=$1`,
      [runId, tally.checked, tally.mismatches, tally.casesOpened]
    );
    emit("reconciliation.run_completed", { kind, runId, ...tally });
    return { outcome: RunOutcome.COMPLETED, kind, runId, ...tally };
  } catch (err) {
    await db.query(
      `UPDATE reconciliation_run
          SET status='FAILED'::reconciliation_run_status, completed_at=now(), error=$2,
              records_checked=$3, mismatches_found=$4, cases_opened=$5
        WHERE id=$1`,
      [runId, err.message, tally.checked, tally.mismatches, tally.casesOpened]
    ).catch(() => {}); // observability must never mask the original error
    throw err;
  }
}

/**
 * Open a case for one discrepancy, unless one is already open for the exact
 * same (category, subject) pair -- the dedup index makes this a no-op, not
 * an error, so a caller never needs to check first. The insert-plus-event
 * pair is its own short transaction (never spanning any external call), so
 * it is atomic without holding anything open across the check's real work.
 */
async function openCase(db, tally, emit, { category, severity, subjectType, subjectId, detail }) {
  const id = `rcase_${randomUUID()}`;
  tally.mismatches += 1;

  const result = await db.transaction(async (tx) => {
    const inserted = await tx.query(
      `INSERT INTO reconciliation_case (id, category, severity, subject_type, subject_id, detail)
       VALUES ($1,$2::reconciliation_case_category,$3::reconciliation_severity,$4,$5,$6::jsonb)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [id, category, severity, subjectType, subjectId, JSON.stringify(detail)]
    );
    if (!inserted.rows.length) return { opened: false, alreadyOpen: true };

    await tx.query(
      `INSERT INTO reconciliation_case_event (case_id, event, actor_type, detail)
       VALUES ($1,'OPENED','SYSTEM',$2::jsonb)`,
      [id, JSON.stringify(detail)]
    );
    return { opened: true, caseId: id };
  });

  if (result.opened) {
    tally.casesOpened += 1;
    emit("reconciliation.case_opened", { caseId: id, category, severity, subjectType, subjectId });
  }
  return result;
}

export function createReconciliationService(db, {
  paymentSvc = null,
  // The same provider instance the caller already constructed `paymentSvc`
  // with. `paymentSvc` does not expose it (it is an internal dependency of
  // that service, not part of its public surface), so it is passed here
  // separately rather than reaching into `paymentSvc`'s closure.
  provider = null,
  // The game plugin registry (id -> plugin), the same Map every process
  // that touches duels already builds -- required for runReplayVerification()
  // to rebuild a duel's real event history and re-derive its result. Optional,
  // like paymentSvc/provider above: a caller that omits it (a test, a
  // narrowly-scoped tool) simply does not get that check registered in
  // runAll(), exactly the existing pattern for the provider-reconciliation
  // checks.
  plugins = null,
  emit = () => {},
  now = () => Date.now(),
} = {}) {
  const duelStore = plugins ? createDuelStore(db, { emit }) : null;
  const svc = {
    /** L1: does the cached balance snapshot still agree with the ledger entries? */
    async runLedgerDrift() {
      return withRun(db, "L1_LEDGER_DRIFT", async (conn, tally) => {
        const drifted = await conn.query(
          `SELECT account_id, key, asset, snapshot_balance, derived_balance, drift
             FROM ledger_balance_verification WHERE drift <> 0`
        );
        tally.checked += drifted.rows.length;
        for (const row of drifted.rows) {
          await openCase(conn, tally, emit, {
            category: "LEDGER_DRIFT", severity: "CRITICAL",
            subjectType: "ledger_account", subjectId: String(row.account_id),
            detail: {
              key: row.key, asset: row.asset,
              snapshotBalance: row.snapshot_balance, derivedBalance: row.derived_balance,
              drift: row.drift,
            },
          });
        }
      }, { emit });
    },

    /**
     * The single most important number in the company: does custody cover
     * liabilities, per asset? A breach halts withdrawals immediately -- a
     * brake, never a balance correction -- and always opens a CRITICAL case
     * regardless of whether the halt itself succeeds.
     */
    async runSolvency() {
      return withRun(db, "SOLVENCY", async (conn, tally) => {
        const rows = await conn.query(
          `SELECT asset, custody_held::text AS custody_held, user_liabilities::text AS user_liabilities
             FROM ledger_solvency`
        );
        tally.checked += rows.rows.length;
        for (const row of rows.rows) {
          const custody = BigInt(row.custody_held);
          const liabilities = BigInt(row.user_liabilities);
          if (custody >= liabilities) continue;

          const shortfall = (liabilities - custody).toString();
          const { caseId } = await openCase(conn, tally, emit, {
            category: "SOLVENCY_BREACH", severity: "CRITICAL",
            subjectType: "platform", subjectId: row.asset,
            detail: { asset: row.asset, custodyHeld: row.custody_held, userLiabilities: row.user_liabilities, shortfall },
          });

          const current = await conn.query(`SELECT enabled FROM platform_control WHERE key='WITHDRAWALS'`);
          if (current.rows.length && current.rows[0].enabled) {
            await conn.query(
              `UPDATE platform_control
                  SET enabled=FALSE, changed_by='system-automation',
                      reason=$1
                WHERE key='WITHDRAWALS'`,
              [`AUTOMATIC HALT: solvency breach for ${row.asset}, shortfall ${shortfall} minor units, at ${new Date(now()).toISOString()} (${caseId ?? "case already open"})`]
            );
            emit("admin.emergency_control_toggled", {
              key: "WITHDRAWALS", enabled: false, actor: "system-automation", reason: "SOLVENCY_BREACH", asset: row.asset,
            });
          }
        }
      }, { emit });
    },

    /** Anything sitting in a non-terminal deposit status past its SLA. */
    async runStuckDeposits({ slaMinutes = 60, limit = 500 } = {}) {
      return withRun(db, "STUCK_DEPOSITS", async (conn, tally) => {
        const stuck = await conn.query(
          `SELECT id, status, created_at FROM deposit
            WHERE status NOT IN ('CREDITED','EXPIRED')
              AND created_at < now() - ($1 || ' minutes')::interval
            ORDER BY created_at LIMIT $2`,
          [String(slaMinutes), limit]
        );
        tally.checked += stuck.rows.length;
        for (const row of stuck.rows) {
          await openCase(conn, tally, emit, {
            category: "STUCK_DEPOSIT", severity: "WARNING",
            subjectType: "deposit", subjectId: row.id,
            detail: { status: row.status, createdAt: row.created_at, slaMinutes },
          });
        }
      }, { emit });
    },

    /** Anything sitting in a non-terminal withdrawal status past its SLA. */
    async runStuckWithdrawals({ slaMinutes = 60, limit = 500 } = {}) {
      return withRun(db, "STUCK_WITHDRAWALS", async (conn, tally) => {
        const stuck = await conn.query(
          `SELECT id, status, requested_at FROM withdrawal
            WHERE status IN ('REQUESTED','VALIDATING','RISK_CHECK','PENDING_REVIEW','APPROVED','PROCESSING','BROADCASTED')
              AND requested_at < now() - ($1 || ' minutes')::interval
            ORDER BY requested_at LIMIT $2`,
          [String(slaMinutes), limit]
        );
        tally.checked += stuck.rows.length;
        for (const row of stuck.rows) {
          await openCase(conn, tally, emit, {
            category: "STUCK_WITHDRAWAL", severity: "WARNING",
            subjectType: "withdrawal", subjectId: row.id,
            detail: { status: row.status, requestedAt: row.requested_at, slaMinutes },
          });
        }
      }, { emit });
    },

    /**
     * Our deposit records vs. the provider's own opinion. When the provider
     * believes a payment finished, the only safe response is to ask the
     * EXISTING, chain-verifying credit path to re-check -- never to credit
     * from the provider's word directly. If that still does not credit, the
     * disagreement is real and becomes a case.
     */
    async runProviderDeposits({ limit = 200 } = {}) {
      if (!paymentSvc || !provider) throw new Error("runProviderDeposits requires paymentSvc and provider");
      return withRun(db, "PROVIDER_DEPOSITS", async (conn, tally) => {
        const pending = await conn.query(
          `SELECT id, provider_ref, status FROM deposit
            WHERE status NOT IN ('CREDITED','EXPIRED') AND provider_ref IS NOT NULL
            ORDER BY created_at LIMIT $1`,
          [limit]
        );
        tally.checked += pending.rows.length;
        for (const dep of pending.rows) {
          let providerState;
          try {
            providerState = await provider.getPayment(dep.provider_ref);
          } catch {
            continue; // provider outage: try again next run, not a mismatch
          }

          if (providerState.state === ProviderPaymentState.CONFIRMED) {
            const result = await paymentSvc.verifyAndCredit(dep.provider_ref);
            if (!result.credited) {
              await openCase(conn, tally, emit, {
                category: "PROVIDER_MISMATCH", severity: "WARNING",
                subjectType: "deposit", subjectId: dep.id,
                detail: { providerState: providerState.state, ourStatus: dep.status, verifyReason: result.reason },
              });
            }
          } else if (
            (providerState.state === ProviderPaymentState.FAILED || providerState.state === ProviderPaymentState.EXPIRED)
            && dep.status !== "QUARANTINED"
          ) {
            await openCase(conn, tally, emit, {
              category: "PROVIDER_MISMATCH", severity: "INFO",
              subjectType: "deposit", subjectId: dep.id,
              detail: { providerState: providerState.state, ourStatus: dep.status },
            });
          }
        }
      }, { emit });
    },

    /**
     * Our withdrawal records vs. the provider's own opinion. `reconcile()`
     * (payments.mjs) already knows how to move a withdrawal's state forward
     * from what the provider reports, never backwards -- reuse it rather
     * than duplicating that state machine here.
     */
    async runProviderWithdrawals({ limit = 200 } = {}) {
      if (!paymentSvc || !provider) throw new Error("runProviderWithdrawals requires paymentSvc and provider");
      return withRun(db, "PROVIDER_WITHDRAWALS", async (conn, tally) => {
        const pending = await conn.query(
          `SELECT id, provider_ref, status FROM withdrawal
            WHERE status IN ('PROCESSING','BROADCASTED','CONFIRMED') AND provider_ref IS NOT NULL
            ORDER BY requested_at LIMIT $1`,
          [limit]
        );
        tally.checked += pending.rows.length;
        for (const wd of pending.rows) {
          let providerState;
          try {
            providerState = await provider.getPayout(wd.provider_ref);
          } catch {
            continue;
          }

          await paymentSvc.reconcile(wd.id);

          if (providerState.state === ProviderPayoutState.FAILED && wd.status !== "FAILED") {
            const after = await conn.query(`SELECT status FROM withdrawal WHERE id=$1`, [wd.id]);
            if (after.rows[0]?.status !== "FAILED") {
              await openCase(conn, tally, emit, {
                category: "PROVIDER_MISMATCH", severity: "WARNING",
                subjectType: "withdrawal", subjectId: wd.id,
                detail: { providerState: providerState.state, ourStatusBefore: wd.status, ourStatusAfter: after.rows[0]?.status },
              });
            }
          }

          // UNKNOWN means the provider (or this process's own in-memory
          // double) no longer recognises a reference this platform is
          // still actively tracking -- e.g. a restart that lost payout
          // state. reconcile() itself already refuses to act on this (see
          // its own header), but a human should still see it: an unknown
          // payout reference is exactly the situation a lost-state bug
          // looks like before it becomes an unrecoverable one.
          if (providerState.state === ProviderPayoutState.UNKNOWN) {
            await openCase(conn, tally, emit, {
              category: "PROVIDER_MISMATCH", severity: "WARNING",
              subjectType: "withdrawal", subjectId: wd.id,
              detail: { providerState: providerState.state, ourStatus: wd.status, note: "provider does not recognise this payout reference" },
            });
          }
        }
      }, { emit });
    },

    /**
     * F-11: independently re-derive a settled CASH duel's result from its
     * own real move history and check it against what was actually paid.
     * `settlementLegs()` (packages/settlement/src/rake.mjs) pays whoever
     * `duel.result` names, and `duel.result` comes entirely from a game
     * plugin's own evaluate() -- a plugin bug, or a compromised plugin
     * release, decides real-money payouts with nothing independently
     * checking its answer. This is that check: the exact recovery path a
     * gateway restart already uses (`duelStore.load()`) plus the exact
     * audit primitive already built for disputes (`verifyReplay()`),
     * neither duplicated, run over every recently-settled cash duel.
     *
     * A mismatch never reverses or re-settles anything by itself -- same
     * rule as every other check in this file -- it opens a CRITICAL case
     * naming exactly what the replay derived versus what was paid, for a
     * human (with adjustment.create + four-eyes) to decide the correction.
     */
    async runReplayVerification({ limit = 200, sinceMinutes = 24 * 60 } = {}) {
      if (!plugins) throw new Error("runReplayVerification requires plugins");
      return withRun(db, "REPLAY_VERIFICATION", async (conn, tally) => {
        const rows = await conn.query(
          `SELECT id FROM duel
            WHERE tier = 'CASH' AND is_vs_computer = FALSE
              AND status IN ('COMPLETED','SETTLED')
              AND completed_at >= now() - ($1 || ' minutes')::interval
            ORDER BY completed_at DESC LIMIT $2`,
          [String(sinceMinutes), limit]
        );
        tally.checked += rows.rows.length;
        for (const row of rows.rows) {
          let replay, plugin;
          try {
            const duel = await duelStore.load(row.id, plugins, now());
            if (!duel) continue;
            plugin = plugins.get(duel.gameId);
            if (!plugin) continue;
            replay = serializeReplay(duel, plugin);
          } catch (e) {
            // A hydrate failure here (a stored event the current plugin
            // version can no longer replay, e.g.) is itself worth a human's
            // attention -- surfaced as its own case, never a silent skip.
            await openCase(conn, tally, emit, {
              category: "REPLAY_MISMATCH", severity: "CRITICAL",
              subjectType: "duel", subjectId: row.id,
              detail: { error: String(e.message ?? e), stage: "REHYDRATE" },
            });
            continue;
          }
          if (replay.outcome == null) continue; // not yet a decided result to check

          const verified = verifyReplay(replay, plugin);
          if (!verified.valid) {
            await openCase(conn, tally, emit, {
              category: "REPLAY_MISMATCH", severity: "CRITICAL",
              subjectType: "duel", subjectId: row.id,
              detail: {
                claimedResult: replay.outcome.result, claimedReason: replay.outcome.reason,
                error: verified.error,
              },
            });
          }
        }
      }, { emit });
    },

    /**
     * Live evidence retention (the approved anti-cheat architecture): once
     * a duel is over, its detailed per-action log (`duel_event`) has no
     * further business reason to exist -- realtime, reconnect and
     * spectating all needed it only while the match was live, and it is
     * NOT the permanent record (the `duel` row itself, `rating_change`,
     * and every settlement/ledger entry are -- none of them are touched
     * here, and none of them depend on `duel_event` surviving).
     *
     * Two tiers, exactly as specified: a FREE duel loses its log after a
     * short grace window; a CASH duel keeps it for the SAME 24 hours
     * `runReplayVerification()` above sweeps by default, so that check
     * always gets its full window before the evidence it reads can be
     * purged out from under it -- if this ran the other way around, a
     * cash duel could be purged clean before verification ever looked at
     * it, and the check would go on reporting success over an empty set.
     *
     * A duel is exempt from purge entirely -- FREE or CASH, regardless of
     * age -- if it carries any real fair-play evidence: an active funds
     * hold, or a recorded `fairplay_signal`. That signal can only have
     * been produced at or before completion (nothing in this codebase
     * generates one afterwards), so "flagged before completion" holds
     * without any extra bookkeeping. Nothing exposes a duel's raw event
     * log to anyone outside this internal sweep and the Fair Play
     * Engine's own case review, so "restricted access" for that retained
     * evidence already holds by construction, without a second copy of it
     * in a separate table.
     *
     * Idempotent and safe to retry: the `EXISTS (... duel_event ...)`
     * guard means a duel already purged simply matches nothing on the
     * next run, rather than erroring or re-counting.
     */
    async runEvidenceCleanup({ freeGraceMinutes = 10, cashRetentionMinutes = 24 * 60, limit = 500 } = {}) {
      return withRun(db, "EVIDENCE_CLEANUP", async (conn, tally) => {
        const due = await conn.query(
          `SELECT d.id FROM duel d
             WHERE d.status IN ('COMPLETED','SETTLED')
               AND (
                 (d.tier = 'FREE' AND d.completed_at < now() - ($1 || ' minutes')::interval)
                 OR
                 (d.tier = 'CASH' AND d.completed_at < now() - ($2 || ' minutes')::interval)
               )
               AND d.fairplay_hold = FALSE
               AND NOT EXISTS (SELECT 1 FROM fairplay_signal s WHERE s.duel_id = d.id)
               AND EXISTS (SELECT 1 FROM duel_event e WHERE e.duel_id = d.id)
             ORDER BY d.completed_at LIMIT $3`,
          [String(freeGraceMinutes), String(cashRetentionMinutes), limit]
        );
        tally.checked += due.rows.length;
        for (const row of due.rows) {
          await conn.query(`DELETE FROM duel_event WHERE duel_id = $1`, [row.id]);
          emit("evidence.cleanup_purged", { duelId: row.id });
        }
      }, { emit });
    },

    /** A duel the rules say is over, but that was never SETTLED, past its SLA. */
    async runSettlementSla({ slaMinutes = 30, limit = 500 } = {}) {
      return withRun(db, "SETTLEMENT_SLA", async (conn, tally) => {
        const stuck = await conn.query(
          `SELECT id, completed_at, fairplay_hold FROM duel
            WHERE status = 'COMPLETED' AND completed_at < now() - ($1 || ' minutes')::interval
            ORDER BY completed_at LIMIT $2`,
          [String(slaMinutes), limit]
        );
        tally.checked += stuck.rows.length;
        for (const row of stuck.rows) {
          await openCase(conn, tally, emit, {
            category: "SETTLEMENT_SLA_BREACH", severity: row.fairplay_hold ? "INFO" : "WARNING",
            subjectType: "duel", subjectId: row.id,
            detail: { completedAt: row.completed_at, fairplayHold: row.fairplay_hold, slaMinutes },
          });
        }
      }, { emit });
    },

    /** A tournament the rules say is over, with no prize settlement recorded, past its SLA. */
    async runPrizeSla({ slaMinutes = 60, limit = 500 } = {}) {
      return withRun(db, "PRIZE_SLA", async (conn, tally) => {
        const stuck = await conn.query(
          `SELECT t.id, t.completed_at FROM tournament t
            WHERE t.status = 'COMPLETED'
              AND t.completed_at < now() - ($1 || ' minutes')::interval
              AND NOT EXISTS (SELECT 1 FROM tournament_settlement s WHERE s.tournament_id = t.id)
            ORDER BY t.completed_at LIMIT $2`,
          [String(slaMinutes), limit]
        );
        tally.checked += stuck.rows.length;
        for (const row of stuck.rows) {
          await openCase(conn, tally, emit, {
            category: "PRIZE_SLA_BREACH", severity: "WARNING",
            subjectType: "tournament", subjectId: row.id,
            detail: { completedAt: row.completed_at, slaMinutes },
          });
        }
      }, { emit });
    },

    /** Run every check once. A single failing check does not stop the others. */
    async runAll(options = {}) {
      const checks = [
        ["runLedgerDrift", []],
        ["runSolvency", []],
        ["runStuckDeposits", [options.stuckDeposits]],
        ["runStuckWithdrawals", [options.stuckWithdrawals]],
        ["runSettlementSla", [options.settlementSla]],
        ["runPrizeSla", [options.prizeSla]],
      ];
      if (paymentSvc && provider) {
        checks.push(["runProviderDeposits", [options.providerDeposits]]);
        checks.push(["runProviderWithdrawals", [options.providerWithdrawals]]);
      }
      if (plugins) {
        checks.push(["runReplayVerification", [options.replayVerification]]);
      }
      // Evidence cleanup needs no `plugins` -- it only deletes rows -- but
      // runs right after replay verification for readability: verify,
      // THEN retire what verification (or a fresh dispute window) no
      // longer needs.
      checks.push(["runEvidenceCleanup", [options.evidenceCleanup]]);
      const results = [];
      for (const [method, args] of checks) {
        try {
          results.push(await svc[method](...args));
        } catch (err) {
          results.push({ outcome: RunOutcome.FAILED, kind: method, error: err.message });
        }
      }
      return results;
    },

    /**
     * A human closes a case. `status` is the actual outcome (RESOLVED or
     * FALSE_POSITIVE); `resolution` is an optional short label distinct from
     * the longer `note` (e.g. resolution="stale provider cache", note="confirmed
     * with provider support ticket #1234, no funds actually lost"). A note is
     * always required -- the database enforces this too
     * (`reconciliation_case_resolved_is_explained`), but failing here with a
     * clear reason is friendlier than a raw constraint error.
     */
    async resolveCase(caseId, { resolvedBy, status, resolution, note }) {
      if (status !== "RESOLVED" && status !== "FALSE_POSITIVE") {
        return { ok: false, reason: "INVALID_STATUS" };
      }
      if (!note || !note.trim()) {
        return { ok: false, reason: "NOTE_REQUIRED" };
      }
      const r = await db.query(
        `UPDATE reconciliation_case
            SET status = $2::reconciliation_case_status, resolved_by=$3, resolved_at=now(),
                resolution=$4, resolution_note=$5
          WHERE id=$1 AND status IN ('OPEN','UNDER_REVIEW')
          RETURNING id`,
        [caseId, status, resolvedBy, resolution ?? status, note]
      );
      if (!r.rows.length) return { ok: false, reason: "NOT_FOUND_OR_ALREADY_CLOSED" };
      await db.query(
        `INSERT INTO reconciliation_case_event (case_id, event, actor_type, actor_id, detail)
         VALUES ($1,'RESOLVED','ADMIN',$2,$3::jsonb)`,
        [caseId, resolvedBy, JSON.stringify({ resolution, note })]
      );
      return { ok: true, caseId };
    },

    async listOpenCases({ limit = 100 } = {}) {
      const r = await db.query(
        `SELECT id, category, severity, status, subject_type, subject_id, detail, opened_at
           FROM reconciliation_case WHERE status IN ('OPEN','UNDER_REVIEW')
          ORDER BY severity = 'CRITICAL' DESC, opened_at ASC LIMIT $1`,
        [limit]
      );
      return r.rows;
    },

    /**
     * The general admin-facing listing: every status, filterable, paginated.
     * `listOpenCases()` above stays as the narrower "what needs attention
     * right now" view several call sites (including tests) already use;
     * this is the one the admin API's list/filter endpoint calls.
     */
    async listCases({ status, category, severity, subjectType, limit = 50, offset = 0 } = {}) {
      const conditions = [];
      const params = [];
      let i = 1;
      if (status) { conditions.push(`status = $${i++}::reconciliation_case_status`); params.push(status); }
      if (category) { conditions.push(`category = $${i++}::reconciliation_case_category`); params.push(category); }
      if (severity) { conditions.push(`severity = $${i++}::reconciliation_severity`); params.push(severity); }
      if (subjectType) { conditions.push(`subject_type = $${i++}`); params.push(subjectType); }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const boundedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
      const boundedOffset = Math.max(Number(offset) || 0, 0);
      params.push(boundedLimit, boundedOffset);

      const rows = await db.query(
        `SELECT id, category, severity, status, subject_type, subject_id, detail,
                opened_at, resolved_by, resolved_at, resolution, resolution_note
           FROM reconciliation_case
           ${where}
          ORDER BY severity = 'CRITICAL' DESC, opened_at DESC
          LIMIT $${i++} OFFSET $${i++}`,
        params
      );
      const count = await db.query(
        `SELECT count(*)::int AS n FROM reconciliation_case ${where}`,
        params.slice(0, conditions.length)
      );
      return { cases: rows.rows, total: count.rows[0].n };
    },

    async getCase(caseId) {
      const r = await db.query(
        `SELECT id, category, severity, status, subject_type, subject_id, detail,
                opened_at, resolved_by, resolved_at, resolution, resolution_note
           FROM reconciliation_case WHERE id=$1`,
        [caseId]
      );
      return r.rows[0] ?? null;
    },

    async getCaseEvents(caseId) {
      const r = await db.query(
        `SELECT id, event, actor_type, actor_id, detail, at
           FROM reconciliation_case_event WHERE case_id=$1 ORDER BY id`,
        [caseId]
      );
      return r.rows;
    },

    /**
     * A human acknowledges a case -- "I have seen this and am looking into
     * it" -- without yet deciding an outcome. Lighter than `resolveCase()`:
     * no note required, and it does not close anything. Idempotent: calling
     * it again on an already-UNDER_REVIEW case is a harmless no-op rather
     * than an error, since two reviewers glancing at the same queue is
     * normal, not a conflict.
     */
    async reviewCase(caseId, { reviewedBy, note = null } = {}) {
      const current = await db.query(`SELECT status FROM reconciliation_case WHERE id=$1`, [caseId]);
      if (!current.rows.length) return { ok: false, reason: "NOT_FOUND" };
      if (current.rows[0].status === "UNDER_REVIEW") return { ok: true, caseId, alreadyUnderReview: true };
      if (current.rows[0].status !== "OPEN") return { ok: false, reason: "NOT_OPEN" };

      await db.query(
        `UPDATE reconciliation_case SET status='UNDER_REVIEW'::reconciliation_case_status WHERE id=$1`,
        [caseId]
      );
      await db.query(
        `INSERT INTO reconciliation_case_event (case_id, event, actor_type, actor_id, detail)
         VALUES ($1,'UNDER_REVIEW','ADMIN',$2,$3::jsonb)`,
        [caseId, reviewedBy, JSON.stringify({ note })]
      );
      return { ok: true, caseId };
    },
  };

  return svc;
}
