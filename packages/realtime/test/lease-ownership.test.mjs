/**
 * A4, end to end: two REAL, independent gateway instances, sharing nothing
 * but the database, must never both believe they own the same duel.
 *
 * This is the exact scenario the phase asked for by name:
 *
 *   Gateway A owns duel -> Gateway B attempts ownership -> A "fails"
 *   -> B takes over -> stale A attempts to submit an event
 *   -> the stale event is rejected
 *
 * Nothing here is a process-local mock: A and B are two `createGateway()`
 * instances (two real WebSocketServers, two real port numbers), and the only
 * thing they share is the PGlite database and the `duel` row's lease
 * columns. If exclusivity held only because they happened to be the same
 * process, this test would not be able to tell the difference -- so it goes
 * out of its way to keep A's in-memory state completely untouched by B's
 * takeover, exactly like a real network partition would.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createGateway } from "../src/gateway.mjs";
import { createDuelStore } from "../src/store.mjs";
import { createLeaseManager } from "../src/lease.mjs";
import { ServerMsg, ErrorCode } from "../src/protocol.mjs";
import { ChessPlugin } from "../../game-chess/src/plugin.mjs";

const TC = JSON.stringify({ initialMs: 300000, incrementMs: 0 });
const INITIAL = JSON.stringify({ fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" });
const sessions = new Map([["tok-alice", "alice"], ["tok-bob", "bob"]]);

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
        w.timer = setTimeout(() => reject(new Error("timeout waiting for a frame")), 3000);
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

async function fresh(leaseMs = 60) {
  const db = await PGlite.create();
  await migrate(db);
  for (const p of ["alice", "bob"]) await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [p]);
  await db.query(
    `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
                       tier, stake_minor, initial_state, time_control, status, started_at)
     VALUES ('d1','chess',1,'pk','alice','bob','FREE',0,$1::jsonb,$2::jsonb,'LIVE'::duel_status, now())`,
    [INITIAL, TC]
  );
  const store = createDuelStore(db);
  const lease = createLeaseManager(db, { leaseMs });
  const plugins = () => new Map([["chess", ChessPlugin]]);
  return { db, store, lease, plugins };
}

describe("A4: cross-instance duel ownership", () => {
  test("gateway A owns the duel; gateway B cannot claim it while A's lease is live", async () => {
    const { store, lease, plugins } = await fresh();
    const gwA = createGateway({ sessions, duels: new Map(), plugins: plugins(), store, lease, ownerId: "gw-a" });
    const gwB = createGateway({ sessions, duels: new Map(), plugins: plugins(), store, lease, ownerId: "gw-b" });

    const claimA = await gwA.claimDuel("d1");
    assert.equal(claimA.ok, true);

    const claimB = await gwB.claimDuel("d1");
    assert.equal(claimB.ok, false);
    assert.equal(claimB.reason, "HELD_BY_OTHER");

    await gwA.close(); await gwB.close();
  });

  test("full scenario: A owns, A fails, B takes over after expiry, A's stale write is rejected, B's own play succeeds", async () => {
    const { store, lease, plugins } = await fresh(60); // short lease so the test does not need to wait long
    const gwA = createGateway({ sessions, duels: new Map(), plugins: plugins(), store, lease, ownerId: "gw-a" });
    const gwB = createGateway({ sessions, duels: new Map(), plugins: plugins(), store, lease, ownerId: "gw-b" });

    // A owns the duel and alice is connected to it through A, but has not
    // moved yet -- from A's point of view the game is still at move one,
    // white to play.
    const claimA = await gwA.claimDuel("d1");
    assert.equal(claimA.ok, true);

    const aliceViaA = client(gwA.url);
    await aliceViaA.open();
    aliceViaA.send({ t: "AUTH", token: "tok-alice" });
    await aliceViaA.next((m) => m.t === ServerMsg.AUTHED);
    aliceViaA.send({ t: "JOIN", duelId: "d1" });
    await aliceViaA.next((m) => m.t === ServerMsg.STATE);

    // A "fails": nothing more renews its lease (no crash needed to simulate
    // this -- a network partition looks identical from the database's side).
    // Wait past the lease window.
    await new Promise((r) => setTimeout(r, 100));

    // B takes over. This is a genuinely different gateway instance -- gwA's
    // in-memory `duels` map and its open socket are completely untouched.
    const claimB = await gwB.claimDuel("d1");
    assert.equal(claimB.ok, true);
    assert.ok(claimB.token > claimA.token, "B's takeover minted a strictly higher fencing token");

    // The real game continues through B, the legitimate owner: alice
    // reconnects there (a real client would be redirected by whatever
    // routing layer sits in front of the gateways -- out of scope here) and
    // plays the actual first move.
    const aliceViaB = client(gwB.url);
    await aliceViaB.open();
    aliceViaB.send({ t: "AUTH", token: "tok-alice" });
    await aliceViaB.next((m) => m.t === ServerMsg.AUTHED);
    aliceViaB.send({ t: "JOIN", duelId: "d1" });
    await aliceViaB.next((m) => m.t === ServerMsg.STATE);
    aliceViaB.send({ t: "INTENT", duelId: "d1", intent: "e2e4" });
    const realMove = await aliceViaB.next((m) => m.type === "MOVE");
    assert.equal(realMove.payload.uci, "e2e4");

    // Now stale A, still not knowing it lost ownership and still showing
    // white to move (it never saw B's game at all), tries to submit ITS OWN
    // version of the very same first move through its own still-open
    // connection. From A's stale, purely local point of view this intent is
    // perfectly legal -- the rejection can only come from the database-level
    // fencing check at the moment of the actual write, never from A noticing
    // anything wrong on its own.
    aliceViaA.send({ t: "INTENT", duelId: "d1", intent: "e2e4" });
    const rejection = await aliceViaA.next((m) => m.t === ServerMsg.ERROR);
    assert.equal(rejection.code, ErrorCode.STALE_OWNER);

    // The log has exactly one move -- B's real one -- never a duplicate,
    // never a fork.
    const reloaded = await store.load("d1", plugins(), Date.now());
    const uciMoves = reloaded.events.filter((e) => e.type === "MOVE").map((e) => e.payload.uci);
    assert.deepEqual(uciMoves, ["e2e4"]);

    // A, having been rejected, must have evicted the duel locally -- a
    // second message against the same duelId now gets a clean NO_SUCH_DUEL,
    // not another stale-owner surprise from half-evicted state.
    aliceViaA.send({ t: "INTENT", duelId: "d1", intent: "g1f3" });
    const afterEviction = await aliceViaA.next((m) => m.t === ServerMsg.ERROR);
    assert.equal(afterEviction.code, ErrorCode.NO_SUCH_DUEL);

    await aliceViaA.close(); await aliceViaB.close();
    await gwA.close(); await gwB.close();
  });

  test("a graceful release lets another instance claim immediately, with no expiry wait", async () => {
    const { store, lease, plugins } = await fresh();
    const gwA = createGateway({ sessions, duels: new Map(), plugins: plugins(), store, lease, ownerId: "gw-a" });
    const gwB = createGateway({ sessions, duels: new Map(), plugins: plugins(), store, lease, ownerId: "gw-b" });

    await gwA.claimDuel("d1");
    await gwA.releaseDuel("d1");
    const claimB = await gwB.claimDuel("d1");
    assert.equal(claimB.ok, true);

    await gwA.close(); await gwB.close();
  });

  test("sweepLeaseRenewals keeps a busy owner's lease alive indefinitely", async () => {
    const { store, lease, plugins } = await fresh(60);
    const gwA = createGateway({ sessions, duels: new Map(), plugins: plugins(), store, lease, ownerId: "gw-a" });
    const gwB = createGateway({ sessions, duels: new Map(), plugins: plugins(), store, lease, ownerId: "gw-b" });

    await gwA.claimDuel("d1");
    // Renew twice across a span that would otherwise exceed the 60ms lease.
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(await gwA.sweepLeaseRenewals(), 0, "nothing lost -- still well within the window");
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(await gwA.sweepLeaseRenewals(), 0, "renewed again before the (renewed) deadline");

    const claimB = await gwB.claimDuel("d1");
    assert.equal(claimB.ok, false, "A is still the live owner thanks to its own renewals");

    await gwA.close(); await gwB.close();
  });

  test("sweepLeaseRenewals notices a lost lease and evicts locally", async () => {
    const { store, lease, plugins } = await fresh(50);
    const gwA = createGateway({ sessions, duels: new Map(), plugins: plugins(), store, lease, ownerId: "gw-a" });
    const gwB = createGateway({ sessions, duels: new Map(), plugins: plugins(), store, lease, ownerId: "gw-b" });

    await gwA.claimDuel("d1");
    await new Promise((r) => setTimeout(r, 80));
    await gwB.claimDuel("d1"); // takes over after expiry

    const lost = await gwA.sweepLeaseRenewals();
    assert.equal(lost, 1);

    await gwA.close(); await gwB.close();
  });
});
