-- =============================================================================
-- 0008_compliance.sql
--
-- The market matrix, KYC tiers, sanctions screening, self-exclusion, and
-- responsible-competition limits.
--
-- THE DEFAULT POSTURE, which everything else depends on:
--
--   Every jurisdiction that is not explicitly listed is UNDETERMINED, and an
--   UNDETERMINED jurisdiction gets FREE PLAY ONLY. There is no default-
--   permitted state and no code path that treats an unlisted country as
--   allowed. A market becomes real-money eligible only by an explicit,
--   counsel-backed, audited row.
--
-- NOTE ON SEEDING: this migration deliberately inserts NO markets. Which
-- jurisdictions permit paid skill contests is a legal determination, not an
-- engineering one, and encoding a guess here would be worse than encoding
-- nothing -- a wrong "PERMITTED" row is the single most expensive mistake this
-- system can make. The table ships empty and fails closed.
--
-- SUB-NATIONAL GRANULARITY is present from day one because retrofitting it
-- into a country-keyed table is a rewrite: several US states, Indian states
-- and Canadian provinces differ from their national position.
-- =============================================================================

CREATE TYPE legal_status AS ENUM ('PERMITTED', 'RESTRICTED', 'PROHIBITED', 'UNDETERMINED');
CREATE TYPE geo_rule     AS ENUM ('ALLOW', 'BLOCK', 'ALLOW_FREE_PLAY_ONLY');
CREATE TYPE launch_status AS ENUM ('LIVE', 'PILOT', 'PLANNED', 'BLOCKED');
CREATE TYPE kyc_tier     AS ENUM ('TIER_0', 'TIER_1', 'TIER_2', 'TIER_3');
CREATE TYPE product      AS ENUM ('FREE_PLAY', 'RANKED', 'CASH_DUEL', 'CASH_TOURNAMENT');

