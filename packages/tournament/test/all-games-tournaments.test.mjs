import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createTournamentService } from "../src/tournament.mjs";
import { createAutomatedTournamentEngine } from "../src/automated-engine.mjs";
import { createTournamentBotFiller } from "../src/bot-filler.mjs";

const ACTIVE_GAMES = [
  "chess", "dominoes", "backgammon", "speed-math", "xo",
  "connect-four", "checkers", "reversi", "gomoku", "seega"
];

describe("All 10 Games Tournaments Activation", () => {
  test("automated tournament engine spawns tournaments for all 10 active games and strictly excludes billiards", async () => {
    const db = await PGlite.create();
    await migrate(db);

    // Verify all 10 games have is_live, cash_enabled, and auto_tournaments_enabled
    const gamesRes = await db.query(
      "SELECT id, is_live, cash_enabled, auto_tournaments_enabled FROM game ORDER BY id ASC"
    );
    const gameMap = new Map(gamesRes.rows.map((g) => [g.id, g]));

    for (const gid of ACTIVE_GAMES) {
      const g = gameMap.get(gid);
      assert.ok(g, "game " + gid + " must exist in game table");
      assert.equal(g.is_live, true, gid + " is_live must be TRUE");
      assert.equal(g.cash_enabled, true, gid + " cash_enabled must be TRUE");
      assert.equal(g.auto_tournaments_enabled, true, gid + " auto_tournaments_enabled must be TRUE");
    }

    const billiards = gameMap.get("billiards");
    assert.equal(billiards, undefined, "billiards row must NOT exist in game table");

    const trn = createTournamentService(db);
    const engine = createAutomatedTournamentEngine(db, trn);

    // First tick: spawns tournaments across all 10 active games
    const tickRes = await engine.tick();
    assert.ok(tickRes.spawned.length >= 90, "expected at least 90 tournaments (9 tiers x 10 games), got " + tickRes.spawned.length);

    // Verify billiards has ZERO tournaments spawned
    const billTournaments = await db.query("SELECT count(*)::int c FROM tournament WHERE game_id = 'billiards'");
    assert.equal(billTournaments.rows[0].c, 0, "billiards must have 0 tournaments");

    // Verify every active game has an open FREE tournament and CASH tournaments
    for (const gid of ACTIVE_GAMES) {
      const freeT = await db.query(
        "SELECT id, status, tier, capacity FROM tournament WHERE game_id = $1 AND tier = 'FREE' AND status = 'REGISTRATION'",
        [gid]
      );
      assert.equal(freeT.rows.length, 1, "game " + gid + " must have 1 open FREE tournament");

      const cashT = await db.query(
        "SELECT count(*)::int c FROM tournament WHERE game_id = $1 AND tier = 'CASH' AND status = 'REGISTRATION'",
        [gid]
      );
      assert.equal(cashT.rows[0].c, 8, "game " + gid + " must have 8 open CASH tournaments ($10-$2000)");
    }

    // Test tournament bot filler fills seats
    const filler = createTournamentBotFiller(db, trn, {
      fillIntervalMs: 0,
      reservedSeats: 2,
      maxWaitMs: 600000,
    });
    const fillRes = await filler.tick();
    assert.ok(fillRes.filled > 0, "bot filler should have registered bots into open tournaments");
  });
});
