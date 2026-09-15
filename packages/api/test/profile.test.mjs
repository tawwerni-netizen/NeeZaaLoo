/**
 * Profile / User Identity (Slice 7), wired into the REST API. The
 * instruction this file exists to prove: a player can change only their
 * OWN nickname/bio/avatar (the backend enforces this, never the client),
 * a public profile is safe to show to anyone, and nothing sensitive
 * (email, wallet, security data) is ever assembled into it.
 */
process.env.NODE_ENV = "test";

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createGlobalSkillService } from "../../global-skill/src/service.mjs";
import { createNicknameService } from "../../profile/src/nickname.mjs";
import { createExpService } from "../../profile/src/exp.mjs";
import { createAchievementService } from "../../profile/src/achievements.mjs";
import { createBadgeService } from "../../profile/src/badges.mjs";
import { createFrameService } from "../../profile/src/frames.mjs";
import { createMockAvatarStorage } from "../../profile/src/avatar-storage.mjs";
import { createMasteryService } from "../../mastery/src/service.mjs";
import { createStreakService } from "../../engagement/src/streaks.mjs";
import { createProfileService } from "../../profile/src/service.mjs";
import { createRbacService } from "../../authz/src/rbac.mjs";
import { createApi } from "../src/server.mjs";

const SIGNING_KEY = Buffer.alloc(32, 51);
const ENCRYPTION_KEY = Buffer.alloc(32, 52);
const PASSWORD = "correct horse battery staple";
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };
const PNG_B64 = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200)]).toString("base64");

let db, auth, api, base, exp, achievements, badges, avatarStorage;
let CLOCK = Date.now();

async function req(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

async function newPlayer(handle) {
  await req("POST", "/v1/auth/register", { body: { handle, password: PASSWORD } });
  return (await req("POST", "/v1/auth/login", { body: { identifier: handle, password: PASSWORD } })).body.accessToken;
}

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  auth = createAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: FAST_ARGON });
  const globalSkill = createGlobalSkillService(db);
  const nicknameService = createNicknameService(db, { now: () => CLOCK });
  exp = createExpService(db, { now: () => CLOCK });
  achievements = createAchievementService(db, { now: () => CLOCK });
  badges = createBadgeService(db, { now: () => CLOCK });
  const frames = createFrameService(db, { now: () => CLOCK });
  avatarStorage = createMockAvatarStorage();
  const masteryService = createMasteryService(db);
  const streakService = createStreakService(db);
  const profile = createProfileService(db, {
    nicknameService, expService: exp, achievementService: achievements, badgeService: badges,
    frameService: frames, avatarStorage, globalSkill, masteryService, streakService,
    now: () => CLOCK,
  });

  api = createApi({
    db, auth, globalSkill, profile, rbac: createRbacService(db),
    progression: { exp, achievements, badges },
    rateLimit: { capacity: 5000, refillPerSecond: 5000 },
  });
  await api.listen();
  base = api.url;

  // A real admin identity for the read-only progression admin route below
  // -- the SAME admin_role_grant fixture pattern packages/api/test/
  // api.test.mjs's own "admin surfaces" tests use.
  await db.query(
    `INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES
     ('progadmin','progadmin@nizalo','Prog Admin',TRUE),
     ('progbootstrap','progbootstrap@nizalo','Prog Bootstrap',TRUE)`
  );
  await auth.register({ playerId: "progadmin", handle: "progadmin", password: PASSWORD });
  await db.query(
    `INSERT INTO admin_role_grant (admin_id, role, granted_by, reason) VALUES ('progadmin','SUPER_ADMIN','progbootstrap','bootstrap')`
  );
});

after(async () => { await api.close(); await db.close?.(); });

describe("GET /v1/me/profile", () => {
  test("returns the caller's own complete profile", async () => {
    const token = await newPlayer("meprofilealice");
    const r = await req("GET", "/v1/me/profile", { token });
    assert.equal(r.status, 200);
    assert.equal(r.body.nickname, "meprofilealice");
    assert.equal(r.body.exp.level, 1);
    assert.deepEqual(r.body.stats, { games: 0, wins: 0, losses: 0, draws: 0 });
  });

  test("anonymous access is refused", async () => {
    const r = await req("GET", "/v1/me/profile");
    assert.equal(r.status, 401);
  });
});

