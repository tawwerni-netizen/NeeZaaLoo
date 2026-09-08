/**
 * Gate 1 evidence.
 *
 * These tests exist to demonstrate one claim: no sequence of operations
 * available to application code can produce an unbalanced transaction, an
 * edited history, a negative user balance, or a double-post.
 *
 * They run against real PostgreSQL (PGlite = Postgres compiled to WASM), so the
 * constraints, triggers and deferred checks under test are the same ones that
 * will run in production.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../src/migrate.mjs";

const USDT = 1_000_000n; // 6 minor units
const u = (n) => (BigInt(n) * USDT).toString();

async function fresh({ users = ["1", "2"], fund = null } = {}) {
  const db = await PGlite.create();
  await migrate(db);
  for (const id of users) await db.query("SELECT ledger_open_user_wallet($1)", [id]);
  if (fund) {
    for (const id of users) {
      await db.query(
        `SELECT ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb)`,
        [
          `deposit:TRON:seed-${id}:0`,
          JSON.stringify([
            { account: "platform:custody:USDT:TRON", amount: u(fund) },
            { account: `user:${id}:available`, amount: "-" + u(fund) },
          ]),
        ]
      );
    }
  }
  return db;
}

/** natural balance = the direction the account is meant to grow */
async function natural(db, key) {
  const r = await db.query(
    `SELECT ledger_natural_balance(a.normal_side, COALESCE(b.balance,0))::text AS n
       FROM ledger_account a LEFT JOIN ledger_balance b ON b.account_id = a.id
      WHERE a.key = $1`,
    [key]
  );
  return r.rows[0]?.n ?? null;
}

async function count(db, tableExpr) {
  const r = await db.query(`SELECT count(*)::int AS c FROM ${tableExpr}`);
  return r.rows[0].c;
}

async function rejects(fn, pattern) {
  try {
    await fn();
  } catch (e) {
    assert.match(e.message, pattern, `wrong rejection reason: ${e.message}`);
    return e;
  }
  assert.fail("expected the database to reject this, but it succeeded");
}

// ---------------------------------------------------------------------------

describe("migrations", () => {
  test("apply cleanly from empty, and are idempotent on re-run", async () => {
    const db = await PGlite.create();
    const first = await migrate(db);

    // Assert the properties that must hold forever, not a frozen list: a
    // hardcoded list makes every future migration break an unrelated test.
    assert.ok(first.length >= 2, "at least the ledger migrations ran");
    assert.deepEqual(first, [...first].sort(), "migrations apply in filename order");
    assert.ok(first.includes("0001_ledger_core.sql"));
    assert.ok(first.includes("0002_ledger_roles_and_platform_accounts.sql"));
    assert.equal(first[0], "0001_ledger_core.sql", "the ledger is the foundation");

    const second = await migrate(db);
    assert.deepEqual(second, [], "re-running migrations must be a no-op");
  });
});

describe("I1 — every transaction sums to zero, per asset", () => {
  test("a balanced deposit is accepted", async () => {
    const db = await fresh();
    await db.query(
      `SELECT ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb)`,
      [
        "deposit:TRON:0xabc:0",
        JSON.stringify([
          { account: "platform:custody:USDT:TRON", amount: u(100) },
          { account: "user:1:available", amount: "-" + u(100) },
        ]),
      ]
    );
    assert.equal(await natural(db, "user:1:available"), u(100));
    assert.equal(await natural(db, "platform:custody:USDT:TRON"), u(100));
  });

  test("an unbalanced transaction is refused at COMMIT", async () => {
    const db = await fresh();
    await rejects(
      () =>
        db.query(`SELECT ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb)`, [
          "deposit:TRON:0xbad:0",
          JSON.stringify([
            { account: "platform:custody:USDT:TRON", amount: u(100) },
            { account: "user:1:available", amount: "-" + u(99) }, // 1 USDT short
          ]),
        ]),
      /unbalanced transaction/
    );
    assert.equal(await count(db, "ledger_entry"), 0, "no entries may survive");
    assert.equal(await count(db, "ledger_transaction"), 0);
  });

  test("a single-leg transaction is refused", async () => {
    const db = await fresh();
    await rejects(
      () =>
        db.query(`SELECT ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb)`, [
          "deposit:TRON:0xsolo:0",
          JSON.stringify([{ account: "user:1:available", amount: "-" + u(50) }]),
        ]),
      /double-entry requires at least 2|unbalanced transaction/
    );
    assert.equal(await count(db, "ledger_entry"), 0);
  });
});

