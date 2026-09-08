/**
 * EXP -- a domain of its own. EXP is not money, not a wallet balance, not
 * a Glicko rating, and not Global Skill; it never touches
 * packages/ledger, and nothing in this file ever will. See
 * db/migrations/0020_profile.sql's own header for why the running total
 * is computed with SUM() over an append-only event log rather than kept
 * as a separately-maintained counter that could drift.
 *
 * Every award is idempotent by construction: the caller supplies a
 * `dedupeKey` derived from whatever triggered it (e.g.
 * `duel:<duelId>:win`), and a retried match settlement, a replayed
 * tournament result, or a duplicate webhook collides on exp_event's own
 * UNIQUE(dedupe_key) instead of granting EXP twice. This module does not
 * itself decide what triggers an award -- that wiring (match completion,
 * tournament results) belongs to those systems' own slices; this is the
 * primitive they will call.
 */
import { randomUUID } from "node:crypto";

export const ExpError = Object.freeze({
  INVALID_AMOUNT: "INVALID_AMOUNT",
});

// Centralized, per directive #12 -- the ONE place an EXP amount is a
// number. A future caller (match settlement, tournament completion)
// imports these constants rather than inventing its own.
export const EXP_AMOUNTS = Object.freeze({
  GAME_COMPLETED: 10,
  GAME_WON: 25,
  TOURNAMENT_PARTICIPATION: 50,
  ACHIEVEMENT: 100,
});

export function createExpService(db, { now = () => Date.now() } = {}) {
  /**
   * Awards `amount` EXP once, keyed by `dedupeKey`. A second call with the
   * SAME dedupeKey is not an error -- it is indistinguishable, from the
   * caller's point of view, from "already handled": `awarded: false`.
   */
  async function award({ playerId, eventType, source = null, amount, dedupeKey }, ctx = {}) {
    if (!Number.isInteger(amount) || amount <= 0) {
      return { ok: false, reason: ExpError.INVALID_AMOUNT };
    }
    const id = `xp_${randomUUID()}`;
    try {
      await db.query(
        `INSERT INTO exp_event (id, player_id, event_type, source, amount, dedupe_key, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, playerId, eventType, source, amount, dedupeKey, new Date(now()).toISOString()]
      );
      return { ok: true, awarded: true };
    } catch (e) {
      if (/dedupe_key/.test(e.message) && /unique/i.test(e.message)) {
        return { ok: true, awarded: false };
      }
      throw e;
    }
  }

  async function totalFor(playerId) {
    const r = await db.query(
      "SELECT COALESCE(SUM(amount), 0)::int AS total FROM exp_event WHERE player_id = $1", [playerId]
    );
    return r.rows[0].total;
  }

  async function historyFor(playerId, { limit = 20 } = {}) {
    const r = await db.query(
      "SELECT event_type, source, amount, created_at FROM exp_event WHERE player_id = $1 ORDER BY created_at DESC LIMIT $2",
      [playerId, limit]
    );
    return r.rows;
  }

  return { award, totalFor, historyFor };
}