CREATE TABLE market (
  country_code   CHAR(2)       NOT NULL,
  -- '*' means "the whole country". A specific region row overrides it, which is
  -- how US-CA can differ from US, or IN-TN from IN.
  region_code    TEXT          NOT NULL DEFAULT '*',
  legal_status   legal_status  NOT NULL DEFAULT 'UNDETERMINED',
  allowed_products product[]   NOT NULL DEFAULT ARRAY['FREE_PLAY']::product[],
  real_money_eligible BOOLEAN  NOT NULL DEFAULT FALSE,
  crypto_eligible     BOOLEAN  NOT NULL DEFAULT FALSE,
  minimum_age    SMALLINT      NOT NULL DEFAULT 18,
  kyc_requirement kyc_tier     NOT NULL DEFAULT 'TIER_0',
  geo_rule       geo_rule      NOT NULL DEFAULT 'ALLOW_FREE_PLAY_ONLY',
  launch_status  launch_status NOT NULL DEFAULT 'BLOCKED',
  licence_ref    TEXT,
  reviewed_by    TEXT,
  reviewed_at    TIMESTAMPTZ,
  notes          TEXT,
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),

  PRIMARY KEY (country_code, region_code),

  -- Real money requires an affirmative legal position AND a named reviewer.
  -- "We think it is probably fine" cannot be represented in this table.
  CONSTRAINT market_real_money_needs_review
    CHECK (real_money_eligible = FALSE
           OR (legal_status = 'PERMITTED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CONSTRAINT market_real_money_needs_kyc
    CHECK (real_money_eligible = FALSE OR kyc_requirement >= 'TIER_1'),
  CONSTRAINT market_prohibited_is_blocked
    CHECK (legal_status <> 'PROHIBITED' OR (geo_rule = 'BLOCK' AND real_money_eligible = FALSE)),
  CONSTRAINT market_age_sane CHECK (minimum_age BETWEEN 16 AND 25)
);

CREATE TABLE market_change (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  country_code CHAR(2)     NOT NULL,
  region_code  TEXT        NOT NULL,
  before_state JSONB,
  after_state  JSONB       NOT NULL,
  changed_by   TEXT        NOT NULL,
  reason       TEXT        NOT NULL,
  at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER market_change_immutable
  BEFORE UPDATE OR DELETE ON market_change
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

/**
 * Resolve the policy for a location.
 *
 * A region row wins over its country's row. An unlisted location resolves to
 * the closed default rather than to nothing, so a caller that forgets to
 * handle "not found" still fails safe.
 */
CREATE FUNCTION market_resolve(p_country CHAR(2), p_region TEXT DEFAULT NULL)
RETURNS TABLE (
  country_code CHAR(2), region_code TEXT, legal_status legal_status,
  allowed_products TEXT[], real_money_eligible BOOLEAN, crypto_eligible BOOLEAN,
  minimum_age SMALLINT, kyc_requirement kyc_tier, geo_rule geo_rule,
  launch_status launch_status, resolved_from TEXT
) LANGUAGE plpgsql STABLE AS $$
BEGIN
  -- Most specific first: a region row outranks its country's row.
  RETURN QUERY
    SELECT m.country_code, m.region_code, m.legal_status, m.allowed_products::TEXT[],
           m.real_money_eligible, m.crypto_eligible, m.minimum_age,
           m.kyc_requirement, m.geo_rule, m.launch_status,
           (CASE WHEN m.region_code = '*' THEN 'COUNTRY' ELSE 'REGION' END)::TEXT
      FROM market m
     WHERE m.country_code = p_country
       AND (m.region_code = COALESCE(p_region, '*') OR m.region_code = '*')
     ORDER BY (m.region_code <> '*') DESC
     LIMIT 1;

  -- Nothing matched. Return the CLOSED default rather than no row at all, so a
  -- caller that forgets to handle "not found" still fails safe.
  IF NOT FOUND THEN
    RETURN QUERY
      SELECT p_country, COALESCE(p_region, '*'), 'UNDETERMINED'::legal_status,
             ARRAY['FREE_PLAY']::TEXT[], FALSE, FALSE, 18::SMALLINT,
             'TIER_0'::kyc_tier, 'ALLOW_FREE_PLAY_ONLY'::geo_rule,
             'BLOCKED'::launch_status, 'DEFAULT'::TEXT;
  END IF;
END;
$$;

-- --- Where a player belongs --------------------------------------------------
-- The HOME market governs eligibility, not the current IP. A traveller does not
-- gain or lose rights by boarding a plane; a mismatch is a review signal.

CREATE TABLE player_jurisdiction (
  player_id     TEXT PRIMARY KEY REFERENCES player(id),
  country_code  CHAR(2)     NOT NULL,
  region_code   TEXT        NOT NULL DEFAULT '*',
  source        TEXT        NOT NULL,        -- 'KYC' | 'DECLARED' | 'PAYMENT' | 'IP'
  determined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked        BOOLEAN     NOT NULL DEFAULT FALSE
);

-- --- KYC ---------------------------------------------------------------------

CREATE TYPE kyc_status AS ENUM ('NONE', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

CREATE TABLE kyc_verification (
  player_id    TEXT PRIMARY KEY REFERENCES player(id),
  tier         kyc_tier    NOT NULL DEFAULT 'TIER_0',
  status       kyc_status  NOT NULL DEFAULT 'NONE',
  provider     TEXT,
  provider_ref TEXT,
  -- Date of birth only; never the document itself. KYC artefacts live in
  -- separate encrypted storage with their own access control and retention
  -- clock, and must never sit in an application table.
  date_of_birth DATE,
  country_code CHAR(2),
  verified_at  TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT kyc_verified_has_timestamp
    CHECK (status <> 'VERIFIED' OR (verified_at IS NOT NULL AND tier >= 'TIER_1'))
);

CREATE FUNCTION kyc_effective_tier(p_player_id TEXT) RETURNS kyc_tier
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT CASE
       WHEN k.status = 'VERIFIED' AND (k.expires_at IS NULL OR k.expires_at > now())
         THEN k.tier ELSE 'TIER_0'::kyc_tier END
       FROM kyc_verification k WHERE k.player_id = p_player_id),
    'TIER_0'::kyc_tier);
$$;

CREATE FUNCTION player_age_years(p_player_id TEXT) RETURNS INT LANGUAGE sql STABLE AS $$
  SELECT EXTRACT(YEAR FROM age(now(), k.date_of_birth))::INT
    FROM kyc_verification k WHERE k.player_id = p_player_id AND k.date_of_birth IS NOT NULL;
$$;

-- --- Sanctions ---------------------------------------------------------------

CREATE TABLE sanctions_check (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id  TEXT        NOT NULL REFERENCES player(id),
  provider   TEXT        NOT NULL,
  clear      BOOLEAN     NOT NULL,
  is_pep     BOOLEAN     NOT NULL DEFAULT FALSE,
  detail     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER sanctions_check_immutable
  BEFORE UPDATE OR DELETE ON sanctions_check
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE INDEX sanctions_check_player_idx ON sanctions_check (player_id, checked_at DESC);

/** Latest screening result. A player never screened is NOT clear. */
CREATE FUNCTION sanctions_clear(p_player_id TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT s.clear FROM sanctions_check s
      WHERE s.player_id = p_player_id ORDER BY s.checked_at DESC LIMIT 1),
    FALSE);
$$;

-- --- Responsible competition -------------------------------------------------

CREATE TYPE limit_kind AS ENUM ('DEPOSIT_DAILY', 'DEPOSIT_WEEKLY', 'DEPOSIT_MONTHLY',
                                'LOSS_DAILY', 'SESSION_MINUTES', 'STAKE_MAX');

CREATE TABLE responsible_limit (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id      TEXT        NOT NULL REFERENCES player(id),
  kind           limit_kind  NOT NULL,
  value_minor    BIGINT      NOT NULL,
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A tightening takes effect NOW. A loosening waits out a cooling-off period,
  -- so a player cannot raise their own limit in the moment they most want to.
  effective_from TIMESTAMPTZ NOT NULL,
  superseded_at  TIMESTAMPTZ,

  CONSTRAINT responsible_limit_value CHECK (value_minor >= 0)
);

CREATE TRIGGER responsible_limit_no_delete
  BEFORE DELETE ON responsible_limit
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE INDEX responsible_limit_active_idx ON responsible_limit (player_id, kind, effective_from DESC);

CREATE FUNCTION responsible_limit_current(p_player_id TEXT, p_kind limit_kind)
RETURNS BIGINT LANGUAGE sql STABLE AS $$
  SELECT l.value_minor FROM responsible_limit l
   WHERE l.player_id = p_player_id AND l.kind = p_kind
     AND l.effective_from <= now() AND l.superseded_at IS NULL
   ORDER BY l.effective_from DESC LIMIT 1;
$$;

-- --- Self-exclusion ----------------------------------------------------------

CREATE TABLE self_exclusion (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id  TEXT        NOT NULL REFERENCES player(id),
  permanent  BOOLEAN     NOT NULL DEFAULT FALSE,
  starts_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at    TIMESTAMPTZ,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A permanent exclusion has no end. Allowing one to be given an end date is
  -- how "permanent" quietly becomes "until someone edits a row".
  CONSTRAINT self_exclusion_permanent_has_no_end
    CHECK (permanent = FALSE OR ends_at IS NULL),
  CONSTRAINT self_exclusion_temporary_has_end
    CHECK (permanent = TRUE OR ends_at IS NOT NULL)
);

CREATE TRIGGER self_exclusion_immutable
  BEFORE UPDATE OR DELETE ON self_exclusion
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

/**
 * Is this player excluded?
 *
 * Checked across the DEVICE GRAPH, not just the account. A self-exclusion that
 * a new signup on the same device can walk around is theatre, and in most
 * regulated markets it is also a licence condition that it not be.
 */
CREATE FUNCTION self_excluded(p_player_id TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM self_exclusion e
     WHERE e.player_id = p_player_id
       AND e.starts_at <= now()
       AND (e.permanent OR e.ends_at > now())
  ) OR EXISTS (
    SELECT 1
      FROM device d_self
      JOIN device d_other ON d_other.fingerprint = d_self.fingerprint
      JOIN self_exclusion e ON e.player_id = d_other.player_id
     WHERE d_self.player_id = p_player_id
       AND d_other.player_id <> p_player_id
       AND e.starts_at <= now()
       AND (e.permanent OR e.ends_at > now())
  );
$$;

-- --- Skill-vs-chance evidence ------------------------------------------------
--
-- The entire real-money thesis rests on these being games of SKILL, which is
-- decided differently in every jurisdiction. The evidence is that outcomes
-- correlate with rating and improve with practice -- which is a data product,
-- and one that cannot be reconstructed retroactively. So it is recorded from
-- the first free-play duel, long before anyone needs it.

CREATE TABLE skill_evidence (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id           TEXT        NOT NULL REFERENCES game(id),
  duel_id           TEXT        NOT NULL REFERENCES duel(id),
  higher_rated_won  BOOLEAN,
  rating_gap_x100   INT         NOT NULL,
  was_draw          BOOLEAN     NOT NULL DEFAULT FALSE,
  winner_games_played INT,
  loser_games_played  INT,
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT skill_evidence_one_per_duel UNIQUE (duel_id)
);

CREATE INDEX skill_evidence_game_idx ON skill_evidence (game_id, rating_gap_x100);

/**
 * The headline number for a skill argument: how often does the stronger player
 * win, as the rating gap widens? In a game of chance this is flat at 50%.
 */
CREATE VIEW skill_correlation AS
SELECT
  game_id,
  width_bucket(rating_gap_x100, 0, 40000, 8) AS gap_bucket,
  count(*)::INT AS duels,
  round(100.0 * count(*) FILTER (WHERE higher_rated_won) /
        NULLIF(count(*) FILTER (WHERE NOT was_draw), 0), 1) AS higher_rated_win_pct
FROM skill_evidence
WHERE NOT was_draw
GROUP BY game_id, gap_bucket;
