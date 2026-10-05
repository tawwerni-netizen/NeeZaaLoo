UPDATE rating
SET rating_x100 = 150000 + FLOOR(RANDOM() * 110000)::int
WHERE player_id IN (SELECT id FROM player WHERE is_ai = TRUE OR id LIKE 'bot_%');
