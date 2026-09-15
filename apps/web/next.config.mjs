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
  compress: true,
  poweredByHeader: false,
  async rewrites() {
    const apiTarget = process.env.API_INTERNAL_URL || "http://127.0.0.1:4000";
    return [
      {
        source: "/v1/:path*",
        destination: `${apiTarget}/v1/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        // Safe, essentially zero-risk hardening headers on every response.
        // Deliberately NOT a Content-Security-Policy here: this app has a
        // realtime WebSocket gateway, an OxaPay-hosted checkout redirect,
        // and Google OAuth -- getting a CSP's connect-src/frame-src allowlist
        // wrong would silently break gameplay or payments, and that needs
        // its own careful, tested pass rather than guessing at it here.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
        ],
      },
      {
        source: "/images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/avatars/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/sounds/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
