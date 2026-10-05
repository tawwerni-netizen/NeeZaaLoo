-- The Profile / User Identity foundation (Slice 7). Four independent
-- concerns, deliberately kept as separate tables rather than one wide
-- "profile" blob:
--
--   player (extended)  -- bio, avatar, nickname-change cooldown, and which
--                          single earned/cosmetic badge is shown in the
--                          compact preview. Nickname itself stays
--                          `player.handle` -- see nickname.mjs's own header
--                          for why this is presentation-only, not a schema
--                          rename.
--   exp_event          -- an append-only, idempotent EXP ledger. EXP is
--                          NOT the financial ledger (packages/ledger) and
--                          never touches it -- a separate domain entirely,
--                          on purpose.
--   achievement /
--   player_achievement -- a catalog of one-time-per-player unlocks.
--   badge /
--   player_badge       -- a catalog of displayable badges, explicitly
--                          tagged by source (an achievement unlock vs. a
--                          future store purchase) so those two concepts
--                          can never be confused at the data layer, even
--                          before a store exists to populate the second one.
--   content_report     -- the minimal "report this" primitive directive
--                          #3/#4 ask for; review tooling is a later slice's
--                          job, this just makes sure a report is never lost.

ALTER TABLE player
  ADD COLUMN bio TEXT NOT NULL DEFAULT '',
  ADD COLUMN avatar_key TEXT,
  ADD COLUMN handle_changed_at TIMESTAMPTZ,
  ADD COLUMN selected_badge_code TEXT,
  ADD CONSTRAINT player_bio_length CHECK (char_length(bio) <= 280);

-- --- EXP (a domain of its own -- see exp.mjs's header for why this is
-- never a materialized running total: SUM() on this small, indexed table
-- is cheap, and a second number that could drift out of sync with the
-- events that are supposed to explain it is a bug waiting to happen). ----

CREATE TABLE exp_event (
  id          TEXT        PRIMARY KEY,
  player_id   TEXT        NOT NULL REFERENCES player(id),
  event_type  TEXT        NOT NULL,
  source      TEXT,
  amount      INT         NOT NULL CHECK (amount > 0),
  -- The idempotency guarantee directive #11 requires: a retried match
  -- settlement, a replayed tournament result, or a duplicate webhook all
  -- carry the SAME dedupe_key on retry, so a second attempt collides on
  -- this UNIQUE constraint instead of awarding EXP twice. The caller picks
  -- the key (e.g. "duel:<duelId>:win"); this table only enforces it.
  dedupe_key  TEXT        NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX exp_event_player_idx ON exp_event (player_id, created_at DESC);

-- --- Achievements -------------------------------------------------------

CREATE TABLE achievement (
  code       TEXT        PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE player_achievement (
  player_id        TEXT        NOT NULL REFERENCES player(id),
  achievement_code TEXT        NOT NULL REFERENCES achievement(code),
  earned_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The whole idempotency guarantee for achievements: earning the same
  -- achievement twice is structurally impossible, not just discouraged.
  PRIMARY KEY (player_id, achievement_code)
);

-- --- Badges ---------------------------------------------------------------
-- `source` is the one column that keeps directive #17's separation real:
-- an achievement-awarding code path and a (future) store-purchase code
-- path both insert into the SAME player_badge table, but neither can ever
-- be mistaken for the other later, and a query can trivially filter to
-- "earned badges only" or "cosmetic badges only".

CREATE TYPE badge_source AS ENUM ('ACHIEVEMENT', 'PURCHASE');

CREATE TABLE badge (
  code       TEXT        PRIMARY KEY,
  -- Catalog-level classification -- independent of any one player's
  -- source (a badge design could in principle be earnable AND, later,
  -- also sellable as a cosmetic reprint; today every seeded badge is one
  -- or the other, but the column exists on the catalog, not lazily
  -- inferred from the first row that happens to reference it).
  kind       TEXT        NOT NULL CHECK (kind IN ('EARNED', 'COSMETIC')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE player_badge (
  player_id  TEXT         NOT NULL REFERENCES player(id),
  badge_code TEXT         NOT NULL REFERENCES badge(code),
  source     badge_source NOT NULL,
  earned_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, badge_code)
);

ALTER TABLE player
  ADD CONSTRAINT player_selected_badge_fk FOREIGN KEY (selected_badge_code) REFERENCES badge(code);

-- A very small initial catalog, per directive #16/#17 -- infrastructure
-- first, not "dozens of achievements". Display name/description are i18n
-- keys resolved client-side (packages/i18n), never stored as English text
-- here, the same convention every other user-facing string in this
-- product already follows.
INSERT INTO achievement (code) VALUES ('FIRST_WIN'), ('FIRST_TOURNAMENT');
INSERT INTO badge (code, kind) VALUES ('FIRST_WIN', 'EARNED'), ('FIRST_TOURNAMENT', 'EARNED');

-- --- Reporting (minimal) ----------------------------------------------------
-- Directive #3/#4's "moderation/report capability" -- this is the write
-- side only (file a report, never lose it). An admin review queue is a
-- later slice's job, exactly like the Support Ticket System already
-- planned next; this table is what that slice will read from.

CREATE TABLE content_report (
  id                 TEXT        PRIMARY KEY,
  reporter_id        TEXT        NOT NULL REFERENCES player(id),
  subject_player_id  TEXT        NOT NULL REFERENCES player(id),
  content_type       TEXT        NOT NULL CHECK (content_type IN ('AVATAR', 'BIO', 'NICKNAME')),
  reason             TEXT,
  status             TEXT        NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'REVIEWED', 'DISMISSED')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT content_report_not_self CHECK (reporter_id <> subject_player_id)
);

CREATE INDEX content_report_subject_idx ON content_report (subject_player_id, created_at DESC);
