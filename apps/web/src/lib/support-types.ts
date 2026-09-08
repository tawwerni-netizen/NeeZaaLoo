/**
 * The exact response shapes the Slice 8 customer routes return
 * (packages/api/src/server.mjs's /v1/me/tickets* handlers, backed by
 * packages/support/src/ticket.mjs). Customer-visible shape only -- no
 * assignee, no team, no internal notes; see getForCustomer's own comment.
 */
export type TicketCategory =
  | "ACCOUNT" | "LOGIN" | "PASSWORD" | "DEPOSIT_PENDING" | "WITHDRAWAL_PENDING" | "WITHDRAWAL_FAILED"
  | "MISSING_FUNDS" | "MATCH_PROBLEM" | "TOURNAMENT_PROBLEM" | "ANTI_CHEAT" | "TECHNICAL" | "ABUSE_REPORT" | "OTHER";

export type TicketStatus =
  | "OPEN" | "TRIAGED" | "ASSIGNED" | "IN_PROGRESS" | "WAITING_FOR_USER" | "ESCALATED" | "RESOLVED" | "CLOSED";

export type TicketPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

export type TicketSummary = {
  id: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
  subject: string;
  created_at: string;
  updated_at: string;
};

export type TicketDetail = TicketSummary & {
  reference_type: string | null;
  reference_id: string | null;
  context: Record<string, unknown>;
  resolved_at: string | null;
  closed_at: string | null;
};

export type TicketMessage = {
  id: string;
  author_type: "CUSTOMER" | "STAFF" | "SYSTEM";
  content: string;
  created_at: string;
};

export type TicketListResponse = { tickets: TicketSummary[] };
export type TicketDetailResponse = { ticket: TicketDetail; messages: TicketMessage[] };
export type CreateTicketResponse = { ticketId: string; priority: TicketPriority };
export type SendMessageResponse = { messageId: string; reopened: boolean };
