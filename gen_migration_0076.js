const fs = require('fs');
let schema = fs.readFileSync('db/full_schema.sql', 'utf8');

const match = schema.match(/CREATE OR REPLACE FUNCTION mm_pair[\s\S]*?LANGUAGE plpgsql AS \$\$[\s\S]*?\$\$;/);

if (match) {
  let content = `BEGIN;

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

${match[0]}

COMMIT;
`;

  fs.writeFileSync('db/migrations/0076_ludo_4_player.sql', content);
  console.log('Migration generated.');
}
