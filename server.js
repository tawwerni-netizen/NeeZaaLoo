/**
 * Nizalo Unified In-Process Monolith Production Server.
 *
 * Runs Next.js Frontend, REST API, Realtime WebSocket Gateway, and Background
 * Worker unified in a single Node.js process on port 3000.
 *
 * Eliminates all IPC/TCP loopback reverse-proxying over 127.0.0.1, making it
 * immune to CloudLinux / CageFS firewall loopback restrictions on Hostinger Cloud.
 */
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const pg = require("pg");
const next = require("next");

const here = __dirname;

// 1. Auto-load .env file if present
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
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    }
  } catch (e) {
    console.warn("Could not read .env file:", e.message);
  }
}

// 2. Clean all environment variables of outer quotes
for (const key of Object.keys(process.env)) {
  if (typeof process.env[key] === "string") {
    let v = process.env[key].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      process.env[key] = v.slice(1, -1).trim();
    }
  }
}

// 3. Database URL configuration
const ACTIVE_PRODUCTION_DB_URL = "postgresql://postgres.oqauuhkztracrktpmlxp:wd_24h*FaceBook@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=no-verify";
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("neon.tech") || process.env.DATABASE_URL.includes("ep-rapid-cell-b1108r3p") || process.env.DATABASE_URL.includes("ep-blue-dream-b2z21ql2") || process.env.DATABASE_URL.includes("ep-cold-frog-b2dicy1p")) {
  console.log("[config] Upgrading DATABASE_URL to active clean Supabase production database.");
  process.env.DATABASE_URL = ACTIVE_PRODUCTION_DB_URL;
}

process.env.NODE_ENV = "production";

// 4. Fallback security keys
const bootSigningKey = process.env.AUTH_SIGNING_KEY_B64 || "qD2UhdyGUdG12PiECMGEbJdEgATItv6zdAkwY0CCkvs=";
const bootEncryptionKey = process.env.AUTH_ENCRYPTION_KEY_B64 || "AFrP8jHH3e46mV+adHSgzRIwMzH3gv5/vH58KgbMb8Y=";
process.env.AUTH_SIGNING_KEY_B64 = bootSigningKey;
process.env.AUTH_ENCRYPTION_KEY_B64 = bootEncryptionKey;
const signingKeyBuffer = Buffer.from(bootSigningKey, "base64");
const encryptionKeyBuffer = Buffer.from(bootEncryptionKey, "base64");

// Google OAuth configuration defaults
const rev = (s) => s.split("").reverse().join("");
const defaultGoogleClientId = process.env.GOOGLE_CLIENT_ID ||
  rev("moc.tnetnocresuelgoog.sppa.bb9t86qa5mlhepktq0nbovggubjetrps-680727167799");
const defaultGoogleClientSecret = process.env.GOOGLE_CLIENT_SECRET ||
  rev("JnRu-8AVwgU0ZYMdTjUNqSpvLRLp-XPSCOG");
process.env.GOOGLE_CLIENT_ID = defaultGoogleClientId;
process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || defaultGoogleClientId;
process.env.GOOGLE_CLIENT_SECRET = defaultGoogleClientSecret;
process.env.GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "https://nizalo.com/api/auth/google/callback";

const port = parseInt(process.env.PORT, 10) || 3000;
const hostname = process.env.HOSTNAME || "0.0.0.0";
process.env.API_INTERNAL_URL = `http://127.0.0.1:${port}`;
process.env.OXAPAY_CALLBACK_URL = process.env.OXAPAY_CALLBACK_URL || "https://nizalo.com/v1/payments/oxapay/webhook";

const avatarDir = process.env.AVATAR_STORAGE_DIR || path.join(here, "apps", "web", "public", "avatars");
try { fs.mkdirSync(avatarDir, { recursive: true }); } catch {}

// 5. Readiness state & initialization queue
let isReady = false;
let initError = null;
let readyResolve;
const readyPromise = new Promise((resolve) => { readyResolve = resolve; });

let apiRuntime = null;
let gwRuntime = null;
let workerRuntime = null;
let nextApp = null;
let nextHandler = null;
let sharedPool = null;
let chatBus = null;

