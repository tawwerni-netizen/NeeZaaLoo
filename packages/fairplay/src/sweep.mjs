/**
 * The Fair Play Sweep.
 *
 * Everything upstream of this file was already real and already tested:
 * `recordFromCompletedDuel`/`recordReplayedAction`/`recordConcurrentSeat`
 * (packages/realtime/src/gateway.mjs) write genuine fairplay_signal rows from
 * real gameplay, and `collusion.mjs`'s pair-level detectors compute genuine
 * pairing/value-flow/device-sharing anomalies. But nothing in any production
 * entrypoint ever turned those signals into a `fairplay_case` a human could
 * see -- `engine.evaluate()` and `engine.openCase()` were exercised only by
 * this package's own tests. The admin Fair-Play Tribunal
 * (POST /v1/admin/fair-play/cases/:id/decide) could only ever act on a case
 * that already existed, and nothing ever created one. This sweep is that
 * missing step, run periodically like every other worker sweep:
 *
 *   1. Refresh the device-sharing graph and score any pair worth scoring
 *      (shared device, or a repeated cash pairing) for collusion signals.
 *   2. Score every player with a recent, not-yet-cased signal and open a
 *      case when the engine recommends review.
 *
 * Consistent with the engine's own contract (see its header), this NEVER
 * passes `autoAction` -- every case this sweep opens starts OPEN, waiting
 * for a human, exactly like `evaluate()` promises ("a recommendation, never
 * an action"). Widening that is a deliberate, separate decision.
 */

/** Which case a player is reviewed for is decided by their single strongest
 * signal kind (factors are already ranked by contribution in engine.score()).
 * Not a 1:1 enum mirror -- several signal kinds correspond to the same kind
 * of human review. */
const CATEGORY_FOR_KIND = {
  TIMING: "ENGINE_ASSISTANCE",
  ENGINE_CORRELATION: "ENGINE_ASSISTANCE",
  ACCURACY: "ENGINE_ASSISTANCE",
  INPUT_BIOMETRIC: "ENGINE_ASSISTANCE",
  PERFORMANCE_ANOMALY: "ENGINE_ASSISTANCE",
  AUTOMATION: "AUTOMATION",
  IMPOSSIBLE_INPUT: "IMPOSSIBLE_INPUT",
  PROTOCOL_VIOLATION: "PROTOCOL_VIOLATION",
  DEVICE_RELATIONSHIP: "COLLUSION",
  ACCOUNT_RELATIONSHIP: "COLLUSION",
  PAIRING_ANOMALY: "COLLUSION",
  VALUE_FLOW: "COLLUSION",
  NETWORK: "MULTI_ACCOUNT",
};

export function createFairPlaySweep(db, fairPlay, collusion, { lookbackHours = 24, pairLimit = 200, playerLimit = 200 } = {}) {
  return {
    /** Step 1: refresh and score the collusion graph. Returns signals recorded. */
    async sweepCollusion() {
      await collusion.refreshDeviceLinks();

      const pairs = await db.query(
        `SELECT player_a, player_b FROM account_link WHERE link_type = 'SHARED_DEVICE'
         UNION
         SELECT player_a, player_b FROM duel_value_flow WHERE duels >= 5
         LIMIT $1`,
        [pairLimit]
      );

      let signalCount = 0;
      for (const { player_a, player_b } of pairs.rows) {
        const signals = await collusion.signalsForPair(player_a, player_b);
        if (signals.length) {
          await fairPlay.recordSignals(signals);
          signalCount += signals.length;
        }
      }
      return { pairsChecked: pairs.rows.length, signalsRecorded: signalCount };
    },

    /** Step 2: score players with fresh, not-yet-cased signals and open cases. */
    async sweepCases() {
      const candidates = await db.query(
        `SELECT DISTINCT s.player_id
           FROM fairplay_signal s
          WHERE s.created_at > now() - ($1 || ' hours')::interval
            AND NOT EXISTS (
              SELECT 1 FROM fairplay_case c
               WHERE c.player_id = s.player_id AND c.status IN ('OPEN','UNDER_REVIEW','APPEALED')
            )
          LIMIT $2`,
        [String(lookbackHours), playerLimit]
      );

      let casesOpened = 0;
      for (const { player_id } of candidates.rows) {
        const scored = await fairPlay.evaluate(player_id);
        if (scored.recommendation !== "OPEN_CASE_FOR_REVIEW") continue;
        const category = CATEGORY_FOR_KIND[scored.factors[0]?.kind] ?? "OTHER";
        await fairPlay.openCase({
          playerId: player_id, category, signalIds: scored.signalIds,
        });
        casesOpened++;
      }
      return { playersEvaluated: candidates.rows.length, casesOpened };
    },

    async sweepDue() {
      const collusionResult = await this.sweepCollusion();
      const caseResult = await this.sweepCases();
      return { ...collusionResult, ...caseResult };
    },
  };
}
