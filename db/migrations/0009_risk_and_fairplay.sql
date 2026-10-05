-- =============================================================================
-- 0009_risk_and_fairplay.sql
--
-- Signals, risk scores, cases, decisions, appeals, and the collusion graph.
--
-- THE RULE THIS SCHEMA EXISTS TO ENFORCE:
--
--     Signals -> Risk -> Evidence -> Case -> Review -> Decision -> Appeal
--
-- and, specifically, NEVER one signal = ban. That is not a guideline here: a
-- statistical category is structurally incapable of being auto-actioned, by
-- CHECK constraint. Only a narrow list of physically-certain categories may be
-- acted on without a human, and widening that list requires a migration that a
-- reviewer will see.
-- =============================================================================

CREATE TYPE signal_kind AS ENUM (
  'TIMING', 'ENGINE_CORRELATION', 'ACCURACY', 'INPUT_BIOMETRIC',
  'AUTOMATION', 'IMPOSSIBLE_INPUT', 'PROTOCOL_VIOLATION',
  'DEVICE_RELATIONSHIP', 'ACCOUNT_RELATIONSHIP', 'VALUE_FLOW',
  'PAIRING_ANOMALY', 'PERFORMANCE_ANOMALY', 'NETWORK'
);

CREATE TYPE case_category AS ENUM (
  'ENGINE_ASSISTANCE', 'AUTOMATION', 'COLLUSION', 'MULTI_ACCOUNT',
  'IMPOSSIBLE_INPUT', 'PROTOCOL_VIOLATION', 'CONFIRMED_SELF_PLAY',
  'PAYMENT_FRAUD', 'OTHER'
);

CREATE TYPE case_status AS ENUM (
  'OPEN', 'UNDER_REVIEW', 'DECIDED', 'APPEALED', 'APPEAL_DECIDED', 'CLOSED_NO_ACTION'
);

CREATE TYPE sanction AS ENUM (
  'NONE', 'WARNING', 'RATING_CORRECTION', 'DUEL_VOID',
  'CASH_RESTRICTION', 'ACCOUNT_RESTRICTION', 'ACCOUNT_CLOSURE'
);

-- --- Signals (append-only evidence, never verdicts) --------------------------

CREATE TABLE fairplay_signal (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id        TEXT        NOT NULL REFERENCES player(id),
  duel_id          TEXT        REFERENCES duel(id),
  game_id          TEXT        REFERENCES game(id),
  detector         TEXT        NOT NULL,
  detector_version INT         NOT NULL,
  kind             signal_kind NOT NULL,
  -- How anomalous, and how much we trust the measurement. Both are needed:
  -- a very strange reading from a tiny sample is not evidence of anything.
  strength         NUMERIC(4,3) NOT NULL,
  confidence       NUMERIC(4,3) NOT NULL,
  observed         JSONB       NOT NULL,
  baseline         JSONB       NOT NULL,
  -- Mandatory. A signal a reviewer cannot understand will produce an
  -- unjustifiable sanction, which is worse for the business than the cheating.
  explanation      TEXT        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT signal_strength_range CHECK (strength BETWEEN 0 AND 1),
  CONSTRAINT signal_confidence_range CHECK (confidence BETWEEN 0 AND 1),
  CONSTRAINT signal_has_explanation CHECK (length(btrim(explanation)) >= 20)
);

CREATE TRIGGER fairplay_signal_immutable
  BEFORE UPDATE OR DELETE ON fairplay_signal
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE INDEX fairplay_signal_player_idx ON fairplay_signal (player_id, created_at DESC);
CREATE INDEX fairplay_signal_duel_idx ON fairplay_signal (duel_id);

-- --- Risk scores -------------------------------------------------------------
-- Separate dimensions, per the risk architecture. A payment risk of 90 must not
-- silently become a game-integrity accusation.

CREATE TYPE risk_dimension AS ENUM (
  'ACCOUNT', 'PAYMENT', 'WITHDRAWAL', 'GAME', 'ANTI_CHEAT', 'COLLUSION', 'DEVICE'
);

