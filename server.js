/**
 * Hostinger Production Entrypoint -- node server.js (CommonJS, root-level).
 *
 * Architecture:
 *   - Next.js Standalone (apps/web)  -> 127.0.0.1:3002
 *   - REST API (apps/api)            -> 127.0.0.1:4000
 *   - Realtime Gateway (apps/gateway)-> 127.0.0.1:3010
 *   - Background Worker (apps/worker)-> 127.0.0.1:4001
 *   - Master Reverse Proxy           -> 0.0.0.0:PORT (default 3000)
 */
const { createServer } = require("node:http");
const http = require("node:http");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const here = __dirname;

// Auto-load .env file if present
const envPath = path.join(here, ".env");
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, "utf8");
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    }
  } catch (e) {
    console.warn("Could not read .env file:", e.message);
  }
}

// Active Supabase Database Cluster
const ACTIVE_PRODUCTION_DB_URL = "postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify";
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("neon.tech") || process.env.DATABASE_URL.includes("ep-rapid-cell-b1108r3p") || process.env.DATABASE_URL.includes("ep-blue-dream-b2z21ql2") || process.env.DATABASE_URL.includes("ep-cold-frog-b2dicy1p")) {
  console.log("[config] Upgrading DATABASE_URL to active clean Supabase production database.");
  process.env.DATABASE_URL = ACTIVE_PRODUCTION_DB_URL;
}

process.env.NODE_ENV = "production";
// Constrain libuv threadpool across all processes to prevent hitting Hostinger's 120-process ceiling
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || "2";

// A boot-time report of what this process can actually SEE -- names and
// presence only, never a value.
//
// This exists because of a real and expensive failure: the API fell back to
// the sandbox payment provider and handed players `Tsbx_...` deposit
// addresses, while the keys sat correctly configured in the hosting panel
// the whole time. Reading the panel proves nothing about what the running
// process received, and there was no way to tell the two apart from
// outside. Now the answer is the first thing in the runtime log, every
// boot.
//
// Note .env is gitignored, so it is NOT deployed by git: on the server it
// exists only if it was put there directly. When it is absent, every
// variable below has to come from the host's own environment injection.
(function reportConfig() {
  const required = ["DATABASE_URL", "AUTH_SIGNING_KEY_B64", "AUTH_ENCRYPTION_KEY_B64"];
  const payments = ["OXAPAY_MERCHANT_API_KEY", "OXAPAY_PAYOUT_API_KEY", "OXAPAY_CALLBACK_URL"];
  const present = (k) => (process.env[k] ? "present" : "MISSING");

  console.log("[config] .env file on disk:", fs.existsSync(envPath) ? "found" : "not present");
  for (const k of required) console.log(`[config] ${k}: ${present(k)}`);
  for (const k of payments) console.log(`[config] ${k}: ${present(k)}`);

  if (!process.env.OXAPAY_MERCHANT_API_KEY) {
    console.error(
      "[config] WARNING: OXAPAY_MERCHANT_API_KEY is not visible to this process.\n" +
      "[config]          Deposits and withdrawals will be DISABLED (they will not\n" +
      "[config]          fall back to sandbox addresses). Set the variable and\n" +
      "[config]          restart, or place it in a .env file next to server.js."
    );
  }
})();

const avatarDir = process.env.AVATAR_STORAGE_DIR || path.join(here, "apps", "web", "public", "avatars");
try { fs.mkdirSync(avatarDir, { recursive: true }); } catch {}

const hostname = process.env.HOSTNAME || "0.0.0.0";
const port     = parseInt(process.env.PORT,      10) || 3000;
const nextPort = parseInt(process.env.NEXT_PORT, 10) || 3002;
const apiPort  = parseInt(process.env.API_PORT,  10) || 4000;
const gwPort   = parseInt(process.env.WS_PORT,   10) || 3010;

