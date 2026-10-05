-- =============================================================================
-- 0057_multi_asset_cash_play.sql
--
-- Cash play in any enabled stablecoin: a USDT player stakes USDT, a DAI
-- player stakes DAI, and a winner is paid in exactly the coin that was at
-- risk. No conversion happens anywhere -- custody for each coin only ever
-- backs liabilities in that same coin, so per-asset solvency holds.
--
-- duel, duel_challenge and tournament already carried an asset. The
-- matchmaking queue did not: a cash ticket had no coin, and mm_pair()
-- stamped every cash duel 'USDT'. With per-coin balances that would pair a
-- USDT player against a DAI player and settle both in USDT. So:
--
--   1. matchmaking_ticket.asset -- required for CASH, absent for FREE.
--   2. the pool is (game, mode, tier, stake, ASSET): tickets in different
--      coins never meet.
--   3. mm_pair() takes the asset and stamps the duel with it.
-- =============================================================================

ALTER TABLE matchmaking_ticket ADD COLUMN IF NOT EXISTS asset TEXT REFERENCES asset(code);

-- Existing CASH tickets were all USDT by construction (the only coin that could
-- be staked). FREE tickets carry no coin.
UPDATE matchmaking_ticket SET asset = 'USDT' WHERE tier = 'CASH' AND asset IS NULL;

ALTER TABLE matchmaking_ticket DROP CONSTRAINT IF EXISTS ticket_cash_has_asset;
ALTER TABLE matchmaking_ticket ADD CONSTRAINT ticket_cash_has_asset
  CHECK ((tier = 'CASH') = (asset IS NOT NULL));

DROP INDEX IF EXISTS matchmaking_pool_idx;
CREATE INDEX matchmaking_pool_idx
  ON matchmaking_ticket (game_id, mode, tier, stake_minor, asset, enqueued_at)
  WHERE status = 'ACTIVE';

-- A new trailing parameter is a different signature in Postgres; leaving the
-- old 8-argument function in place would make every call ambiguous.
DROP FUNCTION IF EXISTS mm_pair(TEXT, TEXT, entry_tier, BIGINT, TEXT, JSONB, JSONB, TEXT);

CREATE FUNCTION mm_pair(
  p_game_id     TEXT,
  p_mode        TEXT,
  p_tier        entry_tier,
  p_stake_minor BIGINT,
  p_duel_id     TEXT,
  p_initial     JSONB,
  p_time_control JSONB,
  p_seed        TEXT DEFAULT NULL,
  p_asset       TEXT DEFAULT NULL
) RETURNS TABLE (duel_id TEXT, seat_0 TEXT, seat_1 TEXT, created BOOLEAN)
LANGUAGE plpgsql AS $$
DECLARE
  a            matchmaking_ticket;
  b            matchmaking_ticket;
  v_spread     INT;
  v_pairing_key TEXT;
  v_seat0      TEXT;
  v_seat1      TEXT;
  v_existing   TEXT;
  v_asset      TEXT;
  v_rake_bps      INT;
  v_rule_id       TEXT;
  v_rule_version  INT;
  v_min_rake      BIGINT;
  v_max_rake      BIGINT;
BEGIN
  -- A cash pool is one coin. A caller that names none gets USDT, the coin
  -- every cash ticket was before this migration.
  v_asset := CASE WHEN p_tier = 'CASH' THEN COALESCE(p_asset, 'USDT') ELSE NULL END;

  SELECT * INTO a
    FROM matchmaking_ticket t
   WHERE t.status = 'ACTIVE' AND t.game_id = p_game_id AND t.mode = p_mode
     AND t.tier = p_tier AND t.stake_minor = p_stake_minor
     AND t.asset IS NOT DISTINCT FROM v_asset
     AND t.expires_at > now()
   ORDER BY t.enqueued_at, t.id
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF a IS NULL THEN RETURN; END IF;

  v_spread := mm_allowed_spread_x100(EXTRACT(EPOCH FROM (now() - a.enqueued_at)));

  SELECT * INTO b
    FROM matchmaking_ticket t
   WHERE t.status = 'ACTIVE' AND t.game_id = p_game_id AND t.mode = p_mode
     AND t.tier = p_tier AND t.stake_minor = p_stake_minor
     AND t.asset IS NOT DISTINCT FROM v_asset
     AND t.expires_at > now()
     AND t.id <> a.id
     AND t.player_id <> a.player_id
     AND ABS(t.rating_x100 - a.rating_x100) <= v_spread
   ORDER BY ABS(t.rating_x100 - a.rating_x100), t.enqueued_at, t.id
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF b IS NULL THEN RETURN; END IF;

  IF a.player_id < b.player_id THEN
    v_seat0 := a.player_id; v_seat1 := b.player_id;
  ELSE
    v_seat0 := b.player_id; v_seat1 := a.player_id;
  END IF;

  v_pairing_key := p_game_id || ':' || p_mode || ':' || p_tier || ':' ||
                   LEAST(a.id, b.id) || ':' || GREATEST(a.id, b.id);

  SELECT d.id INTO v_existing FROM duel d WHERE d.pairing_key = v_pairing_key;
  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_existing, v_seat0, v_seat1, FALSE;
    RETURN;
  END IF;

  IF p_tier = 'CASH' THEN
    SELECT rake_bps, rule_id, rule_version, min_rake_minor, max_rake_minor
      INTO v_rake_bps, v_rule_id, v_rule_version, v_min_rake, v_max_rake
      FROM economy_resolve(p_game_id, p_tier, now());
    IF v_rake_bps IS NULL THEN
      RAISE EXCEPTION 'no economy rule configured for game % tier CASH', p_game_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
                    tier, stake_minor, asset, initial_state, seed, time_control, status,
                    priced_rake_bps, priced_economy_rule_id, priced_economy_rule_version,
                    priced_min_rake_minor, priced_max_rake_minor, priced_at)
  SELECT p_duel_id, p_game_id, g.plugin_version, v_pairing_key, v_seat0, v_seat1,
         p_tier, p_stake_minor, v_asset,
         p_initial, p_seed, p_time_control,
         (CASE WHEN p_tier = 'CASH' THEN 'RESERVED' ELSE 'READY' END)::duel_status,
         v_rake_bps, v_rule_id, v_rule_version, v_min_rake, v_max_rake,
         CASE WHEN p_tier = 'CASH' THEN now() ELSE NULL END
    FROM game g WHERE g.id = p_game_id;

  UPDATE matchmaking_ticket
     SET status = 'MATCHED', duel_id = p_duel_id
   WHERE id IN (a.id, b.id);

  RETURN QUERY SELECT p_duel_id, v_seat0, v_seat1, TRUE;
END;
$$;

-- A fair-play sanction seizes EVERY balance a player holds, in every coin, to
-- platform:confiscated. 0052 seeded that account for USDT only, so seizing a
-- USDC or DAI balance failed the ledger post and rolled back the whole
-- sanction: a cheater holding any non-USDT coin could not be sanctioned.
INSERT INTO ledger_account (key, owner_type, owner_id, account_type, normal_side, allow_negative, asset, network)
VALUES
  ('platform:confiscated', 'PLATFORM', NULL, 'REVENUE', 'CREDIT', FALSE, 'USDC', NULL),
  ('platform:confiscated', 'PLATFORM', NULL, 'REVENUE', 'CREDIT', FALSE, 'DAI',  NULL)
ON CONFLICT (key, asset) DO NOTHING;
