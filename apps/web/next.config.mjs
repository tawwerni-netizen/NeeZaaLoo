import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Hostinger's Next.js deployment preset requires a self-contained
  // server artifact (.next/standalone) or a static export (out/) -- the
  // default build produces neither. Standalone also needs .next/static
  // and public/ copied in after the build (see scripts/package-standalone.mjs),
  // which outputFileTracingRoot below is what makes traceable correctly
  // in the first place.
  output: "standalone",
  // This app imports shared, canonical logic straight from sibling
  // workspace packages (packages/i18n, packages/tokens) by relative path
  // rather than duplicating it -- the same convention every other app in
  // this monorepo already uses. Next's production file tracer needs to be
  // told the monorepo root explicitly, or a standalone build silently
  // drops those files.
  outputFileTracingRoot: path.join(here, "../.."),
};

export default nextConfig;
