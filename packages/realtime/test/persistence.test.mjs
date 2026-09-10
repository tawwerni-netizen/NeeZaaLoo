/**
 * Crash recovery: a gateway restart must lose no game.
 *
 * The interesting property is not "rows exist". It is that recovery replays the
 * stored event log through the SAME plugin that produced it, so recovery and
 * replay verification are the same code path. If recovery silently diverged,
 * the audit hash would diverge too -- and the last test here checks exactly that.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createGateway } from "../src/gateway.mjs";
import { createDuelStore } from "../src/store.mjs";
import { ServerMsg } from "../src/protocol.mjs";
import { ChessPlugin } from "../../game-chess/src/plugin.mjs";
import { SpeedMathPlugin } from "../../game-speed-math/src/plugin.mjs";
import { serializeReplay, verifyReplay, DuelState } from "../../duel-engine/src/duel.mjs";

const TC = JSON.stringify({ initialMs: 300000, incrementMs: 0 });
const INITIAL = JSON.stringify({ fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" });
const plugins = new Map([["chess", ChessPlugin]]);
const simultaneousPlugins = new Map([["speed-math", SpeedMathPlugin]]);
const sessions = new Map([["tok-alice", "alice"], ["tok-bob", "bob"]]);

let CLOCK = 1_000_000;
const now = () => CLOCK;
const advance = (ms) => { CLOCK += ms; };
const settle = () => new Promise((r) => setTimeout(r, 40));

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
    // Resolve immediately if the socket is already gone: the gateway may have
    // terminated it first, in which case the "close" event has already fired
    // and waiting for another one hangs forever.
    close: () => new Promise((r) => {
      if (ws.readyState === ws.CLOSED) return r();
      ws.once("close", r);
      ws.close();
    }),
  };
}

async function seed() {
  const db = await PGlite.create();
  await migrate(db);
  for (const p of ["alice", "bob"]) {
    await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [p]);
  }
  for (const p of ["alice", "bob"]) {
    await db.query(
      `INSERT INTO matchmaking_ticket
         (player_id, game_id, mode, time_control, tier, stake_minor, rating_x100, expires_at)
       VALUES ($1,'chess','blitz',$2::jsonb,'FREE',0,150000, now() + interval '60 seconds')`,
      [p, TC]
    );
  }
  await db.query(
    `SELECT * FROM mm_pair('chess','blitz','FREE'::entry_tier,0,'d-persist',$1::jsonb,$2::jsonb)`,
    [INITIAL, TC]
  );
  return db;
}

async function seedSpeedMath() {
  const db = await PGlite.create();
  await migrate(db);
  // speed-math's own row already exists from migration 0029.
  for (const p of ["alice", "bob"]) {
    await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [p]);
  }
  const tc = JSON.stringify({ durationMs: 30000 });
  const initial = JSON.stringify({ seed: "persist-seed", config: {} });
  for (const p of ["alice", "bob"]) {
    await db.query(
      `INSERT INTO matchmaking_ticket
         (player_id, game_id, mode, time_control, tier, stake_minor, rating_x100, expires_at)
       VALUES ($1,'speed-math','standard',$2::jsonb,'FREE',0,150000, now() + interval '60 seconds')`,
      [p, tc]
    );
  }
  await db.query(
    `SELECT * FROM mm_pair('speed-math','standard','FREE'::entry_tier,0,'d-sim',$1::jsonb,$2::jsonb,'persist-seed')`,
    [initial, tc]
  );
  return db;
}

async function joinAndPlay(gw, token, duelId, moves) {
  const c = client(gw.url);
  await c.open();
  c.send({ t: "AUTH", token });
  await c.next((m) => m.t === ServerMsg.AUTHED);
  c.send({ t: "JOIN", duelId });
  const state = await c.next((m) => m.t === ServerMsg.STATE);
  for (const mv of moves) {
    advance(2000);
    c.send({ t: "INTENT", duelId, intent: mv });
    await c.next((m) => m.t === ServerMsg.EVENT || m.t === ServerMsg.REJECTED);
  }
  return { c, state };
}

// ---------------------------------------------------------------------------

describe("durable duels", () => {
  test("moves are written to the event log before any client is told", async () => {
    const db = await seed();
    const store = createDuelStore(db);
    const duels = new Map();
    const duel = await store.load("d-persist", plugins, CLOCK);
    duel.status = DuelState.LIVE;
    duels.set(duel.duelId, duel);
    await store.markLive(duel);

    const gw = createGateway({ sessions, duels, plugins, now, store });
    const { c } = await joinAndPlay(gw, "tok-alice", "d-persist", ["e2e4"]);

    const rows = await db.query(
      "SELECT seq, type, payload FROM duel_event WHERE duel_id='d-persist' ORDER BY seq"
    );
    assert.equal(rows.rows.length, 2, "INTENT_ACCEPTED + MOVE");
    assert.equal(rows.rows[0].type, "INTENT_ACCEPTED");
    assert.equal(rows.rows[0].payload.intent, "e2e4");

    const clock = await db.query("SELECT clock_state FROM duel WHERE id='d-persist'");
    assert.deepEqual(clock.rows[0].clock_state.remaining, [298000, 300000],
      "the clock snapshot is written with the move, in the same transaction");

    await c.close();
    await gw.close();
  });

  test("a gateway restart recovers the game exactly, and charges no downtime", async () => {
    const db = await seed();
    const store = createDuelStore(db);

    // --- first gateway: two moves, then the process "dies" ---
    const duels1 = new Map();
    const d1 = await store.load("d-persist", plugins, CLOCK);
    d1.status = DuelState.LIVE;
    d1.startedAt = CLOCK;
    duels1.set("d-persist", d1);
    await store.markLive(d1);

    const gw1 = createGateway({ sessions, duels: duels1, plugins, now, store });
    const a1 = await joinAndPlay(gw1, "tok-alice", "d-persist", ["f2f3"]);
    const b1 = await joinAndPlay(gw1, "tok-bob", "d-persist", ["e7e5"]);
    const beforeCrash = [...d1.clock.remaining];
    await a1.c.close();
    await b1.c.close();
    await gw1.close();

    // --- ten minutes of downtime ---
    advance(600_000);

    // --- second gateway: recover from Postgres alone ---
    const duels2 = await store.recoverLive(plugins, CLOCK);
    const d2 = duels2.get("d-persist");
    assert.ok(d2, "the live duel was recovered");
    assert.equal(d2.state.moves.length, 2);
    assert.deepEqual(d2.state.moves, ["f2f3", "e7e5"]);
    assert.deepEqual(d2.clock.remaining, beforeCrash,
      "downtime is a platform fault and is not charged to either player");
    assert.equal(d2.clock.toMove, 0, "still white to move");

    const gw2 = createGateway({ sessions, duels: duels2, plugins, now, store });

    // The recovered game continues, and finishes in mate.
    const a2 = await joinAndPlay(gw2, "tok-alice", "d-persist", ["g2g4"]);
    const b2 = await joinAndPlay(gw2, "tok-bob", "d-persist", ["d8h4"]);

    const done = await b2.c.next((m) => m.t === ServerMsg.COMPLETED);
    assert.equal(done.reason, "CHECKMATE");
    assert.equal(done.result, "0-1", "Fool's mate, completed across a restart");

    const row = await db.query(
      "SELECT status, result, termination_reason, game_hash FROM duel WHERE id='d-persist'"
    );
    assert.equal(row.rows[0].status, "COMPLETED");
    assert.equal(row.rows[0].result, "0-1");
    assert.ok(row.rows[0].game_hash, "the audit commitment is written on completion");

    await a2.c.close();
    await b2.c.close();
    await gw2.close();
  });

  test("a restart clears a pending draw offer -- a shared-layer regression test, not a chess-specific one", async () => {
    // Draw-offer state is transient/in-memory only (DRAW_OFFERED/
    // DRAW_DECLINED land on the event log but nothing replays them into a
    // live `drawOfferBy` the way INTENT_ACCEPTED replays into `state`).
    // hydrate() must set drawOfferBy/drawCooldownUntil to null explicitly
    // rather than leave them undefined -- an omitted field previously made
    // declineDraw/acceptDraw's own `=== null || === seat` guard silently
    // false for BOTH branches, which would have let a stale offer from
    // seat `undefined` be wrongly accepted after every restart.
    const db = await seed();
    const store = createDuelStore(db);

    const duels1 = new Map();
    const d1 = await store.load("d-persist", plugins, CLOCK);
    d1.status = DuelState.LIVE;
    d1.startedAt = CLOCK;
    duels1.set("d-persist", d1);
    await store.markLive(d1);

    const gw1 = createGateway({ sessions, duels: duels1, plugins, now, store });
    const a1 = await joinAndPlay(gw1, "tok-alice", "d-persist", []);
    const b1 = await joinAndPlay(gw1, "tok-bob", "d-persist", []);
    a1.c.send({ t: "DRAW_OFFER", duelId: "d-persist" });
    await a1.c.next((m) => m.t === ServerMsg.EVENT && m.type === "DRAW_OFFERED");
    await b1.c.next((m) => m.t === ServerMsg.EVENT && m.type === "DRAW_OFFERED");
    assert.equal(d1.drawOfferBy, 0, "the offer is live in memory before the crash");
    await a1.c.close();
    await b1.c.close();
    await gw1.close();

    const duels2 = await store.recoverLive(plugins, CLOCK);
    const d2 = duels2.get("d-persist");
    assert.equal(d2.drawOfferBy, null, "recovery must not leave this undefined, and must not carry the offer forward");
    assert.equal(d2.drawCooldownUntil, null);

    const gw2 = createGateway({ sessions, duels: duels2, plugins, now, store });
    const a2 = await joinAndPlay(gw2, "tok-alice", "d-persist", []);
    const b2 = await joinAndPlay(gw2, "tok-bob", "d-persist", []);
    b2.c.send({ t: "DRAW_ACCEPT", duelId: "d-persist" });
    const rej = await b2.c.next((m) => m.t === ServerMsg.ERROR);
    assert.equal(rej.code, "NO_OFFER", "a stale pre-crash offer must not be acceptable after recovery");
    assert.equal(d2.status, DuelState.LIVE, "the duel must still be live, not phantom-drawn");

    await a2.c.close();
    await b2.c.close();
    await gw2.close();
  });

  test("the recovered game re-verifies against its own stored replay", async () => {
    // The real test of recovery: rebuild from the database only, then re-run
    // the replay and confirm it derives the same result. If recovery drifted,
    // this fails.
    const db = await seed();
    const store = createDuelStore(db);
    const duels = new Map();
    const d = await store.load("d-persist", plugins, CLOCK);
    d.status = DuelState.LIVE;
    d.startedAt = CLOCK;
    duels.set("d-persist", d);
    await store.markLive(d);

    const gw = createGateway({ sessions, duels, plugins, now, store });
    const a = await joinAndPlay(gw, "tok-alice", "d-persist", ["f2f3"]);
    const b = await joinAndPlay(gw, "tok-bob", "d-persist", ["e7e5"]);
    const c3 = await joinAndPlay(gw, "tok-alice", "d-persist", ["g2g4"]);
    const c4 = await joinAndPlay(gw, "tok-bob", "d-persist", ["d8h4"]);
    await settle();
    // Clients first, then the server: closing the server terminates sockets,
    // and a client that waits for its own close event afterwards waits forever.
    await Promise.all([a.c.close(), b.c.close(), c3.c.close(), c4.c.close()]);
    await gw.close();

    const reloaded = await store.load("d-persist", plugins, CLOCK);
    const replay = serializeReplay(reloaded, ChessPlugin);
    const verdict = verifyReplay(replay, ChessPlugin);

    assert.equal(verdict.valid, true, verdict.error);
    assert.equal(verdict.derived.result, "0-1");
    assert.equal(verdict.derived.reason, "CHECKMATE");

    const stored = await db.query("SELECT game_hash FROM duel WHERE id='d-persist'");
    assert.equal(verdict.hash, stored.rows[0].game_hash,
      "the hash recomputed from the database matches the one committed at completion");

  });

  test("a plugin version change refuses to reinterpret a game in progress", async () => {
    // A rules change must never silently alter a duel that is already running.
    const db = await seed();
    const store = createDuelStore(db);
    const bumped = new Map([["chess", { ...ChessPlugin, version: 2 }]]);
    await assert.rejects(
      () => store.load("d-persist", bumped, CLOCK),
      /created under chess v1, but v2 is loaded/
    );
  });

  test("a corrupted event log surfaces loudly instead of resuming", async () => {
    const db = await seed();
    const store = createDuelStore(db);
    await db.query(
      `INSERT INTO duel_event (duel_id, seq, type, payload, server_time_ms)
       VALUES ('d-persist', 0, 'INTENT_ACCEPTED', '{"seat":0,"intent":"a1a8"}'::jsonb, 1)`
    );
    await assert.rejects(
      () => store.load("d-persist", plugins, CLOCK),
      /is not replayable: ILLEGAL/
    );
  });

  test("persisting is idempotent — a retried write cannot duplicate events", async () => {
    const db = await seed();
    const store = createDuelStore(db);
    const d = await store.load("d-persist", plugins, CLOCK);
    d.status = DuelState.LIVE;
    d.events.push({ seq: 0, type: "MOVE", payload: { uci: "e2e4" }, serverTimeMs: 5 });

    await store.persist(d, 0);
    await store.persist(d, 0);
    await store.persist(d, 0);

    const n = await db.query("SELECT count(*)::int c FROM duel_event WHERE duel_id='d-persist'");
    assert.equal(n.rows[0].c, 1, "three writes, one row");
  });

  test("a SIMULTANEOUS (Speed Math) duel keeps its shared clock across load and a restart", async () => {
    // hydrate() used to always rebuild an ALTERNATING-shaped clock object,
    // regardless of the plugin's own turnModel. For a SIMULTANEOUS game that
    // silently made isShared(duel) false, so runIntent's NOT_YOUR_TURN check
    // rejected every move from whichever seat wasn't clock.toMove -- the
    // game was unplayable the moment it was loaded from the database, which
    // is every real game (matchmaking always pairs through storage).
    const db = await seedSpeedMath();
    const store = createDuelStore(db);

    const loaded = await store.load("d-sim", simultaneousPlugins, CLOCK);
    assert.equal(loaded.clock.model, "SHARED", "load() must respect turnModel, not default to alternating");
    loaded.status = DuelState.LIVE;
    await store.markLive(loaded, CLOCK);

    const duels1 = new Map([["d-sim", loaded]]);
    const gw1 = createGateway({ sessions, duels: duels1, plugins: simultaneousPlugins, now, store });
    const alice = client(gw1.url);
    const bob = client(gw1.url);
    await alice.open(); await bob.open();
    alice.send({ t: "AUTH", token: "tok-alice" });
    bob.send({ t: "AUTH", token: "tok-bob" });
    await alice.next((m) => m.t === ServerMsg.AUTHED);
    await bob.next((m) => m.t === ServerMsg.AUTHED);
    alice.send({ t: "JOIN", duelId: "d-sim" });
    bob.send({ t: "JOIN", duelId: "d-sim" });
    await alice.next((m) => m.t === ServerMsg.STATE);
    await bob.next((m) => m.t === ServerMsg.STATE);

    // Both seats answer -- the point being that seat 1 (bob) is NOT rejected
    // as NOT_YOUR_TURN, which is exactly what the alternating-clock bug did.
    const q = loaded.state.questions[0];
    const answer = q.op === "+" ? q.a + q.b : q.op === "-" ? q.a - q.b : q.a * q.b;
    alice.send({ t: "INTENT", duelId: "d-sim", intent: { answer } });
    await alice.next((m) => m.type === "ANSWER");
    bob.send({ t: "INTENT", duelId: "d-sim", intent: { answer } });
    const bobAnswered = await bob.next((m) => m.type === "ANSWER" || m.t === ServerMsg.REJECTED);
    assert.equal(bobAnswered.t, ServerMsg.EVENT, "bob's answer must be accepted, not rejected as NOT_YOUR_TURN");

    await alice.close(); await bob.close(); await gw1.close();

    // Recover as a fresh process would: rebuild purely from Postgres.
    const duels2 = await store.recoverLive(simultaneousPlugins, CLOCK + 5000);
    const recovered = duels2.get("d-sim");
    assert.ok(recovered, "the live simultaneous duel was recovered");
    assert.equal(recovered.clock.model, "SHARED", "recovery must also respect turnModel");
    assert.equal(recovered.state.progress[0].correct, 1);
    assert.equal(recovered.state.progress[1].correct, 1);
  });
});
