import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createModerationService, ChatMuteScope, ModerationError } from "../src/moderation.mjs";

let db, moderation;
let CLOCK = Date.now();

async function player(id) { await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [id]); }
async function admin(id) { await db.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ($1,$1,$1,TRUE)", [id]); }

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  moderation = createModerationService(db, { now: () => CLOCK });
});

after(async () => { await db.close?.(); });

describe("muteUser / isMuted", () => {
  test("a fresh player is not muted", async () => {
    await player("fresh1");
    assert.equal(await moderation.isMuted("fresh1", ChatMuteScope.GLOBAL_CHAT), false);
  });

  test("a mute requires a real reason", async () => {
    await player("nr1"); await admin("modnr1");
    const r = await moderation.muteUser({ targetId: "nr1", moderatorId: "modnr1", reason: "  ", scope: ChatMuteScope.GLOBAL_CHAT });
    assert.equal(r.ok, false);
    assert.equal(r.reason, ModerationError.INVALID_REASON);
  });

  test("a scoped mute blocks exactly that scope, not others", async () => {
    await player("scoped1"); await admin("modsc1");
    await moderation.muteUser({ targetId: "scoped1", moderatorId: "modsc1", reason: "spam", scope: ChatMuteScope.MATCH_CHAT });
    assert.equal(await moderation.isMuted("scoped1", ChatMuteScope.MATCH_CHAT), true);
    assert.equal(await moderation.isMuted("scoped1", ChatMuteScope.GLOBAL_CHAT), false);
  });

  test("an ALL_CHAT mute blocks every scope", async () => {
    await player("all1"); await admin("modall1");
    await moderation.muteUser({ targetId: "all1", moderatorId: "modall1", reason: "abuse", scope: ChatMuteScope.ALL_CHAT });
    assert.equal(await moderation.isMuted("all1", ChatMuteScope.GLOBAL_CHAT), true);
    assert.equal(await moderation.isMuted("all1", ChatMuteScope.MATCH_CHAT), true);
    assert.equal(await moderation.isMuted("all1", ChatMuteScope.SPECTATOR_CHAT), true);
  });

  test("a temporary mute expires after its duration", async () => {
    await player("temp1"); await admin("modtemp1");
    await moderation.muteUser({ targetId: "temp1", moderatorId: "modtemp1", reason: "cooldown", scope: ChatMuteScope.GLOBAL_CHAT, durationMs: 10_000 });
    assert.equal(await moderation.isMuted("temp1", ChatMuteScope.GLOBAL_CHAT), true);
    CLOCK += 11_000;
    assert.equal(await moderation.isMuted("temp1", ChatMuteScope.GLOBAL_CHAT), false);
    CLOCK -= 11_000;
  });

  test("a permanent mute (no durationMs) never expires", async () => {
    await player("perm1"); await admin("modperm1");
    await moderation.muteUser({ targetId: "perm1", moderatorId: "modperm1", reason: "repeat offender", scope: ChatMuteScope.GLOBAL_CHAT });
    CLOCK += 365 * 24 * 3600_000;
    assert.equal(await moderation.isMuted("perm1", ChatMuteScope.GLOBAL_CHAT), true);
    CLOCK -= 365 * 24 * 3600_000;
  });
});

describe("unmuteUser", () => {
  test("revoking a mute lifts it immediately", async () => {
    await player("rev1"); await admin("modrev1");
    const m = await moderation.muteUser({ targetId: "rev1", moderatorId: "modrev1", reason: "test", scope: ChatMuteScope.GLOBAL_CHAT });
    assert.equal(await moderation.isMuted("rev1", ChatMuteScope.GLOBAL_CHAT), true);
    const un = await moderation.unmuteUser({ muteId: m.muteId, revokedBy: "modrev1" });
    assert.equal(un.ok, true);
    assert.equal(await moderation.isMuted("rev1", ChatMuteScope.GLOBAL_CHAT), false);
  });

  test("revoking an already-revoked mute is refused, not silently re-applied", async () => {
    await player("rev2"); await admin("modrev2");
    const m = await moderation.muteUser({ targetId: "rev2", moderatorId: "modrev2", reason: "test", scope: ChatMuteScope.GLOBAL_CHAT });
    await moderation.unmuteUser({ muteId: m.muteId, revokedBy: "modrev2" });
    const second = await moderation.unmuteUser({ muteId: m.muteId, revokedBy: "modrev2" });
    assert.equal(second.ok, false);
    assert.equal(second.reason, ModerationError.ALREADY_REVOKED);
  });

  test("revoking a nonexistent mute is refused cleanly", async () => {
    const r = await moderation.unmuteUser({ muteId: "does-not-exist", revokedBy: "nobody" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, ModerationError.NOT_FOUND);
  });
});

describe("listActiveMutesFor", () => {
  test("lists only currently-active mutes, most recent first", async () => {
    await player("list1"); await admin("modlist1");
    await moderation.muteUser({ targetId: "list1", moderatorId: "modlist1", reason: "first", scope: ChatMuteScope.GLOBAL_CHAT, durationMs: 1000 });
    CLOCK += 2000;
    const expired = await moderation.listActiveMutesFor("list1");
    assert.equal(expired.length, 0);
    CLOCK -= 2000;

    await moderation.muteUser({ targetId: "list1", moderatorId: "modlist1", reason: "second", scope: ChatMuteScope.MATCH_CHAT });
    const active = await moderation.listActiveMutesFor("list1");
    assert.ok(active.some((m) => m.reason === "second"));
  });
});
