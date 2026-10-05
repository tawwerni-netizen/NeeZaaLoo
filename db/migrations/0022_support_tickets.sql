-- Customer Support / Ticket System (Slice 8). Named `support_ticket*`
-- throughout, not bare `ticket*` -- migration 0003 already defines a
-- `ticket_status` enum for the UNRELATED matchmaking-queue concept
-- (`matchmaking_ticket`), and even where a bare name would not collide
-- outright, sitting a support ticket next to a matchmaking ticket under
-- the same short name would be confusing for the next person reading
-- this schema.
--
-- RBAC note: TICKET_VIEW/REPLY/ASSIGN/ESCALATE/CLOSE already exist as
-- `permission` rows (migration 0015) -- inert until now. This slice makes
-- them real by having identify() (packages/api/src/server.mjs) merge an
-- admin's effective custom-RBAC permissions into their capability set,
-- so the EXISTING authorize() pipeline gates the new ticket actions
-- (declared in policy.mjs's own ACTIONS grid, same as every other admin
-- route) with zero changes to authorize() itself and no second
-- authorization model.
--
-- Audit note: ticket state changes made by staff are recorded through the
-- EXISTING admin_audit table (every admin route already writes there
-- automatically); ticket actions taken by the customer (creating a
-- ticket, sending a message) are recorded through the EXISTING
-- security_event table. No new audit table.
--
-- "Team" is modelled as a plain routing/filter label on the ticket, not a
-- membership table: TICKET_VIEW is a blanket read capability (consistent
-- with every other admin read surface in this codebase -- admin.user.read,
-- admin.reconciliation.read, none of which partition data per-admin
-- either). Escalating a ticket changes its team; it does not grant or
-- revoke anyone's access.

CREATE TYPE support_ticket_category AS ENUM (
  'ACCOUNT', 'LOGIN', 'PASSWORD', 'DEPOSIT_PENDING', 'WITHDRAWAL_PENDING', 'WITHDRAWAL_FAILED',
  'MISSING_FUNDS', 'MATCH_PROBLEM', 'TOURNAMENT_PROBLEM', 'ANTI_CHEAT', 'TECHNICAL', 'ABUSE_REPORT', 'OTHER'
);

CREATE TYPE support_ticket_status AS ENUM (
  'OPEN', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_USER', 'ESCALATED', 'RESOLVED', 'CLOSED'
);

CREATE TYPE support_ticket_priority AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

CREATE TYPE support_ticket_team AS ENUM ('CUSTOMER_SUPPORT', 'FINANCE', 'TECHNICAL', 'RISK', 'MODERATION', 'TOURNAMENTS');

CREATE TABLE support_ticket (
  id             TEXT                    PRIMARY KEY,
  player_id      TEXT                    NOT NULL REFERENCES player(id),
  category       support_ticket_category NOT NULL,
  status         support_ticket_status   NOT NULL DEFAULT 'OPEN',
  priority       support_ticket_priority NOT NULL DEFAULT 'NORMAL',
  team           support_ticket_team     NOT NULL DEFAULT 'CUSTOMER_SUPPORT',
  -- A specific named agent, distinct from `team` (the current queue this
  -- ticket sits in). admin_user.id shares player.id's id space (see
  -- packages/api/src/server.mjs's identify()), so this FK is correct for
  -- a staff member exactly the way support_ticket_message.author_id is below.
  assignee_id    TEXT                    REFERENCES admin_user(id),
  assigned_by    TEXT                    REFERENCES admin_user(id),
  assigned_at    TIMESTAMPTZ,
  subject        TEXT                    NOT NULL,
  -- A loose reference, never a hard FK -- same pattern as
  -- reconciliation_case.subject_type/subject_id (migration 0013): a
  -- ticket must be able to keep naming a deposit/withdrawal/duel/
  -- tournament pairing without being deleted if that row's lifecycle
  -- outlives or is purged before the ticket's own.
  reference_type TEXT                    CHECK (reference_type IN ('DEPOSIT', 'WITHDRAWAL', 'DUEL', 'TOURNAMENT_PAIRING')),
  reference_id   TEXT,
  -- A SNAPSHOT of trusted internal references at creation time (ids,
  -- status, asset/network, amounts) -- directive #5's "store references,
  -- do NOT duplicate entire payment/withdrawal/match objects": this is
  -- deliberately a small set of ids/enums/status strings, never a copy of
  -- KYC, risk signals, or provider credentials.
  context        JSONB                   NOT NULL DEFAULT '{}'::jsonb,
  -- Set only when `reference_type`/`reference_id` are both present --
  -- what the open-ticket-dedupe constraint below keys on.
  dedupe_key     TEXT,
  created_at     TIMESTAMPTZ             NOT NULL,
  updated_at     TIMESTAMPTZ             NOT NULL,
  resolved_at    TIMESTAMPTZ,
  closed_at      TIMESTAMPTZ,

  CONSTRAINT support_ticket_subject_length CHECK (char_length(subject) BETWEEN 1 AND 200),
  CONSTRAINT support_ticket_reference_pair CHECK (
    (reference_type IS NULL) = (reference_id IS NULL)
  )
);

