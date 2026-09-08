/**
 * The gateway with real authentication behind it.
 *
 * Until now the socket accepted tokens from a Map. This closes that gap: the
 * tokens are real signed access tokens, the identity comes from the database,
 * and a session revoked mid-game stops working.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createGateway } from "../src/gateway.mjs";
import { ServerMsg, ErrorCode } from "../src/protocol.mjs";
import { ChessPlugin } from "../../game-chess/src/plugin.mjs";
import { createDuel, start } from "../../duel-engine/src/duel.mjs";

const SIGNING_KEY = Buffer.alloc(32, 3);
const ENCRYPTION_KEY = Buffer.alloc(32, 4);
const PASSWORD = "correct horse battery staple";
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };

const CLOCK = Date.now();
const now = () => CLOCK;

function client(url) {
  const ws = new WebSocket(url);
  const inbox = [], waiters = [];
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    const i = waiters.findIndex((w) => !w.pred || w.pred(msg));
    if (i >= 0) { const w = waiters.splice(i, 1)[0]; clearTimeout(w.timer); w.resolve(msg); }
    else inbox.push(msg);
  });
  return {
    ws,
    send: (o) => ws.send(JSON.stringify(o)),
    next(pred) {
      const i = pred ? inbox.findIndex(pred) : (inbox.length ? 0 : -1);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const w = { pred, resolve };
        w.timer = setTimeout(() => {
          waiters.splice(waiters.indexOf(w), 1);
          reject(new Error(`timeout; queued: ${JSON.stringify(inbox)}`));
        }, 3000);
        waiters.push(w);
      });
    },
    open: () => new Promise((r) => (ws.readyState === ws.OPEN ? r() : ws.once("open", r))),
    close: () => new Promise((r) => {
      if (ws.readyState === ws.CLOSED) return r();
      ws.once("close", r);
      ws.close();
    }),
  };
}

async function stack() {
  const db = await PGlite.create();
  await migrate(db);
  const auth = createAuthService(db, {
    signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, now, argon: FAST_ARGON,
  });
  await auth.register({ playerId: "alice", handle: "alice", password: PASSWORD });
  await auth.register({ playerId: "bob", handle: "bob", password: PASSWORD });

  const duels = new Map();
  const plugins = new Map([["chess", ChessPlugin]]);
  const gw = createGateway({ auth, duels, plugins, now });

  const d = createDuel({
    duelId: "d1", plugin: ChessPlugin, players: ["alice", "bob"],
    seed: null, config: {}, timeControl: { initialMs: 300_000, incrementMs: 0 }, now: CLOCK,
  });
  start(d, CLOCK);
  duels.set("d1", d);

  return { db, auth, gw };
}

// ---------------------------------------------------------------------------

describe("the gateway with real authentication", () => {
  test("a real access token authenticates the socket", async () => {
    const { auth, gw } = await stack();
    const login = await auth.login({ identifier: "alice", password: PASSWORD });

    const c = client(gw.url);
    await c.open();
    c.send({ t: "AUTH", token: login.accessToken });
    const res = await c.next();
    assert.equal(res.t, ServerMsg.AUTHED);
    assert.equal(res.playerId, "alice", "identity comes from the token, not the client");

    await c.close();
    await gw.close();
  });

  test("a forged token is refused", async () => {
    const { auth, gw } = await stack();
    const login = await auth.login({ identifier: "alice", password: PASSWORD });

    // Same payload, signature from a different key.
    const body = login.accessToken.split(".")[0];
    const forged = `${body}.${Buffer.alloc(32, 1).toString("base64url")}`;

    const c = client(gw.url);
    await c.open();
    c.send({ t: "AUTH", token: forged });
    assert.equal((await c.next()).code, ErrorCode.BAD_TOKEN);

    await c.close();
    await gw.close();
  });

  test("a client cannot claim to be another player", async () => {
    // The whole point of real tokens: the socket takes identity from the
    // signature, and there is no field in which a client states who it is.
    const { auth, gw } = await stack();
    const bobLogin = await auth.login({ identifier: "bob", password: PASSWORD });

    const c = client(gw.url);
    await c.open();
    c.send({ t: "AUTH", token: bobLogin.accessToken });
    const res = await c.next();
    assert.equal(res.playerId, "bob");

    // Bob is black, so his first move must be refused as out of turn.
    c.send({ t: "JOIN", duelId: "d1" });
    const state = await c.next((m) => m.t === ServerMsg.STATE);
    assert.equal(state.seat, 1, "seated as himself, not as whoever he asked to be");

    c.send({ t: "INTENT", duelId: "d1", intent: "e2e4" });
    assert.equal((await c.next((m) => m.t === ServerMsg.REJECTED)).reason, "NOT_YOUR_TURN");

    await c.close();
    await gw.close();
  });

  test("a session revoked mid-game can no longer authenticate", async () => {
    // Logout-everywhere, a password change, or detected refresh-token theft
    // must all cut the socket off, even though the access token itself is
    // still signed and unexpired.
    const { auth, gw } = await stack();
    const login = await auth.login({ identifier: "alice", password: PASSWORD });

    const first = client(gw.url);
    await first.open();
    first.send({ t: "AUTH", token: login.accessToken });
    assert.equal((await first.next()).t, ServerMsg.AUTHED);

    await auth.logout(login.refreshToken, { everywhere: true });

    const second = client(gw.url);
    await second.open();
    second.send({ t: "AUTH", token: login.accessToken });
    assert.equal((await second.next()).code, ErrorCode.BAD_TOKEN,
      "still cryptographically valid, but the session is dead");

    await first.close();
    await second.close();
    await gw.close();
  });

  test("a password change locks the old token out of the socket", async () => {
    const { auth, gw } = await stack();
    const login = await auth.login({ identifier: "alice", password: PASSWORD });
    await auth.changePassword({
      playerId: "alice", currentPassword: PASSWORD, newPassword: "another good passphrase",
    });

    const c = client(gw.url);
    await c.open();
    c.send({ t: "AUTH", token: login.accessToken });
    assert.equal((await c.next()).code, ErrorCode.BAD_TOKEN);

    await c.close();
    await gw.close();
  });

  test("the gateway refuses to start with no way to authenticate", () => {
    assert.throws(
      () => createGateway({ duels: new Map(), plugins: new Map() }),
      /needs either an auth service or a sessions map/
    );
  });
});
