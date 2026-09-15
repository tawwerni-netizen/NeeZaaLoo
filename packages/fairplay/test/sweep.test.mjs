/**
 * The Fair Play Sweep -- the missing step between real signals landing in
 * fairplay_signal (from real gameplay, via recordFromCompletedDuel etc. in
 * packages/realtime/src/gateway.mjs) and a human ever seeing a case. Before
 * this, engine.evaluate()/openCase() and the whole collusion detector were
 * exercised only by their own package's tests -- no production entrypoint
 * ever called them, so fairplay_case stayed empty regardless of how many
 * real signals piled up, and the admin Fair-Play Tribunal had nothing to
 * decide.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createFairPlayEngine } from "../src/engine.mjs";
import { createCollusionDetector } from "../src/collusion.mjs";
import { createFairPlaySweep } from "../src/sweep.mjs";

async function fresh(players = ["alice", "bob"]) {
  const db = await PGlite.create();
  await migrate(db);
  for (const p of players) {
    await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [p]);
  }
  const fp = createFairPlayEngine(db);
  const col = createCollusionDetector(db);
  const sweep = createFairPlaySweep(db, fp, col);
  return { db, fp, col, sweep };
}

const signal = (over = {}) => ({
  playerId: "alice", detector: "chess.move_time_uniformity", detectorVersion: 1,
  kind: "TIMING", strength: 0.8, confidence: 0.9,
  observed: { cv: 0.04 }, baseline: { expectedCvAbove: 0.15 },
  explanation: "Move times varied by only 4% of their mean across 40 moves, where human play normally varies far more.",
  ...over,
});

describe("sweepCases: turns scored signals into a real, reviewable case", () => {
  test("a player with strong corroborating signals and no existing case gets a case opened", async () => {
    const { db, fp, sweep } = await fresh();
    await fp.recordSignals([
      signal(),
      signal({ kind: "ACCURACY", detector: "chess.cpl", explanation: "Centipawn loss sat far below this player's established distribution across the game." }),
    ]);

    const result = await sweep.sweepCases();
    assert.equal(result.casesOpened, 1, JSON.stringify(result));

    const c = await db.query("SELECT category, status, player_id, risk_score FROM fairplay_case WHERE player_id='alice'");
    assert.equal(c.rows.length, 1);
    assert.equal(c.rows[0].status, "OPEN");
    assert.equal(c.rows[0].category, "ENGINE_ASSISTANCE", "TIMING is the top-contributing kind, which maps to ENGINE_ASSISTANCE");
    assert.ok(c.rows[0].risk_score > 60);
  });

  test("never auto-actions -- the sweep-opened case always starts OPEN with no decision", async () => {
    const { db, fp, sweep } = await fresh();
    await fp.recordSignals([signal(), signal({ kind: "AUTOMATION", detector: "bio" })]);
    await sweep.sweepCases();
    const c = await db.query("SELECT decision, auto_actioned, decided_by FROM fairplay_case WHERE player_id='alice'");
    assert.equal(c.rows[0].decision, null);
    assert.equal(c.rows[0].auto_actioned, false);
    assert.equal(c.rows[0].decided_by, null);
  });

  test("a weak, single signal below the review threshold opens nothing", async () => {
    const { db, fp, sweep } = await fresh();
    await fp.recordSignals([signal({ strength: 0.3, confidence: 0.3 })]);
    const result = await sweep.sweepCases();
    assert.equal(result.casesOpened, 0);
    const c = await db.query("SELECT count(*)::int n FROM fairplay_case");
    assert.equal(c.rows[0].n, 0);
  });

  test("a player who already has an OPEN case is not double-cased", async () => {
    const { db, fp, sweep } = await fresh();
    await fp.recordSignals([signal(), signal({ kind: "ACCURACY", detector: "chess.cpl", explanation: "corroborating accuracy finding, long enough to pass the explanation check" })]);
    await sweep.sweepCases();
    const first = await db.query("SELECT count(*)::int n FROM fairplay_case WHERE player_id='alice'");
    assert.equal(first.rows[0].n, 1);

    // More signals arrive for the same player while their case is still open.
    await fp.recordSignals([signal({ detector: "chess.move_time_uniformity.v2" })]);
    await sweep.sweepCases();
    const second = await db.query("SELECT count(*)::int n FROM fairplay_case WHERE player_id='alice'");
    assert.equal(second.rows[0].n, 1, "an open case already exists; the sweep must not open a second one");
  });
});

describe("sweepCollusion: pair-level signals actually reach fairplay_signal", () => {
  test("two accounts sharing a device fingerprint produce a DEVICE_RELATIONSHIP signal", async () => {
    const { db, sweep } = await fresh();
    await db.query(
      `INSERT INTO device (id, player_id, fingerprint, first_seen_at, last_seen_at) VALUES
       ('dev-alice','alice','fp-shared', now(), now()),
       ('dev-bob','bob','fp-shared', now(), now())`
    );

    const result = await sweep.sweepCollusion();
    assert.ok(result.signalsRecorded >= 1, JSON.stringify(result));

    const s = await db.query("SELECT kind FROM fairplay_signal WHERE kind='DEVICE_RELATIONSHIP'");
    assert.ok(s.rows.length >= 1, "a shared-device pair should produce at least one DEVICE_RELATIONSHIP signal");
  });

  test("a pair with no shared device and no material duel history produces nothing", async () => {
    const { sweep } = await fresh();
    const result = await sweep.sweepCollusion();
    assert.equal(result.signalsRecorded, 0);
  });
});
