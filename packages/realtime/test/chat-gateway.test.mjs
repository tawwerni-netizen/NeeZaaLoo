/**
 * Realtime chat over the SAME gateway/protocol duel traffic already uses --
 * see gateway.mjs's own header and createGateway's `chat` option. The thing
 * under test, as in gateway.test.mjs, is the security property: a client
 * can express a wish (join, send) and nothing more; the server decides
 * whether it is allowed and what actually happened.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createGateway } from "../src/gateway.mjs";
import { ServerMsg } from "../src/protocol.mjs";
import { createInMemoryBus } from "../src/bus.mjs";
import { createChannelService, globalChannelId } from "../../chat/src/channels.mjs";
import { createModerationService, ChatMuteScope } from "../../chat/src/moderation.mjs";
import { createBlockService } from "../../chat/src/blocks.mjs";
import { createMessageService } from "../../chat/src/messages.mjs";
import { createMetricsRegistry } from "../../observability/src/metrics.mjs";
import { ChessPlugin } from "../../game-chess/src/plugin.mjs";
import { createClock } from "../../duel-engine/src/clock.mjs";

let db, gw, sessions, duels, plugins, chatDeps;
let CLOCK = 0;
const now = () => CLOCK;

async function player(id) {
  await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [id]);
}

async function duelRow(id, seat0, seat1) {
  await db.query(
    `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1, tier, stake_minor, initial_state, time_control)
     VALUES ($1,'chess',1,$1,$2,$3,'FREE',0,'{}'::jsonb,'{}'::jsonb)`,
    [id, seat0, seat1]
  );
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
    ws,
    inbox,
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

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  sessions = new Map([
    ["tok-alice", "alice"], ["tok-bob", "bob"], ["tok-eve", "eve"], ["tok-carol", "carol"], ["tok-frank", "frank"],
    ["tok-dave", "dave"], ["tok-grace", "grace"], ["tok-heidi", "heidi"], ["tok-ivan", "ivan"],
    ["tok-judy", "judy"], ["tok-kate", "kate"], ["tok-liam", "liam"],
  ]);
  duels = new Map();
  // The real chess plugin, registered exactly like a production gateway
  // would -- needed only by the Slice 10 "game-state JOIN" spectator tests
  // below, which exercise stateFor()'s real plugin.project() call; every
  // chat-only test in this file never reaches that code path.
  plugins = new Map([["chess", ChessPlugin]]);
  const channels = createChannelService(db);
  const moderation = createModerationService(db, { now });
  const blocks = createBlockService(db);
  const messages = createMessageService(db, { channels, moderation, blocks, now });
  chatDeps = { channels, moderation, blocks, messages };
  gw = createGateway({ sessions, duels, plugins, now, chat: chatDeps, chatRateLimit: { capacity: 5, refillPerSecond: 1000 } });

  // "frank" is never touched by any OTHER test in this file (never muted,
  // never blocked, never sent to) -- reserved for the observability test
  // below so it never depends on execution order or shared state another
  // test happens to leave behind.
  for (const id of ["alice", "bob", "eve", "carol", "frank", "dave", "grace", "heidi", "ivan", "judy", "kate", "liam"]) await player(id);
});

after(async () => { await gw.close(); await db.close?.(); });

// ---------------------------------------------------------------------------

describe("CHAT_JOIN", () => {
  test("nothing chat-related works before AUTH", async () => {
    const c = connect();
    await c.open();
    c.send({ t: "CHAT_JOIN", channel: "GLOBAL" });
    const res = await c.next();
    assert.equal(res.code, "NOT_AUTHENTICATED");
    await c.close();
  });

  test("any authenticated player can join GLOBAL", async () => {
    const c = await authed("tok-alice");
    c.send({ t: "CHAT_JOIN", channel: "GLOBAL" });
    const res = await c.next();
    assert.equal(res.t, ServerMsg.CHAT_JOINED);
    assert.equal(res.channelId, globalChannelId());
    await c.close();
  });

  test("a seated player can join their own match channel", async () => {
    await duelRow("cgd1", "alice", "bob");
    const c = await authed("tok-alice");
    c.send({ t: "CHAT_JOIN", channel: "MATCH", duelId: "cgd1" });
    const res = await c.next();
    assert.equal(res.t, ServerMsg.CHAT_JOINED);
    assert.equal(res.channelId, "match:cgd1");
    await c.close();
  });

  test("a non-participant is REJECTED joining a match channel -- never trusting the client's claimed duelId", async () => {
    await duelRow("cgd2", "alice", "bob");
    const c = await authed("tok-eve");
    c.send({ t: "CHAT_JOIN", channel: "MATCH", duelId: "cgd2" });
    const res = await c.next();
    assert.equal(res.t, ServerMsg.CHAT_REJECTED);
    assert.equal(res.reason, "NOT_A_PARTICIPANT");
    await c.close();
  });

  test("joining a match for a duel that does not exist is rejected cleanly", async () => {
    const c = await authed("tok-alice");
    c.send({ t: "CHAT_JOIN", channel: "MATCH", duelId: "no-such-duel" });
    const res = await c.next();
    assert.equal(res.t, ServerMsg.CHAT_REJECTED);
    assert.equal(res.reason, "NO_SUCH_MATCH");
    await c.close();
  });

  test("joining a SPECTATOR channel for a duel that does not exist is rejected cleanly", async () => {
    const c = await authed("tok-alice");
    c.send({ t: "CHAT_JOIN", channel: "SPECTATOR", duelId: "whatever" });
    const res = await c.next();
    assert.equal(res.t, ServerMsg.CHAT_REJECTED);
    assert.equal(res.reason, "NO_SUCH_MATCH");
    await c.close();
  });

  test("any authenticated player can join a real duel's SPECTATOR channel under the default OPEN policy (Slice 10)", async () => {
    await player("specjoin1a"); await player("specjoin1b");
    await duelRow("specjoinduel1", "specjoin1a", "specjoin1b");
    const c = await authed("tok-carol");
    c.send({ t: "CHAT_JOIN", channel: "SPECTATOR", duelId: "specjoinduel1" });
    const res = await c.next();
    assert.equal(res.t, ServerMsg.CHAT_JOINED);
    assert.equal(res.channelId, "spectator:specjoinduel1");
    await c.close();
  });

  test("PLAYERS_ONLY spectator policy rejects a non-participant trying to join SPECTATOR, over the socket", async () => {
    await player("specjoin2a"); await player("specjoin2b"); await player("specjoin2c");
    await duelRow("specjoinduel2", "specjoin2a", "specjoin2b");
    await db.query("UPDATE duel SET spectator_policy='PLAYERS_ONLY' WHERE id='specjoinduel2'");
    const c = await authed("tok-heidi");
    c.send({ t: "CHAT_JOIN", channel: "SPECTATOR", duelId: "specjoinduel2" });
    const res = await c.next();
    assert.equal(res.t, ServerMsg.CHAT_REJECTED);
    assert.equal(res.reason, "SPECTATORS_DISABLED");
    await c.close();
  });
});

describe("CHAT_SEND / delivery", () => {
  test("a joined player can send, and the sender itself receives the broadcast", async () => {
    const c = await authed("tok-bob");
    c.send({ t: "CHAT_JOIN", channel: "GLOBAL" });
    await c.next();
    c.send({ t: "CHAT_SEND", channelId: globalChannelId(), content: "hello from bob", clientMessageId: "cg-1" });
    const res = await c.next((m) => m.t === ServerMsg.CHAT_MESSAGE);
    assert.equal(res.message.content, "hello from bob");
    assert.equal(res.message.senderId, "bob");
    await c.close();
  });

  test("a second connected subscriber receives the same broadcast", async () => {
    const a = await authed("tok-alice");
    const b = await authed("tok-carol");
    a.send({ t: "CHAT_JOIN", channel: "GLOBAL" }); await a.next();
    b.send({ t: "CHAT_JOIN", channel: "GLOBAL" }); await b.next();

    a.send({ t: "CHAT_SEND", channelId: globalChannelId(), content: "hi everyone", clientMessageId: "cg-2" });
    const seenByB = await b.next((m) => m.t === ServerMsg.CHAT_MESSAGE && m.message.content === "hi everyone");
    assert.equal(seenByB.message.senderId, "alice");
    await a.close(); await b.close();
  });

  test("sending without having joined is refused", async () => {
    const c = await authed("tok-eve");
    c.send({ t: "CHAT_SEND", channelId: globalChannelId(), content: "sneaky", clientMessageId: "cg-3" });
    const res = await c.next();
    assert.equal(res.t, ServerMsg.CHAT_REJECTED);
    assert.equal(res.reason, "NOT_SUBSCRIBED");
    await c.close();
  });

  test("a retried send with the same clientMessageId is deduped, delivered only once", async () => {
    const c = await authed("tok-bob");
    c.send({ t: "CHAT_JOIN", channel: "GLOBAL" }); await c.next();
    c.send({ t: "CHAT_SEND", channelId: globalChannelId(), content: "dedupe test over ws", clientMessageId: "cg-dup" });
    const first = await c.next((m) => m.t === ServerMsg.CHAT_MESSAGE);
    c.send({ t: "CHAT_SEND", channelId: globalChannelId(), content: "dedupe test over ws", clientMessageId: "cg-dup" });
    const second = await c.next((m) => m.t === ServerMsg.CHAT_MESSAGE);
    assert.equal(first.message.id, second.message.id);
    await c.close();
  });

  test("a muted player is rejected on send, over the socket, not just at the service layer", async () => {
    await db.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('wsmod1','wsmod1@n','wsmod1',TRUE)");
    await chatDeps.moderation.muteUser({ targetId: "eve", moderatorId: "wsmod1", reason: "test", scope: ChatMuteScope.GLOBAL_CHAT });
    const c = await authed("tok-eve");
    c.send({ t: "CHAT_JOIN", channel: "GLOBAL" }); await c.next();
    c.send({ t: "CHAT_SEND", channelId: globalChannelId(), content: "let me talk", clientMessageId: "cg-4" });
    const res = await c.next();
    assert.equal(res.t, ServerMsg.CHAT_REJECTED);
    assert.equal(res.reason, "MUTED");
    await c.close();
  });

  test("match chat: only the two seated players receive a message sent by one of them", async () => {
    await duelRow("cgd3", "alice", "bob");
    const alice = await authed("tok-alice");
    const bob = await authed("tok-bob");
    alice.send({ t: "CHAT_JOIN", channel: "MATCH", duelId: "cgd3" }); await alice.next();
    bob.send({ t: "CHAT_JOIN", channel: "MATCH", duelId: "cgd3" }); await bob.next();

    alice.send({ t: "CHAT_SEND", channelId: "match:cgd3", content: "gg wp", clientMessageId: "cg-5" });
    const seenByBob = await bob.next((m) => m.t === ServerMsg.CHAT_MESSAGE);
    assert.equal(seenByBob.message.content, "gg wp");
    await alice.close(); await bob.close();
  });

  test("blocking a sender means their FUTURE broadcasts are not delivered to the blocker's connection", async () => {
    const blockerToken = "tok-carol";
    await chatDeps.blocks.blockPlayer("carol", "bob");
    const carol = await authed(blockerToken);
    const bob = await authed("tok-bob");
    carol.send({ t: "CHAT_JOIN", channel: "GLOBAL" }); await carol.next();
    bob.send({ t: "CHAT_JOIN", channel: "GLOBAL" }); await bob.next();

    bob.send({ t: "CHAT_SEND", channelId: globalChannelId(), content: "carol should not see this", clientMessageId: "cg-6" });
    // bob himself still sees his own message (broadcast reaches everyone
    // EXCEPT connections whose player has blocked the sender).
    await bob.next((m) => m.t === ServerMsg.CHAT_MESSAGE && m.message.content === "carol should not see this");

    let carolSawIt = false;
    try {
      await Promise.race([
        carol.next((m) => m.t === ServerMsg.CHAT_MESSAGE && m.message.content === "carol should not see this"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout (expected)")), 300)),
      ]);
      carolSawIt = true;
    } catch { /* expected: carol never receives it */ }
    assert.equal(carolSawIt, false);
    await carol.close(); await bob.close();
  });

  test("a non-participant cannot send to a match channel by guessing its channelId, even without ever joining", async () => {
    await duelRow("cgd-iso1", "alice", "bob");
    const outsider = await authed("tok-eve");
    outsider.send({ t: "CHAT_SEND", channelId: "match:cgd-iso1", content: "sneaky guess", clientMessageId: "cg-iso-1" });
    const res = await outsider.next();
    assert.equal(res.t, ServerMsg.CHAT_REJECTED);
    assert.equal(res.reason, "NOT_SUBSCRIBED", "never subscribed -- the channelId string alone grants nothing");
    await outsider.close();
  });

  test("a match message is never visible through global chat -- channel isolation", async () => {
    await duelRow("cgd-iso2", "dave", "grace");
    const dave = await authed("tok-dave");
    const observer = await authed("tok-ivan");
    dave.send({ t: "CHAT_JOIN", channel: "MATCH", duelId: "cgd-iso2" }); await dave.next();
    observer.send({ t: "CHAT_JOIN", channel: "GLOBAL" }); await observer.next();

    dave.send({ t: "CHAT_SEND", channelId: "match:cgd-iso2", content: "private match content", clientMessageId: "cg-iso-2" });
    const echoed = await dave.next((m) => m.t === ServerMsg.CHAT_MESSAGE);
    assert.equal(echoed.channelId, "match:cgd-iso2");

    // The GLOBAL subscriber must never receive it, on ANY channel.
    let leaked = false;
    try {
      await Promise.race([
        observer.next((m) => m.t === ServerMsg.CHAT_MESSAGE && m.message.content === "private match content"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout (expected)")), 300)),
      ]);
      leaked = true;
    } catch { /* expected */ }
    assert.equal(leaked, false, "a match message must never reach a global-chat subscriber");

    const history = await chatDeps.messages.listHistory({ channelId: globalChannelId(), viewerId: "ivan" });
    assert.ok(!history.some((m) => m.content === "private match content"), "the match message must never appear in global history either");

    await dave.close(); await observer.close();
  });

  test("deterministic ordering: four rapid messages from different senders are delivered to every subscriber in the SAME real order", async () => {
    const sender1 = await authed("tok-heidi");
    const sender2 = await authed("tok-ivan");
    const observer = await authed("tok-grace");
    sender1.send({ t: "CHAT_JOIN", channel: "GLOBAL" }); await sender1.next();
    sender2.send({ t: "CHAT_JOIN", channel: "GLOBAL" }); await sender2.next();
    observer.send({ t: "CHAT_JOIN", channel: "GLOBAL" }); await observer.next();

    const marker = `order-${Date.now()}`;
    // Fired in this exact interleaving -- the server, not the client's send
    // order or any client timestamp, decides what "real" order means.
    sender1.send({ t: "CHAT_SEND", channelId: globalChannelId(), content: `${marker}-A`, clientMessageId: `${marker}-A` });
    sender2.send({ t: "CHAT_SEND", channelId: globalChannelId(), content: `${marker}-B`, clientMessageId: `${marker}-B` });
    sender1.send({ t: "CHAT_SEND", channelId: globalChannelId(), content: `${marker}-C`, clientMessageId: `${marker}-C` });
    sender2.send({ t: "CHAT_SEND", channelId: globalChannelId(), content: `${marker}-D`, clientMessageId: `${marker}-D` });

    const seenByObserver = [];
    for (let i = 0; i < 4; i++) {
      const m = await observer.next((msg) => msg.t === ServerMsg.CHAT_MESSAGE && msg.message.content.startsWith(marker) && !seenByObserver.some((s) => s === msg.message.content));
      seenByObserver.push(m.message.content);
    }

    // Whatever real order the server settled on, EVERY subscriber -- the
    // observer here, and the senders' own echoes -- must agree on it,
    // because it is read from the same `id`-ordered broadcast, never
    // reconstructed per-listener from arrival timing.
    const historyOrder = (await chatDeps.messages.listHistory({ channelId: globalChannelId(), viewerId: "grace", limit: 4 }))
      .map((m) => m.content).reverse();
    assert.deepEqual(seenByObserver, historyOrder, "the observer's delivery order must match the durable, id-ordered history exactly");

    await sender1.close(); await sender2.close(); await observer.close();
  });

  test("forged sender identity: a client cannot claim to be a different player -- CHAT_SEND's wire shape has no senderId field at all, so smuggling one in is rejected outright by frame validation before chat is ever reached", async () => {
    const c = await authed("tok-dave");
    c.send({ t: "CHAT_JOIN", channel: "GLOBAL" }); await c.next();
    c.send({
      t: "CHAT_SEND", channelId: globalChannelId(), content: "impersonation attempt", clientMessageId: "cg-forge-1", senderId: "alice",
    });
    const res = await c.next((m) => m.t === "ERROR");
    assert.equal(res.code, "UNEXPECTED_FIELD");
    assert.equal(res.detail, "senderId");

    // The exact same send, minus the forged field, goes through normally and
    // is attributed to the real authenticated connection -- proving the
    // rejection above is about the forged field, not a broken channel/join.
    c.send({ t: "CHAT_SEND", channelId: globalChannelId(), content: "impersonation attempt", clientMessageId: "cg-forge-2" });
    const ok = await c.next((m) => m.t === ServerMsg.CHAT_MESSAGE);
    assert.equal(ok.message.senderId, "dave");
    await c.close();
  });
});