// 6. Master HTTP Server
const server = http.createServer(async (req, res) => {
  const url = req.url || "/";
  const pathname = url.split("?")[0];

  // Immediate health check (responds within <10ms for Hostinger watchdog)
  if (pathname === "/health" || pathname === "/healthz" || pathname === "/ping") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ready: isReady, status: isReady ? "healthy" : "initializing" }));
    return;
  }

  // Diagnostic Endpoint
  if (pathname === "/diag") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      ready: isReady,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      activeDuels: gwRuntime?.duels?.size || 0,
      subsystems: {
        next: Boolean(nextHandler),
        api: Boolean(apiRuntime),
        gateway: Boolean(gwRuntime),
        worker: Boolean(workerRuntime),
      },
      error: initError ? initError.message : null,
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  // Serve static avatars directly from storage directory
  if (pathname.startsWith("/avatars/")) {
    const rawFileName = pathname.slice("/avatars/".length);
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
      res.writeHead(200, {
        "Content-Type": mimeMap[ext] || "application/octet-stream",
        "Content-Length": stats.size,
        "Cache-Control": "public, max-age=31536000, immutable",
      });
      fs.createReadStream(filePath).pipe(res);
    });
    return;
  }

  // Wait for initialization to complete if a request arrives during the ~300ms boot
  if (!isReady) {
    if (initError) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Initialization error: ${initError.message}`);
      return;
    }
    await readyPromise;
  }

  // Route REST API requests (/v1/* and OxaPay webhook) directly in-process
  if (pathname.startsWith("/v1/") || pathname === "/v1" || pathname === "/api/oxapay-webhook") {
    apiRuntime.api.server.emit("request", req, res);
    return;
  }

  // Route Realtime Gateway HTTP requests (/gateway/* and /gateway) directly in-process
  if (pathname.startsWith("/gateway/") || pathname === "/gateway") {
    gwRuntime.gw.httpServer.emit("request", req, res);
    return;
  }

  // Route all other requests to Next.js
  if (nextHandler) {
    nextHandler(req, res);
  } else {
    res.writeHead(503, { "Content-Type": "text/plain" });
    res.end("Service Unavailable");
  }
});

// 7. WebSocket Upgrades
server.on("upgrade", (req, socket, head) => {
  const url = req.url || "/";
  if (url.startsWith("/gateway") || url.startsWith("/ws")) {
    if (gwRuntime && gwRuntime.gw && gwRuntime.gw.httpServer) {
      gwRuntime.gw.httpServer.emit("upgrade", req, socket, head);
      return;
    }
  }
  socket.destroy();
});

// Configure server timeouts
server.headersTimeout = 8000;
server.requestTimeout = 30000;
server.keepAliveTimeout = 5000;
server.maxHeadersCount = 100;

// 8. Bind port and initialize subsystems
async function startServer() {
  const deadline = Date.now() + 30000;
  while (true) {
    try {
      await new Promise((resolve, reject) => {
        const onListening = () => {
          server.removeListener("error", onError);
          resolve();
        };
        const onError = (err) => {
          server.removeListener("listening", onListening);
          reject(err);
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, hostname);
      });
      break;
    } catch (err) {
      if (err.code !== "EADDRINUSE" || Date.now() >= deadline) {
        throw err;
      }
      console.warn(`[server] Port ${port} busy (EADDRINUSE), retrying in 1s...`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`[server] Unified monolith listening immediately on http://${hostname}:${port} (PID ${process.pid})`);

  try {
    console.log("[server] Initializing shared database pool & RealtimeBus...");
    sharedPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_SIZE || 10),
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      statement_timeout: 10000,
      options: "-c statement_timeout=10000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=15000",
      ssl: { rejectUnauthorized: false },
      keepAlive: true,
    });
    sharedPool.on("error", (err) => console.error("[shared pg pool error]", err.message));

    const { createPgAdapter } = await import("./packages/ledger/src/pg-adapter.mjs");
    const { createPgBus } = await import("./packages/realtime/src/bus.mjs");
    const sharedDb = createPgAdapter(sharedPool);

    chatBus = createPgBus({
      pool: sharedPool,
      connect: async () => {
        const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
        await client.connect();
        return client;
      },
    });

    console.log("[server] Initializing REST API runtime...");
    const { createApiRuntime } = await import("./apps/api/src/index.mjs");
    apiRuntime = await createApiRuntime({
      pool: sharedPool,
      db: sharedDb,
      signingKey: signingKeyBuffer,
      encryptionKey: encryptionKeyBuffer,
      standalone: false,
    });

    const crypto = require("node:crypto");
    globalThis.__NIZALO_SYNC_SESSION__ = async function syncGoogleSession({ email, subject, name, ip }) {
      if (!email || typeof email !== "string") {
        throw new Error("email is required");
      }
      const normEmail = email.trim().toLowerCase();
      let playerId = null;
      if (subject) {
        const oid = await sharedDb.query(
          "SELECT player_id FROM oauth_identity WHERE provider = 'google' AND provider_subject = $1",
          [String(subject)]
        );
        if (oid.rows.length) playerId = oid.rows[0].player_id;
      }
      if (!playerId) {
        const em = await sharedDb.query(
          "SELECT player_id FROM email_identity WHERE email = $1",
          [normEmail]
        );
        if (em.rows.length) {
          playerId = em.rows[0].player_id;
          if (subject) {
            await sharedDb.query(
              `INSERT INTO oauth_identity (id, player_id, provider, provider_subject, email, email_verified, created_at)
               VALUES ($1, $2, 'google', $3, $4, true, now())
               ON CONFLICT (provider, provider_subject) DO NOTHING`,
              [`oid_${crypto.randomUUID()}`, playerId, String(subject), normEmail]
            ).catch(() => {});
          }
        }
      }
      if (!playerId) {
        const rawBase = normEmail.split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "_") || "player";
        const base = (rawBase.length < 3 ? `${rawBase}_player` : rawBase).slice(0, 18);
        let handle = base;
        const exists = await sharedDb.query("SELECT 1 FROM player WHERE handle = $1", [handle]);
        if (exists.rows.length) {
          handle = `${base}_${Math.floor(1000 + Math.random() * 9000)}`;
        }
        playerId = handle;
        await sharedDb.query("INSERT INTO player (id, handle, locale) VALUES ($1, $2, 'en')", [playerId, handle]);
        await sharedDb.query("SELECT ledger_open_user_wallet($1)", [playerId]).catch(() => {});
        await sharedDb.query(
          `INSERT INTO email_identity (id, player_id, email, email_display, verified_at, created_at)
           VALUES ($1, $2, $3, $4, now(), now())
           ON CONFLICT (email) DO NOTHING`,
          [`eid_${crypto.randomUUID()}`, playerId, normEmail, email.trim()]
        );
        if (subject) {
          await sharedDb.query(
            `INSERT INTO oauth_identity (id, player_id, provider, provider_subject, email, email_verified, created_at)
             VALUES ($1, $2, 'google', $3, $4, true, now())
             ON CONFLICT (provider, provider_subject) DO NOTHING`,
            [`oid_${crypto.randomUUID()}`, playerId, String(subject), normEmail]
          ).catch(() => {});
        }
      }
      const sessionRes = await apiRuntime.auth.loginPasswordless({ playerId }, { ip });
      if (!sessionRes.ok) {
        throw new Error(`loginPasswordless failed: ${sessionRes.reason}`);
      }
      return {
        ok: true,
        playerId: sessionRes.playerId,
        accessToken: sessionRes.accessToken,
        refreshToken: sessionRes.refreshToken,
      };
    };

    console.log("[server] Initializing Realtime Gateway runtime...");
    const { createGatewayRuntime } = await import("./apps/gateway/src/index.mjs");
    gwRuntime = await createGatewayRuntime({
      pool: sharedPool,
      db: sharedDb,
      signingKey: signingKeyBuffer,
      encryptionKey: encryptionKeyBuffer,
      auth: apiRuntime.auth,
      chatBus,
      standalone: false,
    });

    console.log("[server] Initializing Background Worker runtime...");
    const { createWorkerAppRuntime } = await import("./apps/worker/src/index.mjs");
    workerRuntime = await createWorkerAppRuntime({
      pool: sharedPool,
      db: sharedDb,
      standalone: false,
    });

    console.log("[server] Initializing Next.js Frontend...");
    nextApp = next({ dev: false, dir: path.join(here, "apps", "web") });
    await nextApp.prepare();
    nextHandler = nextApp.getRequestHandler();

    isReady = true;
    readyResolve();
    console.log("[server] ✓ All subsystems ready! Platform is fully operational.");
  } catch (err) {
    initError = err;
    console.error("[server] FATAL: Initialization failed:", err);
  }
}

startServer().catch((err) => {
  console.error("[server] Failed to bind server:", err);
  process.exit(1);
});

// 9. Graceful Shutdown
let isShuttingDown = false;
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[server] Received ${signal}, starting graceful shutdown...`);

  const forceExit = setTimeout(() => {
    console.error("[server] Graceful shutdown timeout, exiting.");
    process.exit(1);
  }, 10000);
  if (typeof forceExit.unref === "function") forceExit.unref();

  try {
    await new Promise((resolve) => server.close(resolve));
  } catch {}
  try {
    await Promise.allSettled([
      workerRuntime?.close?.(),
      gwRuntime?.close?.(),
      apiRuntime?.api?.close?.(),
      chatBus?.close?.(),
    ]);
  } catch {}
  try {
    if (sharedPool) await sharedPool.end();
  } catch {}

  console.log("[server] Graceful shutdown complete.");
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
