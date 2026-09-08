/**
 * PLAY WITH FRIEND -- a direct challenge to a specific, named opponent.
 *
 * Distinct from matchmaking.mjs (pairs a player with whoever else is
 * waiting) and from vs-computer.mjs (no second player at all): here the
 * opponent is chosen up front, so there is no pool, no ticket, and no
 * pairing function -- only a proposal that the named opponent can accept,
 * decline, or let expire.
 *
 * Accepting a challenge creates the duel row EXACTLY the way
 * vs-computer.mjs creates its own -- same READY/FREE/is_vs_computer=FALSE
 * shape, using the same DEFAULT_SPAWNERS a game's own entry already uses
 * for matchmaking -- so every downstream system (dispatch, gateway,
 * settlement, progression, rating) sees an ordinary human-vs-human duel
 * and needs no new case for "this one came from a challenge."
 */
import { randomUUID } from "node:crypto";
import { DEFAULT_SPAWNERS } from "./spawn.mjs";

export const ChallengeError = Object.freeze({
  UNKNOWN_GAME: "UNKNOWN_GAME",
  UNKNOWN_OPPONENT: "UNKNOWN_OPPONENT",
  CANNOT_CHALLENGE_SELF: "CANNOT_CHALLENGE_SELF",
  ALREADY_PENDING: "ALREADY_PENDING",
  NOT_FOUND: "NOT_FOUND",
  NOT_YOUR_CHALLENGE: "NOT_YOUR_CHALLENGE",
  NOT_PENDING: "NOT_PENDING",
  EXPIRED: "EXPIRED",
});

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function createChallengeService(db, { now = () => Date.now() } = {}) {
  async function create({ gameId, challengerId, opponentNickname }) {
    const game = await db.query("SELECT id, plugin_version FROM game WHERE id = $1", [gameId]);
    if (!game.rows.length) return { ok: false, reason: ChallengeError.UNKNOWN_GAME };

    const opponent = await db.query(
      "SELECT id FROM player WHERE LOWER(handle) = LOWER($1) AND is_ai = FALSE", [opponentNickname]
    );
    if (!opponent.rows.length) return { ok: false, reason: ChallengeError.UNKNOWN_OPPONENT };
    const opponentId = opponent.rows[0].id;
    if (opponentId === challengerId) return { ok: false, reason: ChallengeError.CANNOT_CHALLENGE_SELF };

    const id = `ch_${randomUUID()}`;
    const createdAt = new Date(now());
    const expiresAt = new Date(now() + CHALLENGE_TTL_MS);
    try {
      await db.query(
        `INSERT INTO duel_challenge (id, game_id, challenger_id, opponent_id, created_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, gameId, challengerId, opponentId, createdAt.toISOString(), expiresAt.toISOString()]
      );
    } catch (e) {
      if (/duel_challenge_pending_unique_idx/.test(e.message)) {
        return { ok: false, reason: ChallengeError.ALREADY_PENDING };
      }
      throw e;
    }
    return { ok: true, challengeId: id, expiresAt: expiresAt.toISOString() };
  }

  /** Shared row-fetch + ownership/state checks for accept/decline/cancel. */
  async function loadActionable(challengeId, callerId, expectedOwner) {
    const r = await db.query("SELECT * FROM duel_challenge WHERE id = $1", [challengeId]);
    if (!r.rows.length) return { ok: false, reason: ChallengeError.NOT_FOUND };
    const row = r.rows[0];
    if (row[expectedOwner] !== callerId) return { ok: false, reason: ChallengeError.NOT_YOUR_CHALLENGE };
    if (row.status !== "PENDING") return { ok: false, reason: ChallengeError.NOT_PENDING };
    if (new Date(row.expires_at).getTime() <= now()) return { ok: false, reason: ChallengeError.EXPIRED };
    return { ok: true, row };
  }

  async function accept(challengeId, callerId) {
    const loaded = await loadActionable(challengeId, callerId, "opponent_id");
    if (!loaded.ok) return loaded;
    const { row } = loaded;

    const spawn = DEFAULT_SPAWNERS[row.game_id];
    const { initialState, seed } = spawn();
    const duelId = `ch_${randomUUID()}`;
    const timeControl = { initialMs: 300_000, incrementMs: 0 };

    await db.query(
      `INSERT INTO duel
         (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
          tier, stake_minor, initial_state, seed, time_control, status, is_vs_computer)
       VALUES ($1,$2,
         (SELECT plugin_version FROM game WHERE id = $2),
         $3,$4,$5,'FREE'::entry_tier,0,$6::jsonb,$7,$8::jsonb,'READY'::duel_status,FALSE)`,
      [duelId, row.game_id, `challenge:${row.id}`, row.challenger_id, row.opponent_id,
        JSON.stringify(initialState), seed, JSON.stringify(timeControl)]
    );
    await db.query(
      `UPDATE duel_challenge SET status = 'ACCEPTED', duel_id = $2, responded_at = $3 WHERE id = $1`,
      [challengeId, duelId, new Date(now()).toISOString()]
    );
    return { ok: true, duelId };
  }

  async function decline(challengeId, callerId) {
    const loaded = await loadActionable(challengeId, callerId, "opponent_id");
    if (!loaded.ok) return loaded;
    await db.query(
      `UPDATE duel_challenge SET status = 'DECLINED', responded_at = $2 WHERE id = $1`,
      [challengeId, new Date(now()).toISOString()]
    );
    return { ok: true };
  }

  async function cancel(challengeId, callerId) {
    const loaded = await loadActionable(challengeId, callerId, "challenger_id");
    if (!loaded.ok) return loaded;
    await db.query(
      `UPDATE duel_challenge SET status = 'CANCELLED', responded_at = $2 WHERE id = $1`,
      [challengeId, new Date(now()).toISOString()]
    );
    return { ok: true };
  }

  async function listIncoming(playerId) {
    const r = await db.query(
      `SELECT dc.id, dc.game_id, dc.created_at, dc.expires_at, p.handle AS challenger_handle
         FROM duel_challenge dc JOIN player p ON p.id = dc.challenger_id
        WHERE dc.opponent_id = $1 AND dc.status = 'PENDING' AND dc.expires_at > $2
        ORDER BY dc.created_at DESC`,
      [playerId, new Date(now()).toISOString()]
    );
    return r.rows;
  }

  async function listOutgoing(playerId) {
    const r = await db.query(
      `SELECT dc.id, dc.game_id, dc.created_at, dc.expires_at, p.handle AS opponent_handle
         FROM duel_challenge dc JOIN player p ON p.id = dc.opponent_id
        WHERE dc.challenger_id = $1 AND dc.status = 'PENDING' AND dc.expires_at > $2
        ORDER BY dc.created_at DESC`,
      [playerId, new Date(now()).toISOString()]
    );
    return r.rows;
  }

  return { create, accept, decline, cancel, listIncoming, listOutgoing };
}
