import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This app imports shared, canonical logic straight from sibling
  // workspace packages (packages/i18n, packages/tokens) by relative path
  // rather than duplicating it -- the same convention every other app in
  // this monorepo already uses. Next's production file tracer needs to be
  // told the monorepo root explicitly, or a standalone build silently
  // drops those files.
  outputFileTracingRoot: path.join(here, "../.."),
};

export default nextConfig;