describe("spectator eligibility for the GAME-STATE join, not just chat (Slice 10)", () => {
  test("PLAYERS_ONLY also blocks a non-participant from joining the duel's live game state over the SAME websocket protocol chat uses", async () => {
    await player("gsspec1a"); await player("gsspec1b"); await player("gsspec1c");
    await duelRow("gsspecduel1", "gsspec1a", "gsspec1b");
    await db.query("UPDATE duel SET spectator_policy='PLAYERS_ONLY' WHERE id='gsspecduel1'");
    duels.set("gsspecduel1", {
      duelId: "gsspecduel1", gameId: "chess", status: "LIVE",
      players: ["gsspec1a", "gsspec1b"], events: [], outcome: null, state: null,
    });
    const outsider = await authed("tok-judy");
    outsider.send({ t: "JOIN", duelId: "gsspecduel1" });
    const res = await outsider.next();
    assert.equal(res.t, "ERROR");
    assert.equal(res.code, "SPECTATORS_DISABLED");
    await outsider.close();
    duels.delete("gsspecduel1");
  });

  test("under the default OPEN policy, a non-participant CAN still join the duel's live game state as a spectator (existing behavior, unchanged)", async () => {
    await player("gsspec2a"); await player("gsspec2b");
    await duelRow("gsspecduel2", "gsspec2a", "gsspec2b");
    duels.set("gsspecduel2", {
      duelId: "gsspecduel2", gameId: "chess", status: "LIVE",
      players: ["gsspec2a", "gsspec2b"], events: [], outcome: null,
      state: ChessPlugin.createChallenge(null).state,
      clock: createClock({ initialMs: 300000, incrementMs: 0 }, now()),
    });
    const outsider = await authed("tok-kate");
    outsider.send({ t: "JOIN", duelId: "gsspecduel2" });
    const res = await outsider.next();
    assert.equal(res.t, "STATE");
    await outsider.close();
    duels.delete("gsspecduel2");
  });
});

