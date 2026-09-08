-- Realtime Chat Foundation (Slice 9). One channel/message model underneath
-- Global chat, Match chat, and (architecture only, not yet built) Spectator
-- chat -- see packages/chat's own header for why a single abstraction beats
-- three parallel implementations.
--
-- RBAC note: CHAT_MODERATE/CHAT_DELETE/CHAT_MUTE/CHAT_REPORT_REVIEW already
-- exist as `permission` rows (migration 0015) -- inert until now, made real
-- the exact same way Slice 8 made TICKET_* real (identify() merging
-- effectivePermissions() into actor.capabilities; see packages/api/src/
-- server.mjs and packages/authz/src/policy.mjs). CHAT_VIEW did not exist
-- yet and is added below.
--
-- Reporting reuses the EXISTING content_report table (migration 0020)
-- rather than a parallel chat_report table: this IS "the existing
-- moderation architecture" the brief asks for. The additive columns below
-- (category, message_id) and the widened content_type CHECK cover chat's
-- two new report subjects (a specific message, or a player generally)
-- without touching a single row or column profile.mjs already relies on.

CREATE TYPE chat_channel_type AS ENUM ('GLOBAL', 'MATCH', 'SPECTATOR');
CREATE TYPE chat_channel_status AS ENUM ('ACTIVE', 'CLOSED');

CREATE TABLE chat_channel (
  id             TEXT                 PRIMARY KEY,
  type           chat_channel_type    NOT NULL,
  -- NULL for GLOBAL (there is only ever one); a DUEL reference for MATCH and
  -- (later) SPECTATOR -- loose by convention (no FK), matching this schema's
  -- existing reconciliation_case/support_ticket precedent, since a channel
  -- should keep naming its duel even if duel history is ever pruned.
  reference_type TEXT                 CHECK (reference_type IN ('DUEL')),
  reference_id   TEXT,
  status         chat_channel_status  NOT NULL DEFAULT 'ACTIVE',
  created_at     TIMESTAMPTZ          NOT NULL DEFAULT now(),

  CONSTRAINT chat_channel_reference_pair CHECK ((reference_type IS NULL) = (reference_id IS NULL)),
  CONSTRAINT chat_channel_global_no_reference CHECK (type <> 'GLOBAL' OR reference_type IS NULL),
  CONSTRAINT chat_channel_scoped_has_reference CHECK (type = 'GLOBAL' OR reference_type IS NOT NULL)
);

