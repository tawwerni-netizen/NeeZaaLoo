/**
 * Real PostgreSQL, multiple independent connections -- one level up from
 * real-pg-email-challenge.test.mjs. That file proves the shared
 * email_challenge.verify() mechanism admits exactly one winner under real
 * concurrency; this file proves the guarantee actually survives being
 * wrapped by password-reset.mjs's confirm(), which does more than consume
 * a challenge -- it also mutates the credential row and revokes sessions.
 * A bug introduced between challenge-consumption and password-mutation
 * (e.g. re-reading player state outside the same transaction) could in
 * principle let two concurrent confirm() calls both believe they won even
 * though only one challenge consumption can succeed. This is the direct
 * evidence that isn't the case.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createPgAdapter } from "../../ledger/src/pg-adapter.mjs";
import { migrate } from "../../ledger/src/migrate.mjs";
import { provisionRealPgDatabase } from "../../ledger/test-support/real-pg-db.mjs";
import { createAuthService } from "../src/service.mjs";
import { createEmailIdentityService } from "../src/email-identity.mjs";
import { createEmailChallengeService } from "../src/email-challenge.mjs";
import { createPasswordResetFlow } from "../src/password-reset.mjs";
import { createMockEmailProvider } from "../../email/src/provider.mjs";
import { createEmailService } from "../../email/src/email-service.mjs";

const { Client } = pg;

const { reachable, reachabilityError, TEST_DATABASE_URL, drop } = await provisionRealPgDatabase();

const SIGNING_KEY = Buffer.alloc(32, 5);
const ENCRYPTION_KEY = Buffer.alloc(32, 6);
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };
const OLD_PASSWORD = "correct horse battery staple";

async function connection() {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  const db = createPgAdapter(client);
  const provider = createMockEmailProvider();
  const auth = createAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: FAST_ARGON });
  const identity = createEmailIdentityService(db);
  const challenge = createEmailChallengeService(db);
  const emailService = createEmailService({ provider });
  const reset = createPasswordResetFlow(db, { emailChallenge: challenge, emailIdentity: identity, emailService, auth });
  return { client, db, auth, identity, challenge, provider, reset };
}

function extractCode(provider) {
  const sent = provider.sent.find((m) => m.template === "password_reset");
  return sent.text.match(/\n([A-Z2-9]{10})\n/)[1];
}

describe(
  "password-reset.mjs confirm() under real concurrent consumption",
  { skip: reachable ? false : `Postgres not reachable at ${TEST_DATABASE_URL}: ${reachabilityError?.message}` },
  () => {
    let admin;

    before(async () => {
      admin = await connection();
      await migrate(admin.db);
    });

    after(async () => { await admin.client.end(); await drop(); });

    test("exactly one of two simultaneous confirm() calls succeeds, and the password changes exactly once", async () => {
      const playerId = `r${randomUUID().replace(/-/g, "").slice(0, 15)}`;
      const email = `${playerId}@example.com`;

      const setup = await connection();
      await setup.auth.register({ playerId, handle: playerId, password: OLD_PASSWORD });
      await setup.identity.setEmail(playerId, email);
      await setup.reset.request(email);
      const code = extractCode(setup.provider);
      await setup.client.end();

      const A = await connection();
      const B = await connection();

      const [ra, rb] = await Promise.all([
        A.reset.confirm({ email, code, newPassword: "first new passphrase here" }),
        B.reset.confirm({ email, code, newPassword: "second new passphrase here" }),
      ]);

      const succeeded = [ra, rb].filter((r) => r.ok);
      assert.equal(succeeded.length, 1, `expected exactly one success, got ${JSON.stringify([ra, rb])}`);

      const row = await admin.client.query("SELECT password_hash FROM credential WHERE player_id = $1", [playerId]);
      assert.equal(row.rows.length, 1);

      // Exactly one of the two candidate new passwords must now work, and
      // the OTHER candidate must NOT -- proving only one mutation landed,
      // not a last-write-wins double mutation that happens to look single.
      const winnerPassword = ra.ok ? "first new passphrase here" : "second new passphrase here";
      const loserPassword = ra.ok ? "second new passphrase here" : "first new passphrase here";

      const verify = await connection();
      const winnerLogin = await verify.auth.login({ identifier: playerId, password: winnerPassword });
      const loserLogin = await verify.auth.login({ identifier: playerId, password: loserPassword });
      const oldLogin = await verify.auth.login({ identifier: playerId, password: OLD_PASSWORD });
      await verify.client.end();

      assert.equal(winnerLogin.ok, true, "the password belonging to whichever confirm() call actually won must work");
      assert.equal(loserLogin.ok, false, "the losing call's password must NOT have been applied");
      assert.equal(oldLogin.ok, false, "the original password must no longer work either way");

      await Promise.all([A.client.end(), B.client.end()]);
    });
  }
);
