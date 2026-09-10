/**
 * Durable duel storage.
 *
 * A duel is a plain serialisable object precisely so it can live in Postgres
 * and be rebuilt from it. Two properties this file exists to guarantee:
 *
 *   1. Nothing is told to a client that has not been durably recorded first.
 *      Persist, then broadcast -- never the reverse.
 *   2. A gateway restart loses no game. Live duels are rebuilt by replaying
 *      their event log through the same plugin that produced it, which means
 *      recovery exercises the same code path as replay verification. If
 *      recovery is wrong, replay verification is wrong, and the audit tests
 *      catch it.
 */
import { DuelState, deriveSequenceState } from "../../duel-engine/src/duel.mjs";
import { sharedRemaining } from "../../duel-engine/src/clock.mjs";

export function createDuelStore(db, { emit = () => {} } = {}) {
  return {
    /**
     * Record an accepted change: append events, refresh the clock snapshot,
     * and -- when the duel has finished -- write the result, reason and game
     * hash. All in ONE transaction.
     *
     * The completion fields are written here rather than in a second call for
     * a reason the database taught us: `duel_completed_has_result` refuses a
     * row whose status is COMPLETED but whose result is null. Splitting the
     * transition across two statements produced exactly that row, and a crash
     * between them would have left a duel marked finished that could never say
     * how. One transaction, or none.
     *
     * `leaseToken` (A4): when a caller passes the fencing token it was given
     * at lease acquisition, this transaction verifies -- atomically, at the
     * moment of the actual write -- that the token is still current before
     * writing anything. A stale owner (one whose lease expired and was taken
     * over by another gateway instance while it was not looking) has its
     * write rejected here rather than forking the event log. Omitting
     * `leaseToken` skips the check entirely, which is what every caller that
     * predates A4 (and every single-gateway deployment) still does.
     */
    async persist(duel, fromEventIndex, { gameHash = null, now = Date.now(), leaseToken = null } = {}) {
      const newEvents = duel.events.slice(fromEventIndex);
      const finished = duel.status === DuelState.COMPLETED;

      await db.transaction(async (tx) => {
        if (leaseToken !== null) {
          const r = await tx.query(
            `SELECT lease_token FROM duel WHERE id = $1 FOR UPDATE`, [duel.duelId]
          );
          if (!r.rows.length || Number(r.rows[0].lease_token) !== leaseToken) {
            emit("lease.stale_write_rejected", {
              duelId: duel.duelId, heldToken: leaseToken, currentToken: r.rows[0]?.lease_token ?? null,
            });
            throw Object.assign(
              new Error(`stale lease on duel ${duel.duelId}: held token ${leaseToken}, current ${r.rows[0]?.lease_token ?? "none"}`),
              { code: "STALE_LEASE" }
            );
          }
        }
        for (const ev of newEvents) {
          await tx.query(
            `INSERT INTO duel_event (duel_id, seq, type, payload, server_time_ms)
             VALUES ($1, $2, $3, $4::jsonb, $5)
             ON CONFLICT (duel_id, seq) DO NOTHING`,
            [duel.duelId, ev.seq, ev.type, JSON.stringify(ev.payload), ev.serverTimeMs]
          );
        }

        if (finished) {
          await tx.query(
            `UPDATE duel
                SET status = 'COMPLETED'::duel_status,
                    result = $2, termination_reason = $3, game_hash = $4,
                    completed_at = COALESCE(completed_at, now()),
                    clock_state = $5::jsonb
              WHERE id = $1`,
            [duel.duelId, duel.outcome.result, duel.outcome.reason, gameHash,
             JSON.stringify(clockSnapshot(duel, now))]
          );
        } else {
          await tx.query(
            `UPDATE duel SET clock_state = $2::jsonb, status = $3::duel_status WHERE id = $1`,
            [duel.duelId, JSON.stringify(clockSnapshot(duel, now)), duel.status]
          );
        }
      });
    },

    /**
     * Mark a duel LIVE and stamp its start.
     *
     * `started_at` uses COALESCE, not a bare `now()`: a dispatch worker must
     * be able to retry this call after a crash without each retry silently
     * shifting the game's official start time forward (the same reasoning
     * `persist()` already applies to `completed_at`).
     */
    async markLive(duel, now = Date.now()) {
      await db.query(
        `UPDATE duel SET status='LIVE', started_at = COALESCE(started_at, now()), clock_state = $2::jsonb
          WHERE id = $1`,
        [duel.duelId, JSON.stringify(clockSnapshot(duel, now))]
      );
    },

    /**
     * Rebuild every duel that was in play when the process died.
     *
     * @param {Map<string,object>} plugins
     * @param {number} recoveredAtMs server time at which play resumes
     */
    async recoverLive(plugins, recoveredAtMs) {
      const rows = await db.query(
        `SELECT id, game_id, plugin_version, seat_0, seat_1, tier, stake_minor::text AS stake,
                asset, initial_state, seed, time_control, clock_state, status, is_vs_computer
           FROM duel WHERE status IN ('LIVE','READY','RESERVED')`
      );
      const out = new Map();
      for (const row of rows.rows) {
        const duel = await this.hydrate(row, plugins, recoveredAtMs);
        out.set(duel.duelId, duel);
      }
      return out;
    },

    async load(duelId, plugins, recoveredAtMs) {
      const r = await db.query(
        `SELECT id, game_id, plugin_version, seat_0, seat_1, tier, stake_minor::text AS stake,
                asset, initial_state, seed, time_control, clock_state, status,
                result, termination_reason, game_hash, is_vs_computer
           FROM duel WHERE id = $1`,
        [duelId]
      );
      if (!r.rows.length) return null;
      return this.hydrate(r.rows[0], plugins, recoveredAtMs);
    },

    /** Rebuild one duel by replaying its event log through its own plugin. */
    async hydrate(row, plugins, recoveredAtMs) {
      const plugin = plugins.get(row.game_id);
      if (!plugin) throw new Error(`no plugin registered for game ${row.game_id}`);
      if (plugin.version !== row.plugin_version) {
        // A rules change must never silently reinterpret a game in progress.
        throw new Error(
          `duel ${row.id} was created under ${row.game_id} v${row.plugin_version}, ` +
          `but v${plugin.version} is loaded`
        );
      }

      const events = (await db.query(
        `SELECT seq, type, payload, server_time_ms FROM duel_event
          WHERE duel_id = $1 ORDER BY seq`,
        [row.id]
      )).rows;

      const rebuilt = plugin.rehydrate(row.initial_state, row.time_control, row.seed);
      let state = rebuilt.state;

      for (const ev of events) {
        if (ev.type !== "INTENT_ACCEPTED") continue;
        const res = plugin.applyIntent(state, ev.payload.intent, {
          seat: ev.payload.seat,
          serverTimeMs: Number(ev.server_time_ms),
        });
        if (!res.ok) {
          // The log contains something the rules now refuse. That is corruption
          // or a rules drift, and it must surface loudly rather than resume.
          throw new Error(
            `duel ${row.id}: stored event ${ev.seq} (${ev.payload.intent}) ` +
            `is not replayable: ${res.reason}`
          );
        }
        state = res.state;
      }

      const cs = row.clock_state ?? {};
      // Speed Math (SIMULTANEOUS) and Chess (ALTERNATING) use structurally
      // different clock objects (see clock.mjs) -- rebuilding the wrong shape
      // here would silently misclassify a shared-deadline game as
      // turn-based, and `runIntent`'s NOT_YOUR_TURN check would then reject
      // every move the "wrong" seat sends. This must track the plugin's own
      // turnModel, not guess from persisted fields.
      const simultaneous = plugin.turnModel === "SIMULTANEOUS";
      const clock = simultaneous
        ? {
            model: "SHARED",
            // Downtime is a platform fault and is NOT charged to the player:
            // the deadline restarts from resume with whatever time was left.
            durationMs: cs.remainingMs ?? row.time_control.durationMs,
            startedAt: recoveredAtMs,
            toMove: null,
          }
        : {
            initialMs: cs.initialMs ?? row.time_control.initialMs,
            incrementMs: cs.incrementMs ?? (row.time_control.incrementMs ?? 0),
            remaining: cs.remaining ?? [row.time_control.initialMs, row.time_control.initialMs],
            toMove: cs.toMove ?? 0,
            // Downtime is a platform fault and is NOT charged to the player on move.
            // The clock restarts from the moment play actually resumes. This is safe
            // because nothing a client does can trigger a recovery.
            turnStartedAt: recoveredAtMs,
          };

      return {
        duelId: row.id,
        gameId: row.game_id,
        pluginVersion: row.plugin_version,
        players: [row.seat_0, row.seat_1],
        seed: row.seed,
        config: {},
        challenge: plugin.rehydrate(row.initial_state, row.time_control, row.seed),
        state,
        status: row.status,
        clock,
        timeControl: {
          initialMs: row.time_control.initialMs,
          incrementMs: row.time_control.incrementMs ?? 0,
        },
        events: events.map((e) => ({
          seq: e.seq,
          type: e.type,
          payload: e.payload,
          serverTimeMs: Number(e.server_time_ms),
        })),
        // Sequence admission (A5): derived fresh from the SAME event rows
        // just replayed into `state` above, never a second stored copy --
        // see deriveSequenceState's own header for why this can never
        // drift from the log it's computed from.
        seq: deriveSequenceState(events.map((e) => ({ type: e.type, payload: e.payload }))),
        startedAt: cs.startedAtMs ?? 0,
        outcome: row.result
          ? { result: row.result, reason: row.termination_reason }
          : null,
        recoveredAt: recoveredAtMs,
        // VS_COMPUTER (see gateway.mjs's own botForSeat helper): loaded
        // from the persisted column, never re-derived or guessed -- a
        // duel's opponent kind is decided once, at creation, by whichever
        // path created the row (matchmaking pairing vs the vs-computer
        // route), and is never something the realtime layer infers.
        vsComputer: row.is_vs_computer,
        // Draw agreement (see duel-engine's offerDraw/declineDraw/
        // acceptDraw) is transient, in-memory-only state -- DRAW_OFFERED/
        // DRAW_DECLINED land on the event log like any other event, but
        // nothing here replays them into a live `drawOfferBy` the way
        // INTENT_ACCEPTED replays into `state`. A recovered duel MUST
        // still explicitly set both to null rather than leave them
        // `undefined`: declineDraw/acceptDraw's own guard is
        // `drawOfferBy === null || drawOfferBy === seat`, which is FALSE
        // for `undefined` -- an omitted field here would let a stale
        // "offer" from seat `undefined` be wrongly accepted or declined
        // after every single gateway restart. Clearing any open offer on
        // recovery is also the correct policy, not just the safe one: the
        // exact same "the moment things could have changed, a standing
        // offer goes stale" rule runIntent already applies to a move.
        drawOfferBy: null,
        drawCooldownUntil: null,
      };
    },
  };
}

function clockSnapshot(duel, now) {
  if (duel.clock.model === "SHARED") {
    return {
      model: "SHARED",
      remainingMs: sharedRemaining(duel.clock, now),
      startedAtMs: duel.startedAt,
    };
  }
  return {
    initialMs: duel.clock.initialMs,
    incrementMs: duel.clock.incrementMs,
    remaining: duel.clock.remaining,
    toMove: duel.clock.toMove,
    turnStartedAt: duel.clock.turnStartedAt,
    startedAtMs: duel.startedAt,
  };
}

export { DuelState };
