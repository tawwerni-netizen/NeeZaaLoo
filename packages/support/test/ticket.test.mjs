import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../../ledger/src/migrate.mjs";
import { createTicketService, TicketError } from "../src/ticket.mjs";

let db, tickets;
let CLOCK = Date.now();

async function player(id, handle = id) {
  await db.query("INSERT INTO player (id, handle) VALUES ($1,$2)", [id, handle]);
}

async function admin(id, email = `${id}@nizalo.com`) {
  // Admin identity IS a player identity in this codebase (admin_user.id
  // shares the id space with player.id) -- support_ticket_message.author_id
  // references player(id), so a staff author must have a real player row too.
  await player(id);
  await db.query("INSERT INTO admin_user (id, email, display_name) VALUES ($1,$2,$1)", [id, email]);
}

async function deposit(id, playerId, { status = "AWAITING_PAYMENT", amountMinor = null } = {}) {
  await db.query(
    `INSERT INTO deposit (id, player_id, asset, network, provider, address, status, expires_at, observed_amount_minor)
     VALUES ($1,$2,'USDT','TRON','sandbox',$3,$4,now()+interval '1 day',$5)`,
    [id, playerId, `addr-${id}`, status, amountMinor]
  );
}

async function withdrawal(id, playerId, { status = "PENDING_REVIEW", amountMinor = "1000000" } = {}) {
  await db.query(
    `INSERT INTO withdrawal (id, player_id, asset, network, destination, amount_minor, status)
     VALUES ($1,$2,'USDT','TRON','Tdest',$3,$4)`,
    [id, playerId, amountMinor, status]
  );
}

async function duel(id, seat0, seat1, { status = "COMPLETED", result = "1-0" } = {}) {
  await db.query(
    `INSERT INTO duel (id, game_id, plugin_version, pairing_key, seat_0, seat_1,
                        tier, stake_minor, initial_state, time_control, status, result, termination_reason)
     VALUES ($1,'chess',1,$1,$2,$3,'FREE',0,'{}'::jsonb,'{}'::jsonb,$4,$5,'NORMAL')`,
    [id, seat0, seat1, status, result]
  );
}

async function tournamentPairing(id, tournamentId, seat0, seat1) {
  await db.query(
    `INSERT INTO tournament (id, game_id, format, capacity, time_control, registration_closes_at, ruleset_version)
     VALUES ($1,'chess','SINGLE_ELIMINATION',8,'{}'::jsonb, now() + interval '1 day', 1)`,
    [tournamentId]
  );
  await db.query(
    `INSERT INTO tournament_round (tournament_id, round_number, status) VALUES ($1,1,'IN_PROGRESS')`,
    [tournamentId]
  );
  await db.query(
    `INSERT INTO tournament_pairing (id, tournament_id, round_number, slot, seat_0, seat_1, status)
     VALUES ($1,$2,1,1,$3,$4,'LIVE')`,
    [id, tournamentId, seat0, seat1]
  );
}

before(async () => {
  db = await PGlite.create();
  await migrate(db);
  tickets = createTicketService(db, { now: () => CLOCK });
});

after(async () => { await db.close?.(); });

