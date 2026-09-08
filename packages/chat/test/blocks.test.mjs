import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createBlockService, BlockError } from "../src/blocks.mjs";

let db, blocks;

async function player(id, handle = id) { await db.query("INSERT INTO player (id, handle) VALUES ($1,$2)", [id, handle]); }

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  blocks = createBlockService(db);
});

after(async () => { await db.close?.(); });

describe("blockPlayer", () => {
  test("a player cannot block themselves", async () => {
    await player("selfblk1");
    const r = await blocks.blockPlayer("selfblk1", "selfblk1");
    assert.equal(r.ok, false);
    assert.equal(r.reason, BlockError.CANNOT_BLOCK_SELF);
  });

  test("blocking is idempotent -- blocking the same player twice is a no-op, not an error", async () => {
    await player("blkalice1"); await player("blkbob1");
    const first = await blocks.blockPlayer("blkalice1", "blkbob1");
    const second = await blocks.blockPlayer("blkalice1", "blkbob1");
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    const set = await blocks.blockedSetFor("blkalice1");
    assert.equal(set.size, 1);
  });

  test("blocking is directional -- A blocking B does not mean B has blocked A", async () => {
    await player("blkalice2"); await player("blkbob2");
    await blocks.blockPlayer("blkalice2", "blkbob2");
    assert.equal((await blocks.blockedSetFor("blkalice2")).has("blkbob2"), true);
    assert.equal((await blocks.blockedSetFor("blkbob2")).has("blkalice2"), false);
  });
});

describe("unblockPlayer", () => {
  test("unblocking removes the block", async () => {
    await player("blkalice3"); await player("blkbob3");
    await blocks.blockPlayer("blkalice3", "blkbob3");
    await blocks.unblockPlayer("blkalice3", "blkbob3");
    assert.equal((await blocks.blockedSetFor("blkalice3")).has("blkbob3"), false);
  });

  test("unblocking someone never blocked is a harmless no-op", async () => {
    await player("blkalice4"); await player("blkbob4");
    const r = await blocks.unblockPlayer("blkalice4", "blkbob4");
    assert.equal(r.ok, true);
  });
});

describe("listBlockedBy", () => {
  test("returns the blocked player's nickname alongside the block", async () => {
    await player("blkalice5"); await player("blkbob5", "BeeHandle");
    await blocks.blockPlayer("blkalice5", "blkbob5");
    const list = await blocks.listBlockedBy("blkalice5");
    assert.equal(list.length, 1);
    assert.equal(list[0].blocked_id, "blkbob5");
    assert.equal(list[0].handle, "BeeHandle");
  });
});
