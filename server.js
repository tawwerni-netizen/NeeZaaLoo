/**
 * Hostinger's "Other" framework preset requires a root-level Entry File it
 * runs directly (node server.js) -- it does not run npm scripts. This is
 * that entry file: a thin custom server using Next's own programmatic API
 * to serve the real application in apps/web, using the monorepo's normal
 * root-level install (Root Directory: ./, Build Command: npm run build)
 * rather than the separate .next/hostinger flattened artifact, which stays
 * untouched and is not involved in this path at all.
 *
 * This file is deliberately CommonJS, and the repository root package.json
 * deliberately declares "type": "commonjs" -- do not "modernise" either one
 * back to ESM. Hostinger installs its own CommonJS runtime scaffolding
 * inside the deployed tree (hbuilds/config/preload-timestamp.js) and
 * require()s it before this server ever loads. Node resolves that file's
 * module type from the NEAREST parent package.json, which is this
 * repository's root -- so a root "type": "module" reclassifies Hostinger's
 * own CommonJS file as ESM. On Hostinger's Node 20 runtime, which predates
 * require(esm) support, that require() then dies with ERR_REQUIRE_ESM and
 * the site serves 503 before any application code runs. Node 22+ silently
 * tolerates it, so this never reproduces on a modern local Node -- verify
 * with `node --no-experimental-require-module server.js`, which forces the
 * Node 20 semantics. Every workspace under apps/ and packages/ declares its
 * own "type": "module" and all other source is .mjs, so both remain ESM
 * regardless of what the root says. Next's own build does exactly this same
 * defensive trick, writing .next/package.json as {"type":"commonjs"}.
 *
 * dir is resolved explicitly to apps/web so this works regardless of the
 * process's cwd -- Next's own App Router, proxy.ts locale routing, dynamic
 * routes, public/, and .next/static all come from that same apps/web build
 * this server just points at, unmodified.
 */
const { createServer } = require("node:http");
const http = require("node:http");
const { fork } = require("node:child_process");
const path = require("node:path");
const next = require("next");

const here = __dirname;
const dir = path.join(here, "apps", "web");

process.env.NODE_ENV = "production";

const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT, 10) || 3000;

// Start API server on internal port (default 4000)
const apiPort = parseInt(process.env.API_PORT, 10) || 4000;
const apiScript = path.join(here, "apps", "api", "src", "index.mjs");

let apiChild = null;
function startApi() {
  try {
    apiChild = fork(apiScript, [], {
      cwd: here,
      env: {
        ...process.env,
        NODE_ENV: process.env.API_NODE_ENV || "development",
        PORT: String(apiPort),
        DATABASE_URL:
          process.env.DATABASE_URL ||
          "postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
        AUTH_SIGNING_KEY_B64:
          process.env.AUTH_SIGNING_KEY_B64 || "qD2UhdyGUdG12PiECMGEbJdEgATItv6zdAkwY0CCkvs=",
        AUTH_ENCRYPTION_KEY_B64:
          process.env.AUTH_ENCRYPTION_KEY_B64 || "AFrP8jHH3e46mV+adHSgzRIwMzH3gv5/vH58KgbMb8Y=",
        CORS_ORIGINS:
          process.env.CORS_ORIGINS ||
          "https://nizalo.com,https://app.nizalo.com,http://localhost:3000,http://127.0.0.1:3000",
      },
      stdio: "inherit",
    });

    apiChild.on("exit", (code, signal) => {
      console.warn(`[API] Process exited (code=${code}, signal=${signal}). Restarting in 2s...`);
      setTimeout(startApi, 2000);
    });
  } catch (err) {
    console.error("[API] Failed to launch API child process:", err);
  }
}
startApi();

process.on("SIGINT", () => {
  if (apiChild) apiChild.kill();
  process.exit(0);
});
process.on("SIGTERM", () => {
  if (apiChild) apiChild.kill();
  process.exit(0);
});

const app = next({ dev: false, dir, hostname, port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer((req, res) => {
      if (req.url && (req.url.startsWith("/v1/") || req.url === "/v1")) {
        const proxyReq = http.request(
          {
            hostname: "127.0.0.1",
            port: apiPort,
            path: req.url,
            method: req.method,
            headers: { ...req.headers, host: `127.0.0.1:${apiPort}` },
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res, { end: true });
          }
        );
        proxyReq.on("error", (err) => {
          console.error("[API Proxy Error]", err.message);
          if (!res.headersSent) {
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: { code: "BAD_GATEWAY", message: "API service unavailable" },
              })
            );
          }
        });
        req.pipe(proxyReq, { end: true });
        return;
      }
      handle(req, res);
    }).listen(port, hostname, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
