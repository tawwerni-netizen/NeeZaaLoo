import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createExpService } from "../../profile/src/exp.mjs";
import { createAchievementService } from "../../profile/src/achievements.mjs";
import { createBadgeService } from "../../profile/src/badges.mjs";
import { createProgressionService, DuelProgressionResult, TournamentProgressionResult } from "../src/service.mjs";

let db, exp, achievements, badges, progression;
let CLOCK = Date.now();

async function player(id) {
  await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [id]);
}

async function duel(id, seat0, seat1, { status = "LIVE", result = null, isVsComputer = false } = {}) {
  await db.query(
    `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1, tier, stake_minor, initial_state, time_control, status, result, termination_reason, completed_at, settled_at, is_vs_computer)
     VALUES ($1,'chess',1,$1,$2,$3,'FREE',0,'{}'::jsonb,'{}'::jsonb,$4::duel_status,$5::text,
             CASE WHEN $5::text IS NOT NULL THEN 'CHECKMATE' ELSE NULL END,
             CASE WHEN $4::duel_status IN ('COMPLETED','SETTLED') THEN now() ELSE NULL END,
             CASE WHEN $4::duel_status = 'SETTLED' THEN now() ELSE NULL END,
             $6)`,
    [id, seat0, seat1, status, result, isVsComputer]
  );
}

async function tournament(id, { status = "DRAFT" } = {}) {
  await db.query(
    `INSERT INTO tournament (id, game_id, format, status, capacity, time_control, registration_closes_at, completed_at)
     VALUES ($1,'chess','SINGLE_ELIMINATION',$2::tournament_status,4,'{}'::jsonb,now(),
             CASE WHEN $2 = 'COMPLETED' THEN now() ELSE NULL END)`,
    [id, status]
  );
}

async function tournamentSettlement(tournamentId, playerId, rank) {
  await db.query(
    `INSERT INTO tournament_settlement (tournament_id, player_id, rank, prize_minor) VALUES ($1,$2,$3,0)`,
    [tournamentId, playerId, rank]
  );
}

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  exp = createExpService(db, { now: () => CLOCK });
  achievements = createAchievementService(db, { now: () => CLOCK });
  badges = createBadgeService(db, { now: () => CLOCK });
  progression = createProgressionService(db, { exp, achievements, badges, now: () => CLOCK });
});

after(async () => { await db.close?.(); });

describe("processDuelCompletion -- source of truth", () => {
  test("a nonexistent duel is refused cleanly", async () => {
    const r = await progression.processDuelCompletion("no-such-duel");
    assert.equal(r.ok, false);
    assert.equal(r.reason, DuelProgressionResult.NOT_FOUND);
  });

  test("a LIVE duel is not eligible -- no progression from an in-progress game", async () => {
    await player("pd1a"); await player("pd1b");
    await duel("pd-duel1", "pd1a", "pd1b", { status: "LIVE" });
    const r = await progression.processDuelCompletion("pd-duel1");
    assert.equal(r.ok, false);
    assert.equal(r.reason, DuelProgressionResult.NOT_SETTLED);
    assert.equal(await exp.totalFor("pd1a"), 0);
  });

  test("a COMPLETED-but-not-yet-SETTLED duel is not eligible -- settlement must actually run first", async () => {
    await player("pd2a"); await player("pd2b");
    await duel("pd-duel2", "pd2a", "pd2b", { status: "COMPLETED", result: "1-0" });
    const r = await progression.processDuelCompletion("pd-duel2");
    assert.equal(r.ok, false);
    assert.equal(r.reason, DuelProgressionResult.NOT_SETTLED);
    assert.equal(r.status, "COMPLETED");
  });

  test("a VOIDED duel never grants progression -- the invalidated-result policy is structural, not a special case", async () => {
    await player("pd3a"); await player("pd3b");
    await duel("pd-duel3", "pd3a", "pd3b", { status: "VOIDED" });
    const r = await progression.processDuelCompletion("pd-duel3");
    assert.equal(r.ok, false);
    assert.equal(r.reason, DuelProgressionResult.NOT_SETTLED);
    assert.equal(await exp.totalFor("pd3a"), 0);
  });

  test("an ABORTED duel never grants progression", async () => {
    await player("pd4a"); await player("pd4b");
    await duel("pd-duel4", "pd4a", "pd4b", { status: "ABORTED" });
    const r = await progression.processDuelCompletion("pd-duel4");
    assert.equal(r.ok, false);
    assert.equal(r.reason, DuelProgressionResult.NOT_SETTLED);
  });
});

