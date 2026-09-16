/**
 * The settlement service.
 *
 * This is the link between the duel engine and the ledger, and it is the only
 * place in the system where finishing a game turns into money moving.
 *
 * Completion and settlement are deliberately distinct states:
 *   - COMPLETED means the rules say the game is over.
 *   - SETTLED means the money and the ratings have been dealt with.
 * Keeping them apart is what lets a settlement failure retry without re-running
 * the game, and lets a duel under fair-play review sit finished-but-unpaid for
 * as long as a human needs.
 *
 * Every operation here is idempotent on a deterministic key, so a crash, a
 * retry, or a duplicated worker cannot pay anyone twice.
 */
import { applyDuel, fromStorage, toStorage } from "../../rating/src/glicko2.mjs";
import { computeRake, settlementLegs, reservationLegs, refundLegs } from "./rake.mjs";

export const SettleResult = {
  SETTLED: "SETTLED",
  ALREADY_SETTLED: "ALREADY_SETTLED",
  NOT_COMPLETED: "NOT_COMPLETED",
  ON_HOLD: "ON_HOLD",
  NOT_RESERVED: "NOT_RESERVED",
  NO_ECONOMY_RULE: "NO_ECONOMY_RULE",
};

// `asset` is only the fallback for a cash duel stamped before duels carried
// their coin. Every posting uses the duel's OWN asset: a DAI match locks,
// pays and rakes DAI, never the service default -- settling it in USDT would
// move coins neither player staked.
export function createSettlementService(db, { asset = "USDT" } = {}) {
  return {
    /**
     * Lock both stakes before play begins. A cash duel that cannot fund itself
     * never starts -- which is why the duel is created RESERVED, not READY.
     */
    async reserve(duelId) {
      return db.transaction(async (tx) => {
        const duel = await lockDuel(tx, duelId);
        if (!duel) return { ok: false, reason: "NO_SUCH_DUEL" };
        if (duel.tier !== "CASH") return { ok: true, reason: "NOT_CASH", moved: false };
        if (duel.reservation_tx_id) {
          return { ok: true, reason: "ALREADY_RESERVED", moved: false };
        }

        const legs = reservationLegs({
          seat0: duel.seat_0, seat1: duel.seat_1, stakeMinor: duel.stake_minor,
        });

        // If either player cannot fund the stake the ledger refuses the whole
        // transaction, so a duel can never begin half-funded.
        const posted = await post(tx, {
          key: `duel:${duelId}:reserve`,
          kind: "DUEL_ENTRY",
          legs, asset: duel.asset ?? asset, referenceType: "duel", referenceId: duelId,
        });

        await tx.query(
          `UPDATE duel SET reservation_tx_id = $2, status = 'READY'::duel_status WHERE id = $1`,
          [duelId, posted.transaction_id]
        );
        return { ok: true, reason: "RESERVED", moved: true, transactionId: posted.transaction_id };
      });
    },

    /**
     * Settle a completed duel: release stakes, pay the winner, take the rake,
     * update both ratings, mark the duel SETTLED. One transaction.
     */
    async settle(duelId, { at = null } = {}) {
      return db.transaction(async (tx) => {
        const duel = await lockDuel(tx, duelId);
        if (!duel) return { ok: false, reason: "NO_SUCH_DUEL" };

        if (duel.status === "SETTLED") {
          return { ok: true, reason: SettleResult.ALREADY_SETTLED, transactionId: duel.settlement_tx_id };
        }
        if (duel.status !== "COMPLETED") {
          return { ok: false, reason: SettleResult.NOT_COMPLETED, status: duel.status };
        }
        // Money waits for the case, however long that takes.
        if (duel.fairplay_hold) {
          return { ok: false, reason: SettleResult.ON_HOLD };
        }

        const isCash = duel.tier === "CASH";
        let transactionId = null;
        let rakeMinor = 0n;
        let rule = null;

        if (isCash) {
          if (!duel.reservation_tx_id) {
            // Refusing here is the point: paying out stakes that were never
            // locked would mint money.
            return { ok: false, reason: SettleResult.NOT_RESERVED };
          }

          if (duel.priced_rake_bps !== null && duel.priced_rake_bps !== undefined) {
            // The normal case for anything created after
            // db/migrations/0036_fee_snapshot.sql: the fee was resolved and
            // frozen onto the row by mm_pair() at CREATION time. Settlement
            // reads that snapshot and resolves nothing -- an admin who
            // changes the global rule after this duel started cannot reach
            // back into a match already under way.
            rule = {
              rule_id: duel.priced_economy_rule_id,
              rule_version: duel.priced_economy_rule_version,
              rake_bps: duel.priced_rake_bps,
              min_rake_minor: duel.priced_min_rake_minor,
              max_rake_minor: duel.priced_max_rake_minor,
            };
          } else {
            // Legacy fallback ONLY: a duel created before creation-time
            // pricing existed, or inserted directly by a test fixture that
            // bypasses mm_pair(). The real production path always carries a
            // snapshot, so this branch never runs there. Price it with the
            // rule that was in force when the game ENDED, exactly as every
            // duel was priced before 0036.
            const pricedAt = at ?? duel.completed_at;
            const r = await tx.query(
              `SELECT * FROM economy_resolve($1, $2::entry_tier, $3::timestamptz)`,
              [duel.game_id, duel.tier, pricedAt]
            );
            if (!r.rows.length) return { ok: false, reason: SettleResult.NO_ECONOMY_RULE };
            rule = r.rows[0];
          }

          // A draw takes no rake (see settlementLegs). The fee must be zeroed
          // HERE as well as in the legs, or the ledger would be correct while
          // duel.rake_minor claimed a fee that was never charged -- and every
          // revenue report built on that column would overstate income.
          const isDraw = duel.result === "1/2-1/2";
          if (isDraw) {
            rakeMinor = 0n;
          } else {
            const pot = BigInt(duel.stake_minor) * 2n;
            ({ rakeMinor } = computeRake(pot, {
              rakeBps: rule.rake_bps,
              minRakeMinor: rule.min_rake_minor,
              maxRakeMinor: rule.max_rake_minor,
            }));
          }

          const legs = settlementLegs({
            seat0: duel.seat_0, seat1: duel.seat_1,
            stakeMinor: duel.stake_minor, result: duel.result,
            rakeMinor,
          });

          const posted = await post(tx, {
            key: `duel:${duelId}:settle`,
            kind: "DUEL_SETTLE",
            legs, asset: duel.asset ?? asset, referenceType: "duel", referenceId: duelId,
          });
          transactionId = posted.transaction_id;
        }

        // VS_COMPUTER never rates: a bot is not a skill-matched opponent
        // drawn from the real pool, and letting one move a real player's
        // Glicko rating (in either direction, repeatedly, on demand) would
        // make rating gameable. `rating_applied` is still stamped below
        // regardless -- it means "settlement's rating step is done," not
        // "a rating changed," so a VS_COMPUTER duel is never re-attempted
        // by a retry either.
        const ratings = duel.is_vs_computer ? null : await applyRatings(tx, duel);

        await tx.query(
          `UPDATE duel
              SET status = 'SETTLED'::duel_status,
                  settlement_tx_id = $2,
                  rake_minor = $3,
                  economy_rule_id = $4,
                  economy_rule_version = $5,
                  rating_applied = TRUE,
                  settled_at = now()
            WHERE id = $1`,
          [duelId, transactionId, isCash ? rakeMinor.toString() : null,
           rule?.rule_id ?? null, rule?.rule_version ?? null]
        );

        return {
          ok: true,
          reason: SettleResult.SETTLED,
          transactionId,
          rakeMinor: rakeMinor.toString(),
          rule: rule ? { id: rule.rule_id, version: rule.rule_version, bps: rule.rake_bps } : null,
          ratings,
        };
      });
    },

    /**
     * Void a duel: return both stakes in full, take nothing, apply no rating
     * change. For confirmed platform faults and fair-play-invalidated duels.
     */
    async void_(duelId, reason) {
      return db.transaction(async (tx) => {
        const duel = await lockDuel(tx, duelId);
        if (!duel) return { ok: false, reason: "NO_SUCH_DUEL" };
        if (duel.status === "VOIDED") return { ok: true, reason: "ALREADY_VOIDED" };
        if (duel.status === "SETTLED") return { ok: false, reason: "ALREADY_SETTLED" };

        let transactionId = null;
        if (duel.tier === "CASH" && duel.reservation_tx_id) {
          const posted = await post(tx, {
            key: `duel:${duelId}:void`,
            kind: "DUEL_VOID",
            legs: refundLegs({
              seat0: duel.seat_0, seat1: duel.seat_1, stakeMinor: duel.stake_minor,
            }),
            asset: duel.asset ?? asset, referenceType: "duel", referenceId: duelId,
          });
          transactionId = posted.transaction_id;
        }

        await tx.query(
          `UPDATE duel SET status = 'VOIDED'::duel_status, settled_at = now() WHERE id = $1`,
          [duelId]
        );
        return { ok: true, reason: "VOIDED", detail: reason, transactionId };
      });
    },

    /** Put a duel beyond the reach of settlement while a case is open. */
    async hold(duelId, on = true) {
      await db.query(`UPDATE duel SET fairplay_hold = $2 WHERE id = $1`, [duelId, on]);
    },

    /**
     * The 24/7 worker: settle everything eligible. Deterministic operations are
     * automated; anything under hold is left for a human, by design.
     */
    async settleDue({ limit = 100 } = {}) {
      const due = await db.query(
        `SELECT id FROM duel
          WHERE status = 'COMPLETED' AND fairplay_hold = FALSE
          ORDER BY completed_at
          LIMIT $1`,
        [limit]
      );
      const results = [];
      for (const row of due.rows) {
        results.push({ duelId: row.id, ...(await this.settle(row.id)) });
      }
      return results;
    },
  };
}

