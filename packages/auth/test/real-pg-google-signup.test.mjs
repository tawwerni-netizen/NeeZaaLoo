/**
 * Real PostgreSQL, multiple independent connections -- see
 * real-pg-email-challenge.test.mjs's own header for why this matters and
 * PGlite (single connection) cannot substitute for it.
 *
 * google-oauth.mjs's createPlayerForGoogleSignup() is meant to be race-safe
 * against two genuinely concurrent first-time logins for the SAME Google
 * subject (two tabs, a double-click, a retried request): the
 * oauth_identity_unique_subject constraint makes one of the two INSERTs
 * fail, and the loser is supposed to discover and return the WINNER's
 * player id rather than erroring out or creating a duplicate account. This
 * is the direct evidence that guarantee holds under real concurrency, not
 * just PGlite's single-connection serialization (which cannot exhibit the
 * race in the first place).
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createPgAdapter } from "../../ledger/src/pg-adapter.mjs";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../src/service.mjs";
import { createEmailIdentityService } from "../src/email-identity.mjs";
import { createOAuthIdentityService } from "../src/oauth-identity.mjs";
import { createOAuthHandoffService } from "../src/oauth-handoff.mjs";
import { createMockGoogleProvider } from "../src/google-provider.mjs";
import { createGoogleOAuthFlow } from "../src/google-oauth.mjs";
import { issueOAuthState } from "../src/tokens.mjs";

const { Client } = pg;

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || "postgres://postgres:postgres@localhost:5432/skill_platform_test";

const SIGNING_KEY = Buffer.alloc(32, 13);
const ENCRYPTION_KEY = Buffer.alloc(32, 14);
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

async function connection(sharedGoogleProvider) {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  const db = createPgAdapter(client);
  const auth = createAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: FAST_ARGON });
  const emailIdentity = createEmailIdentityService(db);
  const oauthIdentity = createOAuthIdentityService(db);
  const oauthHandoff = createOAuthHandoffService(db);
  const flow = createGoogleOAuthFlow(db, {
    googleProvider: sharedGoogleProvider, oauthIdentity, oauthHandoff, emailIdentity, auth,
    signingKey: SIGNING_KEY, allowedReturnPaths: [],
  });
  return { client, flow, oauthIdentity };
}

describe(
  "google-oauth.mjs createPlayerForGoogleSignup() under real concurrent first-time signup",
  { skip: reachable ? false : `Postgres not reachable at ${TEST_DATABASE_URL}: ${reachabilityError?.message}` },
  () => {
    let admin;

    before(async () => {
      admin = new Client({ connectionString: TEST_DATABASE_URL });
      await admin.connect();
      await migrate(createPgAdapter(admin));
    });

    after(async () => { await admin.end(); });

    test("two simultaneous first-time logins for the SAME Google subject create exactly one player", async () => {
      const subject = `sub-race-${randomUUID()}`;
      // A single mock provider instance shared across both connections'
      // flows -- both "callbacks" present a token that validates to the
      // SAME subject, exactly like two tabs completing the same real
      // Google login around the same instant.
      const google = createMockGoogleProvider();
      const idTokenA = google.registerIdentity({ subject, email: `${subject}@example.com`, emailVerified: true });
      const idTokenB = google.registerIdentity({ subject, email: `${subject}@example.com`, emailVerified: true });

      const A = await connection(google);
      const B = await connection(google);

      const stateA = issueOAuthState({ intent: "login", provider: "google" }, SIGNING_KEY, Date.now());
      const stateB = issueOAuthState({ intent: "login", provider: "google" }, SIGNING_KEY, Date.now());

      const [ra, rb] = await Promise.all([
        A.flow.handleCallback({ code: idTokenA, state: stateA }),
        B.flow.handleCallback({ code: idTokenB, state: stateB }),
      ]);
      assert.equal(ra.ok, true);
      assert.equal(rb.ok, true);

      const sessionA = await A.flow.finalize({ handoffCode: ra.handoffCode });
      const sessionB = await B.flow.finalize({ handoffCode: rb.handoffCode });
      assert.equal(sessionA.ok, true);
      assert.equal(sessionB.ok, true);

      assert.equal(sessionA.playerId, sessionB.playerId, "both concurrent logins must resolve to the SAME player");

      const players = await admin.query(
        "SELECT count(*)::int AS n FROM oauth_identity WHERE provider = 'google' AND provider_subject = $1", [subject]
      );
      assert.equal(players.rows[0].n, 1, "exactly one oauth_identity row, never two");

      await Promise.all([A.client.end(), B.client.end()]);
    });
  }
);
