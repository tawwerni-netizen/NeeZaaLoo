/**
 * Reporting -- reuses the EXISTING content_report table (migration 0020,
 * extended by 0023) rather than a parallel chat_report table. This IS "the
 * existing moderation architecture" directive #17 asks for: same table,
 * same review-queue shape (status OPEN/REVIEWED/DISMISSED), same
 * reporter-cannot-report-self guarantee, now widened to cover a chat
 * message or a player generally, with a category alongside the existing
 * freeform reason.
 */
import { randomUUID } from "node:crypto";

export const ChatReportCategory = Object.freeze({
  ABUSE: "ABUSE", HARASSMENT: "HARASSMENT", SPAM: "SPAM", SCAM: "SCAM",
  THREATS: "THREATS", INAPPROPRIATE_CONTENT: "INAPPROPRIATE_CONTENT", OTHER: "OTHER",
});

export const ReportError = Object.freeze({
  CANNOT_REPORT_SELF: "CANNOT_REPORT_SELF",
  INVALID_CATEGORY: "INVALID_CATEGORY",
  NOT_FOUND: "NOT_FOUND",
});

export function createReportService(db, { now = () => Date.now() } = {}) {
  function validCategory(category) {
    return Object.values(ChatReportCategory).includes(category);
  }

  async function reportMessage({ reporterId, messageId, category, reason }) {
    if (!validCategory(category)) return { ok: false, reason: ReportError.INVALID_CATEGORY };
    const msg = await db.query("SELECT sender_id FROM chat_message WHERE id = $1", [messageId]);
    if (!msg.rows.length) return { ok: false, reason: ReportError.NOT_FOUND };
    const subjectPlayerId = msg.rows[0].sender_id;
    if (reporterId === subjectPlayerId) return { ok: false, reason: ReportError.CANNOT_REPORT_SELF };

    const id = `rpt_${randomUUID()}`;
    await db.query(
      `INSERT INTO content_report (id, reporter_id, subject_player_id, content_type, category, message_id, reason, created_at)
       VALUES ($1,$2,$3,'CHAT_MESSAGE',$4,$5,$6,$7)`,
      [id, reporterId, subjectPlayerId, category, messageId, reason ?? null, new Date(now()).toISOString()]
    );
    return { ok: true, reportId: id };
  }

  async function reportPlayer({ reporterId, subjectPlayerId, category, reason }) {
    if (!validCategory(category)) return { ok: false, reason: ReportError.INVALID_CATEGORY };
    if (reporterId === subjectPlayerId) return { ok: false, reason: ReportError.CANNOT_REPORT_SELF };

    const id = `rpt_${randomUUID()}`;
    await db.query(
      `INSERT INTO content_report (id, reporter_id, subject_player_id, content_type, category, reason, created_at)
       VALUES ($1,$2,$3,'PLAYER',$4,$5,$6)`,
      [id, reporterId, subjectPlayerId, category, reason ?? null, new Date(now()).toISOString()]
    );
    return { ok: true, reportId: id };
  }

  async function listQueue({ status = "OPEN", limit = 50, offset = 0 } = {}) {
    const r = await db.query(
      `SELECT cr.id, cr.reporter_id, cr.subject_player_id, cr.content_type, cr.category, cr.message_id, cr.reason,
              cr.status, cr.created_at, p.handle AS subject_nickname
         FROM content_report cr JOIN player p ON p.id = cr.subject_player_id
        WHERE cr.content_type IN ('CHAT_MESSAGE', 'PLAYER') AND cr.status = $1
        ORDER BY cr.created_at DESC LIMIT $2 OFFSET $3`,
      [status, Math.min(limit, 200), offset]
    );
    return r.rows;
  }

  async function reviewReport({ reportId, status }) {
    const r = await db.query(
      `UPDATE content_report SET status = $2 WHERE id = $1 AND content_type IN ('CHAT_MESSAGE','PLAYER') RETURNING id`,
      [reportId, status]
    );
    return r.rows.length ? { ok: true } : { ok: false, reason: ReportError.NOT_FOUND };
  }

  return { reportMessage, reportPlayer, listQueue, reviewReport };
}
