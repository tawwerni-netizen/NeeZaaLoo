/**
 * Realtime gateway integration tests.
 *
 * These run a real WebSocket server on an ephemeral port and drive it with real
 * clients. The thing under test is not "does a message arrive" but the security
 * property the whole architecture rests on: a client can express a wish and
 * nothing more. Every assertion below is a way of trying to make the server
 * believe something the client said.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createGateway } from "../src/gateway.mjs";
import { ServerMsg, ErrorCode } from "../src/protocol.mjs";
import { ChessPlugin } from "../../game-chess/src/plugin.mjs";
import { createChessAiAdapter } from "../../game-chess/src/ai.mjs";
import { SpeedMathPlugin, DEFAULT_CONFIG as SPEED_MATH_DEFAULT_CONFIG } from "../../game-speed-math/src/plugin.mjs";
import { createSpeedMathAiAdapter } from "../../game-speed-math/src/ai.mjs";
import { createDuel, start, DuelState } from "../../duel-engine/src/duel.mjs";

// A controllable clock: the tests must never depend on wall time.
let CLOCK = 0;
const now = () => CLOCK;
const advance = (ms) => { CLOCK += ms; };

let gw, sessions, duels, plugins;

function newDuel(id, { initialMs = 300_000, incrementMs = 0 } = {}) {
  const d = createDuel({
    duelId: id, plugin: ChessPlugin, players: ["alice", "bob"],
    seed: null, config: {}, timeControl: { initialMs, incrementMs }, now: CLOCK,
  });
  start(d, CLOCK);
  duels.set(id, d);
  return d;
}

/**
 * A test client. A frame is delivered to a waiting reader OR queued -- never
 * both, which is what an earlier version of this helper got wrong: consumed
 * frames stayed in the queue and leaked into the next assertion.
 */
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
    ws,
    inbox,
    send: (obj) => ws.send(JSON.stringify(obj)),
    /** Next frame, or the next frame matching a predicate. Consumes it. */
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

async function authed(token, gwInstance = gw) {
  const c = connect(gwInstance);
  await c.open();
  c.send({ t: "AUTH", token });
  const res = await c.next();
  assert.equal(res.t, ServerMsg.AUTHED, `auth failed: ${JSON.stringify(res)}`);
  return c;
}

/** Let the event loop deliver anything already in flight. */
const settle = () => new Promise((r) => setTimeout(r, 30));

before(() => {
  sessions = new Map([["tok-alice", "alice"], ["tok-bob", "bob"], ["tok-eve", "eve"]]);
  duels = new Map();
  plugins = new Map([["chess", ChessPlugin], ["speed-math", SpeedMathPlugin]]);
  gw = createGateway({ sessions, duels, plugins, now });
});

after(async () => { await gw.close(); });

// ---------------------------------------------------------------------------

describe("authentication", () => {
  test("nothing works before AUTH", async () => {
    newDuel("d-auth");
    const c = connect();
    await c.open();
    c.send({ t: "JOIN", duelId: "d-auth" });
    const res = await c.next();
    assert.equal(res.t, ServerMsg.ERROR);
    assert.equal(res.code, ErrorCode.NOT_AUTHENTICATED);
    await c.close();
  });

  test("a bad token is refused", async () => {
    const c = connect();
    await c.open();
    c.send({ t: "AUTH", token: "not-a-real-token" });
    const res = await c.next();
    assert.equal(res.code, ErrorCode.BAD_TOKEN);
    await c.close();
  });

  test("a session cannot be re-authenticated into another identity", async () => {
    const c = await authed("tok-alice");
    c.send({ t: "AUTH", token: "tok-bob" });
    const res = await c.next();
    assert.equal(res.code, ErrorCode.ALREADY_AUTHENTICATED);
    await c.close();
  });
});

