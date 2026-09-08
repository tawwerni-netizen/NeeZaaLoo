import type { TicketStatus } from "@/lib/support-types";

const PILL_CLASS = {
  OPEN: "pillInfo",
  TRIAGED: "pillInfo",
  ASSIGNED: "pillInfo",
  IN_PROGRESS: "pillInfo",
  WAITING_FOR_USER: "pillWarn",
  ESCALATED: "pillWarn",
  RESOLVED: "pillWin",
  CLOSED: "pillNeutral",
} as const satisfies Record<TicketStatus, string>;

export function pillClassFor(status: TicketStatus): (typeof PILL_CLASS)[TicketStatus] {
  return PILL_CLASS[status];
}