describe("I2 — history is append-only", () => {
  test("UPDATE on an entry is refused", async () => {
    const db = await fresh({ fund: 100 });
    await rejects(
      () => db.query("UPDATE ledger_entry SET amount = 1 WHERE id = 1"),
      /append-only/
    );
  });

  test("DELETE on an entry is refused", async () => {
    const db = await fresh({ fund: 100 });
    await rejects(() => db.query("DELETE FROM ledger_entry WHERE id = 1"), /append-only/);
  });

  test("UPDATE and DELETE on a transaction are refused", async () => {
    const db = await fresh({ fund: 100 });
    await rejects(
      () => db.query("UPDATE ledger_transaction SET kind = 'FORGED' WHERE id = 1"),
      /append-only/
    );
    await rejects(() => db.query("DELETE FROM ledger_transaction WHERE id = 1"), /append-only/);
  });

  test("TRUNCATE is refused", async () => {
    const db = await fresh({ fund: 100 });
    await rejects(() => db.query("TRUNCATE ledger_entry"), /append-only/);
  });
});

describe("I3 — a user account can never go negative", () => {
  test("spending more than the balance is refused", async () => {
    const db = await fresh({ fund: 10 });
    await rejects(
      () =>
        db.query(`SELECT ledger_post($1,'DUEL_ENTRY','SYSTEM',NULL,$2::jsonb)`, [
          "duel:99:entry",
          JSON.stringify([
            { account: "user:1:available", amount: u(11) }, // only 10 held
            { account: "user:1:locked", amount: "-" + u(11) },
          ]),
        ]),
      /insufficient funds/
    );
    assert.equal(await natural(db, "user:1:available"), u(10), "balance untouched");
  });

  test("spending exactly the balance is allowed", async () => {
    const db = await fresh({ fund: 10 });
    await db.query(`SELECT ledger_post($1,'DUEL_ENTRY','SYSTEM',NULL,$2::jsonb)`, [
      "duel:100:entry",
      JSON.stringify([
        { account: "user:1:available", amount: u(10) },
        { account: "user:1:locked", amount: "-" + u(10) },
      ]),
    ]);
    assert.equal(await natural(db, "user:1:available"), "0");
    assert.equal(await natural(db, "user:1:locked"), u(10));
  });
});

describe("I4 — idempotency", () => {
  test("a replayed key returns the original transaction and writes nothing", async () => {
    const db = await fresh();
    const legs = JSON.stringify([
      { account: "platform:custody:USDT:TRON", amount: u(100) },
      { account: "user:1:available", amount: "-" + u(100) },
    ]);
    const key = "deposit:TRON:0xdeadbeef:0";

    const a = await db.query(`SELECT * FROM ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb)`, [key, legs]);
    const b = await db.query(`SELECT * FROM ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb)`, [key, legs]);
    const c = await db.query(`SELECT * FROM ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb)`, [key, legs]);

    assert.equal(a.rows[0].replayed, false);
    assert.equal(b.rows[0].replayed, true);
    assert.equal(c.rows[0].replayed, true);
    assert.equal(String(b.rows[0].transaction_id), String(a.rows[0].transaction_id));

    assert.equal(await count(db, "ledger_entry"), 2, "three calls, one posting");
    assert.equal(await natural(db, "user:1:available"), u(100), "credited exactly once");
  });
});

