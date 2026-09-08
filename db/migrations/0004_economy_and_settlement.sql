-- =============================================================================
-- 0004_economy_and_settlement.sql
--
-- The Economy Rules Engine and the settlement linkage between a finished duel
-- and the ledger.
--
-- Two principles are made structural here rather than procedural:
--
--   1. Rake is CONFIGURATION, never code. A settlement records which rule
--      version priced it, so any historical duel can be re-derived exactly.
--   2. No single admin can price the platform. The two-admin rule is a CHECK
--      constraint, not a workflow step that a script can skip.
-- =============================================================================

-- --- Economy rules -----------------------------------------------------------

CREATE TABLE economy_rule (
  id              TEXT        NOT NULL,
  version         INT         NOT NULL,
  -- NULL means "any". Specificity decides which rule wins; see economy_resolve().
  game_id         TEXT        REFERENCES game(id),
  tier            entry_tier,
  tournament_id   TEXT,
  rake_bps        INT         NOT NULL,      -- 1000 = 10.00%
  min_rake_minor  BIGINT      NOT NULL DEFAULT 0,
  max_rake_minor  BIGINT,
  effective_from  TIMESTAMPTZ NOT NULL,
  effective_to    TIMESTAMPTZ,
  created_by      TEXT        NOT NULL,
  approved_by     TEXT        NOT NULL,
  reason          TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (id, version),

  -- Four-eyes, enforced by the database. A compromised admin account cannot
  -- price the platform alone, and no code path can "temporarily" skip this.
  CONSTRAINT economy_rule_two_admins CHECK (created_by <> approved_by),

  -- A hard ceiling on rake. The documented bands are 8-15%; 20% is the
  -- absolute limit a fat finger or a hostile admin can reach.
  CONSTRAINT economy_rule_rake_sane CHECK (rake_bps BETWEEN 0 AND 2000),
  CONSTRAINT economy_rule_min_max   CHECK (max_rake_minor IS NULL OR max_rake_minor >= min_rake_minor),
  CONSTRAINT economy_rule_window    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT economy_rule_reason    CHECK (length(btrim(reason)) > 0)
);

CREATE INDEX economy_rule_lookup_idx ON economy_rule (game_id, tier, effective_from);

-- Economy history is append-only for the same reason ledger history is: a
-- silently edited rate makes every past settlement unexplainable.
CREATE TRIGGER economy_rule_immutable
  BEFORE UPDATE OR DELETE ON economy_rule
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

/**
 * Which rule prices this duel, at this instant?
 *
 * Most specific wins: tournament > game+tier > game > tier > global. Ties are
 * broken by the latest effective_from, then the highest version, so a newer
 * rule of equal specificity supersedes an older one without needing the old
 * row to be edited (which is forbidden anyway).
 */
CREATE FUNCTION economy_resolve(
  p_game_id       TEXT,
  p_tier          entry_tier,
  p_at            TIMESTAMPTZ,
  p_tournament_id TEXT DEFAULT NULL
) RETURNS TABLE (
  rule_id TEXT, rule_version INT, rake_bps INT,
  min_rake_minor BIGINT, max_rake_minor BIGINT
) LANGUAGE sql STABLE AS $$
  SELECT r.id, r.version, r.rake_bps, r.min_rake_minor, r.max_rake_minor
    FROM economy_rule r
   WHERE r.effective_from <= p_at
     AND (r.effective_to IS NULL OR r.effective_to > p_at)
     AND (r.game_id       IS NULL OR r.game_id = p_game_id)
     AND (r.tier          IS NULL OR r.tier    = p_tier)
     AND (r.tournament_id IS NULL OR r.tournament_id = p_tournament_id)
     -- A tournament-scoped rule must not leak onto ordinary duels.
     AND (p_tournament_id IS NOT NULL OR r.tournament_id IS NULL)
   ORDER BY
     (r.tournament_id IS NOT NULL)::INT DESC,
     (r.game_id IS NOT NULL)::INT DESC,
     (r.tier IS NOT NULL)::INT DESC,
     r.effective_from DESC,
     r.version DESC
   LIMIT 1;
$$;

-- Launch economics. Standard band is 10-15%; we open at the bottom of it.
INSERT INTO economy_rule
  (id, version, game_id, tier, rake_bps, min_rake_minor, max_rake_minor,
   effective_from, created_by, approved_by, reason)
VALUES
  ('standard', 1, NULL, 'CASH', 1000, 0, NULL,
   '2026-01-01T00:00:00Z', 'founder', 'finance-admin',
   'Launch economics: 10% standard rake, bottom of the documented 10-15% band.');

-- --- Settlement linkage on the duel -----------------------------------------

ALTER TABLE duel
  ADD COLUMN settlement_tx_id     BIGINT REFERENCES ledger_transaction(id),
  ADD COLUMN reservation_tx_id    BIGINT REFERENCES ledger_transaction(id),
  ADD COLUMN rake_minor           BIGINT,
  ADD COLUMN economy_rule_id      TEXT,
  ADD COLUMN economy_rule_version INT,
  -- A duel under fair-play review is completed but NOT settled. Money waits.
  ADD COLUMN fairplay_hold        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN rating_applied       BOOLEAN NOT NULL DEFAULT FALSE;

-- A settled cash duel must be able to show the money. No exceptions, and no
-- "we'll backfill it later".
ALTER TABLE duel
  ADD CONSTRAINT duel_settled_cash_has_ledger
    CHECK (
      status <> 'SETTLED' OR tier <> 'CASH'
      OR (settlement_tx_id IS NOT NULL AND rake_minor IS NOT NULL
          AND economy_rule_id IS NOT NULL AND economy_rule_version IS NOT NULL)
    );

-- Money must never be released while a fair-play case is open on the duel.
ALTER TABLE duel
  ADD CONSTRAINT duel_no_settle_under_hold
    CHECK (status <> 'SETTLED' OR fairplay_hold = FALSE);

CREATE INDEX duel_awaiting_settlement_idx
  ON duel (completed_at) WHERE status = 'COMPLETED';

-- --- Rating history (append-only) -------------------------------------------
-- The rating table holds the current value; this holds how it got there. A
-- player disputing a rating change gets an answer, not a shrug.

CREATE TABLE rating_change (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  duel_id         TEXT NOT NULL REFERENCES duel(id),
  player_id       TEXT NOT NULL REFERENCES player(id),
  game_id         TEXT NOT NULL REFERENCES game(id),
  score           NUMERIC(2,1) NOT NULL,          -- 1.0 | 0.5 | 0.0
  rating_before_x100 INT NOT NULL,
  rating_after_x100  INT NOT NULL,
  rd_before_x100     INT NOT NULL,
  rd_after_x100      INT NOT NULL,
  volatility_before_x1e6 INT NOT NULL,
  volatility_after_x1e6  INT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rating_change_once_per_duel UNIQUE (duel_id, player_id),
  CONSTRAINT rating_change_score_valid CHECK (score IN (0.0, 0.5, 1.0))
);

CREATE TRIGGER rating_change_immutable
  BEFORE UPDATE OR DELETE ON rating_change
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE INDEX rating_change_player_idx ON rating_change (player_id, game_id, created_at);
