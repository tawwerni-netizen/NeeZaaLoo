import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createChannelService, ChatAuthError, matchChannelId, globalChannelId, isChannelOpenForWrites } from "../src/channels.mjs";

let db, channels;

async function player(id) {
  await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [id]);
}

async function duel(id, seat0, seat1) {
  await db.query(
    `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1, tier, stake_minor, initial_state, time_control)
     VALUES ($1,'chess',1,$1,$2,$3,'FREE',0,'{}'::jsonb,'{}'::jsonb)`,
    [id, seat0, seat1]
  );
}

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  channels = createChannelService(db);
});

after(async () => { await db.close?.(); });

describe("the global channel", () => {
  test("was seeded by migration, not created lazily", async () => {
    const ch = await channels.getChannel(globalChannelId());
    assert.ok(ch);
    assert.equal(ch.type, "GLOBAL");
    assert.equal(ch.status, "ACTIVE");
  });

  test("any authenticated player may access it", async () => {
    await player("anyone1");
    const ch = await channels.getChannel(globalChannelId());
    const r = await channels.canAccessChannel(ch, "anyone1");
    assert.equal(r.ok, true);
  });
});

describe("match channels", () => {
  test("getOrCreateMatchChannel creates a channel tied to the real duel", async () => {
    await player("p1a"); await player("p1b");
    await duel("duel1", "p1a", "p1b");
    const ch = await channels.getOrCreateMatchChannel("duel1");
    assert.equal(ch.type, "MATCH");
    assert.equal(ch.reference_type, "DUEL");
    assert.equal(ch.reference_id, "duel1");
    assert.equal(ch.id, matchChannelId("duel1"));
  });

  test("calling getOrCreateMatchChannel twice returns the SAME channel, never a duplicate", async () => {
    await player("p2a"); await player("p2b");
    await duel("duel2", "p2a", "p2b");
    const a = await channels.getOrCreateMatchChannel("duel2");
    const b = await channels.getOrCreateMatchChannel("duel2");
    assert.equal(a.id, b.id);
    const count = await db.query("SELECT count(*)::int AS n FROM chat_channel WHERE reference_id = 'duel2'");
    assert.equal(count.rows[0].n, 1);
  });

  test("a real seated player can access the match channel", async () => {
    await player("p3a"); await player("p3b");
    await duel("duel3", "p3a", "p3b");
    const ch = await channels.getOrCreateMatchChannel("duel3");
    const r = await channels.canAccessChannel(ch, "p3a");
    assert.equal(r.ok, true);
  });

  test("a player who is NOT seated in the duel is refused -- authorization is derived from the real duel row, never the client's claim", async () => {
    await player("p4a"); await player("p4b"); await player("outsider4");
    await duel("duel4", "p4a", "p4b");
    const ch = await channels.getOrCreateMatchChannel("duel4");
    const r = await channels.canAccessChannel(ch, "outsider4");
    assert.equal(r.ok, false);
    assert.equal(r.reason, ChatAuthError.NOT_A_PARTICIPANT);
  });

  test("a channel referencing a duel that does not exist is refused cleanly", async () => {
    await player("p5a");
    const fakeChannel = { type: "MATCH", reference_type: "DUEL", reference_id: "no-such-duel", status: "ACTIVE" };
    const r = await channels.canAccessChannel(fakeChannel, "p5a");
    assert.equal(r.ok, false);
    assert.equal(r.reason, ChatAuthError.NO_SUCH_MATCH);
  });

  test("a nonexistent channel id is refused cleanly", async () => {
    const ch = await channels.getChannel("match:does-not-exist");
    const r = await channels.canAccessChannel(ch, "anyone");
    assert.equal(r.ok, false);
    assert.equal(r.reason, ChatAuthError.NO_SUCH_CHANNEL);
  });
});

describe("spectator channels (Slice 10)", () => {
  test("getOrCreateSpectatorChannel is idempotent, the same shape as getOrCreateMatchChannel", async () => {
    await player("spec1a"); await player("spec1b");
    await duel("duel-spec1", "spec1a", "spec1b");
    const first = await channels.getOrCreateSpectatorChannel("duel-spec1");
    const second = await channels.getOrCreateSpectatorChannel("duel-spec1");
    assert.equal(first.id, "spectator:duel-spec1");
    assert.equal(first.id, second.id);
    assert.equal(first.type, "SPECTATOR");
  });

  test("under the default OPEN policy, a non-participant CAN access the spectator channel", async () => {
    await player("spec2a"); await player("spec2b"); await player("spec2c");
    await duel("duel-spec2", "spec2a", "spec2b");
    const ch = await channels.getOrCreateSpectatorChannel("duel-spec2");
    const r = await channels.canAccessChannel(ch, "spec2c");
    assert.equal(r.ok, true);
  });

  test("a seated player always has access to their own match's spectator channel, regardless of policy", async () => {
    await player("spec3a"); await player("spec3b");
    await duel("duel-spec3", "spec3a", "spec3b");
    await db.query("UPDATE duel SET spectator_policy='PLAYERS_ONLY' WHERE id='duel-spec3'");
    const ch = await channels.getOrCreateSpectatorChannel("duel-spec3");
    const r = await channels.canAccessChannel(ch, "spec3a");
    assert.equal(r.ok, true);
  });

  test("PLAYERS_ONLY policy refuses a non-participant with SPECTATORS_DISABLED", async () => {
    await player("spec4a"); await player("spec4b"); await player("spec4c");
    await duel("duel-spec4", "spec4a", "spec4b");
    await db.query("UPDATE duel SET spectator_policy='PLAYERS_ONLY' WHERE id='duel-spec4'");
    const ch = await channels.getOrCreateSpectatorChannel("duel-spec4");
    const r = await channels.canAccessChannel(ch, "spec4c");
    assert.equal(r.ok, false);
    assert.equal(r.reason, ChatAuthError.SPECTATORS_DISABLED);
  });

  test("a spectator channel for a nonexistent duel is refused cleanly", async () => {
    const ch = { type: "SPECTATOR", reference_type: "DUEL", reference_id: "no-such-duel", status: "ACTIVE" };
    const r = await channels.canAccessChannel(ch, "anyone");
    assert.equal(r.ok, false);
    assert.equal(r.reason, ChatAuthError.NO_SUCH_MATCH);
  });
});

