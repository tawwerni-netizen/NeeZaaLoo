/**
 * Legal Consent and Platform Support Config Test Suite.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createConsentService, ConsentError } from "../src/consent.mjs";
import { createAuthService, AuthError } from "../../auth/src/service.mjs";

const SIGNING_KEY = "01234567890123456789012345678901";
const ENCRYPTION_KEY = Buffer.alloc(32, 7);

async function fresh() {
  const db = await PGlite.create();
  await migrate(db);
  const consent = createConsentService(db);
  const auth = createAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY });
  return { db, consent, auth };
}

describe("Legal Policies and Consent", () => {
  test("seeds all 9 core legal policies on initialization", async () => {
    const { consent } = await fresh();
    const policies = await consent.getAllPolicies();
    assert.equal(policies.length >= 9, true);

    const ids = policies.map((p) => p.identifier);
    assert.ok(ids.includes("terms_of_service"));
    assert.ok(ids.includes("privacy_policy"));
    assert.ok(ids.includes("fair_play"));
    assert.ok(ids.includes("payments_policy"));
    assert.ok(ids.includes("referral_terms"));
    assert.ok(ids.includes("responsible_play"));
    assert.ok(ids.includes("community_rules"));
    assert.ok(ids.includes("cookie_policy"));
    assert.ok(ids.includes("tournament_rules"));
  });

  test("registration without terms acceptance is refused", async () => {
    const { auth } = await fresh();
    const res = await auth.register({
      playerId: "p1",
      handle: "alice",
      password: "CorrectHorseBattery99!",
      termsAccepted: false,
    });
    assert.equal(res.ok, false);
    assert.equal(res.reason, AuthError.TERMS_ACCEPTANCE_REQUIRED);
  });

  test("registration with terms acceptance records immutable legal_consent", async () => {
    const { db, auth, consent } = await fresh();
    const res = await auth.register({
      playerId: "p1",
      handle: "alice",
      password: "CorrectHorseBattery99!",
      termsAccepted: true,
      locale: "ar",
      policyVersion: "1.0.0",
    }, { ip: "1.2.3.4", userAgent: "Mozilla/5.0" });

    assert.equal(res.ok, true);

    const consents = await db.query("SELECT * FROM legal_consent WHERE player_id = $1", ["p1"]);
    assert.equal(consents.rows.length, 1);
    assert.equal(consents.rows[0].policy_identifier, "terms_of_service");
    assert.equal(consents.rows[0].policy_version, "1.0.0");
    assert.equal(consents.rows[0].locale, "ar");
    assert.equal(consents.rows[0].source, "WEB_REGISTRATION");
    assert.ok(consents.rows[0].ip_hash);
    assert.ok(consents.rows[0].user_agent_hash);

    // Verify immutability
    await assert.rejects(
      async () => db.query("DELETE FROM legal_consent WHERE player_id = $1", ["p1"]),
      /append-only|forbidden/i
    );
  });

  test("material policy changes prompt re-acceptance", async () => {
    const { auth, consent } = await fresh();
    await auth.register({
      playerId: "p1",
      handle: "alice",
      password: "CorrectHorseBattery99!",
      termsAccepted: true,
      locale: "en",
      policyVersion: "1.0.0",
    });

    // Accept other mandatory policies
    await consent.recordConsent({ playerId: "p1", policyIdentifier: "privacy_policy", policyVersion: "1.0.0" });
    await consent.recordConsent({ playerId: "p1", policyIdentifier: "fair_play", policyVersion: "1.0.0" });
    await consent.recordConsent({ playerId: "p1", policyIdentifier: "payments_policy", policyVersion: "1.0.0" });
    await consent.recordConsent({ playerId: "p1", policyIdentifier: "responsible_play", policyVersion: "1.0.0" });
    await consent.recordConsent({ playerId: "p1", policyIdentifier: "community_rules", policyVersion: "1.0.0" });

    let status = await consent.getPlayerConsentStatus("p1");
    assert.equal(status.allAccepted, true);
    assert.equal(status.pending.length, 0);

    // Material update: bump terms_of_service to 1.1.0
    await consent.updatePolicyVersion({ policyIdentifier: "terms_of_service", newVersion: "1.1.0" });

    status = await consent.getPlayerConsentStatus("p1");
    assert.equal(status.allAccepted, false);
    assert.equal(status.pending.length, 1);
    assert.equal(status.pending[0].identifier, "terms_of_service");
    assert.equal(status.pending[0].version, "1.1.0");

    // Player accepts the new version via modal
    const accepted = await consent.recordConsent({
      playerId: "p1",
      policyIdentifier: "terms_of_service",
      policyVersion: "1.1.0",
      source: "REACCEPTANCE_MODAL",
      locale: "en",
    });
    assert.equal(accepted.ok, true);

    status = await consent.getPlayerConsentStatus("p1");
    assert.equal(status.allAccepted, true);
    assert.equal(status.pending.length, 0);
  });

  test("support contacts configuration can be fetched and updated", async () => {
    const { consent } = await fresh();
    const initial = await consent.getSupportConfig();
    assert.equal(initial.phone, "+2 01069999557");
    assert.equal(initial.email, "Tawwerni@gmail.com");

    const updated = await consent.updateSupportConfig({
      phone: "+1 800 555 0199",
      email: "support@nizalo.com",
    }, null);

    assert.equal(updated.ok, true);
    assert.equal(updated.config.phone, "+1 800 555 0199");
    assert.equal(updated.config.email, "support@nizalo.com");

    const current = await consent.getSupportConfig();
    assert.equal(current.phone, "+1 800 555 0199");
    assert.equal(current.email, "support@nizalo.com");
  });
});