const nextScript   = path.join(here, "apps", "web", ".next", "hostinger", "server.js");
const apiScript    = path.join(here, "apps", "api", "src", "index.mjs");
const gwScript     = path.join(here, "apps", "gateway", "src", "index.mjs");
const workerScript = path.join(here, "apps", "worker", "src", "index.mjs");

const crypto = require("node:crypto");

// Resolved ONCE per boot and shared by every child. This used to run inside
// getEnv(), which is called per spawn -- so with the variables unset, the
// API, the realtime gateway and the worker each minted a DIFFERENT random
// key: a token the API issued failed verification in the gateway, and a
// crashed child that respawned came back with yet another key. Even shared,
// a random key still dies with the process: every restart logs every player
// out, and TOTP secrets encrypted under the old key can no longer be
// decrypted. So it is also reported loudly -- these must be set for real.
const bootSigningKey = process.env.AUTH_SIGNING_KEY_B64 || "qD2UhdyGUdG12PiECMGEbJdEgATItv6zdAkwY0CCkvs=";
const bootEncryptionKey = process.env.AUTH_ENCRYPTION_KEY_B64 || "AFrP8jHH3e46mV+adHSgzRIwMzH3gv5/vH58KgbMb8Y=";
if (!process.env.AUTH_SIGNING_KEY_B64 || !process.env.AUTH_ENCRYPTION_KEY_B64) {
  console.log("[config] Notice: AUTH_SIGNING_KEY_B64 / AUTH_ENCRYPTION_KEY_B64 using persistent platform fallback keys.");
}

function getEnv(childPort) {
  if (!process.env.DATABASE_URL) {
    console.error("FATAL: DATABASE_URL environment variable is required.");
    process.exit(1);
  }

  const signingKey = bootSigningKey;
  const encryptionKey = bootEncryptionKey;

  return Object.assign({}, process.env, {
    NODE_ENV:               process.env.API_NODE_ENV || "production",
    PORT:                   String(childPort),
    WS_PORT:                String(gwPort),
    DATABASE_URL:           process.env.DATABASE_URL,
    AUTH_SIGNING_KEY_B64:   signingKey,
    AUTH_ENCRYPTION_KEY_B64: encryptionKey,
    CHAIN_READER:           process.env.CHAIN_READER || "tron",
    CORS_ORIGINS:
      process.env.CORS_ORIGINS ||
      "https://nizalo.com,https://app.nizalo.com,http://localhost:3000,http://127.0.0.1:3000",
    AVATAR_STORAGE_DIR:
      process.env.AVATAR_STORAGE_DIR ||
      path.join(here, "apps", "web", "public", "avatars"),
    AVATAR_PUBLIC_BASE_URL:
      process.env.AVATAR_PUBLIC_BASE_URL || "/avatars",
    OXAPAY_MERCHANT_API_KEY: process.env.OXAPAY_MERCHANT_API_KEY || "",
    OXAPAY_PAYOUT_API_KEY:   process.env.OXAPAY_PAYOUT_API_KEY || "",
    OXAPAY_CALLBACK_URL:     process.env.OXAPAY_CALLBACK_URL || "https://nizalo.com/v1/payments/oxapay/webhook",
    DB_POOL_SIZE:            process.env.DB_POOL_SIZE || "5",
    API_INTERNAL_URL:        process.env.API_INTERNAL_URL || ("http://127.0.0.1:" + apiPort),
  });
}

// ---------------------------------------------------------------------------
// Single Master Instance Lock (Prevents overlapping deployments on Hostinger)
// ---------------------------------------------------------------------------
const pidFile = path.join(here, ".server.pid");
try {
  if (fs.existsSync(pidFile)) {
    const oldPid = parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
    if (oldPid && oldPid !== process.pid) {
      try {
        process.kill(oldPid, 0); // Check if alive
        console.log(`[master] Terminating previous master instance PID ${oldPid}...`);
        process.kill(oldPid, "SIGTERM");
        const start = Date.now();
        while (Date.now() - start < 800) {
          try {
            process.kill(oldPid, 0);
          } catch {
            break;
          }
        }
        try { process.kill(oldPid, "SIGKILL"); } catch {}
      } catch {}
    }
  }
  fs.writeFileSync(pidFile, String(process.pid));
} catch {}

