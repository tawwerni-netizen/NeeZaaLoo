import fs from 'node:fs';
import path from 'node:path';

const locales = ['en', 'ar', 'es', 'fr', 'hi', 'zh'];
const dir = 'H:/Claide Apps/nizalo/packages/i18n/locales';

function flattenKeys(obj, prefix = '') {
  let keys = {};
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(keys, flattenKeys(v, fullKey));
    } else {
      keys[fullKey] = v;
    }
  }
  return keys;
}

const data = {};
const keySets = {};

for (const loc of locales) {
  const file = path.join(dir, `${loc}.json`);
  const content = JSON.parse(fs.readFileSync(file, 'utf8'));
  data[loc] = flattenKeys(content);
  keySets[loc] = new Set(Object.keys(data[loc]));
}

const allKeys = new Set();
for (const loc of locales) {
  for (const k of keySets[loc]) {
    allKeys.add(k);
  }
}

console.log(`Total unique keys across all locales: ${allKeys.size}`);
for (const loc of locales) {
  console.log(`${loc}: ${keySets[loc].size} keys`);
}

// Find keys missing in each locale
for (const loc of locales) {
  const missing = [];
  for (const k of allKeys) {
    if (!keySets[loc].has(k)) {
      missing.push(k);
    }
  }
  console.log(`\nLocale [${loc}] is missing ${missing.length} keys:`);
  if (missing.length > 0 && missing.length <= 30) {
    console.log(missing.join('\n'));
  } else if (missing.length > 30) {
    console.log(missing.slice(0, 25).join('\n') + `\n... and ${missing.length - 25} more`);
  }
}
