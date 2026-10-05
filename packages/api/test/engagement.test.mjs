/**
 * Engagement & Identity, wired into the REST API: daily challenges,
 * cross-game recommendations, and badge/frame selection. Each service is
 * already proven at the unit level (packages/engagement, packages/profile)
 * -- this file proves the HTTP layer wires them correctly: the right
 * actor, the right ownership check, the right shape over the wire.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createExpService } from "../../profile/src/exp.mjs";
import { createAchievementService } from "../../profile/src/achievements.mjs";
import { createBadgeService } from "../../profile/src/badges.mjs";
import { createFrameService } from "../../profile/src/frames.mjs";
import { createDailyChallengeService } from "../../engagement/src/daily-challenges.mjs";
import { createMasteryService } from "../../mastery/src/service.mjs";
import { createRecommendationService } from "../../engagement/src/recommendations.mjs";
import { createApi } from "../src/server.mjs";

const SIGNING_KEY = Buffer.alloc(32, 11);
const ENCRYPTION_KEY = Buffer.alloc(32, 12);
const PASSWORD = "correct horse battery staple";
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };

let db, auth, api, base, progression, frames;

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: json };
}

const tokenFor = async (handle) => (await auth.login({ identifier: handle, password: PASSWORD })).accessToken;

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  auth = createAuthService(db, { signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: FAST_ARGON });

  const exp = createExpService(db);
  const achievements = createAchievementService(db);
  const badges = createBadgeService(db);
  frames = createFrameService(db);
  progression = { exp, achievements, badges };
  const mastery = createMasteryService(db);
  const dailyChallenges = createDailyChallengeService(db);
  const recommendations = createRecommendationService(db, mastery);

  api = createApi({
    db, auth, mastery, dailyChallenges, recommendations, frames, progression,
    rateLimit: { capacity: 5000, refillPerSecond: 5000 },
  });
  await api.listen();
  base = api.url;

  for (const p of ["alice", "bob"]) await auth.register({ playerId: p, handle: p, password: PASSWORD });
});

after(async () => { await api.close(); });

describe("GET /v1/me/daily-challenges", () => {
  test("assigns and returns today's challenges for the caller", async () => {
    const token = await tokenFor("alice");
    const r = await req("GET", "/v1/me/daily-challenges", { token });
    assert.equal(r.status, 200);
    assert.equal(r.body.challenges.length, 5);
    assert.ok(r.body.challenges.every((c) => c.completed === false));
  });

  test("anonymous access is refused", async () => {
    const r = await req("GET", "/v1/me/daily-challenges");
    assert.equal(r.status, 401);
  });
});

describe("GET /v1/me/recommendations", () => {
  test("a brand-new player with no established games gets an empty list, not a guess", async () => {
    const token = await tokenFor("bob");
    const r = await req("GET", "/v1/me/recommendations", { token });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.recommendations, []);
  });
});

describe("badge and frame selection", () => {
  test("selecting a badge the player does not own is refused", async () => {
    const token = await tokenFor("alice");
    const r = await req("POST", "/v1/me/badge", { token, body: { code: "FIRST_WIN" } });
    assert.equal(r.status, 400);
  });

  test("awarding a badge, then selecting it, succeeds; clearing with null succeeds too", async () => {
    const token = await tokenFor("alice");
    await progression.badges.award("alice", "FIRST_WIN", "ACHIEVEMENT");
    const select = await req("POST", "/v1/me/badge", { token, body: { code: "FIRST_WIN" } });
    assert.equal(select.status, 200);

    const clear = await req("POST", "/v1/me/badge", { token, body: { code: null } });
    assert.equal(clear.status, 200);
  });

  test("the same select-only-if-owned rule applies to frames", async () => {
    const token = await tokenFor("alice");
    const refused = await req("POST", "/v1/me/frame", { token, body: { code: "STREAK_7_FRAME" } });
    assert.equal(refused.status, 400);

    await frames.award("alice", "STREAK_7_FRAME");
    const ok = await req("POST", "/v1/me/frame", { token, body: { code: "STREAK_7_FRAME" } });
    assert.equal(ok.status, 200);
  });

  test("a player cannot select a badge or frame for someone else -- there is no target id in the body", async () => {
    const token = await tokenFor("bob");
    const r = await req("POST", "/v1/me/badge", { token, body: { code: "FIRST_WIN", playerId: "alice" } });
    // Selecting for bob himself (who does not own it) -- proves the body's
    // extraneous playerId is simply ignored, never routed to another actor.
    assert.equal(r.status, 400);
  });
});

