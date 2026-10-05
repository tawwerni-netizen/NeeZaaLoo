/**
 * Every `real-pg-*` test file in this repo (packages/auth, packages/chat,
 * packages/ledger, packages/profile, packages/progression,
 * packages/reconciliation, packages/settlement, packages/support) needs a
 * real, multi-connection PostgreSQL server -- PGlite's single connection
 * cannot produce genuine concurrency. Until now every one of those files
 * pointed at the SAME literal `TEST_DATABASE_URL` database and called
 * `migrate()` against it independently in its own `before()`. `node --test`
 * runs test files as separate concurrent processes, and `npm test
 * --workspaces` runs many packages at once on top of that, so any time a
 * new migration file had not yet been recorded in that one shared
 * database's `schema_migration` table, several of those processes raced to
 * apply/insert it at the same moment -- "duplicate key value violates
 * unique constraint" from inside migrate.mjs, not a real product bug.
 *
 * The fix: give each real-pg test FILE its own throwaway database, created
 * fresh right before that file's suite runs and dropped after. With no
 * shared schema_migration row to race over, the underlying "migrate() isn't
 * safe under concurrent callers" property simply never gets exercised by
 * running the test suite itself.
 */
import pg from "pg";
import { randomUUID } from "node:crypto";

const BASE_URL =
  process.env.TEST_DATABASE_URL || "postgres://postgres:postgres@localhost:5432/skill_platform_test";

function urlWithDatabase(baseUrl, databaseName) {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function baseDatabaseName(baseUrl) {
  const raw = new URL(baseUrl).pathname.slice(1) || "skill_platform_test";
  return raw.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * Creates a uniquely-named database on the same server as TEST_DATABASE_URL
 * (or the default local one) and returns a connection string pointing at
 * it, plus a `drop()` to tear it down. If the server itself isn't reachable
 * (or lacks privilege to create a database), returns `reachable: false`
 * with the same shape every real-pg file already checks before skipping.
 */
export async function provisionRealPgDatabase() {
  const maintenanceUrl = urlWithDatabase(BASE_URL, "postgres");
  const databaseName = `${baseDatabaseName(BASE_URL)}_${randomUUID().replace(/-/g, "")}`;

  let admin;
  try {
    admin = new pg.Client({ connectionString: maintenanceUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    await admin.end();
  } catch (e) {
    try { await admin?.end(); } catch { /* already broken; nothing to clean up */ }
    return {
      reachable: false,
      reachabilityError: e,
      TEST_DATABASE_URL: BASE_URL,
      async drop() {},
    };
  }

  return {
    reachable: true,
    reachabilityError: null,
    TEST_DATABASE_URL: urlWithDatabase(BASE_URL, databaseName),
    async drop() {
      const dropAdmin = new pg.Client({ connectionString: maintenanceUrl });
      await dropAdmin.connect();
      await dropAdmin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      await dropAdmin.end();
    },
  };
}
