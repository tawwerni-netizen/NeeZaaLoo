/**
 * Reads the project's own .env into process.env for the ops scripts.
 *
 * These scripts are run by hand, in a fresh terminal, usually months apart
 * -- and every one of them dies immediately without DATABASE_URL. Having to
 * paste a live connection string into a shell each time is both a chore and
 * a real hazard: it lands in shell history, in scrollback, and (twice
 * already) got pasted with the surrounding <angle brackets> or a doubled
 * `$env:` prefix, producing errors that look nothing like the real cause.
 *
 * The value is already on disk in .env, gitignored. Read it from there.
 * A variable that is ALREADY set in the environment always wins, so
 * pointing a script at a different database for one run still works
 * exactly as before.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, "..", ".env");

export function loadEnv() {
  if (!existsSync(envPath)) return { loaded: false, keys: [] };

  const keys = [];
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (!key) continue;

    let value = line.slice(eq + 1).trim();
    // Strip one layer of matching quotes, the way every .env reader does.
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }

    // Never override something the operator set for this run on purpose.
    if (process.env[key] === undefined) {
      process.env[key] = value;
      keys.push(key);
    }
  }
  return { loaded: true, keys };
}
