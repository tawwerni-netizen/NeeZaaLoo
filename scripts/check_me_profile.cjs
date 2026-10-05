const fs = require('fs');
const content = fs.readFileSync('packages/api/src/server.mjs', 'utf8');
const lines = content.split('\n');
const idx = lines.findIndex(l => l.includes('/v1/me/profile') && l.includes('GET'));
console.log(lines.slice(idx, idx + 10).join('\n'));