describe("the protocol refuses anything a client should not be able to say", () => {
  test("a forged result field is a protocol error, not ignored data", async () => {
    // The attack this closes: append a plausible field and hope some handler
    // downstream reads it. Unknown keys are refused, never dropped.
    newDuel("d-forge");
    const c = await authed("tok-alice");
    c.send({ t: "JOIN", duelId: "d-forge" });
    await c.next((m) => m.t === ServerMsg.STATE);

    for (const forged of [
      { t: "INTENT", duelId: "d-forge", intent: "e2e4", result: "1-0" },
      { t: "INTENT", duelId: "d-forge", intent: "e2e4", clock: [999999, 0] },
      { t: "INTENT", duelId: "d-forge", intent: "e2e4", seat: 1 },
      { t: "INTENT", duelId: "d-forge", intent: "e2e4", rating: 3000 },
    ]) {
      c.send(forged);
      const res = await c.next();
      assert.equal(res.t, ServerMsg.ERROR, `accepted a forged frame: ${JSON.stringify(forged)}`);
      assert.equal(res.code, ErrorCode.UNEXPECTED_FIELD);
    }
    await c.close();
  });

  test("there is no message type that reports a result", async () => {
    const c = await authed("tok-alice");
    for (const t of ["COMPLETE", "RESULT", "SETTLE", "WIN", "STATE", "EVENT"]) {
      c.send({ t, duelId: "d-forge" });
      const res = await c.next();
      assert.equal(res.code, ErrorCode.UNKNOWN_TYPE, `${t} should not exist`);
    }
    await c.close();
  });

  test("malformed and oversized frames are refused", async () => {
    const c = await authed("tok-alice");
    c.send("not json at all");
    assert.equal((await c.next()).code, ErrorCode.BAD_FRAME);

    c.ws.send(JSON.stringify({ t: "INTENT", duelId: "d", intent: "x".repeat(5000) }));
    assert.equal((await c.next()).code, ErrorCode.FRAME_TOO_LARGE);
    await c.close();
  });
});

