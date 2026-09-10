/**
 * Settlement: the point where a finished game becomes money.
 *
 * The claims under test:
 *   - a duel pays out exactly once, however many times settlement is retried
 *   - money can never be released that was not first locked
 *   - a duel under fair-play hold does not pay, and the database enforces it
 *   - rake is priced by the rule in force when the game ENDED
 *   - the books balance and the platform stays solvent afterwards
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createSettlementService } from "../src/settle.mjs";
import { computeRake, settlementLegs } from "../src/rake.mjs";

const USDT = 1_000_000n;
const u = (n) => (BigInt(n) * USDT).toString();

const TC = JSON.stringify({ initialMs: 300000, incrementMs: 0 });
const INITIAL = JSON.stringify({ fen: "startpos" });

async function fresh({ fund = 100, stake = 10, tier = "CASH", isVsComputer = false } = {}) {
  const db = await PGlite.create();
  await migrate(db);
  for (const p of ["alice", "bob"]) {
    await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [p]);
    await db.query("SELECT ledger_open_user_wallet($1)", [p]);
    if (fund) {
      await db.query(
        `SELECT ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb)`,
        [`deposit:seed:${p}`, JSON.stringify([
          { account: "platform:custody:USDT:TRON", amount: u(fund) },
          { account: `user:${p}:available`, amount: "-" + u(fund) },
        ])]
      );
    }
  }
  await db.query(
    `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
                       tier, stake_minor, asset, initial_state, time_control, status,
                       is_vs_computer)
     VALUES ('d1','chess',1,'pk','alice','bob',$1::entry_tier,$2,
             CASE WHEN $1='CASH' THEN 'USDT' ELSE NULL END,
             $3::jsonb,$4::jsonb,'RESERVED'::duel_status,$5)`,
    [tier, tier === "CASH" ? u(stake) : 0, INITIAL, TC, isVsComputer]
  );
  return { db, svc: createSettlementService(db) };
}

async function complete(db, result, reason = "CHECKMATE") {
  await db.query(
    `UPDATE duel SET status='COMPLETED'::duel_status, result=$1,
            termination_reason=$2, completed_at=now(), game_hash='h' WHERE id='d1'`,
    [result, reason]
  );
}

async function natural(db, key) {
  const r = await db.query(
    `SELECT ledger_natural_balance(a.normal_side, COALESCE(b.balance,0))::text n
       FROM ledger_account a LEFT JOIN ledger_balance b ON b.account_id=a.id
      WHERE a.key=$1`, [key]
  );
  return r.rows[0].n;
}

async function solvent(db) {
  const r = await db.query(
    "SELECT custody_held::text h, user_liabilities::text o FROM ledger_solvency WHERE asset='USDT'"
  );
  return BigInt(r.rows[0].h) >= BigInt(r.rows[0].o);
}

// ---------------------------------------------------------------------------

describe("rake arithmetic", () => {
  test("10% of a 20 USDT pot is 2 USDT", () => {
    const { rakeMinor } = computeRake(20n * USDT, { rakeBps: 1000 });
    assert.equal(rakeMinor, 2n * USDT);
  });

  test("rounding is floor, so the fraction stays with the players", () => {
    // 7 minor units at 10% = 0.7 -> the platform takes 0, not 1.
    const { rakeMinor, residueMicroMinor } = computeRake(7n, { rakeBps: 1000 });
    assert.equal(rakeMinor, 0n);
    assert.equal(residueMicroMinor, 7000n, "the discarded fraction is recorded for audit");
  });

  test("min and max clamps apply", () => {
    assert.equal(computeRake(100n, { rakeBps: 1000, minRakeMinor: 50 }).rakeMinor, 50n);
    assert.equal(computeRake(10_000n, { rakeBps: 1000, maxRakeMinor: 100 }).rakeMinor, 100n);
  });

  test("a fee can never exceed the pot, whatever the config says", () => {
    assert.equal(computeRake(100n, { rakeBps: 1000, minRakeMinor: 99999 }).rakeMinor, 100n);
  });

  test("an out-of-range rake is refused, mirroring the DB constraint", () => {
    // The approved band is 10%-25% (1000-2500 bps), or exactly 0 -- see
    // rake.mjs's own header and db/migrations/0035_rake_ladder.sql.
    assert.throws(() => computeRake(100n, { rakeBps: 2501 }), /out of bounds/);
    assert.throws(() => computeRake(100n, { rakeBps: 500 }), /out of bounds/, "a sub-band value is not 'in range' just because it is less than 2500");
    assert.throws(() => computeRake(100n, { rakeBps: -1 }), /out of bounds/);
  });

  test("no floating point can enter", () => {
    assert.throws(() => computeRake(100, { rakeBps: 1000 }), /must be a BigInt/);
  });

  test("settlement legs always sum to zero", () => {
    for (const result of ["1-0", "0-1", "1/2-1/2"]) {
      for (const rake of [0n, 1n, 2n * USDT]) {
        const legs = settlementLegs({
          seat0: "a", seat1: "b", stakeMinor: 10n * USDT,
          result, rakeMinor: result === "1/2-1/2" ? 0n : rake,
        });
        const sum = legs.reduce((acc, l) => acc + BigInt(l.amount), 0n);
        assert.equal(sum, 0n, `${result} with rake ${rake} did not balance`);
      }
    }
  });
});

describe("reservation", () => {
  test("stakes are locked before play", async () => {
    const { db, svc } = await fresh();
    const res = await svc.reserve("d1");
    assert.equal(res.reason, "RESERVED");
    assert.equal(await natural(db, "user:alice:available"), u(90));
    assert.equal(await natural(db, "user:alice:locked"), u(10));
    assert.equal(await natural(db, "user:bob:locked"), u(10));

    const d = await db.query("SELECT status FROM duel WHERE id='d1'");
    assert.equal(d.rows[0].status, "READY");
  });

  test("a player who cannot fund the stake blocks the whole duel", async () => {
    const { db, svc } = await fresh({ fund: 0 });
    await db.query(`SELECT ledger_post('f','DEPOSIT','SYSTEM',NULL,$1::jsonb)`, [
      JSON.stringify([
        { account: "platform:custody:USDT:TRON", amount: u(5) },
        { account: "user:alice:available", amount: "-" + u(5) },
      ]),
    ]);
    // alice has 5, bob has 0; the stake is 10.
    await assert.rejects(() => svc.reserve("d1"), /insufficient funds/);
    assert.equal(await natural(db, "user:alice:available"), u(5), "alice untouched");
    assert.equal(await natural(db, "user:alice:locked"), "0", "no half-funded duel");
  });

  test("reserving twice locks the stake once", async () => {
    const { db, svc } = await fresh();
    await svc.reserve("d1");
    const second = await svc.reserve("d1");
    assert.equal(second.reason, "ALREADY_RESERVED");
    assert.equal(await natural(db, "user:alice:locked"), u(10));
  });
});

describe("settling a decided duel", () => {
  test("the winner takes the pot less rake, and the books balance", async () => {
    const { db, svc } = await fresh();
    await svc.reserve("d1");
    await complete(db, "1-0");

    const res = await svc.settle("d1");
    assert.equal(res.reason, "SETTLED");
    assert.equal(res.rakeMinor, u(2), "10% of a 20 pot");
    assert.equal(res.rule.id, "standard");

    assert.equal(await natural(db, "user:alice:available"), u(108), "90 + 18");
    assert.equal(await natural(db, "user:alice:locked"), "0");
    assert.equal(await natural(db, "user:bob:available"), u(90), "loser keeps the rest");
    assert.equal(await natural(db, "user:bob:locked"), "0");
    assert.equal(await natural(db, "platform:rake"), u(2));

    const drift = await db.query(
      "SELECT count(*)::int c FROM ledger_balance_verification WHERE drift <> 0"
    );
    assert.equal(drift.rows[0].c, 0);
    assert.ok(await solvent(db), "custody must still cover liabilities");
  });

  test("the duel records which rule priced it", async () => {
    const { db, svc } = await fresh();
    await svc.reserve("d1");
    await complete(db, "0-1");
    await svc.settle("d1");

    const d = await db.query(
      `SELECT status, rake_minor::text r, economy_rule_id, economy_rule_version,
              settlement_tx_id IS NOT NULL AS has_tx
         FROM duel WHERE id='d1'`
    );
    assert.equal(d.rows[0].status, "SETTLED");
    assert.equal(d.rows[0].r, u(2));
    assert.equal(d.rows[0].economy_rule_id, "standard");
    assert.equal(d.rows[0].economy_rule_version, 1);
    assert.equal(d.rows[0].has_tx, true);
  });

  test("settling is idempotent — three calls, one payout", async () => {
    const { db, svc } = await fresh();
    await svc.reserve("d1");
    await complete(db, "1-0");

    const a = await svc.settle("d1");
    const b = await svc.settle("d1");
    const c = await svc.settle("d1");

    assert.equal(a.reason, "SETTLED");
    assert.equal(b.reason, "ALREADY_SETTLED");
    assert.equal(c.reason, "ALREADY_SETTLED");
    assert.equal(await natural(db, "user:alice:available"), u(108), "paid once");

    const n = await db.query(
      "SELECT count(*)::int c FROM ledger_transaction WHERE kind='DUEL_SETTLE'"
    );
    assert.equal(n.rows[0].c, 1);
  });

  test("a draw refunds both stakes in full and takes no rake", async () => {
    const { db, svc } = await fresh();
    await svc.reserve("d1");
    await complete(db, "1/2-1/2", "STALEMATE");
    const res = await svc.settle("d1");

    assert.equal(res.rakeMinor, "0", "no fee on a game neither player lost");
    assert.equal(await natural(db, "user:alice:available"), u(100));
    assert.equal(await natural(db, "user:bob:available"), u(100));
    assert.equal(await natural(db, "platform:rake"), "0");

    const d = await db.query("SELECT rake_minor::text r FROM duel WHERE id=$1", ["d1"]);
    assert.equal(d.rows[0].r, "0",
      "the recorded fee must match the fee actually charged, or revenue reports lie");
  });
});

describe("settlement refuses what it should", () => {
  test("a duel that is not completed cannot settle", async () => {
    const { svc } = await fresh();
    await svc.reserve("d1");
    assert.equal((await svc.settle("d1")).reason, "NOT_COMPLETED");
  });

  test("a duel under fair-play hold does not pay", async () => {
    const { db, svc } = await fresh();
    await svc.reserve("d1");
    await complete(db, "1-0");
    await svc.hold("d1", true);

    assert.equal((await svc.settle("d1")).reason, "ON_HOLD");
    assert.equal(await natural(db, "user:alice:locked"), u(10), "money stays locked");

    // And the database refuses the state even if code tried to force it.
    await assert.rejects(
      () => db.query("UPDATE duel SET status='SETTLED'::duel_status WHERE id='d1'"),
      /duel_no_settle_under_hold|violates check constraint/
    );

    // Cleared by a reviewer, it settles normally.
    await svc.hold("d1", false);
    assert.equal((await svc.settle("d1")).reason, "SETTLED");
    assert.equal(await natural(db, "user:alice:available"), u(108));
  });

  test("stakes that were never locked cannot be paid out", async () => {
    // The attack this closes: settle a cash duel whose reservation never ran,
    // which would mint the pot out of nothing.
    const { db, svc } = await fresh();
    await complete(db, "1-0");
    assert.equal((await svc.settle("d1")).reason, "NOT_RESERVED");
    assert.equal(await natural(db, "user:alice:available"), u(100), "nothing minted");
  });

  test("a settled cash duel must be able to show the money", async () => {
    const { db } = await fresh();
    await complete(db, "1-0");
    await assert.rejects(
      () => db.query(
        "UPDATE duel SET status='SETTLED'::duel_status, settled_at=now() WHERE id='d1'"
      ),
      /duel_settled_cash_has_ledger|violates check constraint/
    );
  });
});

describe("voiding", () => {
  test("a void returns both stakes and takes nothing", async () => {
    const { db, svc } = await fresh();
    await svc.reserve("d1");
    await complete(db, "1-0");
    const res = await svc.void_("d1", "platform fault: gateway lost the position");

    assert.equal(res.reason, "VOIDED");
    assert.equal(await natural(db, "user:alice:available"), u(100));
    assert.equal(await natural(db, "user:bob:available"), u(100));
    assert.equal(await natural(db, "platform:rake"), "0");
  });

  test("a settled duel cannot be voided afterwards", async () => {
    const { db, svc } = await fresh();
    await svc.reserve("d1");
    await complete(db, "1-0");
    await svc.settle("d1");
    assert.equal((await svc.void_("d1", "too late")).reason, "ALREADY_SETTLED");
  });

  test("voiding is idempotent", async () => {
    const { db, svc } = await fresh();
    await svc.reserve("d1");
    await complete(db, "1-0");
    await svc.void_("d1", "fault");
    await svc.void_("d1", "fault");
    assert.equal(await natural(db, "user:alice:available"), u(100), "refunded once");
  });
});

describe("ratings are written back", () => {
  test("both players move, from the same pre-duel snapshot", async () => {
    const { db, svc } = await fresh();
    await svc.reserve("d1");
    await complete(db, "1-0");
    const res = await svc.settle("d1");

    assert.equal(res.ratings.applied, true);
    assert.ok(res.ratings.alice.after > 1500, "the winner rises");
    assert.ok(res.ratings.bob.after < 1500, "the loser falls");

    const rows = await db.query(
      "SELECT player_id, rating_x100, games_played, rd_x100 FROM rating ORDER BY player_id"
    );
    assert.equal(rows.rows.length, 2);
    assert.ok(rows.rows.every((r) => r.games_played === 1));
    assert.ok(rows.rows.every((r) => r.rd_x100 < 35000), "uncertainty falls after a game");
  });

  test("the rating change is recorded, and is append-only", async () => {
    const { db, svc } = await fresh();
    await svc.reserve("d1");
    await complete(db, "1-0");
    await svc.settle("d1");

    const ch = await db.query(
      "SELECT player_id, score::text s, rating_before_x100, rating_after_x100 FROM rating_change ORDER BY player_id"
    );
    assert.equal(ch.rows.length, 2);
    assert.equal(ch.rows[0].s, "1.0", "alice won");
    assert.equal(ch.rows[1].s, "0.0");
    assert.equal(ch.rows[0].rating_before_x100, 150000);

    await assert.rejects(
      () => db.query("UPDATE rating_change SET rating_after_x100 = 999999"),
      /append-only/
    );
  });

  test("a free duel settles ratings without moving money", async () => {
    const { db, svc } = await fresh({ tier: "FREE", stake: 0 });
    await complete(db, "1-0");
    const res = await svc.settle("d1");

    assert.equal(res.reason, "SETTLED");
    assert.equal(res.transactionId, null, "no ledger transaction for free play");
    assert.equal(res.ratings.applied, true);
    assert.equal(await natural(db, "user:alice:available"), u(100), "untouched");
  });

  test("VS_COMPUTER settles but never rates -- a bot is not a skill-matched opponent from the real pool", async () => {
    const { db, svc } = await fresh({ tier: "FREE", stake: 0, isVsComputer: true });
    await complete(db, "1-0");
    const res = await svc.settle("d1");

    assert.equal(res.reason, "SETTLED");
    assert.equal(res.ratings, null, "no rating write-back for a VS_COMPUTER duel");
    const r = await db.query(
      "SELECT rating_applied FROM duel WHERE id='d1'"
    );
    assert.equal(r.rows[0].rating_applied, true, "still marked done, so a retry never re-attempts it");
    const rated = await db.query("SELECT 1 FROM rating WHERE player_id='alice' AND game_id='chess'");
    assert.equal(rated.rows.length, 0, "no rating row was ever created for this game");
  });

  test("a retried settlement does not double-count the game", async () => {
    const { db, svc } = await fresh({ tier: "FREE", stake: 0 });
    await complete(db, "1-0");
    await svc.settle("d1");
    await svc.settle("d1");
    const r = await db.query("SELECT games_played FROM rating WHERE player_id='alice'");
    assert.equal(r.rows[0].games_played, 1);
  });
});

describe("the economy rules engine", () => {
  test("a rule created and approved by the same admin is refused", async () => {
    const { db } = await fresh();
    await assert.rejects(
      () => db.query(
        `INSERT INTO economy_rule (id,version,tier,rake_bps,effective_from,created_by,approved_by,reason)
         VALUES ('solo',1,'CASH',1500,now(),'admin-7','admin-7','self approved')`
      ),
      /economy_rule_two_admins|violates check constraint/
    );
  });

  test("rake above the 25% ceiling is refused", async () => {
    const { db } = await fresh();
    await assert.rejects(
      () => db.query(
        `INSERT INTO economy_rule (id,version,tier,rake_bps,effective_from,created_by,approved_by,reason)
         VALUES ('greedy',1,'CASH',5000,now(),'a','b','half the pot')`
      ),
      /economy_rule_rake_sane|violates check constraint/
    );
  });

  test("economy history cannot be rewritten", async () => {
    const { db } = await fresh();
    await assert.rejects(
      () => db.query("UPDATE economy_rule SET rake_bps = 2000 WHERE id='standard'"),
      /append-only/
    );
    await assert.rejects(
      () => db.query("DELETE FROM economy_rule WHERE id='standard'"),
      /append-only/
    );
  });

  test("a more specific rule wins", async () => {
    const { db, svc } = await fresh();
    await db.query(
      `INSERT INTO economy_rule (id,version,game_id,tier,rake_bps,effective_from,created_by,approved_by,reason)
       VALUES ('chess-vip',1,'chess','CASH',1250,'2026-01-01T00:00:00Z','a','b','VIP band for chess')`
    );
    await svc.reserve("d1");
    await complete(db, "1-0");
    const res = await svc.settle("d1");
    assert.equal(res.rule.id, "chess-vip");
    assert.equal(res.rakeMinor, "2500000", "12.5% of a 20 USDT pot is 2.5 USDT");
  });

  test("a duel is priced by the rule in force when it ENDED, not today's", async () => {
    // This is what makes a historical settlement re-derivable years later.
    const { db, svc } = await fresh();
    await svc.reserve("d1");
    await db.query(
      `UPDATE duel SET status='COMPLETED'::duel_status, result='1-0',
              termination_reason='CHECKMATE', game_hash='h',
              completed_at='2026-02-01T00:00:00Z' WHERE id='d1'`
    );
    // A cheaper rule takes effect AFTER that duel finished.
    await db.query(
      `INSERT INTO economy_rule (id,version,tier,rake_bps,effective_from,created_by,approved_by,reason)
       VALUES ('promo',1,'CASH',0,'2026-06-01T00:00:00Z','a','b','zero-rake promotion')`
    );
    const res = await svc.settle("d1");
    assert.equal(res.rule.id, "standard", "the February rule prices a February game");
    assert.equal(res.rakeMinor, u(2));
  });
});

describe("the settlement worker", () => {
  test("settles everything due and skips anything on hold", async () => {
    const { db, svc } = await fresh();
    await svc.reserve("d1");
    await complete(db, "1-0");

    await db.query(
      `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
                         tier, stake_minor, initial_state, time_control, status,
                         result, termination_reason, completed_at, fairplay_hold)
       VALUES ('d2','chess',1,'pk2','alice','bob','FREE',0,$1::jsonb,$2::jsonb,
               'COMPLETED'::duel_status,'0-1','RESIGNATION',now(),TRUE)`,
      [INITIAL, TC]
    );

    const results = await svc.settleDue();
    assert.equal(results.length, 1, "the held duel is not even attempted");
    assert.equal(results[0].duelId, "d1");
    assert.equal(results[0].reason, "SETTLED");

    const held = await db.query("SELECT status FROM duel WHERE id='d2'");
    assert.equal(held.rows[0].status, "COMPLETED", "still waiting for a human");
  });

  test("running the worker twice pays nothing extra", async () => {
    const { db, svc } = await fresh();
    await svc.reserve("d1");
    await complete(db, "1-0");
    await svc.settleDue();
    const second = await svc.settleDue();
    assert.equal(second.length, 0, "nothing is due any more");
    assert.equal(await natural(db, "user:alice:available"), u(108));
  });
});
