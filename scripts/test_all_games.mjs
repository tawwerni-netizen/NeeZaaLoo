import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();

const GAMES = [
  { id: "chess", pkg: "game-chess", ruleset: "FIDE 2024", norm: "chess" },
  { id: "dominoes", pkg: "game-dominoes", ruleset: "Draw / All-Fives", norm: "dominoes" },
  { id: "ludo", pkg: "game-ludo", ruleset: "Royal Knockout / Standard 2-4P", norm: "ludo" },
  { id: "backgammon", pkg: "game-backgammon", ruleset: "Standard WBF Race", norm: "backgammon" },
  { id: "speed-math", pkg: "game-speed-math", ruleset: "Arithmetic Sprint 60s", norm: "speed_math" },
  { id: "xo", pkg: "game-xo", ruleset: "Classic 3x3 Tic-Tac-Toe", norm: "xo" },
  { id: "connect-four", pkg: "game-connect-four", ruleset: "Standard 7x6 Gravity", norm: "connect_four" },
  { id: "checkers", pkg: "game-checkers", ruleset: "American Checkers / Mandatory Jump", norm: "checkers" },
  { id: "reversi", pkg: "game-reversi", ruleset: "Standard Othello 8x8", norm: "reversi" },
  { id: "gomoku", pkg: "game-gomoku", ruleset: "Freestyle / RIF Tournament", norm: "gomoku" },
  { id: "seega", pkg: "game-seega", ruleset: "Bedouin 5x5 Custodial", norm: "seega" },
];

console.log("=== NIZALO AUDIT: PHASE 5 INDIVIDUAL GAME ENGINE CERTIFICATION ===\n");

const results = [];

for (const g of GAMES) {
  const pkgDir = path.join(ROOT, "packages", g.pkg);
  const testDir = path.join(pkgDir, "test");
  let testFiles = [];
  if (fs.existsSync(testDir)) {
    testFiles = fs.readdirSync(testDir).filter(f => f.endsWith(".test.mjs") || f.endsWith(".test.js") || f.endsWith(".test.ts"));
  }

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  let runError = null;
  let outputSummary = "";

  if (testFiles.length === 0) {
    results.push({
      game: g.id,
      ruleset: g.ruleset,
      engineVersion: 1,
      testsExecuted: 0,
      passed: 0,
      failed: 0,
      missing: "No test files in packages/" + g.pkg + "/test",
      status: "FAIL"
    });
    continue;
  }

  for (const tFile of testFiles) {
    const fullTestPath = path.join(testDir, tFile);
    try {
      const output = execSync(`node --test "${fullTestPath}"`, {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 30000,
        env: { ...process.env, NODE_ENV: "test" }
      });
      outputSummary += `\n[${tFile}]: PASS\n`;
      // parse passes from output
      const passMatch = output.match(/ℹ pass (\d+)/);
      const failMatch = output.match(/ℹ fail (\d+)/);
      const passCount = passMatch ? parseInt(passMatch[1], 10) : 1;
      const failCount = failMatch ? parseInt(failMatch[1], 10) : 0;
      passedTests += passCount;
      failedTests += failCount;
      totalTests += (passCount + failCount);
    } catch (err) {
      runError = err;
      outputSummary += `\n[${tFile}]: FAIL -> ${err.message}\n`;
      if (err.stdout) outputSummary += err.stdout + "\n";
      if (err.stderr) outputSummary += err.stderr + "\n";
      const failMatch = (err.stdout || "").match(/ℹ fail (\d+)/);
      const passMatch = (err.stdout || "").match(/ℹ pass (\d+)/);
      failedTests += (failMatch ? parseInt(failMatch[1], 10) : 1);
      if (passMatch) passedTests += parseInt(passMatch[1], 10);
      totalTests = passedTests + failedTests;
    }
  }

  const status = (failedTests === 0 && totalTests > 0) ? "PASS" : "FAIL";
  results.push({
    game: g.id,
    ruleset: g.ruleset,
    engineVersion: 1,
    testsExecuted: totalTests,
    passed: passedTests,
    failed: failedTests,
    missing: failedTests > 0 ? outputSummary : "None",
    status
  });
}

console.log(JSON.stringify(results, null, 2));

// Also run duel-engine tests
console.log("\n=== DUEL ENGINE BASE PLATFORM TESTS ===");
try {
  const deOutput = execSync(`node --test packages/duel-engine/test/*.mjs`, {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 30000
  });
  console.log("Duel engine tests output summary:");
  const dePass = deOutput.match(/ℹ pass (\d+)/);
  const deFail = deOutput.match(/ℹ fail (\d+)/);
  console.log(`Duel Engine: PASS: ${dePass ? dePass[1] : 0}, FAIL: ${deFail ? deFail[1] : 0}`);
} catch (err) {
  console.error("Duel engine test failure:", err.stdout || err.message);
}
