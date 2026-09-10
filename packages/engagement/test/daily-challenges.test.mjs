import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createDailyChallengeService } from "../src/daily-challenges.mjs";

async function fresh() {
  const db = await PGlite.create();
  await migrate(db);
  await db.query("INSERT INTO player (id, handle) VALUES ('p1','player1'), ('p2','player2')");
  const svc = createDailyChallengeService(db);
  return { db, svc };
}

let seq = 0;
async function makeDuel(db, {
  gameId = "chess", seat0 = "p1", seat1 = "p2", tier = "FREE", isVsComputer = false,
  result = "1-0", completedToday = true,
} = {}) {
  const id = `duel_dc_${seq++}`;
  await db.query(
    `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1, tier, stake_minor,
                        initial_state, time_control, status, result, termination_reason, completed_at,
                        is_vs_computer)
     VALUES ($1,$2,1,$1,$3,$4,$5,0,'{}'::jsonb,'{}'::jsonb,'SETTLED',$6,'RESULT',
             CASE WHEN $7 THEN now() ELSE now() - INTERVAL '2 days' END, $8)`,
    [id, gameId, seat0, seat1, tier, result, completedToday, isVsComputer]
  );
  return id;
}

async function makeRatingChange(db, { duelId, playerId = "p1", gameId = "chess" }) {
  await db.query(
    `INSERT INTO rating_change
       (duel_id, player_id, game_id, score, rating_before_x100, rating_after_x100,
        rd_before_x100, rd_after_x100, volatility_before_x1e6, volatility_after_x1e6)
     VALUES ($1,$2,$3,1.0,150000,150800,35000,34000,60000,60000)`,
    [duelId, playerId, gameId]
  );
}

describe("myChallenges — assignment", () => {
  test("the same five templates are assigned to every player, every day", async () => {
    const { svc } = await fresh();
    const rows = await svc.myChallenges("p1");
    assert.deepEqual(
      rows.map((r) => r.code).sort(),
      ["FINISH_TRAINING", "PLAY_DIFFERENT_GAMES", "PLAY_RATED_MATCH", "PLAY_SPEED_MATH", "WIN_FREE_MATCHES"]
    );
    for (const r of rows) assert.equal(r.completed, false);
  });

  test("calling it twice in the same day does not create a second assignment", async () => {
    const { db, svc } = await fresh();
    await svc.myChallenges("p1");
    await svc.myChallenges("p1");
    const count = await db.query(
      "SELECT count(*)::int c FROM daily_challenge_assignment WHERE player_id='p1'"
    );
    assert.equal(count.rows[0].c, 5);
  });
});

describe("myChallenges — real progress, no client-reported counts", () => {
  test("WIN_FREE_MATCHES counts only real, free-tier, non-training wins today", async () => {
    const { db, svc } = await fresh();
    await makeDuel(db, { seat0: "p1", seat1: "p2", tier: "FREE", result: "1-0" }); // p1 wins (seat_0 side)
    await makeDuel(db, { seat0: "p2", seat1: "p1", tier: "FREE", result: "1-0" }); // p1 loses (seat_1, opponent won)
    await makeDuel(db, { seat0: "p2", seat1: "p1", tier: "FREE", result: "0-1" }); // p1 wins (seat_1 side)
    await makeDuel(db, { seat0: "p1", seat1: "p2", tier: "FREE", isVsComputer: true, result: "1-0" }); // excluded: training
    await makeDuel(db, { seat0: "p1", seat1: "p2", tier: "FREE", result: "1-0", completedToday: false }); // excluded: not today

    const rows = await svc.myChallenges("p1");
    const win = rows.find((r) => r.code === "WIN_FREE_MATCHES");
    assert.equal(win.progress, 2);
    assert.equal(win.completed, false); // target is 3
  });

  test("crossing the target completes the challenge and grants EXP exactly once", async () => {
    const { db, svc } = await fresh();
    for (let i = 0; i < 3; i++) await makeDuel(db, { seat0: "p1", seat1: "p2", result: "1-0" });

    const rows = await svc.myChallenges("p1");
    const win = rows.find((r) => r.code === "WIN_FREE_MATCHES");
    assert.equal(win.progress, 3);
    assert.equal(win.completed, true);

    const exp = await db.query(
      "SELECT amount FROM exp_event WHERE player_id='p1' AND event_type='DAILY_CHALLENGE'"
    );
    assert.equal(exp.rows.length, 1);
    assert.equal(exp.rows[0].amount, 30);

    // A second read must not grant EXP again.
    await svc.myChallenges("p1");
    const exp2 = await db.query(
      "SELECT count(*)::int c FROM exp_event WHERE player_id='p1' AND event_type='DAILY_CHALLENGE'"
    );
    assert.equal(exp2.rows[0].c, 1);
  });

  test("PLAY_DIFFERENT_GAMES counts distinct games, not total duels", async () => {
    const { db, svc } = await fresh();
    await makeDuel(db, { gameId: "chess" });
    await makeDuel(db, { gameId: "chess" });
    const rows = await svc.myChallenges("p1");
    const distinct = rows.find((r) => r.code === "PLAY_DIFFERENT_GAMES");
    assert.equal(distinct.progress, 1);
  });

  test("PLAY_SPEED_MATH only counts speed-math duels", async () => {
    const { db, svc } = await fresh();
    await makeDuel(db, { gameId: "chess" });
    await makeDuel(db, { gameId: "speed-math" });
    const rows = await svc.myChallenges("p1");
    const sm = rows.find((r) => r.code === "PLAY_SPEED_MATH");
    assert.equal(sm.progress, 1);
  });

  test("FINISH_TRAINING only counts VS_COMPUTER duels", async () => {
    const { db, svc } = await fresh();
    await makeDuel(db, { isVsComputer: true });
    const rows = await svc.myChallenges("p1");
    const training = rows.find((r) => r.code === "FINISH_TRAINING");
    assert.equal(training.progress, 1);
    assert.equal(training.completed, true); // target is 1
  });

  test("PLAY_RATED_MATCH counts a distinct rated duel completed today, not every duel played", async () => {
    const { db, svc } = await fresh();
    const rated = await makeDuel(db);
    await makeRatingChange(db, { duelId: rated });
    await makeDuel(db); // a second, unrated duel today -- must not count

    const rows = await svc.myChallenges("p1");
    const played = rows.find((r) => r.code === "PLAY_RATED_MATCH");
    assert.equal(played.progress, 1);
    assert.equal(played.completed, true);
  });

  test("no daily challenge template ever requires a deposit, a stake, or CASH tier", async () => {
    const { db } = await fresh();
    const templates = await db.query("SELECT code FROM daily_challenge_template");
    assert.equal(templates.rows.length, 5);
    // Structural guarantee: the table has no column that could express a
    // deposit/stake requirement in the first place (see migration 0034).
    const cols = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='daily_challenge_template'"
    );
    const names = cols.rows.map((r) => r.column_name);
    assert.ok(!names.includes("entry_fee_minor"));
    assert.ok(!names.includes("stake_minor"));
  });
});
