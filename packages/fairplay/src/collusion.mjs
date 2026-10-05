/**
 * Collusion detection, as a graph problem -- because it is one.
 *
 * Nodes: accounts, devices, networks, funding instruments.
 * Edges: shared device, shared network, shared funding, repeated pairing,
 *        value flow, referral.
 *
 * Two things make this tractable rather than speculative:
 *
 *   1. WE CONTROL MATCHMAKING. So the expected meeting frequency of any pair is
 *      arithmetic, not intuition. A pair meeting far more often than the
 *      distribution allows is a measured fact.
 *   2. Chip dumping is VALUE TRANSFER. Persistently one-directional flow between
 *      a pair is the signature, which makes this an AML control as much as a
 *      fair-play one.
 *
 * As everywhere in this subsystem, the output is signals. Nothing here bans
 * anyone; the case system does that, with a human.
 */

const DETECTOR = "collusion.graph";
const VERSION = 1;

export function createCollusionDetector(db, { poolSizeHint = 200 } = {}) {
  const svc = {
    /** Rebuild device-sharing edges. Two accounts on one machine is a fact. */
    async refreshDeviceLinks() {
      const r = await db.query(
        `INSERT INTO account_link (player_a, player_b, link_type, strength, detail, last_seen)
         SELECT LEAST(a.player_id, b.player_id), GREATEST(a.player_id, b.player_id),
                'SHARED_DEVICE'::link_type, 1.0,
                jsonb_build_object('fingerprint', a.fingerprint), now()
           FROM device a JOIN device b
             ON a.fingerprint = b.fingerprint AND a.player_id < b.player_id
         ON CONFLICT (player_a, player_b, link_type)
           DO UPDATE SET last_seen = now()
         RETURNING player_a`
      );
      return r.rows.length;
    },

    /**
     * How unlikely is it that these two met this often?
     *
     * With N eligible players, a given pair should meet about 1/(N-1) of the
     * time. Meeting far more than that is what we measure -- and because we
     * generated the pairings, the baseline is not a guess.
     */
    async pairingAnomaly(playerA, playerB, { poolSize = poolSizeHint } = {}) {
      const r = await db.query("SELECT * FROM pairing_frequency($1,$2)", [playerA, playerB]);
      const { met, a_total, b_total } = r.rows[0];
      const opportunities = Math.min(a_total, b_total);
      if (opportunities < 5 || met === 0) {
        return { met, opportunities, expected: 0, ratio: 0, strength: 0, confidence: 0 };
      }

      const expected = opportunities / Math.max(1, poolSize - 1);
      const ratio = met / Math.max(expected, 1e-9);

      // Ratio 1 is ordinary. 10x is odd. 50x is not an accident.
      const strength = Math.max(0, Math.min(1, (Math.log10(Math.max(ratio, 1))) / 2));
      const confidence = Math.min(1, opportunities / 50);

      return {
        met, opportunities,
        expected: Number(expected.toFixed(3)),
        ratio: Number(ratio.toFixed(2)),
        strength: Number(strength.toFixed(3)),
        confidence: Number(confidence.toFixed(3)),
      };
    },

    /**
     * Net value flow between a pair. One-directional flow across many duels is
     * chip dumping; a roughly even split across many duels is two people who
     * play each other a lot, which is not the same thing at all.
     */
    async valueFlowAnomaly(playerA, playerB) {
      const [a, b] = [playerA, playerB].sort();
      const r = await db.query(
        "SELECT duels, net_to_a::text AS net FROM duel_value_flow WHERE player_a=$1 AND player_b=$2",
        [a, b]
      );
      if (!r.rows.length) return { duels: 0, netToA: "0", directionality: 0, strength: 0, confidence: 0 };

      const duels = r.rows[0].duels;
      const net = BigInt(r.rows[0].net);
      const absNet = net < 0n ? -net : net;

      // Directionality: |net| as a share of everything that could have moved.
      // 1.0 means every single duel went the same way.
      const gross = await db.query(
        `SELECT COALESCE(sum(stake_minor),0)::text AS g FROM duel
          WHERE status='SETTLED' AND tier='CASH' AND result <> '1/2-1/2'
            AND ((seat_0=$1 AND seat_1=$2) OR (seat_0=$2 AND seat_1=$1))`,
        [a, b]
      );
      const grossValue = BigInt(gross.rows[0].g);
      const directionality = grossValue === 0n ? 0 : Number(absNet) / Number(grossValue);

      return {
        duels,
        netToA: net.toString(),
        directionality: Number(directionality.toFixed(3)),
        // Below 5 duels a one-sided result is just a short streak.
        strength: duels < 5 ? 0 : Number(Math.min(1, directionality).toFixed(3)),
        confidence: Number(Math.min(1, duels / 20).toFixed(3)),
      };
    },

    /**
     * Assemble signals for a pair. Returns evidence in the shape the Fair Play
     * Engine consumes -- and, deliberately, nothing resembling a conclusion.
     */
    async signalsForPair(playerA, playerB, opts = {}) {
      const signals = [];

      const pairing = await svc.pairingAnomaly(playerA, playerB, opts);
      if (pairing.strength > 0.2) {
        signals.push({
          playerId: playerA, detector: DETECTOR, detectorVersion: VERSION,
          kind: "PAIRING_ANOMALY",
          strength: pairing.strength, confidence: pairing.confidence,
          observed: { met: pairing.met, opportunities: pairing.opportunities, ratio: pairing.ratio },
          baseline: { expected: pairing.expected, poolSize: opts.poolSize ?? poolSizeHint },
          explanation:
            `These two accounts met ${pairing.met} times where roughly ` +
            `${pairing.expected} would be expected from the matchmaking pool ` +
            `(${pairing.ratio}x). Matchmaking is server-controlled, so the expected ` +
            `figure is arithmetic rather than an estimate.`,
        });
      }

      const flow = await svc.valueFlowAnomaly(playerA, playerB);
      if (flow.strength > 0.5) {
        signals.push({
          playerId: playerA, detector: DETECTOR, detectorVersion: VERSION,
          kind: "VALUE_FLOW",
          strength: flow.strength, confidence: flow.confidence,
          observed: { duels: flow.duels, netToA: flow.netToA, directionality: flow.directionality },
          baseline: { expectedDirectionality: "near 0 for evenly matched opponents" },
          explanation:
            `Across ${flow.duels} settled cash duels between these accounts, ` +
            `${(flow.directionality * 100).toFixed(0)}% of the value moved in one ` +
            `direction. Evenly matched opponents net out near zero; persistent ` +
            `one-way flow is the signature of deliberate losses.`,
        });
      }

      const device = await db.query(
        `SELECT strength, detail FROM account_link
          WHERE player_a=$1 AND player_b=$2 AND link_type='SHARED_DEVICE'`,
        [...[playerA, playerB].sort()]
      );
      if (device.rows.length) {
        signals.push({
          playerId: playerA, detector: DETECTOR, detectorVersion: VERSION,
          kind: "DEVICE_RELATIONSHIP",
          strength: Number(device.rows[0].strength), confidence: 1,
          observed: device.rows[0].detail,
          baseline: { expected: "distinct players normally use distinct devices" },
          explanation:
            "These accounts have been seen on the same device fingerprint. " +
            "That is not proof of collusion on its own -- households and shared " +
            "machines exist -- but it is a strong corroborating link.",
        });
      }

      return signals;
    },

    /**
     * Find rings: money that returns to where it started through intermediaries.
     * A cycle in the value-flow graph is much harder to explain innocently than
     * a single one-sided pair.
     */
    async findRings({ minDuels = 5, maxLength = 4 } = {}) {
      const r = await db.query(
        `WITH RECURSIVE flow AS (
           SELECT player_a AS src, player_b AS dst FROM duel_value_flow WHERE duels >= $1
           UNION ALL
           SELECT player_b, player_a FROM duel_value_flow WHERE duels >= $1
         ),
         walk(start, current, path, depth) AS (
           SELECT src, dst, ARRAY[src, dst], 1 FROM flow
           UNION ALL
           SELECT w.start, f.dst, w.path || f.dst, w.depth + 1
             FROM walk w JOIN flow f ON f.src = w.current
            WHERE w.depth < $2 AND NOT f.dst = ANY(w.path[2:])
         )
         SELECT DISTINCT path FROM walk
          WHERE current = start AND depth >= 3
          LIMIT 50`,
        [minDuels, maxLength]
      );
      return r.rows.map((x) => x.path);
    },

    /** Every account connected to this one, by any edge. */
    async neighbours(playerId) {
      const r = await db.query(
        `SELECT player_b AS other, link_type, strength FROM account_link WHERE player_a=$1
         UNION ALL
         SELECT player_a AS other, link_type, strength FROM account_link WHERE player_b=$1`,
        [playerId]
      );
      return r.rows;
    },
  };

  return svc;
}