describe("processDuelCompletion -- a real SETTLED win", () => {
  test("both participants get GAME_COMPLETED; only the winner gets GAME_WON, FIRST_WIN, and its badge", async () => {
    await player("pw1a"); await player("pw1b");
    await duel("pd-win1", "pw1a", "pw1b", { status: "SETTLED", result: "1-0" });

    const r = await progression.processDuelCompletion("pd-win1");
    assert.equal(r.ok, true);
    assert.equal(r.alreadyProcessed, false);
    assert.deepEqual(r.awarded.completed.sort(), ["pw1a", "pw1b"]);
    assert.equal(r.awarded.won, "pw1a");
    assert.equal(r.awarded.firstWin, true);

    assert.equal(await exp.totalFor("pw1a"), 10 + 25); // GAME_COMPLETED + GAME_WON
    assert.equal(await exp.totalFor("pw1b"), 10);       // GAME_COMPLETED only

    const winnerAch = await achievements.listFor("pw1a");
    assert.ok(winnerAch.some((a) => a.achievement_code === "FIRST_WIN"));
    const loserAch = await achievements.listFor("pw1b");
    assert.equal(loserAch.length, 0);

    const winnerBadges = await badges.listFor("pw1a");
    assert.ok(winnerBadges.some((b) => b.badge_code === "FIRST_WIN" && b.source === "ACHIEVEMENT"));
  });

  test("seat_1 winning (result '0-1') correctly credits seat_1, not seat_0 -- the SAME expression rake.mjs uses", async () => {
    await player("pw2a"); await player("pw2b");
    await duel("pd-win2", "pw2a", "pw2b", { status: "SETTLED", result: "0-1" });
    const r = await progression.processDuelCompletion("pd-win2");
    assert.equal(r.awarded.won, "pw2b");
    assert.equal(await exp.totalFor("pw2b"), 35);
    assert.equal(await exp.totalFor("pw2a"), 10);
  });

  test("a draw grants GAME_COMPLETED to both, GAME_WON/FIRST_WIN to neither", async () => {
    await player("pd5a"); await player("pd5b");
    await duel("pd-draw1", "pd5a", "pd5b", { status: "SETTLED", result: "1/2-1/2" });
    const r = await progression.processDuelCompletion("pd-draw1");
    assert.equal(r.awarded.won, null);
    assert.equal(r.awarded.firstWin, false);
    assert.equal(await exp.totalFor("pd5a"), 10);
    assert.equal(await exp.totalFor("pd5b"), 10);
    assert.equal((await achievements.listFor("pd5a")).length, 0);
  });

  test("a SECOND win by the same player awards GAME_WON again but FIRST_WIN/badge only once", async () => {
    await player("pw3a"); await player("pw3b"); await player("pw3c");
    await duel("pd-win3a", "pw3a", "pw3b", { status: "SETTLED", result: "1-0" });
    await progression.processDuelCompletion("pd-win3a");
    await duel("pd-win3b", "pw3a", "pw3c", { status: "SETTLED", result: "1-0" });
    const r2 = await progression.processDuelCompletion("pd-win3b");
    assert.equal(r2.awarded.won, "pw3a");
    assert.equal(r2.awarded.firstWin, false, "FIRST_WIN must not fire a second time");
    assert.equal(await exp.totalFor("pw3a"), 10 + 25 + 10 + 25);
    const ach = await achievements.listFor("pw3a");
    assert.equal(ach.filter((a) => a.achievement_code === "FIRST_WIN").length, 1);
    const bdg = await badges.listFor("pw3a");
    assert.equal(bdg.filter((b) => b.badge_code === "FIRST_WIN").length, 1);
  });

  test("VS_COMPUTER awards nothing -- not EXP, not FIRST_WIN, not the badge -- even for a real settled win", async () => {
    await player("pvc1a"); await player("pvc1b");
    await duel("pd-vc1", "pvc1a", "pvc1b", { status: "SETTLED", result: "1-0", isVsComputer: true });
    const r = await progression.processDuelCompletion("pd-vc1");
    assert.equal(r.ok, true);
    assert.equal(r.vsComputer, true);
    assert.deepEqual(r.awarded, { completed: [], won: null, firstWin: false });
    assert.equal(await exp.totalFor("pvc1a"), 0);
    assert.equal(await exp.totalFor("pvc1b"), 0);
    assert.equal((await achievements.listFor("pvc1a")).length, 0);

    const row = await db.query("SELECT progression_processed_at FROM duel WHERE id='pd-vc1'");
    assert.ok(row.rows[0].progression_processed_at, "still stamped, so the sweep never revisits a VS_COMPUTER duel");
  });
});

