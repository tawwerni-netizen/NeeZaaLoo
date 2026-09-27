BEGIN;

INSERT INTO game (id, display_name, is_live, plugin_version)
VALUES ('ludo', 'Ludo', true, 1)
ON CONFLICT (id) DO NOTHING;

DROP FUNCTION IF EXISTS mm_pair(TEXT, TEXT, entry_tier, BIGINT, TEXT, JSONB, JSONB, TEXT, TEXT);

CREATE OR REPLACE FUNCTION mm_pair(
  p_game_id     TEXT,
  p_mode        TEXT,
  p_tier        entry_tier,
  p_stake_minor BIGINT,
  p_duel_id     TEXT,
  p_initial     JSONB,
  p_time_control JSONB,
  p_seed        TEXT DEFAULT NULL,
  p_asset       TEXT DEFAULT NULL
) RETURNS TABLE (duel_id TEXT, seat_0 TEXT, seat_1 TEXT, seat_2 TEXT, seat_3 TEXT, created BOOLEAN)
LANGUAGE plpgsql AS $$
DECLARE
  a            matchmaking_ticket;
  b            matchmaking_ticket;
  c            matchmaking_ticket;
  d            matchmaking_ticket;
  v_spread     INT;
  v_pairing_key TEXT;
  v_seat0      TEXT;
  v_seat1      TEXT;
  v_seat2      TEXT;
  v_seat3      TEXT;
  v_existing   TEXT;
  v_rake_bps      INT;
  v_rule_id       TEXT;
  v_rule_version  INT;
  v_min_rake      BIGINT;
  v_max_rake      BIGINT;
  v_is_4p         BOOLEAN;
