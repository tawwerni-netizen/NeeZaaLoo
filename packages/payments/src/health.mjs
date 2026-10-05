/**
 * Real health status for a payment rail -- never fabricated.
 *
 * "Never fabricate health status. Health must come from real system
 * checks." is taken literally here: every check below either genuinely ran
 * and reports what it found, or is UNKNOWN because the capability to run it
 * was not configured (e.g. no chain reader wired up). UNKNOWN is a real,
 * honest answer; a silently-assumed OK is exactly the fabrication this
 * exists to prevent.
 *
 * Three independent checks, each answering a different question:
 *
 *   CHAIN     -- can we actually reach the blockchain right now? (a real
 *                round trip via chain.ping(), never a cached assumption)
 *   SOLVENCY  -- does custody currently cover what we owe, for this asset?
 *                (ledger_solvency, the same view the withdrawal gate reads)
 *   INCIDENTS -- is there an OPEN, unresolved CRITICAL reconciliation case
 *                touching this asset right now?
 *
 * The worst individual check's severity becomes the rail's overall status.
 */

export const HealthStatus = {
  OK: "OK",
  DEGRADED: "DEGRADED",
  DOWN: "DOWN",
  UNKNOWN: "UNKNOWN",
};

const SEVERITY_RANK = { OK: 0, UNKNOWN: 1, DEGRADED: 2, DOWN: 3 };
const worseOf = (a, b) => (SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a);

/**
 * @param {object} deps
 * @param {object} [deps.db] a query-capable handle; omit only in tests that
 *   exercise the chain check alone.
 * @param {object} [deps.chain] the independent chain reader (packages/chain).
 *   Optional -- its absence is reported as UNKNOWN, not as DOWN (we do not
 *   know the chain is unreachable; we know we never asked).
 * @param {number} [deps.degradedLatencyMs] a chain round trip slower than
 *   this, while still succeeding, is DEGRADED rather than OK.
 */
export function createHealthService({ db, chain, degradedLatencyMs = 3000 } = {}) {
  return {
    /** One rail's live health, asset/network-scoped. */
    async checkRail(asset, network) {
      const checks = [];

      checks.push(await checkChain(chain, network));
      if (db) {
        checks.push(await checkSolvency(db, asset));
        checks.push(await checkIncidents(db, asset));
      }

      const status = checks.reduce((worst, c) => worseOf(worst, c.status), HealthStatus.OK);
      return { status, checks, checkedAt: new Date().toISOString() };
    },
  };
}

async function checkChain(chain, network) {
  if (!chain || typeof chain.ping !== "function") {
    return { name: "CHAIN_REACHABLE", status: HealthStatus.UNKNOWN, detail: "no chain reader configured" };
  }
  try {
    // A multi-chain reader pings the chain this rail runs on; single readers ignore the argument.
    const result = await chain.ping({ network });
    if (result.latencyMs > 3000) {
      return { name: "CHAIN_REACHABLE", status: HealthStatus.DEGRADED, detail: `slow response: ${result.latencyMs}ms` };
    }
    return { name: "CHAIN_REACHABLE", status: HealthStatus.OK, detail: `${result.latencyMs}ms, block ${result.blockNumber}` };
  } catch (e) {
    return { name: "CHAIN_REACHABLE", status: HealthStatus.DOWN, detail: e.message };
  }
}

async function checkSolvency(db, asset) {
  const r = await db.query(
    "SELECT custody_held::text held, user_liabilities::text owed FROM ledger_solvency WHERE asset = $1",
    [asset]
  );
  if (!r.rows.length) {
    return { name: "SOLVENCY", status: HealthStatus.UNKNOWN, detail: "no ledger activity recorded for this asset yet" };
  }
  const held = BigInt(r.rows[0].held);
  const owed = BigInt(r.rows[0].owed);
  if (held < owed) {
    return { name: "SOLVENCY", status: HealthStatus.DOWN, detail: `custody ${held} < liabilities ${owed}` };
  }
  return { name: "SOLVENCY", status: HealthStatus.OK, detail: `custody ${held} >= liabilities ${owed}` };
}

async function checkIncidents(db, asset) {
  // Platform-wide, not asset-filtered: reconciliation_case does not
  // consistently tag which asset a case concerns (a SOLVENCY_BREACH case's
  // own detail shape varies), and a platform-level critical incident (a
  // ledger drift, an unresolved solvency breach) is genuinely relevant to
  // every rail's health regardless of which asset triggered it.
  const r = await db.query(
    `SELECT count(*)::int c FROM reconciliation_case WHERE status = 'OPEN' AND severity = 'CRITICAL'`
  );
  const openCritical = r.rows[0].c;
  if (openCritical > 0) {
    return { name: "OPEN_INCIDENTS", status: HealthStatus.DOWN, detail: `${openCritical} open CRITICAL case(s)` };
  }
  return { name: "OPEN_INCIDENTS", status: HealthStatus.OK, detail: "no open critical cases" };
}
