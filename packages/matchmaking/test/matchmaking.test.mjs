/**
 * Matchmaking correctness, against real PostgreSQL.
 *
 * Every failure mode named in the mandate -- double reservation, double
 * joining, stale queue, race conditions, duplicate matches -- is a concurrency
 * bug, and each becomes a money bug once entry fees exist. The point of these
 * tests is to show the guards are STRUCTURAL: constraints and indexes, not
 * service code that a future refactor can quietly bypass.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { isEstablished } from "../../rating/src/glicko2.mjs";

const TC = JSON.stringify({ initialMs: 300000, incrementMs: 3000 });
const INITIAL = JSON.stringify({ fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" });

async function fresh(players = ["alice", "bob", "carol"]) {
  const db = await PGlite.create();
  await migrate(db);
  for (const p of players) {
    await db.query("INSERT INTO player (id, handle) VALUES ($1, $2)", [p, p]);
  }
  return db;
}

async function enqueue(db, playerId, {
  rating = 1500, tier = "FREE", stake = 0, mode = "blitz", ttlSeconds = 60,
} = {}) {
  const r = await db.query(
    `INSERT INTO matchmaking_ticket
       (player_id, game_id, mode, time_control, tier, stake_minor, rating_x100, expires_at)
     VALUES ($1,'chess',$2,$3::jsonb,$4::entry_tier,$5,$6, now() + ($7 || ' seconds')::interval)
     RETURNING id`,
    [playerId, mode, TC, tier, stake, Math.round(rating * 100), String(ttlSeconds)]
  );
  return r.rows[0].id;
}

async function pair(db, { duelId = "duel-" + Math.random().toString(36).slice(2, 10),
  tier = "FREE", stake = 0, mode = "blitz" } = {}) {
  const r = await db.query(
    `SELECT * FROM mm_pair('chess', $1, $2::entry_tier, $3, $4, $5::jsonb, $6::jsonb)`,
    [mode, tier, stake, duelId, INITIAL, TC]
  );
  return r.rows[0] ?? null;
}

async function rejects(fn, pattern) {
  try { await fn(); } catch (e) {
    assert.match(e.message, pattern, `wrong rejection: ${e.message}`);
    return e;
  }
  assert.fail("expected the database to reject this");
}

// ---------------------------------------------------------------------------

describe("migrations", () => {
  test("0003 applies on top of the ledger migrations", async () => {
    const db = await PGlite.create();
    const ran = await migrate(db);
    assert.ok(ran.includes("0003_players_ratings_matchmaking_duels.sql"));
    assert.deepEqual(ran, [...ran].sort(), "migrations apply in filename order");
    // 0003 references ledger_deny_mutation() from 0001, so ordering is load-bearing.
    assert.ok(
      ran.indexOf("0001_ledger_core.sql") < ran.indexOf("0003_players_ratings_matchmaking_duels.sql"),
      "the ledger migration must precede the one that reuses its trigger function"
    );
  });
});

describe("no double joining", () => {
  test("a player may hold only one active ticket — enforced by index", async () => {
    const db = await fresh();
    await enqueue(db, "alice");
    await rejects(() => enqueue(db, "alice"), /matchmaking_one_active_per_player|duplicate key/);
  });

  test("cancelling a ticket frees the player to queue again", async () => {
    const db = await fresh();
    await enqueue(db, "alice");
    await db.query("UPDATE matchmaking_ticket SET status='CANCELLED' WHERE player_id='alice'");
    const second = await enqueue(db, "alice");
    assert.ok(second, "requeue must be allowed once the old ticket is inactive");
  });

  test("being matched frees the player to queue for the next duel", async () => {
    const db = await fresh();
    await enqueue(db, "alice");
    await enqueue(db, "bob");
    await pair(db);
    const again = await enqueue(db, "alice");
    assert.ok(again);
  });

  test("the partial index only constrains ACTIVE tickets", async () => {
    const db = await fresh();
    for (let i = 0; i < 5; i++) {
      await enqueue(db, "alice");
      await db.query("UPDATE matchmaking_ticket SET status='EXPIRED' WHERE status='ACTIVE'");
    }
    const n = await db.query("SELECT count(*)::int c FROM matchmaking_ticket WHERE player_id='alice'");
    assert.equal(n.rows[0].c, 5, "history is kept; only concurrency is constrained");
  });
});

describe("pairing", () => {
  test("two compatible tickets become one duel", async () => {
    const db = await fresh();
    await enqueue(db, "alice", { rating: 1500 });
    await enqueue(db, "bob", { rating: 1520 });

    const res = await pair(db, { duelId: "duel-1" });
    assert.equal(res.created, true);
    assert.equal(res.duel_id, "duel-1");

    const d = await db.query("SELECT * FROM duel WHERE id='duel-1'");
    assert.equal(d.rows.length, 1);
    assert.equal(d.rows[0].status, "READY", "a free duel is immediately ready");
    assert.deepEqual(
      [d.rows[0].seat_0, d.rows[0].seat_1].sort(),
      ["alice", "bob"]
    );

    const tickets = await db.query("SELECT status, duel_id FROM matchmaking_ticket");
    assert.ok(tickets.rows.every((t) => t.status === "MATCHED" && t.duel_id === "duel-1"));
  });

  test("seat assignment is deterministic, not random", async () => {
    // A replay must be verifiable without recording which way a coin landed.
    for (const order of [["alice", "bob"], ["bob", "alice"]]) {
      const db = await fresh();
      await enqueue(db, order[0]);
      await enqueue(db, order[1]);
      const res = await pair(db);
      assert.equal(res.seat_0, "alice", "lower player id always takes seat 0");
      assert.equal(res.seat_1, "bob");
    }
  });

  test("a lone ticket produces no duel", async () => {
    const db = await fresh();
    await enqueue(db, "alice");
    assert.equal(await pair(db), null);
    const d = await db.query("SELECT count(*)::int c FROM duel");
    assert.equal(d.rows[0].c, 0);
  });

  test("a player is never paired with themselves", async () => {
    const db = await fresh();
    await enqueue(db, "alice");
    // Even if a second active ticket could somehow exist for the same player,
    // the pairing query excludes it and the duel check constraint would refuse.
    assert.equal(await pair(db), null);
    await rejects(
      () => db.query(
        `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
                           tier, stake_minor, initial_state, time_control)
         VALUES ('self','chess',1,'k','alice','alice','FREE',0,$1::jsonb,$2::jsonb)`,
        [INITIAL, TC]
      ),
      /duel_distinct_players|violates check constraint/
    );
  });

  test("pairing is idempotent — a retry returns the same duel", async () => {
    const db = await fresh();
    await enqueue(db, "alice");
    await enqueue(db, "bob");
    const first = await pair(db, { duelId: "duel-a" });
    assert.equal(first.created, true);

    // Re-activate the tickets to simulate a pairer retrying after an ambiguous
    // failure: the pairing key is the same, so no second duel may appear.
    await db.query("UPDATE matchmaking_ticket SET status='ACTIVE', duel_id=NULL");
    const retry = await pair(db, { duelId: "duel-b" });
    assert.equal(retry.created, false, "must not create a second duel");
    assert.equal(retry.duel_id, "duel-a", "returns the original");

    const n = await db.query("SELECT count(*)::int c FROM duel");
    assert.equal(n.rows[0].c, 1);
  });

  test("different players in the same pool produce different duels", async () => {
    const db = await fresh(["alice", "bob", "carol", "dave"]);
    for (const [p, r] of [["alice", 1500], ["bob", 1505], ["carol", 1510], ["dave", 1515]]) {
      await enqueue(db, p, { rating: r });
    }
    const a = await pair(db, { duelId: "d1" });
    const b = await pair(db, { duelId: "d2" });
    assert.equal(a.created, true);
    assert.equal(b.created, true);
    assert.notEqual(a.duel_id, b.duel_id);
    const remaining = await db.query(
      "SELECT count(*)::int c FROM matchmaking_ticket WHERE status='ACTIVE'"
    );
    assert.equal(remaining.rows[0].c, 0, "all four players matched");
  });
});

describe("rating bands", () => {
  test("players too far apart do not pair immediately", async () => {
    const db = await fresh();
    await enqueue(db, "alice", { rating: 1500 });
    await enqueue(db, "bob", { rating: 1700 });   // 200 apart, band opens at 50
    assert.equal(await pair(db), null);
  });

  test("the band widens with waiting time", async () => {
    const db = await fresh();
    await enqueue(db, "alice", { rating: 1500 });
    await enqueue(db, "bob", { rating: 1700 });
    assert.equal(await pair(db), null, "not yet");

    // Age the older ticket by 30s: spread becomes 50 + 6*25 = 200.
    await db.query(
      "UPDATE matchmaking_ticket SET enqueued_at = now() - interval '30 seconds' WHERE player_id='alice'"
    );
    const res = await pair(db, { duelId: "duel-waited" });
    assert.ok(res, "a 200-point gap should now be inside the band");
    assert.equal(res.created, true);
  });

  test("the band has a ceiling — a huge gap never pairs", async () => {
    const db = await fresh();
    await enqueue(db, "alice", { rating: 1000, ttlSeconds: 3600 });
    await enqueue(db, "bob", { rating: 2400, ttlSeconds: 3600 });
    await db.query("UPDATE matchmaking_ticket SET enqueued_at = now() - interval '1 hour'");
    assert.equal(await pair(db), null,
      "Bronze must never be fed to Grandmaster just because the queue is thin");
  });

  test("the closest-rated opponent is chosen, not merely the oldest", async () => {
    const db = await fresh(["alice", "bob", "carol"]);
    await enqueue(db, "alice", { rating: 1500 });
    await enqueue(db, "bob", { rating: 1540 });    // enqueued earlier, further away
    await enqueue(db, "carol", { rating: 1505 });  // enqueued later, closer
    const res = await pair(db, { duelId: "duel-close" });
    assert.deepEqual([res.seat_0, res.seat_1].sort(), ["alice", "carol"]);
  });
});

describe("pools do not leak into each other", () => {
  test("different modes never pair", async () => {
    const db = await fresh();
    await enqueue(db, "alice", { mode: "blitz" });
    await enqueue(db, "bob", { mode: "rapid" });
    assert.equal(await pair(db, { mode: "blitz" }), null);
  });

  test("different stakes never pair", async () => {
    const db = await fresh();
    await enqueue(db, "alice", { tier: "CASH", stake: 10_000_000 });
    await enqueue(db, "bob", { tier: "CASH", stake: 25_000_000 });
    assert.equal(await pair(db, { tier: "CASH", stake: 10_000_000 }), null);
  });

  test("free and cash players never meet", async () => {
    const db = await fresh();
    await enqueue(db, "alice", { tier: "FREE" });
    await enqueue(db, "bob", { tier: "CASH", stake: 10_000_000 });
    assert.equal(await pair(db, { tier: "FREE" }), null);
  });
});

describe("stale queue entries", () => {
  test("an expired ticket is never matched", async () => {
    const db = await fresh();
    await enqueue(db, "alice");
    await enqueue(db, "bob");
    await db.query(
      "UPDATE matchmaking_ticket SET expires_at = now() - interval '1 second' WHERE player_id='bob'"
    );
    assert.equal(await pair(db), null);
  });

  test("the sweeper expires ticket by TTL and by missed heartbeat", async () => {
    const db = await fresh(["alice", "bob", "carol"]);
    await enqueue(db, "alice");
    await enqueue(db, "bob");
    await enqueue(db, "carol");
    await db.query(
      "UPDATE matchmaking_ticket SET expires_at = now() - interval '1s' WHERE player_id='alice'"
    );
    await db.query(
      "UPDATE matchmaking_ticket SET heartbeat_at = now() - interval '5 minutes' WHERE player_id='bob'"
    );

    const r = await db.query("SELECT mm_expire_stale() AS n");
    assert.equal(r.rows[0].n, 2, "both the timed-out and the silent ticket");

    const active = await db.query(
      "SELECT player_id FROM matchmaking_ticket WHERE status='ACTIVE'"
    );
    assert.deepEqual(active.rows.map((x) => x.player_id), ["carol"]);
  });

  test("the sweeper is idempotent", async () => {
    const db = await fresh();
    await enqueue(db, "alice");
    await db.query("UPDATE matchmaking_ticket SET expires_at = now() - interval '1s'");
    assert.equal((await db.query("SELECT mm_expire_stale() n")).rows[0].n, 1);
    assert.equal((await db.query("SELECT mm_expire_stale() n")).rows[0].n, 0);
  });
});

describe("duel integrity", () => {
  test("a cash duel is created RESERVED, before any play", async () => {
    // Money locks before the duel starts; a duel with a stake never begins
    // with unlocked funds.
    const db = await fresh();
    await enqueue(db, "alice", { tier: "CASH", stake: 10_000_000 });
    await enqueue(db, "bob", { tier: "CASH", stake: 10_000_000 });
    const res = await pair(db, { duelId: "cash-1", tier: "CASH", stake: 10_000_000 });
    const d = await db.query("SELECT status, asset, stake_minor::text s FROM duel WHERE id='cash-1'");
    assert.equal(d.rows[0].status, "RESERVED");
    assert.equal(d.rows[0].asset, "USDT");
    assert.equal(d.rows[0].s, "10000000");
    assert.equal(res.created, true);
  });

  test("a completed duel must carry a result and a reason", async () => {
    const db = await fresh();
    await enqueue(db, "alice");
    await enqueue(db, "bob");
    await pair(db, { duelId: "d-x" });
    await rejects(
      () => db.query("UPDATE duel SET status='COMPLETED' WHERE id='d-x'"),
      /duel_completed_has_result|violates check constraint/
    );
    await db.query(
      `UPDATE duel SET status='COMPLETED', result='1-0', termination_reason='CHECKMATE',
              completed_at=now(), game_hash='abc' WHERE id='d-x'`
    );
    const d = await db.query("SELECT result FROM duel WHERE id='d-x'");
    assert.equal(d.rows[0].result, "1-0");
  });

  test("a duel cannot be settled without having completed", async () => {
    const db = await fresh();
    await enqueue(db, "alice");
    await enqueue(db, "bob");
    await pair(db, { duelId: "d-y" });
    await rejects(
      () => db.query(
        `UPDATE duel SET status='SETTLED', result='1-0', termination_reason='CHECKMATE'
          WHERE id='d-y'`
      ),
      /duel_settled_was_completed|violates check constraint/
    );
  });

  test("a cash duel cannot exist without a stake", async () => {
    const db = await fresh();
    await rejects(
      () => db.query(
        `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
                           tier, stake_minor, initial_state, time_control)
         VALUES ('bad','chess',1,'k2','alice','bob','CASH',0,$1::jsonb,$2::jsonb)`,
        [INITIAL, TC]
      ),
      /duel_cash_has_stake|violates check constraint/
    );
  });

  test("duel events are append-only", async () => {
    const db = await fresh();
    await enqueue(db, "alice");
    await enqueue(db, "bob");
    await pair(db, { duelId: "d-z" });
    await db.query(
      `INSERT INTO duel_event (duel_id, seq, type, payload, server_time_ms)
       VALUES ('d-z', 0, 'MOVE', '{"uci":"e2e4"}'::jsonb, 1000)`
    );
    await rejects(
      () => db.query("UPDATE duel_event SET payload='{\"uci\":\"e2e5\"}'::jsonb WHERE duel_id='d-z'"),
      /append-only/
    );
    await rejects(() => db.query("DELETE FROM duel_event WHERE duel_id='d-z'"), /append-only/);
  });

  test("an event sequence number cannot be reused", async () => {
    const db = await fresh();
    await enqueue(db, "alice");
    await enqueue(db, "bob");
    await pair(db, { duelId: "d-seq" });
    const ins = (seq) => db.query(
      `INSERT INTO duel_event (duel_id, seq, type, payload, server_time_ms)
       VALUES ('d-seq', $1, 'MOVE', '{}'::jsonb, 0)`, [seq]
    );
    await ins(0);
    await rejects(() => ins(0), /duplicate key|duel_event_pkey/);
  });
});

describe("rating gate agrees across SQL and application code", () => {
  test("rating_is_established() matches isEstablished()", async () => {
    const db = await fresh();
    const cases = [
      { rd: 350, games: 0 }, { rd: 90, games: 25 }, { rd: 90, games: 4 },
      { rd: 200, games: 200 }, { rd: 110, games: 10 }, { rd: 111, games: 10 },
      { rd: 110, games: 9 },
    ];
    for (const c of cases) {
      const sql = await db.query("SELECT rating_is_established($1,$2) AS ok",
        [Math.round(c.rd * 100), c.games]);
      const js = isEstablished({ rating: 1500, rd: c.rd, volatility: 0.06 }, c.games);
      assert.equal(sql.rows[0].ok, js,
        `disagreement at rd=${c.rd} games=${c.games}: SQL=${sql.rows[0].ok} JS=${js}`);
    }
  });
});
