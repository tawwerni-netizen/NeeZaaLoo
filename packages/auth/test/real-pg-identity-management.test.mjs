/**
 * Real PostgreSQL, multiple independent connections -- see
 * real-pg-email-challenge.test.mjs's own header for why this matters and
 * PGlite (single connection) cannot substitute for it.
 *
 * Slice 6 adds authenticated identity management (link/unlink an existing
 * Google identity, bootstrap a first password) on top of Slice 5's
 * login/signup flow. This file is the direct evidence that each of those
 * operations is race-safe under genuine concurrency, exactly the same
 * discipline already proven for email_challenge.verify() and
 * password-reset's confirm(): a database UNIQUE constraint plus
 * application code that gracefully interprets losing that race, not a
 * held lock or a check-then-act promise.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createPgAdapter } from "../../ledger/src/pg-adapter.mjs";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../src/service.mjs";
import { createOAuthIdentityService } from "../src/oauth-identity.mjs";

const { Client } = pg;

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || "postgres://postgres:postgres@localhost:5432/skill_platform_test";

const SIGNING_KEY = Buffer.alloc(32, 41);
const ENCRYPTION_KEY = Buffer.alloc(32, 42);
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };

let reachable = true;
let reachabilityError = null;
try {
  const probe = new Client({ connectionString: TEST_DATABASE_URL });
  await probe.connect();
  await probe.query("SELECT 1");
  await probe.end();
} catch (e) {
  reachable = false;
  reachabilityError = e;
}

async function connection() {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  const db = createPgAdapter(client);
  return {
    client, db,
    auth: createAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: FAST_ARGON }),
    oauthIdentity: createOAuthIdentityService(db),
  };
}

describe(
  "Slice 6 identity management under real concurrent access",
  { skip: reachable ? false : `Postgres not reachable at ${TEST_DATABASE_URL}: ${reachabilityError?.message}` },
  () => {
    let admin;

    before(async () => {
      admin = await connection();
      await migrate(admin.db);
    });

    after(async () => { await admin.client.end(); });

    test("two DIFFERENT players simultaneously linking the SAME Google subject: exactly one wins", async () => {
      const subject = `sub-race-${randomUUID()}`;
      const playerA = `pa${randomUUID().replace(/-/g, "").slice(0, 14)}`;
      const playerB = `pb${randomUUID().replace(/-/g, "").slice(0, 14)}`;
      await admin.client.query("INSERT INTO player (id, handle) VALUES ($1,$1),($2,$2)", [playerA, playerB]);

      const A = await connection();
      const B = await connection();
      const [ra, rb] = await Promise.all([
        A.oauthIdentity.link({ playerId: playerA, provider: "google", subject }),
        B.oauthIdentity.link({ playerId: playerB, provider: "google", subject }),
      ]);

      const results = [ra, rb];
      const succeeded = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);
      assert.equal(succeeded.length, 1, `expected exactly one success, got ${JSON.stringify(results)}`);
      assert.equal(failed.length, 1);
      assert.equal(failed[0].reason, "SUBJECT_ALREADY_LINKED");

      const rows = await admin.client.query(
        "SELECT player_id FROM oauth_identity WHERE provider = 'google' AND provider_subject = $1", [subject]
      );
      assert.equal(rows.rows.length, 1, "no duplicate oauth_identity row");
      assert.ok([playerA, playerB].includes(rows.rows[0].player_id));

      await Promise.all([A.client.end(), B.client.end()]);
    });

    test("the SAME player retrying an identical link concurrently (double-click) never creates a duplicate row", async () => {
      const subject = `sub-retry-${randomUUID()}`;
      const playerId = `pr${randomUUID().replace(/-/g, "").slice(0, 14)}`;
      await admin.client.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [playerId]);

      const A = await connection();
      const B = await connection();
      const [ra, rb] = await Promise.all([
        A.oauthIdentity.link({ playerId, provider: "google", subject }),
        B.oauthIdentity.link({ playerId, provider: "google", subject }),
      ]);
      assert.ok(ra.ok && rb.ok, `both attempts by the SAME player for the SAME subject must succeed (idempotent), got ${JSON.stringify([ra, rb])}`);

      const rows = await admin.client.query(
        "SELECT count(*)::int AS n FROM oauth_identity WHERE provider = 'google' AND provider_subject = $1", [subject]
      );
      assert.equal(rows.rows[0].n, 1);

      await Promise.all([A.client.end(), B.client.end()]);
    });

    test("two simultaneous unlink requests for the same player: exactly one reports a real removal", async () => {
      const playerId = `pu${randomUUID().replace(/-/g, "").slice(0, 14)}`;
      await admin.client.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [playerId]);
      await admin.oauthIdentity.link({ playerId, provider: "google", subject: `sub-unlink-${randomUUID()}` });

      const A = await connection();
      const B = await connection();
      const [ra, rb] = await Promise.all([
        A.oauthIdentity.unlink(playerId, "google"),
        B.oauthIdentity.unlink(playerId, "google"),
      ]);
      const succeeded = [ra, rb].filter((r) => r.ok);
      const failed = [ra, rb].filter((r) => !r.ok);
      assert.equal(succeeded.length, 1, `expected exactly one real removal, got ${JSON.stringify([ra, rb])}`);
      assert.equal(failed[0].reason, "NOT_LINKED");

      const remaining = await admin.client.query("SELECT count(*)::int AS n FROM oauth_identity WHERE player_id = $1", [playerId]);
      assert.equal(remaining.rows[0].n, 0);

      await Promise.all([A.client.end(), B.client.end()]);
    });

    test("password initialization race: two simultaneous setInitialPassword calls for the SAME (Google-only) player -- exactly one succeeds, exactly one password lands", async () => {
      const playerId = `pp${randomUUID().replace(/-/g, "").slice(0, 14)}`;
      await admin.client.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [playerId]);
      await admin.oauthIdentity.link({ playerId, provider: "google", subject: `sub-pwinit-${randomUUID()}` });

      const A = await connection();
      const B = await connection();
      const [ra, rb] = await Promise.all([
        A.auth.setInitialPassword({ playerId, newPassword: "first candidate passphrase here" }),
        B.auth.setInitialPassword({ playerId, newPassword: "second candidate passphrase here" }),
      ]);
      const succeeded = [ra, rb].filter((r) => r.ok);
      const failed = [ra, rb].filter((r) => !r.ok);
      assert.equal(succeeded.length, 1, `expected exactly one success, got ${JSON.stringify([ra, rb])}`);
      assert.equal(failed[0].reason, "CREDENTIAL_ALREADY_SET");

      const rows = await admin.client.query("SELECT count(*)::int AS n FROM credential WHERE player_id = $1", [playerId]);
      assert.equal(rows.rows[0].n, 1, "exactly one credential row, never two, never zero");

      const winnerPassword = ra.ok ? "first candidate passphrase here" : "second candidate passphrase here";
      const loserPassword = ra.ok ? "second candidate passphrase here" : "first candidate passphrase here";
      const verify = await connection();
      const winnerLogin = await verify.auth.login({ identifier: playerId, password: winnerPassword });
      const loserLogin = await verify.auth.login({ identifier: playerId, password: loserPassword });
      assert.equal(winnerLogin.ok, true, "the password belonging to whichever call actually won must work");
      assert.equal(loserLogin.ok, false, "the losing call's password must never have been applied");

      await Promise.all([A.client.end(), B.client.end(), verify.client.end()]);
    });
  }
);
