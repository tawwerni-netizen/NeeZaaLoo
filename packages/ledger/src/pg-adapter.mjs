/**
 * Adapts a real `pg` (node-postgres) Client or Pool to the same minimal
 * `{ query, exec, transaction }` shape every service in this repo already
 * calls against PGlite. This is what makes A2's real-concurrency tests able
 * to run the EXACT SAME service code (`createSettlementService(db)`,
 * `createMatchmakingService(db)`, ...) against a real multi-connection
 * PostgreSQL server instead of PGlite's single WASM connection -- no
 * service file needs to know or care which one it was handed.
 *
 * `exec` runs a plain multi-statement SQL string via the simple query
 * protocol (what `migrate()` needs to apply a migration file in one call);
 * `query` runs a single parameterized statement; `transaction` opens a real
 * `BEGIN`/`COMMIT`/`ROLLBACK` block via a genuine dedicated connection.
 *
 * A2 finding (2026-09-06): two concurrent `ledger_post()` calls that both
 * touch one shared account (e.g. two duel reservations that both draw on the
 * same player's balance) can raise a genuine Postgres deadlock (40P01) --
 * two backends each holding a row lock the other needs, via the per-leg
 * `FOR UPDATE` in `ledger_apply_entry()` interacting with the `ledger_balance`
 * upsert's own conflict-resolution locking. PGlite's single connection can
 * never produce two backends, so this was structurally unobservable before
 * this file existed. This is not an application bug to fix by re-ordering
 * anything -- PostgreSQL's own documentation is explicit that a correctly
 * designed transactional application must be prepared to retry on
 * deadlock_detected/serialization_failure, because the database's deadlock
 * detector resolves the cycle by aborting the loser, by design. So the retry
 * lives here, once, at the one place every financial write already passes
 * through -- not scattered across settlement.mjs, payments.mjs and
 * tournament.mjs, and not touching any of their already-tested logic.
 */
const RETRYABLE_SQLSTATES = new Set([
  "40P01", // deadlock_detected
  "40001", // serialization_failure
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createPgAdapter(clientOrPool, { maxRetries = 5 } = {}) {
  return {
    async query(text, params) {
      return clientOrPool.query(text, params);
    },
    async exec(sql) {
      return clientOrPool.query(sql);
    },
    async transaction(fn) {
      // A transaction needs ONE dedicated connection for its whole lifetime.
      // A Pool hands out a fresh pooled connection on every `connect()` call;
      // a bare Client (`idleCount` is Pool-only -- a Client has no such
      // property) already IS that one connection, and calling `.connect()`
      // on it a second time throws ("Client has already been connected"),
      // so it must be used directly rather than re-connected.
      const isPool = "idleCount" in clientOrPool;
      const client = isPool ? await clientOrPool.connect() : clientOrPool;
      const release = isPool && typeof client.release === "function"
        ? () => client.release()
        : () => {};
      const tx = { query: (text, params) => client.query(text, params) };
      try {
        for (let attempt = 1; ; attempt++) {
          try {
            await client.query("BEGIN");
            const result = await fn(tx);
            await client.query("COMMIT");
            return result;
          } catch (err) {
            await client.query("ROLLBACK").catch(() => {});
            const retryable = RETRYABLE_SQLSTATES.has(err.code);
            if (!retryable || attempt >= maxRetries) throw err;
            // The transaction was aborted entirely and nothing from it
            // persisted, so re-running `fn` from scratch against a fresh
            // BEGIN is safe -- there is no partial state to reconcile.
            // A small jittered pause avoids every loser retrying in the same
            // instant and immediately re-colliding with each other again.
            await sleep(5 + Math.random() * 20);
          }
        }
      } finally {
        release();
      }
    },
  };
}
