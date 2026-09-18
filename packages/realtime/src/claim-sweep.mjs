/**
 * Find LIVE duels this gateway instance does not yet own, and claim them.
 *
 * This is the piece that was missing for A4 to matter in practice: the
 * lease (`lease.mjs`) and `gateway.claimDuel()` prove that ownership is
 * exclusive and safe under concurrency, but nothing yet decided WHEN a
 * gateway should go claim a duel it does not have loaded. Three cases this
 * closes:
 *
 *   1. Startup recovery -- duels that were LIVE when this process (or its
 *      predecessor) exited are still LIVE in the database; this instance
 *      should pick them back up.
 *   2. A newly-live duel -- the matchmaking dispatch worker marked a duel
 *      LIVE in a separate process; SOME gateway instance needs to notice
 *      and claim it before a player can actually connect and play.
 *   3. A dead peer's abandoned duel -- another gateway instance held the
 *      lease, crashed, and its lease has since expired; this instance may
 *      now claim it (exactly the A4 takeover scenario, just triggered on a
 *      schedule instead of by a specific test).
 *
 * Deliberately a periodic sweep, not a push notification: no pub/sub
 * exists in this codebase yet, and a poll every few seconds is a
 * perfectly ordinary way to run this until one does. Idempotent by
 * construction -- `claimDuel()` itself is the only thing that decides
 * whether a claim actually succeeds, via the SAME unowned-or-expired
 * compare-and-swap every other caller of it goes through.
 */
export async function sweepUnclaimableDuels(db, gw, { limit = 100 } = {}) {
  const r = await db.query(
    `SELECT id FROM duel
      WHERE (
        status = 'LIVE'
        OR (
          status = 'READY'
          AND (seat_0 LIKE 'bot_%' OR seat_0 LIKE 'ai-%')
          AND (seat_1 LIKE 'bot_%' OR seat_1 LIKE 'ai-%')
        )
      )
      AND (lease_owner IS NULL OR lease_expires_at < now())
      ORDER BY started_at NULLS FIRST, created_at
      LIMIT $1`,
    [limit]
  );
  const claimed = [];
  const heldByOther = [];
  for (const row of r.rows) {
    const res = await gw.claimDuel(row.id);
    if (res.ok) claimed.push(row.id);
    else heldByOther.push(row.id);
  }
  return { scanned: r.rows.length, claimed, heldByOther };
}
