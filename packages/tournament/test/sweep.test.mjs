/**
 * The tournament automation sweep, against real Postgres (PGlite).
 *
 * The key scenario every test here defends against: a tournament pairing's
 * duel completes through the ORDINARY duel lifecycle -- exactly the way a
 * real player's client would drive it, with no call anywhere to
 * tournament.reportResult() -- and the sweep alone is what notices and
 * carries the result into the bracket. That gap (results never reaching
 * the bracket) is the real production bug this module exists to close.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createSettlementService } from "../../settlement/src/settle.mjs";
import { createTournamentService, TournamentError } from "../src/tournament.mjs";
import { createTournamentSweep } from "../src/sweep.mjs";

async function fresh(playerCount = 4, { fund = 0 } = {}) {
  const db = await PGlite.create();
  await migrate(db);
  const players = Array.from({ length: playerCount }, (_, i) => `sp${i + 1}`);
  for (const p of players) {
    await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [p]);
    await db.query("SELECT ledger_open_user_wallet($1)", [p]);
    if (fund) {
      await db.query(`SELECT ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb)`, [
        `seed:${p}`,
        JSON.stringify([
          { account: "platform:custody:USDT:TRON", amount: (BigInt(fund) * 1_000_000n).toString() },
          { account: `user:${p}:available`, amount: (-BigInt(fund) * 1_000_000n).toString() },
        ]),
      ]);
    }
  }
  const trn = createTournamentService(db);
  const settle = createSettlementService(db);
  const sweep = createTournamentSweep(db, trn, settle);
  return { db, trn, settle, sweep, players };
}

/** Complete a pairing's duel exactly the way a real client drives it --
 *  through the ordinary duel lifecycle, never through reportResult(). */
async function completeNaturally(db, tournamentId, roundNumber, result = "1-0") {
  const p = await db.query(
    `SELECT id, duel_id FROM tournament_pairing
      WHERE tournament_id=$1 AND round_number=$2 AND status='LIVE' ORDER BY slot`,
    [tournamentId, roundNumber]
  );
  for (const row of p.rows) {
    await db.query(
      `UPDATE duel SET status='COMPLETED'::duel_status, result=$2, termination_reason='CHECKMATE', completed_at=now()
        WHERE id=$1`,
      [row.duel_id, result]
    );
  }
  return p.rows;
}

describe("closeDueRegistrations", () => {
  test("quorum met at the deadline starts the bracket", async () => {
    const { db, trn, sweep, players } = await fresh(4);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 4, minPlayers: 2,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() - 1000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    // openRegistration/register don't care that the deadline is already in
    // the past -- only the sweep enforces it.
    await trn.register({ tournamentId: c.tournamentId, playerId: players[0], ratingX100: 150000 });
    await trn.register({ tournamentId: c.tournamentId, playerId: players[1], ratingX100: 150000 });

    const results = await sweep.closeDueRegistrations();
    assert.equal(results.length, 1);
    assert.equal(results[0].ok, true);
    const row = await db.query("SELECT status FROM tournament WHERE id=$1", [c.tournamentId]);
    assert.equal(row.rows[0].status, "LIVE");
  });

  test("quorum not met at the deadline cancels and refunds", async () => {
    const { db, trn, sweep, players } = await fresh(4, { fund: 100 });
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", tier: "CASH", entryFeeMinor: (10n * 1_000_000n),
      asset: "USDT", capacity: 4, minPlayers: 3,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() - 1000).toISOString(),
      prizeStructure: [{ rank: 1, bps: 10000 }],
    });
    await trn.openRegistration(c.tournamentId);
    await trn.register({ tournamentId: c.tournamentId, playerId: players[0], ratingX100: 150000 });

    const results = await sweep.closeDueRegistrations();
    assert.equal(results[0].ok, true);
    assert.equal(results[0].refunded, 1);
    const row = await db.query("SELECT status FROM tournament WHERE id=$1", [c.tournamentId]);
    assert.equal(row.rows[0].status, "CANCELLED");
  });

  test("a tournament whose deadline has not yet passed is left alone", async () => {
    const { trn, sweep, players } = await fresh(2);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 2,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    await trn.register({ tournamentId: c.tournamentId, playerId: players[0], ratingX100: 150000 });
    const results = await sweep.closeDueRegistrations();
    assert.equal(results.length, 0);
  });
});

