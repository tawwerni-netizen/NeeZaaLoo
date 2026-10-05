import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();

console.log("=== NIZALO AUDIT: PHASE 0 RECONCILIATION ===");

// 1. Inspect RulesetRegistry in packages/duel-engine
const rulesetPath = path.join(ROOT, "packages/duel-engine/src/ruleset-registry.mjs");
const { RulesetRegistry } = await import(pathToFileURL(rulesetPath).href);
const engineGameKeys = Object.keys(RulesetRegistry);
console.log("\n1. Games in packages/duel-engine/src/ruleset-registry.mjs:", engineGameKeys);

// 2. Inspect apps/web/src/lib/games/canonical-games.ts
const canonicalContent = fs.readFileSync(path.join(ROOT, "apps/web/src/lib/games/canonical-games.ts"), "utf8");
const webGameIds = [...canonicalContent.matchAll(/id:\s*"([a-z0-9-]+)"/g)]
  .map(m => m[1])
  .filter(id => !["blitz-3", "rapid-5", "classic-10", "draw", "block", "all-fives", "classic", "quick-rush", "doubling", "traditional", "blitz", "rapid", "standard", "exact5", "classical"].includes(id));
console.log("\n2. Games in apps/web canonical-games.ts:", [...new Set(webGameIds)]);

// 3. Inspect packages/ directory for game packages
const packages = fs.readdirSync(path.join(ROOT, "packages"));
const gamePackages = packages.filter(p => p.startsWith("game-"));
console.log("\n3. Game packages in packages/:", gamePackages);

// 4. Target canonical 11 games reconciliation
const TARGET_11 = [
  "chess",
  "dominoes",
  "ludo",
  "backgammon",
  "speed-math",
  "xo",
  "connect-four",
  "checkers",
  "reversi",
  "gomoku",
  "seega"
];
console.log("\n4. Reconciliation against Target 11:");
for (const g of TARGET_11) {
  const normG = g.replace(/-/g, "_");
  const inRuleset = Boolean(RulesetRegistry[g] || RulesetRegistry[normG]);
  const inWeb = webGameIds.includes(g);
  const inPkg = gamePackages.includes(`game-${g}`);
  console.log(` - ${g.padEnd(14)}: Ruleset: ${inRuleset ? "OK" : "MISSING"} | Web: ${inWeb ? "OK" : "MISSING"} | Pkg: ${inPkg ? "OK" : "MISSING"}`);
}
