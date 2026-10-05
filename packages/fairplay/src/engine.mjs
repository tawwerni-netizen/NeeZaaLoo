/**
 * The Fair Play Engine.
 *
 *   Signals -> Risk -> Evidence -> Case -> Review -> Decision -> Appeal
 *
 * One universal engine. Games contribute SIGNALS; only this engine produces
 * scores; only the case system produces decisions. A game plugin has no way to
 * express a verdict -- that is enforced by the plugin contract, and this file
 * is the other half of the same guarantee.
 *
 * The hard rule, restated because everything here depends on it:
 *
 *   NEVER ONE SIGNAL = BAN.
 *
 * Anything statistical goes to a human. Only physically-certain findings may be
 * actioned automatically, and the database refuses to record any other kind of
 * automatic action.
 */
import { randomUUID } from "node:crypto";
import { deriveMoveTimes } from "../../duel-engine/src/duel.mjs";

/** Categories where the finding is certain, not inferred. */
export const AUTO_ACTIONABLE = new Set([
  "IMPOSSIBLE_INPUT",       // a response faster than human physiology permits
  "PROTOCOL_VIOLATION",     // a malformed or impossible client message
  "CONFIRMED_SELF_PLAY",    // both seats, same session, same device
]);

/** Everything else needs a person, however loud the signal. */
export const STATISTICAL = new Set([
  "ENGINE_ASSISTANCE", "AUTOMATION", "COLLUSION", "MULTI_ACCOUNT",
  "PAYMENT_FRAUD", "OTHER",
]);

export const Sanction = {
  NONE: "NONE",
  WARNING: "WARNING",
  RATING_CORRECTION: "RATING_CORRECTION",
  DUEL_VOID: "DUEL_VOID",
  CASH_RESTRICTION: "CASH_RESTRICTION",
  ACCOUNT_RESTRICTION: "ACCOUNT_RESTRICTION",
  ACCOUNT_CLOSURE: "ACCOUNT_CLOSURE",
};

