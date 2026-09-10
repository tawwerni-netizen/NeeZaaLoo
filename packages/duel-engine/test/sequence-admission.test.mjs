/**
 * Sequence admission (A5): nonce, state version, stale/duplicate/replay
 * rejection -- all at the engine level, independent of the wire protocol
 * or the gateway. Driven against the SAME fixture plugins duel.test.mjs
 * uses (deliberately not chess-shaped), so nothing here is an accident of
 * one particular game's own move shape.
 *
 * `baseVersion` is always read live from `duel.events.length`, never
 * hand-counted: the counter fixture's own applyIntent emits a plugin-level
 * "ADDED" event alongside the engine's own INTENT_ACCEPTED for every
 * accepted move, so ONE accepted intent advances the event count by TWO,
 * not one -- exactly the kind of per-plugin detail `version` (the real
 * event count) is meant to track honestly rather than a test guessing at.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createDuel, start, runIntent, Reject, DuelState, deriveSequenceState, deriveMoveTimes,
} from "../src/duel.mjs";
import { makeCounterPlugin, makeRacePlugin } from "../fixtures/counter-and-race.mjs";

const ALT_TC = { initialMs: 10_000, incrementMs: 500 };
const SIM_TC = { durationMs: 10_000 };

function live(plugin, tc = ALT_TC, now = 1000) {
  const duel = createDuel({ duelId: "d1", plugin, players: ["alice", "bob"], seed: "s", timeControl: tc, now });
  start(duel, now);
  return duel;
}

const acceptedCount = (duel) => duel.events.filter((e) => e.type === "INTENT_ACCEPTED").length;

describe("sequence admission is exempt when no nonce is supplied", () => {
  test("an internal call with no nonce is never subject to stale/duplicate/replay checks", () => {
    const duel = live(makeCounterPlugin());
    const a = runIntent(duel, makeCounterPlugin(), { playerId: "alice", intent: 1 }, 2000);
    assert.equal(a.ok, true);
    // The SAME intent, from the SAME seat, with no nonce at all -- would be
    // NOT_YOUR_TURN now (it's bob's turn), never a sequence rejection, since
    // omitting nonce exempts this call from sequence admission entirely.
    const b = runIntent(duel, makeCounterPlugin(), { playerId: "alice", intent: 1 }, 3000);
    assert.equal(b.ok, false);
    assert.equal(b.reason, Reject.NOT_YOUR_TURN);
  });
});

describe("a fresh nonce is accepted and advances the seat's own sequence", () => {
  test("nonce 1 is accepted as seat 0's first action; the duel's own seq tracks it", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    const res = runIntent(duel, plugin, { playerId: "alice", intent: 1, nonce: 1, baseVersion: 0 }, 2000);
    assert.equal(res.ok, true);
    assert.equal(duel.seq.lastNonce[0], 1);
    assert.deepEqual(duel.seq.lastIntent[0], 1);
  });

  test("each seat's nonce sequence is independent of the other's", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    runIntent(duel, plugin, { playerId: "alice", intent: 1, nonce: 1, baseVersion: 0 }, 2000);
    runIntent(duel, plugin, { playerId: "bob", intent: 1, nonce: 1, baseVersion: duel.events.length }, 2100);
    assert.equal(duel.seq.lastNonce[0], 1);
    assert.equal(duel.seq.lastNonce[1], 1);
  });
});

describe("STALE_VERSION: a baseVersion that disagrees with the duel's real event count", () => {
  test("a baseVersion ahead of or behind the truth is refused, and nothing is applied", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    const res = runIntent(duel, plugin, { playerId: "alice", intent: 1, nonce: 1, baseVersion: 5 }, 2000);
    assert.equal(res.ok, false);
    assert.equal(res.reason, Reject.STALE_VERSION);
    assert.equal(res.currentVersion, 0);
    assert.equal(duel.events.length, 0, "the stale-version action must not have been applied");
    assert.equal(duel.seq.lastNonce[0], 0, "the seat's own sequence must not have advanced");
  });

  test("omitting baseVersion skips this check entirely (still exempt-by-omission, same as nonce)", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    const res = runIntent(duel, plugin, { playerId: "alice", intent: 1, nonce: 1 }, 2000);
    assert.equal(res.ok, true);
  });
});

describe("STALE_ACTION: a nonce gap", () => {
  test("skipping ahead (nonce 3 when only nonce 1 has ever been accepted) is refused, not guessed at", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    runIntent(duel, plugin, { playerId: "alice", intent: 1, nonce: 1, baseVersion: 0 }, 2000);
    const res = runIntent(duel, plugin, { playerId: "bob", intent: 1, nonce: 3, baseVersion: duel.events.length }, 2100);
    assert.equal(res.ok, false);
    assert.equal(res.reason, Reject.STALE_ACTION);
  });
});

describe("DUPLICATE_ACTION: the exact same payload under the same, already-accepted nonce", () => {
  test("a duplicate is idempotent -- ok:true, duplicate:true, and applies nothing a second time", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    const first = runIntent(duel, plugin, { playerId: "alice", intent: 1, nonce: 1, baseVersion: 0 }, 2000);
    assert.equal(first.ok, true);
    const acceptedAfterFirst = acceptedCount(duel);

    // The retry deliberately still claims baseVersion 0 -- an honest
    // client that never saw its own first ack has NOTHING newer to base
    // it on, and a retry of an already-decided action must not be judged
    // against a board that has since moved on (see runIntent's own
    // comment on why nonce is checked before baseVersion).
    const retry = runIntent(duel, plugin, { playerId: "alice", intent: 1, nonce: 1, baseVersion: 0 }, 2050);
    assert.equal(retry.ok, true);
    assert.equal(retry.duplicate, true);
    assert.equal(acceptedCount(duel), acceptedAfterFirst, "a duplicate must never accept a second action");
  });

  test("a duplicate retry does not consume the opponent's turn or otherwise mutate state", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    runIntent(duel, plugin, { playerId: "alice", intent: 1, nonce: 1, baseVersion: 0 }, 2000);
    const stateAfterFirst = JSON.stringify(duel.state);
    const clockToMoveAfterFirst = duel.clock.toMove;
    runIntent(duel, plugin, { playerId: "alice", intent: 1, nonce: 1, baseVersion: 0 }, 2050);
    assert.equal(JSON.stringify(duel.state), stateAfterFirst);
    assert.equal(duel.clock.toMove, clockToMoveAfterFirst, "still bob's turn -- the duplicate did not hand it back");
  });
});

describe("REPLAYED_ACTION: forged or superseded frames", () => {
  test("reusing the last-accepted nonce with a DIFFERENT payload is a replay, not a duplicate", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    runIntent(duel, plugin, { playerId: "alice", intent: 1, nonce: 1, baseVersion: 0 }, 2000);
    const forged = runIntent(duel, plugin, { playerId: "alice", intent: 2, nonce: 1, baseVersion: 0 }, 2050);
    assert.equal(forged.ok, false);
    assert.equal(forged.reason, Reject.REPLAYED_ACTION);
  });

  test("a nonce from further back than the seat's last accepted action is always a replay", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    runIntent(duel, plugin, { playerId: "alice", intent: 1, nonce: 1, baseVersion: 0 }, 2000);
    runIntent(duel, plugin, { playerId: "bob", intent: 1, nonce: 1, baseVersion: duel.events.length }, 2100);
    runIntent(duel, plugin, { playerId: "alice", intent: 1, nonce: 2, baseVersion: duel.events.length }, 2200);
    // alice's nonce 1 has long since been superseded by her own nonce 2 --
    // baseVersion here is irrelevant (and deliberately stale/omitted-style
    // 0), since a nonce this old is refused before baseVersion is ever
    // consulted.
    const replay = runIntent(duel, plugin, { playerId: "alice", intent: 1, nonce: 1, baseVersion: 0 }, 9000);
    assert.equal(replay.ok, false);
    assert.equal(replay.reason, Reject.REPLAYED_ACTION);
  });

  test("a captured frame replayed after the duel has completed is refused as NOT_LIVE, not a sequence error", () => {
    // Status is checked before sequence admission -- a finished duel gives
    // an attacker nothing to replay a sequence NUMBER against at all.
    const plugin = makeRacePlugin();
    const duel = live(plugin, SIM_TC);
    duel.status = DuelState.COMPLETED;
    const res = runIntent(duel, plugin, { playerId: "alice", intent: 1, nonce: 1, baseVersion: 0 }, 20000);
    assert.equal(res.ok, false);
    assert.equal(res.reason, Reject.NOT_LIVE);
  });
});

describe("concurrent actions: synchronous application means only one of a racing pair ever wins", () => {
  test("two 'simultaneous' calls for the SAME nonce resolve to exactly one real acceptance", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    // Node is single-threaded and runIntent is synchronous, so there is no
    // real interleaving to force -- what this proves is that firing the
    // pair back-to-back (as two concurrent network arrivals would, from
    // the event loop's perspective) still yields exactly one acceptance
    // and one duplicate, never two applied moves.
    const results = [
      runIntent(duel, plugin, { playerId: "alice", intent: 1, nonce: 1, baseVersion: 0 }, 2000),
      runIntent(duel, plugin, { playerId: "alice", intent: 1, nonce: 1, baseVersion: 0 }, 2000),
    ];
    const applied = results.filter((r) => r.ok && !r.duplicate);
    const duplicates = results.filter((r) => r.ok && r.duplicate);
    assert.equal(applied.length, 1);
    assert.equal(duplicates.length, 1);
    assert.equal(acceptedCount(duel), 1, "exactly one INTENT_ACCEPTED, never two");
  });

  test("two racing DIFFERENT seats each land their own move -- no cross-seat interference", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    const a = runIntent(duel, plugin, { playerId: "alice", intent: 1, nonce: 1, baseVersion: 0 }, 2000);
    assert.equal(a.ok, true);
    const b = runIntent(duel, plugin, { playerId: "bob", intent: 1, nonce: 1, baseVersion: duel.events.length }, 2001);
    assert.equal(b.ok, true);
    assert.equal(acceptedCount(duel), 2);
  });
});

describe("deriveSequenceState: rebuilding admission state from the event log alone", () => {
  test("an empty log yields a clean [0,0] baseline", () => {
    assert.deepEqual(deriveSequenceState([]), { lastNonce: [0, 0], lastIntent: [null, null] });
  });

  test("re-derives the SAME state a live duel's own runIntent calls produced", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    runIntent(duel, plugin, { playerId: "alice", intent: 1, nonce: 1, baseVersion: 0 }, 2000);
    runIntent(duel, plugin, { playerId: "bob", intent: 1, nonce: 1, baseVersion: duel.events.length }, 2100);
    runIntent(duel, plugin, { playerId: "alice", intent: 1, nonce: 2, baseVersion: duel.events.length }, 2200);
    const rebuilt = deriveSequenceState(duel.events);
    assert.deepEqual(rebuilt, duel.seq);
  });

  test("non-accepted event types (DUEL_COMPLETED, DRAW_OFFERED) do not count toward a seat's nonce", () => {
    const events = [
      { type: "INTENT_ACCEPTED", payload: { seat: 0, intent: "x" } },
      { type: "DRAW_OFFERED", payload: { seat: 1 } },
      { type: "DUEL_COMPLETED", payload: { result: "1-0" } },
    ];
    assert.deepEqual(deriveSequenceState(events), { lastNonce: [1, 0], lastIntent: ["x", null] });
  });
});

describe("deriveMoveTimes: the raw material fairPlaySignals() needs", () => {
  test("a seat's Nth think-time is the gap since the PREVIOUS event, not since their own last move", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin, ALT_TC, 1000);
    runIntent(duel, plugin, { playerId: "alice", intent: 1 }, 1400); // alice: 400ms since start
    runIntent(duel, plugin, { playerId: "bob", intent: 1 }, 2600);   // bob: 1200ms since alice's last event
    runIntent(duel, plugin, { playerId: "alice", intent: 1 }, 2900); // alice: 300ms since bob's last event
    const times = deriveMoveTimes(duel);
    assert.deepEqual(times[0], [400, 300]);
    assert.deepEqual(times[1], [1200]);
  });

  test("an unstarted duel with no accepted events yields empty arrays for both seats", () => {
    const plugin = makeCounterPlugin();
    const duel = live(plugin);
    assert.deepEqual(deriveMoveTimes(duel), [[], []]);
  });
});
