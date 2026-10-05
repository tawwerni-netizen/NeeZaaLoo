/**
 * The rake ladder (db/migrations/0035_rake_ladder.sql, and rake.mjs's own
 * mirrored bound). The invariant: exactly 0, or 1000-2500 inclusive. Nothing
 * else -- not a sub-band typo, not negative, not above 2500.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { computeRake } from "../src/rake.mjs";

describe("computeRake() bounds mirror the database CHECK exactly", () => {
  test("0 (a FREE-tier or zero-rated rule) is accepted", () => {
    const { rakeMinor } = computeRake(1000n, { rakeBps: 0 });
    assert.equal(rakeMinor, 0n);
  });

  test("every documented competitive step (10% through 25%) is accepted", () => {
    for (const bps of [1000, 1250, 1500, 1750, 2000, 2250, 2500]) {
      const { rakeMinor } = computeRake(10_000n, { rakeBps: bps });
      assert.equal(rakeMinor, (10_000n * BigInt(bps)) / 10_000n);
    }
  });

  test("a sub-band value (1-999) is rejected -- this is what a fat-fingered admin typing 125 for 1250 produces", () => {
    assert.throws(() => computeRake(1000n, { rakeBps: 1 }), RangeError);
    assert.throws(() => computeRake(1000n, { rakeBps: 500 }), RangeError);
    assert.throws(() => computeRake(1000n, { rakeBps: 999 }), RangeError);
  });

  test("above 2500 is rejected", () => {
    assert.throws(() => computeRake(1000n, { rakeBps: 2501 }), RangeError);
    assert.throws(() => computeRake(1000n, { rakeBps: 20000 }), RangeError);
  });

  test("negative is rejected", () => {
    assert.throws(() => computeRake(1000n, { rakeBps: -1 }), RangeError);
  });
});

describe("economy_rule_rake_sane (the database CHECK)", () => {
  async function fresh() {
    const db = await PGlite.create();
    await migrate(db);
    return db;
  }

  async function insertRule(db, { id, rakeBps, tier = "CASH" }) {
    return db.query(
      `INSERT INTO economy_rule
         (id, version, game_id, tier, rake_bps, min_rake_minor, max_rake_minor,
          effective_from, created_by, approved_by, reason)
       VALUES ($1, 1, NULL, $2::entry_tier, $3, 0, NULL, now(), 'admin-a', 'admin-b', 'test rule')`,
      [id, tier, rakeBps]
    );
  }

  test("0 is accepted for a FREE-tier rule", async () => {
    const db = await fresh();
    await insertRule(db, { id: "free-rule", rakeBps: 0, tier: "FREE" });
    const r = await db.query("SELECT rake_bps FROM economy_rule WHERE id='free-rule'");
    assert.equal(r.rows[0].rake_bps, 0);
  });

  test("0 is also accepted for a CASH-tier rule -- a deliberately configured zero-rated promotion is a valid state, not an error", async () => {
    const db = await fresh();
    await insertRule(db, { id: "promo-rule", rakeBps: 0, tier: "CASH" });
    const r = await db.query("SELECT rake_bps FROM economy_rule WHERE id='promo-rule'");
    assert.equal(r.rows[0].rake_bps, 0);
  });

  test("the full competitive ladder (1000-2500) is accepted", async () => {
    const db = await fresh();
    for (const bps of [1000, 1250, 1500, 1750, 2000, 2250, 2500]) {
      await insertRule(db, { id: `rule-${bps}`, rakeBps: bps });
    }
    const r = await db.query("SELECT count(*)::int c FROM economy_rule WHERE id LIKE 'rule-%'");
    assert.equal(r.rows[0].c, 7);
  });

  test("2500 is the ceiling -- 2501 is refused", async () => {
    const db = await fresh();
    await assert.rejects(
      () => insertRule(db, { id: "too-high", rakeBps: 2501 }),
      /economy_rule_rake_sane|violates check constraint/
    );
  });

  test("a sub-band value between 1 and 999 is refused, even though it is 'between 0 and 2500'", async () => {
    const db = await fresh();
    await assert.rejects(
      () => insertRule(db, { id: "typo-125", rakeBps: 125 }),
      /economy_rule_rake_sane|violates check constraint/
    );
  });

  test("a negative rake is refused", async () => {
    const db = await fresh();
    await assert.rejects(
      () => insertRule(db, { id: "negative", rakeBps: -100 }),
      /economy_rule_rake_sane|violates check constraint/
    );
  });

  test("the old 20% ceiling no longer applies -- 2000 through 2500 are all now legal", async () => {
    const db = await fresh();
    await insertRule(db, { id: "twenty-two-fifty", rakeBps: 2250 });
    const r = await db.query("SELECT rake_bps FROM economy_rule WHERE id='twenty-two-fifty'");
    assert.equal(r.rows[0].rake_bps, 2250);
  });
});
