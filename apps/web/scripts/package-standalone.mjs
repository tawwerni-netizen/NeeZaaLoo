/**
 * Runs immediately after `next build` when output: "standalone" is set.
 *
 * Standalone does not include .next/static or public/ (Next's own docs say
 * to copy them in by hand), and in this monorepo the standalone tree mirrors
 * the path from outputFileTracingRoot (the repo root) down to this app --
 * so the real app root inside .next/standalone is apps/web/, not the
 * standalone folder itself. Rather than hardcode that path (a renamed app
 * directory or a tracing-root change would silently break a hardcoded
 * assumption), this walks .next/standalone for the one server.js Next
 * actually generates as the entrypoint, skipping node_modules entirely --
 * Next's own dependency tree ships its own unrelated server.js files (e.g.
 * next/dist/experimental/testmode/server.js) that must never be mistaken
 * for the real entrypoint.
 *
 * Windows-safe and Linux-safe: fs/promises only, no shell cp/rm.
 */
import { cp, rm, stat, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const standaloneRoot = path.join(webDir, ".next", "standalone");

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function findServerEntrypoints(dir) {
  const found = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        await walk(path.join(current, entry.name));
      } else if (entry.isFile() && entry.name === "server.js") {
        found.push(path.join(current, entry.name));
      }
    }
  }
  await walk(dir);
  return found;
}

async function main() {
  if (!(await exists(standaloneRoot))) {
    throw new Error(
      `Standalone output not found at ${standaloneRoot}. ` +
        `Did the build actually run with output: "standalone" set in next.config.mjs?`
    );
  }

  const candidates = await findServerEntrypoints(standaloneRoot);
  if (candidates.length === 0) {
    throw new Error(
      `No server.js found anywhere under ${standaloneRoot} (outside node_modules). ` +
        `The standalone build did not produce a runnable entrypoint.`
    );
  }
  if (candidates.length > 1) {
    throw new Error(
      `Found ${candidates.length} server.js candidates under ${standaloneRoot}, expected exactly 1:\n` +
        candidates.map((c) => `  - ${c}`).join("\n") +
        `\nRefusing to guess which one is the real entrypoint.`
    );
  }

  const serverJsPath = candidates[0];
  const appRoot = path.dirname(serverJsPath);

  const staticSrc = path.join(webDir, ".next", "static");
  const staticDest = path.join(appRoot, ".next", "static");
  const publicSrc = path.join(webDir, "public");
  const publicDest = path.join(appRoot, "public");

  if (!(await exists(staticSrc))) {
    throw new Error(`Expected build output not found: ${staticSrc}`);
  }
  if (!(await exists(publicSrc))) {
    throw new Error(`Expected public directory not found: ${publicSrc}`);
  }

  // Remove any previous copy first so a stale file from an earlier run
  // never lingers after a source file has since been deleted -- makes
  // re-running this script produce the same result every time.
  for (const dest of [staticDest, publicDest]) {
    await rm(dest, { recursive: true, force: true });
  }

  await cp(staticSrc, staticDest, { recursive: true });
  await cp(publicSrc, publicDest, { recursive: true });

  console.log(`[package-standalone] server entrypoint: ${serverJsPath}`);
  console.log(`[package-standalone] copied ${staticSrc} -> ${staticDest}`);
  console.log(`[package-standalone] copied ${publicSrc} -> ${publicDest}`);
}

main().catch((err) => {
  console.error(`[package-standalone] FAILED: ${err.message}`);
  process.exit(1);
});
