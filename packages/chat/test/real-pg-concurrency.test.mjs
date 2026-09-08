/**
 * Real PostgreSQL, multiple independent connections -- see
 * packages/support/test/real-pg-concurrency.test.mjs's own header for why
 * this matters and PGlite (single connection) cannot substitute for it.
 *
 * Every guarantee the chat package makes under concurrency -- a duplicate
 * client_message_id never creates two rows, two players racing to be the
 * FIRST to chat about the same match never create two channels, a message
 * cannot be deleted twice, a mute/unmute race lands in exactly one final
 * state, and history's own ordering survives concurrent writers -- rests on
 * a real unique index or compare-and-swap UPDATE, not a check-then-act
 * promise in application code.
 *
 * Every test below closes its own connections in a `finally` block: an
 * assertion failure must never leak an open pg.Client, which otherwise
 * keeps this process's event loop alive and the whole file hangs after
 * `node --test` has already finished running every test -- exactly the
 * failure mode that made an earlier version of this file look like a
 * database deadlock when it was actually a leaked connection following a
 * genuine (now-fixed) bug in getOrCreateMatchChannel.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createPgAdapter } from "../../ledger/src/pg-adapter.mjs";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createChannelService, globalChannelId, matchChannelId, spectatorChannelId } from "../src/channels.mjs";
import { createModerationService, ChatMuteScope } from "../src/moderation.mjs";
import { createBlockService } from "../src/blocks.mjs";
import { createMessageService } from "../src/messages.mjs";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || "postgres://postgres:postgres@localhost:5432/skill_platform_test";

let reachable = true;
let reachabilityError = null;
try {
  const probe = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await probe.connect();
  await probe.query("SELECT 1");
  await probe.end();
} catch (e) {
  reachable = false;
  reachabilityError = e;
}

async function connection() {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  const db = createPgAdapter(client);
  const channels = createChannelService(db);
  const moderation = createModerationService(db);
  const blocks = createBlockService(db);
  const messages = createMessageService(db, { channels, moderation, blocks });
  return { client, db, channels, moderation, blocks, messages };
}

/** Opens two connections, runs `fn(A, B)`, and closes BOTH no matter what --
 * the one thing every test in this file must never skip. */
async function withTwoConnections(fn) {
  const A = await connection();
  const B = await connection();
  try {
    await fn(A, B);
  } finally {
    await Promise.all([A.client.end(), B.client.end()]);
  }
}

