/**
 * The one channel abstraction behind Global, Match, and Spectator chat --
 * directive: "do not create separate implementations for each type... the
 * channel type determines authorization and behavior." Every other module
 * in this package (messages, moderation) works against a `channel` row,
 * never against "a global chat" or "a match chat" as separate concepts.
 *
 * Channel ids are deterministic, not looked up by a separate index: GLOBAL
 * is always "global" (seeded once, migration 0023); MATCH/SPECTATOR are
 * "match:<duelId>" / "spectator:<duelId>". A client can therefore construct
 * the id for a match it knows about without a round trip -- but that id is
 * never trusted as a claim of membership. See canAccessChannel():
 * authorization always re-reads the REAL duel row's seat_0/seat_1 and
 * spectator_policy, never a player_id or role the client asserts about
 * themselves.
 *
 * Slice 10 adds a match/spectator channel LIFECYCLE (migration 0024's
 * post_game_deadline) on top of the same rows: canAccessChannel stays the
 * READ/eligibility gate (a participant can always read history, even long
 * after a match ends -- retention, not access, decides how long); a
 * SEPARATE isChannelOpenForWrites() gate decides whether NEW subscriptions
 * and NEW sends are still allowed. Splitting these is what lets "existing
 * history remains readable" and "no new messages" both be true at once.
 */
export const ChatChannelType = Object.freeze({ GLOBAL: "GLOBAL", MATCH: "MATCH", SPECTATOR: "SPECTATOR" });

export const ChatAuthError = Object.freeze({
  NO_SUCH_CHANNEL: "NO_SUCH_CHANNEL",
  NO_SUCH_MATCH: "NO_SUCH_MATCH",
  NOT_A_PARTICIPANT: "NOT_A_PARTICIPANT",
  NOT_YET_AVAILABLE: "NOT_YET_AVAILABLE",
  CHANNEL_CLOSED: "CHANNEL_CLOSED",
  SPECTATORS_DISABLED: "SPECTATORS_DISABLED",
  POST_GAME_CLOSED: "POST_GAME_CLOSED",
});

// The post-game chat retention window: how long after a duel completes its
// match/spectator channels stay open to NEW messages. Configurable, never
// hardcoded in the check itself (directive: "do not hardcode arbitrary
// timings") -- apps/gateway and apps/api both read the same env var so a
// production deployment tunes one value, not two.
export const DEFAULT_POST_GAME_WINDOW_MS = Number(process.env.CHAT_POST_GAME_WINDOW_MS) || 15 * 60 * 1000;

export function globalChannelId() {
  return "global";
}

export function matchChannelId(duelId) {
  return `match:${duelId}`;
}

export function spectatorChannelId(duelId) {
  return `spectator:${duelId}`;
}

/**
 * Pure -- no I/O. Whether a channel row still accepts NEW subscriptions and
 * NEW messages, independent of who is asking. GLOBAL has no lifecycle (its
 * post_game_deadline is always null); MATCH/SPECTATOR close once `now` has
 * passed the deadline a duel completion stamped.
 */
export function isChannelOpenForWrites(channel, now) {
  if (!channel) return false;
  if (channel.status !== "ACTIVE") return false;
  if (!channel.post_game_deadline) return true;
  return now < new Date(channel.post_game_deadline).getTime();
}

