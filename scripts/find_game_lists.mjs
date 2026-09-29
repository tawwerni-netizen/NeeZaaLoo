import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const EXCLUDE_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".turbo"]);

function walk(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, fileList);
    else if (entry.isFile() && /\.(mjs|js|ts|tsx|json)$/.test(entry.name)) fileList.push(full);
  }
  return fileList;
}

const allFiles = walk(ROOT);
const targetTokens = ["chess", "dominoes", "backgammon", "speed-math", "xo", "connect-four", "checkers", "reversi", "gomoku", "seega", "ludo"];

const occurrences = [];

for (const file of allFiles) {
  const rel = path.relative(ROOT, file);
  if (rel.includes("test") || rel.includes("canonical-games") || rel.includes("ruleset-registry")) continue;
  try {
    const text = fs.readFileSync(file, "utf8");
    // Look for arrays or lists containing at least 4 of these games
    const matchedTokens = targetTokens.filter(t => text.includes(`"${t}"`) || text.includes(`'${t}'`));
    if (matchedTokens.length >= 5) {
      occurrences.push({
        file: rel,
        count: matchedTokens.length,
        hasLudo: matchedTokens.includes("ludo"),
        tokens: matchedTokens
      });
    }
  } catch (err) {}
}

console.log("=== FILES WITH HARDCODED LISTS OF GAMES (>=5 tokens) ===");
for (const o of occurrences) {
  console.log(`- ${o.file} (Matches: ${o.count}, Has Ludo: ${o.hasLudo})`);
  if (!o.hasLudo) {
    console.log(`   --> MISSING LUDO! Tokens:`, o.tokens);
  }
}
