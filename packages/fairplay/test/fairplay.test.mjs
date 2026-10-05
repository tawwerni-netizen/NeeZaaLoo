/**
 * Fair Play and risk.
 *
 * The rule under test throughout: NEVER ONE SIGNAL = BAN. Most of these are
 * attempts to get a sanction without a human, to appeal to the person who
 * decided, or to record a score nobody can explain.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createFairPlayEngine, Sanction, AUTO_ACTIONABLE, STATISTICAL } from "../src/engine.mjs";
import { createCollusionDetector } from "../src/collusion.mjs";

const USDT = 1_000_000n;
const u = (n) => (BigInt(n) * USDT).toString();

async function fresh(players = ["alice", "bob"]) {
  const db = await PGlite.create();
  await migrate(db);
  for (const p of players) {
    await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [p]);
  }
  await db.query(
    `INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES
     ('mod-1','m1@n','Mod One',TRUE), ('mod-2','m2@n','Mod Two',TRUE)`
  );
  return { db, fp: createFairPlayEngine(db), col: createCollusionDetector(db) };
}

const signal = (over = {}) => ({
  playerId: "alice", detector: "chess.move_time_uniformity", detectorVersion: 1,
  kind: "TIMING", strength: 0.8, confidence: 0.9,
  observed: { cv: 0.04 }, baseline: { expectedCvAbove: 0.15 },
  explanation: "Move times varied by only 4% of their mean across 40 moves, where human play normally varies far more.",
  ...over,
});

// ---------------------------------------------------------------------------

describe("signals are evidence, never verdicts", () => {
  test("a signal requires a readable explanation", async () => {
    const { db } = await fresh();
    await assert.rejects(
      () => db.query(
        `INSERT INTO fairplay_signal (player_id, detector, detector_version, kind,
                                      strength, confidence, observed, baseline, explanation)
         VALUES ('alice','d',1,'TIMING',0.9,0.9,'{}'::jsonb,'{}'::jsonb,'bad')`
      ),
      /signal_has_explanation|violates check constraint/
    );
  });

  test("strength and confidence are bounded", async () => {
    const { db } = await fresh();
    await assert.rejects(
      () => db.query(
        `INSERT INTO fairplay_signal (player_id, detector, detector_version, kind,
                                      strength, confidence, observed, baseline, explanation)
         VALUES ('alice','d',1,'TIMING',1.5,0.9,'{}'::jsonb,'{}'::jsonb,
                 'a sufficiently long explanation for the constraint')`
      ),
      /signal_strength_range|violates check constraint/
    );
  });

  test("signals cannot be edited or deleted", async () => {
    const { db, fp } = await fresh();
    await fp.recordSignals([signal()]);
    await assert.rejects(() => db.query("UPDATE fairplay_signal SET strength=0.1"), /append-only/);
    await assert.rejects(() => db.query("DELETE FROM fairplay_signal"), /append-only/);
  });
});

describe("scoring is explainable and cannot reach certainty", () => {
  test("no signals means no score", async () => {
    const { fp } = await fresh();
    const r = await fp.score("alice");
    assert.equal(r.score, 0);
    assert.deepEqual(r.factors, []);
  });

  test("every factor carries the explanation a reviewer will read", async () => {
    const { fp } = await fresh();
    await fp.recordSignals([signal()]);
    const r = await fp.score("alice");
    assert.equal(r.factors.length, 1);
    assert.ok(r.factors[0].explanation.length > 20);
    assert.ok(r.factors[0].contribution > 0);
  });

  test("repeating ONE detector does not stack into certainty", async () => {
    // Ten timing readings are one kind of evidence seen ten times. Treating
    // them as ten independent findings is how a single flaky detector bans
    // somebody.
    const { fp } = await fresh();
    await fp.recordSignals(Array.from({ length: 10 }, () => signal()));
    const r = await fp.score("alice");
    assert.equal(r.factors.length, 1, "one kind, however many samples");
    assert.ok(r.score < 80, `one detector reached ${r.score}`);
  });

  test("independent kinds corroborate and raise the score", async () => {
    const { fp } = await fresh();
    await fp.recordSignals([
      signal(),
      signal({ kind: "ACCURACY", detector: "chess.cpl", strength: 0.7, confidence: 0.8,
        explanation: "Centipawn loss sat far below this player's established distribution across the game." }),
      signal({ kind: "DEVICE_RELATIONSHIP", detector: "graph", strength: 0.6, confidence: 0.9,
        explanation: "This account shares a device fingerprint with another account under review." }),
    ]);
    const r = await fp.score("alice");
    assert.equal(r.factors.length, 3);
    assert.ok(r.score > 90, `three independent kinds only reached ${r.score}`);
    assert.ok(r.score < 100, "no finite amount of evidence may reach certainty");
  });

  test("a wild reading from a low-confidence detector cannot dominate", async () => {
    const { fp } = await fresh();
    await fp.recordSignals([signal({ strength: 1.0, confidence: 0.05 })]);
    const r = await fp.score("alice");
    assert.ok(r.score <= 5, `low confidence should stay low, got ${r.score}`);
  });

  test("evaluate() recommends review and never a sanction", async () => {
    const { fp } = await fresh();
    await fp.recordSignals([signal(), signal({ kind: "AUTOMATION", detector: "bio" })]);
    const r = await fp.evaluate("alice");
    assert.equal(r.recommendation, "OPEN_CASE_FOR_REVIEW");
    assert.equal(r.sanction, null, "the engine never proposes a punishment");
  });

  test("a risk score with no factors cannot be stored", async () => {
    const { db } = await fresh();
    await assert.rejects(
      () => db.query(
        `INSERT INTO risk_score (player_id, dimension, score, factors)
         VALUES ('alice','ANTI_CHEAT',70,'[]'::jsonb)`
      ),
      /risk_score_explainable|violates check constraint/
    );
  });

  test("risk dimensions are separate", async () => {
    // A payment risk of 90 must not read as a cheating accusation.
    const { db, fp } = await fresh();
    await fp.saveRisk("alice", "PAYMENT", { score: 90, factors: [{ f: "new funding source" }] });
    await fp.saveRisk("alice", "ANTI_CHEAT", { score: 5, factors: [{ f: "nothing notable" }] });
    const r = await db.query(
      "SELECT dimension, score FROM risk_score WHERE player_id='alice' ORDER BY dimension"
    );
    assert.equal(r.rows.length, 2);
    assert.notEqual(r.rows[0].score, r.rows[1].score);
  });
});

describe("NEVER one signal = ban", () => {
  test("a statistical category cannot be auto-actioned", async () => {
    const { fp } = await fresh();
    await fp.recordSignals([signal()]);
    for (const category of [...STATISTICAL]) {
      const r = await fp.openCase({
        playerId: "alice", category, autoAction: Sanction.ACCOUNT_CLOSURE,
      });
      assert.equal(r.ok, false, `${category} must not be auto-actionable`);
      assert.equal(r.reason, "HUMAN_REQUIRED");
    }
  });

  test("the DATABASE refuses it too, if the service check were bypassed", async () => {
    const { db } = await fresh();
    await assert.rejects(
      () => db.query(
        `INSERT INTO fairplay_case (id, player_id, category, status, risk_score,
                                    auto_actioned, decision, decided_at, decision_note)
         VALUES ('c1','alice','ENGINE_ASSISTANCE','DECIDED',99,TRUE,
                 'ACCOUNT_CLOSURE', now(),'automatic')`
      ),
      /case_auto_action_only_for_certain_categories|violates check constraint/
    );
  });

  test("physically certain findings MAY be auto-actioned", async () => {
    // A response faster than human physiology permits is not a statistical
    // inference, and waiting for a reviewer to void it serves nobody.
    const { fp } = await fresh();
    const r = await fp.openCase({
      playerId: "alice", category: "IMPOSSIBLE_INPUT", autoAction: Sanction.DUEL_VOID,
    });
    assert.equal(r.ok, true);
    assert.equal(r.autoActioned, true);
  });

  test("the auto-actionable list is exactly three categories", async () => {
    assert.deepEqual([...AUTO_ACTIONABLE].sort(),
      ["CONFIRMED_SELF_PLAY", "IMPOSSIBLE_INPUT", "PROTOCOL_VIOLATION"]);
  });

  test("a high score alone sanctions nobody", async () => {
    const { db, fp } = await fresh();
    await fp.recordSignals([
      signal(), signal({ kind: "ACCURACY", detector: "cpl" }),
      signal({ kind: "PERFORMANCE_ANOMALY", detector: "rating" }),
    ]);
    const scored = await fp.evaluate("alice");
    assert.ok(scored.score > 90);
    await fp.openCase({ playerId: "alice", category: "ENGINE_ASSISTANCE", signalIds: scored.signalIds });
    const c = await db.query("SELECT status, decision FROM fairplay_case WHERE player_id='alice'");
    assert.equal(c.rows[0].status, "OPEN");
    assert.equal(c.rows[0].decision, null, "a 90+ score is a queue entry, not a punishment");
  });
});

describe("cases, evidence and decisions", () => {
  async function opened() {
    const { db, fp } = await fresh();
    await fp.recordSignals([signal(), signal({ kind: "ACCURACY", detector: "cpl" })]);
    const scored = await fp.evaluate("alice");
    const c = await fp.openCase({
      playerId: "alice", category: "ENGINE_ASSISTANCE",
      signalIds: scored.signalIds, holdFunds: true,
    });
    return { db, fp, caseId: c.caseId };
  }

  test("the evidence bundle is complete and reconstructible", async () => {
    const { fp, caseId } = await opened();
    const bundle = await fp.evidenceBundle(caseId);
    assert.equal(bundle.case.category, "ENGINE_ASSISTANCE");
    assert.equal(bundle.signals.length, 2);
    assert.ok(bundle.signals.every((s) => s.explanation.length > 20));
    assert.equal(bundle.events[0].event, "OPENED");
  });

  test("the evidence bundle cannot be altered after the fact", async () => {
    const { db, caseId } = await opened();
    await assert.rejects(
      () => db.query("DELETE FROM fairplay_case_signal WHERE case_id=$1", [caseId]),
      /append-only/
    );
  });

  test("a decision requires a named reviewer", async () => {
    const { fp, caseId } = await opened();
    assert.equal((await fp.decide({ caseId, adminId: null, sanction: Sanction.WARNING })).reason,
      "REVIEWER_REQUIRED");
  });

  test("a sanction requires a written reason", async () => {
    const { fp, caseId } = await opened();
    assert.equal(
      (await fp.decide({ caseId, adminId: "mod-1", sanction: Sanction.ACCOUNT_RESTRICTION, note: "  " })).reason,
      "NOTE_REQUIRED"
    );
  });

  test("a decided case cannot be decided again", async () => {
    const { fp, caseId } = await opened();
    await fp.decide({ caseId, adminId: "mod-1", sanction: Sanction.WARNING, note: "first offence" });
    assert.equal((await fp.decide({ caseId, adminId: "mod-2", sanction: Sanction.ACCOUNT_CLOSURE, note: "again" })).reason,
      "ALREADY_DECIDED");
  });

  test("funds are HELD during review, not confiscated", async () => {
    const { db, fp, caseId } = await opened();
    const held = await db.query("SELECT funds_held FROM fairplay_case WHERE id=$1", [caseId]);
    assert.equal(held.rows[0].funds_held, true);

    // Clearing the case releases the hold immediately.
    await fp.decide({ caseId, adminId: "mod-1", sanction: Sanction.NONE });
    const after = await db.query("SELECT funds_held, status FROM fairplay_case WHERE id=$1", [caseId]);
    assert.equal(after.rows[0].funds_held, false);
    assert.equal(after.rows[0].status, "CLOSED_NO_ACTION");
  });

  test("a hold stops settlement without touching the money", async () => {
    const { db, fp } = await fresh();
    await db.query(
      `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
                         tier, stake_minor, initial_state, time_control, status,
                         result, termination_reason, completed_at)
       VALUES ('d1','chess',1,'pk','alice','bob','FREE',0,'{}'::jsonb,'{}'::jsonb,
               'COMPLETED','1-0','CHECKMATE', now())`
    );
    await fp.openCase({ playerId: "alice", category: "ENGINE_ASSISTANCE", holdFunds: true });
    const d = await db.query("SELECT fairplay_hold, status FROM duel WHERE id='d1'");
    assert.equal(d.rows[0].fairplay_hold, true);
    assert.equal(d.rows[0].status, "COMPLETED", "completed, unpaid, and intact");
  });

  test("the case history cannot be rewritten", async () => {
    const { db, caseId } = await opened();
    await assert.rejects(
      () => db.query("UPDATE fairplay_case_event SET event='NOTHING_HAPPENED' WHERE case_id=$1", [caseId]),
      /append-only/
    );
  });
});

describe("appeals", () => {
  async function sanctioned() {
    const { db, fp } = await fresh();
    await fp.recordSignals([signal()]);
    const c = await fp.openCase({ playerId: "alice", category: "ENGINE_ASSISTANCE" });
    await fp.decide({
      caseId: c.caseId, adminId: "mod-1",
      sanction: Sanction.CASH_RESTRICTION, note: "engine correlation across 4 games",
    });
    return { db, fp, caseId: c.caseId };
  }

  test("a sanctioned player may appeal", async () => {
    const { fp, caseId } = await sanctioned();
    const a = await fp.appeal({ caseId, playerNote: "I was using an opening book from memory" });
    assert.equal(a.ok, true);
  });

  test("the admin who decided may NOT hear the appeal", async () => {
    // Otherwise "appeal" means "ask the same person again".
    const { fp, caseId } = await sanctioned();
    const a = await fp.appeal({ caseId });
    const r = await fp.decideAppeal({ appealId: a.appealId, adminId: "mod-1", upheld: true });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "REVIEWER_NOT_INDEPENDENT");
  });

  test("an independent reviewer may hear it, and reverse it", async () => {
    const { db, fp, caseId } = await sanctioned();
    const a = await fp.appeal({ caseId });
    const r = await fp.decideAppeal({
      appealId: a.appealId, adminId: "mod-2", upheld: true, note: "evidence too thin",
    });
    assert.equal(r.ok, true);
    const c = await db.query("SELECT status, decision FROM fairplay_case WHERE id=$1", [caseId]);
    assert.equal(c.rows[0].status, "APPEAL_DECIDED");
    assert.equal(c.rows[0].decision, "NONE", "every sanction is reversible");
  });

  test("a case can only be appealed once", async () => {
    const { fp, caseId } = await sanctioned();
    await fp.appeal({ caseId });
    await assert.rejects(() => fp.appeal({ caseId }), /duplicate key|appeal_one_per_case/)
      .catch(async () => {
        const second = await fp.appeal({ caseId });
        assert.equal(second.ok, false, "a second appeal must not open");
      });
  });

  test("an undecided case cannot be appealed", async () => {
    const { fp } = await fresh();
    const c = await fp.openCase({ playerId: "alice", category: "COLLUSION" });
    assert.equal((await fp.appeal({ caseId: c.caseId })).reason, "NOT_APPEALABLE");
  });
});

describe("collusion is a graph problem", () => {
  async function withDuels(db, pairs) {
    // A SETTLED cash duel must be able to show the money -- duel_settled_cash_has_ledger
    // refuses one that cannot. So the fixture posts a real (trivial) ledger
    // transaction and points every settlement at it, rather than faking the row.
    const tx = await db.query(
      `SELECT * FROM ledger_post('fixture-settlement','DUEL_SETTLE','SYSTEM',NULL,$1::jsonb)`,
      [JSON.stringify([
        { account: "platform:suspense", amount: "1" },
        { account: "platform:writeoff", amount: "-1" },
      ])]
    );
    const txId = tx.rows[0].transaction_id;

    let i = 0;
    for (const { a, b, result, stake = 10, settled = true } of pairs) {
      await db.query(
        `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
                           tier, stake_minor, asset, initial_state, time_control, status,
                           result, termination_reason, completed_at, settled_at,
                           settlement_tx_id, rake_minor, economy_rule_id, economy_rule_version)
         VALUES ($1,'chess',1,$1,$2,$3,'CASH',$4,'USDT','{}'::jsonb,'{}'::jsonb,
                 $5::duel_status,$6,'RESIGNATION', now(), now(), $7, 0, 'standard', 1)`,
        [`cd${i++}`, a, b, u(stake), settled ? "SETTLED" : "COMPLETED", result, txId]
      );
    }
  }

  test("shared devices become graph edges", async () => {
    const { db, col } = await fresh();
    await db.query(
      `INSERT INTO device (id, player_id, fingerprint) VALUES
       ('d1','alice','same'), ('d2','bob','same')`
    );
    assert.equal(await col.refreshDeviceLinks(), 1);
    const n = await col.neighbours("alice");
    assert.equal(n[0].other, "bob");
    assert.equal(n[0].link_type, "SHARED_DEVICE");
  });

  test("an edge is stored once, not twice with swapped endpoints", async () => {
    const { db } = await fresh();
    await assert.rejects(
      () => db.query(
        `INSERT INTO account_link (player_a, player_b, link_type, strength)
         VALUES ('bob','alice','SHARED_DEVICE',1.0)`
      ),
      /account_link_canonical_order|violates check constraint/
    );
  });

  test("a pair meeting far more than chance allows is measured, not guessed", async () => {
    const { db, col } = await fresh();
    await withDuels(db, Array.from({ length: 30 }, () => ({ a: "alice", b: "bob", result: "1-0" })));
    const r = await col.pairingAnomaly("alice", "bob", { poolSize: 200 });
    assert.equal(r.met, 30);
    assert.ok(r.ratio > 50, `expected a large ratio, got ${r.ratio}`);
    assert.ok(r.strength > 0.5);
    assert.ok(r.confidence > 0.5);
  });

  test("a handful of meetings is not an anomaly", async () => {
    const { db, col } = await fresh();
    await withDuels(db, Array.from({ length: 3 }, () => ({ a: "alice", b: "bob", result: "1-0" })));
    const r = await col.pairingAnomaly("alice", "bob", { poolSize: 200 });
    assert.equal(r.strength, 0, "too few opportunities to say anything");
  });

  test("persistent one-way value flow is detected", async () => {
    const { db, col } = await fresh();
    // Bob loses every single duel: chip dumping, not a rivalry.
    await withDuels(db, Array.from({ length: 20 }, () => ({ a: "alice", b: "bob", result: "1-0" })));
    const r = await col.valueFlowAnomaly("alice", "bob");
    assert.equal(r.duels, 20);
    assert.equal(r.directionality, 1, "every duel went the same way");
    assert.ok(r.strength > 0.9);
  });

  test("an even rivalry is NOT flagged", async () => {
    const { db, col } = await fresh();
    await withDuels(db, Array.from({ length: 20 }, (_, i) => ({
      a: "alice", b: "bob", result: i % 2 === 0 ? "1-0" : "0-1",
    })));
    const r = await col.valueFlowAnomaly("alice", "bob");
    assert.equal(r.directionality, 0, "two people who play each other a lot are not colluding");
    assert.equal(r.strength, 0);
  });

  test("the detector emits signals, never conclusions", async () => {
    const { db, col } = await fresh();
    await db.query(
      `INSERT INTO device (id, player_id, fingerprint) VALUES ('d1','alice','x'),('d2','bob','x')`
    );
    await col.refreshDeviceLinks();
    await withDuels(db, Array.from({ length: 20 }, () => ({ a: "alice", b: "bob", result: "1-0" })));

    const signals = await col.signalsForPair("alice", "bob", { poolSize: 200 });
    assert.ok(signals.length >= 3, `expected pairing + value flow + device, got ${signals.length}`);
    for (const s of signals) {
      assert.ok(s.explanation.length > 40, "a reviewer must be able to read it");
      for (const key of Object.keys(s)) {
        assert.ok(!/ban|verdict|guilty|sanction/i.test(key), `signal leaked a verdict field: ${key}`);
      }
    }
  });

  test("collusion signals feed the case system like any other", async () => {
    const { db, fp, col } = await fresh();
    await withDuels(db, Array.from({ length: 20 }, () => ({ a: "alice", b: "bob", result: "1-0" })));
    const signals = await col.signalsForPair("alice", "bob", { poolSize: 200 });
    await fp.recordSignals(signals);

    const scored = await fp.evaluate("alice");
    assert.ok(scored.score > 0);
    // And it still cannot be actioned without a person.
    const r = await fp.openCase({
      playerId: "alice", category: "COLLUSION", autoAction: Sanction.ACCOUNT_CLOSURE,
    });
    assert.equal(r.reason, "HUMAN_REQUIRED");
  });
});
