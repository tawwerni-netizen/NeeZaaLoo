/**
 * Legal Consent and Support Configuration Service.
 *
 * Enforces versioned, immutable legal consent tracking and dynamic support contacts.
 */
import { randomUUID, createHash } from "node:crypto";

export const ConsentError = Object.freeze({
  POLICY_NOT_FOUND: "POLICY_NOT_FOUND",
  ALREADY_ACCEPTED: "ALREADY_ACCEPTED",
  TERMS_ACCEPTANCE_REQUIRED: "TERMS_ACCEPTANCE_REQUIRED",
  INVALID_VERSION: "INVALID_VERSION",
  INVALID_LOCALE: "INVALID_LOCALE",
});

const sha256 = (s) => (s ? createHash("sha256").update(String(s)).digest("hex") : null);

export function createConsentService(db, { now = () => Date.now() } = {}) {
  return {
    async getAllPolicies() {
      const r = await db.query(
        "SELECT identifier, version, is_mandatory, title, effective_at, updated_at FROM legal_policy ORDER BY identifier"
      );
      return r.rows;
    },

    async getPolicy(identifier) {
      const r = await db.query(
        "SELECT identifier, version, is_mandatory, title, effective_at, updated_at FROM legal_policy WHERE identifier = $1",
        [identifier]
      );
      return r.rows[0] ?? null;
    },

    async getPlayerConsentStatus(playerId) {
      const policies = await db.query(
        "SELECT identifier, version, is_mandatory, title FROM legal_policy WHERE is_mandatory = TRUE ORDER BY identifier"
      );

      const consents = await db.query(
        `SELECT policy_identifier, policy_version, accepted_at, locale, source
           FROM legal_consent
          WHERE player_id = $1`,
        [playerId]
      );

      const acceptedMap = new Map();
      for (const c of consents.rows) {
        acceptedMap.set(`${c.policy_identifier}:${c.policy_version}`, c);
      }

      const pending = [];
      for (const p of policies.rows) {
        const key = `${p.identifier}:${p.version}`;
        if (!acceptedMap.has(key)) {
          pending.push({
            identifier: p.identifier,
            version: p.version,
            title: p.title,
            isMandatory: p.is_mandatory,
          });
        }
      }

      return {
        allAccepted: pending.length === 0,
        pending,
        consents: consents.rows,
      };
    },

    async recordConsent({
      playerId,
      policyIdentifier,
      policyVersion,
      locale = "en",
      consentType = "TERMS_AND_CONDITIONS",
      source = "WEB_REGISTRATION",
      metadata = {},
      ip = null,
      userAgent = null,
    }, txOrDb = db) {
      const policy = await txOrDb.query(
        "SELECT identifier, version, is_mandatory FROM legal_policy WHERE identifier = $1",
        [policyIdentifier]
      );
      if (!policy.rows.length) {
        return { ok: false, reason: ConsentError.POLICY_NOT_FOUND };
      }

      const versionToRecord = policyVersion || policy.rows[0].version;
      const id = `lcn_${randomUUID()}`;
      const t = new Date(now()).toISOString();

      await txOrDb.query(
        `INSERT INTO legal_consent
           (id, player_id, policy_identifier, policy_version, locale, consent_type, source, accepted_at, ip_hash, user_agent_hash, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
        [
          id,
          playerId,
          policyIdentifier,
          versionToRecord,
          locale,
          consentType,
          source,
          t,
          sha256(ip),
          sha256(userAgent),
          JSON.stringify(metadata),
        ]
      );

      return { ok: true, consentId: id, policyIdentifier, policyVersion: versionToRecord, acceptedAt: t };
    },

    async updatePolicyVersion({ policyIdentifier, newVersion, title, isMandatory }, adminId = null) {
      const t = new Date(now()).toISOString();
      const r = await db.query(
        `UPDATE legal_policy
            SET version = COALESCE($2, version),
                title = COALESCE($3, title),
                is_mandatory = COALESCE($4, is_mandatory),
                updated_at = $5,
                effective_at = $5
          WHERE identifier = $1
          RETURNING *`,
        [policyIdentifier, newVersion, title, isMandatory, t]
      );
      if (!r.rows.length) return { ok: false, reason: ConsentError.POLICY_NOT_FOUND };
      return { ok: true, policy: r.rows[0] };
    },

    async getSupportConfig() {
      const r = await db.query("SELECT phone, email, updated_at FROM platform_support_config WHERE id = 'default'");
      if (!r.rows.length) {
        return { phone: "+2 01069999557", email: "support@Nizalo.com", updatedAt: new Date(now()).toISOString() };
      }
      return r.rows[0];
    },

    async updateSupportConfig({ phone, email }, adminId = null) {
      const t = new Date(now()).toISOString();
      const r = await db.query(
        `INSERT INTO platform_support_config (id, phone, email, updated_by, updated_at)
         VALUES ('default', $1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
           SET phone = EXCLUDED.phone,
               email = EXCLUDED.email,
               updated_by = EXCLUDED.updated_by,
               updated_at = EXCLUDED.updated_at
         RETURNING phone, email, updated_at`,
        [phone, email, adminId, t]
      );
      return { ok: true, config: r.rows[0] };
    },
  };
}
