/**
 * Hostinger entry file -- node server.js (CommonJS, root-level).
 *
 * WHY THIS APPROACH: The Next.js programmatic API (require("next")) does NOT
 * work with `output: "standalone"` -- Next.js itself warns and pages return
 * 403 because they live in the standalone bundle, not where the API looks.
 *
 * Instead this process:
 *   1. Spawns the pre-built Next.js standalone server as its own child
 *      process on an internal port (NEXT_PORT, default 3002).
 *   2. Spawns the REST API  (apps/api)     on API_PORT  (default 4000).
 *   3. Spawns the Gateway   (apps/gateway) on WS_PORT   (default 3010).
 *   4. Spawns the Worker    (apps/worker).
 *   5. Listens on PORT (3000) and proxies:
 *        /v1/*    -> API (4000)
 *        /gateway -> Gateway WebSocket (3010)
 *        *        -> Next.js (3002)
 *
 * Root package.json MUST stay "type":"commonjs" -- Hostinger pre-loads its
 * own CJS scripts before this file and require()s them from this directory.
 */
const { createServer } = require("node:http");
const http   = require("node:http");
const { fork, spawn } = require("node:child_process");
const path   = require("node:path");

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
  return {
    ...process.env,
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
  };
}

// ---------------------------------------------------------------------------
// Child process launchers with auto-restart
// ---------------------------------------------------------------------------
let apiChild = null, gwChild = null, workerChild = null, nextChild = null;

function startFork(name, script, childPort) {
  function doFork() {
    try {
      const child = fork(script, [], {
        cwd: here,
        env: getEnv(childPort),
        stdio: "inherit",
      });
      child.on("exit", (code, signal) => {
        console.warn("[" + name + "] exited (code=" + code + ", signal=" + signal + "). Restarting in 2s...");
        setTimeout(doFork, 2000);
      });
      if (name === "API")     apiChild    = child;
      if (name === "Gateway") gwChild     = child;
      if (name === "Worker")  workerChild = child;
    } catch (err) {
      console.error("[" + name + "] Failed to launch:", err.message);
    }
  }
  doFork();
}

function startNext(port) {
  function doSpawn() {
    try {
      const child = spawn(process.execPath, [nextScript], {
        cwd: path.dirname(nextScript),
        env: {
          ...process.env,
          PORT:     String(port),
          HOSTNAME: "127.0.0.1",
          NODE_ENV: "production",
        },
        stdio: "inherit",
      });
      child.on("exit", (code, signal) => {
        console.warn("[Next.js] exited (code=" + code + ", signal=" + signal + "). Restarting in 2s...");
        setTimeout(doSpawn, 2000);
      });
      nextChild = child;
    } catch (err) {
      console.error("[Next.js] Failed to launch:", err.message);
    }
  }
  doSpawn();
}

startNext(nextPort);
startFork("API",     apiScript,    apiPort);
startFork("Gateway", gwScript,     gwPort);
startFork("Worker",  workerScript, 4001);

function shutdown() {
  [apiChild, gwChild, workerChild, nextChild].forEach(function(c) {
    try { if (c) c.kill(); } catch (e) {}
  });
  process.exit(0);
}
process.on("SIGINT",  shutdown);
process.on("SIGTERM", shutdown);

// ---------------------------------------------------------------------------
// HTTP proxy
// ---------------------------------------------------------------------------
function proxyHttp(req, res, targetPort) {
  const proxyReq = http.request(
    {
      hostname: "127.0.0.1",
      port:     targetPort,
      path:     req.url,
      method:   req.method,
      headers:  Object.assign({}, req.headers, { host: "127.0.0.1:" + targetPort }),
    },
    function(proxyRes) {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );
  proxyReq.on("error", function(err) {
    console.error("[Proxy->" + targetPort + "]", err.message);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "BAD_GATEWAY", message: "Service starting, please retry" } }));
    }
  });
  req.pipe(proxyReq, { end: true });
}

const server = createServer(function(req, res) {
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

server.on("upgrade", function(req, socket, head) {
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
    proxyReq.on("upgrade", function(proxyRes, proxySocket, proxyHead) {
      const lines = ["HTTP/1.1 101 Switching Protocols"];
      for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
        lines.push(proxyRes.rawHeaders[i] + ": " + proxyRes.rawHeaders[i + 1]);
      }
      socket.write(lines.join("\r\n") + "\r\n\r\n");
      if (proxyHead && proxyHead.length) socket.write(proxyHead);
      if (head      && head.length)      proxySocket.write(head);
      proxySocket.on("error", function() { socket.destroy(); });
      socket.on("error",      function() { proxySocket.destroy(); });
      proxySocket.on("close", function() { socket.destroy(); });
      socket.on("close",      function() { proxySocket.destroy(); });
      proxySocket.pipe(socket);
      socket.pipe(proxySocket);
    });
    proxyReq.on("error", function(err) {
      console.error("[Gateway WS Proxy]", err.message);
      socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    });
    proxyReq.end();
    return;
  }
  socket.end();
});

server.listen(port, hostname, function() {
  console.log("> Proxy ready on http://" + hostname + ":" + port);
  console.log("  -> Next.js  :" + nextPort);
  console.log("  -> API      :" + apiPort);
  console.log("  -> Gateway  :" + gwPort);
});