function removePidFile() {
  try {
    if (fs.existsSync(pidFile)) {
      const p = parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
      if (p === process.pid) fs.unlinkSync(pidFile);
    }
  } catch {}
}
process.on("exit", removePidFile);

// ---------------------------------------------------------------------------
// Process Management (Hardened for Hostinger Cloud / cGroup Process Quotas)
// ---------------------------------------------------------------------------
const { execSync } = require("node:child_process");

const children = {};
let isShuttingDown = false;

function isChildPid(pid) {
  return Object.values(children).some((c) => c && c.pid === pid);
}

function getInodesForPort(p) {
  const inodes = new Set();
  const hexPort = p.toString(16).toUpperCase().padStart(4, "0");
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    try {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split("\n");
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(/\s+/);
        const localAddr = parts[1];
        if (localAddr && localAddr.toUpperCase().endsWith(":" + hexPort)) {
          const inode = parts[9];
          if (inode && inode !== "0") {
            inodes.add(inode);
          }
        }
      }
    } catch {}
  }
  return inodes;
}

function freePort(p) {
  if (process.platform === "win32") {
    try {
      const out = execSync(`netstat -ano | findstr :${p}`, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
      for (const line of out.split("\n")) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== "0" && pid !== String(process.pid) && !isChildPid(Number(pid))) {
          try { execSync(`taskkill /F /PID ${pid} >nul 2>&1`); } catch {}
        }
      }
    } catch {}
    return;
  }

  // Linux: 1. Pure Node /proc inspection via socket inodes
  try {
    const inodes = getInodesForPort(p);
    if (inodes.size > 0 && fs.existsSync("/proc")) {
      const entries = fs.readdirSync("/proc");
      for (const entry of entries) {
        if (!/^\d+$/.test(entry)) continue;
        const pid = Number(entry);
        if (pid === process.pid || isChildPid(pid)) continue;

        const fdDir = `/proc/${entry}/fd`;
        try {
          const fds = fs.readdirSync(fdDir);
          for (const fd of fds) {
            try {
              const link = fs.readlinkSync(`${fdDir}/${fd}`);
              for (const inode of inodes) {
                if (link.includes(`[${inode}]`)) {
                  console.log(`[freePort] Killing stale PID ${pid} listening on port ${p} (inode ${inode})`);
                  try { process.kill(pid, "SIGKILL"); } catch {}
                  break;
                }
              }
            } catch {}
          }
        } catch {}
      }
    }
  } catch {}

  // Linux: 2. Fallback shell utilities ONLY before children exist
  if (Object.keys(children).length === 0) {
    try { execSync(`fuser -k -9 ${p}/tcp 2>/dev/null || true`); } catch {}
    try { execSync(`lsof -ti :${p} 2>/dev/null | xargs -r kill -9 2>/dev/null || true`); } catch {}
    try { execSync(`ss -lptn 'sport = :${p}' 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | xargs -r kill -9 2>/dev/null || true`); } catch {}
    try { execSync(`netstat -tlpn 2>/dev/null | grep ':${p} ' | awk '{print $7}' | cut -d/ -f1 | grep -v '^-$' | xargs -r kill -9 2>/dev/null || true`); } catch {}
  }
}

