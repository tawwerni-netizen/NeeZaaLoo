import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createTournamentService } from "../src/tournament.mjs";
import { createTournamentBotFiller } from "../src/bot-filler.mjs";

describe("Tournament Bot Filler", () => {
  async function setup() {
    const db = await PGlite.create();
    await migrate(db);
    const tournamentService = createTournamentService(db);
    return { db, tournamentService };
  }

  test("gradually registers eligible bots into open tournaments", async () => {
    const { db, tournamentService } = await setup();
    const created = await tournamentService.create({
      gameId: "chess",
      format: "SINGLE_ELIMINATION",
      tier: "FREE",
      capacity: 4,
      minPlayers: 4,
      timeControl: { initialSeconds: 180, incrementSeconds: 2 },
      registrationClosesAt: new Date(Date.now() + 3600000).toISOString(),
    });
    assert.equal(created.ok, true);
    await tournamentService.openRegistration(created.tournamentId);

    const filler = createTournamentBotFiller(db, tournamentService, {
      fillIntervalMs: 0,
      reservedSeats: 1, // Keep 1 seat for human
      maxWaitMs: 600000,
    });

    // 1st tick: registers 1st bot
    const t1 = await filler.tick();
    assert.equal(t1.filled, 1);

    // 2nd tick: registers 2nd bot
    const t2 = await filler.tick();
    assert.equal(t2.filled, 1);

    // 3rd tick: registers 3rd bot (total 3/4 = capacity - reservedSeats)
    const t3 = await filler.tick();
    assert.equal(t3.filled, 1);

    // 4th tick: stops because 3/4 spots filled and 1 seat is reserved for humans!
    const t4 = await filler.tick();
    assert.equal(t4.filled, 0, "must preserve 1 reserved seat for human players");

    const regs = await db.query(
      "SELECT player_id FROM tournament_registration WHERE tournament_id = $1",
      [created.tournamentId]
    );
    assert.equal(regs.rows.length, 3);
    assert.ok(regs.rows.every((r) => r.player_id.startsWith("bot_")));
  });

  test("fills final seats and starts when max wait time expires", async () => {
    const { db, tournamentService } = await setup();
    const created = await tournamentService.create({
      gameId: "chess",
      format: "SINGLE_ELIMINATION",
      tier: "FREE",
      capacity: 2,
      minPlayers: 2,
      timeControl: { initialSeconds: 180, incrementSeconds: 2 },
      registrationClosesAt: new Date(Date.now() + 3600000).toISOString(),
    });
    assert.equal(created.ok, true);
    await tournamentService.openRegistration(created.tournamentId);

    const filler = createTournamentBotFiller(db, tournamentService, {
      fillIntervalMs: 0,
      reservedSeats: 1,
      maxWaitMs: 0, // Timeout immediately to allow filling last seat
    });

    const t1 = await filler.tick();
    assert.equal(t1.filled, 1);

    const t2 = await filler.tick();
    assert.equal(t2.filled, 1);
    assert.equal(t2.started.length, 1, "starts the tournament when capacity reached");

    const tour = await db.query("SELECT status FROM tournament WHERE id = $1", [created.tournamentId]);
    assert.equal(tour.rows[0].status, "LIVE");
  });
});