describe("I5 — adjustments are accountable", () => {
  test("an ADJUSTMENT without a reason is refused", async () => {
    const db = await fresh({ fund: 100 });
    await rejects(
      () =>
        db.query(`SELECT ledger_post($1,'ADJUSTMENT','ADMIN','admin-7',$2::jsonb)`, [
          "adj:1",
          JSON.stringify([
            { account: "platform:suspense", amount: u(5) },
            { account: "user:1:available", amount: "-" + u(5) },
          ]),
        ]),
      /adjustment_is_accountable|violates check constraint/
    );
  });

  test("an ADJUSTMENT by SYSTEM rather than a named admin is refused", async () => {
    const db = await fresh({ fund: 100 });
    await rejects(
      () =>
        db.query(
          `SELECT ledger_post($1,'ADJUSTMENT','SYSTEM',NULL,$2::jsonb,'USDT','goodwill credit')`,
          [
            "adj:2",
            JSON.stringify([
              { account: "platform:suspense", amount: u(5) },
              { account: "user:1:available", amount: "-" + u(5) },
            ]),
          ]
        ),
      /adjustment_is_accountable|violates check constraint/
    );
  });

  test("an ADJUSTMENT with a named admin and a reason is allowed", async () => {
    const db = await fresh({ fund: 100 });
    await db.query(
      `SELECT ledger_post($1,'ADJUSTMENT','ADMIN','admin-7',$2::jsonb,'USDT','goodwill credit, ticket #4192')`,
      [
        "adj:3",
        JSON.stringify([
          { account: "platform:suspense", amount: u(5) },
          { account: "user:1:available", amount: "-" + u(5) },
        ]),
      ]
    );
    assert.equal(await natural(db, "user:1:available"), u(105));
  });
});

describe("structural guards", () => {
  test("an entry cannot name an asset its account does not hold", async () => {
    const db = await fresh();
    await db.query(`INSERT INTO asset (code, minor_units) VALUES ('USDC', 6)`);
    await rejects(
      () =>
        db.query(
          `INSERT INTO ledger_entry (transaction_id, account_id, asset, amount)
           SELECT 1, a.id, 'USDC', 100 FROM ledger_account a WHERE a.key = 'user:1:available'`
        ),
      /ledger_entry_account_asset_fk|violates foreign key/
    );
  });

  test("a zero-amount entry is refused", async () => {
    const db = await fresh();
    await rejects(
      () =>
        db.query(`SELECT ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb)`, [
          "zero:1",
          JSON.stringify([
            { account: "platform:custody:USDT:TRON", amount: "0" },
            { account: "user:1:available", amount: "0" },
          ]),
        ]),
      /amount_nonzero|violates check constraint/
    );
  });

  test("posting to an unknown account is refused", async () => {
    const db = await fresh();
    await rejects(
      () =>
        db.query(`SELECT ledger_post($1,'DEPOSIT','SYSTEM',NULL,$2::jsonb)`, [
          "ghost:1",
          JSON.stringify([
            { account: "platform:custody:USDT:TRON", amount: u(5) },
            { account: "user:404:available", amount: "-" + u(5) },
          ]),
        ]),
      /no such ledger account/
    );
  });

  test("a user account may not be configured to allow negative balances", async () => {
    const db = await fresh();
    await rejects(
      () =>
        db.query(
          `INSERT INTO ledger_account (key, owner_type, owner_id, account_type, normal_side, allow_negative, asset)
           VALUES ('user:666:cheat','USER','666','LIABILITY','CREDIT',TRUE,'USDT')`
        ),
      /users_never_negative|violates check constraint/
    );
  });
});