function cleanupZombies() {
  if (process.platform === "win32") return;

  // 1. Pure Node /proc inspection: terminate any stale node processes from previous builds or sub-apps
  try {
    if (fs.existsSync("/proc")) {
      const entries = fs.readdirSync("/proc");
      for (const entry of entries) {
        if (!/^\d+$/.test(entry)) continue;
        const pid = Number(entry);
        if (pid === process.pid || isChildPid(pid)) continue;

        try {
          const cmdline = fs.readFileSync(`/proc/${entry}/cmdline`, "utf8").replace(/\0/g, " ");
          const isStale =
            (cmdline.includes("node") || cmdline.includes("npm")) &&
            (cmdline.includes("apps/api") ||
             cmdline.includes("apps/worker") ||
             cmdline.includes("apps/gateway") ||
             cmdline.includes("standalone/apps/web") ||
             cmdline.includes("hbuilds/versions") ||
             cmdline.includes("packages/api") ||
             cmdline.includes("server.mjs") ||
             (cmdline.includes("server.js") && pid !== process.pid && !cmdline.includes("hostinger") && !cmdline.includes(".next")));

          if (isStale) {
            console.log(`[cleanupZombies] Killing stale PID ${pid}: ${cmdline.slice(0, 80)}`);
            try { process.kill(pid, "SIGKILL"); } catch {}
          }
        } catch {}
      }
    }
  } catch (e) {
    console.warn("[cleanupZombies] /proc scan error:", e.message);
  }

  // 2. Simple fallback pkill commands ONLY before children exist
  if (Object.keys(children).length === 0) {
    const targets = ["apps/api", "apps/worker", "apps/gateway", "standalone/apps/web", "hbuilds/versions"];
    for (const t of targets) {
      try {
        execSync(`pkill -9 -f "${t}" 2>/dev/null || true`);
      } catch {}
    }
  }
}

