/**
 * Hostinger Production Entrypoint -- node server.js (CommonJS, root-level).
 *
 * Architecture:
 *   - Next.js Standalone (apps/web)  -> 127.0.0.1:3002
 *   - REST API (apps/api)            -> 127.0.0.1:4000
 *   - Realtime Gateway (apps/gateway)-> 127.0.0.1:3010
 *   - Background Worker (apps/worker)-> 127.0.0.1:4001
 *   - Master Reverse Proxy           -> 0.0.0.0:PORT (default 3000)
 *
 * CRITICAL: The Master Proxy does NOT open its listening port until
 * Next.js on port 3002 is verified READY and accepting connections.
 * This prevents Hostinger deployment health-checks from hitting port
 * 3000 during the 500ms startup gap and failing with ECONNREFUSED.
 */
const { createServer } = require("node:http");
const http = require("node:http");
const { spawn } = require("node:child_process");
const path = require("node:path");

const here = __dirname;
process.env.NODE_ENV = "production";

const hostname = process.env.HOSTNAME || "0.0.0.0";
const port     = parseInt(process.env.PORT,      10) || 3000;
const nextPort = parseInt(process.env.NEXT_PORT, 10) || 3002;
const apiPort  = parseInt(process.env.API_PORT,  10) || 4000;
const gwPort   = parseInt(process.env.WS_PORT,   10) || 3010;

const nextScript   = path.join(here, "apps", "web", ".next", "hostinger", "server.js");
const apiScript    = path.join(here, "apps", "api", "src", "index.mjs");
const gwScript     = path.join(here, "apps", "gateway", "src", "index.mjs");
const workerScript = path.join(here, "apps", "worker", "src", "index.mjs");

function getEnv(childPort) {
  return Object.assign({}, process.env, {
    NODE_ENV:               process.env.API_NODE_ENV || "development",
    PORT:                   String(childPort),
    WS_PORT:                String(gwPort),
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
    AVATAR_STORAGE_DIR:
      process.env.AVATAR_STORAGE_DIR ||
      path.join(here, "apps", "web", "public", "avatars"),
    AVATAR_PUBLIC_BASE_URL:
      process.env.AVATAR_PUBLIC_BASE_URL || "/avatars",
  });
}

// ---------------------------------------------------------------------------
// Process Management
// ---------------------------------------------------------------------------
const children = {};

function startProcess(name, script, childPort, customCwd) {
  function launch() {
    console.log(`[${name}] Spawning on port ${childPort}...`);
    try {
      const childEnv = name === "Next.js"
        ? Object.assign({}, process.env, {
            PORT: String(childPort),
            HOSTNAME: "127.0.0.1",
            NODE_ENV: "production",
          })
        : getEnv(childPort);

      const child = spawn(process.execPath, [script], {
        cwd: customCwd || here,
        env: childEnv,
        stdio: "inherit",
      });

      child.on("error", (err) => {
        console.error(`[${name}] Spawn error:`, err.message);
      });

      child.on("exit", (code, signal) => {
        console.warn(`[${name}] Exited (code=${code}, signal=${signal}). Restarting in 2s...`);
        setTimeout(launch, 2000);
      });

      children[name] = child;
    } catch (err) {
      console.error(`[${name}] Launch failed:`, err.message);
    }
  }
  launch();
}

startProcess("Next.js", nextScript,   nextPort, path.dirname(nextScript));
startProcess("API",     apiScript,    apiPort);
startProcess("Gateway", gwScript,     gwPort);
startProcess("Worker",  workerScript, 4001);

function shutdown() {
  console.log("Shutting down all child processes...");
  Object.keys(children).forEach((k) => {
    try { if (children[k]) children[k].kill(); } catch (e) {}
  });
  process.exit(0);
}
process.on("SIGINT",  shutdown);
process.on("SIGTERM", shutdown);

// ---------------------------------------------------------------------------
// Reverse Proxy Helpers
// ---------------------------------------------------------------------------
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
  const pHeaders = Object.assign({}, req.headers);
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
      timeout:  30000,
    },
    (proxyRes) => {
      console.log(`[HTTP ${proxyRes.statusCode}] ${req.method} ${req.url}`);
      const respHeaders = cleanHopByHopHeaders(proxyRes.headers);
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
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "BAD_GATEWAY", message: "Service starting up, please retry" } }));
    }
  });

  if (req.method === "GET" || req.method === "HEAD") {
    proxyReq.end();
  } else {
    req.pipe(proxyReq, { end: true });
  }
}

// ---------------------------------------------------------------------------
// Main Server Creation & WebSocket Proxy
// ---------------------------------------------------------------------------
const server = createServer((req, res) => {
  const url = req.url || "/";

  if (url.startsWith("/v1/") || url === "/v1") {
    proxyHttp(req, res, apiPort);
    return;
  }

  if (url.startsWith("/gateway")) {
    res.writeHead(426, { "Content-Type": "text/plain", Upgrade: "WebSocket" });
    res.end("Upgrade Required");
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

console.log("[Bootstrap] Waiting for Next.js to become ready before opening public port...");
waitForNextReady(nextPort, 60, () => {
  server.listen(port, hostname, () => {
    console.log(`========================================`);
    console.log(`> Nizalo Platform READY on http://${hostname}:${port}`);
    console.log(`  -> Next.js   : ${nextPort}`);
    console.log(`  -> API       : ${apiPort}`);
    console.log(`  -> Gateway   : ${gwPort}`);
    console.log(`========================================`);
  });
});
