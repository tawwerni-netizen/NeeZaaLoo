-- Custom admin roles and granular permissions -- a SEPARATE, additive layer
-- from the existing fixed role/capability grid (packages/authz/src/policy.mjs
-- ROLE_CAPABILITIES, admin_role_grant). That grid is a deliberate design
-- choice documented in policy.mjs: capabilities are code, reviewed by a
-- human in a PR, not runtime-editable, specifically for the actions that
-- move money or decide risk/fairplay cases. Nothing here changes that.
--
-- What this migration adds is admin-UI-manageable roles for domains that do
-- NOT yet have any real enforcement point at all -- support tickets, chat
-- moderation, game-catalog management (see the seed data below). A permission
-- code is only ever added here once its real route exists and actually
-- checks it; until then granting one has no effect, and that is intentional
-- rather than a gap to "finish later" silently. Nothing that already has a
-- working capability (withdrawals, adjustments, tournaments, reconciliation,
-- user restriction, analytics, audit) gets a shadow permission here -- that
-- would let an operator believe a custom role controls money movement when
-- the real route still checks the old, hardcoded capability.

CREATE TABLE permission (
  code        TEXT PRIMARY KEY,
  category    TEXT NOT NULL,
  description TEXT NOT NULL,
  CONSTRAINT permission_code_shape CHECK (code ~ '^[A-Z][A-Z0-9_]*$')
);

CREATE TABLE role (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  -- A system role is seeded, not admin-created, and cannot be edited or
  -- deleted through the API -- reserved for roles the platform itself
  -- depends on existing (none yet in this migration; the flag exists so
  -- Phase 2+ can seed one without a schema change).
  is_system   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by  TEXT        NOT NULL REFERENCES admin_user(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE role_permission (
  role_id         TEXT NOT NULL REFERENCES role(id) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES permission(code),
  PRIMARY KEY (role_id, permission_code)
);

-- Deliberately its own table, not a row in admin_role_grant: that table's
-- `role` column is the fixed `admin_role` enum (SUPER_ADMIN, FINANCE_ADMIN,
-- ...), and mixing a free-text custom role id into the same column would
-- make it possible to accidentally query "does this admin hold ADMIN"
-- against a custom role row, or vice versa.
CREATE TABLE admin_custom_role_grant (
  admin_id   TEXT        NOT NULL REFERENCES admin_user(id),
  role_id    TEXT        NOT NULL REFERENCES role(id) ON DELETE CASCADE,
  granted_by TEXT        NOT NULL REFERENCES admin_user(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_custom_role_grant_not_self CHECK (admin_id <> granted_by),
  PRIMARY KEY (admin_id, role_id)
);

INSERT INTO permission (code, category, description) VALUES
  ('TICKET_VIEW',        'support', 'View support tickets'),
  ('TICKET_REPLY',       'support', 'Reply to a support ticket'),
  ('TICKET_ASSIGN',      'support', 'Assign a ticket to a staff member'),
  ('TICKET_ESCALATE',    'support', 'Escalate a ticket to another team'),
  ('TICKET_CLOSE',       'support', 'Resolve or close a ticket'),
  ('CHAT_MODERATE',      'chat',    'Delete messages and mute users in chat'),
  ('CHAT_DELETE',        'chat',    'Delete an individual chat message'),
  ('CHAT_MUTE',          'chat',    'Temporarily mute a user in chat'),
  ('CHAT_REPORT_REVIEW', 'chat',    'Review chat abuse reports'),
  ('GAME_MANAGE',        'game',    'Manage game catalog configuration'),
  ('GAME_PAUSE',         'game',    'Pause or resume a game');
