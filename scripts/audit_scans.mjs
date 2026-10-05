import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".turbo",
  ".claude"
]);

function walk(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, fileList);
    } else if (entry.isFile() && /\.(mjs|js|ts|tsx|json|md)$/.test(entry.name)) {
      fileList.push(full);
    }
  }
  return fileList;
}

const allFiles = walk(ROOT);
console.log(`Total scanned files: ${allFiles.length}`);

// Patterns to search
const SEARCH_PATTERNS = [
  { label: "10 games reference", regex: /\b10\s+games\b/i },
  { label: "11 games reference", regex: /\b11\s+games\b/i },
  { label: "Deterministic / Zero RNG claim", regex: /\b(zero\s+rng|no\s+luck|100%\s+deterministic|pure\s+skill)\b/i },
  { label: "Non-custodial claim", regex: /\bnon-custodial\b/i },
  { label: "Instant payout/withdrawal claim", regex: /\binstant\s+(payout|withdrawal|cashout)\b/i },
  { label: "TODO / FIXME / HACK", regex: /\b(TODO|FIXME|HACK)\b/ },
  { label: "Mock / Fake / Demo", regex: /\b(mock|fake|dummy|sample\s+data)\b/i },
  { label: "Fee percentage", regex: /\b(12%|88%|10%|15%)\b/ },
];

const results = {};
for (const p of SEARCH_PATTERNS) results[p.label] = [];

for (const f of allFiles) {
  const rel = path.relative(ROOT, f);
  // Skip test files for mock/fake searches
  const isTest = rel.includes("test") || rel.includes("spec");
  try {
    const content = fs.readFileSync(f, "utf8");
    const lines = content.split("\n");
    lines.forEach((line, idx) => {
      for (const p of SEARCH_PATTERNS) {
        if (p.label === "Mock / Fake / Demo" && isTest) continue;
        if (p.regex.test(line)) {
          results[p.label].push({
            file: rel,
            line: idx + 1,
            text: line.trim().slice(0, 140)
          });
        }
      }
    });
  } catch (err) {}
}

console.log("\n=== AUDIT SCAN FINDINGS SUMMARY ===");
for (const [label, matches] of Object.entries(results)) {
  console.log(`\n[${label}]: ${matches.length} occurrences`);
  // print first 5
  matches.slice(0, 8).forEach(m => {
    console.log(`  ${m.file}:${m.line} -> ${m.text}`);
  });
  if (matches.length > 8) {
    console.log(`  ... and ${matches.length - 8} more`);
  }
}
