/**
 * VS_COMPUTER: "FREE ONLY. A computer opponent must never be presented as
 * a real-money opponent." createDuel()'s own signature has no tier/stake
 * parameter at all -- this is what proves that is structural, not merely
 * a UI omission: a caller that smuggles a `tier`/`stakeMinor` field in
 * (a stale client, a compromised frontend, a direct API call) gets a
 * silently-ignored extra field and an unconditionally FREE, zero-stake duel.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createVsComputerService, VsComputerError, Difficulty } from "../src/vs-computer.mjs";

async function fresh() {
  const db = await PGlite.create();
  await migrate(db);
  await db.query("INSERT INTO player (id, handle) VALUES ('alice','alice')");
  return db;
}

describe("COMPETITIVE VS COMPUTER REQUEST: structurally impossible, not merely refused", () => {
  test("a request smuggling tier/stakeMinor still creates a FREE, zero-stake duel -- those fields do not exist on this function's signature", async () => {
    const db = await fresh();
    const svc = createVsComputerService(db);
    const r = await svc.createDuel({
      gameId: "chess", playerId: "alice", difficulty: Difficulty.MEDIUM,
      // A confused or hostile caller's extra fields -- there is no
      // parameter here for either to bind to.
      tier: "CASH", stakeMinor: "2000000000",
    });
    assert.equal(r.ok, true);
    const row = await db.query("SELECT tier, stake_minor::text st, is_vs_computer FROM duel WHERE id=$1", [r.duelId]);
    assert.equal(row.rows[0].tier, "FREE");
    assert.equal(row.rows[0].st, "0");
    assert.equal(row.rows[0].is_vs_computer, true);
  });

  test("every difficulty produces a FREE duel, never a stake of any kind", async () => {
    const db = await fresh();
    const svc = createVsComputerService(db);
    for (const difficulty of Object.values(Difficulty)) {
      const r = await svc.createDuel({ gameId: "chess", playerId: "alice", difficulty });
      const row = await db.query("SELECT tier, stake_minor::text st FROM duel WHERE id=$1", [r.duelId]);
      assert.equal(row.rows[0].tier, "FREE", `${difficulty} must be FREE`);
      assert.equal(row.rows[0].st, "0", `${difficulty} must have zero stake`);
    }
  });

  test("an unknown difficulty is refused outright -- not silently defaulted", async () => {
    const db = await fresh();
    const svc = createVsComputerService(db);
    const r = await svc.createDuel({ gameId: "chess", playerId: "alice", difficulty: "IMPOSSIBLE" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, VsComputerError.UNKNOWN_DIFFICULTY);
  });

  test("a game with no registered AI adapter is refused, never silently played against a bot that can't move", async () => {
    const db = await fresh();
    const svc = createVsComputerService(db);
    const r = await svc.createDuel({ gameId: "not-a-real-game", playerId: "alice", difficulty: Difficulty.EASY });
    assert.equal(r.ok, false);
    assert.equal(r.reason, VsComputerError.UNSUPPORTED_GAME);
  });
});