describe("playing a duel", () => {
  test("both players receive the move, and the clock comes from the server", async () => {
    newDuel("d-play");
    const alice = await authed("tok-alice");
    const bob = await authed("tok-bob");
    alice.send({ t: "JOIN", duelId: "d-play" });
    bob.send({ t: "JOIN", duelId: "d-play" });
    const aState = await alice.next((m) => m.t === ServerMsg.STATE);
    await bob.next((m) => m.t === ServerMsg.STATE);

    assert.equal(aState.seat, 0, "alice is white");
    assert.deepEqual(aState.clock.remaining, [300_000, 300_000]);

    advance(4000);
    alice.send({ t: "INTENT", duelId: "d-play", intent: "e2e4", cseq: 1 });

    const aEvent = await alice.next((m) => m.t === ServerMsg.EVENT);
    const bEvent = await bob.next((m) => m.t === ServerMsg.EVENT);
    assert.equal(aEvent.payload.intent, "e2e4");
    assert.equal(bEvent.payload.intent, "e2e4", "the opponent is told too");
    assert.deepEqual(aEvent.clock.remaining, [296_000, 300_000], "4s charged by the server");
    assert.equal(aEvent.clock.toMove, 1);
    assert.equal(aEvent.cseq, 1, "the sender's own correlation number is echoed back");
    assert.equal(bEvent.cseq, null, "an opponent never sees someone else's local cseq");

    await alice.close();
    await bob.close();
  });

  test("sending the identical intent twice in a row is safe", async () => {
    // Regression test for the audited "duplicate move protection" claim: the
    // mechanism is turn alternation, not an explicit dedup cache, and this
    // proves that is sufficient. The second send of the SAME move, on the
    // SAME connection, must be rejected as out-of-turn rather than silently
    // reprocessed or double-charging the clock.
    newDuel("d-dup-intent");
    const alice = await authed("tok-alice");
    alice.send({ t: "JOIN", duelId: "d-dup-intent" });
    await alice.next((m) => m.t === ServerMsg.STATE);

    alice.send({ t: "INTENT", duelId: "d-dup-intent", intent: "e2e4", cseq: 1 });
    // One accepted intent produces TWO protocol EVENTs on this connection --
    // "INTENT_ACCEPTED" (carries the cseq) and a game-level "MOVE" event
    // (cseq null, since it did not itself originate from this send). Both
    // must be drained before sending the duplicate, or the second one sits
    // in the queue and gets misread as the reply to the retry.
    const first = await alice.next((m) => m.cseq === 1);
    assert.equal(first.payload.intent, "e2e4");
    await alice.next((m) => m.type === "MOVE");

    alice.send({ t: "INTENT", duelId: "d-dup-intent", intent: "e2e4", cseq: 2 });
    const second = await alice.next((m) => m.cseq === 2 || m.t === ServerMsg.REJECTED);
    assert.equal(second.t, ServerMsg.REJECTED, "a resend of an already-applied move must not reapply");
    assert.equal(second.reason, "NOT_YOUR_TURN");
    assert.equal(second.cseq, 2, "the rejection still correlates to the retry that caused it");

    const duel = duels.get("d-dup-intent");
    assert.equal(duel.state.moves.length, 1, "the move was recorded exactly once");

    await alice.close();
  });

  test("an illegal move is rejected without dropping the socket", async () => {
    newDuel("d-illegal");
    const alice = await authed("tok-alice");
    alice.send({ t: "JOIN", duelId: "d-illegal" });
    await alice.next((m) => m.t === ServerMsg.STATE);

    alice.send({ t: "INTENT", duelId: "d-illegal", intent: "e2e5", cseq: 7 });
    const res = await alice.next((m) => m.t === ServerMsg.REJECTED);
    assert.equal(res.reason, "ILLEGAL");
    assert.equal(res.cseq, 7, "the client can correlate the rejection");
    assert.equal(alice.ws.readyState, alice.ws.OPEN, "bad input must not cost the connection");

    // Still usable afterwards.
    alice.send({ t: "INTENT", duelId: "d-illegal", intent: "e2e4" });
    assert.equal((await alice.next((m) => m.t === ServerMsg.EVENT)).payload.intent, "e2e4");
    await alice.close();
  });

  test("a player cannot move for their opponent", async () => {
    newDuel("d-turn");
    const bob = await authed("tok-bob");
    bob.send({ t: "JOIN", duelId: "d-turn" });
    await bob.next((m) => m.t === ServerMsg.STATE);
    bob.send({ t: "INTENT", duelId: "d-turn", intent: "e2e4" });
    assert.equal((await bob.next((m) => m.t === ServerMsg.REJECTED)).reason, "NOT_YOUR_TURN");
    await bob.close();
  });

  test("a non-participant cannot move, even after joining as a spectator", async () => {
    newDuel("d-eve");
    const eve = await authed("tok-eve");
    eve.send({ t: "JOIN", duelId: "d-eve" });
    await eve.next((m) => m.t === ServerMsg.STATE);
    eve.send({ t: "INTENT", duelId: "d-eve", intent: "e2e4" });
    assert.equal((await eve.next()).code, ErrorCode.NOT_A_PARTICIPANT);
    await eve.close();
  });

  test("joining as a player is refused to a non-participant", async () => {
    newDuel("d-claim");
    const eve = await authed("tok-eve");
    eve.send({ t: "JOIN", duelId: "d-claim", as: "player" });
    assert.equal((await eve.next()).code, ErrorCode.NOT_A_PARTICIPANT);
    await eve.close();
  });

  test("an intent for an unsubscribed duel is refused", async () => {
    newDuel("d-nosub");
    const alice = await authed("tok-alice");
    alice.send({ t: "INTENT", duelId: "d-nosub", intent: "e2e4" });
    assert.equal((await alice.next()).code, ErrorCode.NOT_SUBSCRIBED);
    await alice.close();
  });

  test("resignation completes the duel for everyone watching", async () => {
    newDuel("d-resign");
    const alice = await authed("tok-alice");
    const bob = await authed("tok-bob");
    const eve = await authed("tok-eve");
    for (const [c, id] of [[alice, "d-resign"], [bob, "d-resign"], [eve, "d-resign"]]) {
      c.send({ t: "JOIN", duelId: id });
      await c.next((m) => m.t === ServerMsg.STATE);
    }
    alice.send({ t: "RESIGN", duelId: "d-resign" });

    for (const c of [alice, bob, eve]) {
      const done = await c.next((m) => m.t === ServerMsg.COMPLETED);
      assert.equal(done.result, "0-1");
      assert.equal(done.reason, "RESIGNATION");
    }
    assert.equal(duels.get("d-resign").status, DuelState.COMPLETED);
    await Promise.all([alice.close(), bob.close(), eve.close()]);
  });
});