describe("match channel lifecycle (Slice 10)", () => {
  test("a fresh match channel has no post_game_deadline and is open for writes", async () => {
    await player("life1a"); await player("life1b");
    await duel("duel-life1", "life1a", "life1b");
    const ch = await channels.getOrCreateMatchChannel("duel-life1");
    assert.equal(ch.post_game_deadline, null);
    assert.equal(isChannelOpenForWrites(ch, Date.now()), true);
  });

  test("markMatchCompleted stamps BOTH the match and spectator channels for that duel in one call", async () => {
    await player("life2a"); await player("life2b");
    await duel("duel-life2", "life2a", "life2b");
    await channels.getOrCreateMatchChannel("duel-life2");
    await channels.getOrCreateSpectatorChannel("duel-life2");
    await channels.markMatchCompleted("duel-life2", { at: 1_000_000, windowMs: 5000 });
    const match = await channels.getChannel("match:duel-life2");
    const spectator = await channels.getChannel("spectator:duel-life2");
    assert.equal(new Date(match.post_game_deadline).getTime(), 1_005_000);
    assert.equal(new Date(spectator.post_game_deadline).getTime(), 1_005_000);
  });

  test("markMatchCompleted is set-once: a second call does not push the deadline out further", async () => {
    await player("life3a"); await player("life3b");
    await duel("duel-life3", "life3a", "life3b");
    await channels.getOrCreateMatchChannel("duel-life3");
    await channels.markMatchCompleted("duel-life3", { at: 1_000_000, windowMs: 5000 });
    await channels.markMatchCompleted("duel-life3", { at: 9_000_000, windowMs: 5000 });
    const ch = await channels.getChannel("match:duel-life3");
    assert.equal(new Date(ch.post_game_deadline).getTime(), 1_005_000);
  });

  test("markMatchCompleted for a duel that was never chatted about matches zero rows harmlessly", async () => {
    await player("life4a"); await player("life4b");
    await duel("duel-life4", "life4a", "life4b");
    await assert.doesNotReject(channels.markMatchCompleted("duel-life4", { at: 1, windowMs: 1 }));
  });

  test("isChannelOpenForWrites: before the deadline is open, at/after the deadline is closed", async () => {
    const ch = { status: "ACTIVE", post_game_deadline: new Date(1_005_000).toISOString() };
    assert.equal(isChannelOpenForWrites(ch, 1_004_999), true);
    assert.equal(isChannelOpenForWrites(ch, 1_005_000), false);
    assert.equal(isChannelOpenForWrites(ch, 2_000_000), false);
  });

  test("a CLOSED channel (status) is never open for writes regardless of deadline", () => {
    const ch = { status: "CLOSED", post_game_deadline: null };
    assert.equal(isChannelOpenForWrites(ch, Date.now()), false);
  });

  test("canAccessChannel (read) stays TRUE for a participant even after the post-game window has fully elapsed -- retention, not access", async () => {
    await player("life5a"); await player("life5b");
    await duel("duel-life5", "life5a", "life5b");
    const ch = await channels.getOrCreateMatchChannel("duel-life5");
    await channels.markMatchCompleted("duel-life5", { at: 0, windowMs: 1 });
    const stillClosed = await channels.getChannel("match:duel-life5");
    assert.equal(isChannelOpenForWrites(stillClosed, Date.now()), false, "sanity: the window really has elapsed");
    const r = await channels.canAccessChannel(stillClosed, "life5a");
    assert.equal(r.ok, true, "reading/rejoining history must remain allowed for a real participant after CLOSED");
  });
});

describe("channel status", () => {
  test("a CLOSED channel refuses access even to an otherwise-eligible participant", async () => {
    await player("p6a"); await player("p6b");
    await duel("duel6", "p6a", "p6b");
    const ch = await channels.getOrCreateMatchChannel("duel6");
    await db.query("UPDATE chat_channel SET status = 'CLOSED' WHERE id = $1", [ch.id]);
    const closed = await channels.getChannel(ch.id);
    const r = await channels.canAccessChannel(closed, "p6a");
    assert.equal(r.ok, false);
    assert.equal(r.reason, ChatAuthError.CHANNEL_CLOSED);
  });
});