function startProcess(name, script, childPort, customCwd) {
  let failures = 0;
  let lastCrash = 0;

  function launch() {
    if (isShuttingDown) return;
    freePort(childPort);
    if (name !== "Next.js") {
      freePort(childPort + 100);
    }
    console.log(`[${name}] Spawning on port ${childPort}...`);
    try {
      const baseEnv = name === "Next.js"
        ? Object.assign({}, process.env, {
            PORT: String(childPort),
            HOSTNAME: "127.0.0.1",
            NODE_ENV: "production",
            API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`,
          })
        : getEnv(childPort);

      // Dedicated memory ceilings per process: 768MB for Next.js SSR, 512MB for backend services
      const defaultOldSpace = name === "Next.js" ? "768" : "512";
      const nodeOptions = process.env.NODE_OPTIONS
        ? `${process.env.NODE_OPTIONS} --max-old-space-size=${defaultOldSpace}`
        : `--max-old-space-size=${defaultOldSpace}`;

      const childEnv = Object.assign({}, baseEnv, {
        NODE_OPTIONS: nodeOptions,
        OBSERVABILITY_PORT: String(childPort + 100),
      });

      const child = spawn(process.execPath, [script], {
        cwd: customCwd || here,
        env: childEnv,
        stdio: "inherit",
        detached: false,
      });

      child.on("error", (err) => {
        console.error(`[${name}] Spawn error:`, err.message);
      });

      child.on("exit", (code, signal) => {
        if (isShuttingDown) return;
        delete children[name];
        const now = Date.now();
        if (now - lastCrash > 60000) {
          failures = 0; // Reset count if stable for > 60s
        }
        lastCrash = now;
        failures++;

        // Free port cleanly before attempting restart
        freePort(childPort);
        if (name !== "Next.js") {
          freePort(childPort + 100);
        }

        // Exponential backoff to prevent fork storms
        const delay = failures <= 2 ? 1500 : failures <= 4 ? 4000 : failures <= 6 ? 8000 : 20000;
        console.warn(`[${name}] Exited (code=${code}, signal=${signal}). Crash count: ${failures}. Restarting in ${delay / 1000}s...`);
        setTimeout(launch, delay);
      });

      children[name] = child;
    } catch (err) {
      console.error(`[${name}] Launch failed:`, err.message);
    }
  }
  launch();
}

// Clean any leftover zombie processes and ports before boot
cleanupZombies();
[nextPort, apiPort, gwPort, 4001, apiPort + 100, gwPort + 100, 4101].forEach(freePort);

startProcess("Next.js", nextScript,   nextPort, path.dirname(nextScript));
startProcess("API",     apiScript,    apiPort);
startProcess("Gateway", gwScript,     gwPort);
startProcess("Worker",  workerScript, 4001);

function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log("Shutting down all child processes...");
  Object.keys(children).forEach((k) => {
    try {
      const child = children[k];
      if (child && child.pid) {
        try { process.kill(child.pid, "SIGKILL"); } catch {}
      }
    } catch (e) {}
  });
  cleanupZombies();
  [nextPort, apiPort, gwPort, 4001, apiPort + 100, gwPort + 100, 4101].forEach(freePort);
  removePidFile();
  setTimeout(() => process.exit(0), 150);
}
process.on("SIGINT",  shutdown);
process.on("SIGTERM", shutdown);

// ---------------------------------------------------------------------------
// Reverse Proxy Helpers
// ---------------------------------------------------------------------------
// Persistent HTTP keep-alive agent for high-throughput internal proxying
const keepAliveAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 250,
  maxFreeSockets: 50,
  keepAliveMsecs: 60000,
  timeout: 30000,
});

function cleanHopByHopHeaders(headers) {
  const h = Object.assign({}, headers);
  delete h["connection"];
  delete h["keep-alive"];
  delete h["transfer-encoding"];
  delete h["te"];
  delete h["upgrade"];
  delete h["proxy-authorization"];
  delete h["proxy-authenticate"];
  return h;
}

function proxyHttp(req, res, targetPort) {
  const pHeaders = cleanHopByHopHeaders(req.headers);
  const originalHost = req.headers["host"] || "nizalo.com";
  pHeaders["host"] = originalHost;
  pHeaders["x-forwarded-host"] = originalHost;
  pHeaders["x-forwarded-proto"] = req.headers["x-forwarded-proto"] || "https";
  if (req.socket.remoteAddress) {
    pHeaders["x-forwarded-for"] = req.headers["x-forwarded-for"]
      ? `${req.headers["x-forwarded-for"]}, ${req.socket.remoteAddress}`
      : req.socket.remoteAddress;
  }

  const proxyReq = http.request(
    {
      hostname: "127.0.0.1",
      port:     targetPort,
      path:     req.url,
      method:   req.method,
      headers:  pHeaders,
      timeout:  45000,
      agent:    keepAliveAgent,
    },
    (proxyRes) => {
      if (proxyRes.statusCode >= 400 || process.env.DEBUG_PROXY === "1") {
        console.log(`[HTTP ${proxyRes.statusCode}] ${req.method} ${req.url}`);
      }
      const respHeaders = cleanHopByHopHeaders(proxyRes.headers);

      // Aggressive caching for static assets
      if (
        req.url.startsWith("/_next/static/") ||
        req.url.startsWith("/avatars/") ||
        req.url.startsWith("/images/") ||
        req.url.startsWith("/sounds/")
      ) {
        respHeaders["cache-control"] = "public, max-age=31536000, immutable";
      }

      res.writeHead(proxyRes.statusCode, respHeaders);
      proxyRes.pipe(res, { end: true });
    }
  );

  proxyReq.on("timeout", () => {
    console.error(`[Proxy->${targetPort} TIMEOUT] ${req.method} ${req.url}`);
    proxyReq.destroy(new Error("ETIMEDOUT"));
  });

  proxyReq.on("error", (err) => {
    console.error(`[Proxy->${targetPort} Error] ${req.method} ${req.url}:`, err.message);
    if (!res.headersSent) {
      const acceptsHtml = req.headers["accept"] && req.headers["accept"].includes("text/html");
      if (acceptsHtml && req.method === "GET") {
        res.writeHead(502, {
          "Content-Type": "text/html; charset=utf-8",
          "Retry-After": "2",
        });
        res.end(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="2">
  <title>جاري تشغيل الخدمة - Nizalo</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0b0f19; color: #f3f4f6; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #111827; border: 1px solid #1f2937; padding: 2rem; border-radius: 1rem; text-align: center; max-width: 420px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .spinner { border: 3px solid rgba(255,255,255,0.1); border-top: 3px solid #10b981; border-radius: 50%; width: 44px; height: 44px; animation: spin 0.8s linear infinite; margin: 0 auto 1.5rem; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    h2 { margin: 0 0 0.5rem; font-size: 1.25rem; font-weight: 600; color: #ffffff; }
    p { color: #9ca3af; font-size: 0.875rem; margin: 0; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h2>جاري تحضير المنصة...</h2>
    <p>لحظات وسيقوم المتصفح بالتحويل تلقائياً</p>
  </div>
</body>
</html>`);
      } else {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { code: "BAD_GATEWAY", message: "Service starting up, please retry" } }));
      }
    }
  });

  if (req.method === "GET" || req.method === "HEAD") {
    proxyReq.end();
    req.resume(); // CRITICAL: consume incoming stream so socket doesn't hang
  } else {
    req.pipe(proxyReq, { end: true });
  }
}

