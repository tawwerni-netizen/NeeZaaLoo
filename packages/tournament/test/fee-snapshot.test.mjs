/**
 * The tournament pool fee snapshot (db/migrations/0036_fee_snapshot.sql).
 *
 * Before this migration, settlePrizes() resolved economy_resolve() with
 * now() -- so a tournament's payout could be repriced by whatever the
 * global rate happened to be on the day someone finally ran settlement,
 * even days after the bracket finished. The fix: the pool's fee is resolved
 * and frozen at tournament CREATION time, exactly like a duel's fee is
 * frozen by mm_pair().
 *
 * economy_rule is append-only (0004's economy_rule_immutable trigger), so
 * these tests never delete the seeded launch rule -- they add a new rule
 * with a later effective_from, which wins the tie-break against the launch
 * rule (same specificity, later effective_from) exactly as a real admin
 * rate change would.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createSettlementService } from "../../settlement/src/settle.mjs";
import { createTournamentService } from "../src/tournament.mjs";

const USDT = 1_000_000n;
const u = (n) => (BigInt(n) * USDT).toString();

async function fresh(playerCount = 2, { fund = 100 } = {}) {
  const db = await PGlite.create();
  await migrate(db);
  const players = Array.from({ length: playerCount }, (_, i) => `pl${i + 1}`);
  for (const p of players) {
    await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [p]);
    await db.query("SELECT ledger_open_user_wallet($1)", [p]);
    await db.query(`SELECT ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb)`, [
      `seed:${p}`,
      JSON.stringify([
        { account: "platform:custody:USDT:TRON", amount: u(fund) },
        { account: `user:${p}:available`, amount: "-" + u(fund) },
      ]),
    ]);
  }
  return { db, trn: createTournamentService(db), settle: createSettlementService(db), players };
}

async function setGlobalCashRate(db, { id, rakeBps }) {
  await db.query(
    `INSERT INTO economy_rule
       (id, version, game_id, tier, rake_bps, min_rake_minor, max_rake_minor,
        effective_from, created_by, approved_by, reason)
     VALUES ($1, 1, NULL, 'CASH', $2, 0, NULL, now(), 'admin-a', 'admin-b', 'test rate')`,
    [id, rakeBps]
  );
}

async function natural(db, key) {
  const r = await db.query(
    `SELECT ledger_natural_balance(a.normal_side, COALESCE(b.balance,0))::text n
       FROM ledger_account a LEFT JOIN ledger_balance b ON b.account_id=a.id WHERE a.key=$1`,
    [key]
  );
  return r.rows[0].n;
}

async function playOutFinal(db, trn, settle, tournamentId) {
  const r = await db.query(
    `SELECT id FROM tournament_pairing WHERE tournament_id=$1 AND status='LIVE' ORDER BY slot`,
    [tournamentId]
  );
  for (const row of r.rows) {
    const res = await trn.reportResult({ pairingId: row.id, result: "1-0" }, settle);
    assert.equal(res.ok, true, JSON.stringify(res));
  }
}

describe("a CASH tournament pool is priced at creation, not at settlePrizes()", () => {
  test("the rate is stamped when the tournament is created", async () => {
    const { db, trn } = await fresh(2);
    await setGlobalCashRate(db, { id: "t-15", rakeBps: 1500 });

    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", tier: "CASH", entryFeeMinor: u(10),
      asset: "USDT", capacity: 2, timeControl: { initialMs: 60000 },
      registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
      prizeStructure: [{ rank: 1, bps: 10000 }],
    });
    assert.equal(c.ok, true);
    const row = await db.query("SELECT priced_rake_bps, priced_economy_rule_id FROM tournament WHERE id=$1", [c.tournamentId]);
    assert.equal(row.rows[0].priced_rake_bps, 1500);
    assert.equal(row.rows[0].priced_economy_rule_id, "t-15");
  });

  test("a rate change AFTER creation (even after the bracket finishes) does not alter the payout", async () => {
    const { db, trn, settle, players } = await fresh(2, { fund: 100 });
    await setGlobalCashRate(db, { id: "t-15b", rakeBps: 1500 });

    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", tier: "CASH", entryFeeMinor: u(10),
      asset: "USDT", capacity: 2, timeControl: { initialMs: 60000 },
      registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
      prizeStructure: [{ rank: 1, bps: 10000 }],
    });
    await trn.openRegistration(c.tournamentId);
    for (const p of players) await trn.register({ tournamentId: c.tournamentId, playerId: p, ratingX100: 150000 });
    await trn.start(c.tournamentId);

    // The admin raises the global rate to 25% while the bracket is LIVE.
    await setGlobalCashRate(db, { id: "t-25b", rakeBps: 2500 });

    await playOutFinal(db, trn, settle, c.tournamentId);
    await trn.advance(c.tournamentId);

    const result = await trn.settlePrizes(c.tournamentId);
    assert.equal(result.ok, true);
    // Pot = 20 USDT (2 x 10 fee). 15% rake = 3 USDT, distributable = 17.
    assert.equal(result.rake, u(3), "the pool still pays the 15% rate that was in force at CREATION");
    assert.equal(result.distributed, u(17));

    const rakeAccount = await natural(db, "platform:rake");
    assert.equal(rakeAccount, u(3));
  });

  test("the pool's fee snapshot is immutable once set", async () => {
    const { db, trn } = await fresh(2);
    await setGlobalCashRate(db, { id: "t-15c", rakeBps: 1500 });
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", tier: "CASH", entryFeeMinor: u(10),
      asset: "USDT", capacity: 2, timeControl: { initialMs: 60000 },
      registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
      prizeStructure: [{ rank: 1, bps: 10000 }],
    });
    await assert.rejects(
      () => db.query("UPDATE tournament SET priced_rake_bps = 2500 WHERE id=$1", [c.tournamentId]),
      /immutable once priced/
    );
  });

  test("a FREE tournament is never priced at all", async () => {
    const { db, trn } = await fresh(2);
    const c = await trn.create({
      gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 2,
      timeControl: { initialMs: 60000 },
      registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    assert.equal(c.ok, true);
    const row = await db.query("SELECT priced_rake_bps FROM tournament WHERE id=$1", [c.tournamentId]);
    assert.equal(row.rows[0].priced_rake_bps, null);
  });
});
