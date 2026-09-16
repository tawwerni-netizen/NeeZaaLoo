/**
 * Tournament and Global Skill Score, wired into the REST API.
 *
 * The instruction this file exists to prove: the client can determine
 * NOTHING about pairings, standings, results or prize settlement. Every
 * write here is either pure orchestration (create/open/start/advance) or
 * flows through the same tournament/settlement services already proven at
 * the unit level -- this layer adds authentication, authorisation and audit,
 * nothing else.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createAuthService } from "../../auth/src/service.mjs";
import { createSettlementService } from "../../settlement/src/settle.mjs";
import { createTournamentService } from "../../tournament/src/tournament.mjs";
import { createGlobalSkillService } from "../../global-skill/src/service.mjs";
import { createApi } from "../src/server.mjs";

const SIGNING_KEY = Buffer.alloc(32, 9);
const ENCRYPTION_KEY = Buffer.alloc(32, 8);
const PASSWORD = "correct horse battery staple";
const FAST_ARGON = { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 };

let db, auth, api, base;

async function req(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: json };
}

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  auth = createAuthService(db, {
    signingKey: SIGNING_KEY, encryptionKey: ENCRYPTION_KEY, argon: FAST_ARGON,
  });
  const settlement = createSettlementService(db);
  const tournament = createTournamentService(db);
  const globalSkill = createGlobalSkillService(db);

  api = createApi({
    db, auth, settlement, tournament, globalSkill,
    rateLimit: { capacity: 5000, refillPerSecond: 5000 },
  });
  await api.listen();
  base = api.url;

  for (const p of ["ply1", "ply2", "ply3", "ply4", "root", "helper", "helper2"]) {
    await auth.register({ playerId: p, handle: p, password: PASSWORD });
  }
  await db.query(
    `INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES
     ('root','root@n','Root',TRUE),
     ('helper','h1@n','Helper1',TRUE),
     ('helper2','h2@n','Helper2',TRUE)`
  );
  await db.query(
    `INSERT INTO admin_role_grant (admin_id, role, granted_by, reason) VALUES
     ('root','SUPER_ADMIN','helper','bootstrap'),
     ('helper','ADMIN','root','ops'),
     ('helper2','ADMIN','root','ops')`
  );
});

after(async () => { await api.close(); });

const tokenFor = async (handle) =>
  (await auth.login({ identifier: handle, password: PASSWORD })).accessToken;

const stepUp = async (token, action) => {
  const r = await req("POST", "/v1/auth/step-up", { token, body: { action, password: PASSWORD } });
  assert.equal(r.status, 200, JSON.stringify(r));
  return r.body.stepUpToken;
};

// ---------------------------------------------------------------------------

describe("tournament authorisation — the client determines nothing", () => {
  test("a player cannot create a tournament", async () => {
    const r = await req("POST", "/v1/admin/tournaments", {
      token: await tokenFor("ply1"),
      body: { gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 4, timeControl: { initialMs: 60000 }, registrationClosesAt: new Date().toISOString() },
    });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, "ADMIN_ONLY");
  });

  test("orchestration does not require step-up for an admin who holds the capability", async () => {
    const r = await req("POST", "/v1/admin/tournaments", {
      token: await tokenFor("root"),
      body: { gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 4, timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString() },
    });
    assert.equal(r.status, 201);
  });

  test("a player cannot register someone else, or supply their own seed rating", async () => {
    const rootToken = await tokenFor("root");
    const step = await stepUp(rootToken, "admin.tournament.manage");
    const created = await req("POST", "/v1/admin/tournaments", {
      token: rootToken, headers: { "x-step-up-token": step },
      body: { gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 4,
        timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString() },
    });
    assert.equal(created.status, 201);
    const id = created.body.tournamentId;
    await req("POST", `/v1/admin/tournaments/${id}/open`, { token: rootToken, headers: { "x-step-up-token": step } });

    // ply1 registers via the API without ever sending a rating -- the route
    // has no field for one. Whatever the client posts is ignored.
    await db.query(
      "INSERT INTO rating (player_id, game_id, rating_x100, rd_x100, games_played) VALUES ('ply1','chess',190000,5000,50)"
    );
    const reg = await req("POST", `/v1/tournaments/${id}/register`, {
      token: await tokenFor("ply1"), body: { ratingX100: 1 }, // an attempted lie, if it were read at all
    });
    assert.equal(reg.status, 201);

    const row = await db.query(
      "SELECT seed_rating_x100 FROM tournament_registration WHERE tournament_id=$1 AND player_id='ply1'", [id]
    );
    assert.equal(row.rows[0].seed_rating_x100, 190000, "the server's own rating, not the client's claim");
  });
});

describe("a full tournament through the API", () => {
  test("create, register, start, play, advance, settle — all via HTTP", async () => {
    const rootToken = await tokenFor("root");
    const step = await stepUp(rootToken, "admin.tournament.manage");

    const created = await req("POST", "/v1/admin/tournaments", {
      token: rootToken, headers: { "x-step-up-token": step },
      body: {
        gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 4,
        timeControl: { initialMs: 60000 },
        registrationClosesAt: new Date(Date.now() + 3600_000).toISOString(),
      },
    });
    const id = created.body.tournamentId;
    await req("POST", `/v1/admin/tournaments/${id}/open`, { token: rootToken, headers: { "x-step-up-token": step } });

    for (const p of ["ply1", "ply2", "ply3", "ply4"]) {
      const r = await req("POST", `/v1/tournaments/${id}/register`, { token: await tokenFor(p), body: {} });
      assert.equal(r.status, 201, JSON.stringify(r));
    }

    const detail = await req("GET", `/v1/tournaments/${id}`, { token: await tokenFor("ply1") });
    assert.equal(detail.body.registeredCount, 4);

    const started = await req("POST", `/v1/admin/tournaments/${id}/start`, {
      token: rootToken, headers: { "x-step-up-token": step },
    });
    assert.equal(started.status, 200);
    assert.equal(started.body.pairings, 2);

    const bracket = await req("GET", `/v1/tournaments/${id}/pairings?round=1`, { token: await tokenFor("ply1") });
    assert.equal(bracket.body.pairings.length, 2);

    // Drive round 1 to completion directly through the tournament service
    // (there is no "report a chess result" HTTP route yet -- that arrives
    // with the realtime-to-tournament wiring; see KNOWN ISSUES).
    const settlement = createSettlementService(db);
    const tournamentSvc = createTournamentService(db);
    for (const row of bracket.body.pairings) {
      await tournamentSvc.reportResult({ pairingId: (await db.query(
        "SELECT id FROM tournament_pairing WHERE tournament_id=$1 AND round_number=1 AND seat_0=$2",
        [id, row.seat_0]
      )).rows[0].id, result: "1-0" }, settlement);
    }

    const adv = await req("POST", `/v1/admin/tournaments/${id}/advance`, {
      token: rootToken, headers: { "x-step-up-token": step },
    });
    assert.equal(adv.body.pairings, 1);

    const finalPairing = (await db.query(
      "SELECT id, seat_0 FROM tournament_pairing WHERE tournament_id=$1 AND round_number=2", [id]
    )).rows[0];
    await tournamentSvc.reportResult({ pairingId: finalPairing.id, result: "1-0" }, settlement);
    const done = await req("POST", `/v1/admin/tournaments/${id}/advance`, {
      token: rootToken, headers: { "x-step-up-token": step },
    });
    assert.equal(done.body.status, "COMPLETED");

    const standings = await req("GET", `/v1/tournaments/${id}/standings`, { token: await tokenFor("ply1") });
    assert.equal(standings.body.standings.length, 4);
    assert.equal(standings.body.standings[0].rank, 1);
  });
});

describe("prize settlement requires two DIFFERENT admins, enforced through the API", () => {
  async function completedFreeTournament() {
    const rootToken = await tokenFor("root");
    const step = await stepUp(rootToken, "admin.tournament.manage");
    const created = await req("POST", "/v1/admin/tournaments", {
      token: rootToken, headers: { "x-step-up-token": step },
      body: { gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 2,
        timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString() },
    });
    const id = created.body.tournamentId;
    await req("POST", `/v1/admin/tournaments/${id}/open`, { token: rootToken, headers: { "x-step-up-token": step } });
    await req("POST", `/v1/tournaments/${id}/register`, { token: await tokenFor("ply3"), body: {} });
    await req("POST", `/v1/tournaments/${id}/register`, { token: await tokenFor("ply4"), body: {} });
    await req("POST", `/v1/admin/tournaments/${id}/start`, { token: rootToken, headers: { "x-step-up-token": step } });

    const pairing = (await db.query(
      "SELECT id FROM tournament_pairing WHERE tournament_id=$1 AND round_number=1", [id]
    )).rows[0];
    await createTournamentService(db).reportResult(
      { pairingId: pairing.id, result: "1-0" }, createSettlementService(db)
    );
    await req("POST", `/v1/admin/tournaments/${id}/advance`, { token: rootToken, headers: { "x-step-up-token": step } });
    return { id, rootToken, step };
  }

  test("settling with no approval at all is refused", async () => {
    const { id, rootToken, step } = await completedFreeTournament();
    const settleStep = await stepUp(rootToken, "admin.tournament.settle");
    const r = await req("POST", `/v1/admin/tournaments/${id}/settle`, {
      token: rootToken, headers: { "x-step-up-token": settleStep }, body: {},
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, "SECOND_ADMIN_REQUIRED");
    void step;
  });

  test("the SAME admin cannot request and approve their own settlement", async () => {
    const { id, rootToken } = await completedFreeTournament();
    const manageStep = await stepUp(rootToken, "admin.tournament.manage");
    const request = await req("POST", `/v1/admin/tournaments/${id}/settle/request`, {
      token: rootToken, headers: { "x-step-up-token": manageStep }, body: { reason: "payout" },
    });
    assert.equal(request.status, 201);

    const selfDecide = await req("POST", `/v1/admin/approvals/${request.body.approvalRequestId}/decide`, {
      token: rootToken, headers: { "x-step-up-token": manageStep }, body: { approve: true },
    });
    assert.equal(selfDecide.status, 403);
    assert.equal(selfDecide.body.error.code, "SELF_APPROVAL_FORBIDDEN");
  });

  test("a second, different admin approves, and settlement then succeeds", async () => {
    const { id, rootToken, step } = await completedFreeTournament();
    const request = await req("POST", `/v1/admin/tournaments/${id}/settle/request`, {
      token: rootToken, headers: { "x-step-up-token": step }, body: { reason: "payout" },
    });

    const helperToken = await tokenFor("helper");
    const helperStep = await stepUp(helperToken, "admin.tournament.manage");
    const decided = await req("POST", `/v1/admin/approvals/${request.body.approvalRequestId}/decide`, {
      token: helperToken, headers: { "x-step-up-token": helperStep }, body: { approve: true },
    });
    assert.equal(decided.status, 200);
    assert.equal(decided.body.status, "APPROVED");

    const settleStep = await stepUp(rootToken, "admin.tournament.settle");
    const settled = await req("POST", `/v1/admin/tournaments/${id}/settle`, {
      token: rootToken, headers: { "x-step-up-token": settleStep },
      body: { approvalRequestId: request.body.approvalRequestId },
    });
    assert.equal(settled.status, 200, JSON.stringify(settled));
    assert.equal(settled.body.ok, true);
  });

  test("a REJECTED approval does not authorise settlement", async () => {
    const { id, rootToken, step } = await completedFreeTournament();
    const request = await req("POST", `/v1/admin/tournaments/${id}/settle/request`, {
      token: rootToken, headers: { "x-step-up-token": step }, body: { reason: "payout" },
    });
    const helperToken = await tokenFor("helper2");
    const helperStep = await stepUp(helperToken, "admin.tournament.manage");
    await req("POST", `/v1/admin/approvals/${request.body.approvalRequestId}/decide`, {
      token: helperToken, headers: { "x-step-up-token": helperStep }, body: { approve: false, note: "not yet" },
    });

    const settleStep = await stepUp(rootToken, "admin.tournament.settle");
    const settled = await req("POST", `/v1/admin/tournaments/${id}/settle`, {
      token: rootToken, headers: { "x-step-up-token": settleStep },
      body: { approvalRequestId: request.body.approvalRequestId },
    });
    assert.equal(settled.status, 409);
    assert.equal(settled.body.error.code, "SECOND_ADMIN_REQUIRED");
  });

  test("a fabricated approval id is worth nothing", async () => {
    const { id, rootToken } = await completedFreeTournament();
    const settleStep = await stepUp(rootToken, "admin.tournament.settle");
    const settled = await req("POST", `/v1/admin/tournaments/${id}/settle`, {
      token: rootToken, headers: { "x-step-up-token": settleStep },
      body: { approvalRequestId: "apr_does_not_exist" },
    });
    assert.equal(settled.status, 409);
  });
});

describe("Global Skill Score API", () => {
  test("a player reads their own profile", async () => {
    await db.query(
      "INSERT INTO rating (player_id, game_id, rating_x100, rd_x100, games_played) VALUES ('ply2','chess',180000,5000,50) ON CONFLICT DO NOTHING"
    );
    const r = await req("GET", "/v1/me/global-skill", { token: await tokenFor("ply2") });
    assert.equal(r.status, 200);
    assert.ok("score" in r.body);
  });

  test("a player may read ANOTHER player's global skill profile — it is not sensitive", async () => {
    const r = await req("GET", "/v1/players/ply2/global-skill", { token: await tokenFor("ply1") });
    assert.equal(r.status, 200);
    assert.ok("score" in r.body);
  });

  test("the global leaderboard is bounded and reads through HTTP", async () => {
    const r = await req("GET", "/v1/leaderboard/global?limit=5", { token: await tokenFor("ply1") });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.entries));
    assert.ok(r.body.entries.length <= 5);
  });

  test("the per-game leaderboard is generic, not hardcoded to chess", async () => {
    await db.query(
      "INSERT INTO game (id, display_name, plugin_version, is_live) VALUES ('speed-math','Speed Math',1,TRUE) ON CONFLICT DO NOTHING"
    );
    await db.query(
      "INSERT INTO rating (player_id, game_id, rating_x100, rd_x100, games_played) VALUES ('ply2','speed-math',160000,5000,20)"
    );
    const r = await req("GET", "/v1/leaderboard?game=speed-math", { token: await tokenFor("ply1") });
    assert.equal(r.status, 200);
    assert.equal(r.body.gameId, "speed-math");
    assert.ok(r.body.entries.some((e) => e.player_id === "ply2"));
  });

  test("anonymous access is refused, like every other authenticated route", async () => {
    const r = await req("GET", "/v1/leaderboard/global");
    assert.equal(r.status, 401);
  });
});

describe("security: IDOR, tampering and cross-user access on the new routes", () => {
  test("registering with someone else's id in the body changes nothing — it is ignored", async () => {
    // The route reads actor.id from the authenticated token, never from the
    // body, so this is not even a live attack surface -- confirmed directly.
    const rootToken = await tokenFor("root");
    const step = await stepUp(rootToken, "admin.tournament.manage");
    const created = await req("POST", "/v1/admin/tournaments", {
      token: rootToken, headers: { "x-step-up-token": step },
      body: { gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 4,
        timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString() },
    });
    const id = created.body.tournamentId;
    await req("POST", `/v1/admin/tournaments/${id}/open`, { token: rootToken, headers: { "x-step-up-token": step } });

    const r = await req("POST", `/v1/tournaments/${id}/register`, {
      token: await tokenFor("ply1"), body: { playerId: "root" },
    });
    assert.equal(r.status, 201);
    const row = await db.query(
      "SELECT player_id FROM tournament_registration WHERE tournament_id=$1", [id]
    );
    assert.deepEqual(row.rows.map((x) => x.player_id), ["ply1"], "the body's claimed identity is inert");
  });

  test("a non-admin cannot decide an approval or force settlement, whatever tokens they hold", async () => {
    const rootToken = await tokenFor("root");
    const step = await stepUp(rootToken, "admin.tournament.manage");
    const created = await req("POST", "/v1/admin/tournaments", {
      token: rootToken, headers: { "x-step-up-token": step },
      body: { gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 2,
        timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString() },
    });
    const id = created.body.tournamentId;
    const request = await req("POST", `/v1/admin/tournaments/${id}/settle/request`, {
      token: rootToken, headers: { "x-step-up-token": step }, body: { reason: "x" },
    });

    const ply = await tokenFor("ply1");
    const decide = await req("POST", `/v1/admin/approvals/${request.body.approvalRequestId}/decide`, {
      token: ply, body: { approve: true },
    });
    assert.equal(decide.status, 403);
    assert.equal(decide.body.error.code, "ADMIN_ONLY");

    const settle = await req("POST", `/v1/admin/tournaments/${id}/settle`, {
      token: ply, body: { approvalRequestId: request.body.approvalRequestId },
    });
    assert.equal(settle.status, 403);
  });

  test("a tampered tournament id in the URL is a clean 404, not a crash or a leak", async () => {
    const r = await req("GET", "/v1/tournaments/'; DROP TABLE tournament; --", {
      token: await tokenFor("ply1"),
    });
    assert.equal(r.status, 404);
    const stillThere = await db.query("SELECT count(*)::int c FROM tournament");
    assert.ok(stillThere.rows[0].c >= 0, "the table still exists");
  });

  test("re-deciding an already-decided approval is refused, not re-applied", async () => {
    const rootToken = await tokenFor("root");
    const step = await stepUp(rootToken, "admin.tournament.manage");
    const created = await req("POST", "/v1/admin/tournaments", {
      token: rootToken, headers: { "x-step-up-token": step },
      body: { gameId: "chess", format: "SINGLE_ELIMINATION", capacity: 2,
        timeControl: { initialMs: 60000 }, registrationClosesAt: new Date(Date.now() + 3600_000).toISOString() },
    });
    const id = created.body.tournamentId;
    const request = await req("POST", `/v1/admin/tournaments/${id}/settle/request`, {
      token: rootToken, headers: { "x-step-up-token": step }, body: { reason: "x" },
    });
    const helperToken = await tokenFor("helper");
    const helperStep = await stepUp(helperToken, "admin.tournament.manage");
    const first = await req("POST", `/v1/admin/approvals/${request.body.approvalRequestId}/decide`, {
      token: helperToken, headers: { "x-step-up-token": helperStep }, body: { approve: true },
    });
    assert.equal(first.status, 200);
    const second = await req("POST", `/v1/admin/approvals/${request.body.approvalRequestId}/decide`, {
      token: helperToken, headers: { "x-step-up-token": helperStep }, body: { approve: false },
    });
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, "NOT_PENDING");
  });
});
