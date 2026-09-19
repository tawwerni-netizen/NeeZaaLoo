const fs = require('fs');
let text = fs.readFileSync('packages/matchmaking/src/dispatch.mjs', 'utf8');

text = text.replace(/await store\.markLive\(duel\);\s*return \{ duelId/g, '// DO NOT markLive here! Gateway will do it when both clients connect.\\n    return { duelId');

fs.writeFileSync('packages/matchmaking/src/dispatch.mjs', text);