// --- internals ---------------------------------------------------------------

async function lockDuel(tx, duelId) {
  const r = await tx.query(
    `SELECT id, game_id, seat_0, seat_1, tier, stake_minor::text AS stake_minor, asset,
            status, result, termination_reason, completed_at,
            reservation_tx_id, settlement_tx_id, fairplay_hold, rating_applied,
            is_vs_computer, priced_rake_bps, priced_economy_rule_id,
            priced_economy_rule_version, priced_min_rake_minor::text AS priced_min_rake_minor,
            priced_max_rake_minor::text AS priced_max_rake_minor
       FROM duel WHERE id = $1 FOR UPDATE`,
    [duelId]
  );
  return r.rows[0] ?? null;
}

async function post(tx, { key, kind, legs, asset, referenceType, referenceId }) {
  const r = await tx.query(
    `SELECT * FROM ledger_post($1, $2, 'SYSTEM', NULL, $3::jsonb, $4, NULL, $5, $6)`,
    [key, kind, JSON.stringify(legs), asset, referenceType, referenceId]
  );
  return r.rows[0];
}

/**
 * Glicko-2 write-back.
 *
 * Both players are updated from the SAME pre-duel snapshot, so the order in
 * which we happen to process them cannot change the result. The change is
 * recorded in rating_change, which is append-only: a player disputing a rating
 * move gets an answer rather than a shrug.
 */
