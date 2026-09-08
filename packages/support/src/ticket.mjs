/**
 * The ticket domain service. Three ideas run through every function here:
 *
 *   1. A reference (deposit/withdrawal/duel/tournament pairing) is
 *      resolved from the REAL row at creation time -- the customer only
 *      ever supplies an id, never an amount/status/asset the platform
 *      already knows (directive #3), and `context` stores a small,
 *      trusted SNAPSHOT of that row, never a copy of the whole object
 *      (directive #5).
 *   2. Every status/team change goes through an atomic compare-and-swap
 *      (`UPDATE ... WHERE status = $expected`), the same idiom this
 *      codebase has used since Slice 4's email-challenge fix, so a
 *      genuine race between two staff members changing the SAME ticket
 *      cannot silently apply a transition against a status that already
 *      moved.
 *   3. Staff-authored audit (assignment, status, escalation) is written
 *      by the API layer's EXISTING admin_audit middleware, not here --
 *      this service only writes security_event for CUSTOMER-initiated
 *      actions, exactly like every other player-facing service in this
 *      codebase.
 */
import { randomUUID } from "node:crypto";
import { writeSecurityEvent } from "../../auth/src/audit.mjs";
import { isValidCategory, configFor, defaultPriorityFor } from "./categories.mjs";
import { canTransition, canReopen, isValidStatus } from "./state-machine.mjs";

export const TICKET_TEAMS = Object.freeze(["CUSTOMER_SUPPORT", "FINANCE", "TECHNICAL", "RISK", "MODERATION", "TOURNAMENTS"]);
export const TICKET_PRIORITIES = Object.freeze(["LOW", "NORMAL", "HIGH", "CRITICAL"]);

export const TicketError = Object.freeze({
  INVALID_CATEGORY: "INVALID_CATEGORY",
  INVALID_SUBJECT: "INVALID_SUBJECT",
  INVALID_CONTENT: "INVALID_CONTENT",
  INVALID_VISIBILITY: "INVALID_VISIBILITY",
  INVALID_TEAM: "INVALID_TEAM",
  REFERENCE_REQUIRED: "REFERENCE_REQUIRED",
  REFERENCE_NOT_FOUND: "REFERENCE_NOT_FOUND",
  DUPLICATE_OPEN_TICKET: "DUPLICATE_OPEN_TICKET",
  NOT_FOUND: "NOT_FOUND",
  TICKET_CLOSED: "TICKET_CLOSED",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  CANNOT_REOPEN: "CANNOT_REOPEN",
});

const SUBJECT_MAX = 200;
const CONTENT_MAX = 4000;

