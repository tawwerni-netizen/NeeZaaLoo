-- Legal Consent Audit Trail & Support Configuration (Slice 13)
--
-- 1. `legal_policy`: The master registry of legal policies and versions.
-- 2. `legal_consent`: Append-only, immutable record of player consent to specific
--    policy versions, locales, and channels.
-- 3. `platform_support_config`: Admin-configurable support contact channels
--    (phone, email) with fallback defaults.

CREATE TABLE legal_policy (
  identifier   TEXT        PRIMARY KEY,
  version      TEXT        NOT NULL,
  is_mandatory BOOLEAN     NOT NULL DEFAULT TRUE,
  title        TEXT        NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed initial 9 core legal policies
INSERT INTO legal_policy (identifier, version, is_mandatory, title) VALUES
  ('terms_of_service', '1.0.0', TRUE, 'Terms & Conditions'),
  ('privacy_policy', '1.0.0', TRUE, 'Privacy Policy'),
  ('fair_play', '1.0.0', TRUE, 'Fair Play & Anti-Cheat Policy'),
  ('payments_policy', '1.0.0', TRUE, 'Payments & Withdrawals Policy'),
  ('referral_terms', '1.0.0', FALSE, 'Referral Program Terms'),
  ('responsible_play', '1.0.0', TRUE, 'Responsible Play Policy'),
  ('community_rules', '1.0.0', TRUE, 'Community & Chat Rules'),
  ('cookie_policy', '1.0.0', FALSE, 'Cookie & Tracking Policy'),
  ('tournament_rules', '1.0.0', FALSE, 'Tournament Rules Framework')
ON CONFLICT (identifier) DO NOTHING;

CREATE TABLE legal_consent (
  id                TEXT        PRIMARY KEY,
  player_id         TEXT        NOT NULL REFERENCES player(id),
  policy_identifier TEXT        NOT NULL REFERENCES legal_policy(identifier),
  policy_version    TEXT        NOT NULL,
  locale            TEXT        NOT NULL DEFAULT 'en',
  consent_type      TEXT        NOT NULL,
  source            TEXT        NOT NULL,
  accepted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash           TEXT,
  user_agent_hash   TEXT,
  metadata          JSONB       NOT NULL DEFAULT '{}'::jsonb
);

-- Append-only audit integrity: consent cannot be edited or deleted
CREATE TRIGGER legal_consent_immutable
  BEFORE UPDATE OR DELETE ON legal_consent
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE INDEX legal_consent_player_policy_idx
  ON legal_consent (player_id, policy_identifier, policy_version);

CREATE INDEX legal_consent_player_accepted_idx
  ON legal_consent (player_id, accepted_at DESC);

-- Platform support configuration for dynamic support contact channels
CREATE TABLE platform_support_config (
  id          TEXT        PRIMARY KEY DEFAULT 'default',
  phone       TEXT        NOT NULL DEFAULT '+2 01069999557',
  email       TEXT        NOT NULL DEFAULT 'Tawwerni@gmail.com',
  updated_by  TEXT        REFERENCES admin_user(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO platform_support_config (id, phone, email, updated_by, updated_at)
VALUES ('default', '+2 01069999557', 'Tawwerni@gmail.com', NULL, now())
ON CONFLICT (id) DO NOTHING;