async function applyRatings(tx, duel) {
  if (duel.rating_applied) return { applied: false, reason: "ALREADY_APPLIED" };

  const seats = [duel.seat_0, duel.seat_1];
  const before = [];
  for (const playerId of seats) {
    await tx.query(
      `INSERT INTO rating (player_id, game_id) VALUES ($1, $2)
       ON CONFLICT (player_id, game_id) DO NOTHING`,
      [playerId, duel.game_id]
    );
    const r = await tx.query(
      `SELECT rating_x100, rd_x100, volatility_x1e6, games_played
         FROM rating WHERE player_id = $1 AND game_id = $2 FOR UPDATE`,
      [playerId, duel.game_id]
    );
    before.push(r.rows[0]);
  }

  const score0 = duel.result === "1-0" ? 1 : duel.result === "0-1" ? 0 : 0.5;
  const a = fromStorage(before[0]);
  const b = fromStorage(before[1]);
  const updated = applyDuel(a, b, score0);
  const after = [toStorage(updated.a), toStorage(updated.b)];

  for (let i = 0; i < 2; i++) {
    await tx.query(
      `UPDATE rating
          SET rating_x100 = $3, rd_x100 = $4, volatility_x1e6 = $5,
              games_played = games_played + 1, last_played_at = now(), updated_at = now()
        WHERE player_id = $1 AND game_id = $2`,
      [seats[i], duel.game_id, after[i].rating_x100, after[i].rd_x100, after[i].volatility_x1e6]
    );
    await tx.query(
      `INSERT INTO rating_change
         (duel_id, player_id, game_id, score,
          rating_before_x100, rating_after_x100,
          rd_before_x100, rd_after_x100,
          volatility_before_x1e6, volatility_after_x1e6)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (duel_id, player_id) DO NOTHING`,
      [duel.id, seats[i], duel.game_id, i === 0 ? score0 : 1 - score0,
       before[i].rating_x100, after[i].rating_x100,
       before[i].rd_x100, after[i].rd_x100,
       before[i].volatility_x1e6, after[i].volatility_x1e6]
    );
  }

  return {
    applied: true,
    [seats[0]]: { before: before[0].rating_x100 / 100, after: after[0].rating_x100 / 100 },
    [seats[1]]: { before: before[1].rating_x100 / 100, after: after[1].rating_x100 / 100 },
  };
}