describe("processDuelCompletion -- idempotency / retry", () => {
  test("processing the SAME settled duel twice awards nothing extra the second time", async () => {
    await player("pi1a"); await player("pi1b");
    await duel("pd-idem1", "pi1a", "pi1b", { status: "SETTLED", result: "1-0" });
    const first = await progression.processDuelCompletion("pd-idem1");
    assert.equal(first.alreadyProcessed, false);
    const totalAfterFirst = await exp.totalFor("pi1a");

    const second = await progression.processDuelCompletion("pd-idem1");
    assert.equal(second.ok, true);
    assert.equal(second.alreadyProcessed, true);
    assert.equal(await exp.totalFor("pi1a"), totalAfterFirst, "no duplicate EXP on a retried call");
  });

  test("progression_processed_at is stamped after a successful process, and stays stable across repeated calls", async () => {
    await player("pi2a"); await player("pi2b");
    await duel("pd-idem2", "pi2a", "pi2b", { status: "SETTLED", result: "1-0" });
    await progression.processDuelCompletion("pd-idem2");
    const row1 = await db.query("SELECT progression_processed_at FROM duel WHERE id='pd-idem2'");
    assert.ok(row1.rows[0].progression_processed_at);
    await progression.processDuelCompletion("pd-idem2");
    const row2 = await db.query("SELECT progression_processed_at FROM duel WHERE id='pd-idem2'");
    assert.equal(new Date(row1.rows[0].progression_processed_at).getTime(), new Date(row2.rows[0].progression_processed_at).getTime());
  });
});

describe("progressionDue -- the sweep", () => {
  test("processes every eligible SETTLED duel and skips ones already processed", async () => {
    await player("ps1a"); await player("ps1b"); await player("ps2a"); await player("ps2b");
    await duel("pd-sweep1", "ps1a", "ps1b", { status: "SETTLED", result: "1-0" });
    await duel("pd-sweep2", "ps2a", "ps2b", { status: "SETTLED", result: "0-1" });
    // Already processed before the sweep runs -- must be left alone.
    await duel("pd-sweep3", "ps1a", "ps2a", { status: "SETTLED", result: "1-0" });
    await progression.processDuelCompletion("pd-sweep3");
    const expBefore = await exp.totalFor("ps1a");

    const results = await progression.progressionDue({ limit: 10 });
    const ids = results.map((r) => r.duelId);
    assert.ok(ids.includes("pd-sweep1"));
    assert.ok(ids.includes("pd-sweep2"));
    // The SQL sweep itself filters on progression_processed_at IS NULL, so
    // an already-processed duel is never even SELECTED -- it must not
    // appear in the results at all, not merely show up marked "already".
    assert.ok(!ids.includes("pd-sweep3"), "an already-processed duel must not be re-selected by the sweep at all");
    assert.equal(await exp.totalFor("ps1a"), expBefore + 35, "ps1a's win in pd-sweep1 is newly processed; pd-sweep3 is not re-awarded");
  });

  test("a LIVE or COMPLETED-unsettled duel never appears in the sweep's results", async () => {
    await player("ps3a"); await player("ps3b");
    await duel("pd-sweep-live", "ps3a", "ps3b", { status: "LIVE" });
    const results = await progression.progressionDue({ limit: 100 });
    assert.ok(!results.some((r) => r.duelId === "pd-sweep-live"));
  });
});