export function createChannelService(db, { now = () => Date.now() } = {}) {
  async function getChannel(channelId) {
    const r = await db.query(
      "SELECT id, type, reference_type, reference_id, status, post_game_deadline, created_at FROM chat_channel WHERE id = $1",
      [channelId]
    );
    return r.rows[0] ?? null;
  }

  async function insertChannelIdempotent(id, type, duelId) {
    // `id` is deterministic from duelId, so two concurrent first-joiners'
    // inserts always collide on BOTH the `id` primary key AND the separate
    // chat_channel_reference_unique_idx partial index AT ONCE -- and a
    // single INSERT's ON CONFLICT clause can name only ONE of those two
    // constraints, so whichever one it does NOT name still raises a real
    // 23505 for the loser. A plain try/catch on "some unique violation
    // happened" and falling through to read back the row that must now
    // exist (the same idempotent-insert idiom this codebase already uses
    // in ticket.mjs and messages.mjs) sidesteps the two-constraints
    // problem entirely, rather than fighting Postgres's one-target-per-
    // statement ON CONFLICT syntax. Caught live by this package's own
    // real-Postgres concurrency test -- never observable against PGlite's
    // single connection.
    try {
      await db.query(
        `INSERT INTO chat_channel (id, type, reference_type, reference_id) VALUES ($1, $2, 'DUEL', $3)`,
        [id, type, duelId]
      );
    } catch (e) {
      if (!/duplicate key value violates unique constraint/.test(e.message)) throw e;
    }
    return getChannel(id);
  }

  async function getOrCreateMatchChannel(duelId) {
    return insertChannelIdempotent(matchChannelId(duelId), "MATCH", duelId);
  }

  async function getOrCreateSpectatorChannel(duelId) {
    return insertChannelIdempotent(spectatorChannelId(duelId), "SPECTATOR", duelId);
  }

  /**
   * The one authorization check every join/send/history path runs through.
   * Never trusts anything the client asserts about its own membership --
   * for MATCH and SPECTATOR, it re-reads the real duel row every time. This
   * is the READ gate: it stays TRUE for a match participant even after the
   * duel ends and the post-game window has closed (see
   * isChannelOpenForWrites for the separate, write-side gate) -- retention
   * decides how long history stays readable, not this function.
   */
  async function canAccessChannel(channel, playerId) {
    if (!channel) return { ok: false, reason: ChatAuthError.NO_SUCH_CHANNEL };
    if (channel.status !== "ACTIVE") return { ok: false, reason: ChatAuthError.CHANNEL_CLOSED };

    if (channel.type === ChatChannelType.GLOBAL) return { ok: true };

    if (channel.type === ChatChannelType.MATCH) {
      const r = await db.query("SELECT seat_0, seat_1 FROM duel WHERE id = $1", [channel.reference_id]);
      if (!r.rows.length) return { ok: false, reason: ChatAuthError.NO_SUCH_MATCH };
      const { seat_0, seat_1 } = r.rows[0];
      if (playerId !== seat_0 && playerId !== seat_1) return { ok: false, reason: ChatAuthError.NOT_A_PARTICIPANT };
      return { ok: true };
    }

    if (channel.type === ChatChannelType.SPECTATOR) {
      const r = await db.query("SELECT seat_0, seat_1, spectator_policy FROM duel WHERE id = $1", [channel.reference_id]);
      if (!r.rows.length) return { ok: false, reason: ChatAuthError.NO_SUCH_MATCH };
      const { seat_0, seat_1, spectator_policy } = r.rows[0];
      const isParticipant = playerId === seat_0 || playerId === seat_1;
      // A seated player may always read/use their own match's spectator
      // chat (it is public commentary about a game they are IN); the
      // policy only ever restricts non-participants.
      if (isParticipant) return { ok: true };
      if (spectator_policy === "PLAYERS_ONLY") return { ok: false, reason: ChatAuthError.SPECTATORS_DISABLED };
      return { ok: true };
    }

    return { ok: false, reason: ChatAuthError.NO_SUCH_CHANNEL };
  }

  /**
   * Stamps the post-game deadline on a duel's match AND spectator channels
   * in one statement -- set ONCE (post_game_deadline IS NULL guards it), by
   * the server, the instant a duel is observed COMPLETED. Matches zero
   * rows harmlessly if nobody ever opened that duel's spectator channel;
   * never creates one. Never called by anything client-reachable -- only
   * packages/realtime/src/gateway.mjs's publishNewEvents, right where a
   * duel's own COMPLETED broadcast already happens.
   */
  async function markMatchCompleted(duelId, { windowMs = DEFAULT_POST_GAME_WINDOW_MS, at = now() } = {}) {
    const deadline = new Date(at + windowMs).toISOString();
    await db.query(
      `UPDATE chat_channel SET post_game_deadline = $2
       WHERE reference_type = 'DUEL' AND reference_id = $1 AND post_game_deadline IS NULL`,
      [duelId, deadline]
    );
  }

  /**
   * The SAME real-data eligibility check canAccessChannel's SPECTATOR
   * branch runs, exposed standalone for the ONE caller outside this
   * package that needs it without a chat_channel row at all: the realtime
   * gateway's duel-state JOIN (packages/realtime/src/gateway.mjs), which
   * decides whether a non-seated connection may even SUBSCRIBE to a duel's
   * live game state -- a decision that has nothing to do with chat, but
   * must not be a second, independently-drifting copy of "is this duel
   * private" logic. Returns null for a nonexistent duel (caller already
   * has its own NO_SUCH_DUEL handling).
   */
  async function getSpectatorPolicy(duelId) {
    const r = await db.query("SELECT seat_0, seat_1, spectator_policy FROM duel WHERE id = $1", [duelId]);
    return r.rows[0] ?? null;
  }

  return {
    getChannel, getOrCreateMatchChannel, getOrCreateSpectatorChannel, canAccessChannel, markMatchCompleted,
    getSpectatorPolicy,
  };
}