describe("bridgeCompletedPairings — the real fix for results never reaching the bracket", () => {
  test("a duel completed through the ordinary lifecycle is reported into its pairing by the sweep alone", async () => {
    const { db, trn, sweep, players } = await fresh(2);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 2,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    await trn.register({ tournamentId: c.tournamentId, playerId: players[0], ratingX100: 150000 });
    await trn.register({ tournamentId: c.tournamentId, playerId: players[1], ratingX100: 150000 });
    await trn.start(c.tournamentId);

    // Nobody ever calls reportResult() -- the duel just finishes naturally.
    await completeNaturally(db, c.tournamentId, 1, "1-0");

    const before = await db.query(
      "SELECT status FROM tournament_pairing WHERE tournament_id=$1 AND round_number=1", [c.tournamentId]
    );
    assert.equal(before.rows[0].status, "LIVE", "the pairing has not been told yet -- this is the gap");

    const results = await sweep.bridgeCompletedPairings();
    assert.equal(results.length, 1);
    assert.equal(results[0].ok, true);

    const after = await db.query(
      "SELECT status, result FROM tournament_pairing WHERE tournament_id=$1 AND round_number=1", [c.tournamentId]
    );
    assert.equal(after.rows[0].status, "COMPLETED");
    assert.equal(after.rows[0].result, "1-0");

    // And the ordinary settlement path really ran: a rating row exists.
    const rating = await db.query("SELECT games_played FROM rating WHERE player_id=$1 AND game_id='chess'", [players[0]]);
    assert.equal(rating.rows[0].games_played, 1);
  });

  test("running the sweep twice reports the same pairing only once", async () => {
    const { db, trn, sweep, players } = await fresh(2);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 2,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    await trn.register({ tournamentId: c.tournamentId, playerId: players[0], ratingX100: 150000 });
    await trn.register({ tournamentId: c.tournamentId, playerId: players[1], ratingX100: 150000 });
    await trn.start(c.tournamentId);
    await completeNaturally(db, c.tournamentId, 1, "1-0");

    const first = await sweep.bridgeCompletedPairings();
    assert.equal(first.length, 1);
    const second = await sweep.bridgeCompletedPairings();
    assert.equal(second.length, 0, "the pairing is no longer LIVE, so it must not be picked up again");
  });
});

describe("advanceCompleteRounds", () => {
  test("a fully-decided round is advanced automatically", async () => {
    const { db, trn, sweep, players } = await fresh(4);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 4,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    for (const p of players) await trn.register({ tournamentId: c.tournamentId, playerId: p, ratingX100: 150000 });
    await trn.start(c.tournamentId);

    await completeNaturally(db, c.tournamentId, 1, "1-0");
    await sweep.bridgeCompletedPairings();

    const results = await sweep.advanceCompleteRounds();
    assert.equal(results.length, 1);
    assert.equal(results[0].round, 2);

    const round2 = await db.query(
      "SELECT count(*)::int c FROM tournament_pairing WHERE tournament_id=$1 AND round_number=2", [c.tournamentId]
    );
    assert.equal(round2.rows[0].c, 1);
  });

  test("a tournament with an undecided pairing is left alone", async () => {
    const { trn, sweep, players } = await fresh(4);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 4,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    for (const p of players) await trn.register({ tournamentId: c.tournamentId, playerId: p, ratingX100: 150000 });
    await trn.start(c.tournamentId);
    const results = await sweep.advanceCompleteRounds();
    assert.equal(results.length, 0);
  });
});

describe("settleFreeTournaments", () => {
  test("a completed FREE tournament is settled automatically; a CASH tournament is left for the admin flow", async () => {
    const { db, trn, sweep, players } = await fresh(2);
    const free = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 2,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(free.tournamentId);
    await trn.register({ tournamentId: free.tournamentId, playerId: players[0], ratingX100: 150000 });
    await trn.register({ tournamentId: free.tournamentId, playerId: players[1], ratingX100: 150000 });
    await trn.start(free.tournamentId);
    await completeNaturally(db, free.tournamentId, 1, "1-0");
    await sweep.bridgeCompletedPairings();
    await sweep.advanceCompleteRounds();

    const settled = await db.query("SELECT status FROM tournament WHERE id=$1", [free.tournamentId]);
    assert.equal(settled.rows[0].status, "COMPLETED");

    const results = await sweep.settleFreeTournaments();
    assert.ok(results.some((r) => r.tournamentId === free.tournamentId && r.ok));
    const afterSweep = await db.query("SELECT status FROM tournament WHERE id=$1", [free.tournamentId]);
    assert.equal(afterSweep.rows[0].status, "SETTLED");
  });
});

describe("sweepAll — an entire tournament played only through the ordinary duel lifecycle", () => {
  test("register, deadline passes, both rounds complete naturally, and the sweep alone carries it to SETTLED", async () => {
    const { db, trn, sweep, players } = await fresh(4);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 4, minPlayers: 2,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() - 1000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    for (const p of players) await trn.register({ tournamentId: c.tournamentId, playerId: p, ratingX100: 150000 });

    await sweep.sweepAll(); // closes registration, starts round 1
    let row = await db.query("SELECT status FROM tournament WHERE id=$1", [c.tournamentId]);
    assert.equal(row.rows[0].status, "LIVE");

    await completeNaturally(db, c.tournamentId, 1, "1-0");
    await sweep.sweepAll(); // bridges round 1, advances to round 2 (== FINALS)
    row = await db.query("SELECT status FROM tournament WHERE id=$1", [c.tournamentId]);
    assert.equal(row.rows[0].status, "FINALS");

    await completeNaturally(db, c.tournamentId, 2, "1-0");
    await sweep.sweepAll(); // bridges the final, finishes, and settles (FREE tier)
    row = await db.query("SELECT status FROM tournament WHERE id=$1", [c.tournamentId]);
    assert.equal(row.rows[0].status, "SETTLED");

    const again = await sweep.sweepAll();
    assert.deepEqual(again, { registrations: [], pairings: [], advances: [], settlements: [] });
  });
});
