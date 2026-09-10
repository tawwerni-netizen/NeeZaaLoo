/**
 * S0: wiring a completed duel's own fairPlaySignals() into the Fair Play
 * Engine, and the two admission-layer signals the realtime gateway feeds
 * it (a replayed action, a concurrently-occupied seat). All three reuse
 * the EXISTING recordSignals()/signal_kind machinery this package already
 * had -- nothing here is a second detection engine.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createFairPlayEngine, AUTO_ACTIONABLE } from "../src/engine.mjs";
import { createDuel, start, runIntent } from "../../duel-engine/src/duel.mjs";
import { makeCounterPlugin } from "../../duel-engine/fixtures/counter-and-race.mjs";

async function fresh() {
  const db = await PGlite.create();
  await migrate(db);
  for (const p of ["alice", "bob"]) {
    await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [p]);
  }
  await db.query(
    "INSERT INTO game (id, display_name, plugin_version, is_live, cash_enabled) VALUES ('counter','Counter',1,true,false)"
  );
  await db.query(
    `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1, tier, stake_minor,
                        initial_state, time_control, status)
     VALUES ('cd1','counter',1,'cd1','alice','bob','FREE',0,'{}'::jsonb,'{"initialMs":10000}'::jsonb,'LIVE')`
  );
  return { db, fp: createFairPlayEngine(db) };
}

function liveDuel({ fairPlaySignals } = {}) {
  const plugin = { ...makeCounterPlugin(), fairPlaySignals: fairPlaySignals ?? makeCounterPlugin().fairPlaySignals };
  const duel = createDuel({
    duelId: "cd1", plugin, players: ["alice", "bob"], seed: "s",
    timeControl: { initialMs: 10_000, incrementMs: 500 }, now: 1000,
  });
  start(duel, 1000);
  return { duel, plugin };
}

describe("recordFromCompletedDuel: the dormant per-plugin detector, finally called", () => {
  test("a duel with no outcome yet is a clean no-op", async () => {
    const { fp } = await fresh();
    const { duel, plugin } = liveDuel();
    const n = await fp.recordFromCompletedDuel(duel, plugin);
    assert.equal(n, 0);
  });

  test("a completed duel's plugin signals are recorded for the RIGHT player, duel and game", async () => {
    const { db, fp } = await fresh();
    const fairPlaySignals = (state, history = {}) => {
      // Only seat 0 ever gets flagged, so the test can prove the OTHER
      // seat's call really happened too (with an empty result) rather
      // than this being called once for the whole duel.
      if (history.seat !== 0) return [];
      return [{
        kind: "TIMING", strength: 0.9, confidence: 0.9,
        observedValue: { note: "test signal" }, baseline: {},
        explanation: "a sufficiently long, real explanation for the constraint",
        detectorVersion: 3,
      }];
    };
    const { duel, plugin } = liveDuel({ fairPlaySignals });
    // The counter fixture caps a single move at 3 -- reach the target of
    // 10 over four alternating moves rather than one oversized (and
    // therefore MALFORMED) one.
    runIntent(duel, plugin, { playerId: "alice", intent: 3 }, 2000); // 3
    runIntent(duel, plugin, { playerId: "bob", intent: 3 }, 2100);   // 6
    runIntent(duel, plugin, { playerId: "alice", intent: 3 }, 2200); // 9
    runIntent(duel, plugin, { playerId: "bob", intent: 1 }, 2300);   // 10 -- TARGET_REACHED
    assert.ok(duel.outcome, "the fixture must actually have completed for this test to mean anything");

    const n = await fp.recordFromCompletedDuel(duel, plugin);
    assert.equal(n, 1);

    const rows = await db.query("SELECT * FROM fairplay_signal WHERE duel_id='cd1'");
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].player_id, "alice");
    assert.equal(rows.rows[0].game_id, "counter");
    assert.equal(rows.rows[0].kind, "TIMING");
    assert.equal(rows.rows[0].detector_version, 3);
  });

  test("a plugin that produces nothing for either seat records nothing, without erroring", async () => {
    const { fp } = await fresh();
    const { duel, plugin } = liveDuel({ fairPlaySignals: () => [] });
    runIntent(duel, plugin, { playerId: "alice", intent: 5 }, 2000);
    runIntent(duel, plugin, { playerId: "bob", intent: 5 }, 2100);
    const n = await fp.recordFromCompletedDuel(duel, plugin);
    assert.equal(n, 0);
  });
});

describe("recordReplayedAction: the admission layer's own certain finding", () => {
  test("records a PROTOCOL_VIOLATION signal -- already an AUTO_ACTIONABLE category", async () => {
    const { db, fp } = await fresh();
    assert.ok(AUTO_ACTIONABLE.has("PROTOCOL_VIOLATION"));
    await fp.recordReplayedAction({ playerId: "alice", duelId: "cd1", gameId: "counter" });
    const rows = await db.query("SELECT * FROM fairplay_signal WHERE duel_id='cd1'");
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].kind, "PROTOCOL_VIOLATION");
    assert.equal(Number(rows.rows[0].strength), 1);
    assert.equal(Number(rows.rows[0].confidence), 1);
    assert.ok(rows.rows[0].explanation.length > 10);
  });
});

describe("recordConcurrentSeat: session binding's own moderate signal", () => {
  test("records an ACCOUNT_RELATIONSHIP signal, moderate strength -- never certain on its own", async () => {
    const { db, fp } = await fresh();
    await fp.recordConcurrentSeat({ playerId: "alice", duelId: "cd1", gameId: "counter", concurrentSessions: 2 });
    const rows = await db.query("SELECT * FROM fairplay_signal WHERE duel_id='cd1'");
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].kind, "ACCOUNT_RELATIONSHIP");
    assert.equal(rows.rows[0].observed.concurrentSessions, 2);
    assert.ok(Number(rows.rows[0].strength) < 1, "moderate, not certain");
  });

  test("a lone concurrent-seat signal never crosses the openCase threshold on its own", async () => {
    const { fp } = await fresh();
    await fp.recordConcurrentSeat({ playerId: "alice", duelId: "cd1", gameId: "counter", concurrentSessions: 2 });
    const evaluated = await fp.evaluate("alice");
    assert.equal(evaluated.recommendation, "NO_ACTION");
  });
});
