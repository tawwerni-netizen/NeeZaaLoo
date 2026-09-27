BEGIN;

ALTER TABLE duel ADD COLUMN seat_2 TEXT REFERENCES player(id);
ALTER TABLE duel ADD COLUMN seat_3 TEXT REFERENCES player(id);

ALTER TABLE duel DROP CONSTRAINT duel_distinct_players;
ALTER TABLE duel ADD CONSTRAINT duel_distinct_players CHECK (
    seat_0 <> seat_1
    AND (seat_2 IS NULL OR (seat_2 <> seat_0 AND seat_2 <> seat_1))
    AND (seat_3 IS NULL OR (seat_3 <> seat_0 AND seat_3 <> seat_1 AND seat_3 <> seat_2))
);

DROP FUNCTION IF EXISTS mm_pair(TEXT, TEXT, entry_tier, BIGINT, TEXT, JSONB, JSONB, TEXT);
DROP FUNCTION IF EXISTS mm_pair(TEXT, TEXT, entry_tier, BIGINT, TEXT, JSONB, JSONB, TEXT, TEXT);

CREATE OR REPLACE FUNCTION mm_pair(
  p_game_id     TEXT,
  p_mode        TEXT,
  p_tier        entry_tier,
  p_stake_minor BIGINT,
  p_duel_id     TEXT,
  p_initial     JSONB,
  p_time_control JSONB,
  p_seed        TEXT DEFAULT NULL
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
  v_rake_bps      INT;
  v_rule_id       TEXT;
  v_rule_version  INT;
  v_min_rake      BIGINT;
  v_max_rake      BIGINT;
BEGIN
  -- Oldest waiting ticket first: fairness is "longest wait gets served".
  SELECT * INTO a
    FROM matchmaking_ticket t
   WHERE t.status = 'ACTIVE' AND t.game_id = p_game_id AND t.mode = p_mode
     AND t.tier = p_tier AND t.stake_minor = p_stake_minor
     AND t.expires_at > now()
   ORDER BY t.enqueued_at, t.id
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF a IS NULL THEN RETURN; END IF;

  v_spread := mm_allowed_spread_x100(EXTRACT(EPOCH FROM (now() - a.enqueued_at)));

  -- Closest rated opponent inside the band. The unique active-ticket index
  -- already guarantees b.player_id <> a.player_id, but state it anyway: a
  -- future index change must not silently enable self-play.
  SELECT * INTO b
    FROM matchmaking_ticket t
   WHERE t.status = 'ACTIVE' AND t.game_id = p_game_id AND t.mode = p_mode
     AND t.tier = p_tier AND t.stake_minor = p_stake_minor
     AND t.expires_at > now()
     AND t.id <> a.id
     AND t.player_id <> a.player_id
     AND ABS(t.rating_x100 - a.rating_x100) <= v_spread
   ORDER BY ABS(t.rating_x100 - a.rating_x100), t.enqueued_at, t.id
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF b IS NULL THEN RETURN; END IF;

  -- Seat assignment is deterministic from the pairing, not random, so a replay
  -- can be verified without storing which way a coin landed.
  IF a.player_id < b.player_id THEN
    v_seat0 := a.player_id; v_seat1 := b.player_id;
  ELSE
    v_seat0 := b.player_id; v_seat1 := a.player_id;
  END IF;

  v_pairing_key := p_game_id || ':' || p_mode || ':' || p_tier || ':' ||
                   LEAST(a.id, b.id) || ':' || GREATEST(a.id, b.id);

  -- Idempotent: a retried pairing returns the duel it already made.
  SELECT d.id INTO v_existing FROM duel d WHERE d.pairing_key = v_pairing_key;
  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_existing, v_seat0, v_seat1, FALSE;
    RETURN;
  END IF;

  -- Price it NOW, as part of creating it -- not later, at settlement. This
  -- SELECT and the INSERT below run inside the same function invocation
  -- (itself one atomic unit from the caller's point of view), so a
  -- concurrent admin commit to economy_rule either happened-before this
  -- resolution or happens-after it; there is no window in which this
  -- pairing observes one rule but stamps a different one.
  IF p_tier = 'CASH' THEN
    SELECT rake_bps, rule_id, rule_version, min_rake_minor, max_rake_minor
      INTO v_rake_bps, v_rule_id, v_rule_version, v_min_rake, v_max_rake
      FROM economy_resolve(p_game_id, p_tier, now());
    IF v_rake_bps IS NULL THEN
      -- A CASH duel that cannot be priced must not be created at all --
      -- not created and left to fail later at settlement.
      RAISE EXCEPTION 'no economy rule configured for game % tier CASH', p_game_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
                    tier, stake_minor, asset, initial_state, seed, time_control, status,
                    priced_rake_bps, priced_economy_rule_id, priced_economy_rule_version,
                    priced_min_rake_minor, priced_max_rake_minor, priced_at)
  SELECT p_duel_id, p_game_id, g.plugin_version, v_pairing_key, v_seat0, v_seat1,
         p_tier, p_stake_minor,
         CASE WHEN p_tier = 'CASH' THEN 'USDT' ELSE NULL END::TEXT,
         p_initial, p_seed, p_time_control,
         -- A cash duel is RESERVED, not READY: entry fees must be locked in the
         -- ledger before play begins. Only a free duel is ready on creation.
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

COMMIT;