describe("draw agreement -- over the real wire", () => {
  async function joined(duelId) {
    newDuel(duelId);
    const alice = await authed("tok-alice");
    const bob = await authed("tok-bob");
    for (const c of [alice, bob]) {
      c.send({ t: "JOIN", duelId });
      await c.next((m) => m.t === ServerMsg.STATE);
    }
    return { alice, bob };
  }

  test("a non-participant cannot offer a draw", async () => {
    newDuel("d-draw-outsider");
    const eve = await authed("tok-eve");
    eve.send({ t: "DRAW_OFFER", duelId: "d-draw-outsider" });
    assert.equal((await eve.next()).code, ErrorCode.NOT_A_PARTICIPANT);
    await eve.close();
  });

  test("offer, then accept: the duel completes 1/2-1/2 DRAW_AGREED for everyone watching", async () => {
    const { alice, bob } = await joined("d-draw-accept");
    const eve = await authed("tok-eve");
    eve.send({ t: "JOIN", duelId: "d-draw-accept" });
    await eve.next((m) => m.t === ServerMsg.STATE);

    alice.send({ t: "DRAW_OFFER", duelId: "d-draw-accept" });
    for (const c of [alice, bob, eve]) {
      const ev = await c.next((m) => m.t === ServerMsg.EVENT && m.type === "DRAW_OFFERED");
      assert.equal(ev.payload.seat, 0);
    }

    bob.send({ t: "DRAW_ACCEPT", duelId: "d-draw-accept" });
    for (const c of [alice, bob, eve]) {
      const done = await c.next((m) => m.t === ServerMsg.COMPLETED);
      assert.equal(done.result, "1/2-1/2");
      assert.equal(done.reason, "DRAW_AGREED");
    }
    assert.equal(duels.get("d-draw-accept").status, DuelState.COMPLETED);
    await Promise.all([alice.close(), bob.close(), eve.close()]);
  });

  test("offer, then decline: the duel stays LIVE and both sides see the decline", async () => {
    const { alice, bob } = await joined("d-draw-decline");
    alice.send({ t: "DRAW_OFFER", duelId: "d-draw-decline" });
    await alice.next((m) => m.t === ServerMsg.EVENT && m.type === "DRAW_OFFERED");
    await bob.next((m) => m.t === ServerMsg.EVENT && m.type === "DRAW_OFFERED");

    bob.send({ t: "DRAW_DECLINE", duelId: "d-draw-decline" });
    for (const c of [alice, bob]) {
      const ev = await c.next((m) => m.t === ServerMsg.EVENT && m.type === "DRAW_DECLINED");
      assert.equal(ev.payload.seat, 1);
    }
    assert.equal(duels.get("d-draw-decline").status, DuelState.LIVE, "declining a draw must never end the game");
    await Promise.all([alice.close(), bob.close()]);
  });

  test("you cannot accept your own offer, over the real wire", async () => {
    const { alice, bob } = await joined("d-draw-self-accept");
    alice.send({ t: "DRAW_OFFER", duelId: "d-draw-self-accept" });
    await alice.next((m) => m.t === ServerMsg.EVENT && m.type === "DRAW_OFFERED");
    await bob.next((m) => m.t === ServerMsg.EVENT && m.type === "DRAW_OFFERED");

    alice.send({ t: "DRAW_ACCEPT", duelId: "d-draw-self-accept" });
    const rej = await alice.next((m) => m.t === ServerMsg.ERROR);
    assert.equal(rej.code, "NO_OFFER");
    assert.equal(duels.get("d-draw-self-accept").status, DuelState.LIVE);
    await Promise.all([alice.close(), bob.close()]);
  });

  test("a re-offer inside the cooldown after a decline is refused, and succeeds once the cooldown elapses", async () => {
    const { alice, bob } = await joined("d-draw-cooldown");
    alice.send({ t: "DRAW_OFFER", duelId: "d-draw-cooldown" });
    await alice.next((m) => m.t === ServerMsg.EVENT && m.type === "DRAW_OFFERED");
    await bob.next((m) => m.t === ServerMsg.EVENT && m.type === "DRAW_OFFERED");
    bob.send({ t: "DRAW_DECLINE", duelId: "d-draw-cooldown" });
    await alice.next((m) => m.t === ServerMsg.EVENT && m.type === "DRAW_DECLINED");
    await bob.next((m) => m.t === ServerMsg.EVENT && m.type === "DRAW_DECLINED");

    alice.send({ t: "DRAW_OFFER", duelId: "d-draw-cooldown" });
    assert.equal((await alice.next((m) => m.t === ServerMsg.ERROR)).code, "ON_COOLDOWN");

    advance(16_000); // past DRAW_OFFER_COOLDOWN_MS (15000)
    alice.send({ t: "DRAW_OFFER", duelId: "d-draw-cooldown" });
    const ev = await alice.next((m) => m.t === ServerMsg.EVENT && m.type === "DRAW_OFFERED");
    assert.equal(ev.payload.seat, 0);
    await Promise.all([alice.close(), bob.close()]);
  });
});

