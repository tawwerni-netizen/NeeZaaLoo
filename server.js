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
// Main Server Creation & WebSocket Proxy
// ---------------------------------------------------------------------------
const server = createServer((req, res) => {
  const url = req.url || "/";
  if (process.env.DEBUG_PROXY === "1") {
    console.log(`[REQ] ${req.method} ${url}`);
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

server.on("upgrade", (req, socket, head) => {
  const url = req.url || "/";
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

// ---------------------------------------------------------------------------
// Readiness Probe: Only listen on public port AFTER Next.js is ready!
// ---------------------------------------------------------------------------
function waitForNextReady(targetPort, maxAttempts, onReady) {
  let attempts = 0;
  let done = false;
  function trigger() {
    if (done) return;
    done = true;
    onReady();
  }

  function probe() {
    if (done) return;
    attempts++;
    const req = http.request(
      { hostname: "127.0.0.1", port: targetPort, path: "/", method: "GET", timeout: 800 },
      (res) => {
        console.log(`[Readiness] Next.js on port ${targetPort} is READY (status=${res.statusCode}).`);
        trigger();
      }
    );
    req.on("error", () => {
      if (done) return;
      if (attempts < maxAttempts) {
        setTimeout(probe, 150);
      } else {
        console.warn(`[Readiness] Next.js probe reached max attempts. Starting server anyway...`);
        trigger();
      }
    });
    req.on("timeout", () => {
      req.destroy();
      if (done) return;
      if (attempts < maxAttempts) {
        setTimeout(probe, 150);
      } else {
        trigger();
      }
    });
    req.end();
  }
  probe();
}

waitForNextReady(nextPort, 50, () => {
  server.listen(port, hostname, () => {
    console.log(`========================================`);
    console.log(`> Nizalo Platform READY on http://${hostname}:${port}`);
    console.log(`  -> Next.js   : ${nextPort}`);
    console.log(`  -> API       : ${apiPort}`);
    console.log(`  -> Gateway   : ${gwPort}`);
    console.log(`========================================`);
  });
});