describe("PATCH /v1/me/profile", () => {
  test("updates nickname and bio", async () => {
    const token = await newPlayer("patchalice");
    const r = await req("PATCH", "/v1/me/profile", { token, body: { nickname: "PatchAliceRenamed", bio: "I play chess." } });
    assert.equal(r.status, 200);
    assert.equal(r.body.nickname, "PatchAliceRenamed");
    assert.equal(r.body.bio, "I play chess.");
  });

  test("an invalid nickname is refused with 400", async () => {
    const token = await newPlayer("patchbob");
    const r = await req("PATCH", "/v1/me/profile", { token, body: { nickname: "ab" } });
    assert.equal(r.status, 400);
  });

  test("a reserved nickname is refused", async () => {
    const token = await newPlayer("patchcarol");
    const r = await req("PATCH", "/v1/me/profile", { token, body: { nickname: "SupportTeam" } });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, "RESERVED");
  });

  test("a nickname already taken by another player is refused with 409", async () => {
    await newPlayer("patchdantaken");
    const token = await newPlayer("patcherin");
    const r = await req("PATCH", "/v1/me/profile", { token, body: { nickname: "patchdantaken" } });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, "TAKEN");
  });

  test("a second nickname change within the cooldown is refused with 429", async () => {
    const token = await newPlayer("patchfrank");
    const first = await req("PATCH", "/v1/me/profile", { token, body: { nickname: "PatchFrankOne" } });
    assert.equal(first.status, 200);
    const second = await req("PATCH", "/v1/me/profile", { token, body: { nickname: "PatchFrankTwo" } });
    assert.equal(second.status, 429);
    assert.equal(second.body.error.code, "COOLDOWN");
  });

  test("a bio over the length limit is refused", async () => {
    const token = await newPlayer("patchgrace");
    const r = await req("PATCH", "/v1/me/profile", { token, body: { bio: "x".repeat(281) } });
    assert.equal(r.status, 400);
  });

  test("bio HTML is sanitized before storage", async () => {
    const token = await newPlayer("patchhenry");
    await req("PATCH", "/v1/me/profile", { token, body: { bio: "hi <script>alert(1)</script>" } });
    const r = await req("GET", "/v1/me/profile", { token });
    assert.equal(r.body.bio.includes("<"), false);
  });

  test("a player cannot update ANOTHER player's profile -- there is no id in the body to target one", async () => {
    const tokenA = await newPlayer("patchivy");
    const tokenB = await newPlayer("patchjack");
    // patchivy's token can only ever affect patchivy's own row -- prove it
    // by having jack rename himself and confirming ivy's nickname is untouched.
    await req("PATCH", "/v1/me/profile", { token: tokenB, body: { nickname: "JackRenamed" } });
    const ivyProfile = await req("GET", "/v1/me/profile", { token: tokenA });
    assert.equal(ivyProfile.body.nickname, "patchivy");
  });

  test("anonymous access is refused", async () => {
    const r = await req("PATCH", "/v1/me/profile", { body: { bio: "no token" } });
    assert.equal(r.status, 401);
  });
});

describe("POST /v1/me/profile/avatar", () => {
  test("a valid image upload succeeds and is reflected in the profile", async () => {
    const token = await newPlayer("avataralice");
    const r = await req("POST", "/v1/me/profile/avatar", { token, body: { imageBase64: PNG_B64 } });
    assert.equal(r.status, 200);
    assert.ok(r.body.avatarUrl);
    const profile = await req("GET", "/v1/me/profile", { token });
    assert.equal(profile.body.avatarUrl, r.body.avatarUrl);
  });

  test("a non-image payload is refused", async () => {
    const token = await newPlayer("avatarbob");
    const r = await req("POST", "/v1/me/profile/avatar", { token, body: { imageBase64: Buffer.from("not an image").toString("base64") } });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, "INVALID_IMAGE");
  });

  test("an oversized image is refused with 413", async () => {
    const token = await newPlayer("avatarcarol");
    const huge = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(3 * 1024 * 1024)]);
    const r = await req("POST", "/v1/me/profile/avatar", { token, body: { imageBase64: huge.toString("base64") } });
    assert.equal(r.status, 413);
  });

  test("missing imageBase64 is a clean 400", async () => {
    const token = await newPlayer("avatardan");
    const r = await req("POST", "/v1/me/profile/avatar", { token, body: {} });
    assert.equal(r.status, 400);
  });
});

