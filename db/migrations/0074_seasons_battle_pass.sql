-- Migration 0074: Seasons & Battle Pass
-- Introduces a Battle Pass system where Seasonal EXP is accumulated from daily challenges
-- and gameplay, unlocking Free and Premium reward tiers.

CREATE TABLE season (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE battle_pass_tier (
  season_id             TEXT NOT NULL REFERENCES season(id),
  level                 INT NOT NULL CHECK (level > 0),
  required_exp          INT NOT NULL CHECK (required_exp > 0),
  
  -- Free track
  free_reward_type      TEXT, -- 'ASSET'
  free_reward_asset     TEXT,
  free_reward_amount    BIGINT,
  
  -- Premium track
  premium_reward_type   TEXT, -- 'ASSET'
  premium_reward_asset  TEXT,
  premium_reward_amount BIGINT,
  
  PRIMARY KEY (season_id, level)
);

CREATE TABLE battle_pass_premium (
  player_id     TEXT NOT NULL REFERENCES player(id),
  season_id     TEXT NOT NULL REFERENCES season(id),
  purchased_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, season_id)
);

CREATE TABLE battle_pass_claim (
  id          TEXT PRIMARY KEY,
  player_id   TEXT NOT NULL REFERENCES player(id),
  season_id   TEXT NOT NULL REFERENCES season(id),
  level       INT NOT NULL,
  is_premium  BOOLEAN NOT NULL DEFAULT FALSE,
  claimed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, season_id, level, is_premium)
);

-- Pre-seed Season 1
INSERT INTO season (id, name, starts_at, ends_at)
VALUES (
  'season_1',
  'Season 1: Launch',
  now() - interval '1 day',
  now() + interval '60 days'
);

-- Pre-seed some tiers for Season 1
INSERT INTO battle_pass_tier (season_id, level, required_exp, free_reward_type, free_reward_asset, free_reward_amount, premium_reward_type, premium_reward_asset, premium_reward_amount) VALUES
  ('season_1', 1, 100,  'ASSET', 'USDT', 500000,    'ASSET', 'USDT', 2000000),
  ('season_1', 2, 250,  NULL,    NULL,   NULL,      'ASSET', 'USDT', 3000000),
  ('season_1', 3, 500,  'ASSET', 'USDT', 1000000,   'ASSET', 'USDT', 5000000),
  ('season_1', 4, 1000, NULL,    NULL,   NULL,      'ASSET', 'USDT', 7000000),
  ('season_1', 5, 2000, 'ASSET', 'USDT', 2500000,   'ASSET', 'USDT', 15000000);
