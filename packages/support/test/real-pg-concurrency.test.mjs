/**
 * Real PostgreSQL, multiple independent connections -- see
 * packages/profile/test/real-pg-concurrency.test.mjs's own header for why
 * this matters and PGlite (single connection) cannot substitute for it.
 *
 * Every guarantee ticket.mjs makes under concurrency -- exactly one final
 * assignee, a status transition validated against the CURRENT row rather
 * than a stale read, at most one open ticket per reference, at most one
 * notification per logical event -- rests on a real compare-and-swap
 * UPDATE or a real UNIQUE index, not a check-then-act promise in
 * application code. This file is the direct evidence those guarantees hold
 * when two requests race for real, on two separate connections.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createPgAdapter } from "../../ledger/src/pg-adapter.mjs";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createTicketService } from "../src/ticket.mjs";
import { createTicketNotificationFlow } from "../src/notifications.mjs";
import { createMockEmailProvider } from "../../email/src/provider.mjs";
import { createEmailService } from "../../email/src/email-service.mjs";

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
  return { client, db, tickets: createTicketService(db) };
}

function id(prefix) {
  return `${prefix}${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

describe(
  "Support ticket concurrency, against real Postgres",
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

    async function seedAgent(agentId) {
      await seedPlayer(agentId);
      await admin.client.query(
        "INSERT INTO admin_user (id, email, display_name, mfa_enrolled) VALUES ($1,$1,$1,TRUE)", [agentId]
      );
    }

    async function openTicket(playerId) {
      const r = await admin.tickets.createTicket({ playerId, category: "OTHER", subject: "Race test" });
      assert.equal(r.ok, true);
      return r.ticketId;
    }

    test("simultaneous assignment to two DIFFERENT agents: the row ends up assigned to exactly one, never a hybrid", async () => {
      const playerId = id("cust");
      const agentA = id("agta");
      const agentB = id("agtb");
      await seedPlayer(playerId);
      await seedAgent(agentA);
      await seedAgent(agentB);
      const ticketId = await openTicket(playerId);

      const A = await connection();
      const B = await connection();
      const [ra, rb] = await Promise.all([
        A.tickets.assignTicket({ ticketId, assigneeId: agentA, assignedBy: agentA }),
        B.tickets.assignTicket({ ticketId, assigneeId: agentB, assignedBy: agentB }),
      ]);
      assert.ok(ra.ok && rb.ok, "both plain assignments succeed -- last write wins is the documented policy");

      const row = await admin.client.query("SELECT assignee_id, status FROM support_ticket WHERE id = $1", [ticketId]);
      assert.ok([agentA, agentB].includes(row.rows[0].assignee_id), "assignee must be exactly one of the two, never null or a corrupted mix");
      assert.equal(row.rows[0].status, "ASSIGNED");

      await Promise.all([A.client.end(), B.client.end()]);
    });

    test("simultaneous status transition from the SAME source status: only one of two conflicting transitions wins", async () => {
      const playerId = id("cust");
      await seedPlayer(playerId);
      const ticketId = await openTicket(playerId);
      await admin.tickets.changeStatus({ ticketId, toStatus: "TRIAGED" });

      const A = await connection();
      const B = await connection();
      // TRIAGED -> ASSIGNED and TRIAGED -> RESOLVED are BOTH valid from
      // TRIAGED, but mutually exclusive as a real outcome -- exactly one
      // must actually land, and the LOSER must be rejected because the row
      // no longer matches the status it read, not silently overwritten.
      const [ra, rb] = await Promise.all([
        A.tickets.changeStatus({ ticketId, toStatus: "ASSIGNED" }),
        B.tickets.changeStatus({ ticketId, toStatus: "RESOLVED" }),
      ]);
      const succeeded = [ra, rb].filter((r) => r.ok);
      const failed = [ra, rb].filter((r) => !r.ok);
      assert.equal(succeeded.length, 1, `expected exactly one winner, got ${JSON.stringify([ra, rb])}`);
      assert.equal(failed.length, 1);
      assert.equal(failed[0].reason, "INVALID_TRANSITION");

      const row = await admin.client.query("SELECT status FROM support_ticket WHERE id = $1", [ticketId]);
      assert.equal(row.rows[0].status, succeeded[0].to, "the final status must be exactly the winner's target, not the loser's");

      await Promise.all([A.client.end(), B.client.end()]);
    });

    test("simultaneous resolution attempts (both requesting RESOLVED) from the same source: exactly one succeeds, the other sees a real conflict, not a duplicate resolution", async () => {
      const playerId = id("cust");
      await seedPlayer(playerId);
      const ticketId = await openTicket(playerId);

      const A = await connection();
      const B = await connection();
      const [ra, rb] = await Promise.all([
        A.tickets.changeStatus({ ticketId, toStatus: "RESOLVED" }),
        B.tickets.changeStatus({ ticketId, toStatus: "RESOLVED" }),
      ]);
      const succeeded = [ra, rb].filter((r) => r.ok);
      assert.equal(succeeded.length, 1, `expected exactly one real resolution, got ${JSON.stringify([ra, rb])}`);

      const row = await admin.client.query("SELECT status, resolved_at FROM support_ticket WHERE id = $1", [ticketId]);
      assert.equal(row.rows[0].status, "RESOLVED");
      assert.ok(row.rows[0].resolved_at, "resolved_at must be set exactly once, by the single winner");

      await Promise.all([A.client.end(), B.client.end()]);
    });

    test("duplicate ticket creation for the SAME reference from two connections: exactly one ticket exists, the other is told about the existing one", async () => {
      const playerId = id("cust");
      await seedPlayer(playerId);
      const depositId = id("dep");
      await admin.client.query(
        `INSERT INTO deposit (id, player_id, asset, network, provider, address, status, expires_at)
         VALUES ($1,$2,'USDT','TRON','sandbox',$3,'AWAITING_PAYMENT',now()+interval '1 day')`,
        [depositId, playerId, `addr-${depositId}`]
      );

      const A = await connection();
      const B = await connection();
      const [ra, rb] = await Promise.all([
        A.tickets.createTicket({ playerId, category: "DEPOSIT_PENDING", subject: "Race A", referenceId: depositId }),
        B.tickets.createTicket({ playerId, category: "DEPOSIT_PENDING", subject: "Race B", referenceId: depositId }),
      ]);
      const succeeded = [ra, rb].filter((r) => r.ok);
      const failed = [ra, rb].filter((r) => !r.ok);
      assert.equal(succeeded.length, 1, `expected exactly one ticket created, got ${JSON.stringify([ra, rb])}`);
      assert.equal(failed.length, 1);
      assert.equal(failed[0].reason, "DUPLICATE_OPEN_TICKET");
      assert.equal(failed[0].existingTicketId, succeeded[0].ticketId, "the loser must be told the WINNER's real ticket id");

      const rows = await admin.client.query(
        "SELECT count(*)::int AS n FROM support_ticket WHERE player_id = $1 AND dedupe_key = $2", [playerId, `DEPOSIT_PENDING:DEPOSIT:${depositId}`]
      );
      assert.equal(rows.rows[0].n, 1, "exactly one ticket row for this reference must exist, never two");

      await Promise.all([A.client.end(), B.client.end()]);
    });

    test("duplicate ticket message submission (two concurrent customer messages) from two connections: both land as distinct, immutable messages", async () => {
      const playerId = id("cust");
      await seedPlayer(playerId);
      const ticketId = await openTicket(playerId);

      const A = await connection();
      const B = await connection();
      const [ra, rb] = await Promise.all([
        A.tickets.sendCustomerMessage({ ticketId, playerId, content: "message A" }),
        B.tickets.sendCustomerMessage({ ticketId, playerId, content: "message B" }),
      ]);
      assert.ok(ra.ok && rb.ok, "two genuinely distinct messages are both legitimate, not a race to prevent");
      assert.notEqual(ra.messageId, rb.messageId);

      const rows = await admin.client.query(
        "SELECT count(*)::int AS n FROM support_ticket_message WHERE ticket_id = $1 AND author_type = 'CUSTOMER'", [ticketId]
      );
      assert.equal(rows.rows[0].n, 2, "both real messages must be preserved -- append-only, nothing overwrites the other");

      await Promise.all([A.client.end(), B.client.end()]);
    });

    test("escalation race: two connections escalating the same in-progress ticket to DIFFERENT teams -- exactly one wins", async () => {
      const playerId = id("cust");
      await seedPlayer(playerId);
      const ticketId = await openTicket(playerId);
      await admin.tickets.changeStatus({ ticketId, toStatus: "TRIAGED" });
      await admin.tickets.changeStatus({ ticketId, toStatus: "ASSIGNED" });
      await admin.tickets.changeStatus({ ticketId, toStatus: "IN_PROGRESS" });

      const A = await connection();
      const B = await connection();
      const [ra, rb] = await Promise.all([
        A.tickets.escalateTicket({ ticketId, toTeam: "FINANCE" }),
        B.tickets.escalateTicket({ ticketId, toTeam: "RISK" }),
      ]);
      const succeeded = [ra, rb].filter((r) => r.ok);
      assert.equal(succeeded.length, 1, `expected exactly one escalation to win, got ${JSON.stringify([ra, rb])}`);

      const row = await admin.client.query("SELECT status, team FROM support_ticket WHERE id = $1", [ticketId]);
      assert.equal(row.rows[0].status, "ESCALATED");
      assert.equal(row.rows[0].team, succeeded[0].toTeam, "the final team must be exactly the winner's target team");

      await Promise.all([A.client.end(), B.client.end()]);
    });

    test("duplicate notification intent: two connections racing the SAME ticket-level notification send it exactly once", async () => {
      const playerId = id("cust");
      await seedPlayer(playerId);
      const ticketId = await openTicket(playerId);

      const provider = createMockEmailProvider();
      const emailService = createEmailService({ provider });
      const B = await connection();
      const notifyA = createTicketNotificationFlow(admin.db, { emailService });
      const notifyB = createTicketNotificationFlow(B.db, { emailService });

      const [ra, rb] = await Promise.all([
        notifyA.notify({ ticketId, notification: "TICKET_CREATED", email: "cust@example.com", locale: "en", subject: "Race test" }),
        notifyB.notify({ ticketId, notification: "TICKET_CREATED", email: "cust@example.com", locale: "en", subject: "Race test" }),
      ]);
      assert.ok(ra.ok && rb.ok);
      const actuallySent = [ra, rb].filter((r) => !r.alreadySent);
      assert.equal(actuallySent.length, 1, `expected exactly one real send, got ${JSON.stringify([ra, rb])}`);
      assert.equal(provider.sent.length, 1, "the email provider must have been called exactly once");

      const rows = await admin.client.query(
        "SELECT count(*)::int AS n FROM support_ticket_notification_sent WHERE ticket_id = $1 AND notification = 'TICKET_CREATED'", [ticketId]
      );
      assert.equal(rows.rows[0].n, 1);

      await B.client.end();
    });
  }
);
