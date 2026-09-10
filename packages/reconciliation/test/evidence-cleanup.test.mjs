/**
 * Live evidence retention (runEvidenceCleanup): the approved rule is
 * "delete a completed duel's detailed action log once it has no further
 * business reason to exist" -- with a real exception for CASH duels (kept
 * for the SAME 24-hour window runReplayVerification() itself sweeps) and
 * for anything actually flagged (a funds hold, a recorded fair-play
 * signal), which is never auto-purged at all.
 *
 * What must survive every single case below, untouched: the `duel` row
 * itself (match, players, game, ruleset, result, game_hash) -- this sweep
 * only ever touches `duel_event`.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createReconciliationService } from "../src/reconcile.mjs";

async function fresh() {
  const db = await PGlite.create();
  await migrate(db);
  await db.query("INSERT INTO player (id, handle) VALUES ('white','white'), ('black','black')");
  return db;
}

async function seedDuel(db, id, {
  tier = "FREE", completedMinutesAgo = 30, fairplayHold = false, eventCount = 3,
} = {}) {
  await db.query(
    `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1, tier, stake_minor, asset,
                        initial_state, time_control, status, result, termination_reason, game_hash,
                        completed_at, fairplay_hold)
     VALUES ($1,'chess',1,$1,'white','black',$2::entry_tier,$3,$4,'{}'::jsonb,'{}'::jsonb,
             'COMPLETED','1-0','RESIGNATION','hash-${id}',
             now() - ($5 || ' minutes')::interval, $6)`,
    [id, tier, tier === "CASH" ? "1000000" : "0", tier === "CASH" ? "USDT" : null, String(completedMinutesAgo), fairplayHold]
  );
  for (let seq = 0; seq < eventCount; seq++) {
    await db.query(
      `INSERT INTO duel_event (duel_id, seq, type, payload, server_time_ms) VALUES ($1,$2,'INTENT_ACCEPTED','{}'::jsonb,$3)`,
      [id, seq, 1000 + seq]
    );
  }
}

async function eventCountFor(db, id) {
  const r = await db.query("SELECT count(*)::int c FROM duel_event WHERE duel_id=$1", [id]);
  return r.rows[0].c;
}

describe("FREE duels: a short grace, then gone", () => {
  test("a FREE duel completed well past the grace window loses its event log", async () => {
    const db = await fresh();
    await seedDuel(db, "free-old", { tier: "FREE", completedMinutesAgo: 30 });
    const svc = createReconciliationService(db);
    const result = await svc.runEvidenceCleanup({ freeGraceMinutes: 10 });
    assert.equal(result.checked, 1);
    assert.equal(await eventCountFor(db, "free-old"), 0);
  });

  test("a FREE duel still inside its grace window is left alone", async () => {
    const db = await fresh();
    await seedDuel(db, "free-fresh", { tier: "FREE", completedMinutesAgo: 2 });
    const svc = createReconciliationService(db);
    const result = await svc.runEvidenceCleanup({ freeGraceMinutes: 10 });
    assert.equal(result.checked, 0);
    assert.equal(await eventCountFor(db, "free-fresh"), 3);
  });
});

describe("CASH duels: the SAME 24-hour window runReplayVerification() itself uses", () => {
  test("a CASH duel completed 2 hours ago keeps its event log -- verification may still need it", async () => {
    const db = await fresh();
    await seedDuel(db, "cash-recent", { tier: "CASH", completedMinutesAgo: 120 });
    const svc = createReconciliationService(db);
    const result = await svc.runEvidenceCleanup();
    assert.equal(result.checked, 0);
    assert.equal(await eventCountFor(db, "cash-recent"), 3);
  });

  test("a CASH duel completed 25 hours ago -- past the verification window -- is purged", async () => {
    const db = await fresh();
    await seedDuel(db, "cash-old", { tier: "CASH", completedMinutesAgo: 25 * 60 });
    const svc = createReconciliationService(db);
    const result = await svc.runEvidenceCleanup();
    assert.equal(result.checked, 1);
    assert.equal(await eventCountFor(db, "cash-old"), 0);
  });

  test("a FREE duel and an old CASH duel in the SAME run each follow their own rule", async () => {
    const db = await fresh();
    await seedDuel(db, "mix-free", { tier: "FREE", completedMinutesAgo: 30 });
    await seedDuel(db, "mix-cash-recent", { tier: "CASH", completedMinutesAgo: 120 });
    await seedDuel(db, "mix-cash-old", { tier: "CASH", completedMinutesAgo: 25 * 60 });
    const svc = createReconciliationService(db);
    const result = await svc.runEvidenceCleanup({ freeGraceMinutes: 10 });
    assert.equal(result.checked, 2);
    assert.equal(await eventCountFor(db, "mix-free"), 0);
    assert.equal(await eventCountFor(db, "mix-cash-recent"), 3);
    assert.equal(await eventCountFor(db, "mix-cash-old"), 0);
  });
});

describe("flagged evidence is never auto-purged, regardless of age or tier", () => {
  test("an active fairplay_hold exempts a duel from the sweep entirely", async () => {
    const db = await fresh();
    await seedDuel(db, "held", { tier: "FREE", completedMinutesAgo: 999, fairplayHold: true });
    const svc = createReconciliationService(db);
    const result = await svc.runEvidenceCleanup({ freeGraceMinutes: 10 });
    assert.equal(result.checked, 0);
    assert.equal(await eventCountFor(db, "held"), 3);
  });

  test("a recorded fairplay_signal against the duel exempts it too, even old and FREE", async () => {
    const db = await fresh();
    await seedDuel(db, "flagged", { tier: "FREE", completedMinutesAgo: 999 });
    await db.query(
      `INSERT INTO fairplay_signal (player_id, duel_id, game_id, detector, detector_version, kind,
                                     strength, confidence, observed, baseline, explanation)
       VALUES ('white','flagged','chess','test.detector',1,'PROTOCOL_VIOLATION',1,1,'{}'::jsonb,'{}'::jsonb,
               'a sufficiently long explanation for the constraint')`
    );
    const svc = createReconciliationService(db);
    const result = await svc.runEvidenceCleanup({ freeGraceMinutes: 10 });
    assert.equal(result.checked, 0);
    assert.equal(await eventCountFor(db, "flagged"), 3);
  });

  test("once a hold is released, the SAME duel becomes eligible on the next run", async () => {
    const db = await fresh();
    await seedDuel(db, "released", { tier: "FREE", completedMinutesAgo: 999, fairplayHold: true });
    const svc = createReconciliationService(db);
    await svc.runEvidenceCleanup({ freeGraceMinutes: 10 });
    assert.equal(await eventCountFor(db, "released"), 3, "still held on the first run");

    await db.query("UPDATE duel SET fairplay_hold = FALSE WHERE id='released'");
    await svc.runEvidenceCleanup({ freeGraceMinutes: 10 });
    assert.equal(await eventCountFor(db, "released"), 0);
  });
});

describe("cleanup retry: safe, idempotent, and reports zero the second time", () => {
  test("running the sweep twice in a row purges once and reports nothing left the second time", async () => {
    const db = await fresh();
    await seedDuel(db, "retry-me", { tier: "FREE", completedMinutesAgo: 30 });
    const svc = createReconciliationService(db);

    const first = await svc.runEvidenceCleanup({ freeGraceMinutes: 10 });
    assert.equal(first.checked, 1);
    assert.equal(await eventCountFor(db, "retry-me"), 0);

    const second = await svc.runEvidenceCleanup({ freeGraceMinutes: 10 });
    assert.equal(second.checked, 0, "an already-purged duel must not be found again");
  });
});

describe("the permanent record is never touched", () => {
  test("after a purge, the duel row's own match/result/hash are exactly as they were", async () => {
    const db = await fresh();
    await seedDuel(db, "permanent", { tier: "FREE", completedMinutesAgo: 30 });
    const before = await db.query("SELECT * FROM duel WHERE id='permanent'");

    const svc = createReconciliationService(db);
    await svc.runEvidenceCleanup({ freeGraceMinutes: 10 });

    const after = await db.query("SELECT * FROM duel WHERE id='permanent'");
    assert.equal(after.rows[0].result, before.rows[0].result);
    assert.equal(after.rows[0].game_hash, before.rows[0].game_hash);
    assert.equal(after.rows[0].status, before.rows[0].status);
    assert.equal(after.rows[0].seat_0, before.rows[0].seat_0);
    assert.equal(after.rows[0].seat_1, before.rows[0].seat_1);
  });

  test("duel_event stays append-only for UPDATE even though the sweep may now DELETE it", async () => {
    const db = await fresh();
    await seedDuel(db, "immutable-check", { tier: "FREE", completedMinutesAgo: 1 });
    await assert.rejects(
      () => db.query("UPDATE duel_event SET type='TAMPERED' WHERE duel_id='immutable-check'"),
      /append-only/
    );
  });
});

describe("runAll includes evidence cleanup", () => {
  test("runAll's own check list runs EVIDENCE_CLEANUP without needing plugins", async () => {
    const db = await fresh();
    await seedDuel(db, "via-run-all", { tier: "FREE", completedMinutesAgo: 30 });
    const svc = createReconciliationService(db);
    const results = await svc.runAll();
    const cleanup = results.find((r) => r.kind === "EVIDENCE_CLEANUP");
    assert.ok(cleanup, "runAll must include the evidence cleanup check");
    assert.equal(cleanup.outcome, "COMPLETED");
  });
});
