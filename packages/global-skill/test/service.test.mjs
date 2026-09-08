/**
 * The Global Skill Score against real Postgres: the percentile view, and the
 * service that turns it into a score and a tier.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createGlobalSkillService } from "../src/service.mjs";

async function fresh() {
  const db = await PGlite.create();
  await migrate(db);
  await db.query(
    "INSERT INTO game (id, display_name, plugin_version, is_live) VALUES ('speed-math','Speed Math',1,TRUE)"
  );
  return { db, svc: createGlobalSkillService(db) };
}

async function setRating(db, playerId, gameId, { rating = 150000, rd = 8000, games = 30 } = {}) {
  await db.query("INSERT INTO player (id, handle) VALUES ($1,$1) ON CONFLICT DO NOTHING", [playerId]);
  await db.query(
    `INSERT INTO rating (player_id, game_id, rating_x100, rd_x100, games_played)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (player_id, game_id) DO UPDATE
       SET rating_x100=$3, rd_x100=$4, games_played=$5`,
    [playerId, gameId, rating, rd, games]
  );
}

// ---------------------------------------------------------------------------

describe("game_rating_percentile", () => {
  test("an unestablished rating (too few games) does not appear", async () => {
    const { db } = await fresh();
    await setRating(db, "alice", "chess", { games: 3 });      // below the 10-game bar
    const r = await db.query("SELECT * FROM game_rating_percentile WHERE player_id='alice'");
    assert.equal(r.rows.length, 0);
  });

  test("an unestablished rating (RD too high) does not appear", async () => {
    const { db } = await fresh();
    await setRating(db, "alice", "chess", { games: 50, rd: 20000 }); // RD too high
    const r = await db.query("SELECT * FROM game_rating_percentile WHERE player_id='alice'");
    assert.equal(r.rows.length, 0);
  });

  test("established ratings rank correctly against each other, within one game only", async () => {
    const { db } = await fresh();
    await setRating(db, "low", "chess", { rating: 130000, rd: 5000, games: 50 });
    await setRating(db, "mid", "chess", { rating: 150000, rd: 5000, games: 50 });
    await setRating(db, "high", "chess", { rating: 190000, rd: 5000, games: 50 });
    // A speed-math rating must not affect chess percentiles.
    await setRating(db, "high", "speed-math", { rating: 100000, rd: 5000, games: 50 });

    const r = await db.query(
      "SELECT player_id, percentile::float AS p FROM game_rating_percentile WHERE game_id='chess' ORDER BY p"
    );
    assert.deepEqual(r.rows.map((x) => x.player_id), ["low", "mid", "high"]);
    assert.equal(r.rows[0].p, 0, "the lowest established rating sits at percentile 0");
  });
});

describe("scoreFor", () => {
  test("a player with no established ratings has no score", async () => {
    const { svc } = await fresh();
    const r = await svc.scoreFor("nobody");
    assert.equal(r.score, null);
  });

  test("a player established in exactly one game scores from that game alone", async () => {
    const { db, svc } = await fresh();
    await setRating(db, "low", "chess", { rating: 130000, rd: 5000, games: 50 });
    await setRating(db, "alice", "chess", { rating: 190000, rd: 5000, games: 50 });
    const r = await svc.scoreFor("alice");
    assert.equal(r.breakdown.length, 1);
    assert.equal(r.appliedCap, false);
    assert.ok(r.score > 500, "alice is the top of a two-player field");
  });

  test("END TO END: dominance in one game cannot carry the whole score", async () => {
    const { db, svc } = await fresh();
    // A wide chess field, with alice at the very top.
    for (let i = 0; i < 9; i++) {
      await setRating(db, `fill${i}`, "chess", { rating: 100000 + i * 5000, rd: 5000, games: 50 });
    }
    // Deeply established: 300 games, RD near its floor -- a real fact about
    // her skill, not a lucky small sample.
    await setRating(db, "alice", "chess", { rating: 999999, rd: 3000, games: 300 });

    // Alice is also established, but only just, in three other games -- the
    // bare minimum (10 games, RD right at the 110.00 threshold). This is
    // what makes chess's raw weight genuinely dominant (roughly 60% of the
    // unnormalised mass) and is exactly the scenario the 35% cap exists for.
    for (const g of ["speed-math", "memory", "pattern"]) {
      await db.query(
        `INSERT INTO game (id, display_name, plugin_version, is_live) VALUES ($1,$1,1,TRUE)
         ON CONFLICT DO NOTHING`, [g]
      );
      // Fillers span 100000..140000; alice sits at 122000, genuinely
      // mid-pack (percentile ~0.56), not above the entire field.
      for (let i = 0; i < 9; i++) {
        await setRating(db, `${g}fill${i}`, g, { rating: 100000 + i * 5000, rd: 5000, games: 50 });
      }
      await setRating(db, "alice", g, { rating: 122000, rd: 11000, games: 10 }); // just barely established
    }

    const r = await svc.scoreFor("alice");
    assert.equal(r.breakdown.length, 4);
    const chess = r.breakdown.find((b) => b.gameId === "chess");
    assert.equal(chess.percentile, 1, "alice really is the best chess player in the field");
    assert.equal(chess.wasCapped, true);
    assert.ok(chess.weightPct <= 35.5,
      `chess drove ${chess.weightPct}% of the score -- the cap did not hold`);
    assert.ok(r.score < 800,
      `score was ${r.score}: being #1 at one game of four should not approach a perfect score`);
  });
});

describe("leaderboard and tiers", () => {
  test("players are ranked and tiered against each other, not against a fixed scale", async () => {
    const { db, svc } = await fresh();
    for (let i = 0; i < 20; i++) {
      await setRating(db, `ply${i}`, "chess", { rating: 100000 + i * 10000, rd: 5000, games: 50 });
    }
    const board = await svc.leaderboard();
    assert.equal(board.length, 20);
    assert.equal(board[0].playerId, "ply19", "the top-rated player leads the board");
    assert.equal(board[0].tier, "Grandmaster");
    assert.equal(board[board.length - 1].tier, "Bronze");
    // Monotonic: the board is sorted by score, descending.
    for (let i = 1; i < board.length; i++) {
      assert.ok(board[i - 1].score >= board[i].score);
    }
  });

  test("a player who has never established a rating does not appear on the leaderboard at all", async () => {
    const { db, svc } = await fresh();
    await setRating(db, "established", "chess", { rating: 150000, rd: 5000, games: 50 });
    await setRating(db, "green", "chess", { rating: 150000, rd: 30000, games: 2 });
    const board = await svc.leaderboard();
    assert.equal(board.length, 1);
    assert.equal(board[0].playerId, "established");
  });

  test("tierFor answers for a single player without recomputing the whole board by hand", async () => {
    const { db, svc } = await fresh();
    for (let i = 0; i < 10; i++) {
      await setRating(db, `ply${i}`, "chess", { rating: 100000 + i * 10000, rd: 5000, games: 50 });
    }
    const t = await svc.tierFor("ply9");
    assert.equal(t.tier, "Grandmaster");
    assert.ok(t.breakdown.length >= 1);
  });
});
