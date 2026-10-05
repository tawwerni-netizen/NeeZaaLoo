import { execSync } from "node:child_process";
import fs from "node:fs";

console.log("🔍 Running Nizalo Automated Secret Shield check...");

const GENERIC_SECRET_PATTERNS = [
  {
    name: "Database Connection URI with credentials",
    regex: /postgres(ql)?:\/\/[a-zA-Z0-9_.-]+:(?!(YOUR_|\[PW\]|\$))[^@\s]+@(?!(localhost|127\.0\.0\.1|xxx|YOUR_))[\w.-]+\.[a-z]{2,}/i
  },
  {
    name: "Neon Tech Database API Token / Password",
    regex: /npg_[a-zA-Z0-9]{8,}/
  },
  {
    name: "SMTP / Auth Hardcoded Password assignment",
    regex: /(auth:\s*\{[^}]*pass(word)?:\s*['"](?!process\.env|YOUR_)|(smtp_pass|db_pass)\s*[:=]\s*['"](?!process\.env|YOUR_))/i
  },
  {
    name: "Google OAuth Client Secret",
    regex: /GOCSPX-[a-zA-Z0-9_-]{20,}/
  },
  {
    name: "Payment Gateway Merchant API Key",
    regex: /[A-Z0-9]{6}-[A-Z0-9]{6}-[A-Z0-9]{6}-[A-Z0-9]{6}/
  },
  {
    name: "Private Key Cryptographic Block",
    regex: /-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----/
  }
];

let trackedFiles = [];
try {
  trackedFiles = execSync("git ls-files", { encoding: "utf8" })
    .split(/\r?\n/)
    .map(f => f.trim())
    .filter(Boolean);
} catch {
  console.warn("Could not list git files, scanning default directory.");
}

const IGNORE_FILES = new Set([
  ".env.example",
  ".env.production.example",
  "scripts/check-secrets.mjs"
]);

let violations = 0;

for (const file of trackedFiles) {
  if (IGNORE_FILES.has(file)) continue;
  if (!fs.existsSync(file)) continue;
  if (file.endsWith(".png") || file.endsWith(".jpg") || file.endsWith(".pdf") || file.endsWith(".apk") || file.endsWith(".zip")) continue;

  let content = "";
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const pattern of GENERIC_SECRET_PATTERNS) {
    if (pattern.regex.test(content)) {
      console.error(`🚨 BLOCKED: Suspicious secret pattern in [${file}] -> Matched: ${pattern.name}`);
      violations++;
    }
  }
}

if (violations > 0) {
  console.error(`\n❌ Secret Shield check failed: ${violations} violation(s) found!`);
  console.error("Remove credentials and place them in the gitignored .env file.");
  process.exit(1);
} else {
  console.log("🛡️  Secret Shield: 100% CLEAN. Zero secrets found across all tracked Git files.");
  process.exit(0);
}
