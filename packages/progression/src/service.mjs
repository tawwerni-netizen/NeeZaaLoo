/**
 * Progression -- the event boundary between "a game/tournament finished"
 * and "EXP/achievements/badges changed." Nothing upstream of this file
 * (a game plugin, the duel engine, the tournament engine) knows XP amounts,
 * level curves, or achievement codes exist; they only ever produce an
 * authoritative RESULT. This is the ONE place that turns a result into a
 * reward, by calling the ALREADY-BUILT, independently-idempotent
 * primitives in packages/profile (exp.mjs, achievements.mjs, badges.mjs)
 * -- this file adds no new idempotency mechanism of its own for the
 * awards themselves, only the sweep-scheduling marker described below.
 *
 * SOURCE OF TRUTH (directive #2): the only two "did this really happen"
 * signals this file will ever read are `duel.status = 'SETTLED'` and
 * `tournament_settlement` rows written by settlePrizes() -- never a
 * websocket message, a client claim, or a COMPLETED-but-not-yet-settled
 * duel. A duel reaches SETTLED only through settlement.settle(), which
 * itself refuses to run while `duel.fairplay_hold` is true (see
 * packages/settlement/src/settle.mjs) -- so a duel under fair-play review
 * structurally cannot reach this file at all. A VOIDED duel (a confirmed
 * platform fault or an invalidated fair-play case, see settle.mjs's
 * void_()) never becomes SETTLED either, so it never reaches here. This
 * IS this slice's fair-play policy, chosen deliberately over inventing a
 * separate hold/reversal mechanism: "progression eligible" and "money/
 * rating eligible" share the exact same gate, because nothing about EXP
 * should be MORE permissive than the money the same result would pay out.
 *
 * FINANCIAL SEPARATION (directive #1): this file imports nothing from
 * packages/ledger, computes no amount from stake_minor or rake, and never
 * writes to any ledger/wallet table. It reads `duel.result` (a game
 * outcome, "1-0"/"0-1"/"1/2-1/2") purely to decide WHO won -- the exact
 * same field packages/settlement/src/rake.mjs already reads for the same
 * purpose, reused rather than reinterpreted.
 *
 * IDEMPOTENCY / RETRY (directive #3, #13, #15): every individual award
 * (EXP, achievement, badge) is idempotent on its own terms (see each
 * primitive's own header) -- calling processDuelCompletion() twice, from
 * two workers, after a crash, or from a stale retry, produces the exact
 * same end state as calling it once. `duel.progression_processed_at` is
 * NOT what makes this safe; it is purely a cost optimization so the sweep
 * does not re-examine millions of long-settled duels forever. This is a
 * deliberate, documented choice over wrapping everything in one
 * transaction: directive #13 itself requires "a failure in progression
 * must never block or corrupt financial settlement" -- true only if
 * progression runs as its own step, after settlement has already
 * committed, never inside the same transaction.
 *
 * CROSS-GAME (directive #8): nothing here branches on gameId. A duel's
 * seat_0/seat_1/result triple is already generic across every game
 * plugin (the duel engine enforces that shape, not this file); the SAME
 * processDuelCompletion() code path handles Chess, Speed Math, and any
 * future plugin without modification.
 */
import { EXP_AMOUNTS } from "../../profile/src/exp.mjs";
import { BadgeSource } from "../../profile/src/badges.mjs";

export const ProgressionEventType = Object.freeze({
  GAME_COMPLETED: "GAME_COMPLETED",
  GAME_WON: "GAME_WON",
  TOURNAMENT_PARTICIPATION: "TOURNAMENT_PARTICIPATION",
});

export const DuelProgressionResult = Object.freeze({
  NOT_FOUND: "NOT_FOUND",
  NOT_SETTLED: "NOT_SETTLED",
});

export const TournamentProgressionResult = Object.freeze({
  NOT_FOUND: "NOT_FOUND",
  NOT_ELIGIBLE: "NOT_ELIGIBLE",
});