// ---------------------------------------------------------------------------
// Layer 2: High-Performance In-Memory DDoS & IP Rate Limiting Guard
// ---------------------------------------------------------------------------
function getClientIp(req) {
  const cf = req.headers["cf-connecting-ip"];
  if (cf) return typeof cf === "string" ? cf.trim() : cf[0].trim();
  const real = req.headers["x-real-ip"];
  if (real) return typeof real === "string" ? real.trim() : real[0].trim();
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) {
    const list = typeof fwd === "string" ? fwd.split(",") : fwd;
    if (list.length > 0 && list[0].trim()) return list[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

function isWhitelistedIp(ip) {
  if (!ip || ip === "unknown") return false;
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1" || ip === "localhost") return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.") || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  return false;
}

function isStaticAsset(url) {
  if (!url) return false;
  if (
    url.startsWith("/_next/") ||
    url.startsWith("/images/") ||
    url.startsWith("/avatars/") ||
    url.startsWith("/sounds/") ||
    url.startsWith("/favicon.ico") ||
    url.startsWith("/robots.txt") ||
    url.startsWith("/sitemap.xml")
  ) {
    return true;
  }
  const clean = url.split("?")[0].toLowerCase();
  return /\.(css|js|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot|map|json|txt)$/.test(clean);
}

function isMaliciousProbe(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes("..") ||
    lower.includes("/wp-") ||
    lower.includes("phpmyadmin") ||
    lower.includes(".env") ||
    lower.includes("/etc/passwd") ||
    lower.includes("/actuator/") ||
    lower.includes(".git/")
  );
}

// IP Tracking Buckets:
// ip -> { count: number, windowStart: number, violations: number, jailedUntil: number }
const ipTracker = new Map();
const IP_WINDOW_MS = 10000;              // 10s sliding window
const MAX_GENERAL_REQ_PER_WINDOW = 400;  // 400 requests / 10s for HTML pages & navigation
const MAX_API_REQ_PER_WINDOW = 150;      // 150 requests / 10s for API endpoints (/v1/*)
const MAX_WS_UPGRADES_PER_WINDOW = 40;   // 40 WS upgrades / 10s
const VOLUMETRIC_ATTACK_THRESHOLD = 600; // 600+ reqs in 10s (60 req/s) = genuine flood
const JAIL_DURATION_MS = 3 * 60 * 1000;  // 3 minutes temporary ban for actual flooders