describe("SPECTATOR chat (Slice 10)", () => {
  test("a duplicate CHAT_JOIN to the same channel from the same connection is idempotent -- no duplicate delivery, no double-counted active-connection state", async () => {
    await player("specdup1a"); await player("specdup1b");
    await duelRow("specdupduel1", "specdup1a", "specdup1b");
    const spec = await authed("tok-heidi");
    const observer = await authed("tok-ivan");
    spec.send({ t: "CHAT_JOIN", channel: "SPECTATOR", duelId: "specdupduel1" });
    const first = await spec.next((m) => m.t === ServerMsg.CHAT_JOINED);
    // The SAME join, sent again, over the SAME connection -- simulating a
    // client that re-sent CHAT_JOIN after a slow/ambiguous response, or a
    // stale UI re-subscribing on remount.
    spec.send({ t: "CHAT_JOIN", channel: "SPECTATOR", duelId: "specdupduel1" });
    const second = await spec.next((m) => m.t === ServerMsg.CHAT_JOINED && m !== first);
    assert.equal(second.channelId, first.channelId);

    observer.send({ t: "CHAT_JOIN", channel: "SPECTATOR", duelId: "specdupduel1" });
    await observer.next((m) => m.t === ServerMsg.CHAT_JOINED);
    spec.send({ t: "CHAT_SEND", channelId: first.channelId, content: "dup-join-test", clientMessageId: "spec-dup-1" });
    const deliveries = [];
    for (let i = 0; i < 2; i++) {
      try { deliveries.push(await observer.next((m) => m.t === ServerMsg.CHAT_MESSAGE && m.message.content === "dup-join-test" && !deliveries.includes(m), 1200)); }
      catch { break; }
    }
    assert.equal(deliveries.length, 1, "a duplicate JOIN must never cause the observer to receive the message twice");
    await spec.close(); await observer.close();
  });

  test("a spectator can join, send, and receive in a real duel's spectator channel", async () => {
    await player("specsend1a"); await player("specsend1b");
    await duelRow("specsendduel1", "specsend1a", "specsend1b");
    const spec1 = await authed("tok-carol");
    const spec2 = await authed("tok-frank");
    spec1.send({ t: "CHAT_JOIN", channel: "SPECTATOR", duelId: "specsendduel1" });
    const joined = await spec1.next((m) => m.t === ServerMsg.CHAT_JOINED);
    spec2.send({ t: "CHAT_JOIN", channel: "SPECTATOR", duelId: "specsendduel1" });
    await spec2.next((m) => m.t === ServerMsg.CHAT_JOINED);

    spec1.send({ t: "CHAT_SEND", channelId: joined.channelId, content: "nice opening", clientMessageId: "spec-send-1" });
    const seen = await spec2.next((m) => m.t === ServerMsg.CHAT_MESSAGE && m.message.content === "nice opening");
    assert.equal(seen.message.senderId, "carol");
    await spec1.close(); await spec2.close();
  });

  test("spectator chat is ISOLATED from the private player match chat -- a spectator never receives player-channel messages, and a player's spectator-chat message never reaches the player channel", async () => {
    await player("specsend2a"); await player("specsend2b");
    await duelRow("specsendduel2", "specsend2a", "specsend2b");
    const playerA = await authed("tok-dave");
    const spectator = await authed("tok-grace");
    await db.query("UPDATE duel SET seat_0='dave' WHERE id='specsendduel2'");

    playerA.send({ t: "CHAT_JOIN", channel: "MATCH", duelId: "specsendduel2" });
    const playerJoined = await playerA.next((m) => m.t === ServerMsg.CHAT_JOINED);
    spectator.send({ t: "CHAT_JOIN", channel: "SPECTATOR", duelId: "specsendduel2" });
    const specJoined = await spectator.next((m) => m.t === ServerMsg.CHAT_JOINED);
    assert.notEqual(playerJoined.channelId, specJoined.channelId, "match and spectator channels for the same duel must be DISTINCT channel ids");

    playerA.send({ t: "CHAT_SEND", channelId: playerJoined.channelId, content: "private player-only chat", clientMessageId: "spec-iso-1" });
    await playerA.next((m) => m.t === ServerMsg.CHAT_MESSAGE);
    let leaked = false;
    try { await spectator.next((m) => m.t === ServerMsg.CHAT_MESSAGE && m.message.content === "private player-only chat"); leaked = true; } catch { /* expected */ }
    assert.equal(leaked, false, "the spectator must never see the private player channel's messages");

    // And the reverse: a spectator's message must never appear on the player channel.
    spectator.send({ t: "CHAT_SEND", channelId: specJoined.channelId, content: "spectator commentary", clientMessageId: "spec-iso-2" });
    await spectator.next((m) => m.t === ServerMsg.CHAT_MESSAGE);
    let leakedToPlayer = false;
    try { await playerA.next((m) => m.t === ServerMsg.CHAT_MESSAGE && m.message.content === "spectator commentary"); leakedToPlayer = true; } catch { /* expected */ }
    assert.equal(leakedToPlayer, false, "a player subscribed only to MATCH must never see spectator-channel traffic");
    await playerA.close(); await spectator.close();
  });

  test("a spectator cannot send a player MOVE -- spectating chat grants no game-state authority; INTENT still requires real seat membership", async () => {
    await player("specsend3a"); await player("specsend3b");
    // A real Postgres duel row (chat's own canAccessChannel queries this),
    // AND a matching entry in the gateway's in-memory `duels` Map (the
    // realtime engine's own duel-room INTENT check queries THAT) -- the two
    // are deliberately separate stores, so both need seeding for this test
    // to exercise the real path rather than short-circuiting on either.
    await duelRow("specsendduel3", "specsend3a", "specsend3b");
    duels.set("specsendduel3", {
      duelId: "specsendduel3", gameId: "chess", status: "LIVE",
      players: ["specsend3a", "specsend3b"], events: [], outcome: null, state: null,
    });
    const spectator = await authed("tok-ivan");
    spectator.send({ t: "CHAT_JOIN", channel: "SPECTATOR", duelId: "specsendduel3" });
    await spectator.next((m) => m.t === ServerMsg.CHAT_JOINED);
    // A spectator connection is never subscribed to the DUEL room at all
    // (JOIN as "player" is what that requires, and that itself is refused
    // unless actually seated -- see gateway.mjs's own JOIN handler) so an
    // INTENT from this connection is refused the same way any unsubscribed
    // connection's would be.
    spectator.send({ t: "INTENT", duelId: "specsendduel3", intent: "e2e4" });
    const res = await spectator.next();
    assert.equal(res.t, "ERROR");
    assert.notEqual(res.code, undefined);
    await spectator.close();
  });
});