describe("processTournamentCompletion", () => {
  test("a nonexistent tournament is refused cleanly", async () => {
    const r = await progression.processTournamentCompletion("no-such-tournament");
    assert.equal(r.ok, false);
    assert.equal(r.reason, TournamentProgressionResult.NOT_FOUND);
  });

  test("a tournament not yet COMPLETED is not eligible", async () => {
    await tournament("pt-1", { status: "IN_PROGRESS" });
    const r = await progression.processTournamentCompletion("pt-1");
    assert.equal(r.ok, false);
    assert.equal(r.reason, TournamentProgressionResult.NOT_ELIGIBLE);
  });

  test("a COMPLETED tournament whose prizes are not yet settled is not eligible", async () => {
    await tournament("pt-2", { status: "COMPLETED" });
    const r = await progression.processTournamentCompletion("pt-2");
    assert.equal(r.ok, false);
    assert.equal(r.reason, TournamentProgressionResult.NOT_ELIGIBLE);
    assert.equal(r.status, "PRIZES_UNSETTLED");
  });

  test("every ranked participant gets TOURNAMENT_PARTICIPATION and an attempt at FIRST_TOURNAMENT once prizes are settled", async () => {
    await player("tp1a"); await player("tp1b"); await player("tp1c");
    await tournament("pt-3", { status: "COMPLETED" });
    await tournamentSettlement("pt-3", "tp1a", 1);
    await tournamentSettlement("pt-3", "tp1b", 2);
    await tournamentSettlement("pt-3", "tp1c", 3);

    const r = await progression.processTournamentCompletion("pt-3");
    assert.equal(r.ok, true);
    assert.equal(r.alreadyProcessed, false);
    assert.deepEqual(r.awarded.participation.sort(), ["tp1a", "tp1b", "tp1c"]);
    assert.deepEqual(r.awarded.firstTournament.sort(), ["tp1a", "tp1b", "tp1c"], "every FIRST-time finisher, not just rank 1");

    for (const p of ["tp1a", "tp1b", "tp1c"]) {
      assert.equal(await exp.totalFor(p), 50);
      const ach = await achievements.listFor(p);
      assert.ok(ach.some((a) => a.achievement_code === "FIRST_TOURNAMENT"));
    }
  });

  test("processing the same tournament twice awards nothing extra", async () => {
    await player("tp2a"); await player("tp2b");
    await tournament("pt-4", { status: "COMPLETED" });
    await tournamentSettlement("pt-4", "tp2a", 1);
    await tournamentSettlement("pt-4", "tp2b", 2);
    await progression.processTournamentCompletion("pt-4");
    const before = await exp.totalFor("tp2a");
    const second = await progression.processTournamentCompletion("pt-4");
    assert.equal(second.alreadyProcessed, true);
    assert.equal(await exp.totalFor("tp2a"), before);
  });

  test("a SECOND tournament finish awards participation again but not a second FIRST_TOURNAMENT", async () => {
    await player("tp3a"); await player("tp3b");
    await tournament("pt-5", { status: "COMPLETED" });
    await tournamentSettlement("pt-5", "tp3a", 1);
    await tournamentSettlement("pt-5", "tp3b", 2);
    await progression.processTournamentCompletion("pt-5");

    await tournament("pt-6", { status: "COMPLETED" });
    await tournamentSettlement("pt-6", "tp3a", 1);
    await tournamentSettlement("pt-6", "tp3b", 2);
    const r2 = await progression.processTournamentCompletion("pt-6");
    assert.deepEqual(r2.awarded.firstTournament, []);
    assert.equal(await exp.totalFor("tp3a"), 100);
    const ach = await achievements.listFor("tp3a");
    assert.equal(ach.filter((a) => a.achievement_code === "FIRST_TOURNAMENT").length, 1);
  });
});

describe("tournamentProgressionDue -- the sweep", () => {
  test("processes every eligible tournament and skips ones without settled prizes or already processed", async () => {
    await player("tsw1a"); await player("tsw1b");
    await tournament("pt-sw1", { status: "COMPLETED" });
    await tournamentSettlement("pt-sw1", "tsw1a", 1);
    await tournamentSettlement("pt-sw1", "tsw1b", 2);

    await tournament("pt-sw2", { status: "COMPLETED" }); // no settlement rows yet

    const results = await progression.tournamentProgressionDue({ limit: 10 });
    const ids = results.map((r) => r.tournamentId);
    assert.ok(ids.includes("pt-sw1"));
    assert.ok(!ids.includes("pt-sw2"), "a tournament with unsettled prizes must not appear in the sweep at all");
  });
});
