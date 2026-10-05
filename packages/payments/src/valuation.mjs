/**
 * Stablecoin USD valuation: the JS-side surface over
 * db/migrations/0037_stablecoin_valuation.sql and 0038_payment_rail.sql.
 *
 * Every write goes through record_valuation_snapshot() in the database --
 * exactly one function, mirroring ledger_post() being the only way money
 * moves -- so the depeg-detection-and-rail-pause step can never be bypassed
 * by a caller that inserts a row directly.
 */

export function createValuationService(db) {
  return {
    /**
     * Record an independent USD valuation observation. Returns whether the
     * observation itself was NOMINAL or DEPEGGED, and how many rails this
     * call actually transitioned to RISK_PAUSED (0 if none needed it, or if
     * they were already paused -- the underlying UPDATE only touches rails
     * that are still ACTIVE, which is what makes two concurrent depeg
     * observations for the same asset settle into a single, well-defined
     * outcome rather than a double transition).
     */
    async record({
      asset, usdRateX1e8, source, observedAt, confidenceBps = 10000,
      createdBy = null, reason = null,
    }) {
      const r = await db.query(
        `SELECT * FROM record_valuation_snapshot($1,$2,$3,$4,$5,$6,$7)`,
        [asset, String(usdRateX1e8), source, observedAt, confidenceBps, createdBy, reason]
      );
      const row = r.rows[0];
      return {
        snapshotId: row.snapshot_id,
        status: row.status,
        deviationBps: row.deviation_bps,
        railsPaused: row.rails_paused,
      };
    },

    async current(asset) {
      const r = await db.query(`SELECT * FROM valuation_current($1)`, [asset]);
      return r.rows[0] ?? null;
    },

    async isDepegged(asset) {
      const r = await db.query(`SELECT asset_is_depegged($1) AS depegged`, [asset]);
      return r.rows[0].depegged === true;
    },

    async deviationBps(asset) {
      const r = await db.query(`SELECT valuation_deviation_bps($1) AS bps`, [asset]);
      return r.rows[0].bps;
    },
  };
}

// The Admin Payment & Stablecoin Control Center's editable per-rail fields,
// mapped from the JS-friendly name a caller passes in updateLimits() to the
// real payment_rail column. One place, so the set of what is editable (and
// what is NOT -- asset, network, and id are never in this map, and never
// editable: a rail's identity is fixed at creation, only its configuration
// moves) cannot drift between the update logic and the audit logic below.
const EDITABLE_FIELDS = {
  enabled: "enabled",
  depositsEnabled: "deposits_enabled",
  withdrawalsEnabled: "withdrawals_enabled",
  minDepositMinor: "min_deposit_minor",
  maxDepositMinor: "max_deposit_minor",
  minWithdrawalMinor: "min_withdrawal_minor",
  maxWithdrawalMinor: "max_withdrawal_minor",
  confirmationDepth: "confirmation_depth",
  jurisdictionsAllowed: "jurisdictions_allowed",
  pauseWithdrawalsOnDepeg: "pause_withdrawals_on_depeg",
};
const JSONB_COLUMNS = new Set(["jurisdictions_allowed"]);