describe("match channel lifecycle (Slice 10)", () => {
  test("once a duel's post-game window has elapsed, a NEW subscription to its match channel is refused with POST_GAME_CLOSED, but the duel's chat history stays readable via REST-equivalent listHistory", async () => {
    await player("lifegw1b");
    // dave is a real authenticated identity (has a session token in this
    // file's fixed `sessions` map) -- seated directly rather than using a
    // fresh, tokenless player id, so the CLOSED gate is exercised as the
    // SECOND check a genuinely eligible participant hits, not conflated
    // with a NOT_A_PARTICIPANT rejection from an unrelated identity.
    await duelRow("lifegwduel1", "dave", "lifegw1b");
    await chatDeps.channels.getOrCreateMatchChannel("lifegwduel1");
    await chatDeps.channels.markMatchCompleted("lifegwduel1", { at: now(), windowMs: 1 });
    const savedClock = CLOCK;
    CLOCK += 1000;

    const c = await authed("tok-dave");
    c.send({ t: "CHAT_JOIN", channel: "MATCH", duelId: "lifegwduel1" });
    const res = await c.next();
    assert.equal(res.t, ServerMsg.CHAT_REJECTED);
    assert.equal(res.reason, "POST_GAME_CLOSED");
    await c.close();

    const history = await chatDeps.messages.listHistory({ channelId: "match:lifegwduel1", viewerId: "dave", limit: 10 });
    assert.deepEqual(history, [], "no messages were ever sent, but the READ itself must not throw or be refused by the CLOSED state");
    CLOCK = savedClock;
  });
});