describe("spectators", () => {
  test("a spectator sees the position but not the legal-move list", async () => {
    newDuel("d-spec");
    const alice = await authed("tok-alice");
    const eve = await authed("tok-eve");
    alice.send({ t: "JOIN", duelId: "d-spec" });
    eve.send({ t: "JOIN", duelId: "d-spec" });
    const aState = await alice.next((m) => m.t === ServerMsg.STATE);
    const eState = await eve.next((m) => m.t === ServerMsg.STATE);

    assert.equal(aState.view.legalMoves.length, 20, "a player is told what they may do");
    assert.equal(eState.view.legalMoves, undefined, "a spectator is not");
    assert.equal(eState.seat, null);
    assert.equal(eState.view.fen, aState.view.fen, "the position itself is public");

    // The projection is per-subscriber on broadcasts too, not just on join.
    alice.send({ t: "INTENT", duelId: "d-spec", intent: "d2d4" });
    const aEv = await alice.next((m) => m.t === ServerMsg.EVENT);
    const eEv = await eve.next((m) => m.t === ServerMsg.EVENT);
    assert.ok(Array.isArray(aEv.view.legalMoves));
    assert.equal(eEv.view.legalMoves, undefined);

    await Promise.all([alice.close(), eve.close()]);
  });
});

describe("reconnection", () => {
  test("a reconnecting player is resynced, and gains no time", async () => {
    // The property that matters: disconnecting is not a way to buy thinking time.
    newDuel("d-reconnect", { initialMs: 60_000 });
    const alice = await authed("tok-alice");
    alice.send({ t: "JOIN", duelId: "d-reconnect" });
    await alice.next((m) => m.t === ServerMsg.STATE);

    advance(5000);
    alice.send({ t: "INTENT", duelId: "d-reconnect", intent: "e2e4" });
    await alice.next((m) => m.t === ServerMsg.EVENT);

    await alice.close();
    await settle();

    advance(20_000);          // twenty seconds spent offline, on bob's clock

    const again = await authed("tok-alice");
    again.send({ t: "JOIN", duelId: "d-reconnect" });
    const resync = await again.next((m) => m.t === ServerMsg.STATE);

    assert.equal(resync.view.ply, 1, "the game continued without the socket");
    assert.equal(resync.view.moves[0], "e2e4");
    assert.equal(resync.clock.remaining[0], 55_000, "alice was charged 5s and no more");
    assert.equal(resync.clock.remaining[1], 40_000, "bob's clock ran while alice was away");
    assert.equal(resync.seat, 0);
    await again.close();
  });

  test("closing a socket does not end the duel", async () => {
    newDuel("d-drop");
    const alice = await authed("tok-alice");
    alice.send({ t: "JOIN", duelId: "d-drop" });
    await alice.next((m) => m.t === ServerMsg.STATE);
    await alice.close();
    await settle();
    assert.equal(duels.get("d-drop").status, DuelState.LIVE, "still live, still ticking");
    assert.equal(gw.rooms.get("d-drop").size, 0, "but the room is cleaned up");
  });
});

