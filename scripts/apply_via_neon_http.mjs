import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hash as argonHash, Algorithm } from "@node-rs/argon2";
import { randomUUID } from "node:crypto";

const SQL_ENDPOINT = "https://ep-cold-frog-b2dicy1p.c-6.eu-central-1.aws.neon.tech/sql";
const NEON_CONN_STRING = "postgresql://neondb_owner:npg_ABH8MueOg6Qd@ep-cold-frog-b2dicy1p.c-6.eu-central-1.aws.neon.tech/neondb";
const MIGRATIONS_DIR = fileURLToPath(new URL("../db/migrations/", import.meta.url));

const ARGON = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
const TARGET_PASSWORD = 'Nizalo@Admin#2026!x0Code';

function splitSql(sql) {
  const statements = [];
  let current = "";
  let inDollarQuote = false;
  let dollarTag = "";

  for (const line of sql.split("\n")) {
    const trimmed = line.trim();
    if (!inDollarQuote && (trimmed.startsWith("--") || trimmed === "")) {
      continue;
    }

    const matches = line.match(/\$[a-zA-Z0-9_]*\$/g);
    if (matches) {
      for (const m of matches) {
        if (!inDollarQuote) {
          inDollarQuote = true;
          dollarTag = m;
        } else if (m === dollarTag) {
          inDollarQuote = false;
          dollarTag = "";
        }
      }
    }

    current += line + "\n";
    if (!inDollarQuote && trimmed.endsWith(";")) {
      const stmt = current.trim();
      if (stmt && stmt !== ";") {
        statements.push(stmt.replace(/;$/, "").trim());
      }
      current = "";
    }
  }
  const rem = current.trim();
  if (rem && rem !== ";") {
    statements.push(rem.replace(/;$/, "").trim());
  }
  return statements;
}

async function execHttp(queries) {
  const res = await fetch(SQL_ENDPOINT, {
    method: "POST",
    headers: {
      "neon-connection-string": NEON_CONN_STRING,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      queries: queries.map((q) => ({ query: q })),
    }),
  });
  const data = await res.json();
  if (!res.ok || data.message || data.error) {
    throw new Error(data.message || data.error || JSON.stringify(data));
  }
  return data;
}

async function queryHttp(sql) {
  const res = await fetch(SQL_ENDPOINT, {
    method: "POST",
    headers: {
      "neon-connection-string": NEON_CONN_STRING,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const data = await res.json();
  if (!res.ok || data.message || data.error) {
    throw new Error(data.message || data.error || JSON.stringify(data));
  }
  return data.rows || [];
}

async function main() {
  console.log("Checking applied migrations via Neon HTTP SQL API...");
  const appliedRows = await queryHttp("SELECT filename FROM schema_migration;");
  const applied = new Set(appliedRows.map((r) => r.filename));

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  console.log(`Applied: ${applied.size} / ${files.length} migrations.`);

  for (const file of files) {
    if (applied.has(file)) continue;
    console.log(`Applying ${file}...`);
    const content = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    const stmts = splitSql(content);
    stmts.push(`INSERT INTO schema_migration (filename) VALUES ('${file}')`);

    // Execute in batches of 10 statements to avoid huge request bodies
    const BATCH_SIZE = 10;
    for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
      const batch = stmts.slice(i, i + BATCH_SIZE);
      await execHttp(batch);
    }
    console.log(`  ✓ applied ${file} (${stmts.length - 1} statements)`);
  }

  console.log("\nAll migrations applied successfully!");

  console.log("\nSetting up Super Admins...");
  const passwordHash = await argonHash(TARGET_PASSWORD, ARGON);

  const admins = [
    { id: 'tawwerni', email: 'tawwerni@gmail.com', name: 'Tawwerni' },
    { id: 'logoxpress_eg', email: 'logoxpress.eg@gmail.com', name: 'LogoXpress' }
  ];

  const adminStmts = [];
  for (const u of admins) {
    adminStmts.push(
      `INSERT INTO player (id, handle, locale) VALUES ('${u.id}', '${u.id}', 'ar') ON CONFLICT (id) DO NOTHING`,
      `INSERT INTO credential (player_id, password_hash) VALUES ('${u.id}', '${passwordHash}') ON CONFLICT (player_id) DO UPDATE SET password_hash = '${passwordHash}', changed_at = now()`,
      `INSERT INTO email_identity (id, player_id, email, email_display, verified_at) VALUES ('eid_${randomUUID()}', '${u.id}', '${u.email.toLowerCase()}', '${u.email}', now()) ON CONFLICT (player_id) DO UPDATE SET email = '${u.email.toLowerCase()}', email_display = '${u.email}', verified_at = now()`,
      `INSERT INTO admin_user (id, email, display_name, mfa_enrolled, disabled_at) VALUES ('${u.id}', '${u.email}', '${u.name}', TRUE, NULL) ON CONFLICT (id) DO UPDATE SET email = '${u.email}', display_name = '${u.name}', mfa_enrolled = TRUE, disabled_at = NULL`,
      `INSERT INTO admin_role_grant (admin_id, role, granted_by, granted_at, reason) VALUES ('${u.id}', 'SUPER_ADMIN', 'system-automation', now(), 'Owner SuperAdmin promotion') ON CONFLICT DO NOTHING`,
      `SELECT ledger_open_user_wallet('${u.id}')`
    );
  }

  await execHttp(adminStmts);
  console.log("  ✓ Super Admins configured!");

  const botCount = await queryHttp("SELECT count(*) as count FROM player WHERE is_ai = true OR id LIKE 'bot_%';");
  const adminCount = await queryHttp("SELECT count(*) as count FROM admin_user;");

  console.log(`\nVerification:`);
  console.log(`- Total bots in player table: ${botCount[0]?.count}`);
  console.log(`- Total admin users: ${adminCount[0]?.count}`);
  console.log("\nDatabase setup is 100% complete and verified!");
}

main().catch((err) => {
  console.error("HTTP migration failed:", err);
  process.exit(1);
});