describe("rate limiting", () => {
  // A DELIBERATELY strict gateway, separate from the shared `gw` above
  // (whose generous chatRateLimit exists only so the other describe blocks
  // never trip it by accident): a real rate-limit test needs a budget a
  // fast test loop can actually exhaust, not one that outpaces it.
  let strictGw;

  before(() => {
    strictGw = createGateway({
      sessions, duels, plugins, now, chat: chatDeps,
      chatRateLimit: { capacity: 3, refillPerSecond: 0.001 },
      chatJoinRateLimit: { capacity: 3, refillPerSecond: 0.001 },
    });
  });

  after(async () => { await strictGw.close(); });

  test("a normal send rate is never throttled", async () => {
    const c = await authed("tok-heidi", strictGw);
    c.send({ t: "CHAT_JOIN", channel: "GLOBAL" }); await c.next();
    c.send({ t: "CHAT_SEND", channelId: globalChannelId(), content: "normal message one", clientMessageId: `rl-normal-${Date.now()}-1` });
    const r = await c.next();
    assert.equal(r.t, ServerMsg.CHAT_MESSAGE);
    await c.close();
  });

  test("a burst of sends past the per-player budget is throttled with RATE_LIMITED, not silently dropped or crashed", async () => {
    const c = await authed("tok-ivan", strictGw);
    c.send({ t: "CHAT_JOIN", channel: "GLOBAL" }); await c.next();
    let sawRateLimited = false;
    for (let i = 0; i < 10 && !sawRateLimited; i++) {
      c.send({ t: "CHAT_SEND", channelId: globalChannelId(), content: `burst-${i}-${Date.now()}`, clientMessageId: `rl-burst-${Date.now()}-${i}` });
      const r = await c.next();
      if (r.t === ServerMsg.CHAT_REJECTED && r.reason === "RATE_LIMITED") sawRateLimited = true;
    }
    assert.equal(sawRateLimited, true, "a fast-enough burst must eventually be refused, never allowed to flood unbounded");
    await c.close();
  });

  test("a reconnect does NOT reset the per-player send budget -- the same player exhausts their limit, disconnects, reconnects, and is still limited", async () => {
    let sawRateLimited = false;
    for (let round = 0; round < 3 && !sawRateLimited; round++) {
      const c = await authed("tok-dave", strictGw);
      c.send({ t: "CHAT_JOIN", channel: "GLOBAL" }); await c.next();
      for (let i = 0; i < 6 && !sawRateLimited; i++) {
        c.send({ t: "CHAT_SEND", channelId: globalChannelId(), content: `reconnect-burst-${round}-${i}`, clientMessageId: `rl-reco-${round}-${i}-${Date.now()}` });
        const r = await c.next();
        if (r.t === ServerMsg.CHAT_REJECTED && r.reason === "RATE_LIMITED") sawRateLimited = true;
      }
      await c.close();
    }
    assert.equal(sawRateLimited, true, "reconnecting must not hand a flooding client a fresh budget -- the limiter is keyed by player, not connection");
  });

  test("a burst of CHAT_JOIN attempts past the per-player join budget is throttled separately from sends", async () => {
    const c = await authed("tok-grace", strictGw);
    let sawRateLimited = false;
    for (let i = 0; i < 10 && !sawRateLimited; i++) {
      c.send({ t: "CHAT_JOIN", channel: "GLOBAL" });
      const r = await c.next();
      if (r.t === ServerMsg.CHAT_REJECTED && r.reason === "RATE_LIMITED") sawRateLimited = true;
    }
    assert.equal(sawRateLimited, true, "repeated joins must eventually be throttled by their OWN budget, distinct from the send limiter");
    await c.close();
  });
});