describe("GET /v1/players/:id -- public profile", () => {
  test("shows the full public shape to another authenticated player", async () => {
    const ownerToken = await newPlayer("pubalice");
    await req("PATCH", "/v1/me/profile", { token: ownerToken, body: { bio: "Public bio here." } });
    const viewerToken = await newPlayer("pubbob");
    const r = await req("GET", "/v1/players/pubalice", { token: viewerToken });
    assert.equal(r.status, 200);
    assert.equal(r.body.nickname, "pubalice");
    assert.equal(r.body.bio, "Public bio here.");
    assert.ok(r.body.exp);
  });

  test("never exposes email, wallet, or any internal security field", async () => {
    const ownerToken = await newPlayer("pubcarol");
    const viewerToken = await newPlayer("pubdan");
    const r = await req("GET", "/v1/players/pubcarol", { token: viewerToken });
    const serialized = JSON.stringify(r.body).toLowerCase();
    for (const forbidden of ["email", "wallet", "balance", "password", "token", "provider_subject"]) {
      assert.equal(serialized.includes(forbidden), false, `leaked "${forbidden}"`);
    }
  });

  test("a nonexistent player is a clean 404", async () => {
    const viewerToken = await newPlayer("pubfrank");
    const r = await req("GET", "/v1/players/does-not-exist-at-all", { token: viewerToken });
    assert.equal(r.status, 404);
  });

  test("after a nickname change, the profile is reachable at the NEW nickname and the OLD one 404s -- the URL segment is the player's current nickname, not their permanent id", async () => {
    const ownerToken = await newPlayer("pubgracewillrename");
    await req("PATCH", "/v1/me/profile", { token: ownerToken, body: { nickname: "PubGraceRenamed" } });
    const viewerToken = await newPlayer("pubgraceviewer");

    const byNewNickname = await req("GET", "/v1/players/PubGraceRenamed", { token: viewerToken });
    assert.equal(byNewNickname.status, 200);
    assert.equal(byNewNickname.body.nickname, "PubGraceRenamed");

    const byOldNickname = await req("GET", "/v1/players/pubgracewillrename", { token: viewerToken });
    assert.equal(byOldNickname.status, 404, "the old nickname must no longer resolve to anyone");
  });
});

describe("GET /v1/players/:id/preview", () => {
  test("returns the small preview shape", async () => {
    await newPlayer("previewalice");
    const viewerToken = await newPlayer("previewbob");
    const r = await req("GET", "/v1/players/previewalice/preview", { token: viewerToken });
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body).sort(), ["avatarUrl", "exp", "globalSkill", "id", "level", "nickname", "selectedBadge"].sort());
  });
});

describe("GET /v1/players/by-id/:id/preview", () => {
  test("resolves by the player's permanent id, and keeps working after a nickname change -- unlike the nickname-shaped route above", async () => {
    const ownerToken = await newPlayer("byidwillrename");
    const viewerToken = await newPlayer("byidviewer");

    const before = await req("GET", "/v1/players/by-id/byidwillrename/preview", { token: viewerToken });
    assert.equal(before.status, 200);
    assert.equal(before.body.id, "byidwillrename");
    assert.equal(before.body.nickname, "byidwillrename");

    await req("PATCH", "/v1/me/profile", { token: ownerToken, body: { nickname: "ByIdRenamed" } });

    // A duel's `players` array is always the permanent id (see
    // packages/realtime's own stateFor()) -- this is the exact scenario
    // that route exists for: it must still resolve after the rename,
    // where GET /v1/players/:id (nickname-shaped) would now 404 for the
    // OLD value, per this file's own test above.
    const after = await req("GET", "/v1/players/by-id/byidwillrename/preview", { token: viewerToken });
    assert.equal(after.status, 200);
    assert.equal(after.body.id, "byidwillrename", "the id never changes");
    assert.equal(after.body.nickname, "ByIdRenamed", "but the live nickname is reflected");
  });

  test("an unknown id is a 404, not a leak", async () => {
    const viewerToken = await newPlayer("byidviewer2");
    const r = await req("GET", "/v1/players/by-id/does-not-exist-at-all/preview", { token: viewerToken });
    assert.equal(r.status, 404);
  });
});

