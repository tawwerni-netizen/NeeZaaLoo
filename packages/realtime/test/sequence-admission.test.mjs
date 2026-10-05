/**
 * Sequence admission, session binding, and reconnect grace over a REAL
 * WebSocket connection -- the same "make the server believe something the
 * client said" discipline gateway.test.mjs already applies, extended to
 * the admission fields (`nonce`/`baseVersion`) and to session binding.
 *
 * Uses its own dedicated gateway/duel/plugin maps, entirely separate from
 * gateway.test.mjs's shared instance, so nothing here can leak state into
 * (or borrow state from) that file's own tests.
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createGateway } from "../src/gateway.mjs";
import { ServerMsg, ErrorCode } from "../src/protocol.mjs";
import { ChessPlugin } from "../../game-chess/src/plugin.mjs";
import { createDuel, start } from "../../duel-engine/src/duel.mjs";

let CLOCK = 0;
const now = () => CLOCK;
const advance = (ms) => { CLOCK += ms; };

let gw, sessions, duels, plugins, fairPlayCalls, fairPlay;

function newDuel(id) {
  const d = createDuel({
    duelId: id, plugin: ChessPlugin, players: ["alice", "bob"],
    seed: null, config: {}, timeControl: { initialMs: 300_000, incrementMs: 0 }, now: CLOCK,
  });
  start(d, CLOCK);
  duels.set(id, d);
  return d;
}

function connect(gwInstance = gw) {
  const ws = new WebSocket(gwInstance.url);
  const inbox = [];
  const waiters = [];
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    const i = waiters.findIndex((w) => !w.pred || w.pred(msg));
    if (i >= 0) {
      const w = waiters.splice(i, 1)[0];
      clearTimeout(w.timer);
      w.resolve(msg);
    } else {
      inbox.push(msg);
    }
  });
  return {
    ws, inbox,
    send: (obj) => ws.send(JSON.stringify(obj)),
    next(pred) {
      const i = pred ? inbox.findIndex(pred) : (inbox.length ? 0 : -1);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const w = { pred, resolve };
        w.timer = setTimeout(() => {
          waiters.splice(waiters.indexOf(w), 1);
          reject(new Error(`timed out; queued frames: ${JSON.stringify(inbox)}`));
        }, 2000);
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

async function authed(token, gwInstance = gw) {
  const c = connect(gwInstance);
  await c.open();
  c.send({ t: "AUTH", token });
  const res = await c.next();
  assert.equal(res.t, ServerMsg.AUTHED, `auth failed: ${JSON.stringify(res)}`);
  return c;
}

const settle = () => new Promise((r) => setTimeout(r, 30));

before(() => {
  sessions = new Map([["tok-alice", "alice"], ["tok-bob", "bob"]]);
  duels = new Map();
  plugins = new Map([["chess", ChessPlugin]]);
  fairPlayCalls = [];
  fairPlay = {
    recordReplayedAction: async (args) => { fairPlayCalls.push(["replay", args]); },
    recordConcurrentSeat: async (args) => { fairPlayCalls.push(["concurrent", args]); },
    recordFromCompletedDuel: async () => {},
  };
  gw = createGateway({
    sessions, duels, plugins, now, fairPlay,
    reconnectRateLimit: { capacity: 2, refillPerSecond: 0.001 },
  });
});
beforeEach(() => { fairPlayCalls = []; });
after(async () => { await gw.close(); });

describe("STALE_ACTION / STALE_VERSION over the wire", () => {
  test("a baseVersion that disagrees with the real event count is rejected and resynced, never applied", async () => {
    newDuel("seq1");
    const alice = await authed("tok-alice");
    alice.send({ t: "JOIN", duelId: "seq1" });
    await alice.next((m) => m.t === ServerMsg.STATE);

    alice.send({ t: "INTENT", duelId: "seq1", intent: "e2e4", nonce: 1, baseVersion: 99 });
    const rejected = await alice.next((m) => m.t === ServerMsg.REJECTED);
    assert.equal(rejected.reason, "STALE_VERSION");
    assert.equal(duels.get("seq1").events.length, 0);

    await alice.close();
  });

  test("a nonce gap is rejected as STALE_ACTION, and the board is untouched", async () => {
    newDuel("seq2");
    const alice = await authed("tok-alice");
    alice.send({ t: "JOIN", duelId: "seq2" });
    await alice.next((m) => m.t === ServerMsg.STATE);

    alice.send({ t: "INTENT", duelId: "seq2", intent: "e2e4", nonce: 5, baseVersion: 0 });
    const rejected = await alice.next((m) => m.t === ServerMsg.REJECTED);
    assert.equal(rejected.reason, "STALE_ACTION");
    assert.equal(duels.get("seq2").events.length, 0);

    await alice.close();
  });
});

describe("DUPLICATE_ACTION over the wire", () => {
  test("resending the same nonce+intent gets an idempotent STATE ack, never a second move", async () => {
    newDuel("seq3");
    const alice = await authed("tok-alice");
    alice.send({ t: "JOIN", duelId: "seq3" });
    await alice.next((m) => m.t === ServerMsg.STATE);

    alice.send({ t: "INTENT", duelId: "seq3", intent: "e2e4", cseq: 1, nonce: 1, baseVersion: 0 });
    // The FIRST event a successful INTENT produces is always the engine's
    // own INTENT_ACCEPTED (see duel.mjs's runIntent -- a plugin's own
    // extra event, if any, always follows it), and it is the one, single
    // event that carries this specific cseq back.
    const first = await alice.next((m) => m.t === ServerMsg.EVENT && m.cseq === 1);
    assert.equal(first.type, "INTENT_ACCEPTED");

    alice.send({ t: "INTENT", duelId: "seq3", intent: "e2e4", cseq: 2, nonce: 1, baseVersion: 0 });
    const ack = await alice.next((m) => m.cseq === 2);
    assert.equal(ack.t, ServerMsg.STATE);
    assert.equal(ack.duplicate, true);
    assert.equal(duels.get("seq3").events.filter((e) => e.type === "INTENT_ACCEPTED").length, 1);

    await alice.close();
  });
});

describe("REPLAYED_ACTION over the wire", () => {
  test("a captured frame's nonce reused with a DIFFERENT move is refused, and recorded as evidence", async () => {
    newDuel("seq4");
    const alice = await authed("tok-alice");
    alice.send({ t: "JOIN", duelId: "seq4" });
    await alice.next((m) => m.t === ServerMsg.STATE);

    alice.send({ t: "INTENT", duelId: "seq4", intent: "e2e4", nonce: 1, baseVersion: 0 });
    await alice.next((m) => m.t === ServerMsg.EVENT);

    // Forged: same nonce, a different move -- as if an attacker captured
    // the FIRST frame, mutated its payload, and replayed it.
    alice.send({ t: "INTENT", duelId: "seq4", intent: "d2d4", nonce: 1, baseVersion: 0 });
    const rejected = await alice.next((m) => m.t === ServerMsg.REJECTED);
    assert.equal(rejected.reason, "REPLAYED_ACTION");

    await settle();
    const recorded = fairPlayCalls.find(([kind]) => kind === "replay");
    assert.ok(recorded, "a REPLAYED_ACTION must be recorded as fair-play evidence");
    assert.equal(recorded[1].playerId, "alice");
    assert.equal(recorded[1].duelId, "seq4");

    await alice.close();
  });

  test("an intent sent with no nonce at all is never treated as a replay -- it is simply exempt", async () => {
    newDuel("seq5");
    const alice = await authed("tok-alice");
    alice.send({ t: "JOIN", duelId: "seq5" });
    await alice.next((m) => m.t === ServerMsg.STATE);

    alice.send({ t: "INTENT", duelId: "seq5", intent: "e2e4" });
    const res = await alice.next();
    assert.equal(res.t, ServerMsg.EVENT);

    await alice.close();
  });
});

describe("concurrent actions over the wire", () => {
  test("two players moving back-to-back on their own turns both land cleanly, in order", async () => {
    newDuel("seq6");
    const alice = await authed("tok-alice");
    const bob = await authed("tok-bob");
    alice.send({ t: "JOIN", duelId: "seq6" });
    bob.send({ t: "JOIN", duelId: "seq6" });
    await alice.next((m) => m.t === ServerMsg.STATE);
    await bob.next((m) => m.t === ServerMsg.STATE);

    alice.send({ t: "INTENT", duelId: "seq6", intent: "e2e4", cseq: 1, nonce: 1, baseVersion: 0 });
    await settle();
    assert.equal(duels.get("seq6").events.filter((e) => e.type === "INTENT_ACCEPTED").length, 1);

    bob.send({ t: "INTENT", duelId: "seq6", intent: "e7e5", cseq: 1, nonce: 1, baseVersion: duels.get("seq6").events.length });
    await settle();

    const duel = duels.get("seq6");
    assert.equal(duel.events.filter((e) => e.type === "INTENT_ACCEPTED").length, 2);

    await alice.close(); await bob.close();
  });

  test("two rapid identical resends from the SAME connection produce exactly one real move", async () => {
    newDuel("seq7");
    const alice = await authed("tok-alice");
    alice.send({ t: "JOIN", duelId: "seq7" });
    await alice.next((m) => m.t === ServerMsg.STATE);

    alice.send({ t: "INTENT", duelId: "seq7", intent: "e2e4", nonce: 1, baseVersion: 0 });
    alice.send({ t: "INTENT", duelId: "seq7", intent: "e2e4", nonce: 1, baseVersion: 0 });
    await alice.next((m) => m.t === ServerMsg.EVENT);
    await settle();

    const duel = duels.get("seq7");
    assert.equal(duel.events.filter((e) => e.type === "INTENT_ACCEPTED").length, 1);

    await alice.close();
  });
});

describe("session binding: concurrent seat occupancy", () => {
  test("one seat bound to two live connections at once is recorded, and both keep working", async () => {
    newDuel("sess1");
    const aliceA = await authed("tok-alice");
    aliceA.send({ t: "JOIN", duelId: "sess1" });
    await aliceA.next((m) => m.t === ServerMsg.STATE);

    // A second, DIFFERENT connection authenticating as the SAME player and
    // joining the SAME seat while the first is still open -- not an
    // ordinary reconnect (whose old socket would already be closed).
    const aliceB = await authed("tok-alice");
    aliceB.send({ t: "JOIN", duelId: "sess1" });
    await aliceB.next((m) => m.t === ServerMsg.STATE);

    await settle();
    const recorded = fairPlayCalls.find(([kind]) => kind === "concurrent");
    assert.ok(recorded, "concurrent seat occupancy must be recorded");
    assert.equal(recorded[1].playerId, "alice");
    assert.ok(recorded[1].concurrentSessions >= 2);

    await aliceA.close(); await aliceB.close();
  });

  test("a genuine reconnect (old socket closed first) never triggers a concurrent-seat signal", async () => {
    newDuel("sess2");
    const first = await authed("tok-alice");
    first.send({ t: "JOIN", duelId: "sess2" });
    await first.next((m) => m.t === ServerMsg.STATE);
    await first.close();
    await settle();

    const second = await authed("tok-alice");
    second.send({ t: "JOIN", duelId: "sess2" });
    await second.next((m) => m.t === ServerMsg.STATE);
    await settle();

    assert.equal(fairPlayCalls.find(([kind]) => kind === "concurrent"), undefined);

    await second.close();
  });
});

describe("clock manipulation is structurally impossible, not merely refused", () => {
  test("an INTENT carrying a client-claimed clock/serverTimeMs field is refused before it ever reaches the game", async () => {
    newDuel("clock1");
    const alice = await authed("tok-alice");
    alice.send({ t: "JOIN", duelId: "clock1" });
    await alice.next((m) => m.t === ServerMsg.STATE);

    // There is no field in the protocol for a client to report elapsed
    // time, a clock reading, or "now" -- parseClientFrame refuses any key
    // it does not expect, so a forged clock claim is a protocol error,
    // not a value some handler might accidentally trust.
    alice.send({ t: "INTENT", duelId: "clock1", intent: "e2e4", nonce: 1, baseVersion: 0, serverTimeMs: 999999999 });
    const rejected = await alice.next();
    assert.equal(rejected.t, ServerMsg.ERROR);
    assert.equal(rejected.code, ErrorCode.UNEXPECTED_FIELD);
    assert.equal(duels.get("clock1").events.length, 0);

    alice.send({ t: "INTENT", duelId: "clock1", intent: "e2e4", nonce: 1, baseVersion: 0, clock: { remaining: [1, 1] } });
    const rejected2 = await alice.next();
    assert.equal(rejected2.t, ServerMsg.ERROR);
    assert.equal(rejected2.code, ErrorCode.UNEXPECTED_FIELD);

    await alice.close();
  });

  test("the clock actually charged is the server's own elapsed time, regardless of when the client claims to have decided", async () => {
    newDuel("clock2");
    const alice = await authed("tok-alice");
    alice.send({ t: "JOIN", duelId: "clock2" });
    const state = await alice.next((m) => m.t === ServerMsg.STATE);
    assert.deepEqual(state.clock.remaining, [300_000, 300_000]);

    advance(7000); // 7 real seconds pass on the server's own clock
    alice.send({ t: "INTENT", duelId: "clock2", intent: "e2e4", nonce: 1, baseVersion: 0 });
    const event = await alice.next((m) => m.t === ServerMsg.EVENT);
    assert.equal(event.clock.remaining[0], 293_000, "exactly the server's own 7s, nothing the client asserted");

    await alice.close();
  });
});

describe("reconnect grace: bounded, not blocked", () => {
  test("rebinding a seat far faster than the configured budget is refused with RECONNECT_LIMITED", async () => {
    newDuel("grace1");
    // This gateway's own reconnectRateLimit is capacity:2, refillPerSecond
    // effectively zero -- so the third rebind of the SAME seat, in the
    // SAME duel, within the same instant, must be refused.
    for (let i = 0; i < 2; i++) {
      const c = await authed("tok-alice");
      c.send({ t: "JOIN", duelId: "grace1" });
      await c.next((m) => m.t === ServerMsg.STATE);
      await c.close();
    }
    const third = await authed("tok-alice");
    third.send({ t: "JOIN", duelId: "grace1" });
    const res = await third.next();
    assert.equal(res.t, ServerMsg.ERROR);
    assert.equal(res.code, ErrorCode.RECONNECT_LIMITED);
    await third.close();
  });

  test("the budget is scoped per duel -- exhausting it on one match never blocks a DIFFERENT one", async () => {
    newDuel("grace2a");
    newDuel("grace2b");
    for (let i = 0; i < 2; i++) {
      const c = await authed("tok-bob");
      c.send({ t: "JOIN", duelId: "grace2a" });
      await c.next((m) => m.t === ServerMsg.STATE);
      await c.close();
    }
    // grace2a's budget for bob is now exhausted; grace2b's is untouched.
    const fresh = await authed("tok-bob");
    fresh.send({ t: "JOIN", duelId: "grace2b" });
    const res = await fresh.next();
    assert.equal(res.t, ServerMsg.STATE);
    await fresh.close();
  });
});
