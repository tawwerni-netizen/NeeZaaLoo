import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();

const SUBSYSTEMS = [
  { name: "matchmaking", path: "packages/matchmaking/test" },
  { name: "settlement", path: "packages/settlement/test" },
  { name: "fairplay", path: "packages/fairplay/test" },
  { name: "compliance", path: "packages/compliance/test" },
];

console.log("=== NIZALO AUDIT: CORE SUBSYSTEM TESTS ===\n");

let totalPass = 0;
let totalFail = 0;

for (const sub of SUBSYSTEMS) {
  const fullPath = path.join(ROOT, sub.path);
  if (!fs.existsSync(fullPath)) {
    console.log(`[${sub.name}]: Directory not found`);
    continue;
  }
  const testFiles = fs.readdirSync(fullPath).filter(f => f.endsWith(".test.mjs") || f.endsWith(".test.js"));
  console.log(`\n--- Running ${sub.name} (${testFiles.length} files) ---`);
  for (const file of testFiles) {
    const testFilePath = path.join(fullPath, file);
    try {
      const output = execSync(`node --test "${testFilePath}"`, {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 120000, // 2 minutes to allow thorough PGlite migration test runs
        env: { ...process.env, NODE_ENV: "test" }
      });
      const pass = output.match(/ℹ pass (\d+)/);
      const fail = output.match(/ℹ fail (\d+)/);
      const passedCount = pass ? Number(pass[1]) : 0;
      const failedCount = fail ? Number(fail[1]) : 0;
      totalPass += passedCount;
      totalFail += failedCount;
      console.log(`[${file}]: PASS (${passedCount} passed, ${failedCount} failed)`);
    } catch (err) {
      console.error(`[${file}]: FAIL!`);
      if (err.stdout) console.log(err.stdout);
      if (err.stderr) console.error(err.stderr);
    }
  }
}

console.log(`\n=== CORE SUBSYSTEMS TOTAL: ${totalPass} PASSED, ${totalFail} FAILED ===\n`);