/**
 * Consolidated identity-forgery coverage. Every one of these is a rejection
 * enforced by the WIRE PROTOCOL'S OWN SHAPE (parseClientFrame's SHAPES table
 * in protocol.mjs), not a service-layer check that a differently-shaped
 * message could route around -- so a forged field is a parse-time ERROR
 * frame, never a value that silently reaches chat.mjs/messages.mjs at all.
 *   - senderId:  CHAT_SEND has no such field -- see the dedicated test above
 *                in "CHAT_SEND / delivery".
 *   - channelId: CHAT_SEND/CHAT_LEAVE take a channelId, but sending one the
 *                connection never joined is NOT_SUBSCRIBED ("sending without
 *                having joined" / "a non-participant cannot send ... by
 *                guessing its channelId", both above) -- the field exists,
 *                but is authorized against `conn.chatSubscriptions`, never
 *                trusted at face value.
 *   - matchId:   CHAT_JOIN's `duelId` is real and used to RESOLVE a channel,
 *                but access is re-derived from the real duel row's seats
 *                ("a non-participant is REJECTED joining a match channel",
 *                above) -- the client can name a real match, never borrow
 *                membership in one.
 *   - playerId / participant role: covered explicitly below -- neither AUTH
 *                nor CHAT_JOIN has a field for either, by protocol shape.
 */
describe("wire-protocol forgery resistance (senderId/playerId/channelId/matchId/role)", () => {
  test("AUTH cannot smuggle a playerId -- identity comes ONLY from verifying the token server-side, never from a client-declared field", async () => {
    const c = connect();
    await c.open();
    c.send({ t: "AUTH", token: "tok-dave", playerId: "alice" });
    const res = await c.next();
    assert.equal(res.t, "ERROR");
    assert.equal(res.code, "UNEXPECTED_FIELD");
    assert.equal(res.detail, "playerId");

    // The same token, without the forged field, authenticates as its REAL
    // owner (dave), proving the rejection is about the forged field alone.
    c.send({ t: "AUTH", token: "tok-dave" });
    const ok = await c.next();
    assert.equal(ok.t, ServerMsg.AUTHED);
    assert.equal(ok.playerId, "dave");
    await c.close();
  });

  test("CHAT_JOIN cannot smuggle a participant role -- there is no role field in the chat wire protocol for a client to assert one through", async () => {
    await player("roleforge1"); await player("roleforge2");
    await duelRow("roleforgeduel", "roleforge1", "roleforge2");
    const c = await authed("tok-heidi");
    c.send({
      t: "CHAT_JOIN", channel: "MATCH", duelId: "roleforgeduel", role: "MODERATOR",
    });
    const res = await c.next();
    assert.equal(res.t, "ERROR");
    assert.equal(res.code, "UNEXPECTED_FIELD");
    assert.equal(res.detail, "role");
    await c.close();
  });
});