describe("timeouts", () => {
  test("the sweeper completes a duel with no client message at all", async () => {
    newDuel("d-timeout", { initialMs: 10_000 });
    const bob = await authed("tok-bob");
    bob.send({ t: "JOIN", duelId: "d-timeout" });
    await bob.next((m) => m.t === ServerMsg.STATE);

    advance(10_001);          // alice never moves, and never reconnects
    assert.equal(await gw.sweepTimeouts(), 1);

    const done = await bob.next((m) => m.t === ServerMsg.COMPLETED);
    assert.equal(done.reason, "TIMEOUT");
    assert.equal(done.result, "0-1", "the absent player loses");
    await bob.close();
  });

  test("the sweeper leaves live duels alone and is idempotent", async () => {
    newDuel("d-live", { initialMs: 600_000 });
    assert.equal(await gw.sweepTimeouts(), 0);
    assert.equal(await gw.sweepTimeouts(), 0);
    assert.equal(duels.get("d-live").status, DuelState.LIVE);
  });
});

describe("abuse resistance", () => {
  test("a flood is throttled rather than served", async () => {
    newDuel("d-flood");
    const alice = await authed("tok-alice");
    alice.send({ t: "JOIN", duelId: "d-flood" });
    await alice.next((m) => m.t === ServerMsg.STATE);

    for (let i = 0; i < 60; i++) {
      alice.send({ t: "PING", cseq: i });
    }
    await settle();
    const limited = alice.inbox.filter(
      (m) => m.t === ServerMsg.ERROR && m.code === ErrorCode.RATE_LIMITED
    );
    assert.ok(limited.length > 0, "a 60-frame burst must hit the limiter");
    assert.equal(alice.ws.readyState, alice.ws.OPEN, "throttled, not disconnected");
    await alice.close();
  });

  test("PING is answered with the server's own time", async () => {
    CLOCK = 1_700_000_000_000;
    const c = await authed("tok-alice");
    c.send({ t: "PING", cseq: 42 });
    const pong = await c.next((m) => m.t === ServerMsg.PONG);
    assert.equal(pong.serverTimeMs, 1_700_000_000_000);
    assert.equal(pong.cseq, 42);
    await c.close();
  });
});

