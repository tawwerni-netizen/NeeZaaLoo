/**
 * The duel ownership lease (A4): acquire, renew, release, and the fencing
 * token that makes a stale owner's belief irrelevant.
 *
 * This file tests the lease manager in isolation, against a real duel row --
 * no gateway involved. `lease-ownership.test.mjs` proves the same guarantees
 * hold when two actual gateway instances are the ones racing.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createLeaseManager, LeaseResult } from "../src/lease.mjs";

const TC = JSON.stringify({ initialMs: 300000, incrementMs: 0 });
const INITIAL = JSON.stringify({ fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" });

async function fresh() {
  const db = await PGlite.create();
  await migrate(db);
  for (const p of ["alice", "bob"]) await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [p]);
  await db.query(
    `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
                       tier, stake_minor, initial_state, time_control, status)
     VALUES ('d1','chess',1,'pk','alice','bob','FREE',0,$1::jsonb,$2::jsonb,'READY'::duel_status)`,
    [INITIAL, TC]
  );
  return { db, lease: createLeaseManager(db, { leaseMs: 50 }) };
}

describe("acquire", () => {
  test("an unowned duel is acquired, starting the token at 1", async () => {
    const { lease } = await fresh();
    const res = await lease.acquire("d1", "gw-a");
    assert.equal(res.ok, true);
    assert.equal(res.token, 1);
  });

  test("a second instance cannot acquire a duel whose lease is still live", async () => {
    const { lease } = await fresh();
    await lease.acquire("d1", "gw-a");
    const res = await lease.acquire("d1", "gw-b");
    assert.equal(res.ok, false);
    assert.equal(res.reason, LeaseResult.HELD_BY_OTHER);
  });

  test("re-acquiring your own live lease is a harmless no-op -- same token, no bump", async () => {
    const { lease } = await fresh();
    const first = await lease.acquire("d1", "gw-a");
    const second = await lease.acquire("d1", "gw-a");
    assert.equal(second.ok, true);
    assert.equal(second.token, first.token);
  });

  test("acquiring a nonexistent duel is a clean, distinct failure", async () => {
    const { lease } = await fresh();
    const res = await lease.acquire("no-such-duel", "gw-a");
    assert.equal(res.ok, false);
    assert.equal(res.reason, LeaseResult.NO_SUCH_DUEL);
  });

  test("once a lease expires, a DIFFERENT instance can take over, and the token strictly increases", async () => {
    const { lease } = await fresh();
    const a = await lease.acquire("d1", "gw-a");
    await new Promise((r) => setTimeout(r, 80)); // past the 50ms lease
    const b = await lease.acquire("d1", "gw-b");
    assert.equal(b.ok, true);
    assert.ok(b.token > a.token);
  });
});

describe("renew", () => {
  test("the current owner can extend its own lease without changing the token", async () => {
    const { lease } = await fresh();
    const a = await lease.acquire("d1", "gw-a");
    const renewed = await lease.renew("d1", "gw-a");
    assert.equal(renewed.ok, true);
    assert.equal(renewed.token, a.token);
  });

  test("renewing keeps a lease alive past when it would otherwise have expired", async () => {
    const { lease } = await fresh();
    await lease.acquire("d1", "gw-a");
    await new Promise((r) => setTimeout(r, 30));
    await lease.renew("d1", "gw-a"); // resets the 50ms window
    await new Promise((r) => setTimeout(r, 30)); // 60ms since acquire, but only 30ms since renew
    const attempt = await lease.renew("d1", "gw-a");
    assert.equal(attempt.ok, true, "still owned -- the renewal actually extended the deadline");
  });

  test("a non-owner's renewal attempt fails cleanly", async () => {
    const { lease } = await fresh();
    await lease.acquire("d1", "gw-a");
    const res = await lease.renew("d1", "gw-b");
    assert.equal(res.ok, false);
    assert.equal(res.reason, LeaseResult.LOST);
  });

  test("once taken over, the ORIGINAL owner's renewal fails -- it has genuinely lost the lease", async () => {
    const { lease } = await fresh();
    await lease.acquire("d1", "gw-a");
    await new Promise((r) => setTimeout(r, 80));
    await lease.acquire("d1", "gw-b");
    const res = await lease.renew("d1", "gw-a");
    assert.equal(res.ok, false);
    assert.equal(res.reason, LeaseResult.LOST);
  });
});

describe("release", () => {
  test("releasing frees the duel for immediate acquisition by anyone", async () => {
    const { lease } = await fresh();
    await lease.acquire("d1", "gw-a");
    await lease.release("d1", "gw-a");
    const res = await lease.acquire("d1", "gw-b");
    assert.equal(res.ok, true);
  });

  test("releasing a lease you do not hold is a no-op, not an error, and does not evict the real owner", async () => {
    const { lease } = await fresh();
    await lease.acquire("d1", "gw-a");
    await lease.release("d1", "gw-b"); // gw-b never owned it
    const still = await lease.current("d1");
    assert.equal(still.owner, "gw-a");
  });
});

describe("fencing token semantics", () => {
  test("every successful acquire after a takeover produces a strictly higher token than any before it", async () => {
    const { lease } = await fresh();
    const tokens = [];
    tokens.push((await lease.acquire("d1", "gw-a")).token);
    await new Promise((r) => setTimeout(r, 80));
    tokens.push((await lease.acquire("d1", "gw-b")).token);
    await new Promise((r) => setTimeout(r, 80));
    tokens.push((await lease.acquire("d1", "gw-a")).token);
    assert.deepEqual(tokens, [...tokens].sort((a, b) => a - b), "tokens are non-decreasing");
    assert.equal(new Set(tokens).size, tokens.length, "every takeover mints a genuinely new token");
  });
});