describe("POST /v1/players/:id/report", () => {
  test("a player can report another player's content", async () => {
    await newPlayer("reportsubject");
    const reporterToken = await newPlayer("reporteralice");
    const r = await req("POST", "/v1/players/reportsubject/report", { token: reporterToken, body: { contentType: "BIO", reason: "offensive" } });
    assert.equal(r.status, 201);
    assert.ok(r.body.reportId);
  });

  test("a player cannot report themselves", async () => {
    const token = await newPlayer("reportself");
    const r = await req("POST", "/v1/players/reportself/report", { token, body: { contentType: "AVATAR" } });
    assert.equal(r.status, 400);
  });

  test("an invalid contentType is refused", async () => {
    await newPlayer("reportsubject2");
    const token = await newPlayer("reporterbob2");
    const r = await req("POST", "/v1/players/reportsubject2/report", { token, body: { contentType: "NOT_REAL" } });
    assert.equal(r.status, 400);
  });

  test("anonymous access is refused", async () => {
    await newPlayer("reportsubject3");
    const r = await req("POST", "/v1/players/reportsubject3/report", { body: { contentType: "BIO" } });
    assert.equal(r.status, 401);
  });
});

describe("GET /v1/admin/players/:id/progression (Slice 11, directive #20)", () => {
  test("a real admin sees EXP total, the raw event history, achievements, and badges", async () => {
    await newPlayer("progtargetalice");
    await exp.award({ playerId: "progtargetalice", eventType: "GAME_COMPLETED", source: "duel:pt1", amount: 10, dedupeKey: "duel:pt1:completed:progtargetalice" });
    await exp.award({ playerId: "progtargetalice", eventType: "GAME_WON", source: "duel:pt1", amount: 25, dedupeKey: "duel:pt1:won:progtargetalice" });
    await achievements.award("progtargetalice", "FIRST_WIN");
    await badges.award("progtargetalice", "FIRST_WIN", "ACHIEVEMENT");

    const token = await req("POST", "/v1/auth/login", { body: { identifier: "progadmin", password: PASSWORD } }).then((r) => r.body.accessToken);
    const r = await req("GET", "/v1/admin/players/progtargetalice/progression", { token });
    assert.equal(r.status, 200);
    assert.equal(r.body.exp.total, 35);
    assert.equal(r.body.exp.history.length, 2);
    assert.ok(r.body.exp.history.every((h) => "event_type" in h && "amount" in h && "created_at" in h));
    assert.ok(r.body.achievements.some((a) => a.achievement_code === "FIRST_WIN"));
    assert.ok(r.body.badges.some((b) => b.badge_code === "FIRST_WIN" && b.source === "ACHIEVEMENT"));
  });

  test("a plain player cannot reach the admin progression route", async () => {
    await newPlayer("progtargetbob");
    const token = await newPlayer("notanadmin1");
    const r = await req("GET", "/v1/admin/players/progtargetbob/progression", { token });
    assert.equal(r.status, 403);
  });

  test("anonymous access is refused", async () => {
    const r = await req("GET", "/v1/admin/players/progtargetalice/progression");
    assert.equal(r.status, 401);
  });

  test("this view is READ-ONLY -- there is no route anywhere that lets a client award, edit, or delete EXP, an achievement, or a badge", async () => {
    const token = await req("POST", "/v1/auth/login", { body: { identifier: "progadmin", password: PASSWORD } }).then((r) => r.body.accessToken);
    for (const path of ["/v1/admin/players/progtargetalice/exp", "/v1/award-xp", "/v1/admin/exp/award", "/v1/admin/players/progtargetalice/progression"]) {
      const r = await req("POST", path, { token, body: { amount: 999999 } });
      assert.notEqual(r.status, 200, `${path} must not accept a write`);
    }
  });
});