describe("VS_COMPUTER -- a bot moves through the SAME path a human's INTENT does", () => {
  let aiGw, aiDuels;

  before(() => {
    aiDuels = new Map();
    aiGw = createGateway({
      sessions, duels: aiDuels, plugins, now,
      aiAdapters: new Map([["chess", createChessAiAdapter()]]),
      aiMoveDelayMs: 10, // real timers, kept short so tests stay fast
    });
  });
  after(async () => { await aiGw.close(); });

  function newVsComputerDuel(id, { humanSeat = 0, botId = "ai-easy" } = {}) {
    const players = humanSeat === 0 ? ["alice", botId] : [botId, "alice"];
    const d = createDuel({
      duelId: id, plugin: ChessPlugin, players,
      seed: null, config: {}, timeControl: { initialMs: 300_000, incrementMs: 0 }, now: CLOCK,
    });
    d.vsComputer = true; // set exactly as store.hydrate() would from duel.is_vs_computer
    start(d, CLOCK);
    aiDuels.set(id, d);
    return d;
  }

  test("the bot moves automatically when seated to move first -- no human message ever prompts it", async () => {
    newVsComputerDuel("d-ai-first", { humanSeat: 1, botId: "ai-easy" }); // bot is seat 0 (White)
    const alice = await authed("tok-alice", aiGw);
    alice.send({ t: "JOIN", duelId: "d-ai-first" });
    await alice.next((m) => m.t === ServerMsg.STATE);

    const ev = await alice.next((m) => m.t === ServerMsg.EVENT && m.type === "INTENT_ACCEPTED");
    assert.equal(ev.payload.seat, 0, "the move came from the bot's seat, unprompted");
    assert.match(ev.payload.intent, /^[a-h][1-8][a-h][1-8][nbrq]?$/);
    await alice.close();
  });

  test("a human's move is answered by a bot move on the SAME connection, over the real wire", async () => {
    newVsComputerDuel("d-ai-reply", { humanSeat: 0, botId: "ai-easy" }); // human is White, moves first
    const alice = await authed("tok-alice", aiGw);
    alice.send({ t: "JOIN", duelId: "d-ai-reply" });
    await alice.next((m) => m.t === ServerMsg.STATE);

    alice.send({ t: "INTENT", duelId: "d-ai-reply", intent: "e2e4" });
    const own = await alice.next((m) => m.t === ServerMsg.EVENT && m.type === "INTENT_ACCEPTED" && m.payload.seat === 0);
    assert.equal(own.payload.intent, "e2e4");

    const botReply = await alice.next((m) => m.t === ServerMsg.EVENT && m.type === "INTENT_ACCEPTED" && m.payload.seat === 1);
    assert.match(botReply.payload.intent, /^[a-h][1-8][a-h][1-8][nbrq]?$/, "the bot answered with a real legal move");
    assert.equal(aiDuels.get("d-ai-reply").clock.toMove, 0, "and it is White's turn again");
    await alice.close();
  });

  test("resigning against a bot ends the duel immediately -- the bot does not keep moving after the game is over", async () => {
    newVsComputerDuel("d-ai-resign", { humanSeat: 0, botId: "ai-easy" });
    const alice = await authed("tok-alice", aiGw);
    alice.send({ t: "JOIN", duelId: "d-ai-resign" });
    await alice.next((m) => m.t === ServerMsg.STATE);

    alice.send({ t: "RESIGN", duelId: "d-ai-resign" });
    const done = await alice.next((m) => m.t === ServerMsg.COMPLETED);
    assert.equal(done.result, "0-1");
    await settle(); // give any (incorrectly) scheduled bot timer a chance to fire
    assert.equal(aiDuels.get("d-ai-resign").status, DuelState.COMPLETED, "must not have been reopened by a stray bot move");
    await alice.close();
  });

  test("an ordinary human-vs-human duel on the SAME gateway never receives a bot move", async () => {
    const d = createDuel({
      duelId: "d-ai-none", plugin: ChessPlugin, players: ["alice", "bob"],
      seed: null, config: {}, timeControl: { initialMs: 300_000, incrementMs: 0 }, now: CLOCK,
    });
    start(d, CLOCK); // vsComputer left false -- exactly the ordinary shape
    aiDuels.set("d-ai-none", d);

    const alice = await authed("tok-alice", aiGw);
    alice.send({ t: "JOIN", duelId: "d-ai-none" });
    await alice.next((m) => m.t === ServerMsg.STATE);
    await settle();
    assert.equal(d.clock.toMove, 0, "nothing moved -- there is no bot on this duel to move");
    await alice.close();
  });
});

