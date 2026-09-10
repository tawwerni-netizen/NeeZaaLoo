/**
 * Hostinger's "Other" framework preset requires a root-level Entry File it
 * runs directly (node server.js) -- it does not run npm scripts. This is
 * that entry file: a thin custom server using Next's own programmatic API
 * to serve the real application in apps/web, using the monorepo's normal
 * root-level install (Root Directory: ./, Build Command: npm run build)
 * rather than the separate .next/hostinger flattened artifact, which stays
 * untouched and is not involved in this path at all.
 *
 * dir is resolved explicitly to apps/web so this works regardless of the
 * process's cwd -- Next's own App Router, proxy.ts locale routing, dynamic
 * routes, public/, and .next/static all come from that same apps/web build
 * this server just points at, unmodified.
 */
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "apps", "web");

process.env.NODE_ENV = "production";

const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT, 10) || 3000;

const app = next({ dev: false, dir, hostname, port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer((req, res) => {
      handle(req, res);
    }).listen(port, hostname, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
