-- =============================================================================
-- 0006_admin_rbac_and_controls.sql
--
-- The admin plane: roles, separation of duties, emergency controls, audit.
--
-- Two rules are made structural because they are the ones that fail quietly:
--
--   1. NOBODY approves their own request. Not an admin, not a finance admin,
--      not the super admin. It is a CHECK constraint, so there is no code path
--      -- including a compromised one -- that can skip it.
--   2. A control switch gates future actions and NEVER destroys data. There is
--      no DELETE anywhere in this file.
-- =============================================================================

CREATE TYPE admin_role AS ENUM (
  'SUPER_ADMIN',
  'ADMIN',
  'FINANCE_ADMIN',
  'RISK_ADMIN',
  'ANTI_CHEAT_MODERATOR',
  'CONTENT_MODERATOR',
  'SUPPORT',
  'ANALYST',
  'READ_ONLY'
);

CREATE TABLE admin_user (
  id           TEXT PRIMARY KEY,
  email        TEXT        NOT NULL UNIQUE,
  display_name TEXT        NOT NULL,
  -- Hardware-backed MFA is mandatory for the admin plane. An admin without a
  -- registered authenticator cannot hold an active role; the policy engine
  -- refuses them and this column is what it reads.
  mfa_enrolled BOOLEAN     NOT NULL DEFAULT FALSE,
  disabled_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_role_grant (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id    TEXT       NOT NULL REFERENCES admin_user(id),
  role        admin_role NOT NULL,
  granted_by  TEXT       NOT NULL REFERENCES admin_user(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ,
  revoked_by  TEXT REFERENCES admin_user(id),
  reason      TEXT NOT NULL,

  -- Nobody grants themselves a role.
  CONSTRAINT admin_role_grant_not_self CHECK (admin_id <> granted_by),
  CONSTRAINT admin_role_grant_reason CHECK (length(btrim(reason)) > 0)
);

CREATE UNIQUE INDEX admin_role_grant_active_uniq
  ON admin_role_grant (admin_id, role) WHERE revoked_at IS NULL;

CREATE TRIGGER admin_role_grant_no_delete
  BEFORE DELETE ON admin_role_grant
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

/** Active roles for an admin. Empty for a disabled account. */
CREATE FUNCTION admin_roles(p_admin_id TEXT)
RETURNS TEXT[] LANGUAGE sql STABLE AS $$
  SELECT COALESCE(array_agg(g.role::TEXT ORDER BY g.role::TEXT), ARRAY[]::TEXT[])
    FROM admin_role_grant g
    JOIN admin_user u ON u.id = g.admin_id
   WHERE g.admin_id = p_admin_id
     AND g.revoked_at IS NULL
     AND u.disabled_at IS NULL;
$$;

-- --- Four-eyes approvals -----------------------------------------------------

CREATE TYPE approval_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'EXECUTED');

CREATE TABLE approval_request (
  id            TEXT PRIMARY KEY,
  action        TEXT            NOT NULL,   -- 'withdrawal.approve', 'adjustment.create', ...
  subject_type  TEXT            NOT NULL,   -- 'withdrawal' | 'user' | 'economy_rule'
  subject_id    TEXT            NOT NULL,
  payload       JSONB           NOT NULL DEFAULT '{}'::jsonb,
  requested_by  TEXT            NOT NULL REFERENCES admin_user(id),
  requested_at  TIMESTAMPTZ     NOT NULL DEFAULT now(),
  reason        TEXT            NOT NULL,
  status        approval_status NOT NULL DEFAULT 'PENDING',
  decided_by    TEXT            REFERENCES admin_user(id),
  decided_at    TIMESTAMPTZ,
  decision_note TEXT,
  executed_at   TIMESTAMPTZ,

  -- THE separation-of-duties guarantee. No role, no seniority, no emergency
  -- exempts anyone from it: the requester cannot be the decider.
  CONSTRAINT approval_no_self_approval CHECK (decided_by IS NULL OR decided_by <> requested_by),
  CONSTRAINT approval_decided_has_decider
    CHECK (status = 'PENDING' OR status = 'EXPIRED' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT approval_executed_was_approved
    CHECK (status <> 'EXECUTED' OR executed_at IS NOT NULL),
  CONSTRAINT approval_reason CHECK (length(btrim(reason)) > 0)
);

CREATE INDEX approval_pending_idx ON approval_request (action, requested_at)
  WHERE status = 'PENDING';

CREATE TRIGGER approval_request_no_delete
  BEFORE DELETE ON approval_request
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

-- --- Emergency controls ------------------------------------------------------
--
-- Independent switches, per section 30. Each is separately togglable so that
-- stopping withdrawals does not also stop people playing, and stopping cash
-- matches does not stop free play.

CREATE TABLE platform_control (
  key         TEXT PRIMARY KEY,
  enabled     BOOLEAN     NOT NULL,
  changed_by  TEXT        REFERENCES admin_user(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason      TEXT
);

INSERT INTO platform_control (key, enabled, reason) VALUES
  ('REGISTRATION',     TRUE,  'default'),
  ('MATCHMAKING',      TRUE,  'default'),
  ('CASH_MATCHES',     FALSE, 'off until licensing and compliance are in place'),
  ('TOURNAMENTS',      TRUE,  'default'),
  ('DEPOSITS',         FALSE, 'off until payment integration is production-ready'),
  ('WITHDRAWALS',      FALSE, 'off until payment integration is production-ready'),
  ('PROMOTIONS',       FALSE, 'default'),
  ('REGIONS',          TRUE,  'default'),
  ('MAINTENANCE',      FALSE, 'default: not in maintenance'),
  ('GLOBAL_EMERGENCY', FALSE, 'default: not in emergency');

CREATE TABLE platform_control_change (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key        TEXT        NOT NULL,
  from_value BOOLEAN,
  to_value   BOOLEAN     NOT NULL,
  changed_by TEXT        REFERENCES admin_user(id),
  reason     TEXT        NOT NULL,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER platform_control_change_immutable
  BEFORE UPDATE OR DELETE ON platform_control_change
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

/** Every toggle is recorded. There is no silent flip. */
CREATE FUNCTION platform_control_log() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.enabled IS DISTINCT FROM NEW.enabled THEN
    -- The reason must be FRESH. Requiring merely "not empty" is toothless: an
    -- UPDATE that does not touch the column inherits the previous reason and
    -- sails through, so an operator could flip a switch carrying a note that
    -- described some earlier decision entirely.
    IF NEW.reason IS NULL OR length(btrim(NEW.reason)) = 0
       OR NEW.reason IS NOT DISTINCT FROM OLD.reason THEN
      RAISE EXCEPTION
        'changing control % requires a new reason (the previous one does not carry over)', NEW.key
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.changed_by IS NULL THEN
      RAISE EXCEPTION 'changing control % requires a named actor', NEW.key
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO platform_control_change (key, from_value, to_value, changed_by, reason)
    VALUES (NEW.key, OLD.enabled, NEW.enabled, NEW.changed_by, NEW.reason);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER platform_control_audit
  BEFORE UPDATE ON platform_control
  FOR EACH ROW EXECUTE FUNCTION platform_control_log();

/**
 * Is this capability currently live?
 *
 * GLOBAL_EMERGENCY dominates everything except MAINTENANCE reporting -- a
 * single switch has to be able to stop the world without an operator needing
 * to remember ten others under pressure.
 */
CREATE FUNCTION control_enabled(p_key TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_key = 'GLOBAL_EMERGENCY'
      THEN (SELECT enabled FROM platform_control WHERE key = 'GLOBAL_EMERGENCY')
    WHEN (SELECT enabled FROM platform_control WHERE key = 'GLOBAL_EMERGENCY')
      THEN FALSE
    ELSE COALESCE((SELECT enabled FROM platform_control WHERE key = p_key), FALSE)
  END;
$$;

-- --- Admin audit -------------------------------------------------------------

CREATE TABLE admin_audit (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id   TEXT        REFERENCES admin_user(id),
  action     TEXT        NOT NULL,
  decision   TEXT        NOT NULL,        -- ALLOW | DENY | REQUIRE_APPROVAL | REQUIRE_STEP_UP
  subject_type TEXT,
  subject_id TEXT,
  detail     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  ip         TEXT,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER admin_audit_immutable
  BEFORE UPDATE OR DELETE ON admin_audit
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE INDEX admin_audit_admin_idx ON admin_audit (admin_id, at DESC);
CREATE INDEX admin_audit_action_idx ON admin_audit (action, at DESC);