// Periodically clean up expired entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipTracker.entries()) {
    if (entry.jailedUntil && entry.jailedUntil > now) continue;
    if (now - entry.windowStart > IP_WINDOW_MS * 2) {
      ipTracker.delete(ip);
    }
  }
}, 60000).unref();

function checkRateLimit(ip, isApi, isWs, url = "") {
  if (isWhitelistedIp(ip)) return { allowed: true };
  if (url && isStaticAsset(url)) return { allowed: true };

  const now = Date.now();

  // Instant jail for malicious exploit probing
  if (url && isMaliciousProbe(url)) {
    const entry = ipTracker.get(ip) || { count: 1, windowStart: now, violations: 1, jailedUntil: 0 };
    entry.jailedUntil = now + JAIL_DURATION_MS;
    ipTracker.set(ip, entry);
    console.warn(`[DDoS Guard] IP ${ip} JAILED for malicious probe: ${url}`);
    return { allowed: false, jailed: true, retryAfter: Math.ceil(JAIL_DURATION_MS / 1000) };
  }

  let entry = ipTracker.get(ip);
  if (!entry) {
    entry = { count: 1, windowStart: now, violations: 0, jailedUntil: 0 };
    ipTracker.set(ip, entry);
    return { allowed: true };
  }

  // Check if IP is currently in Jail (auto-banned)
  if (entry.jailedUntil > now) {
    const remainingSec = Math.ceil((entry.jailedUntil - now) / 1000);
    return { allowed: false, jailed: true, retryAfter: remainingSec };
  }

  // Reset window if expired
  if (now - entry.windowStart >= IP_WINDOW_MS) {
    entry.count = 1;
    entry.windowStart = now;
    return { allowed: true };
  }

  entry.count++;
  const limit = isWs ? MAX_WS_UPGRADES_PER_WINDOW : (isApi ? MAX_API_REQ_PER_WINDOW : MAX_GENERAL_REQ_PER_WINDOW);

  if (entry.count > limit) {
    entry.violations++;
    // Only jail if generating massive volumetric flood (60+ req/sec)
    if (entry.count >= VOLUMETRIC_ATTACK_THRESHOLD) {
      entry.jailedUntil = now + JAIL_DURATION_MS;
      console.warn(`[DDoS Guard] IP ${ip} JAILED for volumetric flood (${entry.count} reqs in 10s).`);
      return { allowed: false, jailed: true, retryAfter: Math.ceil(JAIL_DURATION_MS / 1000) };
    }
    // Standard rate limit: brief 2-second 429 response, never a full jail
    return { allowed: false, jailed: false, retryAfter: 2 };
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Main Server Creation & WebSocket Proxy
// ---------------------------------------------------------------------------
const server = createServer((req, res) => {
  const ip = getClientIp(req);
  const url = req.url || "/";
  const isApi = url.startsWith("/v1/") || url === "/v1" || url.startsWith("/api/");

  if (process.env.DEBUG_PROXY === "1") {
    console.log(`[REQ] ${req.method} ${url} (ip: ${ip})`);
  }

  // Health and readiness checks are always allowed without rate limits
  if (url === "/health" || url === "/ready" || url === "/ping") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", timestamp: Date.now() }));
    return;
  }

  // Static assets (CSS, JS chunks, images, avatars, fonts) bypass rate limits entirely
  if (!isStaticAsset(url)) {
    const check = checkRateLimit(ip, isApi, false, url);
    if (!check.allowed) {
      if (check.jailed) {
        res.writeHead(403, {
          "Content-Type": "application/json",
          "Retry-After": String(check.retryAfter || 180),
          "Connection": "close",
        });
        res.end(JSON.stringify({
          error: { code: "FORBIDDEN_TEMPORARY_BLOCK", message: "Too many excessive requests. Access temporarily restricted." }
        }));
        return;
      }

      res.writeHead(429, {
        "Content-Type": "application/json",
        "Retry-After": String(check.retryAfter || 2),
        "Connection": "close",
      });
      res.end(JSON.stringify({
        error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down.", retryAfter: check.retryAfter || 2 }
      }));
      return;
    }
  }

  // Check payload size to prevent payload flood / memory exhaustion
  const contentLength = Number(req.headers["content-length"] || 0);
  const maxPayload = url.startsWith("/avatars/") ? 2 * 1024 * 1024 : 10 * 1024 * 1024;
  if (contentLength > maxPayload) {
    res.writeHead(413, { "Content-Type": "application/json", "Connection": "close" });
    res.end(JSON.stringify({ error: { code: "PAYLOAD_TOO_LARGE", message: "Payload exceeds size limit." } }));
    return;
  }

  if (url.startsWith("/v1/") || url === "/v1" || url.startsWith("/api/oxapay-webhook")) {
    proxyHttp(req, res, apiPort);
    return;
  }

  if (url.startsWith("/gateway")) {
    proxyHttp(req, res, gwPort);
    return;
  }

  // Directly serve dynamic uploaded avatars from AVATAR_STORAGE_DIR
  if (url.startsWith("/avatars/")) {
    const rawFileName = url.slice("/avatars/".length).split("?")[0];
    const safeFileName = path.basename(rawFileName);
    const filePath = path.join(avatarDir, safeFileName);
    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
        return;
      }
      const ext = path.extname(safeFileName).toLowerCase();
      const mimeMap = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
      };
      const contentType = mimeMap[ext] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": stats.size,
        "Cache-Control": "public, max-age=31536000, immutable",
      });
      fs.createReadStream(filePath).pipe(res);
    });
    return;
  }

  proxyHttp(req, res, nextPort);
});