CREATE TABLE risk_score (
  player_id   TEXT           NOT NULL REFERENCES player(id),
  dimension   risk_dimension NOT NULL,
  score       INT            NOT NULL,
  -- The factors that produced the score, so it can be explained to a reviewer,
  -- to the player, and if necessary to a regulator. An unexplainable score is
  -- not usable as a reason for anything.
  factors     JSONB          NOT NULL DEFAULT '[]'::jsonb,
  computed_at TIMESTAMPTZ    NOT NULL DEFAULT now(),

  PRIMARY KEY (player_id, dimension),
  CONSTRAINT risk_score_range CHECK (score BETWEEN 0 AND 100),
  CONSTRAINT risk_score_explainable CHECK (jsonb_array_length(factors) > 0 OR score = 0)
);

CREATE TABLE risk_score_history (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id   TEXT           NOT NULL,
  dimension   risk_dimension NOT NULL,
  score       INT            NOT NULL,
  factors     JSONB          NOT NULL,
  computed_at TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE TRIGGER risk_score_history_immutable
  BEFORE UPDATE OR DELETE ON risk_score_history
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

-- --- Cases -------------------------------------------------------------------

CREATE TABLE fairplay_case (
  id             TEXT          PRIMARY KEY,
  player_id      TEXT          NOT NULL REFERENCES player(id),
  category       case_category NOT NULL,
  status         case_status   NOT NULL DEFAULT 'OPEN',
  risk_score     INT           NOT NULL,
  -- TRUE only for categories where the finding is physically certain rather
  -- than statistical. See the constraint below.
  auto_actioned  BOOLEAN       NOT NULL DEFAULT FALSE,
  opened_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  decided_by     TEXT          REFERENCES admin_user(id),
  decided_at     TIMESTAMPTZ,
  decision       sanction,
  decision_note  TEXT,
  funds_held     BOOLEAN       NOT NULL DEFAULT FALSE,
  closed_at      TIMESTAMPTZ,

  CONSTRAINT case_risk_range CHECK (risk_score BETWEEN 0 AND 100),

  -- ============================================================
  -- NEVER ONE SIGNAL = BAN, made structural.
  --
  -- Anything statistical -- engine correlation, automation patterns, collusion
  -- graphs, behavioural anomalies -- requires a human. Only findings that are
  -- physically certain may be actioned automatically.
  -- ============================================================
  CONSTRAINT case_auto_action_only_for_certain_categories
    CHECK (auto_actioned = FALSE
           OR category IN ('IMPOSSIBLE_INPUT', 'PROTOCOL_VIOLATION', 'CONFIRMED_SELF_PLAY')),

  -- A decision needs a decider, and a sanction needs a stated reason.
  CONSTRAINT case_decided_has_decider
    CHECK (status NOT IN ('DECIDED','APPEAL_DECIDED')
           OR (decision IS NOT NULL AND decided_at IS NOT NULL
               AND (auto_actioned OR decided_by IS NOT NULL))),
  CONSTRAINT case_sanction_has_note
    CHECK (decision IS NULL OR decision = 'NONE' OR length(btrim(COALESCE(decision_note,''))) > 0)
);

CREATE INDEX fairplay_case_open_idx ON fairplay_case (opened_at)
  WHERE status IN ('OPEN','UNDER_REVIEW','APPEALED');
CREATE INDEX fairplay_case_player_idx ON fairplay_case (player_id, opened_at DESC);

/** The immutable evidence bundle. A case is only as good as what it snapshots. */
CREATE TABLE fairplay_case_signal (
  case_id   TEXT   NOT NULL REFERENCES fairplay_case(id),
  signal_id BIGINT NOT NULL REFERENCES fairplay_signal(id),
  PRIMARY KEY (case_id, signal_id)
);

CREATE TRIGGER fairplay_case_signal_immutable
  BEFORE UPDATE OR DELETE ON fairplay_case_signal
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE TABLE fairplay_case_event (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id    TEXT        NOT NULL REFERENCES fairplay_case(id),
  event      TEXT        NOT NULL,
  actor_type TEXT        NOT NULL,
  actor_id   TEXT,
  detail     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER fairplay_case_event_immutable
  BEFORE UPDATE OR DELETE ON fairplay_case_event
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

-- --- Appeals -----------------------------------------------------------------

CREATE TABLE fairplay_appeal (
  id           TEXT        PRIMARY KEY,
  case_id      TEXT        NOT NULL REFERENCES fairplay_case(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  player_note  TEXT,
  reviewed_by  TEXT        REFERENCES admin_user(id),
  reviewed_at  TIMESTAMPTZ,
  upheld       BOOLEAN,
  reviewer_note TEXT,

  CONSTRAINT appeal_one_per_case UNIQUE (case_id),
  CONSTRAINT appeal_reviewed_has_reviewer
    CHECK (upheld IS NULL OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);

/**
 * An appeal must be reviewed by someone other than whoever decided the case.
 *
 * Enforced by trigger rather than CHECK because it spans two tables. Without
 * it, "appeal" means "ask the same person again", which is not an appeal.
 */
CREATE FUNCTION appeal_reviewer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_decider TEXT;
BEGIN
  IF NEW.reviewed_by IS NULL THEN RETURN NEW; END IF;
  SELECT decided_by INTO v_decider FROM fairplay_case WHERE id = NEW.case_id;
  IF v_decider IS NOT NULL AND v_decider = NEW.reviewed_by THEN
    RAISE EXCEPTION
      'an appeal must be reviewed by someone other than the admin who decided the case'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fairplay_appeal_independent_reviewer
  BEFORE INSERT OR UPDATE ON fairplay_appeal
  FOR EACH ROW EXECUTE FUNCTION appeal_reviewer_guard();

-- --- The relationship graph --------------------------------------------------

CREATE TYPE link_type AS ENUM (
  'SHARED_DEVICE', 'SHARED_NETWORK', 'SHARED_FUNDING',
  'REPEATED_PAIRING', 'VALUE_FLOW', 'REFERRAL'
);

CREATE TABLE account_link (
  player_a   TEXT      NOT NULL REFERENCES player(id),
  player_b   TEXT      NOT NULL REFERENCES player(id),
  link_type  link_type NOT NULL,
  strength   NUMERIC(4,3) NOT NULL,
  detail     JSONB     NOT NULL DEFAULT '{}'::jsonb,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (player_a, player_b, link_type),
  -- Stored in one direction only (a < b), so an edge cannot exist twice with
  -- its endpoints swapped and quietly double-count in the graph.
  CONSTRAINT account_link_canonical_order CHECK (player_a < player_b),
  CONSTRAINT account_link_strength_range CHECK (strength BETWEEN 0 AND 1)
);

CREATE INDEX account_link_b_idx ON account_link (player_b, link_type);

/**
 * How often did these two actually meet, and how often would we EXPECT them to?
 *
 * We control matchmaking, so the expected frequency is arithmetic rather than
 * suspicion: with N eligible players in a pool, any given pair should meet
 * roughly 1/(N-1) of the time. A pair meeting far more often than that is a
 * fact, not a hunch.
 */
CREATE FUNCTION pairing_frequency(p_a TEXT, p_b TEXT)
RETURNS TABLE (met INT, a_total INT, b_total INT) LANGUAGE sql STABLE AS $$
  SELECT
    (SELECT count(*)::INT FROM duel d
      WHERE (d.seat_0 = p_a AND d.seat_1 = p_b) OR (d.seat_0 = p_b AND d.seat_1 = p_a)),
    (SELECT count(*)::INT FROM duel d WHERE d.seat_0 = p_a OR d.seat_1 = p_a),
    (SELECT count(*)::INT FROM duel d WHERE d.seat_0 = p_b OR d.seat_1 = p_b);
$$;

/**
 * Net value moved between two players through settled cash duels.
 *
 * Persistently one-directional flow between a pair is the signature of chip
 * dumping -- which is also value transfer, and therefore an AML control as much
 * as a fair-play one.
 */
CREATE VIEW duel_value_flow AS
SELECT
  LEAST(d.seat_0, d.seat_1)    AS player_a,
  GREATEST(d.seat_0, d.seat_1) AS player_b,
  count(*)::INT                AS duels,
  sum(CASE
        WHEN d.result = '1-0' AND d.seat_0 = LEAST(d.seat_0, d.seat_1) THEN d.stake_minor
        WHEN d.result = '0-1' AND d.seat_1 = LEAST(d.seat_0, d.seat_1) THEN d.stake_minor
        ELSE -d.stake_minor
      END)::BIGINT             AS net_to_a
FROM duel d
WHERE d.status = 'SETTLED' AND d.tier = 'CASH' AND d.result <> '1/2-1/2'
GROUP BY 1, 2;
