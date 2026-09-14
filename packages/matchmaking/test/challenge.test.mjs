/**
 * PLAY WITH FRIEND: challenge creation, the 30-second popup window, Free vs
 * Competitive, and the permanent duel_challenge_event log every transition
 * writes to -- "the system must log this automatically" is that table,
 * proven here rather than assumed.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createChallengeService, ChallengeError, CHALLENGE_TTL_MS } from "../src/challenge.mjs";
import { createChannelService, matchChannelId } from "../../chat/src/channels.mjs";
import { STAKE_PRESETS_MINOR, MAX_STAKE_MINOR } from "../src/stakes.mjs";

const USDT = 1_000_000n;
const u = (n) => (BigInt(n) * USDT).toString();

async function fresh({ players = ["alice", "bob", "carol"] } = {}) {
  const db = await PGlite.create();
  await migrate(db);
  for (const p of players) await db.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [p]);
  return db;
}

async function events(db, challengeId) {
  const r = await db.query(
    "SELECT event_type FROM duel_challenge_event WHERE challenge_id=$1 ORDER BY id", [challengeId]
  );
  return r.rows.map((row) => row.event_type);
}

describe("create() -- Free or Competitive", () => {
  test("a FREE challenge is created with zero stake, and logs SENT", async () => {
    const db = await fresh();
    const svc = createChallengeService(db);
    const r = await svc.create({ gameId: "chess", challengerId: "alice", opponentNickname: "bob" });
    assert.equal(r.ok, true);
    const row = await db.query("SELECT tier, stake_minor::text st, asset FROM duel_challenge WHERE id=$1", [r.challengeId]);
    assert.equal(row.rows[0].tier, "FREE");
    assert.equal(row.rows[0].st, "0");
    assert.equal(row.rows[0].asset, null);
    assert.deepEqual(await events(db, r.challengeId), ["SENT"]);
  });

  test("a COMPETITIVE challenge at a valid preset stake is created CASH", async () => {
    const db = await fresh();
    const svc = createChallengeService(db);
    const r = await svc.create({
      gameId: "chess", challengerId: "alice", opponentNickname: "bob",
      tier: "CASH", stakeMinor: u(50), asset: "USDT",
    });
    assert.equal(r.ok, true);
    const row = await db.query("SELECT tier, stake_minor::text st, asset FROM duel_challenge WHERE id=$1", [r.challengeId]);
    assert.equal(row.rows[0].tier, "CASH");
    assert.equal(row.rows[0].st, u(50));
    assert.equal(row.rows[0].asset, "USDT");
  });

  test("every stake preset in the approved ladder is accepted, nothing else is", async () => {
    const db = await fresh();
    const svc = createChallengeService(db);
    for (const preset of STAKE_PRESETS_MINOR) {
      const r = await svc.create({
        gameId: "chess", challengerId: "alice", opponentNickname: "bob",
        tier: "CASH", stakeMinor: preset, asset: "USDT",
      });
      assert.equal(r.ok, true, `preset ${preset} should be accepted`);
      // duel_challenge_event is append-only (no DELETE, ever) -- clear the
      // way for the next preset's own PENDING row the same way a real
      // caller would: cancel this one, rather than deleting anything.
      await svc.cancel(r.challengeId, "alice");
    }
    assert.equal(MAX_STAKE_MINOR.toString(), u(2000), "the ladder's own ceiling is $2000");
  });

  test("an invalid (off-ladder) stake is refused -- the UI must never allow it, but the backend is what actually stops it", async () => {
    const db = await fresh();
    const svc = createChallengeService(db);
    for (const bad of [u(1), u(3), u(2001), "0", "-" + u(50)]) {
      const r = await svc.create({
        gameId: "chess", challengerId: "alice", opponentNickname: "bob",
        tier: "CASH", stakeMinor: bad, asset: "USDT",
      });
      assert.equal(r.ok, false, `${bad} must be refused`);
      assert.equal(r.reason, ChallengeError.INVALID_STAKE);
    }
  });

  test("a wrong difficulty/mode submitted for Friend is meaningless here -- VS_COMPUTER never reaches this service at all", async () => {
    // There is no `difficulty` parameter on create() to misuse: the
    // structural guarantee IS the absence of the field, not a runtime
    // check. This test exists to name that invariant, not to exercise code.
    const db = await fresh();
    const svc = createChallengeService(db);
    const r = await svc.create({
      gameId: "chess", challengerId: "alice", opponentNickname: "bob",
      difficulty: "EXPERT", // a stray field a confused client might send
    });
    assert.equal(r.ok, true);
    const row = await db.query("SELECT tier FROM duel_challenge WHERE id=$1", [r.challengeId]);
    assert.equal(row.rows[0].tier, "FREE", "an unrecognised field never smuggles in a competitive/AI concept");
  });

  test("an unknown opponent is refused", async () => {
    const db = await fresh();
    const svc = createChallengeService(db);
    const r = await svc.create({ gameId: "chess", challengerId: "alice", opponentNickname: "nobody" });
    assert.equal(r.reason, ChallengeError.UNKNOWN_OPPONENT);
  });

  test("challenging yourself is refused", async () => {
    const db = await fresh();
    const svc = createChallengeService(db);
    const r = await svc.create({ gameId: "chess", challengerId: "alice", opponentNickname: "alice" });
    assert.equal(r.reason, ChallengeError.CANNOT_CHALLENGE_SELF);
  });

  test("DUPLICATE CHALLENGE: a second challenge to the same opponent/game while one is still pending is refused", async () => {
    const db = await fresh();
    const svc = createChallengeService(db);
    const first = await svc.create({ gameId: "chess", challengerId: "alice", opponentNickname: "bob" });
    assert.equal(first.ok, true);
    const second = await svc.create({ gameId: "chess", challengerId: "alice", opponentNickname: "bob" });
    assert.equal(second.ok, false);
    assert.equal(second.reason, ChallengeError.ALREADY_PENDING);
  });

  test("CHALLENGE AFTER BLOCK: a challenge between two players with a block either direction is refused", async () => {
    const db = await fresh();
    const svc = createChallengeService(db);
    await db.query("INSERT INTO chat_block (blocker_id, blocked_id) VALUES ('bob','alice')");
    const r = await svc.create({ gameId: "chess", challengerId: "alice", opponentNickname: "bob" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, ChallengeError.BLOCKED);
  });
});

describe("accept() -- Free creates READY, Competitive creates RESERVED", () => {
  test("a FREE challenge accepted creates a READY duel, immediately playable", async () => {
    const db = await fresh();
    const svc = createChallengeService(db);
    const created = await svc.create({ gameId: "chess", challengerId: "alice", opponentNickname: "bob" });
    const accepted = await svc.accept(created.challengeId, "bob");
    assert.equal(accepted.ok, true);
    const duel = await db.query("SELECT status, tier, stake_minor::text st FROM duel WHERE id=$1", [accepted.duelId]);
    assert.equal(duel.rows[0].status, "READY");
    assert.equal(duel.rows[0].tier, "FREE");
    assert.equal(duel.rows[0].st, "0");
    assert.deepEqual(await events(db, created.challengeId), ["SENT", "ACCEPTED"]);
  });

  test("a COMPETITIVE challenge accepted creates a RESERVED duel -- the SAME shape mm_pair() uses, so dispatch.mjs's existing sweep (untouched by this feature) reserves the stake and brings it live or voids it", async () => {
    const db = await fresh();
    const svc = createChallengeService(db);
    const created = await svc.create({
      gameId: "chess", challengerId: "alice", opponentNickname: "bob",
      tier: "CASH", stakeMinor: u(20), asset: "USDT",
    });
    const accepted = await svc.accept(created.challengeId, "bob");
    assert.equal(accepted.ok, true);
    const duel = await db.query(
      "SELECT status, tier, stake_minor::text st, asset FROM duel WHERE id=$1", [accepted.duelId]
    );
    assert.equal(duel.rows[0].status, "RESERVED", "never READY -- funds are not yet locked");
    assert.equal(duel.rows[0].tier, "CASH");
    assert.equal(duel.rows[0].st, u(20));
    assert.equal(duel.rows[0].asset, "USDT");
  });

  test("MATCH STARTED: accepting logs a real chat_system_event on the new duel's own match channel", async () => {
    const db = await fresh();
    const channels = createChannelService(db);
    const svc = createChallengeService(db, { channels });
    const created = await svc.create({ gameId: "chess", challengerId: "alice", opponentNickname: "bob" });
    const accepted = await svc.accept(created.challengeId, "bob");

    const channelId = matchChannelId(accepted.duelId);
    const events_ = await db.query(
      "SELECT event_type FROM chat_system_event WHERE channel_id=$1", [channelId]
    );
    assert.deepEqual(events_.rows.map((r) => r.event_type), ["MATCH_STARTED"]);
  });

  test("without a channels dependency, accept() still succeeds -- chat is a decoration, never a hard dependency of the match itself", async () => {
    const db = await fresh();
    const svc = createChallengeService(db); // no channels
    const created = await svc.create({ gameId: "chess", challengerId: "alice", opponentNickname: "bob" });
    const accepted = await svc.accept(created.challengeId, "bob");
    assert.equal(accepted.ok, true);
  });

  test("only the named opponent may accept", async () => {
    const db = await fresh();
    const svc = createChallengeService(db);
    const created = await svc.create({ gameId: "chess", challengerId: "alice", opponentNickname: "bob" });
    const r = await svc.accept(created.challengeId, "carol");
    assert.equal(r.reason, ChallengeError.NOT_YOUR_CHALLENGE);
  });

  test("ACCEPT: challenger's listOutgoing returns the accepted challenge with duel_id so challenger joins synchronously", async () => {
    const db = await fresh();
    const svc = createChallengeService(db);
    const created = await svc.create({ gameId: "chess", challengerId: "alice", opponentNickname: "bob" });
    const accepted = await svc.accept(created.challengeId, "bob");
    assert.equal(accepted.ok, true);

    const outgoing = await svc.listOutgoing("alice");
    const match = outgoing.find((c) => c.id === created.challengeId);
    assert.ok(match, "accepted challenge is present in listOutgoing");
    assert.equal(match.status, "ACCEPTED");
    assert.equal(match.duel_id, accepted.duelId);
  });
});

describe("decline() and cancel()", () => {
  test("DECLINE: the opponent declines, and the log shows it", async () => {
    const db = await fresh();
    const svc = createChallengeService(db);
    const created = await svc.create({ gameId: "chess", challengerId: "alice", opponentNickname: "bob" });
    const r = await svc.decline(created.challengeId, "bob");
    assert.equal(r.ok, true);
    const row = await db.query("SELECT status FROM duel_challenge WHERE id=$1", [created.challengeId]);
    assert.equal(row.rows[0].status, "DECLINED");
    assert.deepEqual(await events(db, created.challengeId), ["SENT", "DECLINED"]);
  });

  test("the challenger, not the opponent, may cancel", async () => {
    const db = await fresh();
    const svc = createChallengeService(db);
    const created = await svc.create({ gameId: "chess", challengerId: "alice", opponentNickname: "bob" });
    const wrongCaller = await svc.cancel(created.challengeId, "bob");
    assert.equal(wrongCaller.reason, ChallengeError.NOT_YOUR_CHALLENGE);
    const r = await svc.cancel(created.challengeId, "alice");
    assert.equal(r.ok, true);
    assert.deepEqual(await events(db, created.challengeId), ["SENT", "CANCELLED"]);
  });
});

describe("TIMEOUT: EXPIRED is a real, logged, persisted transition", () => {
  test("POPUP TIMER: a challenge outlives its 30-second window and is unusable by either side", async () => {
    let clock = 1_000_000;
    const db = await fresh();
    const svc = createChallengeService(db, { now: () => clock });
    const created = await svc.create({ gameId: "chess", challengerId: "alice", opponentNickname: "bob" });
    assert.equal(new Date(created.expiresAt).getTime() - clock, CHALLENGE_TTL_MS, "the popup's own visible countdown IS the real window: 30 seconds");

    clock += CHALLENGE_TTL_MS + 1;
    const accept = await svc.accept(created.challengeId, "bob");
    assert.equal(accept.reason, ChallengeError.EXPIRED);

    const row = await db.query("SELECT status, responded_at FROM duel_challenge WHERE id=$1", [created.challengeId]);
    assert.equal(row.rows[0].status, "EXPIRED", "the status column now genuinely reflects it -- not just a query-time illusion");
    assert.ok(row.rows[0].responded_at, "a timestamp is recorded exactly like every other resolution");
    assert.deepEqual(await events(db, created.challengeId), ["SENT", "EXPIRED"]);
  });

  test("ACCEPT AFTER EXPIRATION: the opponent tries to accept a moment too late -- refused, not silently honoured", async () => {
    let clock = 0;
    const db = await fresh();
    const svc = createChallengeService(db, { now: () => clock });
    const created = await svc.create({ gameId: "chess", challengerId: "alice", opponentNickname: "bob" });
    clock += CHALLENGE_TTL_MS + 5000;
    const r = await svc.accept(created.challengeId, "bob");
    assert.equal(r.ok, false);
    assert.equal(r.reason, ChallengeError.EXPIRED);
    const duel = await db.query("SELECT count(*)::int c FROM duel");
    assert.equal(duel.rows[0].c, 0, "no duel is ever created from an expired challenge");
  });

  test("EXPIRED CHALLENGE: decline after expiry is also refused, not silently accepted as a decline", async () => {
    let clock = 0;
    const db = await fresh();
    const svc = createChallengeService(db, { now: () => clock });
    const created = await svc.create({ gameId: "chess", challengerId: "alice", opponentNickname: "bob" });
    clock += CHALLENGE_TTL_MS + 1;
    const r = await svc.decline(created.challengeId, "bob");
    assert.equal(r.reason, ChallengeError.EXPIRED);
  });

  test("expireStale() sweeps every due challenge automatically, exactly what a client that never polls again relies on", async () => {
    let clock = 0;
    const db = await fresh();
    const svc = createChallengeService(db, { now: () => clock });
    const a = await svc.create({ gameId: "chess", challengerId: "alice", opponentNickname: "bob" });
    const c = await svc.create({ gameId: "checkers", challengerId: "alice", opponentNickname: "carol" });

    clock += CHALLENGE_TTL_MS + 1;
    const swept = await svc.expireStale();
    assert.equal(swept.expired, 2);

    for (const id of [a.challengeId, c.challengeId]) {
      const row = await db.query("SELECT status FROM duel_challenge WHERE id=$1", [id]);
      assert.equal(row.rows[0].status, "EXPIRED");
      assert.deepEqual(await events(db, id), ["SENT", "EXPIRED"]);
    }
  });

  test("a resolved (accepted) challenge is never later marked EXPIRED by the sweep", async () => {
    let clock = 0;
    const db = await fresh();
    const svc = createChallengeService(db, { now: () => clock });
    const created = await svc.create({ gameId: "chess", challengerId: "alice", opponentNickname: "bob" });
    await svc.accept(created.challengeId, "bob");

    clock += CHALLENGE_TTL_MS + 1;
    await svc.expireStale();

    const row = await db.query("SELECT status FROM duel_challenge WHERE id=$1", [created.challengeId]);
    assert.equal(row.rows[0].status, "ACCEPTED");
    assert.deepEqual(await events(db, created.challengeId), ["SENT", "ACCEPTED"]);
  });

  // CONCURRENT ACCEPT/DECLINE, against genuinely simultaneous requests, is
  // proven in real-pg-challenge-race.test.mjs -- PGlite is single-connection
  // and cannot substitute for a real race (see that file's own header, and
  // packages/ledger/test/real-pg-concurrency.test.mjs's, for why).
});

describe("listIncoming/listOutgoing never show a challenge past its window", () => {
  test("an expired challenge disappears from both lists, having been flipped by the lazy read itself", async () => {
    let clock = 0;
    const db = await fresh();
    const svc = createChallengeService(db, { now: () => clock });
    const created = await svc.create({ gameId: "chess", challengerId: "alice", opponentNickname: "bob" });

    clock += CHALLENGE_TTL_MS + 1;
    const incoming = await svc.listIncoming("bob");
    const outgoing = await svc.listOutgoing("alice");
    assert.deepEqual(incoming, []);
    assert.deepEqual(outgoing, []);

    const row = await db.query("SELECT status FROM duel_challenge WHERE id=$1", [created.challengeId]);
    assert.equal(row.rows[0].status, "EXPIRED", "listing itself persisted the expiry, not merely filtered around it");
  });

  test("a live challenge carries its stake through to both sides", async () => {
    const db = await fresh();
    const svc = createChallengeService(db);
    await svc.create({
      gameId: "chess", challengerId: "alice", opponentNickname: "bob",
      tier: "CASH", stakeMinor: u(100), asset: "USDT",
    });
    const incoming = await svc.listIncoming("bob");
    const outgoing = await svc.listOutgoing("alice");
    assert.equal(incoming[0].tier, "CASH");
    assert.equal(incoming[0].stake_minor, u(100));
    assert.equal(outgoing[0].tier, "CASH");
    assert.equal(outgoing[0].stake_minor, u(100));
  });
});
