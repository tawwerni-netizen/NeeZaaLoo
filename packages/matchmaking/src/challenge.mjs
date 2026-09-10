/**
 * PLAY WITH FRIEND -- a direct challenge to a specific, named opponent.
 *
 * Distinct from matchmaking.mjs (pairs a player with whoever else is
 * waiting) and from vs-computer.mjs (no second player at all): here the
 * opponent is chosen up front, so there is no pool, no ticket, and no
 * pairing function -- only a proposal that the named opponent can accept,
 * decline, or let expire.
 *
 * Free or Competitive, exactly like RANDOM OPPONENT: accepting a CASH
 * challenge creates the duel row with status='RESERVED', the identical
 * shape mm_pair() already uses for a competitive matchmaking pairing --
 * this is what lets the ALREADY-EXISTING dispatch worker (packages/
 * matchmaking/src/dispatch.mjs) reserve both players' stakes and either
 * bring the duel LIVE or void it on insufficient funds, with zero new
 * reservation logic here. A FREE challenge is created READY, exactly as
 * before this feature existed.
 *
 * Every transition -- SENT, ACCEPTED, DECLINED, CANCELLED, and the
 * automatic EXPIRED -- is appended to duel_challenge_event, an honest,
 * permanent log distinct from the mutable duel_challenge row: "the system
 * must log this automatically" is that table, not a side effect an
 * operator has to trust happened.
 */
import { randomUUID } from "node:crypto";
import { DEFAULT_SPAWNERS } from "./spawn.mjs";
import { isValidStakeMinor } from "./stakes.mjs";
import { resolveTimeControl } from "../../duel-engine/src/time-profiles.mjs";

export const ChallengeError = Object.freeze({
  UNKNOWN_GAME: "UNKNOWN_GAME",
  UNKNOWN_OPPONENT: "UNKNOWN_OPPONENT",
  CANNOT_CHALLENGE_SELF: "CANNOT_CHALLENGE_SELF",
  ALREADY_PENDING: "ALREADY_PENDING",
  NOT_FOUND: "NOT_FOUND",
  NOT_YOUR_CHALLENGE: "NOT_YOUR_CHALLENGE",
  NOT_PENDING: "NOT_PENDING",
  EXPIRED: "EXPIRED",
  INVALID_STAKE: "INVALID_STAKE",
  BLOCKED: "BLOCKED",
});

// 30 seconds: the popup's own visible countdown IS the challenge's real
// lifetime, not a decorative timer racing a longer server-side window.
export const CHALLENGE_TTL_MS = 30 * 1000;

