const fs = require('fs');
let schema = fs.readFileSync('db/full_schema.sql', 'utf8');

schema = schema.replace(
  '    p_seed        TEXT DEFAULT NULL\n  ) RETURNS TABLE (duel_id TEXT, seat_0 TEXT, seat_1 TEXT, seat_2 TEXT, seat_3 TEXT, created BOOLEAN)',
  '    p_seed        TEXT DEFAULT NULL,\n    p_asset       TEXT DEFAULT NULL\n  ) RETURNS TABLE (duel_id TEXT, seat_0 TEXT, seat_1 TEXT, seat_2 TEXT, seat_3 TEXT, created BOOLEAN)'
);
schema = schema.replace(
  "CASE WHEN p_tier = 'CASH' THEN 'USDT' ELSE NULL END::TEXT,",
  "CASE WHEN p_tier = 'CASH' THEN p_asset ELSE NULL END::TEXT,"
);
fs.writeFileSync('db/full_schema.sql', schema);
console.log('done');
