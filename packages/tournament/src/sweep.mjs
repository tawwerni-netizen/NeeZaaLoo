/**
 * The tournament automation sweep.
 *
 * tournament.mjs itself never advances a tournament on its own -- every
 * transition (open, start, report a result, advance, settle) is a call
 * somebody has to make. In production nobody ever calls reportResult() for
 * an ordinary tournament pairing: the underlying duel completes and settles
 * through the exact same gateway/settlement path every non-tournament duel
 * uses, which never touches `tournament_pairing` at all. Left alone, a
 * tournament's bracket simply never advances past round 1 -- the pairing
 * rows sit at LIVE forever even though the games behind them finished.
 *
 * This module is the bridge. Each function is independently idempotent and
 * safe to call concurrently from more than one worker process, the same
 * way settlement.settleDue() and progression.tournamentProgressionDue()
 * already are: every write underneath goes through tournament.mjs's own
 * transactional, status-gated methods, so a race between two sweep ticks
 * (or two separate worker processes) degrades to one succeeding and the
 * other observing a status that no longer matches -- never a double-apply.
 */

export function createTournamentSweep(db, tournamentService, settlementService) {
  /**
   * REGISTRATION -> LIVE or CANCELLED, once the deadline the admin set has
   * passed. Quorum met: start the bracket. Quorum not met: cancel and
   * refund, rather than leave a dead tournament sitting open forever.
   */
  async function closeDueRegistrations({ limit = 20 } = {}) {
    const due = await db.query(
      `SELECT id, min_players FROM tournament
        WHERE status = 'REGISTRATION' AND registration_closes_at <= now()
        ORDER BY registration_closes_at LIMIT $1`,
      [limit]
    );
    const results = [];
    for (const row of due.rows) {
      const count = await db.query(
        `SELECT count(*)::int c FROM tournament_registration WHERE tournament_id=$1 AND status='REGISTERED'`,
        [row.id]
      );
      const r = count.rows[0].c >= row.min_players
        ? await tournamentService.start(row.id)
        : await tournamentService.cancel(row.id, { reason: "NOT_ENOUGH_PLAYERS" });
      results.push({ tournamentId: row.id, ...r });
    }
    return results;
  }

  /**
   * The real fix for "a tournament's results never reach the bracket": a
   * pairing's duel reaches COMPLETED/SETTLED through the ordinary duel
   * lifecycle, entirely unaware that a `tournament_pairing` row is even
   * watching it. This is the one place that notices and calls
   * reportResult() on its behalf, using the duel's own real, already-
   * decided result -- never a value this sweep invents.
   */
  async function bridgeCompletedPairings({ limit = 50 } = {}) {
    const rows = await db.query(
      `SELECT tp.id AS pairing_id, d.result, d.termination_reason
         FROM tournament_pairing tp
         JOIN duel d ON d.id = tp.duel_id
        WHERE tp.status = 'LIVE' AND d.status IN ('COMPLETED','SETTLED') AND d.result IS NOT NULL
        LIMIT $1`,
      [limit]
    );
    const results = [];
    for (const row of rows.rows) {
      const r = await tournamentService.reportResult(
        { pairingId: row.pairing_id, result: row.result, reason: row.termination_reason ?? "REPORTED" },
        settlementService
      );
      results.push({ pairingId: row.pairing_id, ...r });
    }
    return results;
  }

  /** Once every pairing in the current round is decided, move the bracket on. */
  async function advanceCompleteRounds({ limit = 20 } = {}) {
    const rows = await db.query(
      `SELECT t.id FROM tournament t
        WHERE t.status IN ('LIVE','FINALS')
          AND EXISTS (SELECT 1 FROM tournament_round tr WHERE tr.tournament_id = t.id)
          AND NOT EXISTS (
            SELECT 1 FROM tournament_pairing tp
             WHERE tp.tournament_id = t.id
               AND tp.round_number = (
                 SELECT max(round_number) FROM tournament_round WHERE tournament_id = t.id
               )
               AND tp.status NOT IN ('COMPLETED','FORFEIT','BYE')
          )
        LIMIT $1`,
      [limit]
    );
    const results = [];
    for (const row of rows.rows) {
      results.push({ tournamentId: row.id, ...(await tournamentService.advance(row.id)) });
    }
    return results;
  }

  /**
   * FREE-tier tournaments settle (rank recording, zero prizes) the moment
   * they finish -- there is no money to gate behind admin four-eyes. A CASH
   * tournament is deliberately left alone here: settlePrizes() moves real
   * prize money, and stays behind the existing two-admin approval flow
   * (POST /v1/admin/tournaments/:id/settle/request + /settle) exactly like
   * every other slice of real money on this platform.
   */
  async function settleFreeTournaments({ limit = 20 } = {}) {
    const rows = await db.query(
      `SELECT id FROM tournament WHERE status = 'COMPLETED' AND tier = 'FREE' LIMIT $1`,
      [limit]
    );
    const results = [];
    for (const row of rows.rows) {
      results.push({ tournamentId: row.id, ...(await tournamentService.settlePrizes(row.id)) });
    }
    return results;
  }

  async function sweepAll() {
    const registrations = await closeDueRegistrations();
    const pairings = await bridgeCompletedPairings();
    const advances = await advanceCompleteRounds();
    const settlements = await settleFreeTournaments();
    return { registrations, pairings, advances, settlements };
  }

  return { closeDueRegistrations, bridgeCompletedPairings, advanceCompleteRounds, settleFreeTournaments, sweepAll };
}
