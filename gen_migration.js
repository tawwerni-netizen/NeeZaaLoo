const fs = require('fs');
const schema = fs.readFileSync('db/full_schema.sql', 'utf8');
const match = schema.match(/CREATE OR REPLACE FUNCTION mm_pair[\s\S]*?LANGUAGE plpgsql AS \$\$[\s\S]*?\$\$;/);
if (match) {
  let content = fs.readFileSync('db/migrations/0076_ludo_4_player.sql', 'utf8');
  content = content.replace(/-- \(The mm_pair function[\s\S]*here\./, match[0]);
  content += '\n\nCOMMIT;\n';
  fs.writeFileSync('db/migrations/0076_ludo_4_player.sql', content);
  console.log('Migration generated.');
} else {
  console.log('mm_pair not found');
}
