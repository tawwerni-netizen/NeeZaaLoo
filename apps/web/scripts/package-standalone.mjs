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

  await packageForHostinger({ appRoot, serverJsPath, standaloneRoot });
}

/**
 * Hostinger's Next.js deployment preset validates the ROOT of the configured
 * Output Directory for a standalone server.js -- confirmed empirically by a
 * real staging deployment against Output Directory: apps/web/.next/standalone,
 * which still failed with "Next.js build produced no standalone server or
 * static output" even though a working server.js exists two levels down, at
 * .next/standalone/apps/web/server.js (the nesting is a direct consequence
 * of outputFileTracingRoot pointing at the monorepo root above). This
 * flattens that nested layout into a single directory Hostinger's preset can
 * discover: server.js at the artifact root, with node_modules/.next/public
 * as its direct siblings, matching the non-monorepo standalone shape Next's
 * own docs describe.
 *
 * Confirmed by a manual flattening test (node <flattened>/server.js, then a
 * real HTTP request) that this is safe to relocate: server.js derives its
 * own __dirname from import.meta.url (not a path baked in at build time),
 * calls process.chdir(__dirname), and resolves `require('next')` via
 * module.createRequire(import.meta.url) -- which walks up node_modules
 * directories starting from server.js's OWN location, not from whatever
 * directory the process happened to be launched from. The same test also
 * showed that the app root's own generated package.json (declaring
 * "type": "module", copied here from Next's own standalone trace output,
 * not written by this script) has to travel with server.js -- without it,
 * Node has no package.json in any parent directory declaring ESM and fails
 * immediately with "Cannot use import statement outside a module".
 */
async function packageForHostinger({ appRoot, serverJsPath, standaloneRoot }) {
  const hostingerRoot = path.join(webDir, ".next", "hostinger");
  const nodeModulesSrc = path.join(standaloneRoot, "node_modules");
  const appPackageJsonSrc = path.join(appRoot, "package.json");
  const appNextSrc = path.join(appRoot, ".next");
  const appPublicSrc = path.join(appRoot, "public");

  for (const [label, p] of [
    ["traced node_modules", nodeModulesSrc],
    ["app package.json", appPackageJsonSrc],
    ["app .next", appNextSrc],
    ["app public", appPublicSrc],
  ]) {
    if (!(await exists(p))) {
      throw new Error(`[hostinger packaging] Expected ${label} not found: ${p}`);
    }
  }

  // Rebuild from scratch every run -- the only way to guarantee a file
  // removed from a source directory doesn't linger as a stale leftover in
  // the flattened artifact from an earlier build.
  await rm(hostingerRoot, { recursive: true, force: true });
  await cp(serverJsPath, path.join(hostingerRoot, "server.js"));
  await cp(appPackageJsonSrc, path.join(hostingerRoot, "package.json"));
  await cp(nodeModulesSrc, path.join(hostingerRoot, "node_modules"), { recursive: true });
  await cp(appNextSrc, path.join(hostingerRoot, ".next"), { recursive: true });
  await cp(appPublicSrc, path.join(hostingerRoot, "public"), { recursive: true });

  const flattenedServerJs = path.join(hostingerRoot, "server.js");
  if (!(await exists(flattenedServerJs))) {
    throw new Error(
      `[hostinger packaging] server.js missing at flattened artifact root after copy: ${flattenedServerJs}`
    );
  }

  console.log(`[package-standalone] Hostinger artifact: ${hostingerRoot}`);
  console.log(`[package-standalone] Hostinger server.js: ${flattenedServerJs}`);
}

main().catch((err) => {
  console.error(`[package-standalone] FAILED: ${err.message}`);
  process.exit(1);
});