describe("a full duel, entry to settlement", () => {
  test("stakes lock, rake is taken, and the books balance", async () => {
    const db = await fresh({ fund: 100 });

    // Entry: both players stake 10, moved available -> locked, in one transaction.
    await db.query(`SELECT ledger_post($1,'DUEL_ENTRY','SYSTEM',NULL,$2::jsonb,'USDT',NULL,'duel','7')`, [
      "duel:7:entry",
      JSON.stringify([
        { account: "user:1:available", amount: u(10) },
        { account: "user:1:locked", amount: "-" + u(10) },
        { account: "user:2:available", amount: u(10) },
        { account: "user:2:locked", amount: "-" + u(10) },
      ]),
    ]);

    assert.equal(await natural(db, "user:1:available"), u(90));
    assert.equal(await natural(db, "user:1:locked"), u(10));
    assert.equal(await natural(db, "user:2:locked"), u(10));

    // Settlement: user 2 wins the 20 pot, platform takes 10% rake.
    await db.query(`SELECT ledger_post($1,'DUEL_SETTLE','SYSTEM',NULL,$2::jsonb,'USDT',NULL,'duel','7')`, [
      "duel:7:settle",
      JSON.stringify([
        { account: "user:1:locked", amount: u(10) },
        { account: "user:2:locked", amount: u(10) },
        { account: "user:2:available", amount: "-" + u(18) },
        { account: "platform:rake", amount: "-" + u(2) },
      ]),
    ]);

    assert.equal(await natural(db, "user:1:available"), u(90), "loser keeps the rest");
    assert.equal(await natural(db, "user:1:locked"), "0");
    assert.equal(await natural(db, "user:2:available"), u(108), "winner: 90 + 18");
    assert.equal(await natural(db, "user:2:locked"), "0");
    assert.equal(await natural(db, "platform:rake"), u(2), "10% of a 20 pot");
  });

  test("settlement is idempotent under retry", async () => {
    const db = await fresh({ fund: 100 });
    const settle = () =>
      db.query(`SELECT * FROM ledger_post($1,'DUEL_SETTLE','SYSTEM',NULL,$2::jsonb)`, [
        "duel:8:settle",
        JSON.stringify([
          { account: "user:1:available", amount: u(5) },
          { account: "user:2:available", amount: "-" + u(5) },
        ]),
      ]);
    await settle();
    await settle();
    await settle();
    assert.equal(await natural(db, "user:2:available"), u(105), "paid once, not three times");
  });
});

describe("reconciliation", () => {
  test("L1: the balance snapshot never drifts from the entries", async () => {
    const db = await fresh({ fund: 100 });
    for (let i = 0; i < 25; i++) {
      await db.query(`SELECT ledger_post($1,'DUEL_ENTRY','SYSTEM',NULL,$2::jsonb)`, [
        `duel:${i}:entry`,
        JSON.stringify([
          { account: "user:1:available", amount: u(1) },
          { account: "user:1:locked", amount: "-" + u(1) },
        ]),
      ]);
    }
    const drift = await db.query(
      "SELECT count(*)::int AS c FROM ledger_balance_verification WHERE drift <> 0"
    );
    assert.equal(drift.rows[0].c, 0, "snapshot must agree with the derived sum");
  });

  test("solvency: custody covers every user liability", async () => {
    const db = await fresh({ fund: 100 });
    await db.query(`SELECT ledger_post($1,'DUEL_ENTRY','SYSTEM',NULL,$2::jsonb)`, [
      "duel:9:entry",
      JSON.stringify([
        { account: "user:1:available", amount: u(10) },
        { account: "user:1:locked", amount: "-" + u(10) },
        { account: "user:2:available", amount: u(10) },
        { account: "user:2:locked", amount: "-" + u(10) },
      ]),
    ]);
    await db.query(`SELECT ledger_post($1,'DUEL_SETTLE','SYSTEM',NULL,$2::jsonb)`, [
      "duel:9:settle",
      JSON.stringify([
        { account: "user:1:locked", amount: u(10) },
        { account: "user:2:locked", amount: u(10) },
        { account: "user:2:available", amount: "-" + u(18) },
        { account: "platform:rake", amount: "-" + u(2) },
      ]),
    ]);

    const s = await db.query(
      "SELECT custody_held::text AS held, user_liabilities::text AS owed FROM ledger_solvency WHERE asset = 'USDT'"
    );
    const { held, owed } = s.rows[0];
    assert.equal(held, u(200), "two 100-USDT deposits");
    assert.equal(owed, u(198), "198 owed to users; the 2 difference is rake");
    assert.ok(BigInt(held) >= BigInt(owed), "SOLVENT: custody must cover liabilities");
  });
});