-- At most one channel per (type, duel) -- getOrCreateChannel() relies on this
-- to make channel creation idempotent under concurrent first-joiners.
CREATE UNIQUE INDEX chat_channel_reference_unique_idx ON chat_channel (type, reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

-- The one platform-wide public channel. Seeded once, here -- never created
-- lazily by application code, so "does Global Chat exist" is never a race.
INSERT INTO chat_channel (id, type, status) VALUES ('global', 'GLOBAL', 'ACTIVE');

CREATE TABLE chat_message (
  id                BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel_id        TEXT        NOT NULL REFERENCES chat_channel(id),
  sender_id         TEXT        NOT NULL REFERENCES player(id),
  content           TEXT        NOT NULL,
  -- Client-chosen, scoped to (channel, sender) -- a retried send with the
  -- SAME id is a no-op, never a second row. See chat_message_idempotency_idx.
  client_message_id TEXT        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  deleted_by        TEXT        REFERENCES admin_user(id),

  CONSTRAINT chat_message_length CHECK (char_length(content) BETWEEN 1 AND 1000),
  CONSTRAINT chat_message_deleted_pair CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
);

CREATE UNIQUE INDEX chat_message_idempotency_idx ON chat_message (channel_id, sender_id, client_message_id);

-- `id DESC` because every real access pattern is "the latest page of this
-- channel" or "the next page older than cursor X" -- never a full scan.
CREATE INDEX chat_message_channel_idx ON chat_message (channel_id, id DESC);

-- Append-only with exactly one legal follow-up write (a moderator setting
-- deleted_at/deleted_by once) -- deliberately its own trigger function
-- rather than reusing ledger_deny_mutation(), whose rule is "nothing may
-- ever change"; this table's rule is "nothing may change AFTER deletion,
-- and only deletion metadata may change AT ALL".
CREATE FUNCTION chat_message_deny_illegal_mutation() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'chat_message rows are never hard-deleted -- use moderation removal (deleted_at/deleted_by)';
  END IF;
  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'chat_message % was already moderated and cannot change further', OLD.id;
  END IF;
  IF NEW.channel_id IS DISTINCT FROM OLD.channel_id OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.content IS DISTINCT FROM OLD.content OR NEW.client_message_id IS DISTINCT FROM OLD.client_message_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'chat_message % core fields are immutable', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chat_message_immutable
  BEFORE UPDATE OR DELETE ON chat_message
  FOR EACH ROW EXECUTE FUNCTION chat_message_deny_illegal_mutation();

-- --- Mute -------------------------------------------------------------------

CREATE TYPE chat_mute_scope AS ENUM ('GLOBAL_CHAT', 'MATCH_CHAT', 'SPECTATOR_CHAT', 'ALL_CHAT');

CREATE TABLE chat_mute (
  id           TEXT             PRIMARY KEY,
  target_id    TEXT             NOT NULL REFERENCES player(id),
  moderator_id TEXT             NOT NULL REFERENCES admin_user(id),
  reason       TEXT             NOT NULL,
  scope        chat_mute_scope  NOT NULL,
  starts_at    TIMESTAMPTZ      NOT NULL DEFAULT now(),
  ends_at      TIMESTAMPTZ,   -- NULL = permanent, per directive #15
  revoked_at   TIMESTAMPTZ,
  revoked_by   TEXT             REFERENCES admin_user(id),
  created_at   TIMESTAMPTZ      NOT NULL DEFAULT now(),

  CONSTRAINT chat_mute_revoked_pair CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT chat_mute_reason_present CHECK (char_length(reason) BETWEEN 1 AND 500)
);

-- The "is this player currently muted for scope X" query filters on exactly
-- these columns -- see isMuted() in packages/chat/src/moderation.mjs.
CREATE INDEX chat_mute_active_idx ON chat_mute (target_id, scope) WHERE revoked_at IS NULL;

-- --- Block --------------------------------------------------------------------

CREATE TABLE chat_block (
  blocker_id TEXT        NOT NULL REFERENCES player(id),
  blocked_id TEXT        NOT NULL REFERENCES player(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT chat_block_not_self CHECK (blocker_id <> blocked_id)
);

-- --- Reporting: extend the EXISTING content_report table (migration 0020) --

ALTER TABLE content_report DROP CONSTRAINT IF EXISTS content_report_content_type_check;
ALTER TABLE content_report
  ADD CONSTRAINT content_report_content_type_check
    CHECK (content_type IN ('AVATAR', 'BIO', 'NICKNAME', 'CHAT_MESSAGE', 'PLAYER'));

ALTER TABLE content_report
  ADD COLUMN category TEXT CHECK (
    category IN ('ABUSE', 'HARASSMENT', 'SPAM', 'SCAM', 'THREATS', 'INAPPROPRIATE_CONTENT', 'OTHER')
  ),
  ADD COLUMN message_id BIGINT REFERENCES chat_message(id);

ALTER TABLE content_report
  ADD CONSTRAINT content_report_chat_message_has_id
    CHECK (content_type <> 'CHAT_MESSAGE' OR message_id IS NOT NULL);

-- --- RBAC: the one new permission code this slice needs --------------------

INSERT INTO permission (code, category, description) VALUES
  ('CHAT_VIEW', 'chat', 'View chat channels, messages and moderation queues');
