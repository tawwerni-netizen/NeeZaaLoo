/**
 * Duel ownership leases (A4).
 *
 * The whole mechanism is two atomic UPDATEs and a fencing token stored on the
 * `duel` row (see migration 0012). No process-local state is trusted:
 *
 *   - `acquire` only succeeds when the row is genuinely unowned or its lease
 *     has expired -- a compare-and-swap expressed as a WHERE clause, so two
 *     concurrent acquirers can never both win (Postgres row-level locking on
 *     UPDATE serialises them; the loser's WHERE simply no longer matches once
 *     it finally gets to run against the winner's committed row).
 *   - `renew` extends the SAME lease without bumping the token, and only
 *     succeeds while the caller is still the current owner.
 *   - the token itself is the fence: a caller must present the token it was
 *     given at `acquire` time on every write, and the write is only valid if
 *     that token still matches the row's CURRENT token. This is checked
 *     `store.persist()`'s own transaction (see `verifyLease` there), not
 *     here -- the lease manager only ever answers "who owns this, and with
 *     what token", never "is this specific write allowed".
 */
export const LeaseResult = {
  ACQUIRED: "ACQUIRED",
  HELD_BY_OTHER: "HELD_BY_OTHER",
  LOST: "LOST",
  NO_SUCH_DUEL: "NO_SUCH_DUEL",
};

export function createLeaseManager(db, { leaseMs = 15000, emit = () => {} } = {}) {
  return {
    leaseMs,

    /**
     * Take ownership. Succeeds if nobody owns the duel, or the previous
     * owner's lease has expired -- including re-acquiring your own expired
     * lease, which is indistinguishable from a stranger's for this purpose.
     * Does NOT succeed merely because you already hold a live lease: a
     * caller that already owns the duel keeps using the token it was given
     * the first time, rather than invalidating its own in-flight writes by
     * asking for a new one it does not need.
     */
    async acquire(duelId, ownerId) {
      const r = await db.query(
        `UPDATE duel
            SET lease_owner = $2,
                lease_token = lease_token + 1,
                lease_expires_at = now() + ($3 || ' milliseconds')::interval
          WHERE id = $1
            AND (lease_owner IS NULL OR lease_expires_at < now())
          RETURNING lease_token`,
        [duelId, ownerId, String(leaseMs)]
      );
      if (r.rows.length) {
        const token = Number(r.rows[0].lease_token);
        emit("lease.acquired", { duelId, ownerId, token });
        return { ok: true, reason: LeaseResult.ACQUIRED, token };
      }

      const current = await db.query(
        `SELECT lease_owner, lease_token FROM duel WHERE id = $1`, [duelId]
      );
      if (!current.rows.length) return { ok: false, reason: LeaseResult.NO_SUCH_DUEL };
      if (current.rows[0].lease_owner === ownerId) {
        // Already the live owner -- idempotent no-op, same token, no bump.
        return { ok: true, reason: LeaseResult.ACQUIRED, token: Number(current.rows[0].lease_token) };
      }
      emit("lease.held_by_other", { duelId, ownerId, currentOwner: current.rows[0].lease_owner });
      return { ok: false, reason: LeaseResult.HELD_BY_OTHER };
    },

    /**
     * Extend a lease you already hold. The token is unchanged -- renewal is
     * not a new ownership period, just a longer one. Fails if someone else
     * has since taken over (your lease expired and was reassigned), which is
     * the caller's signal to stop treating the duel as locally owned.
     */
    async renew(duelId, ownerId) {
      const r = await db.query(
        `UPDATE duel SET lease_expires_at = now() + ($3 || ' milliseconds')::interval
          WHERE id = $1 AND lease_owner = $2
          RETURNING lease_token`,
        [duelId, ownerId, String(leaseMs)]
      );
      if (!r.rows.length) {
        emit("lease.lost", { duelId, ownerId });
        return { ok: false, reason: LeaseResult.LOST };
      }
      const token = Number(r.rows[0].lease_token);
      emit("lease.renewed", { duelId, ownerId, token });
      return { ok: true, reason: LeaseResult.ACQUIRED, token };
    },

    /**
     * Batch extend multiple leases in one single SQL query instead of N serial queries.
     * Returns the Set of duelIds that successfully renewed.
     */
    async renewMany(duelIds, ownerId) {
      if (!duelIds || duelIds.length === 0) return new Set();
      const r = await db.query(
        `UPDATE duel SET lease_expires_at = now() + ($3 || ' milliseconds')::interval
          WHERE id = ANY($1) AND lease_owner = $2
          RETURNING id, lease_token`,
        [duelIds, ownerId, String(leaseMs)]
      );
      const renewed = new Set(r.rows.map((row) => row.id));
      for (const id of renewed) {
        emit("lease.renewed", { duelId: id, ownerId });
      }
      for (const id of duelIds) {
        if (!renewed.has(id)) emit("lease.lost", { duelId: id, ownerId });
      }
      return renewed;
    },

    /** Relinquish cleanly (graceful shutdown, duel finished). Idempotent. */
    async release(duelId, ownerId) {
      await db.query(
        `UPDATE duel SET lease_owner = NULL, lease_expires_at = NULL
          WHERE id = $1 AND lease_owner = $2`,
        [duelId, ownerId]
      );
      emit("lease.released", { duelId, ownerId });
    },

    async current(duelId) {
      const r = await db.query(
        `SELECT lease_owner, lease_token, lease_expires_at FROM duel WHERE id = $1`,
        [duelId]
      );
      if (!r.rows.length) return null;
      return {
        owner: r.rows[0].lease_owner,
        token: Number(r.rows[0].lease_token),
        expiresAt: r.rows[0].lease_expires_at,
      };
    },
  };
}
