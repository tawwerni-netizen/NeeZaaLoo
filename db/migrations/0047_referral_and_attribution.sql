-- =============================================================================
-- 0047_referral_and_attribution.sql
--
-- Referral & Match Result Sharing System:
--  1. `referral_code`: Every user gets exactly one permanent alphanumeric code.
--  2. `referral_attribution`: Links a referred player to their referrer upon registration.
--     Enforces single-attribution and forbids self-attribution at the database layer.
--  3. `referral_reward`: Tracks the one-way monetary reward ($1 USD default)
--     triggered when an attributed player makes their first qualifying confirmed deposit.
--  4. `platform_control` entry: 'REFERRALS' switch for emergency control.
-- =============================================================================

-- Ensure marketing reserve account exists in ledger accounts if not already populated
INSERT INTO ledger_account
  (key, owner_type, owner_id, account_type, normal_side, allow_negative, asset, network)
VALUES
  ('platform:marketing:referral_rewards', 'PLATFORM', NULL, 'LIABILITY', 'CREDIT', TRUE, 'USDT', NULL)
ON CONFLICT (key, asset) DO NOTHING;

-- 1. Permanent Referral Codes
CREATE TABLE referral_code (
  code VARCHAR(16) PRIMARY KEY,
  player_id TEXT NOT NULL UNIQUE REFERENCES player(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_referral_code_player ON referral_code(player_id);

-- Helper function to generate an 8-character unique alphanumeric referral code
CREATE OR REPLACE FUNCTION generate_referral_code(p_handle TEXT)
RETURNS TEXT AS $$
DECLARE
  v_clean_handle TEXT;
  v_suffix TEXT;
  v_code TEXT;
  v_exists BOOLEAN;
  v_attempts INT := 0;
BEGIN
  v_clean_handle := UPPER(SUBSTRING(REGEXP_REPLACE(p_handle, '[^a-zA-Z0-9]', '', 'g') FROM 1 FOR 4));
  IF LENGTH(v_clean_handle) < 3 THEN
    v_clean_handle := 'NZ';
  END IF;

  LOOP
    v_suffix := UPPER(SUBSTRING(MD5(gen_random_uuid()::text) FROM 1 FOR (8 - LENGTH(v_clean_handle))));
    v_code := v_clean_handle || v_suffix;
    
    SELECT EXISTS(SELECT 1 FROM referral_code WHERE code = v_code) INTO v_exists;
    IF NOT v_exists THEN
      RETURN v_code;
    END IF;

    v_attempts := v_attempts + 1;
    IF v_attempts > 20 THEN
      -- Fallback to pure random string
      RETURN 'NZ' || UPPER(SUBSTRING(MD5(gen_random_uuid()::text) FROM 1 FOR 6));
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Auto-assign permanent referral code on player creation
CREATE OR REPLACE FUNCTION trg_assign_referral_code()
RETURNS TRIGGER AS $$
DECLARE
  v_code TEXT;
BEGIN
  v_code := generate_referral_code(NEW.handle);
  INSERT INTO referral_code (code, player_id)
  VALUES (v_code, NEW.id)
  ON CONFLICT (player_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_player_assign_referral_code
  AFTER INSERT ON player
  FOR EACH ROW EXECUTE FUNCTION trg_assign_referral_code();

-- Backfill referral codes for all existing players
INSERT INTO referral_code (code, player_id)
SELECT generate_referral_code(p.handle), p.id
FROM player p
WHERE NOT EXISTS (SELECT 1 FROM referral_code rc WHERE rc.player_id = p.id)
ON CONFLICT (player_id) DO NOTHING;


-- 2. Referral Attribution
CREATE TABLE referral_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referred_player_id TEXT NOT NULL UNIQUE REFERENCES player(id) ON DELETE RESTRICT,
  referrer_player_id TEXT NOT NULL REFERENCES player(id) ON DELETE RESTRICT,
  referral_code VARCHAR(16) NOT NULL REFERENCES referral_code(code),
  attributed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  context_duel_id TEXT NULL REFERENCES duel(id) ON DELETE SET NULL,
  CONSTRAINT chk_no_self_referral CHECK (referred_player_id <> referrer_player_id)
);

CREATE INDEX idx_referral_attribution_referrer ON referral_attribution(referrer_player_id);
CREATE INDEX idx_referral_attribution_code ON referral_attribution(referral_code);


-- 3. Referral Rewards State Machine
CREATE TABLE referral_reward (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribution_id UUID NOT NULL REFERENCES referral_attribution(id) ON DELETE RESTRICT,
  referrer_player_id TEXT NOT NULL REFERENCES player(id) ON DELETE RESTRICT,
  referred_player_id TEXT NOT NULL REFERENCES player(id) ON DELETE RESTRICT,
  qualifying_deposit_id TEXT NOT NULL UNIQUE REFERENCES deposit(id) ON DELETE RESTRICT,
  reward_asset VARCHAR(8) NOT NULL DEFAULT 'USDT',
  reward_amount_minor BIGINT NOT NULL DEFAULT 1000000, -- 1.00 USDT default
  qualifying_threshold_minor BIGINT NOT NULL DEFAULT 5000000, -- 5.00 USDT default
  state VARCHAR(32) NOT NULL DEFAULT 'PENDING'
    CHECK (state IN ('PENDING', 'RISK_CHECK', 'ELIGIBLE', 'FLAGGED_REVIEW', 'SETTLING', 'SETTLED', 'REJECTED_FRAUD')),
  risk_score SMALLINT NULL,
  risk_reasons JSONB NULL,
  ledger_tx_id BIGINT NULL UNIQUE REFERENCES ledger_transaction(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ NULL
);

CREATE INDEX idx_referral_reward_referrer ON referral_reward(referrer_player_id);
CREATE INDEX idx_referral_reward_referred ON referral_reward(referred_player_id);
CREATE INDEX idx_referral_reward_state ON referral_reward(state);

-- Emergency kill-switch control entry
INSERT INTO platform_control (key, enabled, reason)
VALUES ('REFERRALS', TRUE, 'Global kill-switch for referral code attribution and reward settlement')
ON CONFLICT (key) DO NOTHING;
