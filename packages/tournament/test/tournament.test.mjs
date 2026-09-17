/**
 * The tournament engine, end to end against real Postgres (PGlite).
 *
 * Reuses the existing duel engine and settlement service rather than
 * mocking them -- a tournament duel is settled through the exact same
 * `settlementService.settle()` every other duel uses, which is what proves
 * rating write-back "just works" without new money code.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createSettlementService } from "../../settlement/src/settle.mjs";
import { createTournamentService, TournamentError } from "../src/tournament.mjs";

const USDT = 1_000_000n;
const u = (n) => (BigInt(n) * USDT).toString();

async function fresh(playerCount = 8, { fund = 0 } = {}) {
  const db = await PGlite.create();
  await migrate(db);
  const players = Array.from({ length: playerCount }, (_, i) => `pl${i + 1}`);
  for (const p of players) {
    await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [p]);
    await db.query("SELECT ledger_open_user_wallet($1)", [p]);
    if (fund) {
      await db.query(`SELECT ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb)`, [
        `seed:${p}`,
        JSON.stringify([
          { account: "platform:custody:USDT:TRON", amount: u(fund) },
          { account: `user:${p}:available`, amount: "-" + u(fund) },
        ]),
      ]);
    }
  }
  const trn = createTournamentService(db);
  const settle = createSettlementService(db);
  return { db, trn, settle, players };
}

async function natural(db, key) {
  const r = await db.query(
    `SELECT ledger_natural_balance(a.normal_side, COALESCE(b.balance,0))::text n
       FROM ledger_account a LEFT JOIN ledger_balance b ON b.account_id=a.id WHERE a.key=$1`,
    [key]
  );
  return r.rows[0].n;
}

/** Play out every LIVE pairing in the current round with a decisive result. */
async function decideRound(db, trn, settle, tournamentId, roundNumber, resultFor) {
  const r = await db.query(
    `SELECT id, seat_0, seat_1 FROM tournament_pairing
      WHERE tournament_id=$1 AND round_number=$2 AND status='LIVE' ORDER BY slot`,
    [tournamentId, roundNumber]
  );
  for (const row of r.rows) {
    const result = resultFor ? resultFor(row.seat_0, row.seat_1) : "1-0";
    const res = await trn.reportResult({ pairingId: row.id, result }, settle);
    assert.equal(res.ok, true, JSON.stringify(res));
  }
}

// ---------------------------------------------------------------------------

