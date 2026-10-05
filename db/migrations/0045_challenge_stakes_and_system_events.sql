-- =============================================================================
-- 0045_challenge_stakes_and_system_events.sql
--
-- The final match-mode selection and challenge invitation UX:
--
--   1. PLAY WITH FRIEND could only ever create a FREE duel (0027's own
--      accept() hardcoded tier='FREE', stake_minor=0). The approved spec
--      requires "Free or Competitive where eligible" -- the same choice
--      RANDOM OPPONENT (matchmaking_ticket) already has. duel_challenge
--      gains the same tier/stake_minor/asset columns duel and
--      matchmaking_ticket already carry, with the identical CASH-has-stake
--      shape check duel's own duel_cash_has_stake already enforces.
--
--   2. TIMEOUT: "if no action within 30 seconds: EXPIRED. The system must
--      log this automatically." 0027 computed expiry LAZILY at read time
--      and never once persisted it -- a challenge's `status` column stayed
--      'PENDING' forever even long after it could no longer be actioned.
--      EXPIRED is now a real, loggable status.
--
--   3. duel_challenge_event: an honest, append-only log of a challenge's
--      whole lifecycle (SENT/ACCEPTED/DECLINED/CANCELLED/EXPIRED), separate
--      from the mutable duel_challenge row itself, so "the system must log
--      this automatically" has a real, permanent record to point to.
--
--   4. chat_system_event: "regardless of result, the chat timeline should
--      show a system event ... these are system timeline events, not
--      ordinary user messages." chat_message.sender_id is NOT NULL
--      REFERENCES player(id) -- there is no room in that table for an
--      event with no human author, and no reason to stretch its content
--      length/rate-limit rules to fit one. A small, separate, append-only
--      table alongside it is the honest shape, not a widened chat_message.
--      Scoped to MATCH_STARTED only, for now: that is the one event this
--      feature's own backend actually emits into a real chat_channel (the
--      newly-created duel's own match chat) -- CHALLENGE_SENT/ACCEPTED/
--      DECLINED/EXPIRED are logged in duel_challenge_event above instead,
--      since a pending challenge that is never accepted has no duel and no
--      match chat channel to post into at all.
-- =============================================================================

-- --- 1 + 2: duel_challenge gains stakes and a real EXPIRED status ------------

ALTER TYPE duel_challenge_status ADD VALUE 'EXPIRED';

ALTER TABLE duel_challenge
  ADD COLUMN tier        entry_tier NOT NULL DEFAULT 'FREE',
  ADD COLUMN stake_minor BIGINT     NOT NULL DEFAULT 0,
  ADD COLUMN asset       TEXT,
  ADD CONSTRAINT duel_challenge_cash_has_stake
    CHECK ((tier = 'CASH') = (stake_minor > 0 AND asset IS NOT NULL));

-- --- 3: the challenge lifecycle log ------------------------------------------

CREATE TYPE duel_challenge_event_type AS ENUM
  ('SENT', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');

CREATE TABLE duel_challenge_event (
  id           BIGINT                     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  challenge_id TEXT                       NOT NULL REFERENCES duel_challenge(id),
  event_type   duel_challenge_event_type  NOT NULL,
  created_at   TIMESTAMPTZ                NOT NULL DEFAULT now()
);

CREATE INDEX duel_challenge_event_challenge_idx ON duel_challenge_event (challenge_id, id);

CREATE TRIGGER duel_challenge_event_immutable
  BEFORE UPDATE OR DELETE ON duel_challenge_event
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

-- --- 4: system events on a real chat channel ---------------------------------

CREATE TYPE chat_system_event_type AS ENUM ('MATCH_STARTED');

CREATE TABLE chat_system_event (
  id          BIGINT                  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel_id  TEXT                    NOT NULL REFERENCES chat_channel(id),
  event_type  chat_system_event_type  NOT NULL,
  detail      JSONB                   NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ             NOT NULL DEFAULT now(),

  CONSTRAINT chat_system_event_short_detail CHECK (octet_length(detail::text) <= 2000)
);

CREATE INDEX chat_system_event_channel_idx ON chat_system_event (channel_id, id);

CREATE TRIGGER chat_system_event_immutable
  BEFORE UPDATE OR DELETE ON chat_system_event
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();
