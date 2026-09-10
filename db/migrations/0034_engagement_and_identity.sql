-- =============================================================================
-- 0034_engagement_and_identity.sql
--
-- Long-term player engagement and identity: mastery, streaks, daily
-- challenges, replay favorites/watch-history, profile frames, and a wider
-- achievement/badge catalog. Deliberately NOT included as a new table:
--
--   * Per-game MASTERY is never stored. It is a pure function of data that
--     already exists and is already authoritative -- `rating.games_played`
--     and `game_rating_percentile.percentile` (migration 0011) -- computed
--     fresh on every read by packages/mastery, the same way Global Skill
--     is computed fresh by packages/global-skill rather than cached. A
--     stored mastery LEVEL could drift from the rating data that is
--     supposed to justify it; a computed one cannot.
--   * GLOBAL SKILL and per-game RATING already exist in full (migrations
--     0003, 0011) and are untouched here.
--
-- What IS new: the state that genuinely has no other home --
-- daily-challenge assignment/progress, streak length, replay
-- favorite/watched marks, and the frame cosmetic (structurally identical
-- to `badge`/`player_badge` from migration 0020, since a frame is the
-- same "catalog + one-row-per-grant + one-selected-at-a-time" shape).
-- =============================================================================

-- --- Achievement / badge catalog expansion ------------------------------------
-- Still "infrastructure first" (migration 0020's own words) -- a handful
-- of new, genuinely distinct roadmap goals, not "dozens of unlocks".
-- MASTERY_* and STREAK_* are account-wide ("in ANY game" / "any streak"),
-- not per-game, so one row each suffices; a per-game mastery achievement
-- would need 10x the rows for no real product value the roadmap asks for.

INSERT INTO achievement (code) VALUES
  ('TOURNAMENT_CHAMPION'),
  ('MASTERY_ADVANCED_ANY'),
  ('MASTERY_EXPERT_ANY'),
  ('MASTERY_MASTER_ANY'),
  ('MULTI_GAME_CHAMPION'),
  ('STREAK_7'),
  ('STREAK_30');

INSERT INTO badge (code, kind) VALUES
  ('TOURNAMENT_CHAMPION', 'EARNED'),
  ('MASTERY_ADVANCED_ANY', 'EARNED'),
  ('MASTERY_EXPERT_ANY', 'EARNED'),
  ('MASTERY_MASTER_ANY', 'EARNED'),
  ('MULTI_GAME_CHAMPION', 'EARNED'),
  ('STREAK_7', 'EARNED'),
  ('STREAK_30', 'EARNED');

-- --- Frames --------------------------------------------------------------------
-- A decorative border around a player's avatar -- mechanically identical
-- to badge/player_badge/selected_badge_code, kept as its own table rather
-- than folded into `badge` because a frame and a badge render in
-- different places on every profile surface and a player selects one of
-- EACH independently (a frame is not a kind of badge, it just shares the
-- same earn/select shape).

CREATE TABLE frame (
  code       TEXT        PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE player_frame (
  player_id  TEXT        NOT NULL REFERENCES player(id),
  frame_code TEXT        NOT NULL REFERENCES frame(code),
  earned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, frame_code)
);

ALTER TABLE player
  ADD COLUMN selected_frame_code TEXT REFERENCES frame(code);

INSERT INTO frame (code) VALUES ('STREAK_7_FRAME'), ('STREAK_30_FRAME');

-- --- Healthy streaks -----------------------------------------------------------
-- One activity credit per UTC calendar day, for finishing ANY real duel
-- (including a VS_COMPUTER training match -- see packages/engagement's
-- own header for why this differs from the EXP/achievement gate, which
-- excludes training matches). Never gated on tier, stake, or a deposit --
-- directive-level requirement, not an implementation detail: a FREE-tier
-- player and a CASH-tier player build the exact same streak from the
-- exact same rule.

CREATE TABLE player_streak (
  player_id          TEXT        PRIMARY KEY REFERENCES player(id),
  current_length     INT         NOT NULL DEFAULT 0,
  longest_length     INT         NOT NULL DEFAULT 0,
  last_activity_date DATE,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency for milestone rewards (3/7/30-day): granting the SAME
-- milestone to the SAME player twice is structurally impossible, the
-- identical pattern player_achievement already uses.
CREATE TABLE streak_reward (
  player_id  TEXT        NOT NULL REFERENCES player(id),
  milestone  INT         NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, milestone)
);

-- --- Daily challenges ------------------------------------------------------
-- `metric` names a real, server-computed signal (see
-- packages/engagement/src/daily-challenges.mjs for the exact query behind
-- each) -- never a value the client reports. `game_id` narrows a metric to
-- one game (e.g. "finish N Speed Math matches"); NULL means the metric
-- already applies across every game. No deposit, stake, or CASH-tier
-- requirement appears anywhere in this catalog -- directive requirement,
-- not an oversight.

CREATE TABLE daily_challenge_template (
  id           TEXT    PRIMARY KEY,
  code         TEXT    NOT NULL UNIQUE,
  metric       TEXT    NOT NULL,
  game_id      TEXT    REFERENCES game(id),
  target_count INT     NOT NULL CHECK (target_count > 0),
  exp_reward   INT     NOT NULL CHECK (exp_reward > 0),
  active       BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO daily_challenge_template (id, code, metric, game_id, target_count, exp_reward) VALUES
  ('dct_win_free',       'WIN_FREE_MATCHES',    'WIN_FREE_MATCHES',     NULL,          3, 30),
  ('dct_speed_math',     'PLAY_SPEED_MATH',     'PLAY_GAME_MATCHES',    'speed-math', 10, 25),
  ('dct_diff_games',     'PLAY_DIFFERENT_GAMES','PLAY_DIFFERENT_GAMES', NULL,          2, 20),
  ('dct_watch_replay',   'WATCH_A_REPLAY',      'WATCH_REPLAYS',        NULL,          1, 15),
  ('dct_training',       'FINISH_TRAINING',     'FINISH_TRAINING',      NULL,          1, 15);

-- One assignment row per (player, template, day) -- a player sees the
-- SAME small set of challenges all day even if this row is looked up
-- from ten different requests; progress_count is recomputed from the
-- real underlying signal on every read (see the service), never
-- incremented by a client-reported event, so it can never be inflated by
-- a retried or replayed request.
CREATE TABLE daily_challenge_assignment (
  id             TEXT        PRIMARY KEY,
  player_id      TEXT        NOT NULL REFERENCES player(id),
  template_id    TEXT        NOT NULL REFERENCES daily_challenge_template(id),
  assigned_date  DATE        NOT NULL,
  progress_count INT         NOT NULL DEFAULT 0,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (player_id, template_id, assigned_date)
);

CREATE INDEX daily_challenge_assignment_today_idx
  ON daily_challenge_assignment (player_id, assigned_date);

-- --- Replay center ---------------------------------------------------------
-- The moves/outcome themselves are never stored twice -- a replay is
-- always rebuilt on demand from `duel_event` (migration 0003) via
-- packages/duel-engine's own serializeReplay(). These two tables record
-- only which duels a player marked as a favorite or has actually opened,
-- which is real per-viewer state that has nowhere else to live.

CREATE TABLE player_replay_favorite (
  player_id    TEXT        NOT NULL REFERENCES player(id),
  duel_id      TEXT        NOT NULL REFERENCES duel(id),
  favorited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, duel_id)
);

-- First-view timestamp only -- ON CONFLICT DO NOTHING on a re-watch (see
-- the service), both because "watched" is a one-time fact and because
-- the daily "watch a replay" challenge must count a distinct replay once,
-- not once per click.
CREATE TABLE replay_view (
  player_id  TEXT        NOT NULL REFERENCES player(id),
  duel_id    TEXT        NOT NULL REFERENCES duel(id),
  viewed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, duel_id)
);

CREATE INDEX replay_view_player_idx ON replay_view (player_id, viewed_at DESC);