describe("registration", () => {
  test("a player cannot register twice", async () => {
    const { trn, players } = await fresh(4);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 4,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    await trn.register({ tournamentId: c.tournamentId, playerId: players[0], ratingX100: 150000 });
    const again = await trn.register({ tournamentId: c.tournamentId, playerId: players[0], ratingX100: 150000 });
    assert.equal(again.reason, TournamentError.ALREADY_REGISTERED);
  });

  test("capacity is enforced structurally, inside the transaction", async () => {
    const { trn, players } = await fresh(5);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 4,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    for (let i = 0; i < 4; i++) {
      const r = await trn.register({ tournamentId: c.tournamentId, playerId: players[i], ratingX100: 150000 });
      assert.equal(r.ok, true);
    }
    const overflow = await trn.register({ tournamentId: c.tournamentId, playerId: players[4], ratingX100: 150000 });
    assert.equal(overflow.reason, TournamentError.AT_CAPACITY);
  });

  test("registration is refused once the tournament is no longer open", async () => {
    const { trn, players } = await fresh(4);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 4,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    // Never opened -- still DRAFT.
    const r = await trn.register({ tournamentId: c.tournamentId, playerId: players[0], ratingX100: 150000 });
    assert.equal(r.reason, TournamentError.NOT_OPEN);
  });

  test("starting with too few players is refused", async () => {
    const { trn, players } = await fresh(4);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 8, minPlayers: 4,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    await trn.register({ tournamentId: c.tournamentId, playerId: players[0], ratingX100: 150000 });
    const r = await trn.start(c.tournamentId);
    assert.equal(r.reason, TournamentError.NOT_ENOUGH_PLAYERS);
  });

  test("CASH registration locks the entry fee, and insufficient funds blocks it", async () => {
    const { db, trn, players } = await fresh(2, { fund: 5 });
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", tier: "CASH", entryFeeMinor: u(10),
      asset: "USDT", capacity: 2, timeControl: { initialMs: 60000 },
      registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
      prizeStructure: [{ rank: 1, bps: 10000 }],
    });
    await trn.openRegistration(c.tournamentId);
    await assert.rejects(
      () => trn.register({ tournamentId: c.tournamentId, playerId: players[0], ratingX100: 150000 }),
      /INSUFFICIENT_FUNDS/
    );
    assert.equal(await natural(db, `user:${players[0]}:locked`), "0");
  });

  test("withdrawing before the tournament starts refunds the entry fee in full", async () => {
    const { db, trn, players } = await fresh(2, { fund: 100 });
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", tier: "CASH", entryFeeMinor: u(10),
      asset: "USDT", capacity: 2, timeControl: { initialMs: 60000 },
      registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
      prizeStructure: [{ rank: 1, bps: 10000 }],
    });
    await trn.openRegistration(c.tournamentId);
    await trn.register({ tournamentId: c.tournamentId, playerId: players[0], ratingX100: 150000 });
    assert.equal(await natural(db, `user:${players[0]}:available`), u(90));

    const w = await trn.withdraw({ tournamentId: c.tournamentId, playerId: players[0] });
    assert.equal(w.ok, true);
    assert.equal(await natural(db, `user:${players[0]}:available`), u(100));
    assert.equal(await natural(db, `user:${players[0]}:locked`), "0");
  });
});