-- Directive #24: the SAME player cannot have two simultaneously-OPEN
-- tickets for the SAME reference (e.g. "Withdrawal #123 still pending"
-- submitted twice) -- a real database constraint, not just a UI check,
-- proven race-safe under real concurrency the same way
-- security_event_welcome_once and email_challenge_active_idx already are.
CREATE UNIQUE INDEX support_ticket_open_dedupe_idx ON support_ticket (player_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status NOT IN ('RESOLVED', 'CLOSED');

CREATE INDEX support_ticket_player_idx ON support_ticket (player_id, created_at DESC);
CREATE INDEX support_ticket_queue_idx ON support_ticket (status, team, priority, created_at DESC);
CREATE INDEX support_ticket_assignee_idx ON support_ticket (assignee_id, status) WHERE assignee_id IS NOT NULL;
CREATE INDEX support_ticket_reference_idx ON support_ticket (reference_type, reference_id) WHERE reference_type IS NOT NULL;

-- --- Conversation -----------------------------------------------------------

CREATE TYPE support_ticket_message_author_type AS ENUM ('CUSTOMER', 'STAFF', 'SYSTEM');
CREATE TYPE support_ticket_message_visibility AS ENUM ('CUSTOMER', 'INTERNAL');

CREATE TABLE support_ticket_message (
  id          TEXT                                PRIMARY KEY,
  ticket_id   TEXT                                NOT NULL REFERENCES support_ticket(id),
  author_id   TEXT                                REFERENCES player(id),  -- NULL for SYSTEM messages
  author_type support_ticket_message_author_type  NOT NULL,
  visibility  support_ticket_message_visibility   NOT NULL,
  content     TEXT                                NOT NULL,
  created_at  TIMESTAMPTZ                         NOT NULL,

  CONSTRAINT support_ticket_message_length CHECK (char_length(content) BETWEEN 1 AND 4000),
  -- A customer can never author an INTERNAL-only message -- directive
  -- #13's "internal notes must NEVER be visible to customers" starts here,
  -- structurally, not just as an application-level filter on read.
  CONSTRAINT support_ticket_message_customer_never_internal
    CHECK (NOT (author_type = 'CUSTOMER' AND visibility = 'INTERNAL')),
  CONSTRAINT support_ticket_message_system_has_no_author
    CHECK ((author_type = 'SYSTEM') = (author_id IS NULL))
);

-- Directive #15: append-only. Reuses the same immutability trigger
-- function admin_audit and security_event already use.
CREATE TRIGGER support_ticket_message_immutable
  BEFORE UPDATE OR DELETE ON support_ticket_message
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE INDEX support_ticket_message_ticket_idx ON support_ticket_message (ticket_id, created_at);

-- --- Attachments (directive #23) --------------------------------------------
-- The same validated-bytes-plus-storage-abstraction shape as
-- packages/profile/src/avatar-storage.mjs -- a key into a storage
-- interface, never a raw path or credential, and never an executable
-- MIME type.

CREATE TABLE support_ticket_attachment (
  id          TEXT        PRIMARY KEY,
  ticket_id   TEXT        NOT NULL REFERENCES support_ticket(id),
  message_id  TEXT        REFERENCES support_ticket_message(id),
  uploaded_by TEXT        NOT NULL REFERENCES player(id),
  storage_key TEXT        NOT NULL,
  mime_type   TEXT        NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
  size_bytes  INT         NOT NULL CHECK (size_bytes > 0),
  created_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX support_ticket_attachment_ticket_idx ON support_ticket_attachment (ticket_id);

-- --- Notification idempotency (directive #27) -------------------------------
-- Mirrors welcome-email.mjs's own "claim a slot, then send" idiom: a
-- retried provider call or a duplicate trigger collides on this unique
-- key instead of sending the customer the same notification twice.

CREATE TABLE support_ticket_notification_sent (
  id             TEXT        PRIMARY KEY,
  ticket_id      TEXT        NOT NULL REFERENCES support_ticket(id),
  notification   TEXT        NOT NULL,  -- 'TICKET_CREATED' | 'STAFF_REPLIED' | 'WAITING_FOR_USER' | 'TICKET_RESOLVED'
  -- For STAFF_REPLIED specifically, dedupe per MESSAGE (a second reply
  -- must still notify); for the others, once per ticket is correct. A
  -- plain UNIQUE index (unlike a PRIMARY KEY) lets NULL coexist many
  -- times, so message_id is normalized through COALESCE to make "once per
  -- ticket+notification" and "once per ticket+notification+message" both
  -- real, enforced guarantees rather than a NULL silently opting out.
  message_id     TEXT        REFERENCES support_ticket_message(id),
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX support_ticket_notification_sent_once_idx
  ON support_ticket_notification_sent (ticket_id, notification, COALESCE(message_id, ''));