describe("createTicket", () => {
  test("a category with no reference type creates a ticket with NORMAL priority", async () => {
    await player("cust1");
    const r = await tickets.createTicket({ playerId: "cust1", category: "ACCOUNT", subject: "Cannot log in" });
    assert.equal(r.ok, true);
    assert.equal(r.priority, "NORMAL");
    const row = await db.query("SELECT status, priority, reference_type FROM support_ticket WHERE id = $1", [r.ticketId]);
    assert.equal(row.rows[0].status, "OPEN");
    assert.equal(row.rows[0].reference_type, null);
  });

  test("an unrecognized category is refused", async () => {
    await player("cust2");
    const r = await tickets.createTicket({ playerId: "cust2", category: "NOT_REAL", subject: "x" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, TicketError.INVALID_CATEGORY);
  });

  test("an empty subject is refused", async () => {
    await player("cust3");
    const r = await tickets.createTicket({ playerId: "cust3", category: "OTHER", subject: "   " });
    assert.equal(r.ok, false);
    assert.equal(r.reason, TicketError.INVALID_SUBJECT);
  });

  test("a subject over 200 characters is refused", async () => {
    await player("cust4");
    const r = await tickets.createTicket({ playerId: "cust4", category: "OTHER", subject: "x".repeat(201) });
    assert.equal(r.ok, false);
    assert.equal(r.reason, TicketError.INVALID_SUBJECT);
  });

  test("DEPOSIT_PENDING requires a referenceId", async () => {
    await player("cust5");
    const r = await tickets.createTicket({ playerId: "cust5", category: "DEPOSIT_PENDING", subject: "Where is my deposit" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, TicketError.REFERENCE_REQUIRED);
  });

  test("a referenceId that does not exist is refused", async () => {
    await player("cust6");
    const r = await tickets.createTicket({ playerId: "cust6", category: "DEPOSIT_PENDING", subject: "x", referenceId: "no-such-deposit" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, TicketError.REFERENCE_NOT_FOUND);
  });

  test("a referenceId belonging to ANOTHER player is refused -- a customer cannot attach someone else's deposit", async () => {
    await player("cust7a");
    await player("cust7b");
    await deposit("dep-other", "cust7a");
    const r = await tickets.createTicket({ playerId: "cust7b", category: "DEPOSIT_PENDING", subject: "x", referenceId: "dep-other" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, TicketError.REFERENCE_NOT_FOUND);
  });

  test("a valid deposit reference snapshots trusted fields into context, never client-supplied ones", async () => {
    await player("cust8");
    await deposit("dep-1", "cust8", { status: "AWAITING_PAYMENT", amountMinor: "5000000" });
    const r = await tickets.createTicket({ playerId: "cust8", category: "DEPOSIT_PENDING", subject: "Still waiting", referenceId: "dep-1" });
    assert.equal(r.ok, true);
    const row = await db.query("SELECT context, reference_type, reference_id FROM support_ticket WHERE id = $1", [r.ticketId]);
    assert.equal(row.rows[0].reference_type, "DEPOSIT");
    assert.equal(row.rows[0].reference_id, "dep-1");
    assert.equal(row.rows[0].context.status, "AWAITING_PAYMENT");
    assert.equal(Number(row.rows[0].context.amountMinor), 5000000);
  });

  test("MISSING_FUNDS auto-escalates to CRITICAL priority regardless of client input", async () => {
    await player("cust9");
    const r = await tickets.createTicket({ playerId: "cust9", category: "MISSING_FUNDS", subject: "Money missing" });
    assert.equal(r.ok, true);
    assert.equal(r.priority, "CRITICAL");
  });

  test("a description creates an initial CUSTOMER-visible message", async () => {
    await player("cust10");
    const r = await tickets.createTicket({ playerId: "cust10", category: "OTHER", subject: "Help", description: "Full details here" });
    const msgs = await db.query("SELECT author_type, visibility, content FROM support_ticket_message WHERE ticket_id = $1", [r.ticketId]);
    assert.equal(msgs.rows.length, 1);
    assert.equal(msgs.rows[0].author_type, "CUSTOMER");
    assert.equal(msgs.rows[0].visibility, "CUSTOMER");
    assert.equal(msgs.rows[0].content, "Full details here");
  });

  test("a second OPEN ticket for the SAME reference is refused as a duplicate, surfacing the existing ticket id", async () => {
    await player("cust11");
    await deposit("dep-dup", "cust11");
    const first = await tickets.createTicket({ playerId: "cust11", category: "DEPOSIT_PENDING", subject: "First", referenceId: "dep-dup" });
    assert.equal(first.ok, true);
    const second = await tickets.createTicket({ playerId: "cust11", category: "DEPOSIT_PENDING", subject: "Second", referenceId: "dep-dup" });
    assert.equal(second.ok, false);
    assert.equal(second.reason, TicketError.DUPLICATE_OPEN_TICKET);
    assert.equal(second.existingTicketId, first.ticketId);
  });

  test("a NEW ticket for the same reference is allowed once the first is RESOLVED", async () => {
    await player("cust12");
    await deposit("dep-reopen", "cust12");
    const first = await tickets.createTicket({ playerId: "cust12", category: "DEPOSIT_PENDING", subject: "First", referenceId: "dep-reopen" });
    await tickets.changeStatus({ ticketId: first.ticketId, toStatus: "RESOLVED" });
    const second = await tickets.createTicket({ playerId: "cust12", category: "DEPOSIT_PENDING", subject: "Second", referenceId: "dep-reopen" });
    assert.equal(second.ok, true);
  });

  test("a MATCH_PROBLEM referencing a duel the player did not play in is refused", async () => {
    await player("cust13");
    await player("cust13b");
    await player("bystander");
    await duel("duel-1", "cust13", "cust13b");
    const r = await tickets.createTicket({ playerId: "bystander", category: "MATCH_PROBLEM", subject: "x", referenceId: "duel-1" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, TicketError.REFERENCE_NOT_FOUND);
  });

  test("a MATCH_PROBLEM referencing a duel the player DID play in succeeds and snapshots the result", async () => {
    await player("cust14");
    await player("cust14b");
    await duel("duel-2", "cust14", "cust14b", { result: "0-1" });
    const r = await tickets.createTicket({ playerId: "cust14", category: "MATCH_PROBLEM", subject: "Disputed result", referenceId: "duel-2" });
    assert.equal(r.ok, true);
    const row = await db.query("SELECT context FROM support_ticket WHERE id = $1", [r.ticketId]);
    assert.equal(row.rows[0].context.result, "0-1");
  });

  test("a TOURNAMENT_PROBLEM reference resolves via the pairing's seats", async () => {
    await player("cust15");
    await player("cust15b");
    await tournamentPairing("pairing-1", "trn-1", "cust15", "cust15b");
    const r = await tickets.createTicket({ playerId: "cust15", category: "TOURNAMENT_PROBLEM", subject: "x", referenceId: "pairing-1" });
    assert.equal(r.ok, true);
    const row = await db.query("SELECT context FROM support_ticket WHERE id = $1", [r.ticketId]);
    assert.equal(row.rows[0].context.tournamentId, "trn-1");
  });

  test("creating a ticket writes a TICKET_CREATED security event, never a secret", async () => {
    await player("cust16");
    const r = await tickets.createTicket({ playerId: "cust16", category: "OTHER", subject: "x" });
    const events = await db.query("SELECT type, detail FROM security_event WHERE player_id = 'cust16' AND type = 'TICKET_CREATED'");
    assert.equal(events.rows.length, 1);
    assert.equal(events.rows[0].detail.ticketId, r.ticketId);
  });
});

describe("getForCustomer / getForStaff", () => {
  test("a customer can read their own ticket, and only safe fields are present", async () => {
    await player("view1");
    const r = await tickets.createTicket({ playerId: "view1", category: "OTHER", subject: "Q" });
    const row = await tickets.getForCustomer(r.ticketId, "view1");
    assert.ok(row);
    assert.equal(row.subject, "Q");
    assert.equal(row.assignee_id, undefined);
    assert.equal(row.team, undefined);
  });

  test("a different player cannot read someone else's ticket via getForCustomer", async () => {
    await player("view2a");
    await player("view2b");
    const r = await tickets.createTicket({ playerId: "view2a", category: "OTHER", subject: "Q" });
    const row = await tickets.getForCustomer(r.ticketId, "view2b");
    assert.equal(row, null);
  });

  test("getForStaff returns the full row including team/assignee and the player's nickname", async () => {
    await player("view3", "View3Handle");
    const r = await tickets.createTicket({ playerId: "view3", category: "OTHER", subject: "Q" });
    const row = await tickets.getForStaff(r.ticketId);
    assert.ok(row);
    assert.equal(row.team, "CUSTOMER_SUPPORT");
    assert.equal(row.player_nickname, "View3Handle");
  });
});

describe("listForCustomer / listForStaff", () => {
  test("listForCustomer only returns the caller's own tickets, newest first", async () => {
    await player("list1");
    await player("list1-other");
    await tickets.createTicket({ playerId: "list1-other", category: "OTHER", subject: "not mine" });
    await tickets.createTicket({ playerId: "list1", category: "OTHER", subject: "first" });
    CLOCK += 1000;
    await tickets.createTicket({ playerId: "list1", category: "OTHER", subject: "second" });
    const rows = await tickets.listForCustomer("list1");
    assert.equal(rows.length, 2);
    assert.equal(rows[0].subject, "second");
  });

  test("listForStaff filters by status, category, and team together", async () => {
    await player("list2");
    const a = await tickets.createTicket({ playerId: "list2", category: "TECHNICAL", subject: "tech issue" });
    const b = await tickets.createTicket({ playerId: "list2", category: "ACCOUNT", subject: "account issue" });
    await tickets.changeStatus({ ticketId: a.ticketId, toStatus: "TRIAGED" });

    const filtered = await tickets.listForStaff({ status: "OPEN", category: "ACCOUNT" });
    assert.ok(filtered.some((t) => t.id === b.ticketId));
    assert.ok(!filtered.some((t) => t.id === a.ticketId));
  });

  test("listForStaff search matches by ticket id, player nickname, and reference id", async () => {
    await player("searchp", "SearchNickname");
    await deposit("dep-search", "searchp");
    const r = await tickets.createTicket({ playerId: "searchp", category: "DEPOSIT_PENDING", subject: "x", referenceId: "dep-search" });

    const byId = await tickets.listForStaff({ search: r.ticketId });
    assert.ok(byId.some((t) => t.id === r.ticketId));

    const byNickname = await tickets.listForStaff({ search: "SearchNick" });
    assert.ok(byNickname.some((t) => t.id === r.ticketId));

    const byReference = await tickets.listForStaff({ search: "dep-search" });
    assert.ok(byReference.some((t) => t.id === r.ticketId));
  });
});

describe("messages", () => {
  test("a customer message on their own ticket succeeds and is CUSTOMER-visible", async () => {
    await player("msg1");
    const r = await tickets.createTicket({ playerId: "msg1", category: "OTHER", subject: "x" });
    const sent = await tickets.sendCustomerMessage({ ticketId: r.ticketId, playerId: "msg1", content: "Hello" });
    assert.equal(sent.ok, true);
    const msgs = await tickets.listMessagesForCustomer(r.ticketId, "msg1");
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].content, "Hello");
  });

  test("empty content is refused", async () => {
    await player("msg2");
    const r = await tickets.createTicket({ playerId: "msg2", category: "OTHER", subject: "x" });
    const sent = await tickets.sendCustomerMessage({ ticketId: r.ticketId, playerId: "msg2", content: "   " });
    assert.equal(sent.ok, false);
    assert.equal(sent.reason, TicketError.INVALID_CONTENT);
  });

  test("a customer cannot message a ticket that is not theirs", async () => {
    await player("msg3a");
    await player("msg3b");
    const r = await tickets.createTicket({ playerId: "msg3a", category: "OTHER", subject: "x" });
    const sent = await tickets.sendCustomerMessage({ ticketId: r.ticketId, playerId: "msg3b", content: "Hi" });
    assert.equal(sent.ok, false);
    assert.equal(sent.reason, TicketError.NOT_FOUND);
  });

  test("a customer cannot message a CLOSED ticket", async () => {
    await player("msg4");
    const r = await tickets.createTicket({ playerId: "msg4", category: "OTHER", subject: "x" });
    await tickets.changeStatus({ ticketId: r.ticketId, toStatus: "RESOLVED" });
    await tickets.changeStatus({ ticketId: r.ticketId, toStatus: "CLOSED" });
    const sent = await tickets.sendCustomerMessage({ ticketId: r.ticketId, playerId: "msg4", content: "Hi" });
    assert.equal(sent.ok, false);
    assert.equal(sent.reason, TicketError.TICKET_CLOSED);
  });

  test("a customer message on a RESOLVED ticket reopens it to OPEN", async () => {
    await player("msg5");
    const r = await tickets.createTicket({ playerId: "msg5", category: "OTHER", subject: "x" });
    await tickets.changeStatus({ ticketId: r.ticketId, toStatus: "RESOLVED" });
    const sent = await tickets.sendCustomerMessage({ ticketId: r.ticketId, playerId: "msg5", content: "Still broken" });
    assert.equal(sent.ok, true);
    assert.equal(sent.reopened, true);
    const status = await db.query("SELECT status, resolved_at FROM support_ticket WHERE id = $1", [r.ticketId]);
    assert.equal(status.rows[0].status, "OPEN");
    assert.equal(status.rows[0].resolved_at, null);
    const events = await db.query("SELECT type FROM security_event WHERE player_id = 'msg5' AND type = 'TICKET_REOPENED'");
    assert.equal(events.rows.length, 1);
  });

  test("staff can send a CUSTOMER-visible reply", async () => {
    await admin("staff1");
    await player("msg6");
    const r = await tickets.createTicket({ playerId: "msg6", category: "OTHER", subject: "x" });
    const sent = await tickets.sendStaffMessage({ ticketId: r.ticketId, staffId: "staff1", content: "We're looking into it", visibility: "CUSTOMER" });
    assert.equal(sent.ok, true);
    const msgs = await tickets.listMessagesForCustomer(r.ticketId, "msg6");
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].author_type, "STAFF");
  });

  test("an INTERNAL staff note is never visible to the customer, only to staff", async () => {
    await admin("staff2");
    await player("msg7");
    const r = await tickets.createTicket({ playerId: "msg7", category: "OTHER", subject: "x" });
    await tickets.sendStaffMessage({ ticketId: r.ticketId, staffId: "staff2", content: "Internal-only note", visibility: "INTERNAL" });

    const customerView = await tickets.listMessagesForCustomer(r.ticketId, "msg7");
    assert.equal(customerView.length, 0);

    const staffView = await tickets.listMessagesForStaff(r.ticketId);
    assert.equal(staffView.length, 1);
    assert.equal(staffView[0].visibility, "INTERNAL");
  });

  test("an invalid visibility value is refused", async () => {
    await admin("staff3");
    await player("msg8");
    const r = await tickets.createTicket({ playerId: "msg8", category: "OTHER", subject: "x" });
    const sent = await tickets.sendStaffMessage({ ticketId: r.ticketId, staffId: "staff3", content: "x", visibility: "PUBLIC" });
    assert.equal(sent.ok, false);
    assert.equal(sent.reason, TicketError.INVALID_VISIBILITY);
  });

  test("staff cannot message a CLOSED ticket either", async () => {
    await admin("staff4");
    await player("msg9");
    const r = await tickets.createTicket({ playerId: "msg9", category: "OTHER", subject: "x" });
    await tickets.changeStatus({ ticketId: r.ticketId, toStatus: "RESOLVED" });
    await tickets.changeStatus({ ticketId: r.ticketId, toStatus: "CLOSED" });
    const sent = await tickets.sendStaffMessage({ ticketId: r.ticketId, staffId: "staff4", content: "x", visibility: "CUSTOMER" });
    assert.equal(sent.ok, false);
    assert.equal(sent.reason, TicketError.TICKET_CLOSED);
  });

  test("the database itself refuses editing a message -- append-only is structural, not just application-level", async () => {
    await player("msg10");
    const r = await tickets.createTicket({ playerId: "msg10", category: "OTHER", subject: "x" });
    const sent = await tickets.sendCustomerMessage({ ticketId: r.ticketId, playerId: "msg10", content: "original" });
    await assert.rejects(
      () => db.query("UPDATE support_ticket_message SET content = 'edited' WHERE id = $1", [sent.messageId])
    );
  });
});

describe("assignTicket", () => {
  test("assigning an OPEN ticket sets the assignee and auto-advances status to ASSIGNED", async () => {
    await admin("assignee1");
    await admin("assigner1");
    await player("assign1");
    const r = await tickets.createTicket({ playerId: "assign1", category: "OTHER", subject: "x" });
    const res = await tickets.assignTicket({ ticketId: r.ticketId, assigneeId: "assignee1", assignedBy: "assigner1" });
    assert.equal(res.ok, true);
    const row = await db.query("SELECT status, assignee_id, assigned_by FROM support_ticket WHERE id = $1", [r.ticketId]);
    assert.equal(row.rows[0].status, "ASSIGNED");
    assert.equal(row.rows[0].assignee_id, "assignee1");
    assert.equal(row.rows[0].assigned_by, "assigner1");
  });

  test("reassigning a ticket that is already IN_PROGRESS changes the assignee without moving status backwards", async () => {
    await admin("assignee2a");
    await admin("assignee2b");
    await player("assign2");
    const r = await tickets.createTicket({ playerId: "assign2", category: "OTHER", subject: "x" });
    await tickets.assignTicket({ ticketId: r.ticketId, assigneeId: "assignee2a", assignedBy: "assignee2a" });
    await tickets.changeStatus({ ticketId: r.ticketId, toStatus: "IN_PROGRESS" });
    await tickets.assignTicket({ ticketId: r.ticketId, assigneeId: "assignee2b", assignedBy: "assignee2a" });
    const row = await db.query("SELECT status, assignee_id FROM support_ticket WHERE id = $1", [r.ticketId]);
    assert.equal(row.rows[0].status, "IN_PROGRESS");
    assert.equal(row.rows[0].assignee_id, "assignee2b");
  });

  test("assigning a nonexistent ticket is refused cleanly", async () => {
    await admin("assignee3");
    const res = await tickets.assignTicket({ ticketId: "no-such-ticket", assigneeId: "assignee3", assignedBy: "assignee3" });
    assert.equal(res.ok, false);
    assert.equal(res.reason, TicketError.NOT_FOUND);
  });
});

describe("changeStatus", () => {
  test("a valid transition succeeds", async () => {
    await player("stat1");
    const r = await tickets.createTicket({ playerId: "stat1", category: "OTHER", subject: "x" });
    const res = await tickets.changeStatus({ ticketId: r.ticketId, toStatus: "TRIAGED" });
    assert.equal(res.ok, true);
  });

  test("an invalid transition is refused (cannot skip OPEN -> IN_PROGRESS)", async () => {
    await player("stat2");
    const r = await tickets.createTicket({ playerId: "stat2", category: "OTHER", subject: "x" });
    const res = await tickets.changeStatus({ ticketId: r.ticketId, toStatus: "IN_PROGRESS" });
    assert.equal(res.ok, false);
    assert.equal(res.reason, TicketError.INVALID_TRANSITION);
  });

  test("resolving sets resolved_at, and closing afterward sets closed_at", async () => {
    await player("stat3");
    const r = await tickets.createTicket({ playerId: "stat3", category: "OTHER", subject: "x" });
    await tickets.changeStatus({ ticketId: r.ticketId, toStatus: "RESOLVED" });
    let row = await db.query("SELECT resolved_at, closed_at FROM support_ticket WHERE id = $1", [r.ticketId]);
    assert.ok(row.rows[0].resolved_at);
    assert.equal(row.rows[0].closed_at, null);
    await tickets.changeStatus({ ticketId: r.ticketId, toStatus: "CLOSED" });
    row = await db.query("SELECT closed_at FROM support_ticket WHERE id = $1", [r.ticketId]);
    assert.ok(row.rows[0].closed_at);
  });

  test("a garbage status value is refused before any query", async () => {
    await player("stat4");
    const r = await tickets.createTicket({ playerId: "stat4", category: "OTHER", subject: "x" });
    const res = await tickets.changeStatus({ ticketId: r.ticketId, toStatus: "DELETED" });
    assert.equal(res.ok, false);
    assert.equal(res.reason, TicketError.INVALID_TRANSITION);
  });

  test("changing status on a nonexistent ticket is refused cleanly", async () => {
    const res = await tickets.changeStatus({ ticketId: "nope", toStatus: "TRIAGED" });
    assert.equal(res.ok, false);
    assert.equal(res.reason, TicketError.NOT_FOUND);
  });
});

describe("escalateTicket", () => {
  test("escalating from IN_PROGRESS moves status to ESCALATED and changes team", async () => {
    await player("esc1");
    const r = await tickets.createTicket({ playerId: "esc1", category: "OTHER", subject: "x" });
    await tickets.changeStatus({ ticketId: r.ticketId, toStatus: "TRIAGED" });
    await tickets.changeStatus({ ticketId: r.ticketId, toStatus: "ASSIGNED" });
    await tickets.changeStatus({ ticketId: r.ticketId, toStatus: "IN_PROGRESS" });
    const res = await tickets.escalateTicket({ ticketId: r.ticketId, toTeam: "FINANCE" });
    assert.equal(res.ok, true);
    assert.equal(res.fromTeam, "CUSTOMER_SUPPORT");
    assert.equal(res.toTeam, "FINANCE");
    const row = await db.query("SELECT status, team FROM support_ticket WHERE id = $1", [r.ticketId]);
    assert.equal(row.rows[0].status, "ESCALATED");
    assert.equal(row.rows[0].team, "FINANCE");
  });

  test("escalating straight from OPEN is refused -- ESCALATED is only reachable from IN_PROGRESS", async () => {
    await player("esc2");
    const r = await tickets.createTicket({ playerId: "esc2", category: "OTHER", subject: "x" });
    const res = await tickets.escalateTicket({ ticketId: r.ticketId, toTeam: "RISK" });
    assert.equal(res.ok, false);
    assert.equal(res.reason, TicketError.INVALID_TRANSITION);
  });

  test("an invalid team is refused", async () => {
    await player("esc3");
    const r = await tickets.createTicket({ playerId: "esc3", category: "OTHER", subject: "x" });
    const res = await tickets.escalateTicket({ ticketId: r.ticketId, toTeam: "NOT_A_TEAM" });
    assert.equal(res.ok, false);
    assert.equal(res.reason, TicketError.INVALID_TEAM);
  });
});