/**
 * Two INDEPENDENT gateway instances -- two separate `chatRooms` Maps, two
 * separate closures, exactly as different OS processes would be -- wired to
 * the SAME RealtimeBus. This is the unit-level proof that the publish/
 * subscribe seam itself is correct: gateway B's local delivery loop only
 * ever runs off what the bus handed it, never off gateway A's memory. The
 * real cross-PROCESS proof (two real Node processes, a real Postgres
 * NOTIFY channel) lives in the live smoke harness, since a unit test
 * cannot spawn a second process and keep this file's timing guarantees;
 * this test is what makes that live run a confirmation rather than a
 * first attempt.
 */
describe("cross-instance fan-out (RealtimeBus)", () => {
  let gwA, gwB, sharedBus;
  before(() => {
    sharedBus = createInMemoryBus();
    const opts = { sessions, duels, plugins, now, chat: chatDeps, chatRateLimit: { capacity: 1000, refillPerSecond: 1000 }, chatBus: sharedBus };
    gwA = createGateway(opts);
    gwB = createGateway(opts);
  });
  after(async () => {
    // Neither instance "owns" the shared bus (chatBus was caller-supplied),
    // so closing both gateways must NOT double-close or error on the bus.
    await gwA.close();
    await gwB.close();
  });

  test("a global message sent on gateway A is delivered to a client connected to gateway B", async () => {
    const onA = await authed("tok-judy", gwA);
    const onB = await authed("tok-kate", gwB);
    onA.send({ t: "CHAT_JOIN", channel: "GLOBAL" }); await onA.next((m) => m.t === ServerMsg.CHAT_JOINED);
    onB.send({ t: "CHAT_JOIN", channel: "GLOBAL" }); await onB.next((m) => m.t === ServerMsg.CHAT_JOINED);

    onA.send({ t: "CHAT_SEND", channelId: globalChannelId(), content: "hello across instances", clientMessageId: "xi-1" });
    const seenOnA = await onA.next((m) => m.t === ServerMsg.CHAT_MESSAGE && m.message.content === "hello across instances");
    const seenOnB = await onB.next((m) => m.t === ServerMsg.CHAT_MESSAGE && m.message.content === "hello across instances");
    assert.equal(seenOnA.message.senderId, "judy");
    assert.equal(seenOnB.message.senderId, "judy", "gateway B never talked to judy directly -- this came entirely through the bus");
    await onA.close(); await onB.close();
  });

  test("a match message crosses instances to the other seated player, and never reaches a non-participant on either instance", async () => {
    await player("xiplayerA"); await player("xiplayerB"); await player("xioutsider");
    await duelRow("xiduel1", "xiplayerA", "xiplayerB");
    const pA = await authed("tok-liam", gwA); // liam plays xiplayerA's seat via direct playerId below
    // liam's token maps to player "liam", not "xiplayerA" -- reseat the duel
    // to the real session identities so this test does not need yet another
    // token/session pair.
    await db.query("UPDATE duel SET seat_0=$1, seat_1=$2 WHERE id='xiduel1'", ["liam", "judy"]);
    const pB = await authed("tok-judy", gwB);
    const outsider = await authed("tok-kate", gwA);

    pA.send({ t: "CHAT_JOIN", channel: "MATCH", duelId: "xiduel1" });
    const joinedA = await pA.next((m) => m.t === ServerMsg.CHAT_JOINED);
    pB.send({ t: "CHAT_JOIN", channel: "MATCH", duelId: "xiduel1" });
    await pB.next((m) => m.t === ServerMsg.CHAT_JOINED);
    outsider.send({ t: "CHAT_JOIN", channel: "MATCH", duelId: "xiduel1" });
    const outsiderRes = await outsider.next((m) => m.t === ServerMsg.CHAT_JOINED || m.t === ServerMsg.CHAT_REJECTED);
    assert.equal(outsiderRes.t, ServerMsg.CHAT_REJECTED, "kate is not seated in xiduel1 on EITHER instance");

    pA.send({ t: "CHAT_SEND", channelId: joinedA.channelId, content: "cross-instance match message", clientMessageId: "xi-2" });
    const seenByB = await pB.next((m) => m.t === ServerMsg.CHAT_MESSAGE && m.message.content === "cross-instance match message");
    assert.equal(seenByB.message.senderId, "liam");

    let leaked = false;
    try { await outsider.next((m) => m.t === ServerMsg.CHAT_MESSAGE && m.message.content === "cross-instance match message"); leaked = true; } catch { /* expected */ }
    assert.equal(leaked, false, "the non-participant must not receive the match message on either instance");

    await pA.close(); await pB.close(); await outsider.close();
  });

  test("a moderator delete on one instance's chat service propagates CHAT_MESSAGE_REMOVED to a client on the OTHER instance", async () => {
    await db.query(
      "INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ('ximod1','ximod1@n','ximod1',TRUE) ON CONFLICT (id) DO NOTHING"
    );
    const sender = await authed("tok-liam", gwA);
    const observer = await authed("tok-kate", gwB);
    sender.send({ t: "CHAT_JOIN", channel: "GLOBAL" }); await sender.next((m) => m.t === ServerMsg.CHAT_JOINED);
    observer.send({ t: "CHAT_JOIN", channel: "GLOBAL" }); await observer.next((m) => m.t === ServerMsg.CHAT_JOINED);

    sender.send({ t: "CHAT_SEND", channelId: globalChannelId(), content: "to be moderated cross-instance", clientMessageId: "xi-3" });
    const sent = await observer.next((m) => m.t === ServerMsg.CHAT_MESSAGE && m.message.content === "to be moderated cross-instance");

    // Moderation itself is a REST/service-layer action in production,
    // issued from the API process -- a SEPARATE process from either
    // gateway here -- never a gateway message. This test exercises the
    // real DB-level delete through chatDeps.messages.moderateDelete, then
    // publishes "chat:removed" on the SAME shared bus, standing in for
    // what the API route's own publish call does in production (covered
    // as its own wiring in packages/chat/src/messages.mjs and the API
    // route). What THIS test proves is the gateway half: that a removal
    // published from anywhere reaches a connection on a DIFFERENT gateway
    // instance than the one the message was originally sent on.
    const del = await chatDeps.messages.moderateDelete({ messageId: sent.message.id, moderatorId: "ximod1" });
    assert.equal(del.ok, true);
    sharedBus.publish("chat:removed", { channelId: globalChannelId(), messageId: sent.message.id });

    const removed = await observer.next((m) => m.t === ServerMsg.CHAT_MESSAGE_REMOVED && String(m.messageId) === String(sent.message.id));
    assert.equal(removed.channelId, globalChannelId());
    assert.ok(!("deletedBy" in removed) && !("reason" in removed), "the realtime removal event must never carry moderation detail");
    await sender.close(); await observer.close();
  });
});

