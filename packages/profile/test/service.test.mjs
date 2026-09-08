import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createGlobalSkillService } from "../../global-skill/src/service.mjs";
import { createNicknameService } from "../src/nickname.mjs";
import { createExpService } from "../src/exp.mjs";
import { createAchievementService } from "../src/achievements.mjs";
import { createBadgeService, BadgeSource } from "../src/badges.mjs";
import { createMockAvatarStorage } from "../src/avatar-storage.mjs";
import { createProfileService, ProfileError } from "../src/service.mjs";
import { BioError } from "../src/bio.mjs";
import { NicknameError } from "../src/nickname.mjs";

let db, profile, exp, achievements, badges, avatarStorage;
let CLOCK = Date.now();

async function player(id, handle = id) {
  await db.query("INSERT INTO player (id, handle) VALUES ($1,$2)", [id, handle]);
}

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  const nicknameService = createNicknameService(db, { now: () => CLOCK });
  exp = createExpService(db, { now: () => CLOCK });
  achievements = createAchievementService(db, { now: () => CLOCK });
  badges = createBadgeService(db, { now: () => CLOCK });
  avatarStorage = createMockAvatarStorage();
  const globalSkill = createGlobalSkillService(db);
  profile = createProfileService(db, {
    nicknameService, expService: exp, achievementService: achievements, badgeService: badges, avatarStorage, globalSkill,
    now: () => CLOCK,
  });
});

after(async () => { await db.close?.(); });

describe("publicProfileFor / ownProfile", () => {
  test("a freshly registered player has a complete, sensible-defaults profile", async () => {
    await player("alice");
    const p = await profile.publicProfileFor("alice");
    assert.equal(p.nickname, "alice");
    assert.equal(p.bio, "");
    assert.equal(p.avatarUrl, null);
    assert.equal(p.selectedBadge, null);
    assert.equal(p.exp.level, 1);
    assert.equal(p.exp.totalExp, 0);
    assert.equal(p.globalSkill, null, "no established ratings yet");
    assert.deepEqual(p.ratings, []);
    assert.deepEqual(p.stats, { games: 0, wins: 0, losses: 0, draws: 0 });
    assert.deepEqual(p.achievements, []);
    assert.deepEqual(p.badges, []);
    assert.ok(p.memberSince);
  });

  test("ownProfile and publicProfileFor return the exact same shape for the same player", async () => {
    await player("bob");
    const own = await profile.ownProfile("bob");
    const pub = await profile.publicProfileFor("bob");
    assert.deepEqual(own, pub);
  });

  test("never exposes email, wallet, provider subject, or any internal session/security field", async () => {
    await player("carol");
    const p = await profile.publicProfileFor("carol");
    const serialized = JSON.stringify(p).toLowerCase();
    for (const forbidden of ["email", "wallet", "balance", "deposit", "withdraw", "kyc", "provider_subject", "session", "password", "token"]) {
      assert.equal(serialized.includes(forbidden), false, `profile leaked a "${forbidden}"-shaped field`);
    }
  });

  test("a nonexistent player returns null, not a throw", async () => {
    assert.equal(await profile.publicProfileFor("does-not-exist"), null);
  });

  test("publicProfileByNickname resolves by the CURRENT nickname, surviving a rename -- id and handle are not the same lookup key once a player has renamed", async () => {
    await player("renameid1", "OriginalNick");
    const byOriginal = await profile.publicProfileByNickname("OriginalNick");
    assert.equal(byOriginal.id, "renameid1");

    await db.query("UPDATE player SET handle = 'RenamedNick' WHERE id = 'renameid1'");

    const byOldNickAfterRename = await profile.publicProfileByNickname("OriginalNick");
    assert.equal(byOldNickAfterRename, null, "the OLD nickname must no longer resolve to anyone");

    const byNewNick = await profile.publicProfileByNickname("RenamedNick");
    assert.equal(byNewNick.id, "renameid1", "the NEW nickname must resolve to the same player");

    // Confirms the bug this test exists to catch: looking up by the bare
    // internal id (which no longer equals the current nickname) must NOT
    // silently succeed by accident.
    assert.equal(await profile.publicProfileByNickname("renameid1"), null);
  });

  test("previewByNickname also resolves by the current nickname", async () => {
    await player("previewrename1", "PreviewOriginal");
    await db.query("UPDATE player SET handle = 'PreviewRenamed' WHERE id = 'previewrename1'");
    const preview = await profile.previewByNickname("PreviewRenamed");
    assert.equal(preview.id, "previewrename1");
    assert.equal(await profile.previewByNickname("PreviewOriginal"), null);
  });

  test("nickname resolution is case-insensitive, matching nickname.mjs's own uniqueness rule", async () => {
    await player("caseresolve1", "CaseSensitiveNick");
    const p = await profile.publicProfileByNickname("casesensitivenick");
    assert.equal(p.id, "caseresolve1");
  });

  test("reflects awarded EXP, achievements and badges", async () => {
    await player("dan");
    await exp.award({ playerId: "dan", eventType: "GAME_WON", amount: 25, dedupeKey: "dan:w1" });
    await achievements.award("dan", "FIRST_WIN");
    await badges.award("dan", "FIRST_WIN", BadgeSource.ACHIEVEMENT);
    const p = await profile.publicProfileFor("dan");
    assert.equal(p.exp.totalExp, 25);
    assert.deepEqual(p.achievements, ["FIRST_WIN"]);
    assert.deepEqual(p.badges, [{ code: "FIRST_WIN", source: "ACHIEVEMENT" }]);
  });

  test("reflects game ratings and win/loss stats once real duels exist", async () => {
    await player("erin");
    await db.query(
      "INSERT INTO rating (player_id, game_id, rating_x100, games_played, last_played_at) VALUES ($1,'chess',162000,12,now())",
      ["erin"]
    );
    // A minimal completed duel so win/loss aggregation has something real to count.
    await player("erin-opponent");
    await db.query(
      `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1, tier, initial_state, time_control, status, result, termination_reason, completed_at)
       VALUES ('d1','chess',1,'pk1','erin','erin-opponent','FREE','{}','{}','COMPLETED','1-0','NORMAL', now())`
    );
    const p = await profile.publicProfileFor("erin");
    assert.equal(p.ratings.length, 1);
    assert.equal(p.ratings[0].gameId, "chess");
    assert.equal(p.ratings[0].rating, 1620);
    assert.deepEqual(p.stats, { games: 1, wins: 1, losses: 0, draws: 0 });
  });
});