export function createProgressionService(db, { exp, achievements, badges, now = () => Date.now() }) {
  /**
   * Process ONE duel's completion. Safe to call any number of times for
   * the same duelId, from any number of concurrent callers -- every
   * write underneath is independently idempotent (see this file's own
   * header). Returns which awards were newly granted THIS call, purely
   * for observability/testing; a caller must never treat `false` here as
   * "the player doesn't have it" -- only the primitive's own listFor()/
   * totalFor() is authoritative about current state.
   */
  async function processDuelCompletion(duelId) {
    const r = await db.query(
      `SELECT seat_0, seat_1, result, status, progression_processed_at, is_vs_computer
         FROM duel WHERE id = $1`,
      [duelId]
    );
    if (!r.rows.length) return { ok: false, reason: DuelProgressionResult.NOT_FOUND };
    const duel = r.rows[0];

    // The authoritative gate (directive #2): anything short of SETTLED --
    // COMPLETED-but-unsettled, LIVE, VOIDED, ABORTED -- is not eligible.
    // A VOIDED/ABORTED duel can never reach SETTLED (settlement.settle()
    // only ever transitions FROM 'COMPLETED'), so this single check is
    // simultaneously "is this real" and "was this invalidated" -- no
    // separate policy branch needed for cancelled/aborted matches.
    if (duel.status !== "SETTLED") {
      return { ok: false, reason: DuelProgressionResult.NOT_SETTLED, status: duel.status };
    }
    if (duel.progression_processed_at) {
      return { ok: true, alreadyProcessed: true };
    }

    // VS_COMPUTER awards nothing -- the simplest rule that cannot be
    // farmed (an Easy bot beaten on repeat could otherwise mint EXP and
    // FIRST_WIN forever) and the easiest to loosen later if the product
    // ever wants a smaller practice reward. Still stamped as processed so
    // the sweep never revisits it.
    if (duel.is_vs_computer) {
      await db.query(
        `UPDATE duel SET progression_processed_at = $2 WHERE id = $1 AND progression_processed_at IS NULL`,
        [duelId, new Date(now()).toISOString()]
      );
      return { ok: true, alreadyProcessed: false, awarded: { completed: [], won: null, firstWin: false }, vsComputer: true };
    }

    const players = [duel.seat_0, duel.seat_1];
    const isDraw = duel.result === "1/2-1/2";
    // The SAME winner expression packages/settlement/src/rake.mjs already
    // uses -- seat_0 is White/Player A, "1-0" means seat_0 won. Reused
    // verbatim rather than re-derived, so the two can never silently
    // disagree about who won a game.
    const winnerId = !isDraw ? (duel.result === "1-0" ? duel.seat_0 : duel.seat_1) : null;

    const awarded = { completed: [], won: null, firstWin: false };

    // GAME_COMPLETED: both participants, win/loss/draw alike -- directive
    // #5's policy, deliberately simple: showing up and finishing a real,
    // settled match is worth something regardless of the outcome or HOW
    // it ended (timeout, resignation, checkmate all count the same).
    for (const playerId of players) {
      const res = await exp.award({
        playerId,
        eventType: ProgressionEventType.GAME_COMPLETED,
        source: `duel:${duelId}`,
        amount: EXP_AMOUNTS.GAME_COMPLETED,
        dedupeKey: `duel:${duelId}:completed:${playerId}`,
      });
      if (res.awarded) awarded.completed.push(playerId);
    }

    if (winnerId) {
      const wonRes = await exp.award({
        playerId: winnerId,
        eventType: ProgressionEventType.GAME_WON,
        source: `duel:${duelId}`,
        amount: EXP_AMOUNTS.GAME_WON,
        dedupeKey: `duel:${duelId}:won:${winnerId}`,
      });
      if (wonRes.awarded) awarded.won = winnerId;

      // FIRST_WIN: attempted on every win (never gated on wonRes.awarded
      // above -- a retried GAME_WON exp award and a genuinely first-ever
      // win are independent questions). player_achievement's own PRIMARY
      // KEY is the entire idempotency guarantee here; this file adds none
      // of its own.
      const achRes = await achievements.award(winnerId, "FIRST_WIN");
      if (achRes.ok && achRes.awarded) {
        awarded.firstWin = true;
        // A badge only follows a NEWLY unlocked achievement -- calling
        // badges.award unconditionally would be harmless (also
        // idempotent) but reads as "badges can be earned independently
        // of achievements," which is not the policy this slice
        // implements (directive #10: "Achievement -> Badge award").
        await badges.award(winnerId, "FIRST_WIN", BadgeSource.ACHIEVEMENT);
      }
    }

    await db.query(
      `UPDATE duel SET progression_processed_at = $2 WHERE id = $1 AND progression_processed_at IS NULL`,
      [duelId, new Date(now()).toISOString()]
    );

    return { ok: true, alreadyProcessed: false, awarded };
  }

  /**
   * The periodic worker's own entry point -- the same shape and idiom as
   * settlement.settleDue(): find what is due, process each, report what
   * happened. Bounded by `limit` per tick, same as every other sweep in
   * this codebase.
   */
  async function progressionDue({ limit = 100 } = {}) {
    const due = await db.query(
      `SELECT id FROM duel
        WHERE status = 'SETTLED' AND progression_processed_at IS NULL
        ORDER BY settled_at
        LIMIT $1`,
      [limit]
    );
    const results = [];
    for (const row of due.rows) {
      results.push({ duelId: row.id, ...(await processDuelCompletion(row.id)) });
    }
    return results;
  }

  /**
   * Process ONE tournament's completion -- eligible only once its prize
   * pool has actually been settled (tournament_settlement rows exist),
   * the tournament-level equivalent of a duel reaching SETTLED. Every
   * ranked participant (rank 1 through last) gets TOURNAMENT_PARTICIPATION
   * EXP and an attempt at FIRST_TOURNAMENT -- "finished a tournament,"
   * not "won" one; there is no TOURNAMENT_WON EXP constant today, and
   * winning is already rewarded by the real prize pool.
   */
  async function processTournamentCompletion(tournamentId) {
    const t = await db.query(
      `SELECT status, progression_processed_at FROM tournament WHERE id = $1`,
      [tournamentId]
    );
    if (!t.rows.length) return { ok: false, reason: TournamentProgressionResult.NOT_FOUND };
    const tour = t.rows[0];
    if (tour.status !== "COMPLETED") {
      return { ok: false, reason: TournamentProgressionResult.NOT_ELIGIBLE, status: tour.status };
    }
    if (tour.progression_processed_at) return { ok: true, alreadyProcessed: true };

    const settlement = await db.query(
      `SELECT player_id FROM tournament_settlement WHERE tournament_id = $1`,
      [tournamentId]
    );
    // COMPLETED but settlePrizes() has not run yet -- not an error, just
    // not eligible YET; the sweep will pick it up once it is.
    if (!settlement.rows.length) return { ok: false, reason: TournamentProgressionResult.NOT_ELIGIBLE, status: "PRIZES_UNSETTLED" };

    const awarded = { participation: [], firstTournament: [] };
    for (const row of settlement.rows) {
      const playerId = row.player_id;
      const res = await exp.award({
        playerId,
        eventType: ProgressionEventType.TOURNAMENT_PARTICIPATION,
        source: `tournament:${tournamentId}`,
        amount: EXP_AMOUNTS.TOURNAMENT_PARTICIPATION,
        dedupeKey: `tournament:${tournamentId}:participation:${playerId}`,
      });
      if (res.awarded) awarded.participation.push(playerId);

      const achRes = await achievements.award(playerId, "FIRST_TOURNAMENT");
      if (achRes.ok && achRes.awarded) {
        awarded.firstTournament.push(playerId);
        await badges.award(playerId, "FIRST_TOURNAMENT", BadgeSource.ACHIEVEMENT);
      }
    }

    await db.query(
      `UPDATE tournament SET progression_processed_at = $2 WHERE id = $1 AND progression_processed_at IS NULL`,
      [tournamentId, new Date(now()).toISOString()]
    );
    return { ok: true, alreadyProcessed: false, awarded };
  }

  async function tournamentProgressionDue({ limit = 50 } = {}) {
    const due = await db.query(
      `SELECT t.id FROM tournament t
        WHERE t.status = 'COMPLETED' AND t.progression_processed_at IS NULL
          AND EXISTS (SELECT 1 FROM tournament_settlement ts WHERE ts.tournament_id = t.id)
        ORDER BY t.completed_at
        LIMIT $1`,
      [limit]
    );
    const results = [];
    for (const row of due.rows) {
      results.push({ tournamentId: row.id, ...(await processTournamentCompletion(row.id)) });
    }
    return results;
  }

  return { processDuelCompletion, progressionDue, processTournamentCompletion, tournamentProgressionDue };
}
