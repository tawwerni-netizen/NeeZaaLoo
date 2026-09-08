/**
 * Direct tests of the Skill Duel Engine core (packages/duel-engine/src/duel.mjs).
 *
 * Until now this engine had only INDIRECT coverage, through the chess and
 * speed-math plugin test suites and the realtime gateway tests. That is not
 * the same guarantee: a property that happens to hold for both existing
 * games could still be an accident of how those two plugins are written,
 * not a real invariant of the engine. This file drives the engine directly,
 * against two fixture plugins (`fixtures.mjs`) that are deliberately NOT
 * chess-shaped or speed-math-shaped, so an assumption that only survives
 * because of how those two games happen to behave has nowhere to hide.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  registerPlugin, createDuel, start, runIntent, resign, claimTimeout,
  offerDraw, declineDraw, acceptDraw, DRAW_OFFER_COOLDOWN_MS,
  serializeReplay, verifyReplay, replayHash, projectClock, DuelState, Reject,
} from "../src/duel.mjs";
import { makeCounterPlugin, makeRacePlugin } from "../fixtures/counter-and-race.mjs";

const ALT_TC = { initialMs: 10_000, incrementMs: 500 };
const SIM_TC = { durationMs: 10_000 };

function live(plugin, tc = ALT_TC, now = 1000) {
  const duel = createDuel({
    duelId: "d1", plugin, players: ["alice", "bob"], seed: "s", timeControl: tc, now,
  });
  start(duel, now);
  return duel;
}

// ---------------------------------------------------------------------------

describe("plugin registration and contract enforcement", () => {
  test("a well-formed ALTERNATING plugin registers successfully", () => {
    const registry = new Map();
    registerPlugin(registry, makeCounterPlugin());
    assert.ok(registry.has("counter"));
  });

  test("a well-formed SIMULTANEOUS plugin registers successfully", () => {
    const registry = new Map();
    registerPlugin(registry, makeRacePlugin());
    assert.ok(registry.has("race"));
  });

  test("a plugin with no id is refused", () => {
    assert.throws(() => registerPlugin(new Map(), { version: 1 }), TypeError);
  });

  test("a non-integer version is refused", () => {
    const p = { ...makeCounterPlugin(), version: "1" };
    assert.throws(() => registerPlugin(new Map(), p), /version must be an integer/);
  });

  test("each required method is checked individually, and named in the error", () => {
    const required = ["createChallenge", "applyIntent", "evaluate", "score", "project", "fairPlaySignals", "serializeReplay"];
    for (const method of required) {
      const p = makeCounterPlugin();
      delete p[method];
      assert.throws(() => registerPlugin(new Map(), p), new RegExp(`missing ${method}\\(\\)`), `missing ${method}`);
    }
  });

  test("an unknown turnModel is refused", () => {
    const p = { ...makeCounterPlugin(), turnModel: "COOPERATIVE" };
    assert.throws(() => registerPlugin(new Map(), p), /unknown turnModel/);
  });

  test("a SIMULTANEOUS plugin without outcomeOnExpiry is refused", () => {
    const p = makeRacePlugin();
    delete p.outcomeOnExpiry;
    assert.throws(() => registerPlugin(new Map(), p), /must implement outcomeOnExpiry/);
  });

  test("an ALTERNATING plugin needs no outcomeOnExpiry at all", () => {
    const p = makeCounterPlugin();
    assert.equal(typeof p.outcomeOnExpiry, "undefined");
    assert.doesNotThrow(() => registerPlugin(new Map(), p));
  });

  test("registering the same plugin id twice is refused", () => {
    const registry = new Map();
    registerPlugin(registry, makeCounterPlugin());
    assert.throws(() => registerPlugin(registry, makeCounterPlugin()), /already registered/);
  });

  test("turnModel defaults to ALTERNATING when the plugin does not declare one", () => {
    const p = makeCounterPlugin();
    delete p.turnModel;
    const registry = new Map();
    assert.doesNotThrow(() => registerPlugin(registry, p));
  });
});

describe("createDuel and start: state transitions and clock models", () => {
  test("a duel must have exactly two players", () => {
    const plugin = makeCounterPlugin();
    assert.throws(() => createDuel({
      duelId: "d1", plugin, players: ["alice"], seed: "s", timeControl: ALT_TC, now: 0,
    }), /exactly two players/);
    assert.throws(() => createDuel({
      duelId: "d1", plugin, players: ["alice", "bob", "carol"], seed: "s", timeControl: ALT_TC, now: 0,
    }), /exactly two players/);
  });

  test("a fresh duel is READY, not LIVE, until start() is called", () => {
    const plugin = makeCounterPlugin();
    const duel = createDuel({ duelId: "d1", plugin, players: ["alice", "bob"], seed: "s", timeControl: ALT_TC, now: 0 });
    assert.equal(duel.status, DuelState.READY);
  });

  test("an ALTERNATING plugin gets a per-seat clock; a SIMULTANEOUS plugin gets a shared one", () => {
    const alt = createDuel({ duelId: "d1", plugin: makeCounterPlugin(), players: ["alice", "bob"], seed: "s", timeControl: ALT_TC, now: 0 });
    assert.equal(alt.clock.model, undefined);
    assert.deepEqual(alt.clock.remaining, [10_000, 10_000]);

    const sim = createDuel({ duelId: "d2", plugin: makeRacePlugin(), players: ["alice", "bob"], seed: "s", timeControl: SIM_TC, now: 0 });
    assert.equal(sim.clock.model, "SHARED");
    assert.equal(sim.clock.durationMs, 10_000);
  });

  test("a SIMULTANEOUS clock accepts either `durationMs` or an alternating-shaped `initialMs`", () => {
    const sim = createDuel({ duelId: "d2", plugin: makeRacePlugin(), players: ["alice", "bob"], seed: "s", timeControl: { initialMs: 20_000 }, now: 0 });
    assert.equal(sim.clock.durationMs, 20_000);
  });

  test("start() stamps the clock from the moment play ACTUALLY begins, not from creation time", () => {
    const duel = createDuel({ duelId: "d1", plugin: makeCounterPlugin(), players: ["alice", "bob"], seed: "s", timeControl: ALT_TC, now: 1000 });
    assert.equal(duel.clock.turnStartedAt, 1000);
    start(duel, 5000); // READY sat for a while before the game actually started
    assert.equal(duel.status, DuelState.LIVE);
    assert.equal(duel.clock.turnStartedAt, 5000, "re-stamped to the real start, not the creation time");
    assert.equal(duel.startedAt, 5000);
  });

  test("start() on a SIMULTANEOUS duel stamps clock.startedAt, not turnStartedAt", () => {
    const duel = createDuel({ duelId: "d1", plugin: makeRacePlugin(), players: ["alice", "bob"], seed: "s", timeControl: SIM_TC, now: 1000 });
    start(duel, 5000);
    assert.equal(duel.clock.startedAt, 5000);
    assert.equal(duel.clock.turnStartedAt, undefined);
  });
});

describe("runIntent: ALTERNATING state transitions", () => {
  test("an intent against a non-LIVE duel is refused, before anything else is checked", () => {
    const plugin = makeCounterPlugin();
    const duel = createDuel({ duelId: "d1", plugin, players: ["alice", "bob"], seed: "s", timeControl: ALT_TC, now: 0 });
    const res = runIntent(duel, plugin, { playerId: "alice", intent: 2 }, 100);
    assert.equal(res.ok, false);
    assert.equal(res.reason, Reject.NOT_LIVE);
    assert.equal(duel.events.length, 0, "nothing was appended");
  });

  test("a player not seated in the duel is refused as MALFORMED, not crash", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    const res = runIntent(duel, plugin, { playerId: "mallory", intent: 2 }, 2000);
    assert.equal(res.ok, false);
    assert.equal(res.reason, Reject.MALFORMED);
  });

  test("moving out of turn is refused", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    const res = runIntent(duel, plugin, { playerId: "bob", intent: 2 }, 2000); // alice (seat 0) is to move
    assert.equal(res.ok, false);
    assert.equal(res.reason, Reject.NOT_YOUR_TURN);
  });

  test("a malformed intent per the PLUGIN's own rules is refused with the plugin's reason, and nothing is appended", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    const res = runIntent(duel, plugin, { playerId: "alice", intent: 99 }, 2000); // out of the plugin's 1-3 range
    assert.equal(res.ok, false);
    assert.equal(res.reason, "MALFORMED");
    assert.equal(duel.events.length, 0);
    assert.equal(duel.state.total, 0, "state is untouched by a rejected intent");
  });

  test("a legal move appends INTENT_ACCEPTED plus every plugin event, advances the clock, and flips the turn", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin, ALT_TC, 1000);
    const res = runIntent(duel, plugin, { playerId: "alice", intent: 2 }, 3000); // 2s elapsed

    assert.equal(res.ok, true);
    assert.equal(duel.events.length, 2);
    assert.equal(duel.events[0].type, "INTENT_ACCEPTED");
    assert.equal(duel.events[1].type, "ADDED");
    assert.equal(duel.state.total, 2);
    assert.equal(duel.clock.toMove, 1, "turn passed to seat 1");
    assert.equal(duel.clock.remaining[0], 10_000 - 2000 + 500, "charged 2s, credited the increment");
    assert.equal(duel.clock.turnStartedAt, 3000);
  });

  test("the return value surfaces only the LAST event this intent produced -- the full log has all of them", () => {
    const plugin = makeCounterPlugin({ emitMilestones: true });
    const duel = live(plugin, ALT_TC, 1000);
    // alice plays 2, then bob plays 3 -- total reaches 5, a milestone.
    runIntent(duel, plugin, { playerId: "alice", intent: 2 }, 2000);
    const res = runIntent(duel, plugin, { playerId: "bob", intent: 3 }, 3000);

    assert.equal(res.ok, true);
    assert.equal(res.events.length, 1, "the immediate return is just the tail event");
    assert.equal(res.events[0].type, "MILESTONE");
    // But the full, durable log has EVERY event from both intents.
    assert.deepEqual(
      duel.events.map((e) => e.type),
      ["INTENT_ACCEPTED", "ADDED", "INTENT_ACCEPTED", "ADDED", "MILESTONE"]
    );
  });

  test("reaching the target ends the duel: COMPLETED, one DUEL_COMPLETED event, no further clock advance", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin, ALT_TC, 1000);
    runIntent(duel, plugin, { playerId: "alice", intent: 3 }, 2000);
    runIntent(duel, plugin, { playerId: "bob", intent: 3 }, 3000);
    runIntent(duel, plugin, { playerId: "alice", intent: 3 }, 4000); // total 9
    const res = runIntent(duel, plugin, { playerId: "bob", intent: 3 }, 5000); // total 12 -- bob crosses it

    assert.equal(res.ok, true);
    assert.equal(res.completed, true);
    assert.equal(duel.status, DuelState.COMPLETED);
    assert.equal(duel.outcome.result, "0-1", "bob (seat 1) made the winning move");
    assert.equal(duel.outcome.reason, "TARGET_REACHED");
    assert.equal(duel.events.at(-1).type, "DUEL_COMPLETED");
  });

  test("once COMPLETED, the duel structurally refuses any further intent -- this is what makes a stale or duplicate event harmless at the engine level", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin, ALT_TC, 1000);
    resign(duel, "alice", 2000);
    assert.equal(duel.status, DuelState.COMPLETED);
    const lengthBefore = duel.events.length;

    // A duplicate delivery of an already-processed intent, or one that
    // simply arrives late after the game ended, must land here.
    const res = runIntent(duel, plugin, { playerId: "bob", intent: 2 }, 3000);
    assert.equal(res.ok, false);
    assert.equal(res.reason, Reject.NOT_LIVE);
    assert.equal(duel.events.length, lengthBefore, "nothing new was appended");
    assert.equal(duel.outcome.reason, "RESIGNATION", "the original outcome is untouched");
  });
});

describe("runIntent: the clock is authoritative, and is checked before the move", () => {
  test("a move submitted after the mover's own clock has already run out never reaches the plugin -- it is a timeout, not a move", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin, { initialMs: 1000, incrementMs: 0 }, 0);
    // alice's 1000ms ran out; she "sends" a perfectly legal move anyway.
    const res = runIntent(duel, plugin, { playerId: "alice", intent: 2 }, 5000);

    assert.equal(res.completed, true);
    assert.equal(duel.outcome.reason, "TIMEOUT");
    assert.equal(duel.outcome.result, "0-1", "seat 0 (alice) flagged, seat 1 (bob) wins");
    assert.equal(duel.state.total, 0, "the plugin never saw this intent");
    assert.equal(duel.events.filter((e) => e.type === "ADDED").length, 0);
  });

  test("a move submitted with time to spare is unaffected by the flag check", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin, { initialMs: 10_000, incrementMs: 0 }, 0);
    const res = runIntent(duel, plugin, { playerId: "alice", intent: 2 }, 500);
    assert.equal(res.ok, true);
    assert.equal(duel.state.total, 2);
  });
});

describe("runIntent: SIMULTANEOUS has no turn order, only a shared deadline", () => {
  test("either seat may move at any time -- there is no NOT_YOUR_TURN for a SIMULTANEOUS plugin", () => {
    const plugin = makeRacePlugin();
    const duel = live(plugin, SIM_TC, 0);
    const bobFirst = runIntent(duel, plugin, { playerId: "bob", intent: { points: 3 } }, 100);
    assert.equal(bobFirst.ok, true);
    const aliceNext = runIntent(duel, plugin, { playerId: "alice", intent: { points: 2 } }, 200);
    assert.equal(aliceNext.ok, true);
    assert.deepEqual(duel.state.scores, [2, 3]);
  });

  test("an intent after the shared deadline never reaches the plugin -- it is scored via outcomeOnExpiry instead", () => {
    const plugin = makeRacePlugin();
    const duel = live(plugin, SIM_TC, 0);
    runIntent(duel, plugin, { playerId: "alice", intent: { points: 4 } }, 100);
    const res = runIntent(duel, plugin, { playerId: "bob", intent: { points: 5 } }, 20_000); // long past the 10s deadline

    assert.equal(res.completed, true);
    assert.equal(duel.outcome.reason, "TIME_EXPIRED");
    assert.deepEqual(duel.state.scores, [4, 0], "bob's late intent was never applied");
  });

  test("reaching the cap ends the duel via evaluate(), the same as a natural finish for any turn model", () => {
    const plugin = makeRacePlugin();
    const duel = live(plugin, SIM_TC, 0);
    runIntent(duel, plugin, { playerId: "alice", intent: { points: 5 } }, 100);
    runIntent(duel, plugin, { playerId: "alice", intent: { points: 5 } }, 200);
    const res = runIntent(duel, plugin, { playerId: "alice", intent: { points: 5 } }, 300); // 15, hits CAP
    assert.equal(res.completed, true);
    assert.equal(duel.outcome.reason, "CAP_REACHED");
    assert.equal(duel.outcome.result, "1-0");
  });
});

describe("resign", () => {
  test("resigning is refused on a non-LIVE duel", () => {
    const plugin = makeCounterPlugin();
    const duel = createDuel({ duelId: "d1", plugin, players: ["alice", "bob"], seed: "s", timeControl: ALT_TC, now: 0 });
    const res = resign(duel, "alice", 100);
    assert.equal(res.ok, false);
    assert.equal(res.reason, Reject.NOT_LIVE);
  });

  test("an unseated player cannot resign someone else's duel", () => {
    const duel = live(makeCounterPlugin());
    const res = resign(duel, "mallory", 2000);
    assert.equal(res.ok, false);
    assert.equal(res.reason, Reject.MALFORMED);
  });

  test("resigning is always legal regardless of the clock, and completes the duel immediately", () => {
    const duel = live(makeCounterPlugin(), { initialMs: 10_000 }, 0);
    const res = resign(duel, "alice", 1); // one millisecond in
    assert.equal(res.ok, true);
    assert.equal(res.completed, true);
    assert.equal(duel.outcome.result, "0-1", "seat 0 resigned; seat 1 wins");
    assert.equal(duel.outcome.reason, "RESIGNATION");
  });

  test("the non-mover resigning maps to the other result", () => {
    const duel = live(makeCounterPlugin());
    const res = resign(duel, "bob", 100);
    assert.equal(res.ok, true);
    assert.equal(duel.outcome.result, "1-0");
  });
});

describe("draw agreement -- a platform action, never derived by a plugin", () => {
  test("offering is refused on a non-LIVE duel", () => {
    const plugin = makeCounterPlugin();
    const duel = createDuel({ duelId: "d1", plugin, players: ["alice", "bob"], seed: "s", timeControl: ALT_TC, now: 0 });
    const res = offerDraw(duel, plugin, "alice", 100);
    assert.equal(res.ok, false);
    assert.equal(res.reason, Reject.NOT_LIVE);
  });

  test("an unseated player cannot offer a draw in someone else's duel", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    const res = offerDraw(duel, plugin, "mallory", 2000);
    assert.equal(res.ok, false);
    assert.equal(res.reason, Reject.MALFORMED);
  });

  test("a SIMULTANEOUS game refuses draw offers by default -- there is no natural moment to make or answer one", () => {
    const plugin = makeRacePlugin();
    const duel = live(plugin, SIM_TC);
    const res = offerDraw(duel, plugin, "alice", 100);
    assert.equal(res.ok, false);
    assert.equal(res.reason, "DRAWS_NOT_ALLOWED");
  });

  test("a plugin may opt a SIMULTANEOUS game back in by declaring allowsDrawOffers: true", () => {
    const plugin = { ...makeRacePlugin(), allowsDrawOffers: true };
    const duel = live(plugin, SIM_TC);
    const res = offerDraw(duel, plugin, "alice", 100);
    assert.equal(res.ok, true);
  });

  test("offering twice from the same seat without an intervening move is refused", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    assert.equal(offerDraw(duel, plugin, "alice", 100).ok, true);
    const second = offerDraw(duel, plugin, "alice", 200);
    assert.equal(second.ok, false);
    assert.equal(second.reason, "ALREADY_OFFERED");
  });

  test("acceptance by the offerer's own side is refused -- you cannot accept your own offer", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    offerDraw(duel, plugin, "alice", 100);
    const res = acceptDraw(duel, "alice", 200);
    assert.equal(res.ok, false);
    assert.equal(res.reason, "NO_OFFER");
  });

  test("declining without a standing offer is refused", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    const res = declineDraw(duel, "bob", 100);
    assert.equal(res.ok, false);
    assert.equal(res.reason, "NO_OFFER");
  });

  test("the opponent accepting ends the duel 1/2-1/2, DRAW_AGREED -- the one path to a draw no plugin ever derives", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    offerDraw(duel, plugin, "alice", 100);
    const res = acceptDraw(duel, "bob", 200);
    assert.equal(res.ok, true);
    assert.equal(res.completed, true);
    assert.equal(duel.outcome.result, "1/2-1/2");
    assert.equal(duel.outcome.reason, "DRAW_AGREED");
    assert.equal(duel.status, DuelState.COMPLETED);
  });

  test("the opponent declining leaves the duel LIVE and starts the offer cooldown for a re-offer", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    offerDraw(duel, plugin, "alice", 100);
    const declined = declineDraw(duel, "bob", 200);
    assert.equal(declined.ok, true);
    assert.equal(duel.status, DuelState.LIVE);
    assert.equal(duel.drawOfferBy, null);

    const tooSoon = offerDraw(duel, plugin, "alice", 300);
    assert.equal(tooSoon.ok, false);
    assert.equal(tooSoon.reason, "ON_COOLDOWN");

    const afterCooldown = offerDraw(duel, plugin, "alice", 200 + DRAW_OFFER_COOLDOWN_MS);
    assert.equal(afterCooldown.ok, true, "the cooldown must actually expire, not last forever");
  });

  test("a move clears a standing offer -- the board changed, so a stale offer is no longer meaningful", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    offerDraw(duel, plugin, "alice", 1100);
    assert.equal(duel.drawOfferBy, 0);
    runIntent(duel, plugin, { playerId: "alice", intent: 1 }, 1200);
    assert.equal(duel.drawOfferBy, null, "the offer must not survive a move");
    const res = acceptDraw(duel, "bob", 1300);
    assert.equal(res.ok, false);
    assert.equal(res.reason, "NO_OFFER", "there is nothing left to accept once the offer was cleared");
  });

  test("DRAW_OFFERED and DRAW_DECLINED are recorded on the event log", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    offerDraw(duel, plugin, "alice", 100);
    declineDraw(duel, "bob", 200);
    const types = duel.events.map((e) => e.type);
    assert.deepEqual(types, ["DRAW_OFFERED", "DRAW_DECLINED"]);
  });
});

describe("claimTimeout: the sweeper, no client message involved", () => {
  test("refuses cleanly, and is idempotent, when nobody has flagged", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin, { initialMs: 10_000 }, 0);
    const first = claimTimeout(duel, plugin, 1000);
    const second = claimTimeout(duel, plugin, 1000);
    assert.equal(first.ok, false);
    assert.equal(first.reason, "NOT_FLAGGED");
    assert.deepEqual(first, second);
    assert.equal(duel.status, DuelState.LIVE);
  });

  test("claims an ALTERNATING timeout once the time is actually up", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin, { initialMs: 1000 }, 0);
    const res = claimTimeout(duel, plugin, 5000);
    assert.equal(res.ok, true);
    assert.equal(res.completed, true);
    assert.equal(duel.outcome.reason, "TIMEOUT");
    assert.equal(duel.outcome.result, "0-1");
  });

  test("is refused on a non-LIVE duel", () => {
    const plugin = makeCounterPlugin();
    const duel = createDuel({ duelId: "d1", plugin, players: ["alice", "bob"], seed: "s", timeControl: ALT_TC, now: 0 });
    const res = claimTimeout(duel, plugin, 100);
    assert.equal(res.ok, false);
    assert.equal(res.reason, Reject.NOT_LIVE);
  });

  test("claims a SIMULTANEOUS expiry via outcomeOnExpiry, and refuses before the deadline", () => {
    const plugin = makeRacePlugin();
    const duel = live(plugin, SIM_TC, 0);
    assert.equal(claimTimeout(duel, plugin, 5000).ok, false);
    const res = claimTimeout(duel, plugin, 20_000);
    assert.equal(res.ok, true);
    assert.equal(duel.outcome.reason, "TIME_EXPIRED");
  });
});

describe("replay: serialization, hashing, and verification", () => {
  function play(plugin, tc, moves) {
    const duel = live(plugin, tc, 0);
    for (const [seat, intent, t] of moves) {
      const playerId = seat === 0 ? "alice" : "bob";
      const res = runIntent(duel, plugin, { playerId, intent }, t);
      assert.equal(res.ok, true, `move ${JSON.stringify(intent)} by seat ${seat} was rejected: ${res.reason}`);
    }
    return duel;
  }

  test("serializeReplay records only INTENT_ACCEPTED events as moves -- plugin-derived events are not independently replayed", () => {
    const plugin = makeCounterPlugin({ emitMilestones: true });
    const duel = play(plugin, ALT_TC, [[0, 2, 1000], [1, 3, 2000]]); // total reaches 5: a milestone fires too
    const replay = serializeReplay(duel, plugin);
    assert.equal(replay.moves.length, 2, "two moves, not two-plus-a-milestone");
    assert.deepEqual(replay.moves.map((m) => m.intent), [2, 3]);
  });

  test("a genuine replay verifies, and its derived outcome matches the recorded one", () => {
    const plugin = makeCounterPlugin();
    const duel = play(plugin, ALT_TC, [[0, 3, 1000], [1, 3, 2000], [0, 3, 3000], [1, 3, 4000]]); // 12, bob wins
    const replay = serializeReplay(duel, plugin);
    const result = verifyReplay(replay, plugin);
    assert.equal(result.valid, true);
    assert.equal(result.derived.result, duel.outcome.result);
    assert.equal(result.hash, replayHash(replay));
  });

  test("replayHash is deterministic regardless of the object's own key insertion order", () => {
    const plugin = makeCounterPlugin();
    const duel = play(plugin, ALT_TC, [[0, 2, 1000]]);
    resign(duel, "bob", 2000);
    const replay = serializeReplay(duel, plugin);
    const reordered = JSON.parse(JSON.stringify(replay, Object.keys(replay).sort().reverse()));
    // Rebuild with keys inserted in the OPPOSITE order from the original object.
    const shuffled = {};
    for (const k of [...Object.keys(replay)].reverse()) shuffled[k] = replay[k];
    assert.equal(replayHash(replay), replayHash(shuffled), "canonical() must not depend on insertion order");
  });

  test("a tampered seat is caught: replay says the wrong player made a move", () => {
    const plugin = makeCounterPlugin();
    const duel = play(plugin, ALT_TC, [[0, 2, 1000], [1, 3, 2000]]);
    const replay = serializeReplay(duel, plugin);
    replay.moves[1].seat = 0; // claim alice made bob's move
    const result = verifyReplay(replay, plugin);
    assert.equal(result.valid, false);
    assert.match(result.error, /wrong seat/);
  });

  test("a tampered, now-illegal intent is caught, and the error names the ply", () => {
    const plugin = makeCounterPlugin();
    const duel = play(plugin, ALT_TC, [[0, 2, 1000], [1, 3, 2000]]);
    const replay = serializeReplay(duel, plugin);
    replay.moves[0].intent = 99; // outside the plugin's legal range
    const result = verifyReplay(replay, plugin);
    assert.equal(result.valid, false);
    assert.match(result.error, /ply 1/);
  });

  test("a tampered claimed outcome is caught even though every move replays cleanly", () => {
    const plugin = makeCounterPlugin();
    const duel = play(plugin, ALT_TC, [[0, 3, 1000], [1, 3, 2000], [0, 3, 3000], [1, 3, 4000]]);
    const replay = serializeReplay(duel, plugin);
    replay.outcome = { result: "1-0", reason: "TARGET_REACHED" }; // the real result was 0-1
    const result = verifyReplay(replay, plugin);
    assert.equal(result.valid, false);
    assert.match(result.error, /outcome mismatch/);
  });

  test("a resignation's outcome is not position-derived, and is accepted as long as the moves themselves are legal", () => {
    const plugin = makeCounterPlugin();
    const duel = play(plugin, ALT_TC, [[0, 2, 1000]]);
    resign(duel, "bob", 2000);
    const replay = serializeReplay(duel, plugin);
    const result = verifyReplay(replay, plugin);
    assert.equal(result.valid, true);
    assert.equal(result.derived, null, "position alone does not determine a resignation");
  });

  test("a move time-travelled past the ALTERNATING clock is caught on replay", () => {
    const plugin = makeCounterPlugin();
    const duel = play(plugin, { initialMs: 10_000 }, [[0, 2, 1000]]);
    resign(duel, "bob", 2000);
    const replay = serializeReplay(duel, plugin);
    replay.moves[0].atMs = 999_999; // long past the clock's initial allowance
    const result = verifyReplay(replay, plugin);
    assert.equal(result.valid, false);
    assert.match(result.error, /flagged during replay/);
  });

  test("a SIMULTANEOUS move recorded after the shared deadline is caught on replay", () => {
    const plugin = makeRacePlugin();
    const duel = live(plugin, SIM_TC, 0);
    runIntent(duel, plugin, { playerId: "alice", intent: { points: 3 } }, 100);
    resign(duel, "bob", 200);
    const replay = serializeReplay(duel, plugin);
    replay.moves[0].atMs = 999_999;
    const result = verifyReplay(replay, plugin);
    assert.equal(result.valid, false);
    assert.match(result.error, /after the shared deadline/);
  });
});

describe("projectClock: display projection matches the model in use", () => {
  test("ALTERNATING projection reports remaining per seat and whose turn it is", () => {
    const duel = live(makeCounterPlugin(), { initialMs: 10_000 }, 0);
    const view = projectClock(duel, 3000);
    assert.equal(view.toMove, 0);
    assert.equal(view.remaining[0], 7000);
  });

  test("SIMULTANEOUS projection reports one shared remaining figure, model-tagged", () => {
    const duel = live(makeRacePlugin(), SIM_TC, 0);
    const view = projectClock(duel, 4000);
    assert.equal(view.model, "SHARED");
    assert.equal(view.remainingMs, 6000);
  });
});