describe("previewFor", () => {
  test("returns a small shape with only preview-relevant fields", async () => {
    await player("frank");
    const preview = await profile.previewFor("frank");
    assert.deepEqual(Object.keys(preview).sort(), ["avatarUrl", "exp", "globalSkill", "id", "level", "nickname", "selectedBadge"].sort());
    assert.equal(preview.nickname, "frank");
    assert.equal(preview.level, 1);
  });

  test("a nonexistent player returns null", async () => {
    assert.equal(await profile.previewFor("nope"), null);
  });
});

describe("updateProfile", () => {
  test("updates nickname and bio together in one call", async () => {
    await player("grace");
    const r = await profile.updateProfile("grace", { nickname: "GraceTheGreat", bio: "I play chess." });
    assert.equal(r.ok, true);
    assert.equal(r.profile.nickname, "GraceTheGreat");
    assert.equal(r.profile.bio, "I play chess.");
  });

  test("an invalid nickname refuses the WHOLE update, including the bio in the same call", async () => {
    await player("henry");
    const r = await profile.updateProfile("henry", { nickname: "ab", bio: "should not be saved" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, NicknameError.INVALID_SHAPE);
    const row = await db.query("SELECT bio FROM player WHERE id = 'henry'");
    assert.equal(row.rows[0].bio, "", "bio must be untouched when nickname validation fails first");
  });

  test("an invalid (too long) bio is refused", async () => {
    await player("iris");
    const r = await profile.updateProfile("iris", { bio: "x".repeat(281) });
    assert.equal(r.ok, false);
    assert.equal(r.reason, BioError.TOO_LONG);
  });

  test("bio is sanitized before storage -- no markup survives", async () => {
    await player("jack");
    await profile.updateProfile("jack", { bio: "hi <script>alert(1)</script> there" });
    const row = await db.query("SELECT bio FROM player WHERE id = 'jack'");
    assert.equal(row.rows[0].bio.includes("<"), false);
  });

  test("a bio-only update writes PROFILE_UPDATED; a nickname-only update writes NICKNAME_CHANGED, not both", async () => {
    await player("kate");
    await profile.updateProfile("kate", { bio: "just a bio change" });
    const events = await db.query("SELECT type FROM security_event WHERE player_id = 'kate'");
    assert.deepEqual(events.rows.map((r) => r.type), ["PROFILE_UPDATED"]);
  });

  test("omitting a field entirely leaves it unchanged", async () => {
    await player("liam");
    await profile.updateProfile("liam", { bio: "original bio" });
    const r = await profile.updateProfile("liam", { nickname: "LiamRenamed" });
    assert.equal(r.ok, true);
    assert.equal(r.profile.bio, "original bio");
  });
});

describe("setAvatar", () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50)]);

  test("a valid avatar upload succeeds and updates the public profile's avatarUrl", async () => {
    await player("mia");
    const r = await profile.setAvatar("mia", PNG);
    assert.equal(r.ok, true);
    assert.match(r.avatarUrl, /^https:\/\/avatars\.test\//);
    const p = await profile.publicProfileFor("mia");
    assert.equal(p.avatarUrl, r.avatarUrl);
  });

  test("an invalid (non-image) upload is refused, and does not touch the existing avatar", async () => {
    await player("noah");
    await profile.setAvatar("noah", PNG);
    const before = (await profile.publicProfileFor("noah")).avatarUrl;
    const r = await profile.setAvatar("noah", Buffer.from("not an image"));
    assert.equal(r.ok, false);
    const after = (await profile.publicProfileFor("noah")).avatarUrl;
    assert.equal(after, before);
  });

  test("replacing an avatar deletes the old stored file", async () => {
    await player("olive");
    await profile.setAvatar("olive", PNG);
    const firstKey = (await db.query("SELECT avatar_key FROM player WHERE id = 'olive'")).rows[0].avatar_key;
    await profile.setAvatar("olive", PNG);
    assert.equal(avatarStorage._store.has(firstKey), false);
  });

  test("setting an avatar writes an AVATAR_CHANGED security event", async () => {
    await player("peter");
    await profile.setAvatar("peter", PNG);
    const events = await db.query("SELECT type FROM security_event WHERE player_id = 'peter' AND type = 'AVATAR_CHANGED'");
    assert.equal(events.rows.length, 1);
  });
});

describe("reportContent", () => {
  test("a player can report another player's content", async () => {
    await player("quinn");
    await player("rick");
    const r = await profile.reportContent({ reporterId: "quinn", subjectPlayerId: "rick", contentType: "BIO", reason: "inappropriate" });
    assert.equal(r.ok, true);
    assert.ok(r.reportId);
  });

  test("a player cannot report themselves", async () => {
    await player("sam");
    const r = await profile.reportContent({ reporterId: "sam", subjectPlayerId: "sam", contentType: "AVATAR" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, ProfileError.CANNOT_REPORT_SELF);
  });
});
