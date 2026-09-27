const fs = require('fs');

let schema = fs.readFileSync('db/full_schema.sql', 'utf8');

// 1. Update duel table
schema = schema.replace(
  '  seat_1             TEXT        NOT NULL REFERENCES player(id),',
  '  seat_1             TEXT        NOT NULL REFERENCES player(id),\n  seat_2             TEXT        REFERENCES player(id),\n  seat_3             TEXT        REFERENCES player(id),'
);

schema = schema.replace(
  '  CONSTRAINT duel_distinct_players CHECK (seat_0 <> seat_1),',
  `  CONSTRAINT duel_distinct_players CHECK (
    seat_0 <> seat_1
    AND (seat_2 IS NULL OR (seat_2 <> seat_0 AND seat_2 <> seat_1))
    AND (seat_3 IS NULL OR (seat_3 <> seat_0 AND seat_3 <> seat_1 AND seat_3 <> seat_2))
  ),`
);

// 2. Update mm_pair function signature
schema = schema.replace(
  ') RETURNS TABLE (duel_id TEXT, seat_0 TEXT, seat_1 TEXT, created BOOLEAN)',
  ') RETURNS TABLE (duel_id TEXT, seat_0 TEXT, seat_1 TEXT, seat_2 TEXT, seat_3 TEXT, created BOOLEAN)'
);

// 3. Update mm_pair function variables
schema = schema.replace(
  '  v_seat1      TEXT;\n  v_existing   TEXT;',
  '  v_seat1      TEXT;\n  v_seat2      TEXT;\n  v_seat3      TEXT;\n  c            matchmaking_ticket;\n  d_tick       matchmaking_ticket;\n  v_existing   TEXT;'
);

// 4. Update mm_pair pairing logic
const oldPairingLogic = `  -- Closest rated opponent inside the band. The unique active-ticket index
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
                   LEAST(a.id, b.id) || ':' || GREATEST(a.id, b.id);`;

const newPairingLogic = `  -- 4-player pairing
  IF p_mode LIKE '%-4p' THEN
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
    
    SELECT * INTO c
      FROM matchmaking_ticket t
     WHERE t.status = 'ACTIVE' AND t.game_id = p_game_id AND t.mode = p_mode
       AND t.tier = p_tier AND t.stake_minor = p_stake_minor
       AND t.expires_at > now()
       AND t.id NOT IN (a.id, b.id)
       AND t.player_id NOT IN (a.player_id, b.player_id)
       AND ABS(t.rating_x100 - a.rating_x100) <= v_spread
     ORDER BY ABS(t.rating_x100 - a.rating_x100), t.enqueued_at, t.id
     FOR UPDATE SKIP LOCKED
     LIMIT 1;
    IF c IS NULL THEN RETURN; END IF;
    
    SELECT * INTO d_tick
      FROM matchmaking_ticket t
     WHERE t.status = 'ACTIVE' AND t.game_id = p_game_id AND t.mode = p_mode
       AND t.tier = p_tier AND t.stake_minor = p_stake_minor
       AND t.expires_at > now()
       AND t.id NOT IN (a.id, b.id, c.id)
       AND t.player_id NOT IN (a.player_id, b.player_id, c.player_id)
       AND ABS(t.rating_x100 - a.rating_x100) <= v_spread
     ORDER BY ABS(t.rating_x100 - a.rating_x100), t.enqueued_at, t.id
     FOR UPDATE SKIP LOCKED
     LIMIT 1;
    IF d_tick IS NULL THEN RETURN; END IF;
    
    -- Sort player IDs for deterministic seating
    WITH sorted AS (
      SELECT player_id FROM (
        VALUES (a.player_id), (b.player_id), (c.player_id), (d_tick.player_id)
      ) AS p(player_id) ORDER BY player_id
    )
    SELECT ARRAY(SELECT player_id FROM sorted) INTO v_seat0, v_seat1, v_seat2, v_seat3; -- Note this isn't standard PL/pgSQL array assignment to scalars directly, we'll do it right.
  ELSE
    -- 2-player pairing
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

    IF a.player_id < b.player_id THEN
      v_seat0 := a.player_id; v_seat1 := b.player_id;
    ELSE
      v_seat0 := b.player_id; v_seat1 := a.player_id;
    END IF;
    v_seat2 := NULL;
    v_seat3 := NULL;
  END IF;

  IF p_mode LIKE '%-4p' THEN
      v_pairing_key := p_game_id || ':' || p_mode || ':' || p_tier || ':' || 
                       LEAST(a.id, b.id, c.id, d_tick.id) || ':' || 
                       GREATEST(a.id, b.id, c.id, d_tick.id); -- Simplified, not truly perfect combination but good enough for idempotency.
      -- Better pairing key for 4p:
      WITH sorted_ids AS (
        SELECT id FROM (VALUES (a.id), (b.id), (c.id), (d_tick.id)) AS t(id) ORDER BY id
      )
      SELECT p_game_id || ':' || p_mode || ':' || p_tier || ':' || string_agg(id, ':') INTO v_pairing_key FROM sorted_ids;
      
      WITH sorted_players AS (
        SELECT player_id FROM (VALUES (a.player_id), (b.player_id), (c.player_id), (d_tick.player_id)) AS t(player_id) ORDER BY player_id
      )
      SELECT 
        (SELECT player_id FROM sorted_players LIMIT 1 OFFSET 0),
        (SELECT player_id FROM sorted_players LIMIT 1 OFFSET 1),
        (SELECT player_id FROM sorted_players LIMIT 1 OFFSET 2),
        (SELECT player_id FROM sorted_players LIMIT 1 OFFSET 3)
      INTO v_seat0, v_seat1, v_seat2, v_seat3;
  ELSE
      v_pairing_key := p_game_id || ':' || p_mode || ':' || p_tier || ':' ||
                       LEAST(a.id, b.id) || ':' || GREATEST(a.id, b.id);
  END IF;`;

schema = schema.replace(oldPairingLogic, newPairingLogic);

// 5. Update mm_pair existing return
schema = schema.replace(
  'RETURN QUERY SELECT v_existing, v_seat0, v_seat1, FALSE;',
  'RETURN QUERY SELECT v_existing, v_seat0, v_seat1, v_seat2, v_seat3, FALSE;'
);

// 6. Update mm_pair insert
schema = schema.replace(
  'INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1,',
  'INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1, seat_2, seat_3,'
);
schema = schema.replace(
  'SELECT p_duel_id, p_game_id, g.plugin_version, v_pairing_key, v_seat0, v_seat1,',
  'SELECT p_duel_id, p_game_id, g.plugin_version, v_pairing_key, v_seat0, v_seat1, v_seat2, v_seat3,'
);
schema = schema.replace(
  'RETURN QUERY SELECT p_duel_id, v_seat0, v_seat1, TRUE;',
  'RETURN QUERY SELECT p_duel_id, v_seat0, v_seat1, v_seat2, v_seat3, TRUE;'
);

fs.writeFileSync('db/full_schema.sql', schema);
console.log('done updating full_schema.sql');