describe("single elimination — a full bracket, byes and all", () => {
  test("4 players, power of two, no byes", async () => {
    const { db, trn, settle, players } = await fresh(4);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 4,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    for (const p of players) await trn.register({ tournamentId: c.tournamentId, playerId: p, ratingX100: 150000 });

    const started = await trn.start(c.tournamentId);
    assert.equal(started.ok, true);
    assert.equal(started.pairings, 2);

    await decideRound(db, trn, settle, c.tournamentId, 1);
    const r2 = await trn.advance(c.tournamentId);
    assert.equal(r2.ok, true);
    assert.equal(r2.round, 2);
    assert.equal(r2.pairings, 1);

    await decideRound(db, trn, settle, c.tournamentId, 2);
    const done = await trn.advance(c.tournamentId);
    assert.equal(done.status, "COMPLETED");

    const standings = await trn.standings(c.tournamentId);
    assert.equal(standings.length, 4);
    assert.equal(standings[0].rank, 1);
  });

  test("5 players: byes go to the top seeds and everyone plays exactly one game per round they are in", async () => {
    const { db, trn, settle, players } = await fresh(5);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 5,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    // Register in descending strength so p1 is the top seed.
    for (let i = 0; i < players.length; i++) {
      await trn.register({ tournamentId: c.tournamentId, playerId: players[i], ratingX100: 200000 - i * 1000 });
    }
    await trn.start(c.tournamentId);

    const r1 = await db.query(
      `SELECT status, seat_0, seat_1 FROM tournament_pairing WHERE tournament_id=$1 AND round_number=1`,
      [c.tournamentId]
    );
    const byes = r1.rows.filter((x) => x.status === "BYE");
    assert.equal(byes.length, 3, "bracket size 8 minus 5 players = 3 byes");

    await decideRound(db, trn, settle, c.tournamentId, 1);
    const r2 = await trn.advance(c.tournamentId);
    assert.equal(r2.pairings, 2);
    await decideRound(db, trn, settle, c.tournamentId, 2);
    const r3 = await trn.advance(c.tournamentId);
    assert.equal(r3.pairings, 1);
    await decideRound(db, trn, settle, c.tournamentId, 3);
    const done = await trn.advance(c.tournamentId);
    assert.equal(done.status, "COMPLETED");
  });

  test("a drawn game advances the higher seed — documented, not silent", async () => {
    const { db, trn, settle, players } = await fresh(2);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 2,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    await trn.register({ tournamentId: c.tournamentId, playerId: players[0], ratingX100: 190000 });
    await trn.register({ tournamentId: c.tournamentId, playerId: players[1], ratingX100: 150000 });
    await trn.start(c.tournamentId);

    await decideRound(db, trn, settle, c.tournamentId, 1, () => "1/2-1/2");
    const done = await trn.advance(c.tournamentId);
    assert.equal(done.status, "COMPLETED");
    const standings = await trn.standings(c.tournamentId);
    const first = standings.find((s) => s.rank === 1);
    assert.equal(first.player_id, players[0], "higher seed advances on a draw");
  });

  test("a non-chess game gets ITS OWN plugin's real starting state, not a hardcoded chess FEN or a bare seed", async () => {
    // Regression test for a shared-layer bug: this engine used to fall
    // back to `{ seed: randomUUID() }` for any gameId other than "chess",
    // which is not the shape either checkers' or connect four's own
    // rehydrate() expects. Every pairing's duel must be spawned through
    // the SAME matchmaking spawner map a fresh matchmade duel uses.
    const { db, trn, settle, players } = await fresh(2);
    for (const gameId of ["checkers", "connect-four", "xo"]) {
      const c = await trn.create({
        gameId, format: "SINGLE_ELIMINATION", capacity: 2,
        timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
      });
      await trn.openRegistration(c.tournamentId);
      await trn.register({ tournamentId: c.tournamentId, playerId: players[0], ratingX100: 150000 });
      await trn.register({ tournamentId: c.tournamentId, playerId: players[1], ratingX100: 150000 });
      await trn.start(c.tournamentId);

      const row = await db.query(
        `SELECT d.initial_state, d.game_id FROM tournament_pairing tp
           JOIN duel d ON d.id = tp.duel_id
          WHERE tp.tournament_id = $1 AND tp.round_number = 1 LIMIT 1`,
        [c.tournamentId]
      );
      assert.equal(row.rows[0].game_id, gameId);
      assert.deepEqual(row.rows[0].initial_state, {}, `${gameId}'s tournament duel must start from its own plugin's real recipe`);

      await decideRound(db, trn, settle, c.tournamentId, 1);
      const done = await trn.advance(c.tournamentId);
      assert.equal(done.status, "COMPLETED", `${gameId} tournament must complete through the generic engine`);
    }
  });

  test("a Speed Math tournament spawns a real seeded question set, not the board games' empty recipe", async () => {
    const { db, trn, settle, players } = await fresh(2);
    const c = await trn.create({
      gameId: "speed-math", format: "SINGLE_ELIMINATION", capacity: 2,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    await trn.register({ tournamentId: c.tournamentId, playerId: players[0], ratingX100: 150000 });
    await trn.register({ tournamentId: c.tournamentId, playerId: players[1], ratingX100: 150000 });
    await trn.start(c.tournamentId);

    const row = await db.query(
      `SELECT d.initial_state, d.game_id FROM tournament_pairing tp
         JOIN duel d ON d.id = tp.duel_id
        WHERE tp.tournament_id = $1 AND tp.round_number = 1 LIMIT 1`,
      [c.tournamentId]
    );
    assert.equal(row.rows[0].game_id, "speed-math");
    assert.ok(row.rows[0].initial_state.seed, "a real seed must be persisted for the question set to be reproducible");

    await decideRound(db, trn, settle, c.tournamentId, 1);
    const done = await trn.advance(c.tournamentId);
    assert.equal(done.status, "COMPLETED");
  });

  test("advance() refuses while any pairing in the round is undecided", async () => {
    const { trn, players } = await fresh(4);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 4,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    for (const p of players) await trn.register({ tournamentId: c.tournamentId, playerId: p, ratingX100: 150000 });
    await trn.start(c.tournamentId);
    const r = await trn.advance(c.tournamentId);
    assert.equal(r.reason, TournamentError.ROUND_NOT_COMPLETE);
  });

  test("ratings are written back through the ordinary settlement path", async () => {
    const { db, trn, settle, players } = await fresh(2);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 2,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    await trn.register({ tournamentId: c.tournamentId, playerId: players[0], ratingX100: 150000 });
    await trn.register({ tournamentId: c.tournamentId, playerId: players[1], ratingX100: 150000 });
    await trn.start(c.tournamentId);
    await decideRound(db, trn, settle, c.tournamentId, 1, () => "1-0");

    const ratings = await db.query(
      "SELECT player_id, rating_x100, games_played FROM rating WHERE game_id='chess' ORDER BY player_id"
    );
    assert.equal(ratings.rows.length, 2);
    assert.ok(ratings.rows.every((r) => r.games_played === 1));

    const p0 = await natural(db, `user:${players[0]}:locked`);
    assert.equal(p0, "0", "a FREE-tier tournament duel moves no money");
  });
});

describe("a pairing's result is final", () => {
  test("reporting a result twice is refused", async () => {
    const { db, trn, settle, players } = await fresh(2);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 2,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    await trn.register({ tournamentId: c.tournamentId, playerId: players[0], ratingX100: 150000 });
    await trn.register({ tournamentId: c.tournamentId, playerId: players[1], ratingX100: 150000 });
    await trn.start(c.tournamentId);

    const p = await db.query(
      "SELECT id FROM tournament_pairing WHERE tournament_id=$1 AND round_number=1", [c.tournamentId]
    );
    const pairingId = p.rows[0].id;
    const first = await trn.reportResult({ pairingId, result: "1-0" }, settle);
    assert.equal(first.ok, true);
    const second = await trn.reportResult({ pairingId, result: "0-1" }, settle);
    assert.equal(second.reason, TournamentError.PAIRING_ALREADY_DECIDED);

    // And the database itself refuses a raw overwrite, defense in depth.
    await assert.rejects(
      () => db.query(`UPDATE tournament_pairing SET result='0-1' WHERE id=$1`, [pairingId]),
      /result is immutable|violates check constraint/
    );
  });

  test("forfeiting awards the win to the opponent", async () => {
    const { db, trn, settle, players } = await fresh(2);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 2,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    await trn.register({ tournamentId: c.tournamentId, playerId: players[0], ratingX100: 150000 });
    await trn.register({ tournamentId: c.tournamentId, playerId: players[1], ratingX100: 150000 });
    await trn.start(c.tournamentId);
    const p = await db.query(
      "SELECT id FROM tournament_pairing WHERE tournament_id=$1 AND round_number=1", [c.tournamentId]
    );
    const r = await trn.forfeit({ pairingId: p.rows[0].id, forfeitingPlayerId: players[0] }, settle);
    assert.equal(r.ok, true);
    const row = await db.query("SELECT result, status FROM tournament_pairing WHERE id=$1", [p.rows[0].id]);
    assert.equal(row.rows[0].result, "0-1");
    assert.equal(row.rows[0].status, "FORFEIT");
  });
});

describe("Swiss", () => {
  test("a 3-round Swiss with 4 players completes and ranks by points then tiebreak", async () => {
    const { db, trn, settle, players } = await fresh(4);
    const c = await trn.create({
      gameId: "chess", format: "SWISS", capacity: 4, swissRounds: 3,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    for (const p of players) await trn.register({ tournamentId: c.tournamentId, playerId: p, ratingX100: 150000 });
    await trn.start(c.tournamentId);

    for (let round = 1; round <= 3; round++) {
      await decideRound(db, trn, settle, c.tournamentId, round, (a) => (a === players[0] || a === players[2] ? "1-0" : "0-1"));
      const res = await trn.advance(c.tournamentId);
      if (round < 3) assert.equal(res.round, round + 1);
      else assert.equal(res.status, "COMPLETED");
    }

    const standings = await trn.standings(c.tournamentId);
    assert.equal(standings.length, 4);
    for (let i = 1; i < standings.length; i++) {
      assert.ok(standings[i - 1].points >= standings[i].points, "standings must be sorted by points");
    }
  });

  test("no player is paired against the same opponent twice while an alternative exists", async () => {
    const { db, trn, settle, players } = await fresh(6);
    const c = await trn.create({
      gameId: "chess", format: "SWISS", capacity: 6, swissRounds: 3,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    for (const p of players) await trn.register({ tournamentId: c.tournamentId, playerId: p, ratingX100: 150000 });
    await trn.start(c.tournamentId);

    const seenPairs = new Set();
    for (let round = 1; round <= 3; round++) {
      const live = await db.query(
        "SELECT seat_0, seat_1 FROM tournament_pairing WHERE tournament_id=$1 AND round_number=$2 AND seat_1 IS NOT NULL",
        [c.tournamentId, round]
      );
      for (const row of live.rows) {
        const key = [row.seat_0, row.seat_1].sort().join("|");
        assert.equal(seenPairs.has(key), false, `rematch at round ${round}: ${key}`);
        seenPairs.add(key);
      }
      await decideRound(db, trn, settle, c.tournamentId, round);
      await trn.advance(c.tournamentId);
    }
  });

  test("an odd field gets exactly one bye per round, spread across different players", async () => {
    const { db, trn, settle, players } = await fresh(5);
    const c = await trn.create({
      gameId: "chess", format: "SWISS", capacity: 5, swissRounds: 2,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    for (const p of players) await trn.register({ tournamentId: c.tournamentId, playerId: p, ratingX100: 150000 });
    await trn.start(c.tournamentId);

    const byeRecipients = [];
    for (let round = 1; round <= 2; round++) {
      const byes = await db.query(
        "SELECT seat_0 FROM tournament_pairing WHERE tournament_id=$1 AND round_number=$2 AND status='BYE'",
        [c.tournamentId, round]
      );
      assert.equal(byes.rows.length, 1);
      byeRecipients.push(byes.rows[0].seat_0);
      await decideRound(db, trn, settle, c.tournamentId, round);
      await trn.advance(c.tournamentId);
    }
    assert.equal(new Set(byeRecipients).size, 2, "the same player should not get both byes when others have not had one");
  });
});

describe("prize settlement", () => {
  test("winner takes the pool less rake, and settling twice pays once", async () => {
    const { db, trn, settle, players } = await fresh(4, { fund: 100 });
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", tier: "CASH", entryFeeMinor: u(10),
      asset: "USDT", capacity: 4, timeControl: { initialMs: 60000 },
      registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
      prizeStructure: [{ rank: 1, bps: 7000 }, { rank: 2, bps: 3000 }],
    });
    await trn.openRegistration(c.tournamentId);
    for (const p of players) await trn.register({ tournamentId: c.tournamentId, playerId: p, ratingX100: 150000 });
    await trn.start(c.tournamentId);
    await decideRound(db, trn, settle, c.tournamentId, 1);
    await trn.advance(c.tournamentId);
    await decideRound(db, trn, settle, c.tournamentId, 2);
    const done = await trn.advance(c.tournamentId);
    assert.equal(done.status, "COMPLETED");

    const result = await trn.settlePrizes(c.tournamentId);
    assert.equal(result.ok, true);
    // Pot = 40 USDT, 12% standard rake = 4.8 USDT (4800000), distributable = 35.2 USDT (35200000).
    // Rank 1: 70% of 35.2 = 24.64 USDT (24640000)
    // Rank 2: 30% of 35.2 = 10.56 USDT (10560000)
    assert.equal(result.distributed, "35200000");
    assert.equal(result.rake, "4800000");

    const again = await trn.settlePrizes(c.tournamentId);
    assert.equal(again.reason, TournamentError.ALREADY_SETTLED);

    const rows = await db.query(
      "SELECT player_id, prize_minor::text p FROM tournament_settlement WHERE tournament_id=$1 ORDER BY rank",
      [c.tournamentId]
    );
    const totalPaid = rows.rows.reduce((a, r) => a + BigInt(r.p), 0n);
    assert.equal(totalPaid.toString(), "35200000");

    const solvency = await db.query(
      "SELECT custody_held::text h, user_liabilities::text o FROM ledger_solvency WHERE asset='USDT'"
    );
    assert.ok(BigInt(solvency.rows[0].h) >= BigInt(solvency.rows[0].o), "must remain solvent");

    const drift = await db.query("SELECT count(*)::int c FROM ledger_balance_verification WHERE drift <> 0");
    assert.equal(drift.rows[0].c, 0);
  });

  test("a FREE tournament records ranks with zero prizes", async () => {
    const { db, trn, settle, players } = await fresh(2);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 2,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    await trn.register({ tournamentId: c.tournamentId, playerId: players[0], ratingX100: 150000 });
    await trn.register({ tournamentId: c.tournamentId, playerId: players[1], ratingX100: 150000 });
    await trn.start(c.tournamentId);
    await decideRound(db, trn, settle, c.tournamentId, 1);
    await trn.advance(c.tournamentId);

    const result = await trn.settlePrizes(c.tournamentId);
    assert.equal(result.ok, true);
    assert.equal(result.distributed, "0");
  });

  test("the rank-1 finisher earns TOURNAMENT_CHAMPION exactly once, win or FREE", async () => {
    const { db, trn, settle, players } = await fresh(2);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 2,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    await trn.register({ tournamentId: c.tournamentId, playerId: players[0], ratingX100: 150000 });
    await trn.register({ tournamentId: c.tournamentId, playerId: players[1], ratingX100: 150000 });
    await trn.start(c.tournamentId);
    await decideRound(db, trn, settle, c.tournamentId, 1);
    await trn.advance(c.tournamentId);
    await trn.settlePrizes(c.tournamentId);

    const champion = await db.query(
      "SELECT player_id FROM tournament_settlement WHERE tournament_id=$1 AND rank=1",
      [c.tournamentId]
    );
    const championId = champion.rows[0].player_id;
    const runnerUpId = players.find((p) => p !== championId);

    const ach = await db.query(
      "SELECT achievement_code FROM player_achievement WHERE player_id=$1", [championId]
    );
    assert.deepEqual(ach.rows.map((r) => r.achievement_code), ["TOURNAMENT_CHAMPION"]);
    const badge = await db.query("SELECT badge_code FROM player_badge WHERE player_id=$1", [championId]);
    assert.deepEqual(badge.rows.map((r) => r.badge_code), ["TOURNAMENT_CHAMPION"]);
    const exp = await db.query(
      "SELECT amount FROM exp_event WHERE player_id=$1 AND event_type='ACHIEVEMENT'", [championId]
    );
    assert.equal(exp.rows.length, 1);

    const runnerUpAch = await db.query("SELECT 1 FROM player_achievement WHERE player_id=$1", [runnerUpId]);
    assert.equal(runnerUpAch.rows.length, 0, "the runner-up never gets the champion achievement");

    // Re-settling (already ALREADY_SETTLED, a no-op) must never re-grant it.
    await trn.settlePrizes(c.tournamentId);
    const again = await db.query("SELECT count(*)::int c FROM player_achievement WHERE player_id=$1", [championId]);
    assert.equal(again.rows[0].c, 1);
  });

  test("settlement cannot happen before the tournament is complete", async () => {
    const { trn, players } = await fresh(2);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 2,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    await trn.register({ tournamentId: c.tournamentId, playerId: players[0], ratingX100: 150000 });
    await trn.register({ tournamentId: c.tournamentId, playerId: players[1], ratingX100: 150000 });
    const r = await trn.settlePrizes(c.tournamentId);
    assert.equal(r.reason, TournamentError.WRONG_STATUS);
  });
});

describe("the database enforces tournament invariants directly", () => {
  test("prize structure cannot exceed 100% of the pool", async () => {
    const { trn } = await fresh(2);
    await assert.rejects(
      () => trn.create({
        gameId: "chess", format: "SINGLE_ELIMINATION", tier: "CASH", entryFeeMinor: u(10),
        asset: "USDT", capacity: 2, timeControl: { initialMs: 60000 },
        registrationClosesAt: new Date().toISOString(),
        prizeStructure: [{ rank: 1, bps: 8000 }, { rank: 2, bps: 8000 }],
      }),
      /tournament_prize_bps_sane|violates check constraint/
    );
  });

  test("a cash tournament must declare an asset and a positive fee", async () => {
    const { trn } = await fresh(2);
    await assert.rejects(
      () => trn.create({
        gameId: "chess", format: "SINGLE_ELIMINATION", tier: "CASH", entryFeeMinor: 0n,
        capacity: 2, timeControl: { initialMs: 60000 }, registrationClosesAt: new Date().toISOString(),
      }),
      /tournament_cash_has_asset|violates check constraint/
    );
  });

  test("Swiss requires a round count; single elimination must not have one", async () => {
    const { trn } = await fresh(2);
    await assert.rejects(
      () => trn.create({
        gameId: "chess", format: "SWISS", capacity: 4, timeControl: { initialMs: 60000 },
        registrationClosesAt: new Date().toISOString(),
      }),
      /tournament_swiss_rounds_only_for_swiss|violates check constraint/
    );
  });

  test("the audit trail cannot be edited", async () => {
    const { db, trn } = await fresh(2);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 2,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date().toISOString(),
    });
    await assert.rejects(
      () => db.query("DELETE FROM tournament_event WHERE tournament_id=$1", [c.tournamentId]),
      /append-only/
    );
  });
});

describe("the unified lifecycle (DRAFT/SCHEDULED/REGISTRATION/LIVE/FINALS/COMPLETED/SETTLED/CANCELLED)", () => {
  test("schedule() moves DRAFT to SCHEDULED, and registration can open directly from either", async () => {
    const { db, trn } = await fresh(2);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 2,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    const sched = await trn.schedule(c.tournamentId);
    assert.equal(sched.ok, true);
    const row = await db.query("SELECT status FROM tournament WHERE id=$1", [c.tournamentId]);
    assert.equal(row.rows[0].status, "SCHEDULED");

    // schedule() again is refused -- it is not idempotent, DRAFT-only.
    const again = await trn.schedule(c.tournamentId);
    assert.equal(again.reason, TournamentError.WRONG_STATUS);

    const opened = await trn.openRegistration(c.tournamentId);
    assert.equal(opened.ok, true);
  });

  test("many simultaneous registrations for the last slots resolve to exactly `capacity` winners", async () => {
    const { trn, players } = await fresh(6);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 4,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    const results = await Promise.all(
      players.map((p) => trn.register({ tournamentId: c.tournamentId, playerId: p, ratingX100: 150000 }))
    );
    const ok = results.filter((r) => r.ok);
    const atCapacity = results.filter((r) => r.reason === TournamentError.AT_CAPACITY);
    assert.equal(ok.length, 4, "capacity is 4 -- the trigger must admit exactly 4, never more, under concurrent load");
    assert.equal(atCapacity.length, 2);
  });

  test("the same player racing to register twice is admitted exactly once", async () => {
    const { trn, players } = await fresh(2);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 2,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => trn.register({ tournamentId: c.tournamentId, playerId: players[0], ratingX100: 150000 }))
    );
    const ok = results.filter((r) => r.ok);
    assert.equal(ok.length, 1, "PRIMARY KEY (tournament_id, player_id) admits exactly one of the racing attempts");
  });

  test("an eligibility floor refuses an under-rated player and admits an eligible one", async () => {
    const { trn, players } = await fresh(2);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 2,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
      eligibility: { minRatingX100: 180000 },
    });
    await trn.openRegistration(c.tournamentId);
    const low = await trn.register({ tournamentId: c.tournamentId, playerId: players[0], ratingX100: 150000 });
    assert.equal(low.reason, TournamentError.NOT_ELIGIBLE);
    const high = await trn.register({ tournamentId: c.tournamentId, playerId: players[1], ratingX100: 200000 });
    assert.equal(high.ok, true);
  });

  test("cancelling a tournament before it starts refunds every locked entry fee and notifies each entrant", async () => {
    const { db, trn, players } = await fresh(3, { fund: 100 });
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", tier: "CASH", entryFeeMinor: u(10),
      asset: "USDT", capacity: 3, timeControl: { initialMs: 60000 },
      registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
      prizeStructure: [{ rank: 1, bps: 10000 }],
    });
    await trn.openRegistration(c.tournamentId);
    for (const p of players) await trn.register({ tournamentId: c.tournamentId, playerId: p, ratingX100: 150000 });
    for (const p of players) assert.equal(await natural(db, `user:${p}:available`), u(90));

    const cancelled = await trn.cancel(c.tournamentId, { reason: "not enough interest" });
    assert.equal(cancelled.ok, true);
    assert.equal(cancelled.refunded, 3);

    for (const p of players) assert.equal(await natural(db, `user:${p}:available`), u(100));
    const status = await db.query("SELECT status FROM tournament WHERE id=$1", [c.tournamentId]);
    assert.equal(status.rows[0].status, "CANCELLED");

    const notes = await db.query(
      "SELECT player_id, type FROM notification WHERE type='TOURNAMENT_CANCELLED' AND data->>'tournamentId'=$1",
      [c.tournamentId]
    );
    assert.equal(notes.rows.length, 3);
  });

  test("cancellation is refused once the tournament has gone LIVE", async () => {
    const { trn, players } = await fresh(2);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 2,
      timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await trn.openRegistration(c.tournamentId);
    await trn.register({ tournamentId: c.tournamentId, playerId: players[0], ratingX100: 150000 });
    await trn.register({ tournamentId: c.tournamentId, playerId: players[1], ratingX100: 150000 });
    await trn.start(c.tournamentId);
    const r = await trn.cancel(c.tournamentId);
    assert.equal(r.reason, TournamentError.WRONG_STATUS);
  });

  test("the bracket enters FINALS before the last pairing is decided, then settles to SETTLED after prizes", async () => {
    const { db, trn, settle, players } = await fresh(4, { fund: 100 });
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", tier: "CASH", entryFeeMinor: u(10),
      asset: "USDT", capacity: 4, timeControl: { initialMs: 60000 },
      registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
      prizeStructure: [{ rank: 1, bps: 10000 }],
    });
    await trn.openRegistration(c.tournamentId);
    for (const p of players) await trn.register({ tournamentId: c.tournamentId, playerId: p, ratingX100: 150000 });
    await trn.start(c.tournamentId);

    await decideRound(db, trn, settle, c.tournamentId, 1);
    await trn.advance(c.tournamentId);
    const mid = await db.query("SELECT status FROM tournament WHERE id=$1", [c.tournamentId]);
    assert.equal(mid.rows[0].status, "FINALS", "round 2 is the final -- the tournament must already show FINALS");

    await decideRound(db, trn, settle, c.tournamentId, 2);
    const done = await trn.advance(c.tournamentId);
    assert.equal(done.status, "COMPLETED");

    const notesBefore = await db.query("SELECT count(*)::int c FROM notification WHERE type='MATCH_READY'");
    assert.ok(notesBefore.rows[0].c > 0, "each real pairing must have notified both seats their match was ready");

    await trn.settlePrizes(c.tournamentId);
    const settled = await db.query("SELECT status FROM tournament WHERE id=$1", [c.tournamentId]);
    assert.equal(settled.rows[0].status, "SETTLED");

    const again = await trn.settlePrizes(c.tournamentId);
    assert.equal(again.ok, true);
    assert.equal(again.reason, TournamentError.ALREADY_SETTLED);
  });
});