export function createRailService(db) {
  return {
    async get(railId) {
      const r = await db.query(`SELECT * FROM payment_rail WHERE id = $1`, [railId]);
      return r.rows[0] ?? null;
    },

    /**
     * Every rail, joined with its asset/network display data and its
     * CURRENT valuation status -- this is the "Risk Status" column the
     * Control Center shows, read from the same valuation_snapshot data the
     * depeg circuit breaker itself acts on, never a separately-maintained
     * (and therefore driftable) copy.
     */
    async list() {
      const r = await db.query(
        `SELECT r.*,
                r.min_deposit_minor::text AS min_deposit_minor, r.max_deposit_minor::text AS max_deposit_minor,
                r.min_withdrawal_minor::text AS min_withdrawal_minor, r.max_withdrawal_minor::text AS max_withdrawal_minor,
                a.kind AS asset_kind, a.is_pegged AS asset_is_pegged, a.enabled AS asset_enabled,
                n.display_name AS network_display_name, n.enabled AS network_enabled,
                v.status AS risk_status, v.usd_rate_x1e8::text AS risk_rate_x1e8, v.effective_at AS risk_effective_at
           FROM payment_rail r
           JOIN asset a ON a.code = r.asset
           JOIN network n ON n.code = r.network
           LEFT JOIN LATERAL (SELECT * FROM valuation_current(r.asset)) v ON TRUE
          ORDER BY r.id`
      );
      return r.rows;
    },

    async enabledFor(asset, network, operation) {
      const r = await db.query(
        `SELECT rail_enabled_for($1,$2,$3) AS ok`, [asset, network, operation]
      );
      return r.rows[0].ok === true;
    },

    /** An admin sets a rail's status explicitly. Audited by the database. */
    async setStatus(railId, status, { actorType, actorId = null, reason }) {
      if (!reason || !reason.trim()) return { ok: false, reason: "REASON_REQUIRED" };
      try {
        const r = await db.query(
          `SELECT * FROM set_rail_status($1,$2::rail_status,$3,$4,$5)`,
          [railId, status, actorType, actorId, reason]
        );
        return { ok: true, rail: r.rows[0] };
      } catch (e) {
        if (/no such rail/.test(e.message)) return { ok: false, reason: "NOT_FOUND" };
        throw e;
      }
    },

    /**
     * Updates one or more of a rail's editable fields in a single
     * transaction, and logs EACH field that actually changed as its own
     * row in rail_configuration_change -- "Enabled: true -> false" and
     * "Maximum Withdrawal: 2000000000 -> 1000000000" are two separate,
     * independently-readable audit entries, not one opaque blob. A field
     * present in `patch` but equal to its current value is not logged at
     * all: an audit trail records CHANGES, not every field a form happened
     * to submit.
     *
     * Turning a rail off through this (enabled=false, or
     * depositsEnabled/withdrawalsEnabled=false) blocks NEW operations from
     * the next read of rail_enabled_for() onward -- it does not touch any
     * deposit, withdrawal, or ledger row that already exists, exactly the
     * same "block new, never rewrite history" contract setStatus() and
     * record_valuation_snapshot()'s own automatic pause already honour.
     */
    async updateLimits(railId, patch, { actorType, actorId = null, reason }) {
      if (!reason || !reason.trim()) return { ok: false, reason: "REASON_REQUIRED" };
      const fields = Object.keys(patch).filter((k) => k in EDITABLE_FIELDS);
      if (fields.length === 0) return { ok: false, reason: "NO_EDITABLE_FIELDS" };

      return db.transaction(async (tx) => {
        const before = await tx.query(`SELECT * FROM payment_rail WHERE id=$1 FOR UPDATE`, [railId]);
        if (!before.rows.length) return { ok: false, reason: "NOT_FOUND" };
        const old = before.rows[0];

        const setClauses = [];
        const values = [railId];
        let i = 2;
        for (const key of fields) {
          const col = EDITABLE_FIELDS[key];
          setClauses.push(JSONB_COLUMNS.has(col) ? `${col} = $${i}::jsonb` : `${col} = $${i}`);
          values.push(JSONB_COLUMNS.has(col) ? JSON.stringify(patch[key]) : patch[key]);
          i++;
        }
        setClauses.push("updated_at = now()");

        try {
          await tx.query(`UPDATE payment_rail SET ${setClauses.join(", ")} WHERE id=$1`, values);
        } catch (e) {
          if (/violates check constraint/.test(e.message)) {
            return { ok: false, reason: "INVALID_VALUE", detail: e.message };
          }
          throw e;
        }

        const after = await tx.query(`SELECT * FROM payment_rail WHERE id=$1`, [railId]);
        const changedFields = [];
        for (const key of fields) {
          const col = EDITABLE_FIELDS[key];
          const oldStr = stringify(old[col]);
          const newStr = stringify(after.rows[0][col]);
          if (oldStr === newStr) continue;
          await tx.query(
            `INSERT INTO rail_configuration_change (rail_id, field, old_value, new_value, actor_type, actor_id, reason)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [railId, col, oldStr, newStr, actorType, actorId, reason]
          );
          changedFields.push(col);
        }
        return { ok: true, rail: after.rows[0], changedFields };
      });
    },

    async history(railId) {
      const r = await db.query(
        `SELECT field, old_value, new_value, actor_type, actor_id, reason, at
           FROM rail_configuration_change WHERE rail_id = $1 ORDER BY id`,
        [railId]
      );
      return r.rows;
    },
  };
}

function stringify(value) {
  if (value === null || value === undefined) return null;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