export function createTicketService(db, { now = () => Date.now() } = {}) {
  /** Pulls a small, trusted snapshot from the REAL row -- never trusts
   * anything the client claims about amount/status/asset, and refuses if
   * the reference does not belong to this player. */
  async function resolveReference(tx, referenceType, referenceId, playerId) {
    if (referenceType === "DEPOSIT") {
      const r = await tx.query(
        "SELECT id, player_id, asset, network, status, observed_amount_minor, provider_ref FROM deposit WHERE id = $1",
        [referenceId]
      );
      if (!r.rows.length || r.rows[0].player_id !== playerId) return null;
      const row = r.rows[0];
      return { depositId: row.id, asset: row.asset, network: row.network, status: row.status, amountMinor: row.observed_amount_minor, providerRef: row.provider_ref };
    }
    if (referenceType === "WITHDRAWAL") {
      const r = await tx.query(
        "SELECT id, player_id, asset, network, status, amount_minor, provider_ref FROM withdrawal WHERE id = $1",
        [referenceId]
      );
      if (!r.rows.length || r.rows[0].player_id !== playerId) return null;
      const row = r.rows[0];
      return { withdrawalId: row.id, asset: row.asset, network: row.network, status: row.status, amountMinor: row.amount_minor, providerRef: row.provider_ref };
    }
    if (referenceType === "DUEL") {
      const r = await tx.query(
        "SELECT id, game_id, seat_0, seat_1, status, result, created_at, completed_at FROM duel WHERE id = $1",
        [referenceId]
      );
      if (!r.rows.length) return null;
      const row = r.rows[0];
      if (row.seat_0 !== playerId && row.seat_1 !== playerId) return null;
      return { duelId: row.id, gameId: row.game_id, status: row.status, result: row.result, createdAt: row.created_at, completedAt: row.completed_at };
    }
    if (referenceType === "TOURNAMENT_PAIRING") {
      const r = await tx.query(
        "SELECT id, tournament_id, round_number, seat_0, seat_1, duel_id, status FROM tournament_pairing WHERE id = $1",
        [referenceId]
      );
      if (!r.rows.length) return null;
      const row = r.rows[0];
      if (row.seat_0 !== playerId && row.seat_1 !== playerId) return null;
      return { pairingId: row.id, tournamentId: row.tournament_id, round: row.round_number, duelId: row.duel_id, status: row.status };
    }
    return null;
  }

  async function createTicket({ playerId, category, subject, description, referenceId }, ctx = {}) {
    if (!isValidCategory(category)) return { ok: false, reason: TicketError.INVALID_CATEGORY };
    const trimmedSubject = typeof subject === "string" ? subject.trim() : "";
    if (!trimmedSubject || trimmedSubject.length > SUBJECT_MAX) return { ok: false, reason: TicketError.INVALID_SUBJECT };

    const config = configFor(category);
    const referenceType = config.referenceType;

    // Reference resolution is a plain read, deliberately done OUTSIDE the
    // write transaction below: a dedupe-key collision aborts a Postgres
    // transaction outright (nothing further can run on it until rollback),
    // so the recovery lookup that reports "you already have an open ticket"
    // must run as a fresh statement after that abort, not inside it.
    let context = {};
    let dedupeKey = null;
    if (referenceType) {
      if (!referenceId) return { ok: false, reason: TicketError.REFERENCE_REQUIRED };
      const resolved = await resolveReference(db, referenceType, referenceId, playerId);
      if (!resolved) return { ok: false, reason: TicketError.REFERENCE_NOT_FOUND };
      context = resolved;
      dedupeKey = `${category}:${referenceType}:${referenceId}`;
    }

    const id = `spt_${randomUUID()}`;
    const priority = defaultPriorityFor(category);
    const t = new Date(now()).toISOString();
    const trimmedDescription = typeof description === "string" ? description.trim() : "";

    try {
      return await db.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO support_ticket
             (id, player_id, category, priority, subject, reference_type, reference_id, context, dedupe_key, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$10)`,
          [id, playerId, category, priority, trimmedSubject, referenceType, referenceId ?? null, JSON.stringify(context), dedupeKey, t]
        );

        if (trimmedDescription) {
          await tx.query(
            `INSERT INTO support_ticket_message (id, ticket_id, author_id, author_type, visibility, content, created_at)
             VALUES ($1,$2,$3,'CUSTOMER','CUSTOMER',$4,$5)`,
            [`spm_${randomUUID()}`, id, playerId, trimmedDescription.slice(0, CONTENT_MAX), t]
          );
        }

        await writeSecurityEvent(tx, playerId, "TICKET_CREATED", { ticketId: id, category }, ctx);
        return { ok: true, ticketId: id, priority };
      });
    } catch (e) {
      if (/support_ticket_open_dedupe_idx/.test(e.message)) {
        const existing = await db.query(
          `SELECT id FROM support_ticket WHERE player_id = $1 AND dedupe_key = $2 AND status NOT IN ('RESOLVED','CLOSED')`,
          [playerId, dedupeKey]
        );
        return { ok: false, reason: TicketError.DUPLICATE_OPEN_TICKET, existingTicketId: existing.rows[0]?.id ?? null };
      }
      throw e;
    }
  }

  /** Customer-visible shape only -- no assignee, no team, no internal
   * notes; directive #6's separation starts at the query itself, not a
   * filter applied after the fact. */
  async function getForCustomer(ticketId, playerId) {
    const r = await db.query(
      `SELECT id, category, status, priority, subject, reference_type, reference_id, context, created_at, updated_at, resolved_at, closed_at
         FROM support_ticket WHERE id = $1 AND player_id = $2`,
      [ticketId, playerId]
    );
    return r.rows[0] ?? null;
  }

  /** Full shape, for an already-authorized (TICKET_VIEW) staff caller. */
  async function getForStaff(ticketId) {
    const r = await db.query(
      `SELECT t.*, p.handle AS player_nickname
         FROM support_ticket t JOIN player p ON p.id = t.player_id
        WHERE t.id = $1`,
      [ticketId]
    );
    return r.rows[0] ?? null;
  }

  async function listForCustomer(playerId, { limit = 20, offset = 0 } = {}) {
    const r = await db.query(
      `SELECT id, category, status, priority, subject, created_at, updated_at
         FROM support_ticket WHERE player_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [playerId, Math.min(limit, 100), offset]
    );
    return r.rows;
  }

  /** The staff queue -- filterable and searchable (directives #18/#19),
   * paginated, never an unrestricted data-access mechanism: this reads
   * only ticket/player-handle columns, never wallet/KYC/session data. */
  async function listForStaff({ status, priority, category, team, assigneeId, search, limit = 50, offset = 0 } = {}) {
    const clauses = [];
    const params = [];
    const add = (clause, value) => { params.push(value); clauses.push(clause.replace("?", `$${params.length}`)); };

    if (status) add("t.status = ?", status);
    if (priority) add("t.priority = ?", priority);
    if (category) add("t.category = ?", category);
    if (team) add("t.team = ?", team);
    if (assigneeId) add("t.assignee_id = ?", assigneeId);
    if (typeof search === "string" && search.trim()) {
      const term = search.trim();
      params.push(term, `%${term}%`, term);
      clauses.push(`(t.id = $${params.length - 2} OR p.handle ILIKE $${params.length - 1} OR t.reference_id = $${params.length})`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    params.push(Math.min(limit, 200), offset);

    const r = await db.query(
      `SELECT t.id, t.category, t.status, t.priority, t.team, t.assignee_id, t.subject, t.created_at, t.updated_at,
              p.handle AS player_nickname
         FROM support_ticket t JOIN player p ON p.id = t.player_id
        ${where}
        ORDER BY t.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return r.rows;
  }

  async function listMessagesForCustomer(ticketId, playerId) {
    const owns = await db.query("SELECT 1 FROM support_ticket WHERE id = $1 AND player_id = $2", [ticketId, playerId]);
    if (!owns.rows.length) return null;
    const r = await db.query(
      `SELECT id, author_type, content, created_at FROM support_ticket_message
        WHERE ticket_id = $1 AND visibility = 'CUSTOMER' ORDER BY created_at`,
      [ticketId]
    );
    return r.rows;
  }

  async function listMessagesForStaff(ticketId) {
    const r = await db.query(
      `SELECT id, author_id, author_type, visibility, content, created_at FROM support_ticket_message
        WHERE ticket_id = $1 ORDER BY created_at`,
      [ticketId]
    );
    return r.rows;
  }

  async function sendCustomerMessage({ ticketId, playerId, content }, ctx = {}) {
    const trimmed = typeof content === "string" ? content.trim() : "";
    if (!trimmed || trimmed.length > CONTENT_MAX) return { ok: false, reason: TicketError.INVALID_CONTENT };

    return db.transaction(async (tx) => {
      const ticket = await tx.query("SELECT status FROM support_ticket WHERE id = $1 AND player_id = $2", [ticketId, playerId]);
      if (!ticket.rows.length) return { ok: false, reason: TicketError.NOT_FOUND };
      const status = ticket.rows[0].status;
      if (status === "CLOSED") return { ok: false, reason: TicketError.TICKET_CLOSED };

      const id = `spm_${randomUUID()}`;
      const t = new Date(now()).toISOString();
      await tx.query(
        `INSERT INTO support_ticket_message (id, ticket_id, author_id, author_type, visibility, content, created_at)
         VALUES ($1,$2,$3,'CUSTOMER','CUSTOMER',$4,$5)`,
        [id, ticketId, playerId, trimmed, t]
      );

      let reopened = false;
      if (canReopen(status)) {
        const r = await tx.query(
          `UPDATE support_ticket SET status = 'OPEN', resolved_at = NULL, updated_at = $2 WHERE id = $1 AND status = $3 RETURNING id`,
          [ticketId, t, status]
        );
        reopened = r.rows.length > 0;
        if (reopened) await writeSecurityEvent(tx, playerId, "TICKET_REOPENED", { ticketId }, ctx);
      } else {
        await tx.query("UPDATE support_ticket SET updated_at = $2 WHERE id = $1", [ticketId, t]);
      }

      await writeSecurityEvent(tx, playerId, "TICKET_MESSAGE_SENT", { ticketId, messageId: id }, ctx);
      return { ok: true, messageId: id, reopened };
    });
  }

  /** `visibility: 'CUSTOMER'` is a reply the customer will see;
   * `'INTERNAL'` is a note that never leaves the staff view -- enforced
   * doubly, by this check AND by support_ticket_message_customer_never_
   * internal at the schema level for the (structurally impossible)
   * reverse case. */
  async function sendStaffMessage({ ticketId, staffId, content, visibility }, ctx = {}) {
    if (!["CUSTOMER", "INTERNAL"].includes(visibility)) return { ok: false, reason: TicketError.INVALID_VISIBILITY };
    const trimmed = typeof content === "string" ? content.trim() : "";
    if (!trimmed || trimmed.length > CONTENT_MAX) return { ok: false, reason: TicketError.INVALID_CONTENT };

    const ticket = await db.query("SELECT status FROM support_ticket WHERE id = $1", [ticketId]);
    if (!ticket.rows.length) return { ok: false, reason: TicketError.NOT_FOUND };
    if (ticket.rows[0].status === "CLOSED") return { ok: false, reason: TicketError.TICKET_CLOSED };

    const id = `spm_${randomUUID()}`;
    const t = new Date(now()).toISOString();
    await db.query(
      `INSERT INTO support_ticket_message (id, ticket_id, author_id, author_type, visibility, content, created_at)
       VALUES ($1,$2,$3,'STAFF',$4,$5,$6)`,
      [id, ticketId, staffId, visibility, trimmed, t]
    );
    await db.query("UPDATE support_ticket SET updated_at = $2 WHERE id = $1", [ticketId, t]);
    return { ok: true, messageId: id };
  }

  /** Setting WHO owns a ticket is a plain last-write-wins field (two
   * staff racing to claim it deterministically end with exactly one
   * final assignee -- ordinary Postgres row-level atomicity already
   * guarantees that, no CAS needed). The status auto-advance that comes
   * WITH a fresh assignment, however, DOES need one: it must never
   * clobber a status a concurrent transition already moved past
   * OPEN/TRIAGED. */
  async function assignTicket({ ticketId, assigneeId, assignedBy }, ctx = {}) {
    return db.transaction(async (tx) => {
      const t = new Date(now()).toISOString();
      const updated = await tx.query(
        `UPDATE support_ticket SET assignee_id = $2, assigned_by = $3, assigned_at = $4, updated_at = $4
          WHERE id = $1 RETURNING status`,
        [ticketId, assigneeId, assignedBy, t]
      );
      if (!updated.rows.length) return { ok: false, reason: TicketError.NOT_FOUND };

      const status = updated.rows[0].status;
      if (status === "OPEN" || status === "TRIAGED") {
        await tx.query(
          `UPDATE support_ticket SET status = 'ASSIGNED', updated_at = $2 WHERE id = $1 AND status = $3`,
          [ticketId, t, status]
        );
      }
      return { ok: true };
    });
  }

  /** The one place a status actually changes, via an atomic
   * compare-and-swap against the status the caller observed -- see this
   * file's own header. */
  async function changeStatus({ ticketId, toStatus }, ctx = {}) {
    if (!isValidStatus(toStatus)) return { ok: false, reason: TicketError.INVALID_TRANSITION };
    return db.transaction(async (tx) => {
      const current = await tx.query("SELECT status FROM support_ticket WHERE id = $1", [ticketId]);
      if (!current.rows.length) return { ok: false, reason: TicketError.NOT_FOUND };
      const fromStatus = current.rows[0].status;
      if (!canTransition(fromStatus, toStatus)) return { ok: false, reason: TicketError.INVALID_TRANSITION, from: fromStatus };

      const t = new Date(now()).toISOString();
      const updated = await tx.query(
        `UPDATE support_ticket
            SET status = $2::support_ticket_status,
                updated_at = $3,
                resolved_at = CASE WHEN $2::text = 'RESOLVED' THEN $3::timestamptz WHEN $2::text = 'OPEN' THEN NULL ELSE resolved_at END,
                closed_at = CASE WHEN $2::text = 'CLOSED' THEN $3::timestamptz ELSE closed_at END
          WHERE id = $1 AND status = $4::support_ticket_status
          RETURNING status`,
        [ticketId, toStatus, t, fromStatus]
      );
      if (!updated.rows.length) {
        // Someone else changed the status in the window between our
        // SELECT and this UPDATE -- the same race email-challenge.mjs's
        // verify() already guards against, here applied to ticket status.
        return { ok: false, reason: TicketError.INVALID_TRANSITION, from: fromStatus };
      }
      return { ok: true, from: fromStatus, to: toStatus };
    });
  }

  /** Escalation changes team AND status together, atomically, guarded by
   * the exact same CAS as changeStatus(). */
  async function escalateTicket({ ticketId, toTeam }, ctx = {}) {
    if (!TICKET_TEAMS.includes(toTeam)) return { ok: false, reason: TicketError.INVALID_TEAM };
    return db.transaction(async (tx) => {
      const current = await tx.query("SELECT status, team FROM support_ticket WHERE id = $1", [ticketId]);
      if (!current.rows.length) return { ok: false, reason: TicketError.NOT_FOUND };
      const fromStatus = current.rows[0].status;
      const fromTeam = current.rows[0].team;
      if (!canTransition(fromStatus, "ESCALATED")) return { ok: false, reason: TicketError.INVALID_TRANSITION, from: fromStatus };

      const t = new Date(now()).toISOString();
      const updated = await tx.query(
        `UPDATE support_ticket SET status = 'ESCALATED', team = $2, updated_at = $3 WHERE id = $1 AND status = $4 RETURNING id`,
        [ticketId, toTeam, t, fromStatus]
      );
      if (!updated.rows.length) return { ok: false, reason: TicketError.INVALID_TRANSITION, from: fromStatus };
      return { ok: true, fromTeam, toTeam };
    });
  }

  return {
    createTicket, getForCustomer, getForStaff, listForCustomer, listForStaff,
    listMessagesForCustomer, listMessagesForStaff, sendCustomerMessage, sendStaffMessage,
    assignTicket, changeStatus, escalateTicket,
  };
}
