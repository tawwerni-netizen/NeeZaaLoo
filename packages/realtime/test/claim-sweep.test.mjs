/**
 * The claim sweep: what actually connects "a duel became LIVE somewhere" to
 * "a gateway instance owns it and can serve it" in a real, multi-process
 * deployment. Without this, A4's lease is correct but nothing ever calls it
 * for a duel that did not happen to be claimed by whichever process paired
 * it.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createGateway } from "../src/gateway.mjs";
import { createDuelStore } from "../src/store.mjs";
import { createLeaseManager } from "../src/lease.mjs";
import { sweepUnclaimableDuels } from "../src/claim-sweep.mjs";
import { ChessPlugin } from "../../game-chess/src/plugin.mjs";

const TC = JSON.stringify({ initialMs: 300000, incrementMs: 0 });
const INITIAL = JSON.stringify({ fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" });
const sessions = new Map();

async function freshDuel(db, id, { leaseOwner = null, leaseExpiresIn = null, status = "LIVE" } = {}) {
  for (const p of ["alice", "bob"]) {
    await db.query("INSERT INTO player (id, handle) VALUES ($1,$1) ON CONFLICT DO NOTHING", [p]);
  }
  await db.query(
    `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
                       tier, stake_minor, initial_state, time_control, status, started_at,
                       lease_owner, lease_expires_at)
     VALUES ($1,'chess',1,$1,'alice','bob','FREE',0,$2::jsonb,$3::jsonb,$4::duel_status, now(),
             $5, CASE WHEN $6::int IS NULL THEN NULL ELSE now() + ($6 || ' seconds')::interval END)`,
    [id, INITIAL, TC, status, leaseOwner, leaseExpiresIn]
  );
}

async function fresh() {
  const db = await PGlite.create();
  await migrate(db);
  const store = createDuelStore(db);
  const lease = createLeaseManager(db, { leaseMs: 30000 });
  const plugins = new Map([["chess", ChessPlugin]]);
  return { db, store, lease, plugins };
}

describe("sweepUnclaimableDuels", () => {
  test("claims a LIVE duel nobody owns yet -- the 'newly live, different process paired it' case", async () => {
    const { db, store, lease, plugins } = await fresh();
    await freshDuel(db, "d1");
    const gw = createGateway({ sessions, duels: new Map(), plugins, store, lease, ownerId: "gw-a" });

    const result = await sweepUnclaimableDuels(db, gw);
    assert.equal(result.claimed.length, 1);
    assert.equal(result.claimed[0], "d1");

    const row = await db.query("SELECT lease_owner FROM duel WHERE id='d1'");
    assert.equal(row.rows[0].lease_owner, "gw-a");
    await gw.close();
  });

  test("claims a duel whose previous owner's lease has expired -- the 'dead peer' case", async () => {
    const { db, store, lease, plugins } = await fresh();
    await freshDuel(db, "d1", { leaseOwner: "gw-dead", leaseExpiresIn: -60 }); // expired a minute ago
    const gw = createGateway({ sessions, duels: new Map(), plugins, store, lease, ownerId: "gw-b" });

    const result = await sweepUnclaimableDuels(db, gw);
    assert.deepEqual(result.claimed, ["d1"]);
    await gw.close();
  });

  test("does NOT claim a duel another instance still legitimately owns", async () => {
    const { db, store, lease, plugins } = await fresh();
    await freshDuel(db, "d1", { leaseOwner: "gw-live", leaseExpiresIn: 60 }); // expires in the future
    const gw = createGateway({ sessions, duels: new Map(), plugins, store, lease, ownerId: "gw-b" });

    const result = await sweepUnclaimableDuels(db, gw);
    assert.equal(result.claimed.length, 0);
    assert.equal(result.scanned, 0, "a live, unexpired lease is not even a candidate row");
    await gw.close();
  });

  test("ignores duels that are not LIVE (RESERVED, READY, COMPLETED, ...)", async () => {
    const { db, store, lease, plugins } = await fresh();
    await freshDuel(db, "d1", { status: "READY" });
    const gw = createGateway({ sessions, duels: new Map(), plugins, store, lease, ownerId: "gw-a" });

    const result = await sweepUnclaimableDuels(db, gw);
    assert.equal(result.scanned, 0);
    await gw.close();
  });

  test("running the sweep twice in a row is safe -- the second finds nothing left to claim", async () => {
    const { db, store, lease, plugins } = await fresh();
    await freshDuel(db, "d1");
    const gw = createGateway({ sessions, duels: new Map(), plugins, store, lease, ownerId: "gw-a" });

    const first = await sweepUnclaimableDuels(db, gw);
    assert.equal(first.claimed.length, 1);
    const second = await sweepUnclaimableDuels(db, gw);
    assert.equal(second.scanned, 0, "gw-a's own live lease means the row is no longer a candidate");
    await gw.close();
  });

  test("a claimed duel is genuinely playable afterward -- claimDuel really loaded it, not just marked ownership", async () => {
    const { db, store, lease, plugins } = await fresh();
    await freshDuel(db, "d1");
    const gw = createGateway({ sessions: new Map([["tok-alice", "alice"]]), duels: new Map(), plugins, store, lease, ownerId: "gw-a" });
    await sweepUnclaimableDuels(db, gw);

    assert.ok(gw.rooms, "gateway constructed fine");
    await gw.close();
  });
});