export function createChallengeService(db, {
  now = () => Date.now(),
  // Optional: without a chat channel service, MATCH_STARTED is simply not
  // logged (e.g. a narrow test or tool that has no chat package wired) --
  // the challenge/duel machinery itself never depends on chat existing.
  channels = null,
} = {}) {
  async function logEvent(tx, challengeId, eventType) {
    await tx.query(
      `INSERT INTO duel_challenge_event (challenge_id, event_type) VALUES ($1,$2::duel_challenge_event_type)`,
      [challengeId, eventType]
    );
  }

  async function create({
    gameId, challengerId, opponentNickname, tier = "FREE", stakeMinor = 0n, asset = "USDT",
  }) {
    if (tier === "CASH" && !isValidStakeMinor(stakeMinor)) {
      return { ok: false, reason: ChallengeError.INVALID_STAKE };
    }
    const game = await db.query("SELECT id, plugin_version FROM game WHERE id = $1", [gameId]);
    if (!game.rows.length) return { ok: false, reason: ChallengeError.UNKNOWN_GAME };

    const opponent = await db.query(
      "SELECT id FROM player WHERE LOWER(handle) = LOWER($1) AND is_ai = FALSE", [opponentNickname]
    );
    if (!opponent.rows.length) return { ok: false, reason: ChallengeError.UNKNOWN_OPPONENT };
    const opponentId = opponent.rows[0].id;
    if (opponentId === challengerId) return { ok: false, reason: ChallengeError.CANNOT_CHALLENGE_SELF };

    const blocked = await db.query(
      `SELECT 1 FROM chat_block WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)`,
      [challengerId, opponentId]
    );
    if (blocked.rows.length) return { ok: false, reason: ChallengeError.BLOCKED };

    const id = `ch_${randomUUID()}`;
    const createdAt = new Date(now());
    const expiresAt = new Date(now() + CHALLENGE_TTL_MS);
    const isCash = tier === "CASH";
    try {
      await db.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO duel_challenge
             (id, game_id, challenger_id, opponent_id, created_at, expires_at, tier, stake_minor, asset)
           VALUES ($1,$2,$3,$4,$5,$6,$7::entry_tier,$8,$9)`,
          [id, gameId, challengerId, opponentId, createdAt.toISOString(), expiresAt.toISOString(),
           tier, isCash ? stakeMinor.toString() : "0", isCash ? asset : null]
        );
        await logEvent(tx, id, "SENT");
      });
    } catch (e) {
      if (/duel_challenge_pending_unique_idx/.test(e.message)) {
        return { ok: false, reason: ChallengeError.ALREADY_PENDING };
      }
      throw e;
    }
    return { ok: true, challengeId: id, expiresAt: expiresAt.toISOString() };
  }

  /** Sweep every still-PENDING challenge past its expiry. Safe on any
   * schedule and safe under concurrent execution -- the UPDATE's own
   * `WHERE status='PENDING'` means a second, racing sweep simply matches
   * zero rows for anything the first already caught. */
  async function expireStale({ limit = 500 } = {}) {
    const due = await db.query(
      `SELECT id FROM duel_challenge WHERE status='PENDING' AND expires_at <= $1 LIMIT $2`,
      [new Date(now()).toISOString(), limit]
    );
    let expired = 0;
    for (const row of due.rows) {
      const r = await db.query(
        `UPDATE duel_challenge SET status='EXPIRED', responded_at=$2
           WHERE id=$1 AND status='PENDING' RETURNING id`,
        [row.id, new Date(now()).toISOString()]
      );
      if (r.rows.length) {
        await logEvent(db, row.id, "EXPIRED");
        expired++;
      }
    }
    return { ok: true, expired };
  }

  /**
   * Every mutating action (accept/decline/cancel) funnels through here:
   * lock the row with a real `SELECT ... FOR UPDATE`, resolve an overdue
   * PENDING challenge to EXPIRED under that SAME lock, THEN check ownership
   * and status, and only then let the caller act -- all inside one
   * transaction. A plain read-then-act (read status, decide, write) is
   * exactly the race CONCURRENT ACCEPT/DECLINE exists to catch: two
   * connections can both read PENDING before either writes, and both
   * proceed. The lock is what makes "exactly one wins" actually true
   * rather than "usually true, unless the timing is bad."
   */
  async function withLockedChallenge(challengeId, callerId, expectedOwner, fn) {
    return db.transaction(async (tx) => {
      const r = await tx.query("SELECT * FROM duel_challenge WHERE id = $1 FOR UPDATE", [challengeId]);
      if (!r.rows.length) return { ok: false, reason: ChallengeError.NOT_FOUND };
      let row = r.rows[0];

      if (row.status === "PENDING" && new Date(row.expires_at).getTime() <= now()) {
        await tx.query(
          `UPDATE duel_challenge SET status='EXPIRED', responded_at=$2 WHERE id=$1`,
          [challengeId, new Date(now()).toISOString()]
        );
        await logEvent(tx, challengeId, "EXPIRED");
        row = { ...row, status: "EXPIRED" };
      }

      if (row[expectedOwner] !== callerId) return { ok: false, reason: ChallengeError.NOT_YOUR_CHALLENGE };
      if (row.status === "EXPIRED") return { ok: false, reason: ChallengeError.EXPIRED };
      if (row.status !== "PENDING") return { ok: false, reason: ChallengeError.NOT_PENDING };
      return fn(tx, row);
    });
  }

  async function accept(challengeId, callerId) {
    const result = await withLockedChallenge(challengeId, callerId, "opponent_id", async (tx, row) => {
      const spawn = DEFAULT_SPAWNERS[row.game_id];
      const { initialState, seed } = spawn();
      const duelId = `ch_${randomUUID()}`;
      // Per-game safe default, not chess's clock applied to every game --
      // see duel-engine/src/time-profiles.mjs.
      const timeControl = resolveTimeControl(row.game_id);
      const isCash = row.tier === "CASH";

      await tx.query(
        `INSERT INTO duel
           (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
            tier, stake_minor, asset, initial_state, seed, time_control, status, is_vs_computer)
         VALUES ($1,$2,
           (SELECT plugin_version FROM game WHERE id = $2),
           $3,$4,$5,$6::entry_tier,$7,$8,$9::jsonb,$10,$11::jsonb,$12::duel_status,FALSE)`,
        [duelId, row.game_id, `challenge:${row.id}`, row.challenger_id, row.opponent_id,
         row.tier, row.stake_minor, isCash ? row.asset : null,
         JSON.stringify(initialState), seed, JSON.stringify(timeControl),
         // A cash challenge is RESERVED, not READY -- the SAME rule
         // mm_pair() already applies to a competitive matchmaking pairing
         // (see 0003's own comment): entry stakes must be locked in the
         // ledger before play begins, and only dispatch.mjs's existing
         // sweep (calling settlement.reserve()) may make that happen.
         isCash ? "RESERVED" : "READY"]
      );
      await tx.query(
        `UPDATE duel_challenge SET status = 'ACCEPTED', duel_id = $2, responded_at = $3 WHERE id = $1`,
        [challengeId, duelId, new Date(now()).toISOString()]
      );
      await logEvent(tx, row.id, "ACCEPTED");
      return { ok: true, duelId };
    });

    // MATCH_STARTED is logged AFTER the transaction commits, on the plain
    // `db` handle, deliberately outside it: `channels` was built against
    // this service's own outer `db`, and issuing a second, independent
    // query through that same connection WHILE `tx` still has one open
    // (even from further down the same await chain) is unsafe on a
    // single-connection backend such as PGlite. Chat is a decoration on
    // top of a real match, never a condition of it: if this fails or is
    // skipped (no `channels` configured), the duel this function already
    // committed is completely unaffected.
    if (result.ok && channels) {
      const channel = await channels.getOrCreateMatchChannel(result.duelId);
      await db.query(
        `INSERT INTO chat_system_event (channel_id, event_type, detail) VALUES ($1,'MATCH_STARTED','{}'::jsonb)`,
        [channel.id]
      );
    }
    return result;
  }

  async function decline(challengeId, callerId) {
    return withLockedChallenge(challengeId, callerId, "opponent_id", async (tx, row) => {
      await tx.query(
        `UPDATE duel_challenge SET status = 'DECLINED', responded_at = $2 WHERE id = $1`,
        [challengeId, new Date(now()).toISOString()]
      );
      await logEvent(tx, row.id, "DECLINED");
      return { ok: true };
    });
  }

  async function cancel(challengeId, callerId) {
    return withLockedChallenge(challengeId, callerId, "challenger_id", async (tx, row) => {
      await tx.query(
        `UPDATE duel_challenge SET status = 'CANCELLED', responded_at = $2 WHERE id = $1`,
        [challengeId, new Date(now()).toISOString()]
      );
      await logEvent(tx, row.id, "CANCELLED");
      return { ok: true };
    });
  }

  async function listIncoming(playerId) {
    await expireStale();
    const r = await db.query(
      `SELECT dc.id, dc.game_id, dc.created_at, dc.expires_at, dc.tier, dc.stake_minor::text AS stake_minor, dc.asset,
              dc.challenger_id, p.handle AS challenger_handle
         FROM duel_challenge dc JOIN player p ON p.id = dc.challenger_id
        WHERE dc.opponent_id = $1 AND dc.status = 'PENDING' AND dc.expires_at > $2
        ORDER BY dc.created_at DESC`,
      [playerId, new Date(now()).toISOString()]
    );
    return r.rows;
  }

  async function listOutgoing(playerId) {
    await expireStale();
    const r = await db.query(
      `SELECT dc.id, dc.game_id, dc.created_at, dc.expires_at, dc.tier, dc.stake_minor::text AS stake_minor, dc.asset,
              dc.opponent_id, p.handle AS opponent_handle
         FROM duel_challenge dc JOIN player p ON p.id = dc.opponent_id
        WHERE dc.challenger_id = $1 AND dc.status = 'PENDING' AND dc.expires_at > $2
        ORDER BY dc.created_at DESC`,
      [playerId, new Date(now()).toISOString()]
    );
    return r.rows;
  }

  return { create, accept, decline, cancel, listIncoming, listOutgoing, expireStale };
}