describe("VS_COMPUTER against a SIMULTANEOUS game -- the bot paces itself independently", () => {
  let smGw, smDuels;
  const SM_CONFIG = { ...SPEED_MATH_DEFAULT_CONFIG, durationMs: 60_000, questionCount: 20 };

  before(() => {
    smDuels = new Map();
    smGw = createGateway({
      sessions, duels: smDuels, plugins, now,
      aiAdapters: new Map([["speed-math", createSpeedMathAiAdapter()]]),
      aiMoveDelayMs: 10, // real timers, kept short so tests stay fast
    });
  });
  after(async () => { await smGw.close(); });

  function newVsComputerDuel(id, { botId = "ai-easy" } = {}) {
    const d = createDuel({
      duelId: id, plugin: SpeedMathPlugin, players: ["alice", botId],
      seed: "seed-sm-ai", config: SM_CONFIG, timeControl: { durationMs: SM_CONFIG.durationMs }, now: CLOCK,
    });
    d.vsComputer = true; // set exactly as store.hydrate() would from duel.is_vs_computer
    start(d, CLOCK);
    smDuels.set(id, d);
    return d;
  }

  test("the bot answers on its own, with no human turn to wait for", async () => {
    newVsComputerDuel("d-sm-ai-first");
    const alice = await authed("tok-alice", smGw);
    alice.send({ t: "JOIN", duelId: "d-sm-ai-first" });
    const state = await alice.next((m) => m.t === ServerMsg.STATE);

    // Regression test for a real bug: project() takes a THIRD `seat`
    // argument for an imperfect-information game (this one), which the
    // gateway computes but used to never actually pass -- collapsing
    // every real player's own view down to scores only, with no question
    // ever shown, completely unplayable from a real frontend.
    assert.ok(state.view.current, "the joining player must see their OWN current question, not scores alone");
    assert.equal(typeof state.view.current.a, "number");
    assert.equal(typeof state.view.current.b, "number");
    assert.ok(state.view.you, "the joining player must see their own progress");

    const ev = await alice.next((m) => m.t === ServerMsg.EVENT && m.type === "ANSWER" && m.payload.seat === 1);
    assert.equal(ev.payload.seat, 1, "the answer came from the bot's seat, unprompted");
    assert.equal(typeof ev.payload.correct, "boolean");
    assert.ok(ev.view.current, "every EVENT broadcast must also carry the recipient's own current question");
    await alice.close();
  });

  test("the bot keeps progressing through its OWN questions, independent of the human's pace", async () => {
    newVsComputerDuel("d-sm-ai-sequence");
    const alice = await authed("tok-alice", smGw);
    alice.send({ t: "JOIN", duelId: "d-sm-ai-sequence" });
    await alice.next((m) => m.t === ServerMsg.STATE);

    // The human never answers anything at all; the bot must still work
    // through several of its own questions on its own schedule.
    let botAnswers = 0;
    for (let i = 0; i < 5; i++) {
      await alice.next((m) => m.t === ServerMsg.EVENT && m.type === "ANSWER" && m.payload.seat === 1);
      botAnswers++;
    }
    assert.equal(botAnswers, 5);
    assert.ok(smDuels.get("d-sm-ai-sequence").state.progress[1].index >= 5);
    await alice.close();
  });

  test("resigning against the bot ends the duel immediately -- it does not keep answering after the game is over", async () => {
    newVsComputerDuel("d-sm-ai-resign");
    const alice = await authed("tok-alice", smGw);
    alice.send({ t: "JOIN", duelId: "d-sm-ai-resign" });
    await alice.next((m) => m.t === ServerMsg.STATE);
    await alice.next((m) => m.t === ServerMsg.EVENT && m.type === "ANSWER" && m.payload.seat === 1);

    alice.send({ t: "RESIGN", duelId: "d-sm-ai-resign" });
    const done = await alice.next((m) => m.t === ServerMsg.COMPLETED);
    assert.equal(done.result, "0-1");
    const answeredAtResign = smDuels.get("d-sm-ai-resign").state.progress[1].index;
    await settle(); // give any (incorrectly) scheduled bot timer a chance to fire
    assert.equal(
      smDuels.get("d-sm-ai-resign").state.progress[1].index, answeredAtResign,
      "must not have kept answering after resignation ended the duel"
    );
    await alice.close();
  });

  test("an ordinary human-vs-human SIMULTANEOUS duel on the same gateway never receives a bot answer", async () => {
    const d = createDuel({
      duelId: "d-sm-ai-none", plugin: SpeedMathPlugin, players: ["alice", "bob"],
      seed: "seed-sm-none", config: SM_CONFIG, timeControl: { durationMs: SM_CONFIG.durationMs }, now: CLOCK,
    });
    start(d, CLOCK); // vsComputer left false -- exactly the ordinary shape
    smDuels.set("d-sm-ai-none", d);

    const alice = await authed("tok-alice", smGw);
    alice.send({ t: "JOIN", duelId: "d-sm-ai-none" });
    await alice.next((m) => m.t === ServerMsg.STATE);
    await settle();
    assert.equal(d.state.progress[1].index, 0, "nothing answered -- there is no bot on this duel to answer");
    await alice.close();
  });
});