BEGIN
  v_is_4p := p_mode LIKE '%-4p';

  -- Oldest waiting ticket first: fairness is "longest wait gets served".
  SELECT * INTO a
    FROM matchmaking_ticket t
   WHERE t.status = 'ACTIVE' AND t.game_id = p_game_id AND t.mode = p_mode
     AND t.tier = p_tier AND t.stake_minor = p_stake_minor
     AND (t.asset IS NOT DISTINCT FROM p_asset)
     AND t.expires_at > now()
   ORDER BY t.enqueued_at, t.id
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF a IS NULL THEN RETURN; END IF;

  v_spread := mm_allowed_spread_x100(EXTRACT(EPOCH FROM (now() - a.enqueued_at)));

  -- Closest rated opponent inside the band.
  SELECT * INTO b
    FROM matchmaking_ticket t
   WHERE t.status = 'ACTIVE' AND t.game_id = p_game_id AND t.mode = p_mode
     AND t.tier = p_tier AND t.stake_minor = p_stake_minor
     AND (t.asset IS NOT DISTINCT FROM p_asset)
     AND t.expires_at > now()
     AND t.id <> a.id
     AND t.player_id <> a.player_id
     AND ABS(t.rating_x100 - a.rating_x100) <= v_spread
   ORDER BY ABS(t.rating_x100 - a.rating_x100), t.enqueued_at, t.id
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF b IS NULL THEN RETURN; END IF;

  IF v_is_4p THEN
    SELECT * INTO c
      FROM matchmaking_ticket t
     WHERE t.status = 'ACTIVE' AND t.game_id = p_game_id AND t.mode = p_mode
       AND t.tier = p_tier AND t.stake_minor = p_stake_minor
       AND (t.asset IS NOT DISTINCT FROM p_asset)
       AND t.expires_at > now()
       AND t.id NOT IN (a.id, b.id)
       AND t.player_id NOT IN (a.player_id, b.player_id)
       AND ABS(t.rating_x100 - a.rating_x100) <= v_spread
     ORDER BY ABS(t.rating_x100 - a.rating_x100), t.enqueued_at, t.id
     FOR UPDATE SKIP LOCKED
     LIMIT 1;

    IF c IS NULL THEN RETURN; END IF;

    SELECT * INTO d
      FROM matchmaking_ticket t
     WHERE t.status = 'ACTIVE' AND t.game_id = p_game_id AND t.mode = p_mode
       AND t.tier = p_tier AND t.stake_minor = p_stake_minor
       AND (t.asset IS NOT DISTINCT FROM p_asset)
       AND t.expires_at > now()
       AND t.id NOT IN (a.id, b.id, c.id)
       AND t.player_id NOT IN (a.player_id, b.player_id, c.player_id)
       AND ABS(t.rating_x100 - a.rating_x100) <= v_spread
     ORDER BY ABS(t.rating_x100 - a.rating_x100), t.enqueued_at, t.id
     FOR UPDATE SKIP LOCKED
     LIMIT 1;

    IF d IS NULL THEN RETURN; END IF;
  END IF;

  -- Seat assignment is deterministic from the pairing.
  -- For 2P, just sort a and b. For 4P, sort all 4.
  IF v_is_4p THEN
    WITH sorted_players AS (
      SELECT player_id, id FROM unnest(ARRAY[(a.player_id, a.id), (b.player_id, b.id), (c.player_id, c.id), (d.player_id, d.id)]) AS p(player_id TEXT, id BIGINT)
      ORDER BY player_id
    )
    SELECT array_agg(player_id) INTO v_seat0 FROM sorted_players;
    -- well, array_agg into a single variable doesn't unpack. Let's just unpack directly.
    -- Wait, doing it in PL/pgSQL arrays is easier. Let's do a simple min/max sort manually or via array.
  END IF;

  -- Let's just use array sorting properly:
  IF v_is_4p THEN
    SELECT p[1], p[2], p[3], p[4]
      INTO v_seat0, v_seat1, v_seat2, v_seat3
      FROM (SELECT array_agg(pid ORDER BY pid) as p FROM unnest(ARRAY[a.player_id, b.player_id, c.player_id, d.player_id]) as pid) as sub;
      
    -- pairing_key: include all 4 sorted ticket IDs
    v_pairing_key := p_game_id || ':' || p_mode || ':' || p_tier || ':' || 
      (SELECT string_agg(tid::text, ':' ORDER BY tid) FROM unnest(ARRAY[a.id, b.id, c.id, d.id]) AS tid);
  ELSE
    IF a.player_id < b.player_id THEN
      v_seat0 := a.player_id; v_seat1 := b.player_id;
    ELSE
      v_seat0 := b.player_id; v_seat1 := a.player_id;
    END IF;
    v_seat2 := NULL;
    v_seat3 := NULL;
    v_pairing_key := p_game_id || ':' || p_mode || ':' || p_tier || ':' ||
                     LEAST(a.id, b.id) || ':' || GREATEST(a.id, b.id);
  END IF;

  -- Idempotent: a retried pairing returns the duel it already made.
  SELECT du.id INTO v_existing FROM duel du WHERE du.pairing_key = v_pairing_key;
  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_existing, v_seat0, v_seat1, v_seat2, v_seat3, FALSE;
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

  INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1, seat_2, seat_3,
                    tier, stake_minor, asset, initial_state, seed, time_control, status,
                    priced_rake_bps, priced_economy_rule_id, priced_economy_rule_version,
                    priced_min_rake_minor, priced_max_rake_minor, priced_at)
  SELECT p_duel_id, p_game_id, g.plugin_version, v_pairing_key, v_seat0, v_seat1, v_seat2, v_seat3,
         p_tier, p_stake_minor,
         p_asset,
         p_initial, p_seed, p_time_control,
         (CASE WHEN p_tier = 'CASH' THEN 'RESERVED' ELSE 'READY' END)::duel_status,
         v_rake_bps, v_rule_id, v_rule_version, v_min_rake, v_max_rake,
         CASE WHEN p_tier = 'CASH' THEN now() ELSE NULL END
    FROM game g WHERE g.id = p_game_id;

  IF v_is_4p THEN
    UPDATE matchmaking_ticket
       SET status = 'MATCHED', duel_id = p_duel_id
     WHERE id IN (a.id, b.id, c.id, d.id);
  ELSE
    UPDATE matchmaking_ticket
       SET status = 'MATCHED', duel_id = p_duel_id
     WHERE id IN (a.id, b.id);
  END IF;

  RETURN QUERY SELECT p_duel_id, v_seat0, v_seat1, v_seat2, v_seat3, TRUE;
END;
$$;

COMMIT;
