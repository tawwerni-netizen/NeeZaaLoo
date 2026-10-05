import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SUPPORTED_LOCALE_CODES } from "./locales.mjs";

// Deliberately its own module, separate from locales.mjs/resolve.mjs: this
// is the only file in the package that touches the filesystem, so anything
// that runs somewhere `fs` is unavailable (an Edge middleware, a browser
// bundle) can import the rest of the package without pulling this in.
const LOCALES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "locales");

let cache = null;

/** `{ en: {...}, ar: {...}, ... }` -- every supported locale's translation resource. */
export function loadResources() {
  if (cache) return cache;
  cache = {};
  for (const code of SUPPORTED_LOCALE_CODES) {
    cache[code] = JSON.parse(readFileSync(path.join(LOCALES_DIR, `${code}.json`), "utf8"));
  }
  return cache;
}
