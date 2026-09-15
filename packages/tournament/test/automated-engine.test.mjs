/**
 * The Automated Tournament Engine's game-eligibility gate.
 *
 * Until db/migrations/0053_game_auto_tournaments_column.sql, `game.
 * auto_tournaments_enabled` did not exist: this engine's own tick() query
 * against it always threw, and the catch block silently fell back to a
 * hardcoded five-game list -- spawning real cash tournaments regardless of
 * what an admin had actually set is_live/cash_enabled/auto_tournaments_enabled
 * to, and regardless of whether the admin panel that was supposed to control
 * this could even save (it couldn't -- same missing column, a 500 on every
 * toggle). This defends the fix: only a game with all three flags TRUE gets
 * a tournament spawned, and a genuine query error spawns nothing at all.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createTournamentService } from "../src/tournament.mjs";
import { createAutomatedTournamentEngine } from "../src/automated-engine.mjs";

async function fresh() {
  const db = await PGlite.create();
  await migrate(db);
  const trn = createTournamentService(db);
  const engine = createAutomatedTournamentEngine(db, trn);
  return { db, trn, engine };
}

describe("Automated Tournament Engine: game eligibility gate", () => {
  test("a game with auto_tournaments_enabled=FALSE (the real column default) gets nothing spawned", async () => {
    const { db, engine } = await fresh();
    // 'chess' is seeded live by 0003, but auto_tournaments_enabled defaults
    // FALSE and cash_enabled defaults FALSE -- exactly production's honest
    // starting state after the fix.
    const result = await engine.tick();
    assert.equal(result.spawned.length, 0, `expected nothing spawned, got ${JSON.stringify(result.spawned)}`);

    const tournaments = await db.query("SELECT count(*)::int c FROM tournament");
    assert.equal(tournaments.rows[0].c, 0, "no tournament rows should exist for a game with automation off");
  });

  test("a game with all three flags TRUE gets a FREE tier tournament spawned", async () => {
    const { db, engine } = await fresh();
    await db.query(
      "UPDATE game SET auto_tournaments_enabled = TRUE, is_live = TRUE, cash_enabled = TRUE WHERE id = 'chess'"
    );

    const result = await engine.tick();
    assert.ok(result.spawned.some((s) => s.gameId === "chess" && s.tier === 0),
      `expected a FREE ($0) chess tournament spawned, got ${JSON.stringify(result.spawned)}`);

    const t = await db.query("SELECT game_id, tier, status FROM tournament WHERE game_id = 'chess' AND entry_fee_minor = '0'");
    assert.equal(t.rows.length, 1);
    assert.equal(t.rows[0].tier, "FREE");
    assert.equal(t.rows[0].status, "REGISTRATION");
  });

  test("a game with cash_enabled=FALSE but auto_tournaments_enabled=TRUE still gets nothing (all three flags are required)", async () => {
    const { db, engine } = await fresh();
    await db.query(
      "UPDATE game SET auto_tournaments_enabled = TRUE, is_live = TRUE, cash_enabled = FALSE WHERE id = 'chess'"
    );
    const result = await engine.tick();
    assert.equal(result.spawned.length, 0, `expected nothing spawned while cash_enabled is FALSE, got ${JSON.stringify(result.spawned)}`);
  });

  test("a genuine query error fails CLOSED -- no hardcoded fallback game list", async () => {
    const { engine } = await fresh();
    const brokenDb = {
      query: async () => { throw new Error("simulated connection failure"); },
    };
    const brokenEngine = createAutomatedTournamentEngine(brokenDb, {});
    const result = await brokenEngine.tick();
    assert.equal(result.spawned.length, 0, "a DB error must never fall back to spawning tournaments for a hardcoded game list");
  });
});
