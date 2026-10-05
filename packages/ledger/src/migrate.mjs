import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, not URL.pathname: the repository path may contain spaces,
// which pathname percent-encodes into a directory that does not exist.
const MIGRATIONS_DIR = fileURLToPath(new URL("../../../db/migrations/", import.meta.url));

/**
 * Forward-only, numbered, recorded. A migration runs once and is never edited
 * afterwards; a correction is a new migration. Same discipline as the schema
 * itself: history is appended to, not rewritten.
 */
export async function migrate(db, { dir = MIGRATIONS_DIR, log = false } = {}) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Set(
    (await db.query("SELECT filename FROM schema_migration")).rows.map((r) => r.filename)
  );

  const ran = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(dir, file), "utf8");
    await db.exec(sql);
    await db.query("INSERT INTO schema_migration (filename) VALUES ($1)", [file]);
    ran.push(file);
    if (log) console.log(`  applied ${file}`);
  }
  return ran;
}
