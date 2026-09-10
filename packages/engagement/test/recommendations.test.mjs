import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { recommendGames, createRecommendationService, TREND_MIN_GAIN_X100 } from "../src/recommendations.mjs";
import { createMasteryService } from "../../mastery/src/service.mjs";

describe("recommendGames — pure", () => {
  test("no established games at all yields no recommendations -- nothing to base one on", () => {
    const recs = recommendGames({ mastery: [{ gameId: "chess", established: false, percentile: null }] });
    assert.deepEqual(recs, []);
  });

  test("strong at a STRATEGY game recommends another unplayed STRATEGY game", () => {
    const recs = recommendGames({
      mastery: [{ gameId: "checkers", established: true, percentile: 0.8, gamesPlayed: 50 }],
    });
    const gameIds = recs.map((r) => r.gameId);
    assert.ok(gameIds.includes("reversi") || gameIds.includes("gomoku") || gameIds.includes("chess"));
    assert.equal(recs[0].reasonKey, "strong_category");
    assert.equal(recs[0].reasonData.category, "STRATEGY");
  });

  test("an already-established game is never recommended again", () => {
    const recs = recommendGames({
      mastery: [
        { gameId: "checkers", established: true, percentile: 0.8, gamesPlayed: 50 },
        { gameId: "reversi", established: true, percentile: 0.6, gamesPlayed: 40 },
      ],
    });
    assert.ok(!recs.some((r) => r.gameId === "checkers" || r.gameId === "reversi"));
  });

  test("below-median skill in a game contributes nothing to its category's strength", () => {
    const recs = recommendGames({
      mastery: [{ gameId: "checkers", established: true, percentile: 0.3, gamesPlayed: 50 }],
    });
    assert.deepEqual(recs, []);
  });

  test("a trending (improving) game recommends a related unplayed game, prioritized over static strength", () => {
    const recs = recommendGames({
      mastery: [{ gameId: "checkers", established: true, percentile: 0.4, gamesPlayed: 20 }],
      trendingGameIds: ["checkers"],
    });
    assert.ok(recs.length > 0);
    assert.equal(recs[0].reasonKey, "improving_related");
    assert.equal(recs[0].reasonData.fromGame, "checkers");
  });

  test("respects the limit", () => {
    const recs = recommendGames(
      { mastery: [{ gameId: "chess", established: true, percentile: 0.9, gamesPlayed: 300 }] },
      { limit: 1 }
    );
    assert.equal(recs.length, 1);
  });

  test("never exposes anything beyond gameId/reasonKey/reasonData", () => {
    const recs = recommendGames({
      mastery: [{ gameId: "chess", established: true, percentile: 0.9, gamesPlayed: 300 }],
    });
    for (const r of recs) {
      assert.deepEqual(Object.keys(r).sort(), ["gameId", "reasonData", "reasonKey"]);
    }
  });
});

describe("createRecommendationService — trend detection against real rating history", () => {
  async function fresh() {
    const db = await PGlite.create();
    await migrate(db);
    await db.query("INSERT INTO player (id, handle) VALUES ('p1','player1'), ('opp','opponent')");
    const mastery = createMasteryService(db);
    const svc = createRecommendationService(db, mastery);
    return { db, svc };
  }

  let seq = 0;
  async function seedRatingChange(db, { gameId, before, after, atMinutesAgo }) {
    const duelId = `duel_rc_${seq++}`;
    await db.query(
      `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1, tier, stake_minor,
                          initial_state, time_control, status, result, termination_reason, completed_at)
       VALUES ($1,$2,1,$1,'p1','opp','FREE',0,'{}'::jsonb,'{}'::jsonb,'SETTLED','1-0','RESULT',now())`,
      [duelId, gameId]
    );
    await db.query(
      `INSERT INTO rating_change
         (duel_id, player_id, game_id, score, rating_before_x100, rating_after_x100,
          rd_before_x100, rd_after_x100, volatility_before_x1e6, volatility_after_x1e6, created_at)
       VALUES ($1,'p1',$2,1.0,$3,$4,20000,15000,60000,60000,
               now() - ($5 || ' minutes')::interval)`,
      [duelId, gameId, before, after, atMinutesAgo]
    );
  }

  test("fewer than TREND_WINDOW rating_change rows for a game never counts as trending", async () => {
    const { db, svc } = await fresh();
    for (let i = 0; i < 5; i++) {
      await seedRatingChange(db, { gameId: "chess", before: 150000 + i * 100, after: 150000 + (i + 1) * 100, atMinutesAgo: 50 - i });
    }
    const trending = await svc.trendingGamesFor("p1");
    assert.deepEqual(trending, []);
  });

  test("a modest gain under the bar is not flagged trending", async () => {
    const { db, svc } = await fresh();
    // 10 changes, each +100 (x100 units) -- 1000 total, well under the bar.
    let rating = 150000;
    for (let i = 0; i < 10; i++) {
      await seedRatingChange(db, { gameId: "chess", before: rating, after: rating + 100, atMinutesAgo: 10 - i });
      rating += 100;
    }
    const trending = await svc.trendingGamesFor("p1");
    assert.deepEqual(trending, []);
  });

  test("a real, sustained rating gain over the trend window is flagged trending", async () => {
    const { db, svc } = await fresh();
    let rating = 150000;
    const perStep = Math.ceil(TREND_MIN_GAIN_X100 / 9) + 10;
    for (let i = 0; i < 10; i++) {
      await seedRatingChange(db, { gameId: "chess", before: rating, after: rating + perStep, atMinutesAgo: 10 - i });
      rating += perStep;
    }
    const trending = await svc.trendingGamesFor("p1");
    assert.deepEqual(trending, ["chess"]);
  });
});