export function createFairPlayEngine(db, { now = () => Date.now(), openCaseAt = 60 } = {}) {
  const svc = {
    /**
     * Record signals from a detector or a game plugin.
     *
     * Signals are evidence and nothing else. `explanation` is mandatory and
     * checked by the database, because a signal a reviewer cannot read will
     * eventually produce a sanction nobody can justify.
     */
    async recordSignals(signals) {
      const ids = [];
      for (const s of signals) {
        const r = await db.query(
          `INSERT INTO fairplay_signal
             (player_id, duel_id, game_id, detector, detector_version, kind,
              strength, confidence, observed, baseline, explanation)
           VALUES ($1,$2,$3,$4,$5,$6::signal_kind,$7,$8,$9::jsonb,$10::jsonb,$11)
           RETURNING id`,
          [s.playerId, s.duelId ?? null, s.gameId ?? null, s.detector, s.detectorVersion,
           s.kind, s.strength, s.confidence,
           JSON.stringify(s.observed ?? {}), JSON.stringify(s.baseline ?? {}),
           s.explanation]
        );
        ids.push(Number(r.rows[0].id));
      }
      return ids;
    },

    /**
     * S0: the ONE place a completed duel's already-written, per-game
     * `fairPlaySignals()` is actually called. Every game plugin has
     * implemented this since its own registration was first enforced
     * (duel-engine requires the method to exist at all), and the tests
     * for each one have exercised it directly for just as long -- but
     * nothing in the realtime/settlement path ever invoked it outside
     * those tests, so no signal it can produce had ever once been
     * generated from real gameplay. This closes that gap without adding
     * a second detection engine: it is glue over TWO capabilities that
     * already existed on their own (a plugin's own detector, and this
     * engine's own `recordSignals`), computed off the in-memory duel
     * object at the moment it actually finishes -- never a second replay
     * of `duel_event`, and so unaffected by however long that log ends up
     * surviving retention (see reconcile.mjs's own runEvidenceCleanup).
     *
     * Called once per seat, exactly like a chess engine reviewing one
     * side's clock at a time: `deriveMoveTimes()` (duel-engine) splits the
     * shared event log into each seat's own think-time sequence, and
     * `history.seat` lets a plugin project its OWN internal timing data
     * (Speed Math's per-question record) onto whichever seat is being
     * checked.
     */
    async recordFromCompletedDuel(duel, plugin) {
      if (!duel.outcome) return 0;
      const moveTimes = deriveMoveTimes(duel);
      const signals = [];
      for (let seat = 0; seat < duel.players.length; seat++) {
        const raw = plugin.fairPlaySignals(duel.state, { moveTimesMs: moveTimes[seat], seat }) ?? [];
        for (const s of raw) {
          signals.push({
            playerId: duel.players[seat],
            duelId: duel.duelId,
            gameId: duel.gameId,
            detector: s.id ?? `${duel.gameId}.fairplay`,
            detectorVersion: s.detectorVersion ?? 1,
            kind: s.kind,
            strength: s.strength,
            confidence: s.confidence,
            observed: s.observedValue ?? {},
            baseline: s.baseline ?? {},
            explanation: s.explanation,
          });
        }
      }
      if (signals.length) await svc.recordSignals(signals);
      return signals.length;
    },

    /**
     * A2/admission (realtime/gateway.mjs's own INTENT handler): a nonce
     * already used, under a DIFFERENT payload than what was accepted the
     * first time -- or one from further back than the seat's own last
     * accepted action. No honest client, however laggy or however many
     * times it retries, ever produces this; it is PROTOCOL_VIOLATION, the
     * existing AUTO_ACTIONABLE category built for exactly this shape of
     * certain finding (see this file's own AUTO_ACTIONABLE set above).
     * This still only ever records evidence -- opening a case from it
     * remains a separate, deliberate call to openCase().
     */
    async recordReplayedAction({ playerId, duelId, gameId }) {
      return svc.recordSignals([{
        playerId, duelId, gameId,
        detector: "realtime.sequence_admission", detectorVersion: 1,
        kind: "PROTOCOL_VIOLATION", strength: 1, confidence: 1,
        observed: { duelId }, baseline: {},
        explanation:
          "A client message reused an action sequence number that had already been accepted " +
          "under a different payload (or one already superseded by a later real action). No " +
          "honest retry produces this shape; it is a replayed or forged action frame.",
      }]);
    },

    /**
     * Session binding (realtime/gateway.mjs's own JOIN handler): the same
     * account's seat is bound to more than one LIVE connection in one
     * duel at once -- not an ordinary reconnect, whose old socket is
     * already gone by the time a new one binds. Moderate, not certain: an
     * innocent second tab is possible, so this is ACCOUNT_RELATIONSHIP
     * (already a STATISTICAL category), never auto-actionable on its own.
     */
    async recordConcurrentSeat({ playerId, duelId, gameId, concurrentSessions }) {
      return svc.recordSignals([{
        playerId, duelId, gameId,
        detector: "realtime.session_binding", detectorVersion: 1,
        kind: "ACCOUNT_RELATIONSHIP", strength: 0.6, confidence: 0.6,
        observed: { concurrentSessions }, baseline: { expectedConcurrentSessions: 1 },
        explanation:
          `This account had ${concurrentSessions} live connections bound to the same seat of ` +
          `the same duel at the same time. A genuine reconnect's earlier connection is already ` +
          `closed by the time a new one binds, so this is concurrent occupancy, not reconnection.`,
      }]);
    },

    /**
     * Score a player from their recent signals.
     *
     * Two properties make this defensible rather than merely numeric:
     *
     *  - a signal contributes strength x confidence, so a wild reading from a
     *    tiny sample cannot dominate;
     *  - corroboration is rewarded and repetition is not. Ten timing signals
     *    are one kind of evidence seen ten times; a timing signal plus an
     *    accuracy signal plus a device link is three independent kinds, and
     *    that is what actually raises confidence in a finding.
     */
    async score(playerId, { windowDays = 30 } = {}) {
      const r = await db.query(
        `SELECT kind, strength, confidence, explanation, detector, id
           FROM fairplay_signal
          WHERE player_id = $1 AND created_at > now() - ($2 || ' days')::interval
          ORDER BY created_at DESC`,
        [playerId, String(windowDays)]
      );
      if (!r.rows.length) return { score: 0, factors: [], signalIds: [] };

      // Best evidence per kind, then combined. Repetition of one detector does
      // not stack; independent kinds do.
      const strongestByKind = new Map();
      for (const s of r.rows) {
        const weight = Number(s.strength) * Number(s.confidence);
        const prev = strongestByKind.get(s.kind);
        if (!prev || weight > prev.weight) {
          strongestByKind.set(s.kind, { weight, row: s });
        }
      }

      // Noisy-OR: independent evidence accumulates, but never reaches certainty
      // from any finite amount of it. Nothing here can produce 100.
      let survive = 1;
      const factors = [];
      for (const [kind, { weight, row }] of strongestByKind) {
        survive *= 1 - weight;
        factors.push({
          kind,
          detector: row.detector,
          contribution: Number(weight.toFixed(3)),
          explanation: row.explanation,
        });
      }
      const score = Math.round((1 - survive) * 100);

      factors.sort((a, b) => b.contribution - a.contribution);
      return { score, factors, signalIds: r.rows.map((x) => Number(x.id)) };
    },

    /** Persist a dimension score with its factors. Explainable or not stored. */
    async saveRisk(playerId, dimension, { score, factors }) {
      await db.query(
        `INSERT INTO risk_score (player_id, dimension, score, factors, computed_at)
         VALUES ($1,$2::risk_dimension,$3,$4::jsonb, now())
         ON CONFLICT (player_id, dimension) DO UPDATE
           SET score = EXCLUDED.score, factors = EXCLUDED.factors, computed_at = now()`,
        [playerId, dimension, score, JSON.stringify(factors)]
      );
      await db.query(
        `INSERT INTO risk_score_history (player_id, dimension, score, factors)
         VALUES ($1,$2::risk_dimension,$3,$4::jsonb)`,
        [playerId, dimension, score, JSON.stringify(factors)]
      );
      return { ok: true, score };
    },

    /**
     * Open a case.
     *
     * `autoAction` is only honoured for physically-certain categories. Ask for
     * it on a statistical category and it is refused here -- and refused again
     * by the database if this check were ever removed.
     */
    async openCase({ playerId, category, autoAction = null, signalIds = [], holdFunds = false }) {
      const scored = await svc.score(playerId);

      if (autoAction && !AUTO_ACTIONABLE.has(category)) {
        return {
          ok: false,
          reason: "HUMAN_REQUIRED",
          detail: `${category} is a statistical finding; it cannot be actioned automatically`,
        };
      }

      const id = `case_${randomUUID()}`;
      await db.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO fairplay_case
             (id, player_id, category, status, risk_score, auto_actioned,
              funds_held, decision, decided_at, decision_note)
           VALUES ($1,$2,$3::case_category,$4::case_status,$5,$6,$7,
                   $8::sanction,$9,$10)`,
          [id, playerId, category,
           autoAction ? "DECIDED" : "OPEN",
           scored.score, Boolean(autoAction), holdFunds,
           autoAction ?? null,
           autoAction ? new Date(now()).toISOString() : null,
           autoAction ? "automatic action on a physically certain finding" : null]
        );
        for (const sid of signalIds) {
          await tx.query(
            `INSERT INTO fairplay_case_signal (case_id, signal_id) VALUES ($1,$2)
             ON CONFLICT DO NOTHING`, [id, sid]
          );
        }
        await tx.query(
          `INSERT INTO fairplay_case_event (case_id, event, actor_type, detail)
           VALUES ($1,'OPENED','SYSTEM',$2::jsonb)`,
          [id, JSON.stringify({ category, score: scored.score, autoAction })]
        );
      });

      // Funds are HELD, never confiscated. A hold is reversible; a confiscation
      // before a decision is not.
      if (holdFunds) {
        await db.query("UPDATE duel SET fairplay_hold = TRUE WHERE seat_0=$1 OR seat_1=$1", [playerId]);
      }

      return { ok: true, caseId: id, score: scored.score, factors: scored.factors, autoActioned: Boolean(autoAction) };
    },

    /**
     * Should this player have a case opened?
     *
     * Returns a recommendation, never an action. The threshold opens a case for
     * REVIEW -- it does not sanction anybody.
     */
    async evaluate(playerId) {
      const scored = await svc.score(playerId);
      return {
        score: scored.score,
        factors: scored.factors,
        signalIds: scored.signalIds,
        recommendation: scored.score >= openCaseAt ? "OPEN_CASE_FOR_REVIEW" : "NO_ACTION",
        // Stated explicitly so no caller can mistake a score for a verdict.
        sanction: null,
      };
    },

    /** The evidence bundle a reviewer sees. Reconstructible later, unchanged. */
    async evidenceBundle(caseId) {
      const c = await db.query("SELECT * FROM fairplay_case WHERE id=$1", [caseId]);
      if (!c.rows.length) return null;
      const signals = await db.query(
        `SELECT s.* FROM fairplay_signal s
           JOIN fairplay_case_signal cs ON cs.signal_id = s.id
          WHERE cs.case_id = $1 ORDER BY s.created_at`,
        [caseId]
      );
      const events = await db.query(
        "SELECT event, actor_type, actor_id, at FROM fairplay_case_event WHERE case_id=$1 ORDER BY id",
        [caseId]
      );
      return { case: c.rows[0], signals: signals.rows, events: events.rows };
    },

    /**
     * A human decides.
     *
     * The reviewer is shown evidence, not just a number: the score must not
     * anchor the judgement, so `evidenceBundle` is the intended entry point and
     * the score is one field among many.
     */
    async decide({ caseId, adminId, sanction, note }) {
      if (!adminId) return { ok: false, reason: "REVIEWER_REQUIRED" };
      if (sanction !== Sanction.NONE && !note?.trim()) {
        return { ok: false, reason: "NOTE_REQUIRED" };
      }

      const c = await db.query("SELECT status, auto_actioned FROM fairplay_case WHERE id=$1", [caseId]);
      if (!c.rows.length) return { ok: false, reason: "NOT_FOUND" };
      if (["DECIDED", "APPEAL_DECIDED", "CLOSED_NO_ACTION"].includes(c.rows[0].status)) {
        return { ok: false, reason: "ALREADY_DECIDED" };
      }

      await db.transaction(async (tx) => {
        await tx.query(
          `UPDATE fairplay_case
              SET status = CASE WHEN $3::sanction = 'NONE' THEN 'CLOSED_NO_ACTION'::case_status
                                ELSE 'DECIDED'::case_status END,
                  decided_by=$2, decided_at=now(), decision=$3::sanction, decision_note=$4,
                  closed_at = CASE WHEN $3::sanction = 'NONE' THEN now() ELSE NULL END
            WHERE id=$1`,
          [caseId, adminId, sanction, note ?? null]
        );
        await tx.query(
          `INSERT INTO fairplay_case_event (case_id, event, actor_type, actor_id, detail)
           VALUES ($1,'DECIDED','ADMIN',$2,$3::jsonb)`,
          [caseId, adminId, JSON.stringify({ sanction })]
        );
      });

      // A cleared case releases the hold immediately. Money waits for a
      // decision, not for someone to remember to unlock it.
      if (sanction === Sanction.NONE) await svc.releaseHold(caseId);
      return { ok: true, caseId, sanction };
    },

    async releaseHold(caseId) {
      const c = await db.query("SELECT player_id FROM fairplay_case WHERE id=$1", [caseId]);
      if (!c.rows.length) return { ok: false };
      await db.query(
        `UPDATE duel SET fairplay_hold = FALSE
          WHERE (seat_0=$1 OR seat_1=$1) AND fairplay_hold = TRUE`,
        [c.rows[0].player_id]
      );
      await db.query("UPDATE fairplay_case SET funds_held = FALSE WHERE id=$1", [caseId]);
      return { ok: true };
    },

    // --- Appeals -------------------------------------------------------------

    async appeal({ caseId, playerNote }) {
      const c = await db.query("SELECT status FROM fairplay_case WHERE id=$1", [caseId]);
      if (!c.rows.length) return { ok: false, reason: "NOT_FOUND" };
      if (!["DECIDED"].includes(c.rows[0].status)) {
        return { ok: false, reason: "NOT_APPEALABLE", detail: c.rows[0].status };
      }
      const id = `appeal_${randomUUID()}`;
      await db.transaction(async (tx) => {
        await tx.query(
          "INSERT INTO fairplay_appeal (id, case_id, player_note) VALUES ($1,$2,$3)",
          [id, caseId, playerNote ?? null]
        );
        await tx.query(
          "UPDATE fairplay_case SET status='APPEALED'::case_status WHERE id=$1", [caseId]
        );
        await tx.query(
          `INSERT INTO fairplay_case_event (case_id, event, actor_type, detail)
           VALUES ($1,'APPEALED','USER','{}'::jsonb)`, [caseId]
        );
      });
      return { ok: true, appealId: id };
    },

    /**
     * Decide an appeal. The database refuses a reviewer who decided the case,
     * so "appeal" cannot degrade into asking the same person twice.
     */
    async decideAppeal({ appealId, adminId, upheld, note }) {
      const a = await db.query("SELECT case_id FROM fairplay_appeal WHERE id=$1", [appealId]);
      if (!a.rows.length) return { ok: false, reason: "NOT_FOUND" };
      const caseId = a.rows[0].case_id;

      try {
        await db.transaction(async (tx) => {
          await tx.query(
            `UPDATE fairplay_appeal SET reviewed_by=$2, reviewed_at=now(), upheld=$3, reviewer_note=$4
              WHERE id=$1`,
            [appealId, adminId, upheld, note ?? null]
          );
          await tx.query(
            `UPDATE fairplay_case
                SET status='APPEAL_DECIDED'::case_status,
                    decision = CASE WHEN $2 THEN 'NONE'::sanction ELSE decision END,
                    decision_note = CASE WHEN $2 THEN $3 ELSE decision_note END,
                    closed_at = now()
              WHERE id=$1`,
            [caseId, upheld, note ?? "appeal upheld; sanction reversed"]
          );
          await tx.query(
            `INSERT INTO fairplay_case_event (case_id, event, actor_type, actor_id, detail)
             VALUES ($1,'APPEAL_DECIDED','ADMIN',$2,$3::jsonb)`,
            [caseId, adminId, JSON.stringify({ upheld })]
          );
        });
      } catch (e) {
        if (/other than the admin who decided/.test(e.message)) {
          return { ok: false, reason: "REVIEWER_NOT_INDEPENDENT" };
        }
        throw e;
      }

      // Every sanction is reversible, and reversal is a first-class flow.
      if (upheld) await svc.releaseHold(caseId);
      return { ok: true, upheld };
    },
  };

  return svc;
}