function id(prefix) {
  return `${prefix}${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

describe(
  "Chat concurrency, against real Postgres",
  { skip: reachable ? false : `Postgres not reachable at ${TEST_DATABASE_URL}: ${reachabilityError?.message}` },
  () => {
    let admin;

    before(async () => {
      admin = await connection();
      await migrate(admin.db);
    });

    after(async () => { await admin.client.end(); });

    async function seedPlayer(playerId) {
      await admin.client.query("INSERT INTO player (id, handle) VALUES ($1,$1)", [playerId]);
    }

    async function seedDuel(duelId, seat0, seat1) {
      await admin.client.query(
        `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1, tier, stake_minor, initial_state, time_control)
         VALUES ($1,'chess',1,$1,$2,$3,'FREE',0,'{}'::jsonb,'{}'::jsonb)`,
        [duelId, seat0, seat1]
      );
    }

    test("duplicate client_message_id from two connections: exactly one row exists, the loser gets the SAME message back, not an error", async () => {
      const playerId = id("cust");
      await seedPlayer(playerId);
      const clientMessageId = id("cmid");

      await withTwoConnections(async (A, B) => {
        const [ra, rb] = await Promise.all([
          A.messages.sendMessage({ channelId: globalChannelId(), senderId: playerId, content: "race content", clientMessageId }),
          B.messages.sendMessage({ channelId: globalChannelId(), senderId: playerId, content: "race content", clientMessageId }),
        ]);
        assert.ok(ra.ok && rb.ok, `both calls must resolve successfully, got ${JSON.stringify([ra, rb])}`);
        assert.equal(ra.message.id, rb.message.id, "both callers must see the SAME message id");

        const rows = await admin.client.query(
          "SELECT count(*)::int AS n FROM chat_message WHERE sender_id = $1 AND client_message_id = $2",
          [playerId, clientMessageId]
        );
        assert.equal(rows.rows[0].n, 1, "exactly one row must exist, never two");
      });
    });

    test("two DIFFERENT messages sent concurrently by two players both land, each with its own id", async () => {
      const p1 = id("cust");
      const p2 = id("cust");
      await seedPlayer(p1); await seedPlayer(p2);

      await withTwoConnections(async (A, B) => {
        const [ra, rb] = await Promise.all([
          A.messages.sendMessage({ channelId: globalChannelId(), senderId: p1, content: "message from p1", clientMessageId: id("cm") }),
          B.messages.sendMessage({ channelId: globalChannelId(), senderId: p2, content: "message from p2", clientMessageId: id("cm") }),
        ]);
        assert.ok(ra.ok && rb.ok);
        assert.notEqual(ra.message.id, rb.message.id);
      });
    });

    test("two players racing to be first to chat about the SAME match: exactly one channel row exists", async () => {
      const p1 = id("cust");
      const p2 = id("cust");
      const duelId = id("duel");
      await seedPlayer(p1); await seedPlayer(p2);
      await seedDuel(duelId, p1, p2);

      await withTwoConnections(async (A, B) => {
        const [ca, cb] = await Promise.all([
          A.channels.getOrCreateMatchChannel(duelId),
          B.channels.getOrCreateMatchChannel(duelId),
        ]);
        assert.equal(ca.id, cb.id);
        assert.equal(ca.id, matchChannelId(duelId));

        const rows = await admin.client.query(
          "SELECT count(*)::int AS n FROM chat_channel WHERE reference_type = 'DUEL' AND reference_id = $1", [duelId]
        );
        assert.equal(rows.rows[0].n, 1, "exactly one channel row must exist for this duel, never two");
      });
    });

    test("concurrent moderation delete of the SAME message: exactly one caller succeeds, the other sees ALREADY_REMOVED", async () => {
      const playerId = id("cust");
      const modId = id("mod");
      await seedPlayer(playerId);
      await admin.client.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ($1,$1,$1,TRUE)", [modId]);
      const sent = await admin.messages.sendMessage({ channelId: globalChannelId(), senderId: playerId, content: "delete me", clientMessageId: id("cm") });
      assert.equal(sent.ok, true);

      await withTwoConnections(async (A, B) => {
        const [ra, rb] = await Promise.all([
          A.messages.moderateDelete({ messageId: sent.message.id, moderatorId: modId }),
          B.messages.moderateDelete({ messageId: sent.message.id, moderatorId: modId }),
        ]);
        const succeeded = [ra, rb].filter((r) => r.ok);
        const failed = [ra, rb].filter((r) => !r.ok);
        assert.equal(succeeded.length, 1, `expected exactly one successful delete, got ${JSON.stringify([ra, rb])}`);
        assert.equal(failed.length, 1);
        assert.equal(failed[0].reason, "ALREADY_REMOVED");

        const row = await admin.client.query("SELECT deleted_at, deleted_by FROM chat_message WHERE id = $1", [sent.message.id]);
        assert.ok(row.rows[0].deleted_at);
        assert.equal(row.rows[0].deleted_by, modId);
      });
    });

    test("concurrent mute of the same player from two connections: both succeed independently, and isMuted reflects at least one", async () => {
      const targetId = id("cust");
      const mod1 = id("mod");
      const mod2 = id("mod");
      await seedPlayer(targetId);
      await admin.client.query(
        "INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ($1,$1,$1,TRUE),($2,$2,$2,TRUE)",
        [mod1, mod2]
      );

      await withTwoConnections(async (A, B) => {
        const [ra, rb] = await Promise.all([
          A.moderation.muteUser({ targetId, moderatorId: mod1, reason: "spam a", scope: ChatMuteScope.GLOBAL_CHAT }),
          B.moderation.muteUser({ targetId, moderatorId: mod2, reason: "spam b", scope: ChatMuteScope.GLOBAL_CHAT }),
        ]);
        assert.ok(ra.ok && rb.ok, "two independent mute rows are both legitimate -- not a race to prevent");
        assert.notEqual(ra.muteId, rb.muteId);

        const stillMuted = await admin.moderation.isMuted(targetId, ChatMuteScope.GLOBAL_CHAT);
        assert.equal(stillMuted, true);

        const rows = await admin.client.query("SELECT count(*)::int AS n FROM chat_mute WHERE target_id = $1", [targetId]);
        assert.equal(rows.rows[0].n, 2, "both mute rows must be preserved -- neither silently overwrites the other");
      });
    });

    test("concurrent revoke of the SAME mute: exactly one caller succeeds, the other sees ALREADY_REVOKED", async () => {
      const targetId = id("cust");
      const modId = id("mod");
      await seedPlayer(targetId);
      await admin.client.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ($1,$1,$1,TRUE)", [modId]);
      const muted = await admin.moderation.muteUser({ targetId, moderatorId: modId, reason: "test", scope: ChatMuteScope.GLOBAL_CHAT });

      await withTwoConnections(async (A, B) => {
        const [ra, rb] = await Promise.all([
          A.moderation.unmuteUser({ muteId: muted.muteId, revokedBy: modId }),
          B.moderation.unmuteUser({ muteId: muted.muteId, revokedBy: modId }),
        ]);
        const succeeded = [ra, rb].filter((r) => r.ok);
        assert.equal(succeeded.length, 1, `expected exactly one successful revoke, got ${JSON.stringify([ra, rb])}`);
        assert.equal([ra, rb].filter((r) => !r.ok)[0].reason, "ALREADY_REVOKED");
      });
    });

    test("concurrent report of the SAME message from two connections: both reports are recorded independently", async () => {
      const senderId = id("cust");
      const reporter1 = id("cust");
      const reporter2 = id("cust");
      await seedPlayer(senderId); await seedPlayer(reporter1); await seedPlayer(reporter2);
      const sent = await admin.messages.sendMessage({ channelId: globalChannelId(), senderId, content: "reportable", clientMessageId: id("cm") });

      const { createReportService } = await import("../src/reports.mjs");
      await withTwoConnections(async (A, B) => {
        const reportsA = createReportService(A.db);
        const reportsB = createReportService(B.db);
        const [ra, rb] = await Promise.all([
          reportsA.reportMessage({ reporterId: reporter1, messageId: sent.message.id, category: "SPAM" }),
          reportsB.reportMessage({ reporterId: reporter2, messageId: sent.message.id, category: "ABUSE" }),
        ]);
        assert.ok(ra.ok && rb.ok, `both independent reports must succeed, got ${JSON.stringify([ra, rb])}`);
        assert.notEqual(ra.reportId, rb.reportId);

        const rows = await admin.client.query(
          "SELECT count(*)::int AS n FROM content_report WHERE message_id = $1", [sent.message.id]
        );
        assert.equal(rows.rows[0].n, 2, "both reports must be preserved -- neither silently overwrites the other");
      });
    });

    test("history ordering survives concurrent writers: every id-ordered page is strictly increasing, no gaps in relative order", async () => {
      const playerId = id("cust");
      await seedPlayer(playerId);
      const channelId = `race-hist-${id("")}`;
      await admin.client.query("INSERT INTO chat_channel (id, type) VALUES ($1, 'GLOBAL')", [channelId]);

      // Each connection sends its own five messages STRICTLY in sequence
      // (each awaited before the next is issued) -- node-postgres's Client
      // (unlike Pool) has exactly one physical connection, so firing
      // several `.query()` calls before the first resolves is merely
      // pipelined, not truly parallel, and is deprecated for exactly that
      // reason. The genuine concurrency under test here is A's sequence
      // racing against B's, at the database level -- not ten overlapping
      // calls sharing two sockets.
      async function sendSeries(conn, prefix, count) {
        for (let i = 0; i < count; i++) {
          const r = await conn.messages.sendMessage({ channelId, senderId: playerId, content: `${prefix}-${i}`, clientMessageId: id(`${prefix}${i}-`) });
          assert.equal(r.ok, true, `send ${prefix}-${i} must succeed, got ${JSON.stringify(r)}`);
        }
      }

      await withTwoConnections(async (A, B) => {
        await Promise.all([sendSeries(A, "A", 5), sendSeries(B, "B", 5)]);

        const page = await admin.messages.listHistory({ channelId, viewerId: playerId, limit: 100 });
        const ids = page.map((m) => Number(m.id));
        const sorted = [...ids].sort((a, b) => b - a); // listHistory returns newest-first
        assert.deepEqual(ids, sorted, "history must come back in real id order even after concurrent writers");
        assert.equal(new Set(ids).size, 10, "all ten messages must be present, none lost or duplicated");
      });
    });

    // --- Slice 10: spectator channel + lifecycle concurrency -------------

    test("two connections racing to be first to SPECTATE the same duel: exactly one spectator channel row exists", async () => {
      const a = id("specra"); const b = id("specrb");
      await seedPlayer(a); await seedPlayer(b);
      const duelId = id("specrduel");
      await seedDuel(duelId, a, b);

      await withTwoConnections(async (A, B) => {
        const [ca, cb] = await Promise.all([
          A.channels.getOrCreateSpectatorChannel(duelId),
          B.channels.getOrCreateSpectatorChannel(duelId),
        ]);
        assert.equal(ca.id, cb.id, "both callers must observe the SAME spectator channel row");

        const rows = await admin.client.query(
          "SELECT count(*)::int AS n FROM chat_channel WHERE type='SPECTATOR' AND reference_id=$1",
          [duelId]
        );
        assert.equal(rows.rows[0].n, 1, "exactly one spectator channel row must exist, never two");
      });
    });

    test("concurrent markMatchCompleted from two connections: the post_game_deadline is set exactly once, never overwritten by the loser", async () => {
      const a = id("lifera"); const b = id("liferb");
      await seedPlayer(a); await seedPlayer(b);
      const duelId = id("liferduel");
      await seedDuel(duelId, a, b);
      await admin.channels.getOrCreateMatchChannel(duelId);

      await withTwoConnections(async (A, B) => {
        await Promise.all([
          A.channels.markMatchCompleted(duelId, { at: 1_000_000, windowMs: 5000 }),
          B.channels.markMatchCompleted(duelId, { at: 9_000_000, windowMs: 5000 }),
        ]);
        const ch = await admin.channels.getChannel(matchChannelId(duelId));
        // Whichever of the two writers' UPDATE actually landed (the
        // `post_game_deadline IS NULL` guard means only ONE of them can
        // ever match a row), the deadline is one of the two real values
        // offered -- 1,005,000 or 9,005,000 -- and CRUCIALLY not some
        // corrupted third value, and a THIRD read confirms it is stable.
        const deadline = new Date(ch.post_game_deadline).getTime();
        assert.ok(deadline === 1_005_000 || deadline === 9_005_000, `unexpected deadline: ${deadline}`);
        const again = await admin.channels.getChannel(matchChannelId(duelId));
        assert.equal(new Date(again.post_game_deadline).getTime(), deadline, "the deadline must not drift on a later read");
      });
    });

    test("match completion racing a concurrent spectator join: both operations succeed cleanly, and the spectator channel ends up with the SAME deadline as the match channel", async () => {
      const a = id("mcsa"); const b = id("mcsb");
      await seedPlayer(a); await seedPlayer(b);
      const duelId = id("mcsduel");
      await seedDuel(duelId, a, b);
      await admin.channels.getOrCreateMatchChannel(duelId);

      await withTwoConnections(async (A, B) => {
        const [, spectatorChannel] = await Promise.all([
          A.channels.markMatchCompleted(duelId, { at: 2_000_000, windowMs: 1000 }),
          B.channels.getOrCreateSpectatorChannel(duelId),
        ]);
        assert.ok(spectatorChannel.id, "the spectator channel creation itself must succeed regardless of the race's ordering");

        const match = await admin.channels.getChannel(matchChannelId(duelId));
        const spectator = await admin.channels.getChannel(spectatorChannelId(duelId));
        assert.ok(match.post_game_deadline, "the match channel must have been stamped");
        // If the spectator channel existed BEFORE markMatchCompleted's
        // UPDATE ran, it gets the SAME deadline (the UPDATE targets both
        // channel types for the duel in one statement). If it was created
        // AFTER, it has none yet -- both are valid orderings of a genuine
        // race; what must NEVER happen is a crash, a lost update, or the
        // two channels disagreeing about a deadline they DO both have.
        if (spectator.post_game_deadline) {
          assert.equal(new Date(spectator.post_game_deadline).getTime(), new Date(match.post_game_deadline).getTime());
        }
      });
    });

    test("concurrent moderation delete of a SPECTATOR-channel message behaves identically to a match/global one: exactly one caller succeeds", async () => {
      const a = id("smsa"); const b = id("smsb"); const mod = id("smsmod");
      await seedPlayer(a); await seedPlayer(b);
      const duelId = id("smsduel");
      await seedDuel(duelId, a, b);
      await admin.client.query("INSERT INTO admin_user (id,email,display_name,mfa_enrolled) VALUES ($1,$2,$1,TRUE)", [mod, `${mod}@n`]);
      const channel = await admin.channels.getOrCreateSpectatorChannel(duelId);
      const sent = await admin.messages.sendMessage({ channelId: channel.id, senderId: a, content: "spectator commentary", clientMessageId: id("sms-") });
      assert.equal(sent.ok, true);

      await withTwoConnections(async (A, B) => {
        const [ra, rb] = await Promise.all([
          A.messages.moderateDelete({ messageId: sent.message.id, moderatorId: mod }),
          B.messages.moderateDelete({ messageId: sent.message.id, moderatorId: mod }),
        ]);
        const results = [ra, rb];
        assert.equal(results.filter((r) => r.ok).length, 1, "exactly one caller must succeed");
        assert.equal(results.filter((r) => !r.ok).length, 1, "the other must see a clean ALREADY_REMOVED, never an error");
      });
    });
  }
);
