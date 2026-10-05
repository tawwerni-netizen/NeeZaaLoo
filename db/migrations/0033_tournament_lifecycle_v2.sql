-- =============================================================================
-- 0033_tournament_lifecycle_v2.sql
--
-- The unified Tournament + Live Arena system. This migration:
--
--   1. Widens `tournament` with the fields a real admin-facing creation
--      form needs (title, description, a versioned ruleset snapshot,
--      eligibility, visibility) and a genuine SCHEDULED start time,
--      distinct from `starts_at` (which remains the ACTUAL moment play
--      began, stamped by tournament.mjs's own start()).
--   2. Replaces the 6-value tournament_status enum with the 8-value
--      lifecycle: DRAFT, SCHEDULED, REGISTRATION, LIVE, FINALS, COMPLETED,
--      SETTLED, CANCELLED. REGISTRATION_OPEN/REGISTRATION_CLOSED collapse
--      into REGISTRATION (REGISTRATION_CLOSED was never actually written
--      by any code path -- grep the previous tournament.mjs and nothing
--      ever set it); IN_PROGRESS becomes LIVE; FINALS and SETTLED are
--      genuinely new phases (see tournament.mjs's own header on what now
--      drives each transition).
--   3. Adds a minimal, real, in-app `notification` table -- this
--      platform's first, used to tell a registered player their match is
--      ready, their tournament was cancelled, or their prize settled.
--      Deliberately not an email/push pipeline: packages/email already
--      exists for transactional mail and is untouched here; this is the
--      in-app inbox a frontend actually renders.
-- =============================================================================

-- --- 1. New tournament columns ------------------------------------------------

ALTER TABLE tournament
  ADD COLUMN title              TEXT,
  ADD COLUMN description        TEXT,
  -- Snapshot of game.plugin_version at CREATION time, not read live at
  -- round-creation. A tournament that runs for days must play every round
  -- under the SAME ruleset it advertised at signup, even if the game's
  -- plugin_version is bumped while registration is still open -- exactly
  -- the "ruleset versioning" directive applied to a multi-day event, not
  -- just a single duel.
  ADD COLUMN ruleset_version    INT,
  ADD COLUMN eligibility        JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN visibility         TEXT NOT NULL DEFAULT 'PUBLIC',
  -- The admin-set TARGET start time, shown as a countdown before anyone
  -- has played a single pairing. `starts_at` (existing column) stays the
  -- ACTUAL moment start() ran -- the two drift whenever a tournament
  -- starts late or early, which is real information, not a bug.
  ADD COLUMN scheduled_starts_at TIMESTAMPTZ;

UPDATE tournament SET ruleset_version = (SELECT plugin_version FROM game WHERE game.id = tournament.game_id)
  WHERE ruleset_version IS NULL;
ALTER TABLE tournament ALTER COLUMN ruleset_version SET NOT NULL;

ALTER TABLE tournament
  ADD CONSTRAINT tournament_visibility_sane CHECK (visibility IN ('PUBLIC', 'UNLISTED'));

CREATE INDEX tournament_visibility_idx ON tournament (visibility, status);

-- --- 2. The 8-phase lifecycle --------------------------------------------------
--
-- Renaming an enum TYPE in place (ALTER TYPE ... RENAME) and reusing the
-- old name for a fresh, differently-valued type is fragile in practice --
-- any existing PL/pgSQL object (tournament_capacity_guard() below, in
-- this very migration's own predecessor) that declared a local variable
-- or embedded a literal against the OLD type keeps resolving by OID, not
-- by name, and the two same-named-but-distinct types collide the moment
-- anything compares one against the other. The robust, standard technique
-- sidesteps type identity entirely: drop to plain TEXT, remap the VALUES
-- with ordinary string equality (no enum type in scope at all), then
-- promote to the new enum once every row already holds one of its labels.

-- Both partial indexes below embed a `tournament_status` literal in their
-- WHERE clause -- `tournament_open_idx` (this migration's own predecessor)
-- and `tournament_progression_pending_idx` (migration 0025, easy to miss
-- since it lives nowhere near this file). Both must be dropped before the
-- column's type changes and rebuilt after, or the first one's rebuild
-- attempt is what actually produces "operator does not exist: text =
-- tournament_status" -- a real trap this migration's own comment above
-- exists to warn about, discovered by hitting it.
DROP INDEX tournament_open_idx;
DROP INDEX tournament_progression_pending_idx;

ALTER TABLE tournament ALTER COLUMN status DROP DEFAULT;
ALTER TABLE tournament ALTER COLUMN status TYPE TEXT USING status::text;
DROP TYPE tournament_status;

UPDATE tournament SET status = CASE status
  WHEN 'REGISTRATION_OPEN'   THEN 'REGISTRATION'
  WHEN 'REGISTRATION_CLOSED' THEN 'REGISTRATION'
  WHEN 'IN_PROGRESS'         THEN 'LIVE'
  ELSE status
END;

CREATE TYPE tournament_status AS ENUM (
  'DRAFT', 'SCHEDULED', 'REGISTRATION', 'LIVE', 'FINALS',
  'COMPLETED', 'SETTLED', 'CANCELLED'
);
ALTER TABLE tournament ALTER COLUMN status TYPE tournament_status USING status::tournament_status;
ALTER TABLE tournament ALTER COLUMN status SET DEFAULT 'DRAFT'::tournament_status;

CREATE INDEX tournament_open_idx ON tournament (registration_closes_at)
  WHERE status = 'REGISTRATION';
-- Widened to COMPLETED OR SETTLED: packages/progression's own
-- tournamentProgressionDue() gates on "a tournament_settlement row
-- exists" (the real, authoritative signal), not on the exact status
-- label -- see that file's own updated comment on why SETTLED must
-- match here too, now that settlePrizes() actually reaches it.
CREATE INDEX tournament_progression_pending_idx ON tournament (completed_at)
  WHERE status IN ('COMPLETED', 'SETTLED') AND progression_processed_at IS NULL;

-- tournament_capacity_guard() (migration 0010) still checks the OLD literal
-- 'REGISTRATION_OPEN', which no longer exists as a status value -- left
-- as-is, every registration attempt would raise "tournament % is not open
-- for registration" forever, since no tournament can ever hold that value
-- again. CREATE OR REPLACE keeps the function's OID (and therefore the
-- existing trigger binding on tournament_registration) intact; only the
-- literal changes.
CREATE OR REPLACE FUNCTION tournament_capacity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_capacity INT;
  v_status   tournament_status;
  v_count    INT;
BEGIN
  SELECT capacity, status INTO v_capacity, v_status
    FROM tournament WHERE id = NEW.tournament_id FOR UPDATE;

  IF v_status <> 'REGISTRATION' THEN
    RAISE EXCEPTION 'tournament % is not open for registration (status %)',
      NEW.tournament_id, v_status USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_count FROM tournament_registration
   WHERE tournament_id = NEW.tournament_id AND status = 'REGISTERED';

  IF v_count >= v_capacity THEN
    RAISE EXCEPTION 'tournament % is at capacity (%/%)',
      NEW.tournament_id, v_count, v_capacity USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- --- 3. Notifications ----------------------------------------------------------

CREATE TABLE notification (
  id         TEXT        PRIMARY KEY,
  player_id  TEXT        NOT NULL REFERENCES player(id),
  type       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notification_player_idx ON notification (player_id, created_at DESC);
CREATE INDEX notification_unread_idx ON notification (player_id) WHERE read_at IS NULL;