describe("reconnect", () => {
  test("a disconnected client can reconnect, re-authenticate, and rejoin", async () => {
    const c1 = await authed("tok-alice");
    c1.send({ t: "CHAT_JOIN", channel: "GLOBAL" });
    await c1.next();
    await c1.close();

    const c2 = await authed("tok-alice");
    c2.send({ t: "CHAT_JOIN", channel: "GLOBAL" });
    const res = await c2.next();
    assert.equal(res.t, ServerMsg.CHAT_JOINED);
    await c2.close();
  });

  test("missed-message recovery: messages sent while a client is disconnected are recovered via the `after` cursor on reconnect", async () => {
    const c1 = await authed("tok-bob");
    c1.send({ t: "CHAT_JOIN", channel: "GLOBAL" });
    await c1.next();
    c1.send({ t: "CHAT_SEND", channelId: globalChannelId(), content: "seen before disconnect", clientMessageId: "recon-anchor" });
    const anchor = await c1.next((m) => m.t === ServerMsg.CHAT_MESSAGE && m.message.content === "seen before disconnect");
    await c1.close();

    // Disconnected: two more messages arrive from someone else while bob is offline.
    const alice = await authed("tok-alice");
    alice.send({ t: "CHAT_JOIN", channel: "GLOBAL" });
    await alice.next();
    alice.send({ t: "CHAT_SEND", channelId: globalChannelId(), content: "missed while offline 1", clientMessageId: "recon-1" });
    await alice.next((m) => m.t === ServerMsg.CHAT_MESSAGE);
    alice.send({ t: "CHAT_SEND", channelId: globalChannelId(), content: "missed while offline 2", clientMessageId: "recon-2" });
    await alice.next((m) => m.t === ServerMsg.CHAT_MESSAGE);
    await alice.close();

    // Bob reconnects and recovers exactly what he missed, in order, via the
    // SAME service a REST client would call -- no message is silently lost.
    const recovered = await chatDeps.messages.listHistory({
      channelId: globalChannelId(), viewerId: "bob", after: anchor.message.id,
    });
    assert.deepEqual(recovered.map((m) => m.content), ["missed while offline 1", "missed while offline 2"]);
  });
});

describe("observability (directive #41)", () => {
  test("join, send, and rejection each move the expected counters/gauges on a gateway wired with a real registry", async () => {
    const metrics = createMetricsRegistry();
    const localGw = createGateway({
      sessions, duels: new Map(), plugins: new Map(), now, chat: chatDeps,
      chatRateLimit: { capacity: 5, refillPerSecond: 1000 }, metrics,
    });

    async function authedOn(gwInstance, token) {
      const ws = new WebSocket(gwInstance.url);
      const inbox = [];
      const waiters = [];
      ws.on("message", (raw) => {
        const m = JSON.parse(raw.toString());
        const i = waiters.findIndex((w) => !w.pred || w.pred(m));
        if (i >= 0) { const w = waiters.splice(i, 1)[0]; clearTimeout(w.timer); w.resolve(m); } else { inbox.push(m); }
      });
      await new Promise((r) => (ws.readyState === ws.OPEN ? r() : ws.once("open", r)));
      const next = (pred) => {
        const i = pred ? inbox.findIndex(pred) : (inbox.length ? 0 : -1);
        if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
        return new Promise((resolve, reject) => {
          const w = { pred, resolve };
          w.timer = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(new Error(`timed out; queued frames: ${JSON.stringify(inbox)}`)); }, 2000);
          waiters.push(w);
        });
      };
      ws.send(JSON.stringify({ t: "AUTH", token }));
      await next();
      return { ws, next, send: (o) => ws.send(JSON.stringify(o)) };
    }

    // "frank" -- reserved, untouched by any other test in this file (see
    // before()'s own comment), so this test's outcome never depends on
    // execution order or another test's mute/block side effects.
    let c;
    try {
      c = await authedOn(localGw, "tok-frank");
      c.send({ t: "CHAT_JOIN", channel: "GLOBAL" });
      await c.next();
      c.send({ t: "CHAT_SEND", channelId: globalChannelId(), content: "metrics test message", clientMessageId: "metrics-1" });
      await c.next((m) => m.t === ServerMsg.CHAT_MESSAGE);
      // A rejected send: this channel was never joined.
      c.send({ t: "CHAT_SEND", channelId: "match:no-such-duel", content: "x", clientMessageId: "metrics-2" });
      await c.next((m) => m.t === ServerMsg.CHAT_REJECTED);

      const snapshot = metrics.snapshot();
      assert.equal(Object.values(snapshot.chat_active_connections.series)[0], 1, "one connection is actively subscribed to chat");
      assert.equal(Object.values(snapshot.chat_messages_sent_total.series).reduce((a, b) => a + b, 0), 1);
      assert.ok(Object.keys(snapshot.chat_rejected_total.series).some((k) => k.includes("NOT_SUBSCRIBED")));
      assert.ok(snapshot.chat_send_latency_ms.series);
    } finally {
      c?.ws.close();
      await localGw.close();
    }
  });
});