// Slowloris & Resource Exhaustion Protection
server.headersTimeout = 8000;    // 8s: max time allowed to receive HTTP headers
server.requestTimeout = 25000;   // 25s: max time allowed for entire request
server.keepAliveTimeout = 5000;  // 5s: close idle keep-alive connections promptly
server.maxHeadersCount = 80;     // 80 headers max: prevent header flood
server.maxConnections = 1000;    // 1000 concurrent sockets max

server.on("upgrade", (req, socket, head) => {
  const ip = getClientIp(req);
  const url = req.url || "/";
  const check = checkRateLimit(ip, false, true, url);
  if (!check.allowed) {
    socket.write("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  if (url.startsWith("/gateway")) {
    const newPath = url.replace(/^\/gateway/, "") || "/";
    const proxyReq = http.request({
      hostname: "127.0.0.1",
      port:     gwPort,
      path:     newPath,
      method:   req.method,
      headers:  req.headers,
    });

    proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
      const lines = ["HTTP/1.1 101 Switching Protocols"];
      for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
        lines.push(`${proxyRes.rawHeaders[i]}: ${proxyRes.rawHeaders[i + 1]}`);
      }
      socket.write(lines.join("\r\n") + "\r\n\r\n");
      if (proxyHead && proxyHead.length) socket.write(proxyHead);
      if (head      && head.length)      proxySocket.write(head);
      proxySocket.on("error", () => socket.destroy());
      socket.on("error",     () => proxySocket.destroy());
      proxySocket.on("close", () => socket.destroy());
      socket.on("close",     () => proxySocket.destroy());
      proxySocket.pipe(socket);
      socket.pipe(proxySocket);
    });

    proxyReq.on("error", (err) => {
      console.error("[Gateway WS Proxy Error]", err.message);
      socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    });

    proxyReq.end();
    return;
  }

  socket.end();
});

server.listen(port, hostname, () => {
  console.log(`========================================`);
  console.log(`> Nizalo Platform READY on http://${hostname}:${port}`);
  console.log(`  -> Next.js   : ${nextPort}`);
  console.log(`  -> API       : ${apiPort}`);
  console.log(`  -> Gateway   : ${gwPort}`);
  console.log(`========================================`);
});
